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

app.get('/showcase', async (c) => {
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, 'app:office-town-showcase', bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
	}
	return c.html(renderCapabilitiesPage(t, new URL(c.req.url).origin));
});

app.get('/quote-to-cash', async (c) => {
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, 'cortex:jobs', bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
	}
	// Self-sufficient: ensure the jobs collection exists (q2c writes deals there)
	// even if the Trades pack was never installed. Idempotent.
	try {
		await new WikiService(c.env).registerCollection({
			name: 'jobs', shape: 'entity-as-folder', canonical_filename: 'job.md', required_fields: ['title'],
			description: 'Jobs — scope, site, materials, photos, status, next step',
		});
	} catch {
		/* already registered — fine */
	}
	return c.html(renderQuoteToCashPage(t, new URL(c.req.url).origin));
});

app.get('/compliance', async (c) => {
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, 'cortex:deadlines', bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
	}
	// Self-sufficient: ensure the deadlines collection exists even without the
	// Professional services pack. Idempotent.
	try {
		await new WikiService(c.env).registerCollection({
			name: 'deadlines', shape: 'dated-stream', canonical_filename: '', required_fields: ['title'],
			description: 'Compliance + lodgement deadlines (BAS, tax, super, ASIC)',
		});
	} catch {
		/* already registered — fine */
	}
	return c.html(renderCompliancePage(t, new URL(c.req.url).origin));
});

app.get('/mini-crm', async (c) => {
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, 'cortex:contacts', bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
	}
	return c.html(renderMiniCrmPage(t, new URL(c.req.url).origin));
});

const sampler: Array<[string, string, (t: string, o: string) => string]> = [
	['/run-sheet', 'app:office-town-run-sheet', renderRunSheetPage],
	['/onsite-quote', 'app:office-town-onsite-quote', renderOnsiteQuotePage],
	['/bookings', 'app:office-town-bookings', renderBookingCalendarPage],
	['/deliverables', 'app:office-town-deliverables', renderDeliverablesPage],
	['/asset-register', 'app:office-town-asset-register', renderAssetRegisterPage],
	['/support-tickets', 'app:office-town-support-tickets', renderSupportTicketsPage],
	['/decision-log', 'app:office-town-decision-log', renderDecisionLogPage],
];
for (const [path, scope, render] of sampler) {
	app.get(path, async (c) => {
		const t = c.req.query('t') ?? '';
		const bearer = await getEffectiveBearer(c.env);
		const ok = t && (t === bearer || (await verifyUiToken(t, scope, bearer, Date.now())));
		if (!ok) {
			return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
		}
		return c.html(render(t, new URL(c.req.url).origin));
	});
}

// Agent-built apps: serve the stored HTML with a window.ot persistence bridge
// injected (scoped to this app's data store). The agent's HTML calls
// ot.load()/ot.save(data); it never sees the bearer or the cortex.
app.get('/custom/:appId', async (c) => {
	const appId = c.req.param('appId');
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	const ok = t && (t === bearer || (await verifyUiToken(t, `app:${appId}`, bearer, Date.now())));
	if (!ok) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px"><h2>Link expired</h2><p>Reopen this from Goose.</p></body>', 401);
	}
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
