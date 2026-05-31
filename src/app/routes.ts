// /app/* — externalUrl pages for MCP-UI panels (and standalone browser use).
//
// Each page is token-gated: the URL carries a scoped UI token (minted by the
// cortex_ui tool). We validate it, then serve the page with the same token +
// the absolute API origin injected so the page's fetches reach this worker
// regardless of how Goose embeds it.

import { Hono } from 'hono';
import type { AppContext } from '../types';
import type { CollectionDef } from '../lib/shared';
import { tokenAllows } from '../auth/self-auth';
import { renderTasksPage } from './tasks-page';
import { renderEntityEditPage } from './entity-page';
import { renderCapturePage } from './capture-page';
import { renderCapabilitiesPage } from './capabilities-page';
import { renderQuoteToCashPage } from './quote-to-cash-page';
import { renderMiniCrmPage } from './mini-crm-page';
import { renderRunSheetPage } from './run-sheet-page';
import { renderOnsiteQuotePage } from './onsite-quote-page';
import { renderCompliancePage } from './compliance-page';
import { renderBookingCalendarPage } from './booking-calendar-page';
import { renderDeliverablesPage } from './deliverables-page';
import { renderAssetRegisterPage } from './asset-register-page';
import { renderSupportTicketsPage } from './support-tickets-page';
import { renderDecisionLogPage } from './decision-log-page';
import { getCustomAppHtml } from '../apps-api/routes';
import { WikiService } from '../wiki/service';

const app = new Hono<AppContext>();

const EXPIRED = '<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>';

// Simple token-gated pages: [path, scope, renderer]. tokenAllows = constant-time
// bearer OR a valid token for `scope`.
const PAGES: Array<[string, string, (t: string, o: string) => string]> = [
	['/tasks', 'tasks', renderTasksPage],
	['/capture', 'cortex', renderCapturePage],
	['/showcase', 'app:office-town-showcase', renderCapabilitiesPage],
	['/mini-crm', 'cortex:contacts', renderMiniCrmPage],
	['/run-sheet', 'app:office-town-run-sheet', renderRunSheetPage],
	['/onsite-quote', 'app:office-town-onsite-quote', renderOnsiteQuotePage],
	['/bookings', 'app:office-town-bookings', renderBookingCalendarPage],
	['/deliverables', 'app:office-town-deliverables', renderDeliverablesPage],
	['/asset-register', 'app:office-town-asset-register', renderAssetRegisterPage],
	['/support-tickets', 'app:office-town-support-tickets', renderSupportTicketsPage],
	['/decision-log', 'app:office-town-decision-log', renderDecisionLogPage],
];
for (const [path, scope, render] of PAGES) {
	app.get(path, async (c) => {
		const t = c.req.query('t') ?? '';
		if (!(await tokenAllows(c.env, t, scope))) return c.html(EXPIRED, 401);
		return c.html(render(t, new URL(c.req.url).origin));
	});
}

// Collection-backed flagships: like above, but ensure their collection exists
// first so they work even without the pack installed (idempotent).
const FLAGSHIPS: Array<[string, string, CollectionDef, (t: string, o: string) => string]> = [
	['/quote-to-cash', 'cortex:jobs', { name: 'jobs', shape: 'entity-as-folder', canonical_filename: 'job.md', required_fields: ['title'], description: 'Jobs — scope, site, materials, photos, status, next step' }, renderQuoteToCashPage],
	['/compliance', 'cortex:deadlines', { name: 'deadlines', shape: 'dated-stream', canonical_filename: '', required_fields: ['title'], description: 'Compliance + lodgement deadlines (BAS, tax, super, ASIC)' }, renderCompliancePage],
];
for (const [path, scope, colDef, render] of FLAGSHIPS) {
	app.get(path, async (c) => {
		const t = c.req.query('t') ?? '';
		if (!(await tokenAllows(c.env, t, scope))) return c.html(EXPIRED, 401);
		try { await new WikiService(c.env).registerCollection(colDef); } catch { /* already registered */ }
		return c.html(render(t, new URL(c.req.url).origin));
	});
}

// Entity panel — bespoke (extra query params + a data load before render).
app.get('/entity', async (c) => {
	const t = c.req.query('t') ?? '';
	if (!(await tokenAllows(c.env, t, 'cortex'))) return c.html(EXPIRED, 401);
	const collection = c.req.query('c') ?? '';
	const slug = c.req.query('s') ?? '';
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

// Agent-built apps: serve the stored HTML with a window.ot persistence bridge
// injected (scoped to this app's data store). The agent's HTML calls
// ot.load()/ot.save(data); it never sees the bearer or the cortex.
app.get('/custom/:appId', async (c) => {
	const appId = c.req.param('appId');
	const t = c.req.query('t') ?? '';
	if (!(await tokenAllows(c.env, t, `app:${appId}`))) return c.html(EXPIRED, 401);
	const appDef = await getCustomAppHtml(c.env, appId);
	if (!appDef) return c.html('<body style="font:14px system-ui;padding:24px">App not found.</body>', 404);
	const dataUrl = `${new URL(c.req.url).origin}/api/appdata/${appId}`;
	const bridge = `<script>window.ot=(function(){var A=${JSON.stringify(dataUrl)},H={'Authorization':'Bearer '+${JSON.stringify(t)},'Content-Type':'application/json'};return{load:function(){return fetch(A,{headers:H}).then(function(r){return r.ok?r.json():{};}).catch(function(){return{};});},save:function(d){return fetch(A,{method:'PUT',headers:H,body:JSON.stringify(d)});}};})();</script>`;
	let html = appDef.html;
	html = html.includes('</head>') ? html.replace('</head>', `${bridge}</head>`) : bridge + html;
	// Self-contained app → strict CSP so injected JS can't load external code or
	// POST the scoped token off-origin. (Flagship /app pages that use CDNs are exempt.)
	c.header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src 'self'; base-uri 'none'");
	return c.html(html);
});

export const appRoutes = app;
