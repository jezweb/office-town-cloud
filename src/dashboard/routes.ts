// Dashboard — server-rendered HTML over wiki/files/cron/published.

import { Hono } from 'hono';
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
</div>`;
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
dashboardRoutes.get('/dashboard/connect', async (c) => {
	const reqUrl = new URL(c.req.url);
	const defaultWorkerUrl = `${reqUrl.protocol}//${reqUrl.host}`;

	// Server-side rendered with placeholders the JS replaces on the fly.
	// The bearer never round-trips through the server — pure browser-side
	// string assembly.
	const content = `
<h1 style="margin-top: 0;">Connect your Goose</h1>
<p class="muted">Wire all 6 Office Town MCPs into your local Goose installation with one paste.</p>

<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <label style="display: block; margin-bottom: 1rem;">
    <div style="font-weight: 600; margin-bottom: 0.25rem;">Worker URL</div>
    <div class="muted" style="font-size: 0.85em; margin-bottom: 0.4rem;">The URL of this deployment. Edit if you're configuring a different one.</div>
    <input id="worker-url" type="url" value="${defaultWorkerUrl}" style="width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.95em; font-family: ui-monospace, SFMono-Regular, monospace;">
  </label>

  <label style="display: block; margin-bottom: 1rem;">
    <div style="font-weight: 600; margin-bottom: 0.25rem;">MCP_BEARER_TOKEN</div>
    <div class="muted" style="font-size: 0.85em; margin-bottom: 0.4rem;">The token you set when deploying (or generate one with <code>openssl rand -hex 32</code>). Never leaves your browser.</div>
    <input id="bearer" type="text" placeholder="Paste your MCP_BEARER_TOKEN" autocomplete="off" spellcheck="false" style="width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.95em; font-family: ui-monospace, SFMono-Regular, monospace;">
  </label>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem;">
    <button id="copy-btn" type="button" onclick="copyScript()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy install script</button>
    <span id="copy-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="script" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.85em; overflow-x: auto; line-height: 1.45; max-height: 360px;"></pre>

  <p class="muted" style="margin-top: 1rem; font-size: 0.9em;">
    Paste the script into a terminal. It checks Goose is installed, then runs <code>goose mcp add</code> 6 times + <code>goose mcp disable memory</code>. Idempotent — safe to re-run.
  </p>
</div>

<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2>What gets installed</h2>
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
    "AUTH_HEADER=\"Authorization: Bearer $BEARER\"",
    "",
    "echo 'Disabling Goose built-in Memory — wiki MCP replaces it.'",
    "goose mcp disable memory 2>/dev/null || true",
    "",
  ];

  for (const name of MCPS) {
    lines.push("echo 'Adding office-town-" + name + " (" + name + " MCP)...'");
    lines.push("goose mcp add office-town-" + name + " \\\\");
    lines.push("  --transport streamable_http \\\\");
    lines.push("  --url \"$WORKER_URL/mcp/" + name + "\" \\\\");
    lines.push("  --header \"$AUTH_HEADER\"");
    lines.push("");
  }

  lines.push("echo ''");
  lines.push("echo '✓ All 6 Office Town MCPs wired into Goose.'");
  lines.push("echo '  Run: goose mcp list — to verify.'");
  lines.push("echo '  Then restart Goose Desktop or start a fresh CLI session.'");

  return lines.join("\\n");
}

function refreshScript() {
  document.getElementById('script').textContent = generateScript();
}

function copyScript() {
  const text = generateScript();
  const status = document.getElementById('copy-status');
  const btn = document.getElementById('copy-btn');
  navigator.clipboard.writeText(text).then(() => {
    status.textContent = '✓ Copied — paste into terminal';
    status.style.color = 'var(--green)';
    btn.style.background = 'var(--green)';
    setTimeout(() => { status.textContent = ''; btn.style.background = 'var(--accent)'; }, 2500);
  }).catch((err) => {
    status.textContent = 'Copy failed: ' + err.message;
    status.style.color = 'var(--red)';
  });
}

document.getElementById('worker-url').addEventListener('input', refreshScript);
document.getElementById('bearer').addEventListener('input', refreshScript);
refreshScript();
</script>`;
	return c.html(LAYOUT('Connect your Goose - Office Town', content));
});
