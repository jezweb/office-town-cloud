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
nav { display: flex; gap: 1rem; margin-top: 0.5rem; }
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

	const content = `
<h1 style="margin-top: 0;">Town overview</h1>
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
		.map(([k, v]) => `<tr><th>${k}</th><td>${String(v).replace(/</g, '&lt;')}</td></tr>`)
		.join('');

	const bodyMatch = MAIN_REGEX.exec(renderedBody);
	const innerBody = bodyMatch ? bodyMatch[1] : `<pre>${row.body.replace(/</g, '&lt;')}</pre>`;

	const content = `
<div style="margin-bottom: 1.5rem;"><a href="/dashboard/wiki?c=${row.collection}" style="color: var(--accent);">&larr; ${row.collection}</a></div>
<h1 style="margin-top: 0;">${row.title ?? row.slug}</h1>
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
