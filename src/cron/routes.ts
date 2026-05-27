import { Hono } from 'hono';
import { CronService } from './service';
import type { AppContext } from '../types';

export const cronRoutes = new Hono<AppContext>();

// Static routes first (per Hono routing rule)

cronRoutes.get('/due', async (c) => {
	const svc = new CronService(c.env);
	const jobs = await svc.due();
	return c.json({ due: jobs });
});

cronRoutes.get('/list', async (c) => {
	const svc = new CronService(c.env);
	const jobs = await svc.list();
	return c.json({ jobs });
});

cronRoutes.post('/schedule', async (c) => {
	try {
		const body = await c.req.json<{
			slug: string;
			title: string;
			description?: string;
			command: string;
			frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'cron' | 'once';
			cron_expression?: string;
			timezone?: string;
		}>();
		if (!body.slug || !body.title || !body.command || !body.frequency) {
			return c.json({ error: 'slug, title, command, frequency required' }, 400);
		}
		const svc = new CronService(c.env);
		const job = await svc.schedule(body);
		return c.json(job, 201);
	} catch (err) {
		return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
	}
});

// Run reporting — Goose Desktop POSTs here before + after executing a job
cronRoutes.post('/run/:id/start', async (c) => {
	const jobId = c.req.param('id');
	const svc = new CronService(c.env);
	const runId = await svc.markStarted(jobId);
	return c.json({ run_id: runId });
});

cronRoutes.post('/run/:id/finish', async (c) => {
	const jobId = c.req.param('id');
	const body = await c.req.json<{
		run_id: string;
		status: 'success' | 'error';
		output?: string;
		error?: string;
	}>();
	const svc = new CronService(c.env);
	await svc.markFinished(body.run_id, jobId, body.status, body.output ?? null, body.error ?? null);
	return c.body(null, 204);
});

// Parameterised routes last
cronRoutes.get('/:id', async (c) => {
	const id = c.req.param('id');
	const svc = new CronService(c.env);
	const job = await svc.get(id);
	if (!job) return c.json({ error: 'Job not found' }, 404);
	return c.json(job);
});

cronRoutes.get('/:id/history', async (c) => {
	const id = c.req.param('id');
	const limit = Number(c.req.query('limit') ?? '20');
	const svc = new CronService(c.env);
	const history = await svc.history(id, limit);
	return c.json({ history });
});

cronRoutes.delete('/:id', async (c) => {
	const id = c.req.param('id');
	const svc = new CronService(c.env);
	await svc.delete(id);
	return c.body(null, 204);
});
