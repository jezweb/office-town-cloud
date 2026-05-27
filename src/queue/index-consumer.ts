// Queue consumer — handles vector indexing and deletion side-effects.
//
// FTS is maintained via SQL triggers (drizzle/0001_fts5.sql); this consumer
// is only responsible for keeping the Vectorize index aligned with R2.

import type { Env, IndexMessage } from '../types';

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

async function sha256(input: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function handleIndexMessage(env: Env, msg: IndexMessage): Promise<void> {
	if (msg.type === 'delete') {
		await deleteVector(env, msg.entry_id);
		return;
	}
	await reindexEntry(env, msg);
}

async function deleteVector(env: Env, entryId: string): Promise<void> {
	const sidecar = await env.DB.prepare('SELECT vector_id FROM wiki_vector_index WHERE entry_id = ?')
		.bind(entryId)
		.first<{ vector_id: string }>();
	if (sidecar?.vector_id) {
		try {
			await env.VECTOR_INDEX.deleteByIds([sidecar.vector_id]);
		} catch (err) {
			console.error(JSON.stringify({ event: 'vector_delete_failed', entryId, error: String(err) }));
		}
	}
	await env.DB.prepare('DELETE FROM wiki_vector_index WHERE entry_id = ?').bind(entryId).run();
}

async function reindexEntry(env: Env, msg: IndexMessage): Promise<void> {
	const row = await env.DB.prepare(
		'SELECT collection, slug, body, body_hash, frontmatter_json FROM wiki_entries WHERE id = ?'
	)
		.bind(msg.entry_id)
		.first<{
			collection: string;
			slug: string;
			body: string;
			body_hash: string;
			frontmatter_json: string;
		}>();

	if (!row) {
		console.error(JSON.stringify({ event: 'index_message_for_missing_entry', entryId: msg.entry_id }));
		return;
	}

	// Skip if we've already indexed this body — dedup keeps Vectorize costs honest.
	const sidecar = await env.DB.prepare('SELECT body_hash FROM wiki_vector_index WHERE entry_id = ?')
		.bind(msg.entry_id)
		.first<{ body_hash: string }>();
	if (sidecar?.body_hash === row.body_hash) {
		return;
	}

	// Embed the title + body so semantic search picks up frontmatter context too.
	const frontmatter = JSON.parse(row.frontmatter_json) as Record<string, unknown>;
	const title = (frontmatter.title as string) ?? (frontmatter.name as string) ?? row.slug;
	const text = `${title}\n\n${row.body}`.slice(0, 8000);

	const embed = await env.AI.run(EMBEDDING_MODEL, { text: [text] });
	const vector = (embed as { data: number[][] }).data?.[0];
	if (!vector) {
		throw new Error('Workers AI returned no embedding');
	}

	const vectorId = `${msg.entry_id}#${(await sha256(text)).slice(0, 8)}`;
	await env.VECTOR_INDEX.upsert([
		{
			id: vectorId,
			values: vector,
			metadata: {
				collection: row.collection,
				slug: row.slug,
				entry_id: msg.entry_id,
			},
		},
	]);

	const now = new Date().toISOString();
	await env.DB.prepare(
		`INSERT INTO wiki_vector_index (entry_id, vector_id, body_hash, indexed_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(entry_id) DO UPDATE SET vector_id = excluded.vector_id, body_hash = excluded.body_hash, indexed_at = excluded.indexed_at`
	)
		.bind(msg.entry_id, vectorId, row.body_hash, now)
		.run();
}
