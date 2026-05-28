// Seed example entry installer.
//
// Runs on cold start once per cortex install. Writes the 7 example
// entries (3 doctrine concepts + 4 linked entity examples) directly to
// R2 + D1, bypassing the unified write path because seeds are hand-
// curated (no AI repair) and skip Vectorize indexing (deferred).
//
// Idempotent: tracked via worker_config.seeds_installed flag.
// Skipped if the cortex already has content (don't dump seeds on a
// populated wiki — protects against accidental seed-pollution if a
// user populates the cortex before the seed pass fires).
//
// Each seed lands a wiki_audit row with action='seed' so the Town
// Clock shows the install activity from first dashboard load.

import { parseMarkdown } from '../wiki/frontmatter';
import { SEED_ENTRIES } from './example-entries';
import type { Env } from '../types';

let seedsConfirmed = false;

export async function installSeedsIfNeeded(env: Env): Promise<void> {
	if (seedsConfirmed) return;

	// Check the flag first
	const flag = await env.DB.prepare('SELECT value FROM worker_config WHERE key = ?')
		.bind('seeds_installed')
		.first<{ value: string }>();
	if (flag?.value) {
		seedsConfirmed = true;
		return;
	}

	// Don't dump seeds on a populated cortex
	const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM wiki_entries').first<{ n: number }>();
	const existingCount = countRow?.n ?? 0;
	if (existingCount > 0) {
		await env.DB.prepare(
			'INSERT OR REPLACE INTO worker_config (key, value) VALUES (?, ?)',
		)
			.bind('seeds_installed', 'skipped-populated')
			.run();
		seedsConfirmed = true;
		console.log(
			JSON.stringify({
				event: 'seed_install_skipped',
				reason: 'wiki_entries already populated',
				existing_count: existingCount,
			}),
		);
		return;
	}

	console.log(
		JSON.stringify({
			event: 'seed_install_start',
			count: SEED_ENTRIES.length,
		}),
	);

	const now = new Date().toISOString();
	const tsMs = Date.now();
	let written = 0;

	for (const seed of SEED_ENTRIES) {
		try {
			const r2Key = `wiki/${seed.collection}/${seed.slug}/${seed.canonical_filename}`;
			const parsed = parseMarkdown(seed.body);
			const bodyHash = await sha256Hex(seed.body);
			const id = `${seed.collection}:${seed.slug}`;
			const uuid = crypto.randomUUID();

			// R2 write
			await env.WIKI.put(r2Key, seed.body, {
				httpMetadata: { contentType: 'text/markdown' },
			});

			// D1 wiki_entries insert (idempotent — INSERT OR IGNORE on existing id)
			await env.DB.prepare(
				`INSERT OR IGNORE INTO wiki_entries
					(id, collection, slug, r2_key, title, frontmatter_json, body, body_hash, last_change_summary, last_edited_by, status, uuid, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					id,
					seed.collection,
					seed.slug,
					r2Key,
					seed.title,
					JSON.stringify(parsed.frontmatter),
					parsed.body,
					bodyHash,
					'seed: install example entry',
					'bootstrap',
					'active',
					uuid,
					now,
					now,
				)
				.run();

			// D1 wiki_audit row
			const auditId = crypto.randomUUID();
			await env.DB.prepare(
				`INSERT INTO wiki_audit
					(audit_id, ts, action, collection, slug, entry_uuid, agent_slug, prev_hash, new_hash, why)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					auditId,
					tsMs,
					'seed',
					seed.collection,
					seed.slug,
					uuid,
					'bootstrap',
					null,
					bodyHash,
					'install seed example entry',
				)
				.run();

			written += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					event: 'seed_install_error',
					collection: seed.collection,
					slug: seed.slug,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
			// Continue with remaining seeds — one bad entry shouldn't block the rest
		}
	}

	// Mark installed
	await env.DB.prepare(
		'INSERT OR REPLACE INTO worker_config (key, value) VALUES (?, ?)',
	)
		.bind('seeds_installed', 'true')
		.run();

	seedsConfirmed = true;

	console.log(
		JSON.stringify({
			event: 'seed_install_complete',
			count: written,
			of: SEED_ENTRIES.length,
		}),
	);
}

async function sha256Hex(content: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function _resetSeedMemo(): void {
	seedsConfirmed = false;
}
