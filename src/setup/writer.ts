// Writer — takes PlannedWrites and applies them via direct R2 + D1 inserts.
//
// Bypasses the unified write path because setup-imported content is
// hand-curated (no AI repair needed) and skips Vectorize for now. Still
// writes audit rows with action='setup' + agent_slug='bootstrap-setup' so
// the Town Clock shows the setup activity from first dashboard load.

import type { Env } from '../types';
import type { PlannedWrite, SetupResult } from './types';

export async function applyPlannedWrites(
	env: Env,
	plans: PlannedWrite[],
	source: string,
): Promise<SetupResult> {
	const now = new Date().toISOString();
	const tsMs = Date.now();
	const errors: SetupResult['errors'] = [];
	let applied = 0;
	let skipped = 0;

	for (const plan of plans) {
		try {
			// Compose final markdown with frontmatter
			const bodyHash = await sha256Hex(plan.body);
			const id = `${plan.collection}:${plan.slug}`;
			const uuid = crypto.randomUUID();

			const frontmatter = renderFrontmatter({
				slug: plan.slug,
				kind: plan.collection,
				title: plan.title,
				schema_version: 1,
				status: 'active',
				confidence: 0.85, // dossier-sourced; user should review
				review_status: 'approved',
				derived_from: [`dossier-paste:${source}:${plan.source_filename}`],
				created: now,
				last_updated: now,
				last_edited_by: 'bootstrap-setup',
				last_change_summary: `setup: routed from ${plan.source_filename} (${plan.classification})`,
			});

			const fullBody = `---\n${frontmatter}---\n\n# ${escapeYaml(plan.title)}\n\n${plan.body.trim()}\n`;

			// R2 write
			await env.WIKI.put(plan.r2_key, fullBody, {
				httpMetadata: { contentType: 'text/markdown' },
			});

			// D1 wiki_entries upsert
			await env.DB.prepare(
				`INSERT INTO wiki_entries
				 (id, collection, slug, r2_key, title, frontmatter_json, body, body_hash, last_change_summary, last_edited_by, status, uuid, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET
					 r2_key = excluded.r2_key,
					 title = excluded.title,
					 frontmatter_json = excluded.frontmatter_json,
					 body = excluded.body,
					 body_hash = excluded.body_hash,
					 last_change_summary = excluded.last_change_summary,
					 last_edited_by = excluded.last_edited_by,
					 updated_at = excluded.updated_at`,
			)
				.bind(
					id,
					plan.collection,
					plan.slug,
					plan.r2_key,
					plan.title,
					JSON.stringify({
						slug: plan.slug,
						kind: plan.collection,
						title: plan.title,
						source_filename: plan.source_filename,
						classification: plan.classification,
					}),
					plan.body,
					bodyHash,
					`setup: ${plan.classification}`,
					'bootstrap-setup',
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
					'setup',
					plan.collection,
					plan.slug,
					uuid,
					'bootstrap-setup',
					null,
					bodyHash,
					`onboarding dossier import from ${plan.source_filename}`,
				)
				.run();

			applied += 1;
		} catch (err) {
			errors.push({
				filename: plan.source_filename,
				error: err instanceof Error ? err.message : String(err),
			});
			skipped += 1;
			console.error(
				JSON.stringify({
					event: 'setup_write_error',
					filename: plan.source_filename,
					r2_key: plan.r2_key,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	// Update cortex_state to 'live' on successful setup (any writes applied)
	let cortexStateAfter: string | undefined;
	if (applied > 0) {
		await env.DB.prepare(
			'INSERT OR REPLACE INTO worker_config (key, value) VALUES (?, ?)',
		)
			.bind('cortex_state', 'live')
			.run();
		cortexStateAfter = 'live';
	}

	const summary = buildSummary(plans, applied, skipped, errors);

	return {
		ok: errors.length === 0,
		planned: plans,
		applied,
		skipped,
		errors,
		cortex_state_after: cortexStateAfter,
		summary,
	};
}

function buildSummary(
	plans: PlannedWrite[],
	applied: number,
	skipped: number,
	errors: SetupResult['errors'],
): string {
	const byCollection = new Map<string, number>();
	for (const p of plans) {
		byCollection.set(p.collection, (byCollection.get(p.collection) ?? 0) + 1);
	}

	const collectionParts = [...byCollection.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([c, n]) => `${n} ${c}`)
		.join(', ');

	const errorPart =
		errors.length > 0
			? ` ${errors.length} write${errors.length === 1 ? '' : 's'} failed; see errors[] for detail.`
			: '';

	return `Routed ${plans.length} entries from dossier (${collectionParts}). ${applied} applied, ${skipped} skipped.${errorPart}`;
}

function renderFrontmatter(fm: Record<string, unknown>): string {
	const lines: string[] = [];
	for (const [k, v] of Object.entries(fm)) {
		if (v === undefined || v === null) continue;
		if (Array.isArray(v)) {
			if (v.length === 0) {
				lines.push(`${k}: []`);
			} else {
				lines.push(`${k}:`);
				for (const item of v) {
					lines.push(`  - ${typeof item === 'string' ? escapeYaml(item) : JSON.stringify(item)}`);
				}
			}
		} else if (typeof v === 'object') {
			lines.push(`${k}: ${JSON.stringify(v)}`);
		} else {
			const sv = String(v);
			const needsQuoting = /[:{}\[\]&*!|>'"%@`#,]/.test(sv) || sv.includes('\n');
			lines.push(`${k}: ${needsQuoting ? JSON.stringify(sv) : sv}`);
		}
	}
	return lines.join('\n') + '\n';
}

function escapeYaml(s: string): string {
	const needsQuoting = /[:{}\[\]&*!|>'"%@`#,]/.test(s) || s.includes('\n');
	return needsQuoting ? JSON.stringify(s) : s;
}

async function sha256Hex(content: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
