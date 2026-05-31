// /c/:shareId — PUBLIC customer-facing shared apps (no owner auth).
//
// GET serves the agent-built HTML with a write-only window.ot.submit bridge.
// POST /submit validates a token scoped submit:<shareId> (so it can ONLY append
// a response to THIS form — never read the cortex or other forms) and writes the
// submission into the owner's cortex inbox. Mounted at /c (not gated).

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { getEffectiveBearer } from '../auth/bearer';
import { signUiToken } from '../auth/ui-token';
import { selfAuth } from '../auth/self-auth';
import { getSharedApp } from './store';

const app = new Hono<AppContext>();

const SAFE_ID = /^[a-z0-9]{1,40}$/i;

// Agent-authored apps are self-contained (no external resources). A strict CSP
// means even if a prompt-injected script slips into the HTML, it can't load
// external code or POST a stolen token off-origin (connect-src 'self').
const APP_CSP =
	"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src 'self'; form-action 'self'; base-uri 'none'";

app.get('/:shareId', async (c) => {
	const shareId = c.req.param('shareId');
	if (!SAFE_ID.test(shareId)) return c.text('Not found', 404);
	const a = await getSharedApp(c.env, shareId);
	if (!a) {
		return c.html('<!DOCTYPE html><meta charset="utf-8"><body style="font:15px system-ui;padding:32px;color:#2a2520;background:#f7f3e8"><h2>This link is no longer available.</h2></body>', 404);
	}
	// Write-only token, scoped to THIS form, embedded in the public page.
	const token = await signUiToken(`submit:${shareId}`, 60 * 60 * 24 * 30, await getEffectiveBearer(c.env), Date.now());
	const submitUrl = `${new URL(c.req.url).origin}/c/${shareId}/submit`;
	const bridge = `<script>window.ot=(function(){var U=${JSON.stringify(submitUrl)},H={'Authorization':'Bearer '+${JSON.stringify(token)},'Content-Type':'application/json'};return{submit:function(d){return fetch(U,{method:'POST',headers:H,body:JSON.stringify(d)});}};})();</script>`;
	let html = a.html;
	html = html.includes('</head>') ? html.replace('</head>', `${bridge}</head>`) : bridge + html;
	c.header('Content-Security-Policy', APP_CSP);
	return c.html(html);
});

app.post('/:shareId/submit', async (c) => {
	const shareId = c.req.param('shareId');
	if (!SAFE_ID.test(shareId)) return c.json({ error: 'not found' }, 404);
	if (!(await selfAuth(c.env, c.req.header('authorization'), `submit:${shareId}`))) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const a = await getSharedApp(c.env, shareId);
	if (!a) return c.json({ error: 'not found' }, 404);
	const body = await c.req.text();
	if (body.length > 64 * 1024) return c.json({ error: 'too large' }, 413);
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(body) as Record<string, unknown>;
	} catch {
		return c.json({ error: 'body must be JSON' }, 400);
	}
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const lines = Object.entries(data)
		.map(([k, v]) => `- **${k}:** ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
		.join('\n');
	const md = `# Response to "${a.name}"\n\nReceived ${new Date().toISOString()} via shared link \`${shareId}\`.\n\n${lines}\n`;
	await c.env.FILES.put(`inbox/response-${shareId}-${ts}.md`, md, { httpMetadata: { contentType: 'text/markdown' } });
	return c.json({ ok: true });
});

export const shareAppRoutes = app;
