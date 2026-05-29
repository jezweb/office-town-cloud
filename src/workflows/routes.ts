// Workflow + bridge HTTP API.
//
//   /api/workflows/list      — parse workflow.md defs from R2 (dashboard + agent)
//   /api/workflows/triggers  — register/list inbound webhook sources
//   /api/jobs/poll           — daemon claims jobs targeted at its device
//   /api/jobs/:id/result     — daemon reports a job outcome
//   /api/jobs/enqueue        — authed manual enqueue
//   /api/triggers/:id        — PUBLIC inbound webhook (per-source secret) → enqueues a job
//
// A Workflow itself is just markdown in the cortex (workflows/<slug>/workflow.md);
// the agent runs it. This API is the thin support: discovery for the dashboard,
// and the cloud→local bridge (webhook → job → daemon picks it up → local run).

import { Hono } from 'hono';
import yaml from 'js-yaml';
import type { AppContext } from '../types';
import { deviceIdFrom } from '../identity';

const workflowsRoutes = new Hono<AppContext>();
const jobsRoutes = new Hono<AppContext>();
const triggerRoutes = new Hono<AppContext>();

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loadYaml(text: string): Record<string, unknown> {
	try {
		return (yaml.load(text) as Record<string, unknown>) ?? {};
	} catch {
		return {};
	}
}

// GET /api/workflows/list — workflow defs (recipe.yaml + trigger.yaml) from R2, each with its
// last receipt. A workflow is a Goose recipe (the goal) + a thin trigger.yaml (our layer).
workflowsRoutes.get('/list', async (c) => {
	const listing = await c.env.FILES.list({ prefix: 'workflows/', limit: 1000 });
	const out: Array<Record<string, unknown>> = [];
	for (const obj of listing.objects) {
		if (!obj.key.endsWith('/recipe.yaml')) continue;
		const slug = obj.key.slice('workflows/'.length, -'/recipe.yaml'.length);
		const recipeObj = await c.env.FILES.get(obj.key);
		if (!recipeObj) continue;
		const recipe = loadYaml(await recipeObj.text());
		const trigObj = await c.env.FILES.get(`workflows/${slug}/trigger.yaml`);
		const trig = trigObj ? loadYaml(await trigObj.text()) : {};
		let lastReceipt: string | null = null;
		const log = await c.env.FILES.get(`workflows/${slug}/log.md`);
		if (log) {
			const lines = (await log.text()).trim().split('\n').filter(Boolean);
			lastReceipt = lines[lines.length - 1] ?? null;
		}
		out.push({
			slug,
			name: recipe.title ?? slug,
			description: recipe.description ?? '',
			on: trig.on ?? 'demand',
			match: trig.match ?? null,
			cron: trig.cron ?? null,
			trust: trig.trust ?? 'review',
			owner: trig.owner ?? null,
			status: trig.status ?? 'active',
			report: trig.report ?? null,
			last_receipt: lastReceipt,
		});
	}
	return c.json({ workflows: out });
});

// POST /api/workflows/triggers — register an inbound webhook source. Returns the
// secret ONCE (only the hash is stored). { label, workflow_slug, target_device? }
workflowsRoutes.post('/triggers', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as {
		label?: string;
		workflow_slug?: string;
		target_device?: string;
	};
	if (!body.workflow_slug) return c.json({ error: 'workflow_slug required' }, 400);
	const sourceId = crypto.randomUUID().slice(0, 12);
	const secret = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
	await c.env.DB.prepare(
		`INSERT INTO trigger_sources (source_id, label, secret_hash, workflow_slug, target_device) VALUES (?, ?, ?, ?, ?)`,
	)
		.bind(sourceId, body.label ?? null, await sha256Hex(secret), body.workflow_slug, body.target_device ?? null)
		.run();
	const url = new URL(c.req.url);
	return c.json({
		ok: true,
		source_id: sourceId,
		secret, // shown once — store it in the external system
		webhook_url: `${url.protocol}//${url.host}/api/triggers/${sourceId}`,
		hint: 'POST here with header X-Trigger-Secret: <secret> to fire the workflow.',
	});
});

workflowsRoutes.get('/triggers', async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT source_id, label, workflow_slug, target_device, created_at, last_fired_at FROM trigger_sources ORDER BY created_at DESC`,
	).all();
	return c.json({ triggers: results ?? [] });
});

// GET /api/jobs/poll — daemon claims up to 10 pending jobs for its device.
jobsRoutes.get('/poll', async (c) => {
	const device = deviceIdFrom(c);
	if (!device) return c.json({ jobs: [] });
	const { results } = await c.env.DB.prepare(
		`SELECT job_id, workflow_slug, payload, source FROM jobs
		 WHERE status = 'pending' AND (target_device = ? OR target_device IS NULL)
		 ORDER BY created_at LIMIT 10`,
	)
		.bind(device)
		.all<{ job_id: string; workflow_slug: string; payload: string | null; source: string | null }>();
	const jobs = results ?? [];
	for (const j of jobs) {
		await c.env.DB.prepare(
			`UPDATE jobs SET status = 'claimed', claimed_at = datetime('now'), target_device = ? WHERE job_id = ? AND status = 'pending'`,
		)
			.bind(device, j.job_id)
			.run();
	}
	return c.json({ jobs: jobs.map((j) => ({ ...j, payload: j.payload ? JSON.parse(j.payload) : null })) });
});

// POST /api/jobs/:id/result — daemon reports outcome. { status?: 'done'|'failed', result? }
jobsRoutes.post('/:id/result', async (c) => {
	const id = c.req.param('id');
	const body = (await c.req.json().catch(() => ({}))) as { status?: string; result?: unknown };
	const status = body.status === 'failed' ? 'failed' : 'done';
	const result =
		typeof body.result === 'string' ? body.result.slice(0, 2000) : body.result != null ? JSON.stringify(body.result) : null;
	await c.env.DB.prepare(`UPDATE jobs SET status = ?, result = ?, finished_at = datetime('now') WHERE job_id = ?`)
		.bind(status, result, id)
		.run();
	return c.json({ ok: true });
});

// POST /api/jobs/enqueue — authed manual/agent enqueue. { workflow_slug, target_device?, payload? }
jobsRoutes.post('/enqueue', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as {
		workflow_slug?: string;
		target_device?: string;
		payload?: unknown;
		source?: string;
	};
	if (!body.workflow_slug) return c.json({ error: 'workflow_slug required' }, 400);
	const jobId = crypto.randomUUID();
	await c.env.DB.prepare(`INSERT INTO jobs (job_id, workflow_slug, target_device, payload, source) VALUES (?, ?, ?, ?, ?)`)
		.bind(jobId, body.workflow_slug, body.target_device ?? null, body.payload ? JSON.stringify(body.payload) : null, body.source ?? 'manual')
		.run();
	return c.json({ ok: true, job_id: jobId });
});

// POST /api/triggers/:id — PUBLIC inbound webhook. Validated by per-source secret
// (X-Trigger-Secret header or ?secret=), NOT the bearer. Enqueues a job.
triggerRoutes.post('/:id', async (c) => {
	const id = c.req.param('id');
	const src = await c.env.DB.prepare(
		`SELECT secret_hash, workflow_slug, target_device FROM trigger_sources WHERE source_id = ?`,
	)
		.bind(id)
		.first<{ secret_hash: string; workflow_slug: string; target_device: string | null }>();
	if (!src) return c.json({ error: 'unknown trigger source' }, 404);
	const secret = c.req.header('x-trigger-secret') ?? new URL(c.req.url).searchParams.get('secret') ?? '';
	if (!secret || (await sha256Hex(secret)) !== src.secret_hash) {
		return c.json({ error: 'bad or missing trigger secret' }, 401);
	}
	const payload = await c.req.json().catch(() => ({}));
	const jobId = crypto.randomUUID();
	await c.env.DB.prepare(`INSERT INTO jobs (job_id, workflow_slug, target_device, payload, source) VALUES (?, ?, ?, ?, ?)`)
		.bind(jobId, src.workflow_slug, src.target_device ?? null, JSON.stringify(payload), `webhook:${id}`)
		.run();
	await c.env.DB.prepare(`UPDATE trigger_sources SET last_fired_at = datetime('now') WHERE source_id = ?`).bind(id).run();
	return c.json({ ok: true, job_id: jobId, workflow: src.workflow_slug });
});

export { workflowsRoutes, jobsRoutes, triggerRoutes };
