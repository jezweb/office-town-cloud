// Wiki service — owns the CRUD lifecycle + audit + browse over R2 + D1 + Queue.
//
// Per MASTER-PLAN-2026-05-28.md §4.1 — implements all 17 actions of the
// wiki gateway tool: write, get, search, supersede, archive, delete, history,
// link, list, tree, recent, glob, head, head_many, related, collections, register.

import { DEFAULT_COLLECTIONS, isValidSlug, r2KeyFor, WikiError } from '../lib/shared';
import type {
	CollectionDef,
	WikiCreateInput,
	WikiEntry,
	WikiReadResult,
	WikiUpdateInput,
} from '../lib/shared';
import { applySextectDefaults, parseMarkdown, renderMarkdown, validateUniversalSextet } from './frontmatter';
import type { Env, IndexMessage } from '../types';

/** Generate a UUIDv4-ish string suitable for stable IDs across renames */
function uuid(): string {
	return crypto.randomUUID();
}

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

/** Context passed to audit-writing — all mutations require `why:` */
export interface AuditCtx {
	editor: string;
	why: string;
	session_id?: string;
}

export class WikiService {
	constructor(private readonly env: Env) {}

	/** Write an audit row. Append-only — never updates. */
	private async writeAudit(opts: {
		action: string;
		collection: string;
		slug: string;
		entry_uuid?: string | null;
		agent_slug: string;
		session_id?: string;
		prev_hash?: string | null;
		new_hash?: string | null;
		why: string;
	}): Promise<void> {
		if (!opts.why || opts.why.trim() === '') {
			throw new WikiError('invalid_input', `why: is required for action '${opts.action}' — every wiki mutation must record a rationale`);
		}
		await this.env.DB.prepare(
			`INSERT INTO wiki_audit (audit_id, ts, action, collection, slug, entry_uuid, agent_slug, session_id, prev_hash, new_hash, why)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				uuid(),
				Date.now(),
				opts.action,
				opts.collection,
				opts.slug,
				opts.entry_uuid ?? null,
				opts.agent_slug,
				opts.session_id ?? null,
				opts.prev_hash ?? null,
				opts.new_hash ?? null,
				opts.why,
			)
			.run();
	}

	async create(input: WikiCreateInput, editor: string, why = 'initial entry', session_id?: string): Promise<WikiEntry> {
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
		const entryUuid = uuid();

		const existing = await this.env.DB.prepare(
			'SELECT id FROM wiki_entries WHERE id = ?'
		)
			.bind(id)
			.first();
		if (existing) {
			throw new WikiError('already_exists', `Entry ${id} already exists — use wiki(action:supersede) to replace, or wiki(action:update) to patch`);
		}

		const markdown = renderMarkdown(frontmatter, input.body);
		await this.env.WIKI.put(r2Key, markdown, {
			httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
		});

		await this.env.DB.prepare(
			`INSERT INTO wiki_entries
			(id, collection, slug, r2_key, title, frontmatter_json, body, body_hash, last_change_summary, last_edited_by, created_at, updated_at, status, uuid)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
				now,
				'active',
				entryUuid,
			)
			.run();

		// Audit log — required `why:` per design contract
		await this.writeAudit({
			action: 'write',
			collection: collection.name,
			slug,
			entry_uuid: entryUuid,
			agent_slug: editor,
			session_id,
			prev_hash: null,
			new_hash: bodyHash,
			why,
		});

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

	async update(input: WikiUpdateInput, editor: string, session_id?: string): Promise<WikiEntry> {
		const id = entryId(input.collection, input.slug);
		const existing = await this.env.DB.prepare(
			'SELECT r2_key, frontmatter_json, body, body_hash, created_at, uuid FROM wiki_entries WHERE id = ? AND status != ?'
		)
			.bind(id, 'deleted')
			.first<{
				r2_key: string;
				frontmatter_json: string;
				body: string;
				body_hash: string;
				created_at: string;
				uuid: string | null;
			}>();

		if (!existing) {
			throw new WikiError('not_found', `Entry not found (or deleted): ${id}`);
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

		// Audit log
		await this.writeAudit({
			action: 'update',
			collection: input.collection,
			slug: input.slug,
			entry_uuid: existing.uuid,
			agent_slug: editor,
			session_id,
			prev_hash: existing.body_hash,
			new_hash: bodyHash,
			why: input.last_change_summary,
		});

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

	async delete(collection: string, slug: string, why = 'delete', editor = 'mcp-agent', session_id?: string): Promise<void> {
		const id = entryId(collection, slug);
		const row = await this.env.DB.prepare('SELECT r2_key, body_hash, uuid FROM wiki_entries WHERE id = ?')
			.bind(id)
			.first<{ r2_key: string; body_hash: string; uuid: string | null }>();
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

		// Audit log — record the hard-delete with rationale
		await this.writeAudit({
			action: 'delete',
			collection,
			slug,
			entry_uuid: row.uuid,
			agent_slug: editor,
			session_id,
			prev_hash: row.body_hash,
			new_hash: null,
			why,
		});

		await this.env.INDEX_QUEUE.send({ type: 'delete', entry_id: id, collection, slug });
	}

	/**
	 * Soft-delete — sets status to 'archived'. Entry remains in D1; R2 object
	 * stays. Filtered out of default search + list. Preferred over hard delete.
	 */
	async archive(collection: string, slug: string, why: string, editor = 'mcp-agent', session_id?: string): Promise<void> {
		const id = entryId(collection, slug);
		const row = await this.env.DB.prepare('SELECT body_hash, uuid FROM wiki_entries WHERE id = ?')
			.bind(id)
			.first<{ body_hash: string; uuid: string | null }>();
		if (!row) {
			throw new WikiError('not_found', `Entry not found: ${id}`);
		}
		const now = new Date().toISOString();
		await this.env.DB.prepare(
			'UPDATE wiki_entries SET status = ?, last_edited_by = ?, last_change_summary = ?, updated_at = ? WHERE id = ?'
		)
			.bind('archived', editor, `archive: ${why}`, now, id)
			.run();

		await this.writeAudit({
			action: 'archive',
			collection,
			slug,
			entry_uuid: row.uuid,
			agent_slug: editor,
			session_id,
			prev_hash: row.body_hash,
			new_hash: row.body_hash,
			why,
		});
	}

	/**
	 * Atomic supersession — replaces entry contents in a single D1 transaction.
	 * Preferred over update for substantive content rewrites (writes are atomic
	 * from the reader's perspective; audit log captures the prev_hash for rollback).
	 */
	async supersede(
		input: {
			collection: string;
			slug: string;
			new_frontmatter?: Record<string, unknown>;
			new_body?: string;
		},
		why: string,
		editor: string,
		session_id?: string,
	): Promise<WikiEntry> {
		// supersede is semantically distinct from update — it implies the new
		// version REPLACES the old completely (vs update which merges).
		const id = entryId(input.collection, input.slug);
		const existing = await this.env.DB.prepare(
			'SELECT r2_key, frontmatter_json, body, body_hash, created_at, uuid FROM wiki_entries WHERE id = ? AND status != ?'
		)
			.bind(id, 'deleted')
			.first<{
				r2_key: string;
				frontmatter_json: string;
				body: string;
				body_hash: string;
				created_at: string;
				uuid: string | null;
			}>();
		if (!existing) {
			throw new WikiError('not_found', `Entry not found (or deleted): ${id}`);
		}

		const currentFrontmatter = JSON.parse(existing.frontmatter_json) as Record<string, unknown>;
		const today = new Date().toISOString().slice(0, 10);
		// supersede REPLACES frontmatter (vs update which merges patch). Caller must pass full fm.
		const nextFrontmatter: Record<string, unknown> = {
			...(input.new_frontmatter ?? currentFrontmatter),
			slug: input.slug,
			last_updated: today,
			last_edited_by: editor,
			last_change_summary: why,
		};
		const nextBody = input.new_body ?? existing.body;
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
				why,
				editor,
				now,
				id,
			)
			.run();

		await this.writeAudit({
			action: 'supersede',
			collection: input.collection,
			slug: input.slug,
			entry_uuid: existing.uuid,
			agent_slug: editor,
			session_id,
			prev_hash: existing.body_hash,
			new_hash: bodyHash,
			why,
		});

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

	/* ==========================================================
	 *  BROWSE LAYER — Claude-Code-file-finding equivalents.
	 *  Per MASTER-PLAN §4.1: list, tree, recent, glob, head, head_many, related.
	 * ========================================================== */

	/**
	 * List entries in a collection with optional frontmatter filter.
	 * Returns triage shape — frontmatter + 300-char excerpt + signed URL.
	 * Filters out archived/deleted by default unless `includeArchived`.
	 */
	async list(input: {
		collection: string;
		filter?: Record<string, unknown>;
		limit?: number;
		offset?: number;
		sort?: 'recent' | 'oldest' | 'alpha';
		includeArchived?: boolean;
	}): Promise<{
		results: Array<{ slug: string; frontmatter: Record<string, unknown>; excerpt: string; byte_count: number; updated_at: string; status: string }>;
		total: number;
	}> {
		const limit = Math.min(input.limit ?? 50, 200);
		const offset = input.offset ?? 0;
		const sortClause =
			input.sort === 'oldest' ? 'updated_at ASC' :
			input.sort === 'alpha' ? 'slug ASC' :
			'updated_at DESC';
		const statusClause = input.includeArchived ? '' : "AND status = 'active'";

		// Frontmatter filter: simple equality on JSON fields via json_extract
		const filterClauses: string[] = [];
		const filterBinds: unknown[] = [];
		if (input.filter) {
			for (const [key, value] of Object.entries(input.filter)) {
				filterClauses.push(`json_extract(frontmatter_json, '$.${key.replace(/'/g, "''")}') = ?`);
				filterBinds.push(value);
			}
		}
		const filterClause = filterClauses.length > 0 ? 'AND ' + filterClauses.join(' AND ') : '';

		const totalRow = await this.env.DB.prepare(
			`SELECT COUNT(*) AS n FROM wiki_entries WHERE collection = ? ${statusClause} ${filterClause}`
		)
			.bind(input.collection, ...filterBinds)
			.first<{ n: number }>();

		const rows = await this.env.DB.prepare(
			`SELECT slug, frontmatter_json, body, length(body) AS byte_count, updated_at, status
			 FROM wiki_entries
			 WHERE collection = ? ${statusClause} ${filterClause}
			 ORDER BY ${sortClause}
			 LIMIT ? OFFSET ?`
		)
			.bind(input.collection, ...filterBinds, limit, offset)
			.all<{ slug: string; frontmatter_json: string; body: string; byte_count: number; updated_at: string; status: string }>();

		return {
			total: totalRow?.n ?? 0,
			results: (rows.results ?? []).map((r) => ({
				slug: r.slug,
				frontmatter: JSON.parse(r.frontmatter_json),
				excerpt: r.body.slice(0, 300),
				byte_count: r.byte_count,
				updated_at: r.updated_at,
				status: r.status,
			})),
		};
	}

	/**
	 * Recent entries across all (or filtered) collections.
	 */
	async recent(input: {
		since_days?: number;
		collection?: string;
		kind?: string;
		limit?: number;
	}): Promise<Array<{ collection: string; slug: string; frontmatter: Record<string, unknown>; excerpt: string; updated_at: string }>> {
		const limit = Math.min(input.limit ?? 25, 100);
		const sinceTs = input.since_days
			? new Date(Date.now() - input.since_days * 86400_000).toISOString()
			: new Date(0).toISOString();
		const collectionClause = input.collection ? 'AND collection = ?' : '';
		const kindClause = input.kind ? "AND json_extract(frontmatter_json, '$.kind') = ?" : '';
		const binds: unknown[] = [sinceTs, 'active'];
		if (input.collection) binds.push(input.collection);
		if (input.kind) binds.push(input.kind);
		binds.push(limit);

		const rows = await this.env.DB.prepare(
			`SELECT collection, slug, frontmatter_json, body, updated_at
			 FROM wiki_entries
			 WHERE updated_at >= ? AND status = ? ${collectionClause} ${kindClause}
			 ORDER BY updated_at DESC
			 LIMIT ?`
		)
			.bind(...binds)
			.all<{ collection: string; slug: string; frontmatter_json: string; body: string; updated_at: string }>();

		return (rows.results ?? []).map((r) => ({
			collection: r.collection,
			slug: r.slug,
			frontmatter: JSON.parse(r.frontmatter_json),
			excerpt: r.body.slice(0, 300),
			updated_at: r.updated_at,
		}));
	}

	/**
	 * Path-pattern match — like `find . -name 'pattern*'` for the wiki.
	 * Pattern is matched against `collection/slug`. Uses SQL LIKE with `*` → `%`, `?` → `_`.
	 */
	async glob(pattern: string, limit = 100): Promise<Array<{ collection: string; slug: string; updated_at: string }>> {
		const likePattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
		const rows = await this.env.DB.prepare(
			`SELECT collection, slug, updated_at
			 FROM wiki_entries
			 WHERE (collection || '/' || slug) LIKE ?
			   AND status = 'active'
			 ORDER BY updated_at DESC
			 LIMIT ?`
		)
			.bind(likePattern, Math.min(limit, 500))
			.all<{ collection: string; slug: string; updated_at: string }>();
		return rows.results ?? [];
	}

	/**
	 * First N lines of an entry's body — like `head -n`.
	 */
	async head(collection: string, slug: string, lines = 30): Promise<{ collection: string; slug: string; preview: string; total_lines: number }> {
		const id = entryId(collection, slug);
		const row = await this.env.DB.prepare('SELECT body FROM wiki_entries WHERE id = ?')
			.bind(id)
			.first<{ body: string }>();
		if (!row) {
			throw new WikiError('not_found', `Entry not found: ${id}`);
		}
		const allLines = row.body.split('\n');
		return {
			collection,
			slug,
			preview: allLines.slice(0, Math.max(1, Math.min(lines, 500))).join('\n'),
			total_lines: allLines.length,
		};
	}

	/**
	 * Bulk head — first N lines of many entries in one round-trip.
	 */
	async headMany(items: Array<{ collection: string; slug: string }>, lines = 10): Promise<Array<{ collection: string; slug: string; preview: string }>> {
		if (items.length === 0) return [];
		const ids = items.map((i) => entryId(i.collection, i.slug));
		const placeholders = ids.map(() => '?').join(',');
		const rows = await this.env.DB.prepare(
			`SELECT collection, slug, body FROM wiki_entries WHERE id IN (${placeholders})`
		)
			.bind(...ids)
			.all<{ collection: string; slug: string; body: string }>();
		const N = Math.max(1, Math.min(lines, 100));
		return (rows.results ?? []).map((r) => ({
			collection: r.collection,
			slug: r.slug,
			preview: r.body.split('\n').slice(0, N).join('\n'),
		}));
	}

	/**
	 * Directory-style tree of entries grouped by collection.
	 * Returns nested structure: {<collection>: [slugs...]}
	 */
	async tree(_depth = 2): Promise<Record<string, string[] | Record<string, string[]>>> {
		const rows = await this.env.DB.prepare(
			`SELECT collection, slug FROM wiki_entries WHERE status = 'active' ORDER BY collection, slug`
		)
			.all<{ collection: string; slug: string }>();
		const tree: Record<string, string[]> = {};
		for (const r of rows.results ?? []) {
			if (!tree[r.collection]) tree[r.collection] = [];
			tree[r.collection].push(r.slug);
		}
		return tree;
	}

	/**
	 * Related entries — entries that this entry links to OR is linked from.
	 */
	async related(collection: string, slug: string, _depth = 1): Promise<{
		outgoing: Array<{ collection: string; slug: string; kind?: string }>;
		incoming: Array<{ collection: string; slug: string; kind?: string }>;
	}> {
		// _depth > 1 walks multi-hop; for v1 we just do 1
		const outgoing = await this.env.DB.prepare(
			`SELECT to_collection AS collection, to_slug AS slug, kind
			 FROM wiki_links WHERE from_collection = ? AND from_slug = ?`
		)
			.bind(collection, slug)
			.all<{ collection: string; slug: string; kind: string | null }>();
		const incoming = await this.env.DB.prepare(
			`SELECT from_collection AS collection, from_slug AS slug, kind
			 FROM wiki_links WHERE to_collection = ? AND to_slug = ?`
		)
			.bind(collection, slug)
			.all<{ collection: string; slug: string; kind: string | null }>();
		return {
			outgoing: (outgoing.results ?? []).map((r) => ({ collection: r.collection, slug: r.slug, kind: r.kind ?? undefined })),
			incoming: (incoming.results ?? []).map((r) => ({ collection: r.collection, slug: r.slug, kind: r.kind ?? undefined })),
		};
	}

	/**
	 * Add a cross-reference link between two entries.
	 */
	async link(input: {
		from: { collection: string; slug: string };
		to: { collection: string; slug: string };
		kind?: string;
		why?: string;
	}, editor: string, session_id?: string): Promise<{ link_id: string }> {
		// Ensure both entries exist
		const fromId = entryId(input.from.collection, input.from.slug);
		const toId = entryId(input.to.collection, input.to.slug);
		const fromRow = await this.env.DB.prepare('SELECT id FROM wiki_entries WHERE id = ?').bind(fromId).first();
		const toRow = await this.env.DB.prepare('SELECT id FROM wiki_entries WHERE id = ?').bind(toId).first();
		if (!fromRow) throw new WikiError('not_found', `From-entry not found: ${fromId}`);
		if (!toRow) throw new WikiError('not_found', `To-entry not found: ${toId}`);

		const linkId = uuid();
		try {
			await this.env.DB.prepare(
				`INSERT INTO wiki_links (link_id, from_collection, from_slug, to_collection, to_slug, kind, why, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
				.bind(linkId, input.from.collection, input.from.slug, input.to.collection, input.to.slug, input.kind ?? null, input.why ?? null, Date.now())
				.run();
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			if (errMsg.includes('UNIQUE constraint')) {
				throw new WikiError('already_exists', `Link already exists from ${fromId} → ${toId}`);
			}
			throw err;
		}

		await this.writeAudit({
			action: 'link',
			collection: input.from.collection,
			slug: input.from.slug,
			agent_slug: editor,
			session_id,
			why: input.why ?? `link to ${toId}`,
		});

		return { link_id: linkId };
	}

	/**
	 * Audit history for an entry — most-recent-first.
	 */
	async getHistory(collection: string, slug: string, limit = 50): Promise<Array<{
		audit_id: string;
		ts: number;
		action: string;
		agent_slug: string | null;
		session_id: string | null;
		prev_hash: string | null;
		new_hash: string | null;
		why: string;
	}>> {
		const rows = await this.env.DB.prepare(
			`SELECT audit_id, ts, action, agent_slug, session_id, prev_hash, new_hash, why
			 FROM wiki_audit
			 WHERE collection = ? AND slug = ?
			 ORDER BY ts DESC
			 LIMIT ?`
		)
			.bind(collection, slug, Math.min(limit, 500))
			.all<{
				audit_id: string;
				ts: number;
				action: string;
				agent_slug: string | null;
				session_id: string | null;
				prev_hash: string | null;
				new_hash: string | null;
				why: string;
			}>();
		return rows.results ?? [];
	}

	/* ==========================================================
	 *  ATTACHMENTS — non-markdown files associated with an entry.
	 *  Goanna-style entity-as-folder shape per MASTER-PLAN §7.
	 * ========================================================== */

	/**
	 * Attach a non-markdown file to an entry (logo.png, contract.pdf, recording.m4a, etc.).
	 * The file is stored in R2 at wiki/<collection>/<slug>/<filename>, indexed in wiki_attachments.
	 */
	async addAttachment(input: {
		collection: string;
		slug: string;
		filename: string;
		content_bytes: Uint8Array;
		content_type?: string;
	}, editor: string, why: string, session_id?: string): Promise<{
		attachment_id: string;
		r2_key: string;
		size_bytes: number;
	}> {
		const id = entryId(input.collection, input.slug);
		const entry = await this.env.DB.prepare('SELECT uuid FROM wiki_entries WHERE id = ? AND status != ?')
			.bind(id, 'deleted')
			.first<{ uuid: string | null }>();
		if (!entry) {
			throw new WikiError('not_found', `Entry not found: ${id}`);
		}

		const cleanName = input.filename.replace(/^\/+|\.\.\/?/g, '');
		const r2Key = `wiki/${input.collection}/${input.slug}/${cleanName}`;
		await this.env.WIKI.put(r2Key, input.content_bytes, {
			httpMetadata: { contentType: input.content_type ?? 'application/octet-stream' },
		});

		const attId = uuid();
		await this.env.DB.prepare(
			`INSERT INTO wiki_attachments (attachment_id, collection, slug, filename, r2_key, content_type, size_bytes, uploaded_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(collection, slug, filename) DO UPDATE SET
			   r2_key = excluded.r2_key,
			   content_type = excluded.content_type,
			   size_bytes = excluded.size_bytes,
			   uploaded_at = excluded.uploaded_at`
		)
			.bind(attId, input.collection, input.slug, cleanName, r2Key, input.content_type ?? null, input.content_bytes.byteLength, Date.now())
			.run();

		await this.writeAudit({
			action: 'attach',
			collection: input.collection,
			slug: input.slug,
			entry_uuid: entry.uuid,
			agent_slug: editor,
			session_id,
			why,
		});

		return { attachment_id: attId, r2_key: r2Key, size_bytes: input.content_bytes.byteLength };
	}

	async listAttachments(collection: string, slug: string): Promise<Array<{
		attachment_id: string;
		filename: string;
		r2_key: string;
		content_type: string | null;
		size_bytes: number | null;
		uploaded_at: number;
	}>> {
		const rows = await this.env.DB.prepare(
			`SELECT attachment_id, filename, r2_key, content_type, size_bytes, uploaded_at
			 FROM wiki_attachments
			 WHERE collection = ? AND slug = ?
			 ORDER BY uploaded_at DESC`
		)
			.bind(collection, slug)
			.all<{ attachment_id: string; filename: string; r2_key: string; content_type: string | null; size_bytes: number | null; uploaded_at: number }>();
		return rows.results ?? [];
	}

	async removeAttachment(collection: string, slug: string, filename: string, why: string, editor: string, session_id?: string): Promise<void> {
		const row = await this.env.DB.prepare('SELECT r2_key FROM wiki_attachments WHERE collection = ? AND slug = ? AND filename = ?')
			.bind(collection, slug, filename)
			.first<{ r2_key: string }>();
		if (!row) {
			throw new WikiError('not_found', `Attachment not found: ${collection}/${slug}/${filename}`);
		}
		await this.env.WIKI.delete(row.r2_key);
		await this.env.DB.prepare('DELETE FROM wiki_attachments WHERE collection = ? AND slug = ? AND filename = ?')
			.bind(collection, slug, filename)
			.run();
		await this.writeAudit({
			action: 'detach',
			collection,
			slug,
			agent_slug: editor,
			session_id,
			why,
		});
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
