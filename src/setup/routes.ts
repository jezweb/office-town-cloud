// Setup routes — POST /api/setup/dossier accepts the multi-file dossier
// extraction from variant 2 of the onboarding prompt + routes it into the
// cortex.

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { routeFile } from './routing';
import { applyPlannedWrites } from './writer';
import type { DossierFile, PlannedWrite, SetupResult } from './types';

export const setupRoutes = new Hono<AppContext>();

function validateRequest(body: unknown): { ok: true; files: DossierFile[]; source: string; dry_run: boolean } | { ok: false; error: string } {
	if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
	const b = body as Record<string, unknown>;
	if (!Array.isArray(b.files)) return { ok: false, error: 'files must be an array' };
	if (b.files.length === 0 || b.files.length > 50) return { ok: false, error: 'files must have 1-50 entries' };
	const files: DossierFile[] = [];
	for (let i = 0; i < b.files.length; i++) {
		const f = b.files[i] as Record<string, unknown>;
		if (!f || typeof f !== 'object') return { ok: false, error: `files[${i}] must be an object` };
		if (typeof f.filename !== 'string' || f.filename.length === 0 || f.filename.length > 200) {
			return { ok: false, error: `files[${i}].filename must be 1-200 chars` };
		}
		if (typeof f.content !== 'string' || f.content.length === 0 || f.content.length > 200_000) {
			return { ok: false, error: `files[${i}].content must be 1-200000 chars` };
		}
		files.push({ filename: f.filename, content: f.content });
	}
	const source = typeof b.source === 'string' ? b.source : 'unknown';
	const dry_run = b.dry_run === true;
	return { ok: true, files, source, dry_run };
}

// GET /api/setup/state — read cortex_state flag, return readable state
setupRoutes.get('/api/setup/state', async (c) => {
	const row = await c.env.DB.prepare('SELECT value FROM worker_config WHERE key = ?')
		.bind('cortex_state')
		.first<{ value: string }>();
	const entryCountRow = await c.env.DB.prepare(
		'SELECT COUNT(*) AS n FROM wiki_entries WHERE status != ?',
	)
		.bind('deleted')
		.first<{ n: number }>();

	const state = row?.value ?? 'fresh';
	const entryCount = entryCountRow?.n ?? 0;

	return c.json({
		ok: true,
		cortex_state: state,
		entry_count: entryCount,
		// 'fresh' = no setup run; suggest setup
		// 'live' = setup complete or content present
		// 'onboarding' = setup mid-flow (currently unused; reserved for future multi-step)
	});
});

// POST /api/setup/dossier — accept dossier files, route, write
setupRoutes.post('/api/setup/dossier', async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ ok: false, error: 'invalid_json' }, 400);
	}

	const parsed = validateRequest(body);
	if (!parsed.ok) {
		return c.json({ ok: false, error: 'invalid_request', detail: parsed.error }, 400);
	}

	const { files, source, dry_run } = parsed;

	console.log(
		JSON.stringify({
			event: 'setup_dossier_received',
			file_count: files.length,
			source,
			dry_run,
			filenames: files.map((f) => f.filename),
		}),
	);

	// Route each file → collect planned writes
	const plans: PlannedWrite[] = [];
	for (const file of files as DossierFile[]) {
		try {
			const fileWrites = routeFile(file);
			plans.push(...fileWrites);
		} catch (err) {
			console.error(
				JSON.stringify({
					event: 'setup_routing_error',
					filename: file.filename,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	if (dry_run) {
		// Return the plan without applying. Useful for previewing what setup
		// would do before committing.
		const result: SetupResult = {
			ok: true,
			planned: plans,
			applied: 0,
			skipped: 0,
			errors: [],
			summary: `Dry run — would route ${plans.length} entries from ${files.length} files. Pass dry_run=false to apply.`,
		};
		return c.json(result);
	}

	const result = await applyPlannedWrites(c.env, plans, source);

	console.log(
		JSON.stringify({
			event: 'setup_dossier_applied',
			planned: result.planned.length,
			applied: result.applied,
			skipped: result.skipped,
			error_count: result.errors.length,
		}),
	);

	return c.json(result);
});
