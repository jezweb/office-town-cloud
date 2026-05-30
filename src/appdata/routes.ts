// /api/appdata/:appId — a generic per-app key-value store for agent-built apps.
//
// An agent-authored app is self-contained HTML that persists via window.ot
// (load/save), backed here. Auth = the full bearer OR a token scoped to THIS
// app (app:<appId>), so a custom app can only ever touch its OWN blob — never
// the cortex or another app. Mounted at /api/appdata (NOT in MCP_PATH_PREFIXES,
// so it self-authenticates rather than requiring the bearer).

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { getEffectiveBearer } from '../auth/bearer';
import { verifyUiToken } from '../auth/ui-token';

const app = new Hono<AppContext>();

const SAFE_ID = /^[a-z0-9-]{1,80}$/;
const MAX_BYTES = 256 * 1024;

function key(appId: string): string {
	return `app-state/custom/${appId}.json`;
}

async function authed(env: Env, authHeader: string | undefined, appId: string): Promise<boolean> {
	const token = /^Bearer\s+(.+)$/i.exec(authHeader ?? '')?.[1]?.trim() ?? '';
	if (!token) return false;
	const bearer = await getEffectiveBearer(env);
	return token === bearer || (await verifyUiToken(token, `app:${appId}`, bearer, Date.now()));
}

app.get('/:appId', async (c) => {
	const appId = c.req.param('appId');
	if (!SAFE_ID.test(appId)) return c.json({ error: 'bad app id' }, 400);
	if (!(await authed(c.env, c.req.header('authorization'), appId))) return c.json({ error: 'Unauthorised' }, 401);
	const f = await c.env.FILES.get(key(appId));
	if (!f) return c.json({});
	return new Response(f.body, { headers: { 'content-type': 'application/json' } });
});

app.put('/:appId', async (c) => {
	const appId = c.req.param('appId');
	if (!SAFE_ID.test(appId)) return c.json({ error: 'bad app id' }, 400);
	if (!(await authed(c.env, c.req.header('authorization'), appId))) return c.json({ error: 'Unauthorised' }, 401);
	const body = await c.req.text();
	if (body.length > MAX_BYTES) return c.json({ error: 'too large' }, 413);
	try {
		JSON.parse(body); // must be valid JSON
	} catch {
		return c.json({ error: 'body must be JSON' }, 400);
	}
	await c.env.FILES.put(key(appId), body, { httpMetadata: { contentType: 'application/json' } });
	return c.json({ ok: true });
});

export const appDataRoutes = app;
