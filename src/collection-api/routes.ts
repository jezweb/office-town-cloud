// /api/collection/:collection — collection-scoped CRUD for first-party flagship
// apps that work against a REAL cortex collection (not an opaque appdata blob).
//
// Auth: the full bearer OR a UI token scoped to EXACTLY this collection
// (cortex:<collection>). A cortex:jobs token can read/write the jobs collection
// and nothing else — narrower than the cortex-wide token the entity panel uses,
// so a flagship never gets keys to the whole cortex. Self-authed (NOT in
// MCP_PATH_PREFIXES), like /api/cortex and /api/appdata.

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { selfAuth } from '../auth/self-auth';
import { WikiService } from '../wiki/service';
import { WikiError } from '../lib/shared';

const app = new Hono<AppContext>();
const SAFE = /^[a-z][a-z0-9-]{0,39}$/;

function authed(env: Env, authHeader: string | undefined, collection: string): Promise<boolean> {
	return selfAuth(env, authHeader, `cortex:${collection}`);
}

// List entries (slug + frontmatter, no body — fast load).
app.get('/:collection', async (c) => {
	const collection = c.req.param('collection');
	if (!SAFE.test(collection)) return c.json({ error: 'bad collection' }, 400);
	if (!(await authed(c.env, c.req.header('authorization'), collection))) return c.json({ error: 'Unauthorised' }, 401);
	const { results } = await new WikiService(c.env).list({ collection, limit: 200, sort: 'recent' });
	return c.json({ entries: results.map((r) => ({ slug: r.slug, frontmatter: r.frontmatter, updated_at: r.updated_at })) });
});

// Read one entry with its body.
app.get('/:collection/:slug', async (c) => {
	const collection = c.req.param('collection');
	const slug = c.req.param('slug');
	if (!SAFE.test(collection)) return c.json({ error: 'bad collection' }, 400);
	if (!(await authed(c.env, c.req.header('authorization'), collection))) return c.json({ error: 'Unauthorised' }, 401);
	try {
		const entry = await new WikiService(c.env).read(collection, slug);
		return c.json({ slug, frontmatter: entry.frontmatter, body: entry.body });
	} catch {
		return c.json({ error: 'not found' }, 404);
	}
});

// Upsert: create if absent, patch+replace-body if present.
app.put('/:collection/:slug', async (c) => {
	const collection = c.req.param('collection');
	const slug = c.req.param('slug');
	if (!SAFE.test(collection) || !SAFE.test(slug)) return c.json({ error: 'bad collection/slug' }, 400);
	if (!(await authed(c.env, c.req.header('authorization'), collection))) return c.json({ error: 'Unauthorised' }, 401);
	const b = (await c.req.json().catch(() => ({}))) as { frontmatter?: Record<string, unknown>; body?: string; why?: string };
	const frontmatter = b.frontmatter ?? {};
	const body = b.body ?? '';
	const svc = new WikiService(c.env);
	let exists = true;
	try {
		await svc.read(collection, slug);
	} catch {
		exists = false;
	}
	try {
		if (exists) {
			await svc.update({ collection, slug, frontmatter_patch: frontmatter, body, last_change_summary: b.why ?? 'edited via app' }, 'app-edit');
		} else {
			await svc.create({ collection, slug, frontmatter, body }, 'app-edit', b.why ?? 'created via app');
		}
		return c.json({ ok: true, slug });
	} catch (err) {
		if (err instanceof WikiError) return c.json({ error: err.message, code: err.code }, 400);
		throw err;
	}
});

app.delete('/:collection/:slug', async (c) => {
	const collection = c.req.param('collection');
	const slug = c.req.param('slug');
	if (!SAFE.test(collection) || !SAFE.test(slug)) return c.json({ error: 'bad collection/slug' }, 400);
	if (!(await authed(c.env, c.req.header('authorization'), collection))) return c.json({ error: 'Unauthorised' }, 401);
	try {
		await new WikiService(c.env).delete(collection, slug, 'removed via app', 'app-edit');
	} catch {
		/* already gone — fine */
	}
	return c.json({ ok: true });
});

export const collectionApiRoutes = app;
