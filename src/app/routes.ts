// /app/* — externalUrl pages for MCP-UI panels (and standalone browser use).
//
// Each page is token-gated: the URL carries a scoped UI token (minted by the
// cortex_ui tool). We validate it, then serve the page with the same token +
// the absolute API origin injected so the page's fetches reach this worker
// regardless of how Goose embeds it.

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { getEffectiveBearer } from '../auth/bearer';
import { verifyUiToken } from '../auth/ui-token';
import { renderTasksPage } from './tasks-page';
import { renderEntityEditPage } from './entity-page';
import { renderCapturePage } from './capture-page';
import { WikiService } from '../wiki/service';

const app = new Hono<AppContext>();

app.get('/tasks', async (c) => {
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, 'tasks', bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen the Tasks panel from Goose.</p></body>', 401);
	}
	return c.html(renderTasksPage(t, new URL(c.req.url).origin));
});

app.get('/entity', async (c) => {
	const t = c.req.query('t') ?? '';
	const collection = c.req.query('c') ?? '';
	const slug = c.req.query('s') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, 'cortex', bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
	}
	if (!collection || !slug) return c.html('<body style="font:14px system-ui;padding:24px">Missing entity.</body>', 400);
	let actions: Array<{ label: string; prompt: string }> = [];
	const rawActions = c.req.query('a');
	if (rawActions) {
		try {
			const parsed = JSON.parse(rawActions);
			if (Array.isArray(parsed)) actions = parsed.filter((x) => x && typeof x.label === 'string' && typeof x.prompt === 'string');
		} catch {
			/* ignore malformed actions */
		}
	}
	try {
		const svc = new WikiService(c.env);
		const entry = await svc.read(collection, slug);
		const related = await svc.related(collection, slug);
		return c.html(renderEntityEditPage(t, new URL(c.req.url).origin, collection, slug, entry.frontmatter, related, actions));
	} catch {
		return c.html('<body style="font:14px system-ui;padding:24px">Entity not found.</body>', 404);
	}
});

app.get('/capture', async (c) => {
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, 'cortex', bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
	}
	return c.html(renderCapturePage(t, new URL(c.req.url).origin));
});

export const appRoutes = app;
