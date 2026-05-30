// /api/cortex — direct edits from the editable entity panel.
//
// Self-authed like /api/tasks: accepts a scoped UI token (scope 'cortex') from
// the panel, or the full bearer. Lets a person click a field and overtype it
// (auto-saving to the wiki) without going through the agent — the direct-
// manipulation half of the CRM shape. Provenance is stamped as 'panel-edit'.

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { getEffectiveBearer } from '../auth/bearer';
import { verifyUiToken } from '../auth/ui-token';
import { WikiService } from '../wiki/service';

const app = new Hono<AppContext>();

app.use('*', async (c, next) => {
	const token = /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') ?? '')?.[1]?.trim() ?? '';
	if (!token) return c.json({ error: 'Unauthorised' }, 401);
	const bearer = await getEffectiveBearer(c.env);
	if (token === bearer || (await verifyUiToken(token, 'cortex', bearer, Date.now()))) return next();
	return c.json({ error: 'Unauthorised' }, 401);
});

// Update one frontmatter field (click-to-edit, auto-save on blur).
app.patch('/field', async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { collection?: string; slug?: string; key?: string; value?: unknown };
	if (!b.collection || !b.slug || !b.key) return c.json({ error: 'collection, slug, key required' }, 400);
	await new WikiService(c.env).update(
		{ collection: b.collection, slug: b.slug, frontmatter_patch: { [b.key]: b.value }, last_change_summary: `edited ${b.key} via panel` },
		'panel-edit',
	);
	return c.json({ ok: true });
});

// Append a dated note to the entry body (the "add to the description" action).
app.post('/note', async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { collection?: string; slug?: string; text?: string };
	if (!b.collection || !b.slug || !b.text || !b.text.trim()) return c.json({ error: 'collection, slug, text required' }, 400);
	const svc = new WikiService(c.env);
	const entry = await svc.read(b.collection, b.slug);
	const stamp = new Date().toISOString().slice(0, 10);
	const body = `${entry.body.trimEnd()}\n\n**${stamp} note:** ${b.text.trim()}\n`;
	await svc.update({ collection: b.collection, slug: b.slug, body, last_change_summary: 'appended note via panel' }, 'panel-edit');
	return c.json({ ok: true });
});

// Quick Capture — drop a note/link into the cortex inbox; filing-cabinet files it.
app.post('/capture', async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { text?: string };
	if (!b.text || !b.text.trim()) return c.json({ error: 'text required' }, 400);
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const key = `inbox/capture-${ts}.md`;
	await c.env.FILES.put(key, b.text.trim(), { httpMetadata: { contentType: 'text/markdown' } });
	return c.json({ ok: true, key });
});

// Recent captures (most recent first) — name + a one-line snippet.
app.get('/captures', async (c) => {
	const listing = await c.env.FILES.list({ prefix: 'inbox/capture-', limit: 50 });
	const objs = listing.objects.sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 10);
	const captures = await Promise.all(
		objs.map(async (o) => {
			const f = await c.env.FILES.get(o.key);
			const txt = f ? (await f.text()).trim() : '';
			return { key: o.key, snippet: txt.replace(/\s+/g, ' ').slice(0, 100) };
		}),
	);
	return c.json({ captures });
});

export const cortexApiRoutes = app;
