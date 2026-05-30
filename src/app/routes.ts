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

export const appRoutes = app;
