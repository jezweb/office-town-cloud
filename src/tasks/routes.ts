// /api/tasks — read/write for the task-board panel.
//
// Auth is self-contained (NOT the global MCP bearer gate): accepts either the
// full cortex bearer (agent/curl) OR a scoped UI token minted for the embedded
// panel (see auth/ui-token.ts). Not listed in MCP_PATH_PREFIXES, so the global
// authMiddleware passes it through to this middleware.

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { getEffectiveBearer } from '../auth/bearer';
import { verifyUiToken } from '../auth/ui-token';
import { TasksService } from './service';

const app = new Hono<AppContext>();

app.use('*', async (c, next) => {
	const auth = c.req.header('authorization') ?? '';
	const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? '';
	if (!token) return c.json({ error: 'Unauthorised' }, 401);
	const bearer = await getEffectiveBearer(c.env);
	if (token === bearer || (await verifyUiToken(token, 'tasks', bearer, Date.now()))) return next();
	return c.json({ error: 'Unauthorised' }, 401);
});

app.get('/', async (c) => c.json({ tasks: await new TasksService(c.env).load() }));

app.post('/', async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { title?: string; priority?: 'low' | 'normal' | 'high'; urgent?: boolean };
	if (!b.title || !b.title.trim()) return c.json({ error: 'title required' }, 400);
	const task = await new TasksService(c.env).add(
		{ title: b.title.trim(), priority: b.priority, urgent: b.urgent },
		new Date().toISOString(),
	);
	return c.json({ task });
});

app.post('/reorder', async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { layout?: Array<{ id: string; status: 'todo' | 'doing' | 'done'; order: number }> };
	if (!Array.isArray(b.layout)) return c.json({ error: 'layout required' }, 400);
	await new TasksService(c.env).applyLayout(b.layout);
	return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
	await new TasksService(c.env).remove(c.req.param('id'));
	return c.json({ ok: true });
});

export const tasksApiRoutes = app;
