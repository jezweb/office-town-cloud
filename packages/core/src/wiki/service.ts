// Wiki service — owns the CRUD lifecycle over R2 + D1 + Queue.

import { DEFAULT_COLLECTIONS, isValidSlug, r2KeyFor, WikiError } from '@office-town/shared';
import type {
	CollectionDef,
	WikiCreateInput,
	WikiEntry,
	WikiReadResult,
	WikiUpdateInput,
} from '@office-town/shared';
import { applySextectDefaults, parseMarkdown, renderMarkdown, validateUniversalSextet } from './frontmatter';
import type { Env, IndexMessage } from '../types';

const FRONTMATTER_TITLE_FIELDS = ['title', 'name', 'subject'];

async function sha256(input: string): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function entryId(collection: string, slug: string): string {
	return `${collection}:${slug}`;
}

function deriveTitle(frontmatter: Record<string, unknown>): string | null {
	for (const field of FRONTMATTER_TITLE_FIELDS) {
		const v = frontmatter[field];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	const slug = frontmatter.slug;
	return typeof slug === 'string' ? slug : null;
}

async function loadCollection(env: Env, name: string): Promise<CollectionDef | null> {
	const row = await env.DB.prepare(
		'SELECT name, shape, canonical_filename, required_fields_json, description FROM wiki_collections WHERE name = ?'
	)
		.bind(name)
		.first<{
			name: string;
			shape: string;
			canonical_filename: string;
			required_fields_json: string;
			description: string;
		}>();
	if (!row) {
		const def = DEFAULT_COLLECTIONS.find((c) => c.name === name);
		return def ?? null;
	}
	return {
		name: row.name,
		shape: row.shape as CollectionDef['shape'],
		canonical_filename: row.canonical_filename,
		required_fields: JSON.parse(row.required_fields_json) as string[],
		description: row.description,
	};
}

export class WikiService {
	constructor(private readonly env: Env) {}

	async create(input: WikiCreateInput, editor: string): Promise<WikiEntry> {
		const collectionName = input.collection ?? 'knowledge';
		const collection = await loadCollection(this.env, collectionName);
		if (!collection) {
			throw new WikiError('invalid_collection', `Unknown collection: ${collectionName}`);
		}

		const slug =
			input.slug ?? (typeof input.frontmatter.slug === 'string' ? input.frontmatter.slug : null);
		if (!slug || !isValidSlug(slug)) {
			throw new WikiError(
				'invalid_slug',
				`Slug must be lowercase alphanumeric with hyphens (got: ${slug ?? '<none>'})`
			);
		}

		const frontmatter = applySextectDefaults(input.frontmatter, {
			slug,
			kind: (input.frontmatter.kind as string) ?? collection.name.replace(/s$/, ''),
			editor,
			summary: (input.frontmatter.last_change_summary as string) ?? 'initial entry',
		});

		const missing = collection.required_fields.filter(
			(f) => !frontmatter[f] || (typeof frontmatter[f] === 'string' && !(frontmatter[f] as string).trim())
		);
		if (missing.length > 0) {
			throw new WikiError(
				'invalid_frontmatter',
				`Missing required fields for ${collection.name}: ${missing.join(', ')}`
			);
		}

		const sextectMissing = validateUniversalSextet(frontmatter);
		if (sextectMissing.length > 0) {
			throw new WikiError(
				'invalid_frontmatter',
				`Missing universal sextet fields: ${sextectMissing.join(', ')}`
			);
		}

		const r2Key = r2KeyFor(collection, slug);
		const now = new Date().toISOString();
		const id = entryId(collection.name, slug);
		const bodyHash = await sha256(input.body);

		const existing = await this.env.DB.prepare(
			'SELECT id FROM wiki_entries WHERE id = ?'
		)
			.bind(id)
			.first();
		if (existing) {
			throw new WikiError('already_exists', `Entry ${id} already exists — use wiki.update instead`);
		}

		const markdown = renderMarkdown(frontmatter, input.body);
		await this.env.WIKI.put(r2Key, markdown, {
			httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
		});

		await this.env.DB.prepare(
			`INSERT INTO wiki_entries
			(id, collection, slug, r2_key, title, frontmatter_json, body, body_hash, last_change_summary, last_edited_by, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				id,
				collection.name,
				slug,
				r2Key,
				deriveTitle(frontmatter),
				JSON.stringify(frontmatter),
				input.body,
				bodyHash,
				frontmatter.last_change_summary as string,
				editor,
				now,
				now
			)
			.run();

		await this.env.INDEX_QUEUE.send({
			type: 'index',
			entry_id: id,
			collection: collection.name,
			slug,
			r2_key: r2Key,
		} satisfies IndexMessage);

		return {
			collection: collection.name,
			slug,
			body: input.body,
			frontmatter: frontmatter as WikiEntry['frontmatter'],
			r2_key: r2Key,
			created_at: now,
			updated_at: now,
		};
	}

	async read(collection: string, slug: string): Promise<WikiReadResult> {
		const id = entryId(collection, slug);
		const row = await this.env.DB.prepare(
			'SELECT collection, slug, r2_key, frontmatter_json, body, updated_at FROM wiki_entries WHERE id = ?'
		)
			.bind(id)
			.first<{
				collection: string;
				slug: string;
				r2_key: string;
				frontmatter_json: string;
				body: string;
				updated_at: string;
			}>();
		if (!row) {
			throw new WikiError('not_found', `Entry not found: ${id}`);
		}
		return {
			collection: row.collection,
			slug: row.slug,
			frontmatter: JSON.parse(row.frontmatter_json),
			body: row.body,
			r2_key: row.r2_key,
			updated_at: row.updated_at,
		};
	}

	async update(input: WikiUpdateInput, editor: string): Promise<WikiEntry> {
		const id = entryId(input.collection, input.slug);
		const existing = await this.env.DB.prepare(
			'SELECT r2_key, frontmatter_json, body, created_at FROM wiki_entries WHERE id = ?'
		)
			.bind(id)
			.first<{
				r2_key: string;
				frontmatter_json: string;
				body: string;
				created_at: string;
			}>();

		if (!existing) {
			throw new WikiError('not_found', `Entry not found: ${id}`);
		}

		const currentFrontmatter = JSON.parse(existing.frontmatter_json) as Record<string, unknown>;
		const today = new Date().toISOString().slice(0, 10);

		const nextFrontmatter: Record<string, unknown> = {
			...currentFrontmatter,
			...(input.frontmatter_patch ?? {}),
			last_updated: today,
			last_edited_by: editor,
			last_change_summary: input.last_change_summary,
		};

		const nextBody = input.body ?? existing.body;
		const bodyHash = await sha256(nextBody);
		const now = new Date().toISOString();

		const markdown = renderMarkdown(nextFrontmatter, nextBody);
		await this.env.WIKI.put(existing.r2_key, markdown, {
			httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
		});

		await this.env.DB.prepare(
			`UPDATE wiki_entries
			SET title = ?, frontmatter_json = ?, body = ?, body_hash = ?, last_change_summary = ?, last_edited_by = ?, updated_at = ?
			WHERE id = ?`
		)
			.bind(
				deriveTitle(nextFrontmatter),
				JSON.stringify(nextFrontmatter),
				nextBody,
				bodyHash,
				input.last_change_summary,
				editor,
				now,
				id
			)
			.run();

		await this.env.INDEX_QUEUE.send({
			type: 'index',
			entry_id: id,
			collection: input.collection,
			slug: input.slug,
			r2_key: existing.r2_key,
		});

		return {
			collection: input.collection,
			slug: input.slug,
			body: nextBody,
			frontmatter: nextFrontmatter as WikiEntry['frontmatter'],
			r2_key: existing.r2_key,
			created_at: existing.created_at,
			updated_at: now,
		};
	}

	async delete(collection: string, slug: string): Promise<void> {
		const id = entryId(collection, slug);
		const row = await this.env.DB.prepare('SELECT r2_key FROM wiki_entries WHERE id = ?')
			.bind(id)
			.first<{ r2_key: string }>();
		if (!row) {
			throw new WikiError('not_found', `Entry not found: ${id}`);
		}

		const archiveKey = `archive/${row.r2_key}.deleted-${Date.now()}`;
		const existingObject = await this.env.WIKI.get(row.r2_key);
		if (existingObject) {
			await this.env.WIKI.put(archiveKey, existingObject.body, {
				httpMetadata: existingObject.httpMetadata,
			});
		}
		await this.env.WIKI.delete(row.r2_key);

		await this.env.DB.prepare('DELETE FROM wiki_entries WHERE id = ?').bind(id).run();
		await this.env.INDEX_QUEUE.send({ type: 'delete', entry_id: id, collection, slug });
	}

	async listCollections(): Promise<CollectionDef[]> {
		const rows = await this.env.DB.prepare(
			'SELECT name, shape, canonical_filename, required_fields_json, description FROM wiki_collections ORDER BY name'
		).all<{
			name: string;
			shape: string;
			canonical_filename: string;
			required_fields_json: string;
			description: string;
		}>();
		if (!rows.results || rows.results.length === 0) {
			return DEFAULT_COLLECTIONS;
		}
		return rows.results.map((r) => ({
			name: r.name,
			shape: r.shape as CollectionDef['shape'],
			canonical_filename: r.canonical_filename,
			required_fields: JSON.parse(r.required_fields_json) as string[],
			description: r.description,
		}));
	}

	async registerCollection(def: CollectionDef): Promise<void> {
		if (DEFAULT_COLLECTIONS.some((c) => c.name === def.name)) {
			throw new WikiError(
				'already_exists',
				`Collection ${def.name} is a default collection — it's already registered`
			);
		}
		const existing = await this.env.DB.prepare('SELECT name FROM wiki_collections WHERE name = ?')
			.bind(def.name)
			.first();
		if (existing) {
			throw new WikiError('already_exists', `Collection already registered: ${def.name}`);
		}
		const now = new Date().toISOString();
		await this.env.DB.prepare(
			`INSERT INTO wiki_collections (name, shape, canonical_filename, required_fields_json, description, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`
		)
			.bind(def.name, def.shape, def.canonical_filename, JSON.stringify(def.required_fields), def.description, now)
			.run();
	}

	async indexFromR2(r2Key: string): Promise<void> {
		const obj = await this.env.WIKI.get(r2Key);
		if (!obj) return;
		const content = await obj.text();
		const { frontmatter, body } = parseMarkdown(content);

		const match = /^wiki\/([^/]+)\/(.+?)(?:\/[^/]+)?\.md$/.exec(r2Key);
		if (!match) return;
		const collection = match[1];
		const slug = (frontmatter.slug as string) ?? match[2];
		const id = entryId(collection, slug);
		const bodyHash = await sha256(body);
		const now = new Date().toISOString();

		const created = await this.env.DB.prepare(
			'SELECT created_at FROM wiki_entries WHERE id = ?'
		)
			.bind(id)
			.first<{ created_at: string }>();
		const createdAt = created?.created_at ?? now;

		await this.env.DB.prepare(
			`INSERT INTO wiki_entries
			(id, collection, slug, r2_key, title, frontmatter_json, body, body_hash, last_change_summary, last_edited_by, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				r2_key = excluded.r2_key,
				title = excluded.title,
				frontmatter_json = excluded.frontmatter_json,
				body = excluded.body,
				body_hash = excluded.body_hash,
				last_change_summary = excluded.last_change_summary,
				last_edited_by = excluded.last_edited_by,
				updated_at = excluded.updated_at`
		)
			.bind(
				id,
				collection,
				slug,
				r2Key,
				deriveTitle(frontmatter),
				JSON.stringify(frontmatter),
				body,
				bodyHash,
				(frontmatter.last_change_summary as string) ?? 'indexed from R2',
				(frontmatter.last_edited_by as string) ?? 'r2-indexer',
				createdAt,
				now
			)
			.run();
	}
}
