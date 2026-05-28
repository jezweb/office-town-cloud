// Dashboard — server-rendered HTML over wiki/files/cron/published.

import { Hono } from 'hono';
import { getEffectiveBearer } from '../auth/bearer';
import {
	buildSessionCookie,
	clearSessionCookie,
	isClaimed,
	markClaimed,
} from '../auth/dashboard-gate';
import { renderMarkdownToHtml } from '../publish/service';
import type { AppContext } from '../types';

export const dashboardRoutes = new Hono<AppContext>();

const MAIN_REGEX = /<main>([\s\S]*?)<\/main>/;

const LAYOUT = (title: string, content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root { --bg: #fafafa; --fg: #1a1a1a; --muted: #6b6b6b; --accent: #2563eb; --code: #f4f4f5; --border: #e5e7eb; --green: #16a34a; --red: #dc2626; --amber: #d97706; }
* { box-sizing: border-box; }
body { font: 15px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--fg); background: var(--bg); margin: 0; }
header { background: white; border-bottom: 1px solid var(--border); padding: 1rem 1.5rem; }
header h1 { margin: 0; font-size: 1.4rem; font-weight: 600; }
nav { display: flex; gap: 1rem; margin-top: 0.5rem; align-items: center; }
nav a { color: var(--accent); text-decoration: none; font-size: 0.9em; }
nav a:hover { text-decoration: underline; }
main { max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem; }
.grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.card { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; }
.card h2 { margin: 0 0 0.75rem; font-size: 1.05rem; font-weight: 600; }
.muted { color: var(--muted); }
.kpi { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.kpi > div { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; min-width: 140px; }
.kpi .label { color: var(--muted); font-size: 0.85em; margin-bottom: 0.25rem; }
.kpi .value { font-size: 1.5rem; font-weight: 600; }
.status-success { color: var(--green); }
.status-error { color: var(--red); }
.status-running { color: var(--amber); }
table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 500; }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #f3f4f6; color: var(--muted); font-size: 0.8em; }
</style>
</head>
<body>
<header>
  <h1>Office Town</h1>
  <nav>
    <a href="/">Home</a>
    <a href="/dashboard/wiki">Wiki</a>
    <a href="/dashboard/kanban">Kanban</a>
    <a href="/dashboard/cron">Routines</a>
    <a href="/dashboard/files">Files</a>
    <a href="/dashboard/published">Published</a>
    <a href="/dashboard/connect" style="margin-left: auto;">Connect Goose →</a>
    <a href="/dashboard/sign-out" style="color: var(--muted);">Sign out</a>
  </nav>
</header>
<main>${content}</main>
</body>
</html>`;

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// Linkify frontmatter values that reference other wiki entries.
//
// Two patterns:
//   1. Explicit "<collection>:<slug>"  -> direct link
//   2. Field-name conventions like *_slug, *_org, *_project where the value is
//      a bare slug -> link to the inferred collection.
//
// Strings that don't match either pattern are escaped + returned as text.

const COLLECTION_PATTERN = /^([a-z][a-z-]{1,30}):([a-z0-9][a-z0-9-]{0,99})$/;
const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,99}$/;

const FIELD_NAME_TO_COLLECTION: Array<{ match: RegExp; collection: string }> = [
	{ match: /(^|_)org(_slug)?$/, collection: 'orgs' },
	{ match: /^owner_org$/, collection: 'orgs' },
	{ match: /^client_slug$/, collection: 'orgs' },
	{ match: /^made_to$/, collection: 'orgs' },
	{ match: /^responsible$/, collection: 'team' },
	{ match: /^responsible_party$/, collection: 'team' },
	{ match: /(^|_)contact(_slug)?$/, collection: 'contacts' },
	{ match: /(^|_)project(_slug)?$/, collection: 'projects' },
	{ match: /^primary_contact_slug$/, collection: 'contacts' },
];

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function linkifyValue(key: string, raw: unknown): string {
	if (Array.isArray(raw)) {
		return raw.map((item) => linkifyValue(key, item)).join(', ');
	}
	if (typeof raw !== 'string') {
		return escapeHtml(JSON.stringify(raw));
	}

	const value = raw.trim();
	if (!value) return '';

	// Pattern 1: explicit "<collection>:<slug>"
	const explicit = COLLECTION_PATTERN.exec(value);
	if (explicit) {
		const [, coll, slug] = explicit;
		return `<a href="/dashboard/wiki/${escapeHtml(coll)}/${escapeHtml(slug)}">${escapeHtml(value)}</a>`;
	}

	// Pattern 2: field-name suggests a foreign key and value is slug-shaped
	if (SLUG_PATTERN.test(value)) {
		for (const rule of FIELD_NAME_TO_COLLECTION) {
			if (rule.match.test(key)) {
				return `<a href="/dashboard/wiki/${rule.collection}/${escapeHtml(value)}">${escapeHtml(value)}</a>`;
			}
		}
	}

	return escapeHtml(value);
}

dashboardRoutes.get('/', async (c) => {
	const env = c.env;

	const [entriesRes, cronJobsRes, publishedListing] = await Promise.all([
		env.DB.prepare(
			'SELECT collection, COUNT(*) AS n FROM wiki_entries GROUP BY collection ORDER BY n DESC'
		).all<{ collection: string; n: number }>(),
		env.DB.prepare('SELECT COUNT(*) AS n FROM cron_jobs WHERE enabled = 1').first<{ n: number }>(),
		env.FILES.list({ prefix: 'published-meta/', limit: 100 }),
	]);

	const totalEntries = (entriesRes.results ?? []).reduce((s, r) => s + r.n, 0);
	const collectionBreakdown = (entriesRes.results ?? [])
		.map(
			(r) =>
				`<tr><td><a href="/dashboard/wiki?c=${r.collection}">${r.collection}</a></td><td>${r.n}</td></tr>`
		)
		.join('');

	const recent = await env.DB.prepare(
		'SELECT collection, slug, title, updated_at FROM wiki_entries ORDER BY updated_at DESC LIMIT 6'
	).all<{ collection: string; slug: string; title: string | null; updated_at: string }>();
	const recentList = (recent.results ?? [])
		.map(
			(r) =>
				`<li><a href="/dashboard/wiki/${r.collection}/${r.slug}">${r.title ?? r.slug}</a> <span class="muted">in ${r.collection} · ${new Date(r.updated_at).toLocaleString()}</span></li>`
		)
		.join('');

	const noEntriesYet = totalEntries === 0;
	const connectCallout = noEntriesYet
		? `<div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(180deg, #eff6ff 0%, white 100%); border-color: var(--accent);">
  <h2 style="margin-top: 0;">First time here? Wire your Goose.</h2>
  <p style="margin: 0.5rem 0;">Nothing in the wiki yet. To start putting things into Office Town, connect your local Goose to this worker — one paste in a terminal wires all 6 MCPs.</p>
  <a href="/dashboard/connect" style="display: inline-block; margin-top: 0.5rem; padding: 0.5rem 1rem; background: var(--accent); color: white; border-radius: 6px; text-decoration: none; font-weight: 500;">Get the install script →</a>
</div>`
		: '';

	const content = `
${connectCallout}<h1 style="margin-top: 0;">Town overview</h1>
<div class="kpi" style="margin: 1rem 0 2rem;">
  <div><div class="label">Wiki entries</div><div class="value">${totalEntries}</div></div>
  <div><div class="label">Active routines</div><div class="value">${cronJobsRes?.n ?? 0}</div></div>
  <div><div class="label">Published pages</div><div class="value">${publishedListing.objects.length}</div></div>
</div>
<div class="grid">
  <div class="card">
    <h2>Collections</h2>
    <table>${collectionBreakdown || '<tr><td class="muted">No entries yet</td></tr>'}</table>
  </div>
  <div class="card">
    <h2>Recently updated</h2>
    <ul style="margin: 0; padding-left: 1.2rem;">${recentList || '<li class="muted">Nothing yet</li>'}</ul>
  </div>
</div>
<p class="muted" style="margin-top: 2rem; font-size: 0.9em;">
  Running on <code>${new URL(c.req.url).host}</code>.
  <span style="display: inline-block; margin: 0 0.5rem;">·</span>
  Want a custom domain like <code>yourbiz.town</code>? <a href="/dashboard/wire-domain">~60 sec in CF dashboard →</a>
  <span style="display: inline-block; margin: 0 0.5rem;">·</span>
  Team deployment? <a href="/dashboard/wire-google-signin">Wire Google sign-in (v1.2 prep) →</a>
</p>`;
	return c.html(LAYOUT('Office Town - Dashboard', content));
});

dashboardRoutes.get('/dashboard/wiki', async (c) => {
	const collection = c.req.query('c');
	const rows = collection
		? await c.env.DB.prepare(
				'SELECT collection, slug, title, updated_at, last_change_summary FROM wiki_entries WHERE collection = ? ORDER BY updated_at DESC LIMIT 200'
			).bind(collection).all<{ collection: string; slug: string; title: string | null; updated_at: string; last_change_summary: string | null }>()
		: await c.env.DB.prepare(
				'SELECT collection, slug, title, updated_at, last_change_summary FROM wiki_entries ORDER BY updated_at DESC LIMIT 200'
			).all<{ collection: string; slug: string; title: string | null; updated_at: string; last_change_summary: string | null }>();

	const heading = collection ? `Wiki - ${collection}` : 'Wiki - all entries';
	const entries = (rows.results ?? [])
		.map(
			(r) =>
				`<tr>
<td><a href="/dashboard/wiki/${r.collection}/${r.slug}">${r.title ?? r.slug}</a></td>
<td><span class="tag">${r.collection}</span></td>
<td class="muted">${new Date(r.updated_at).toLocaleString()}</td>
<td class="muted">${(r.last_change_summary ?? '').replace(/</g, '&lt;')}</td>
</tr>`
		)
		.join('');

	const content = `
<h1 style="margin-top: 0;">${heading}</h1>
<div class="card">
  <table>
    <thead><tr><th>Title</th><th>Collection</th><th>Updated</th><th>Last change</th></tr></thead>
    <tbody>${entries || '<tr><td colspan="4" class="muted">No entries</td></tr>'}</tbody>
  </table>
</div>`;
	return c.html(LAYOUT('Wiki', content));
});

dashboardRoutes.get('/dashboard/wiki/:collection/:slug', async (c) => {
	const collection = c.req.param('collection');
	const slug = c.req.param('slug');
	const row = await c.env.DB.prepare(
		'SELECT collection, slug, title, body, frontmatter_json, updated_at FROM wiki_entries WHERE id = ?'
	)
		.bind(`${collection}:${slug}`)
		.first<{ collection: string; slug: string; title: string | null; body: string; frontmatter_json: string; updated_at: string }>();
	if (!row) return c.html(LAYOUT('Not found', '<h1>Not found</h1>'), 404);

	const frontmatter = JSON.parse(row.frontmatter_json) as Record<string, unknown>;
	const renderedBody = renderMarkdownToHtml(row.body, row.title ?? row.slug);
	const fmRows = Object.entries(frontmatter)
		.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${linkifyValue(k, v)}</td></tr>`)
		.join('');

	const bodyMatch = MAIN_REGEX.exec(renderedBody);
	const innerBody = bodyMatch ? bodyMatch[1] : `<pre>${row.body.replace(/</g, '&lt;')}</pre>`;

	const content = `
<nav class="muted" style="margin-bottom: 1rem; font-size: 0.9em;">
  <a href="/" style="color: var(--accent);">Home</a> ›
  <a href="/dashboard/wiki" style="color: var(--accent);">Wiki</a> ›
  <a href="/dashboard/wiki?c=${row.collection}" style="color: var(--accent);">${row.collection}</a> ›
  <span>${escapeHtml(row.slug)}</span>
</nav>
<h1 style="margin-top: 0;">${escapeHtml(row.title ?? row.slug)}</h1>
<div class="card" style="margin-bottom: 1.5rem;">
  <h2>Frontmatter</h2>
  <table>${fmRows}</table>
</div>
<div class="card">
  <h2>Body</h2>
  <div>${innerBody}</div>
</div>`;
	return c.html(LAYOUT(row.title ?? row.slug, content));
});

dashboardRoutes.get('/dashboard/cron', async (c) => {
	const jobs = await c.env.DB.prepare(
		'SELECT id, slug, title, frequency, last_run_at, next_run_at, last_status, enabled FROM cron_jobs ORDER BY next_run_at ASC'
	).all<{ id: string; slug: string; title: string; frequency: string; last_run_at: string | null; next_run_at: string | null; last_status: string | null; enabled: number }>();

	const rows = (jobs.results ?? [])
		.map(
			(j) =>
				`<tr>
<td><strong>${j.title}</strong><br><span class="muted">${j.slug}</span></td>
<td><span class="tag">${j.frequency}</span></td>
<td>${j.next_run_at ? new Date(j.next_run_at).toLocaleString() : '<span class="muted">-</span>'}</td>
<td>${j.last_run_at ? new Date(j.last_run_at).toLocaleString() : '<span class="muted">-</span>'}</td>
<td class="${j.last_status ? 'status-' + j.last_status : ''}">${j.last_status ?? '-'}</td>
<td>${j.enabled ? 'enabled' : 'paused'}</td>
</tr>`
		)
		.join('');

	const content = `
<h1 style="margin-top: 0;">Routines</h1>
<div class="card">
  <table>
    <thead><tr><th>Title</th><th>Frequency</th><th>Next</th><th>Last</th><th>Status</th><th>State</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No routines scheduled</td></tr>'}</tbody>
  </table>
</div>`;
	return c.html(LAYOUT('Routines', content));
});

dashboardRoutes.get('/dashboard/files', async (c) => {
	const listing = await c.env.FILES.list({ prefix: 'files/', limit: 500 });
	const rows = listing.objects
		.map(
			(f) =>
				`<tr>
<td>${f.key.replace(/^files\//, '')}</td>
<td>${(f.httpMetadata?.contentType ?? '').replace(/</g, '&lt;')}</td>
<td>${formatBytes(f.size)}</td>
<td class="muted">${f.uploaded.toLocaleString()}</td>
</tr>`
		)
		.join('');

	const content = `
<h1 style="margin-top: 0;">Files</h1>
<div class="card">
  <table>
    <thead><tr><th>Path</th><th>Type</th><th>Size</th><th>Uploaded</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="muted">No files</td></tr>'}</tbody>
  </table>
</div>`;
	return c.html(LAYOUT('Files', content));
});

dashboardRoutes.get('/dashboard/published', async (c) => {
	const listing = await c.env.FILES.list({ prefix: 'published-meta/', limit: 100 });
	const pages = await Promise.all(
		listing.objects.map(async (obj) => {
			const meta = await c.env.FILES.get(obj.key);
			if (!meta) return null;
			return await meta.json<{ slug: string; title: string; visibility: string; updated_at: string }>();
		})
	);
	const rows = pages
		.filter((p): p is NonNullable<typeof p> => p !== null)
		.map(
			(p) =>
				`<tr>
<td><a href="/p/${p.slug}">${p.title}</a></td>
<td><span class="tag">${p.visibility}</span></td>
<td class="muted">${new Date(p.updated_at).toLocaleString()}</td>
</tr>`
		)
		.join('');

	const content = `
<h1 style="margin-top: 0;">Published pages</h1>
<div class="card">
  <table>
    <thead><tr><th>Title</th><th>Visibility</th><th>Updated</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3" class="muted">Nothing published yet</td></tr>'}</tbody>
  </table>
</div>`;
	return c.html(LAYOUT('Published', content));
});

dashboardRoutes.get('/dashboard/kanban', async (c) => {
	const rows = await c.env.DB.prepare(
		`SELECT id, collection, slug, title, frontmatter_json FROM wiki_entries WHERE id LIKE 'tasks:%' OR frontmatter_json LIKE '%"kind":"task"%' OR frontmatter_json LIKE '%"kind": "task"%' ORDER BY updated_at DESC LIMIT 500`
	).all<{ id: string; collection: string; slug: string; title: string | null; frontmatter_json: string }>();

	const tasks = (rows.results ?? []).map((r) => ({
		id: r.id,
		collection: r.collection,
		slug: r.slug,
		title: r.title ?? r.slug,
		status: ((JSON.parse(r.frontmatter_json) as Record<string, unknown>).status as string) ?? 'open',
	}));

	const lanes: Record<string, typeof tasks> = { open: [], in_progress: [], blocked: [], done: [] };
	for (const t of tasks) {
		const lane = lanes[t.status] ? t.status : 'open';
		lanes[lane].push(t);
	}

	const renderLane = (label: string, status: string) => `
<div class="card">
  <h2>${label} <span class="muted">(${lanes[status].length})</span></h2>
  ${lanes[status]
		.map(
			(t) => `<div style="border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem;">
<a href="/dashboard/wiki/${t.collection}/${t.slug}">${t.title}</a>
<div class="muted" style="font-size: 0.85em; margin-top: 0.25rem;">${t.collection}</div>
</div>`
		)
		.join('') || '<p class="muted">Empty</p>'}
</div>`;

	const content = `
<h1 style="margin-top: 0;">Kanban</h1>
<p class="muted">Showing wiki entries with <code>kind: task</code>, grouped by frontmatter <code>status</code>.</p>
<div class="grid" style="grid-template-columns: repeat(4, 1fr);">
  ${renderLane('Open', 'open')}
  ${renderLane('In Progress', 'in_progress')}
  ${renderLane('Blocked', 'blocked')}
  ${renderLane('Done', 'done')}
</div>`;
	return c.html(LAYOUT('Kanban', content));
});

// /dashboard/connect — one-paste install for the 6 MCPs.
//
// Renders a form: worker URL (prefilled from request host) + bearer token
// (user pastes). JS regenerates a shell script on input change. One copy
// button copies the script — user pastes into terminal, all 6 MCPs wired.
//
// We don't use goose:// deeplinks because their streamable_http format
// doesn't accept a headers/Authorization parameter (verified against
// goose-docs.ai 2026-05-28), so deeplinks would only register the URL and
// leave the user to manually add the bearer.
// Helper — does the request carry a valid session cookie?
function hasValidSession(cookieHeader: string | null, expected: string): boolean {
	if (!cookieHeader) return false;
	for (const part of cookieHeader.split(';')) {
		const [k, ...rest] = part.trim().split('=');
		if (k === 'ot_session') {
			return decodeURIComponent(rest.join('=').trim()) === expected;
		}
	}
	return false;
}

dashboardRoutes.get('/dashboard/connect', async (c) => {
	const reqUrl = new URL(c.req.url);
	const defaultWorkerUrl = `${reqUrl.protocol}//${reqUrl.host}`;

	const effectiveBearer = await getEffectiveBearer(c.env);
	const claimed = await isClaimed(c.env);
	const signedIn = hasValidSession(c.req.header('cookie') ?? null, effectiveBearer);

	// THREE STATES:
	//
	//   1. claimed + signed-in       → full page (bearer prefilled, install script)
	//   2. claimed + NOT signed-in   → sign-in form ("paste bearer to continue")
	//   3. NOT claimed (fresh deploy) → first-claim flow (shows bearer + "Claim" button)

	if (claimed && !signedIn) {
		// State 2 — sign-in form. Don't reveal the stored bearer.
		const flash = reqUrl.searchParams.get('error') === '1'
			? `<p style="color: var(--red); margin: 0.5rem 0;">That bearer didn't match. Try again, or run <code>wrangler secret put MCP_BEARER_TOKEN</code> to rotate.</p>`
			: '';
		const signinContent = `
<h1 style="margin-top: 0;">Sign in to your Office Town</h1>
<p class="muted">This install is claimed. Paste your MCP bearer token to continue.</p>

<div class="card" style="max-width: 520px; margin-top: 1.5rem;">
  <form method="POST" action="/dashboard/claim">
    <label style="display: block; margin-bottom: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.25rem;">MCP bearer token</div>
      <div class="muted" style="font-size: 0.85em; margin-bottom: 0.4rem;">The token you saved when you first deployed. Lost it? Run <code>wrangler secret put MCP_BEARER_TOKEN</code> to set a new one of your choice.</div>
      <input name="bearer" type="password" autocomplete="off" spellcheck="false" required autofocus style="width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.95em; font-family: ui-monospace, SFMono-Regular, monospace;">
    </label>
    ${flash}
    <button type="submit" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Sign in</button>
  </form>
</div>`;
		return c.html(LAYOUT('Sign in - Office Town', signinContent));
	}

	// State 1 or 3 — show the install page. In state 3 (fresh deploy)
	// the page also renders a "Claim this install" banner at the top
	// so the user knows future visits will require sign-in.

	const claimBanner = !claimed
		? `
<div class="card" style="max-width: 800px; margin-bottom: 1.5rem; background: linear-gradient(180deg, #fef3c7 0%, white 100%); border-color: var(--amber);">
  <h2 style="margin-top: 0; color: var(--amber);">Claim this install</h2>
  <p style="margin: 0.5rem 0;">This deployment isn't claimed yet — anyone with the URL can see the bearer above. Click below to lock it down so future visits require sign-in.</p>
  <form method="POST" action="/dashboard/claim" style="margin-top: 0.75rem;">
    <input type="hidden" name="bearer" value="${effectiveBearer}">
    <button type="submit" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--amber); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Claim &amp; secure the dashboard →</button>
  </form>
</div>`
		: '';

	const content = `${claimBanner}
<h1 style="margin-top: 0;">Connect your Goose</h1>
<p class="muted">Wire all 6 Office Town MCPs into your local Goose installation. Pick the path that suits you — both copyable, both auditable.</p>

<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <label style="display: block; margin-bottom: 1rem;">
    <div style="font-weight: 600; margin-bottom: 0.25rem;">Worker URL</div>
    <div class="muted" style="font-size: 0.85em; margin-bottom: 0.4rem;">The URL of this deployment. Edit if you're configuring a different one.</div>
    <input id="worker-url" type="url" value="${defaultWorkerUrl}" style="width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.95em; font-family: ui-monospace, SFMono-Regular, monospace;">
  </label>

  <label style="display: block; margin-bottom: 1rem;">
    <div style="font-weight: 600; margin-bottom: 0.25rem;">MCP bearer token <span class="muted" style="font-weight: normal;">— save this somewhere</span></div>
    <div class="muted" style="font-size: 0.85em; margin-bottom: 0.4rem;">
      This token doubles as your <strong>dashboard sign-in password</strong>. If you visit from a new browser or your session expires, you'll need to paste this into the sign-in form. Save it to your password manager now.
      <br>To rotate later: <code>wrangler secret put MCP_BEARER_TOKEN</code> with a value of your choice.
    </div>
    <input id="bearer" type="text" value="${effectiveBearer}" autocomplete="off" spellcheck="false" style="width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.95em; font-family: ui-monospace, SFMono-Regular, monospace;">
  </label>
</div>

<!-- OPTION A — shell script for the goose CLI -->
<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Option A — paste a shell script into your terminal</h2>
  <p style="margin: 0.5rem 0;" class="muted">Recommended if you have <code>goose</code> on your <code>PATH</code>. The script checks Goose is installed, then runs <code>goose mcp disable memory</code> + <code>goose mcp add</code> × 6. Idempotent — safe to re-run.</p>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 0.75rem 0;">
    <button id="copy-btn" type="button" onclick="copyScript()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy shell script</button>
    <span id="copy-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="script" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.85em; overflow-x: auto; line-height: 1.45; max-height: 360px;"></pre>
</div>

<!-- OPTION B — natural-language agent prompt for Claude Code / Goose itself / Aider / Cline -->
<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Option B — paste this prompt into a capable AI agent</h2>
  <p style="margin: 0.5rem 0;" class="muted">Use this if you'd rather have your existing agent (Claude Code, Goose itself, Aider, Cline) wire things up. The agent reads the prompt, runs the same <code>goose mcp add</code> commands, smoke-tests, and reports back. Full prompt below — read before pasting.</p>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 0.75rem 0;">
    <button id="copy-prompt-btn" type="button" onclick="copyPrompt()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy agent prompt</button>
    <span id="copy-prompt-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="agent-prompt" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.85em; overflow-x: auto; line-height: 1.45; max-height: 500px; white-space: pre-wrap; word-break: break-word;"></pre>
</div>

<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2>What gets installed</h2>
  <p class="muted" style="font-size: 0.9em; margin: 0.25rem 0 0.75rem;">Both options above do the same thing — these are the 6 MCP servers that get wired into your Goose. Each one points at this worker; auth uses the bearer above.</p>
  <table style="margin-top: 0.5rem;">
    <thead><tr><th>MCP</th><th>Endpoint</th><th>What it does</th></tr></thead>
    <tbody>
      <tr><td><code>office-town-wiki</code></td><td><code>/mcp/wiki</code></td><td>Team wiki + replaces Goose Memory (22 actions)</td></tr>
      <tr><td><code>office-town-files</code></td><td><code>/mcp/files</code></td><td>Files + share + publish + AI conversion + browser + image-gen + TTS (14 actions)</td></tr>
      <tr><td><code>office-town-email</code></td><td><code>/mcp/email</code></td><td>Outbound email via Cloudflare Email Routing (2 actions)</td></tr>
      <tr><td><code>office-town-cron</code></td><td><code>/mcp/cron</code></td><td>Recurring agent work + one-off scheduled jobs (7 actions)</td></tr>
      <tr><td><code>office-town-voice</code></td><td><code>/mcp/voice</code></td><td>STT/TTS today, voice rooms in v1.2 (6 actions, 3 stubbed)</td></tr>
      <tr><td><code>office-town-sandbox</code></td><td><code>/mcp/sandbox</code></td><td>Sandboxed code execution — Python/Node/TS/Bash (6 actions)</td></tr>
    </tbody>
  </table>
</div>

<script>
const MCPS = ['wiki', 'files', 'email', 'cron', 'voice', 'sandbox'];

function escapeShell(s) {
  // single-quote, escape embedded singles via the close-escape-reopen pattern
  return "'" + s.replace(/'/g, "'\\\\''") + "'";
}

function generateScript() {
  const url = document.getElementById('worker-url').value.replace(/\\/+$/, '');
  const bearer = document.getElementById('bearer').value.trim();
  const urlSafe = url || 'https://YOUR-WORKER-URL.workers.dev';
  const bearerSafe = bearer || 'YOUR_MCP_BEARER_TOKEN';

  const lines = [
    "#!/usr/bin/env bash",
    "# Office Town — wire all 6 MCPs into the local Goose installation.",
    "# Generated from " + window.location.href,
    "set -euo pipefail",
    "",
    "if ! command -v goose >/dev/null 2>&1; then",
    "  echo 'Goose is not installed. Install from https://block.github.io/goose/ first.' >&2",
    "  exit 1",
    "fi",
    "",
    "WORKER_URL=" + escapeShell(urlSafe),
    "BEARER=" + escapeShell(bearerSafe),
    'AUTH_HEADER="Authorization: Bearer $BEARER"',
    "",
    "echo 'Disabling Goose built-in Memory — wiki MCP replaces it.'",
    "goose mcp disable memory 2>/dev/null || true",
    "",
  ];

  for (const name of MCPS) {
    lines.push("echo 'Adding office-town-" + name + " (" + name + " MCP)...'");
    lines.push("goose mcp add office-town-" + name + " \\\\");
    lines.push("  --transport streamable_http \\\\");
    lines.push('  --url "$WORKER_URL/mcp/' + name + '" \\\\');
    lines.push('  --header "$AUTH_HEADER"');
    lines.push("");
  }

  lines.push("echo ''");
  lines.push("echo '✓ All 6 Office Town MCPs wired into Goose.'");
  lines.push("echo '  Run: goose mcp list — to verify.'");
  lines.push("echo '  Then restart Goose Desktop or start a fresh CLI session.'");

  return lines.join("\\n");
}

function generateAgentPrompt() {
  const url = document.getElementById('worker-url').value.replace(/\\/+$/, '');
  const bearer = document.getElementById('bearer').value.trim();
  const urlSafe = url || 'https://YOUR-WORKER-URL.workers.dev';
  const bearerSafe = bearer || 'YOUR_MCP_BEARER_TOKEN';

  return [
    "I want to add Office Town capabilities to my Goose installation.",
    "",
    "Office Town is a Cloudflare-hosted backend that gives Goose 6 MCP servers",
    "(wiki, files, email, cron, voice, sandbox) plus a team wiki that replaces",
    "Goose's built-in Memory extension.",
    "",
    "Worker URL:  " + urlSafe,
    "MCP bearer:  " + bearerSafe,
    "",
    "GROUND RULES:",
    "- Be transparent. Tell me what you're about to do before running anything.",
    "- Ask before destructive ops or installing software.",
    "- If goose CLI is not installed: stop and point me at https://block.github.io/goose/",
    "- Don't echo the bearer back to me anywhere it could be logged.",
    "- This wiring touches only my local Goose config — no Cloudflare changes needed.",
    "",
    "STEPS:",
    "",
    "1. Verify Goose is installed:",
    "     goose --version",
    "   If missing, stop and direct me to https://block.github.io/goose/",
    "",
    "2. Verify the deployment URL is reachable:",
    "     curl -s " + urlSafe + "/health",
    '   Should return {"status":"ok","service":"office-town",...}',
    "",
    "3. Disable Goose's built-in Memory extension (wiki MCP replaces it):",
    "     goose mcp disable memory",
    "",
    "4. Wire all 6 Office Town MCPs. Same bearer for all six:",
    "",
    "     for name in wiki files email cron voice sandbox; do",
    "       goose mcp add office-town-$name \\\\",
    "         --transport streamable_http \\\\",
    "         --url " + urlSafe + "/mcp/$name \\\\",
    '         --header "Authorization: Bearer ' + bearerSafe + '"',
    "     done",
    "",
    "5. Verify all 6 MCPs registered:",
    "     goose mcp list",
    "   Should show office-town-{wiki,files,email,cron,voice,sandbox}",
    "",
    "6. Smoke test — in a fresh Goose chat:",
    "     wiki(action: 'list', collection: 'contacts')",
    "   Should return cleanly (empty list is fine for a new install).",
    "",
    "7. Report back with:",
    "     - Whether all 6 MCPs registered cleanly",
    "     - The smoke-test result",
    "     - Anything that went sideways",
    "",
    "CONSTRAINTS:",
    "- Don't install a different agent host. Goose is the host.",
    "- Don't run wrangler / touch Cloudflare from this prompt — the deploy is done.",
    "- All 6 MCPs use streamable_http transport with the same Authorization header.",
  ].join("\\n");
}

function refreshScript() {
  document.getElementById('script').textContent = generateScript();
  document.getElementById('agent-prompt').textContent = generateAgentPrompt();
}

function makeCopier(buttonId, statusId, generator, successMsg) {
  return function() {
    const text = generator();
    const status = document.getElementById(statusId);
    const btn = document.getElementById(buttonId);
    navigator.clipboard.writeText(text).then(() => {
      status.textContent = successMsg;
      status.style.color = 'var(--green)';
      btn.style.background = 'var(--green)';
      setTimeout(() => { status.textContent = ''; btn.style.background = 'var(--accent)'; }, 2500);
    }).catch((err) => {
      status.textContent = 'Copy failed: ' + err.message;
      status.style.color = 'var(--red)';
    });
  };
}

const copyScript = makeCopier('copy-btn', 'copy-status', generateScript, '✓ Copied — paste into terminal');
const copyPrompt = makeCopier('copy-prompt-btn', 'copy-prompt-status', generateAgentPrompt, '✓ Copied — paste into your AI agent');

document.getElementById('worker-url').addEventListener('input', refreshScript);
document.getElementById('bearer').addEventListener('input', refreshScript);
refreshScript();
</script>`;
	return c.html(LAYOUT('Connect your Goose - Office Town', content));
});

// Claim/sign-in POST. Accepts the bearer in a form field, validates against
// the effective bearer, sets the httpOnly cookie + marks the install
// claimed (idempotent), then redirects to the dashboard home.
dashboardRoutes.post('/dashboard/claim', async (c) => {
	const formData = await c.req.formData();
	const submitted = (formData.get('bearer') ?? '').toString().trim();
	const effective = await getEffectiveBearer(c.env);
	if (!submitted || submitted !== effective) {
		return c.redirect('/dashboard/connect?error=1', 302);
	}
	await markClaimed(c.env);
	c.header('Set-Cookie', buildSessionCookie(effective));
	return c.redirect('/', 302);
});

// Sign-out — clear the cookie + send back to sign-in.
dashboardRoutes.get('/dashboard/sign-out', async (c) => {
	c.header('Set-Cookie', clearSessionCookie());
	return c.redirect('/dashboard/connect', 302);
});

// Custom-domain wiring guide — pure docs, no API. Walks the user
// through the ~60 seconds of clicks in the Cloudflare dashboard to
// point a custom domain at this worker. Optional — workers.dev URL
// works fine; this is a "make it yours" bonus path.
dashboardRoutes.get('/dashboard/wire-domain', async (c) => {
	const reqUrl = new URL(c.req.url);
	const workerHost = reqUrl.host;
	// Try to extract the worker name from the host (e.g. `office-town`
	// from `office-town.jezweb.workers.dev`). Falls back to a placeholder
	// if the user has already attached a custom domain and we can't see
	// the workers.dev hostname from here.
	const workerName = workerHost.endsWith('.workers.dev')
		? workerHost.split('.')[0]
		: 'office-town';

	const content = `
<h1 style="margin-top: 0;">Wire a custom domain</h1>
<p class="muted">Optional. Your worker already runs at <code>${workerHost}</code> — this guide adds a friendlier address like <code>town.example.com</code> or <code>yourbiz.town</code>.</p>

<div class="card" style="max-width: 760px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">~60 seconds, three clicks</h2>
  <ol style="line-height: 1.7; padding-left: 1.2rem;">
    <li>
      <strong>Get a domain (skip if you have one).</strong><br>
      <a href="https://dash.cloudflare.com/?to=/:account/domains/register" target="_blank" rel="noopener">Register one through Cloudflare →</a>
      <span class="muted">— <code>.town</code> is ~$30/yr and reads beautifully for an Office Town deployment. Or transfer in any existing domain.</span>
    </li>
    <li style="margin-top: 0.75rem;">
      <strong>Add the domain to your Cloudflare account</strong> (auto-done if you registered via step 1).<br>
      <a href="https://dash.cloudflare.com/?to=/:account" target="_blank" rel="noopener">Cloudflare dashboard → Websites → Add a site →</a>
    </li>
    <li style="margin-top: 0.75rem;">
      <strong>Attach the domain to this worker.</strong><br>
      Go to <a href="https://dash.cloudflare.com/?to=/:account/workers/services/view/${workerName}/production/domains-and-routes" target="_blank" rel="noopener">Workers → ${workerName} → Domains &amp; Routes →</a> click <em>Add → Custom Domain</em> and paste your domain (e.g. <code>town.yourbiz.com</code> or <code>yourbiz.town</code>).
    </li>
  </ol>
  <p style="margin-top: 1rem; font-size: 0.9em;" class="muted">
    Cloudflare auto-provisions an SSL cert and routes the domain to this worker. DNS propagates in seconds when the domain is on Cloudflare. After that, point Goose at the new URL via <a href="/dashboard/connect">/dashboard/connect</a> — the install script regenerates with the new URL.
  </p>
</div>

<div class="card" style="max-width: 760px; margin-top: 1.5rem; background: #f8fafc;">
  <h2 style="margin-top: 0;">Why bother?</h2>
  <ul style="line-height: 1.65; margin-top: 0.5rem;">
    <li><strong>Memorable URL</strong> — <code>jezweb.town</code> beats <code>office-town-x9k2.jezweb.workers.dev</code> in your address bar.</li>
    <li><strong>Stable across redeploys</strong> — the workers.dev URL is fine, but if you ever rename the worker or move accounts, your Goose config breaks. Custom domains travel with you.</li>
    <li><strong>Team-shaped feel</strong> — typing <code>@boss</code> at <code>acme.town</code> just hits different.</li>
  </ul>
</div>

<div class="card" style="max-width: 760px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Doesn't change anything else</h2>
  <p style="margin: 0.5rem 0;">
    The MCP bearer, the dashboard session cookie, the wiki content — all unchanged. The only thing to redo is the Goose MCP wiring (because the URL changes), and that's just running the install script from <a href="/dashboard/connect">/dashboard/connect</a> one more time.
  </p>
</div>`;

	return c.html(LAYOUT('Wire a custom domain - Office Town', content));
});

// Google sign-in setup guide — pure docs, mirrors /dashboard/wire-domain.
// The actual Google OAuth flow lands in v1.2 (needs better-auth provider
// wiring + sign-in button). This page lets users prep credentials NOW so
// they're ready when the feature ships. Bearer-claim auth keeps working
// either way — Google sign-in is additive, not a replacement.
dashboardRoutes.get('/dashboard/wire-google-signin', async (c) => {
	const reqUrl = new URL(c.req.url);
	const workerHost = reqUrl.host;
	const redirectUri = `${reqUrl.protocol}//${workerHost}/api/auth/callback/google`;

	const agentPrompt = [
		"Help me set up Google sign-in for my Office Town dashboard. I want team members",
		"on my domain to be able to sign in with their Google accounts, in addition to the",
		"bearer-claim flow.",
		"",
		"Worker URL:    " + reqUrl.protocol + "//" + workerHost,
		"Redirect URI:  " + redirectUri,
		"",
		"GROUND RULES:",
		"- I'll get the Google credentials myself from console.cloud.google.com — don't",
		"  try to do that for me.",
		"- You'll help me set the 3 secrets via wrangler secret put once I have the values.",
		"- Don't echo any secrets back to me anywhere they could be logged.",
		"",
		"STEPS YOU'LL WALK ME THROUGH:",
		"",
		"1. I create an OAuth 2.0 Client ID at console.cloud.google.com/apis/credentials:",
		"     - Application type: Web application",
		"     - Name: anything (e.g. \"Office Town - " + workerHost + "\")",
		"     - Authorized redirect URI: " + redirectUri,
		"   Google gives me a Client ID + Client Secret.",
		"",
		"2. I decide which email domains can sign in. Comma-separated, e.g.",
		"   \"jezweb.net,jezweb.com.au\". Empty = only the explicit allowlist applies",
		"   (which I haven't set yet so empty = nobody can sign in until I fix this).",
		"",
		"3. You walk me through running these three commands locally (I have wrangler):",
		"     wrangler secret put GOOGLE_CLIENT_ID       # paste the ID from step 1",
		"     wrangler secret put GOOGLE_CLIENT_SECRET   # paste the secret from step 1",
		"     wrangler secret put BETTER_AUTH_SECRET     # generate with: openssl rand -hex 32",
		"   And help me set ALLOWED_AUTH_DOMAINS — either by editing wrangler.jsonc",
		"   vars or via secret put (whichever the worker reads).",
		"",
		"4. Confirm the worker re-deploys to pick up the new secrets.",
		"",
		"5. Open https://" + workerHost + "/dashboard/connect from an incognito browser",
		"   to test the sign-in flow once v1.2 ships the actual Google button. Until then",
		"   credentials are stored but the bearer-claim flow is still the active path.",
		"",
		"CONSTRAINTS:",
		"- Don't touch the existing bearer / claim flow — Google sign-in is additive.",
		"- If something fails, stop and tell me — don't paper over credential errors.",
	].join('\n');

	const content = `
<h1 style="margin-top: 0;">Wire Google sign-in (team mode)</h1>
<p class="muted">Optional. By default the dashboard uses bearer-as-password (claim-on-first-visit). This adds Google OAuth so team members on your email domain can sign in with their Google accounts — without sharing the bearer.</p>

<div class="card" style="max-width: 760px; margin-top: 1.5rem; background: linear-gradient(180deg, #fef3c7 0%, white 100%); border-color: var(--amber);">
  <h2 style="margin-top: 0; color: var(--amber);">v1.2 prep — credentials only</h2>
  <p style="margin: 0.5rem 0;">The actual Google sign-in button on the dashboard lands in v1.2. This guide lets you <strong>get your credentials ready now</strong> via <code>wrangler secret put</code>. Once you set them, the worker is configured — the feature flips on automatically when v1.2 deploys.</p>
  <p style="margin: 0.5rem 0;">Bearer-claim flow keeps working either way. Google sign-in is additive.</p>
</div>

<div class="card" style="max-width: 760px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">~3 minutes, three steps</h2>
  <ol style="line-height: 1.7; padding-left: 1.2rem;">
    <li>
      <strong>Create an OAuth 2.0 Client ID in Google Cloud Console.</strong><br>
      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Console → APIs &amp; Services → Credentials → Create Credentials → OAuth client ID</a>
      <ul style="margin-top: 0.5rem; font-size: 0.95em;">
        <li>Application type: <strong>Web application</strong></li>
        <li>Name: anything memorable (e.g. <code>Office Town - ${workerHost}</code>)</li>
        <li>Authorized redirect URI:<br>
          <code style="background: var(--code); padding: 2px 6px; border-radius: 4px; user-select: all;">${redirectUri}</code>
          <button onclick="navigator.clipboard.writeText('${redirectUri}'); this.textContent='✓'; setTimeout(()=>this.textContent='Copy',1500);" style="margin-left: 0.5rem; padding: 2px 8px; font-size: 0.85em; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer;">Copy</button>
        </li>
      </ul>
      Google gives you a <strong>Client ID</strong> and a <strong>Client Secret</strong> on the next screen. Keep them handy.
    </li>

    <li style="margin-top: 0.75rem;">
      <strong>Decide your email-domain allow-list.</strong><br>
      Comma-separated email domains whose users can sign in. Example: <code>acme.com,acme.co.uk</code>. Anyone NOT on these domains gets rejected even if they have valid Google credentials.<br>
      <span class="muted" style="font-size: 0.9em;">Leave empty to disable Google sign-in entirely (the worker falls back to bearer-claim).</span>
    </li>

    <li style="margin-top: 0.75rem;">
      <strong>Set the three secrets via <code>wrangler secret put</code></strong> (from your local checkout of the repo):

      <pre style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.85em; line-height: 1.4; overflow-x: auto; margin-top: 0.5rem;">wrangler secret put GOOGLE_CLIENT_ID       <span class="muted">${'#'} paste the ID from step 1</span>
wrangler secret put GOOGLE_CLIENT_SECRET   <span class="muted">${'#'} paste the Secret from step 1</span>
wrangler secret put BETTER_AUTH_SECRET     <span class="muted">${'#'} generate with: openssl rand -hex 32</span></pre>

      And set <code>ALLOWED_AUTH_DOMAINS</code> — for now this is a <code>vars</code> entry in <code>wrangler.jsonc</code>, so edit that file and redeploy. v1.2 will move it to a dashboard-editable setting.
    </li>
  </ol>
</div>

<div class="card" style="max-width: 760px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Or have your agent do it</h2>
  <p class="muted" style="margin: 0.25rem 0 0.75rem;">Paste this prompt into Claude Code / Goose / Aider / Cline — your agent will walk you through the Google Console steps and run the <code>wrangler secret put</code> commands once you've got the credentials.</p>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 0.75rem 0;">
    <button id="copy-oauth-prompt-btn" type="button" onclick="copyOAuthPrompt()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy agent prompt</button>
    <span id="copy-oauth-prompt-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="oauth-prompt" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.85em; overflow-x: auto; line-height: 1.45; max-height: 500px; white-space: pre-wrap; word-break: break-word;"></pre>
</div>

<div class="card" style="max-width: 760px; margin-top: 1.5rem; background: #f8fafc;">
  <h2 style="margin-top: 0;">Why bother?</h2>
  <ul style="line-height: 1.65; margin-top: 0.5rem;">
    <li><strong>Team sign-in</strong> — no shared password. Each team member uses their own Google account. Rotating one person's access doesn't break everyone else.</li>
    <li><strong>Domain-scoped</strong> — only emails on your <code>ALLOWED_AUTH_DOMAINS</code> can sign in. Random Gmail users are rejected automatically.</li>
    <li><strong>Audit trail</strong> — sessions are logged with the user's email rather than just a bearer cookie. Useful for shared deployments.</li>
  </ul>
  <p class="muted" style="margin-top: 0.75rem; font-size: 0.9em;">
    Solo deployment? Stick with bearer-claim — it's fine, simpler, no Google Console trip needed.
  </p>
</div>

<script>
const OAUTH_PROMPT = ${JSON.stringify(agentPrompt)};
document.getElementById('oauth-prompt').textContent = OAUTH_PROMPT;

function copyOAuthPrompt() {
  const status = document.getElementById('copy-oauth-prompt-status');
  const btn = document.getElementById('copy-oauth-prompt-btn');
  navigator.clipboard.writeText(OAUTH_PROMPT).then(() => {
    status.textContent = '✓ Copied — paste into your AI agent';
    status.style.color = 'var(--green)';
    btn.style.background = 'var(--green)';
    setTimeout(() => { status.textContent = ''; btn.style.background = 'var(--accent)'; }, 2500);
  }).catch((err) => {
    status.textContent = 'Copy failed: ' + err.message;
    status.style.color = 'var(--red)';
  });
}
</script>`;

	return c.html(LAYOUT('Wire Google sign-in - Office Town', content));
});
