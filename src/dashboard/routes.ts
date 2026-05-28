// Dashboard — server-rendered HTML over wiki/files/cron/published.

import { Hono } from 'hono';
import { getEffectiveBearer } from '../auth/bearer';
import {
	buildSessionCookie,
	clearSessionCookie,
	isClaimed,
	markClaimed,
} from '../auth/dashboard-gate';
import { renderMarkdownBody, resolveWikilinks } from '../publish/service';
import type { AppContext } from '../types';
import { loadTownStats, renderTownView } from './town-view';
import { PROMPT_VARIANTS } from '../setup/prompts';

export const dashboardRoutes = new Hono<AppContext>();

const LAYOUT = (title: string, content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
/* Warm earth palette — same tokens used by the town view so the
 * dashboard feels like one continuous place. */
:root {
  --bg: #f7f3e8;
  --bg-warmer: #efe9d8;
  --fg: #2a2520;
  --ink-soft: #5a4f44;
  --muted: #8a7e6f;
  --accent: #c25e4f;
  --accent-deep: #8c4035;
  --code: #efe9d8;
  --border: #d8cdb4;
  --green: #4a7a3d;
  --red: #a83a2c;
  --amber: #b87333;
  --card-bg: #fffdf5;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100vh; }
body {
  font: 15px/1.55 'Iowan Old Style', 'Hoefler Text', Constantia, 'Lucida Bright', Georgia, serif;
  color: var(--fg);
  background: var(--bg);
}
/* Subtle parchment-grain texture — same as the town view */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(rgba(60,40,20,0.025) 1px, transparent 1px),
    radial-gradient(rgba(60,40,20,0.018) 1px, transparent 1px);
  background-size: 17px 17px, 31px 31px;
  background-position: 0 0, 13px 7px;
  z-index: 0;
}
header, main { position: relative; z-index: 1; }
header { background: transparent; border-bottom: 1px solid var(--border); padding: 1rem 1.5rem; }
header h1 {
  margin: 0;
  font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--fg);
}
nav { display: flex; gap: 1rem; margin-top: 0.5rem; align-items: center; flex-wrap: wrap; }
nav a { color: var(--accent-deep); text-decoration: none; font-size: 0.9em; }
nav a:hover { color: var(--accent); text-decoration: underline; }
main { max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem; }
h1, h2, h3, h4 {
  font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--fg);
}
a { color: var(--accent-deep); }
a:hover { color: var(--accent); }
code, pre, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
code {
  background: rgba(60,40,20,0.05);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.95em;
}
.grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; }
.card h2 { margin: 0 0 0.75rem; font-size: 1.05rem; font-weight: 600; }
.muted { color: var(--muted); }
.kpi { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.kpi > div { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; min-width: 140px; }
.kpi .label { color: var(--muted); font-size: 0.85em; margin-bottom: 0.25rem; }
.kpi .value { font-size: 1.5rem; font-weight: 600; font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif; }
.status-success { color: var(--green); }
.status-error { color: var(--red); }
.status-running { color: var(--amber); }
table { width: 100%; border-collapse: collapse; font-size: 0.9em; background: var(--card-bg); border-radius: 8px; overflow: hidden; }
th, td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 500; background: var(--bg-warmer); font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif; font-size: 0.85em; letter-spacing: 0.04em; }
tr:last-child td { border-bottom: 0; }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--bg-warmer); color: var(--ink-soft); font-size: 0.8em; border: 1px solid var(--border); }
button, input[type="submit"], .cta-btn {
  font-family: inherit;
  background: var(--accent);
  color: white;
  border: 0;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.95em;
  font-weight: 500;
  cursor: pointer;
}
button:hover, input[type="submit"]:hover, .cta-btn:hover { background: var(--accent-deep); }
input[type="text"], input[type="password"], input[type="url"], input[type="email"], textarea {
  font-family: inherit;
  background: var(--card-bg);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  font-size: 0.95em;
}
input:focus, textarea:focus { outline: none; border-color: var(--accent); }
hr { border: 0; border-top: 1px solid var(--border); margin: 1.5rem 0; }
.md-table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.92em; background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.md-table th, .md-table td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
.md-table tr:last-child td { border-bottom: 0; }
.md-table th { background: var(--bg-warmer); font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif; font-weight: 600; font-size: 0.85em; letter-spacing: 0.04em; color: var(--ink-soft); }
a.wikilink { padding: 1px 4px; border-radius: 3px; text-decoration: none; font-weight: 500; }
a.wikilink-resolved { color: var(--accent); background: rgba(194, 94, 79, 0.08); }
a.wikilink-resolved:hover { background: rgba(194, 94, 79, 0.18); }
a.wikilink-ambiguous { color: #8a6d3b; background: rgba(240, 173, 78, 0.12); border-bottom: 1px dashed rgba(138, 109, 59, 0.5); }
a.wikilink-ambiguous:hover { background: rgba(240, 173, 78, 0.25); }
a.wikilink-broken { color: #a94442; background: rgba(169, 68, 66, 0.08); border-bottom: 1px dashed rgba(169, 68, 66, 0.5); }
a.wikilink-broken:hover { background: rgba(169, 68, 66, 0.18); }
</style>
</head>
<body>
<header>
  <h1>Office Town</h1>
  <nav>
    <a href="/">Town</a>
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
	const workerHost = new URL(c.req.url).host;
	const stats = await loadTownStats(env);
	return c.html(renderTownView(stats, workerHost));
});

// Dossier-paste setup surface — inline prompts + file upload + paste textarea
// + result summary. Three paths to populate (file upload / paste / future
// path 5 mixed-type workflow), one routing endpoint.
dashboardRoutes.get('/dashboard/setup', async (c) => {
	const effectiveBearer = await getEffectiveBearer(c.env);

	const promptCards = PROMPT_VARIANTS.map(
		(v) => `
<details class="prompt-detail" ${v.recommended ? 'open' : ''}>
  <summary>
    <strong>${escapeHtml(v.title)}</strong>${v.recommended ? ' <span class="tag" style="background: var(--accent); color: white; border-color: var(--accent); margin-left: 0.4rem;">recommended</span>' : ''}
    <div class="muted" style="font-size: 0.85em; margin: 0.25rem 0 0 0; font-weight: 400;">${escapeHtml(v.shortDescription)}</div>
  </summary>
  <div style="margin-top: 0.75rem;">
    <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
      <button type="button" onclick="copyPrompt('${v.id}')" style="font-size: 0.85em; padding: 0.35rem 0.75rem;">Copy prompt</button>
      <span id="copy-status-${v.id}" class="muted" style="font-size: 0.85em;"></span>
    </div>
    <pre id="prompt-text-${v.id}" style="background: var(--code); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; font-size: 0.82em; line-height: 1.55; white-space: pre-wrap; max-height: 360px; overflow-y: auto;">${escapeHtml(v.body)}</pre>
  </div>
</details>`,
	).join('');

	const content = `
<style>
.prompt-detail { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 0.75rem; }
.prompt-detail summary { cursor: pointer; padding: 0.25rem 0; }
.prompt-detail summary::marker, .prompt-detail summary::-webkit-details-marker { color: var(--accent); }
.file-list { margin: 0.75rem 0; padding: 0; list-style: none; font-family: ui-monospace, monospace; font-size: 0.85em; }
.file-list li { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.file-list li:last-child { border-bottom: 0; }
.file-list .file-name { flex: 1; }
.file-list .file-meta { color: var(--muted); font-size: 0.85em; }
.file-list .file-remove { color: var(--red); cursor: pointer; background: transparent; border: 0; font-size: 0.95em; padding: 0.2rem 0.5rem; }
.file-list .file-unsupported { color: var(--amber); font-size: 0.8em; font-style: italic; }
.drop-zone { border: 2px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: center; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
.drop-zone:hover, .drop-zone.dragover { background: var(--bg-warmer); border-color: var(--accent); }
.drop-zone-prompt { color: var(--ink-soft); font-size: 0.95em; }
.drop-zone-hint { color: var(--muted); font-size: 0.85em; margin-top: 0.4rem; }
</style>

<h1 style="margin-top: 0;">Set up your town</h1>
<p class="muted" style="max-width: 760px;">
  Bring context across from your existing AI. Office Town routes the output into the right cortex collection:
  <code>bio.md</code>, <code>voice.md</code>, and other owner files go to the <a href="/dashboard/wiki?c=owner">owner</a> cascade;
  <code>people.md</code> splits into <a href="/dashboard/wiki?c=contacts">contacts</a> + <a href="/dashboard/wiki?c=team">team</a> + <a href="/dashboard/wiki?c=orgs">orgs</a>;
  <code>projects.md</code> splits into <a href="/dashboard/wiki?c=projects">projects</a>; unknown markdown lands in <code>wiki/raw/</code> for review.
</p>

<div class="card" style="max-width: 920px; margin-top: 1rem;">
  <h2 style="margin-top: 0;">Step 1 — Get a dossier</h2>
  <p class="muted" style="margin: 0.4rem 0 1rem;">
    Open Claude / ChatGPT / Gemini, copy one of the prompts below, paste it into your existing chat, and the AI writes a dossier from your prior conversations. Three variants: pick the one that suits your AI and how much depth you want.
  </p>
  ${promptCards}
</div>

<div class="card" style="max-width: 920px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Step 2 — Bring the dossier into your town</h2>

  <div style="margin: 0.75rem 0;">
    <label style="display: block; font-size: 0.85em; color: var(--muted); margin-bottom: 0.25rem;">Source AI (for audit attribution)</label>
    <select id="setup-source" style="font-size: 0.9em; padding: 0.4rem 0.5rem;">
      <option value="claude">Claude</option>
      <option value="gemini">Gemini</option>
      <option value="chatgpt">ChatGPT</option>
      <option value="other">Other</option>
    </select>
  </div>

  <p class="muted" style="margin: 1rem 0 0.5rem;">Drop files (markdown / text supported now; PDF / image / spreadsheet coming in v1.1):</p>
  <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
    <div class="drop-zone-prompt">Click here or drag files in</div>
    <div class="drop-zone-hint">Markdown (.md) and text (.txt) processed immediately. Other types (PDF, images, spreadsheets) accepted but flagged for v1.1 processing.</div>
    <input type="file" id="file-input" multiple style="display: none;" accept=".md,.txt,.markdown,.pdf,.png,.jpg,.jpeg,.csv,.xlsx,.docx" onchange="handleFiles(event.target.files)">
  </div>

  <p class="muted" style="margin: 1.25rem 0 0.5rem;">— or paste a single multi-file dossier (boundaries detected by <code># &lt;filename&gt;.md</code> headings):</p>
  <textarea id="dossier-textarea" placeholder="# bio.md&#10;&#10;## Name and what to call them&#10;...&#10;&#10;# voice.md&#10;&#10;## Overall register&#10;..." rows="14" style="width: 100%; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.85em; padding: 0.75rem; line-height: 1.5;"></textarea>
  <div style="margin: 0.5rem 0;">
    <button type="button" onclick="loadFromTextarea()" style="font-size: 0.85em; padding: 0.4rem 0.85rem; background: transparent; color: var(--accent-deep); border: 1px solid var(--accent-deep);">Add pasted content</button>
  </div>
</div>

<div class="card" id="files-card" style="max-width: 920px; margin-top: 1.5rem; display: none;">
  <h2 style="margin-top: 0;">Files staged for setup</h2>
  <ul class="file-list" id="file-list"></ul>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 1rem 0 0.5rem;">
    <button type="button" id="setup-preview-btn" onclick="runSetup(true)" style="background: transparent; color: var(--accent-deep); border: 1px solid var(--accent-deep);">Preview (dry-run)</button>
    <button type="button" id="setup-apply-btn" onclick="runSetup(false)">Apply to cortex</button>
    <button type="button" onclick="clearAllFiles()" style="background: transparent; color: var(--muted); border: 1px solid var(--border); margin-left: auto;">Clear all</button>
    <span id="setup-status" class="muted" style="font-size: 0.9em;"></span>
  </div>
</div>

<div class="card" id="setup-result" style="max-width: 920px; margin-top: 1.5rem; display: none;">
  <h2 style="margin-top: 0;">Result</h2>
  <p id="setup-summary"></p>
  <div id="setup-planned" style="font-family: ui-monospace, monospace; font-size: 0.82em; line-height: 1.65;"></div>
  <div id="setup-cta" style="margin-top: 1rem;"></div>
</div>

<script>
const BEARER = ${JSON.stringify(effectiveBearer)};
const PROMPT_BODIES = ${JSON.stringify(Object.fromEntries(PROMPT_VARIANTS.map((v) => [v.id, v.body])))};

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt']);
const FUTURE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'csv', 'xlsx', 'docx']);

// Staged-files store: { id, filename, content, supported, source }
let stagedFiles = [];
let nextFileId = 1;

function copyPrompt(variantId) {
  const text = PROMPT_BODIES[variantId];
  const status = document.getElementById('copy-status-' + variantId);
  if (!text) {
    status.textContent = 'Prompt not found';
    status.style.color = 'var(--red)';
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    status.textContent = '✓ Copied — paste into your AI';
    status.style.color = 'var(--green)';
    setTimeout(() => { status.textContent = ''; }, 2500);
  }).catch((err) => {
    status.textContent = 'Copy failed: ' + err.message;
    status.style.color = 'var(--red)';
  });
}

function splitDossier(text) {
  const lines = text.split('\\n');
  const files = [];
  let current = null;
  const fileHeading = /^#\\s+([a-z][a-z0-9_-]*\\.md)\\s*$/i;
  for (const line of lines) {
    const m = line.match(fileHeading);
    if (m) {
      if (current) files.push(current);
      current = { filename: m[1], content: line + '\\n' };
    } else if (current) {
      current.content += line + '\\n';
    }
  }
  if (current) files.push(current);
  return files;
}

function getExt(filename) {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function isSupported(filename) {
  return TEXT_EXTENSIONS.has(getExt(filename));
}

function isFuture(filename) {
  return FUTURE_EXTENSIONS.has(getExt(filename));
}

function renderFileList() {
  const card = document.getElementById('files-card');
  const list = document.getElementById('file-list');
  list.textContent = '';

  if (stagedFiles.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  for (const f of stagedFiles) {
    const li = document.createElement('li');

    const nameEl = document.createElement('span');
    nameEl.className = 'file-name';
    nameEl.textContent = f.filename;

    const metaEl = document.createElement('span');
    metaEl.className = 'file-meta';
    metaEl.textContent = (f.content.length / 1024).toFixed(1) + ' KB · ' + f.source;

    li.appendChild(nameEl);
    li.appendChild(metaEl);

    if (!f.supported) {
      const futureEl = document.createElement('span');
      futureEl.className = 'file-unsupported';
      futureEl.textContent = isFuture(f.filename) ? 'v1.1 processing' : 'unsupported';
      li.appendChild(futureEl);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'file-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.dataset.fileId = String(f.id);
    removeBtn.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.dataset.fileId, 10);
      stagedFiles = stagedFiles.filter((sf) => sf.id !== id);
      renderFileList();
    });
    li.appendChild(removeBtn);

    list.appendChild(li);
  }
}

function addFile(filename, content, source) {
  const supported = isSupported(filename);
  stagedFiles.push({
    id: nextFileId++,
    filename,
    content,
    supported,
    source,
  });
  renderFileList();
}

function handleFiles(fileList) {
  for (const file of fileList) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      // For unsupported binary types, still capture a tiny placeholder so the
      // user can see we acknowledged it. v1.1 will replace with actual content.
      const content = typeof result === 'string'
        ? result
        : '(binary file ' + file.name + ', ' + Math.round(file.size / 1024) + ' KB — v1.1 processing)';
      addFile(file.name, content, 'upload');
    };
    if (isSupported(file.name)) {
      reader.readAsText(file);
    } else {
      // Don't try to read binary as text; placeholder only
      reader.onload({ target: { result: null } });
    }
  }
  // Reset the input so the same file can be re-uploaded if needed
  document.getElementById('file-input').value = '';
}

function loadFromTextarea() {
  const text = document.getElementById('dossier-textarea').value.trim();
  if (!text) return;
  const files = splitDossier(text);
  if (files.length === 0) {
    const status = document.getElementById('setup-status');
    status.textContent = 'No file boundaries detected in textarea. Each file should start with "# <filename>.md".';
    status.style.color = 'var(--red)';
    return;
  }
  for (const f of files) {
    addFile(f.filename, f.content, 'paste');
  }
  document.getElementById('dossier-textarea').value = '';
}

function clearAllFiles() {
  stagedFiles = [];
  renderFileList();
  const result = document.getElementById('setup-result');
  result.style.display = 'none';
  const status = document.getElementById('setup-status');
  status.textContent = '';
}

function renderPlannedList(planned) {
  const container = document.getElementById('setup-planned');
  container.textContent = '';
  for (const p of planned) {
    const row = document.createElement('div');
    const label = document.createTextNode(p.classification + ' → ');
    const strong = document.createElement('strong');
    strong.textContent = p.collection + '/' + p.slug;
    const suffix = document.createTextNode(' (' + p.source_filename + ')');
    row.appendChild(label);
    row.appendChild(strong);
    row.appendChild(suffix);
    container.appendChild(row);
  }
}

function renderApplyCta() {
  const cta = document.getElementById('setup-cta');
  cta.textContent = '';
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'cta-btn';
  link.style.display = 'inline-block';
  link.textContent = 'View your populated town →';
  cta.appendChild(link);
}

async function runSetup(dryRun) {
  const source = document.getElementById('setup-source').value;
  const status = document.getElementById('setup-status');
  const resultDiv = document.getElementById('setup-result');
  const summaryEl = document.getElementById('setup-summary');
  const ctaEl = document.getElementById('setup-cta');

  const supportedFiles = stagedFiles
    .filter((f) => f.supported)
    .map((f) => ({ filename: f.filename, content: f.content }));

  if (supportedFiles.length === 0) {
    status.textContent = 'No supported files staged. Add markdown (.md) or text (.txt) files first.';
    status.style.color = 'var(--red)';
    return;
  }

  const unsupportedCount = stagedFiles.length - supportedFiles.length;
  const noteAboutUnsupported = unsupportedCount > 0
    ? ' ' + unsupportedCount + ' file' + (unsupportedCount === 1 ? '' : 's') + ' deferred to v1.1.'
    : '';

  status.textContent = 'Sending ' + supportedFiles.length + ' file' + (supportedFiles.length === 1 ? '' : 's') + ' to setup endpoint…' + noteAboutUnsupported;
  status.style.color = 'var(--ink-soft)';
  resultDiv.style.display = 'none';
  ctaEl.textContent = '';

  try {
    const response = await fetch('/api/setup/dossier', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + BEARER,
      },
      body: JSON.stringify({ files: supportedFiles, source, dry_run: dryRun }),
    });

    const data = await response.json();

    if (!data.ok && !data.planned) {
      status.textContent = 'Setup failed: ' + (data.error || 'unknown error');
      status.style.color = 'var(--red)';
      console.error(data);
      return;
    }

    status.textContent = (dryRun ? '✓ Preview generated.' : '✓ Applied to cortex.') + noteAboutUnsupported;
    status.style.color = 'var(--green)';

    resultDiv.style.display = 'block';
    summaryEl.textContent = data.summary;
    renderPlannedList(data.planned || []);

    if (!dryRun && (data.applied || 0) > 0) {
      renderApplyCta();
    }
  } catch (err) {
    status.textContent = 'Network error: ' + err.message;
    status.style.color = 'var(--red)';
    console.error(err);
  }
}

// Drag/drop handlers
(function setupDragDrop() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;
  ['dragenter', 'dragover'].forEach((event) => {
    zone.addEventListener(event, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((event) => {
    zone.addEventListener(event, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });
  zone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  });
})();
</script>
`;

	return c.html(LAYOUT('Set up your town - Office Town', content));
});

dashboardRoutes.get('/dashboard/wiki', async (c) => {
	const collection = c.req.query('c');
	const query = c.req.query('q')?.trim() ?? '';

	type Row = { collection: string; slug: string; title: string | null; updated_at: string; last_change_summary: string | null };
	let rows: { results?: Row[] };
	let heading: string;
	let extraNote = '';

	if (query) {
		// FTS5 search across title + body, optionally scoped to a collection.
		// Use a permissive query — wrap the user input so FTS5 treats it as a
		// phrase or prefix-friendly bag of words.
		const ftsQuery = query
			.replace(/[^\w\s-]/g, ' ')
			.split(/\s+/)
			.filter(Boolean)
			.map((w) => `${w}*`)
			.join(' ');
		const baseSql = `
			SELECT e.collection, e.slug, e.title, e.updated_at, e.last_change_summary
			FROM wiki_fts f
			JOIN wiki_entries e ON e.id = f.id
			WHERE wiki_fts MATCH ?
			${collection ? 'AND e.collection = ?' : ''}
			ORDER BY rank
			LIMIT 200`;
		rows = collection
			? await c.env.DB.prepare(baseSql).bind(ftsQuery, collection).all<Row>()
			: await c.env.DB.prepare(baseSql).bind(ftsQuery).all<Row>();
		heading = collection ? `Wiki search — "${escapeHtml(query)}" in ${collection}` : `Wiki search — "${escapeHtml(query)}"`;
		extraNote = (rows.results?.length ?? 0) === 0
			? '<p class="muted">No matches. Try a single word + check the spelling. Search is full-text across titles + body.</p>'
			: `<p class="muted">${rows.results?.length} match${rows.results?.length === 1 ? '' : 'es'}</p>`;
	} else if (collection) {
		rows = await c.env.DB.prepare(
			'SELECT collection, slug, title, updated_at, last_change_summary FROM wiki_entries WHERE collection = ? AND status != ? ORDER BY updated_at DESC LIMIT 200',
		).bind(collection, 'deleted').all<Row>();
		heading = `Wiki — ${collection}`;
	} else {
		rows = await c.env.DB.prepare(
			'SELECT collection, slug, title, updated_at, last_change_summary FROM wiki_entries WHERE status != ? ORDER BY updated_at DESC LIMIT 200',
		).bind('deleted').all<Row>();
		heading = 'Wiki — all entries';
	}

	const entries = (rows.results ?? [])
		.map(
			(r) =>
				`<tr>
<td><a href="/dashboard/wiki/${r.collection}/${r.slug}">${escapeHtml(r.title ?? r.slug)}</a></td>
<td><span class="tag">${r.collection}</span></td>
<td class="muted">${new Date(r.updated_at).toLocaleString()}</td>
<td class="muted">${(r.last_change_summary ?? '').replace(/</g, '&lt;')}</td>
</tr>`,
		)
		.join('');

	const searchBar = `
<form method="get" action="/dashboard/wiki" style="margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
  <input type="search" name="q" value="${escapeHtml(query)}" placeholder="Search wiki…" style="flex: 1; min-width: 240px; padding: 0.45rem 0.75rem;">
  ${collection ? `<input type="hidden" name="c" value="${escapeHtml(collection)}">` : ''}
  <button type="submit" style="font-size: 0.9em; padding: 0.45rem 1rem;">Search</button>
  ${query || collection ? '<a href="/dashboard/wiki" class="muted" style="font-size: 0.9em;">Clear</a>' : ''}
  <span style="margin-left: auto; font-size: 0.85em;">
    <a href="/dashboard/wiki/tree" class="muted">Tree view</a> ·
    <a href="/dashboard/wiki/review" class="muted">Review queue</a>
  </span>
</form>`;

	const content = `
<h1 style="margin-top: 0;">${heading}</h1>
${searchBar}
${extraNote}
<div class="card">
  <table>
    <thead><tr><th>Title</th><th>Collection</th><th>Updated</th><th>Last change</th></tr></thead>
    <tbody>${entries || '<tr><td colspan="4" class="muted">No entries</td></tr>'}</tbody>
  </table>
</div>`;
	return c.html(LAYOUT('Wiki', content));
});

// Review queue: entries the agent flagged for human eyes (stub + pending).
dashboardRoutes.get('/dashboard/wiki/review', async (c) => {
	type Row = {
		collection: string;
		slug: string;
		title: string | null;
		status: string;
		updated_at: string;
		last_change_summary: string | null;
	};

	const rows = await c.env.DB.prepare(
		`SELECT collection, slug, title, status, updated_at, last_change_summary
		 FROM wiki_entries
		 WHERE status = 'stub' OR status = 'stale'
		 ORDER BY updated_at DESC LIMIT 200`,
	).all<Row>();

	const stubs = (rows.results ?? []).filter((r) => r.status === 'stub');
	const stales = (rows.results ?? []).filter((r) => r.status === 'stale');

	const renderTable = (list: Row[]) =>
		list
			.map(
				(r) =>
					`<tr>
<td><a href="/dashboard/wiki/${r.collection}/${r.slug}">${escapeHtml(r.title ?? r.slug)}</a></td>
<td><span class="tag">${r.collection}</span></td>
<td class="muted">${new Date(r.updated_at).toLocaleString()}</td>
<td class="muted">${(r.last_change_summary ?? '').replace(/</g, '&lt;')}</td>
</tr>`,
			)
			.join('');

	const stubsTable = stubs.length
		? `<div class="card" style="margin-bottom: 1.5rem;">
			<h2 style="margin-top: 0;">Stubs (${stubs.length}) — entries needing completion</h2>
			<p class="muted">These were written with missing required fields or below the confidence threshold. Review + flesh out OR archive if they don't earn their place.</p>
			<table>
				<thead><tr><th>Title</th><th>Collection</th><th>Updated</th><th>Why stubbed</th></tr></thead>
				<tbody>${renderTable(stubs)}</tbody>
			</table>
		</div>`
		: '';

	const stalesTable = stales.length
		? `<div class="card">
			<h2 style="margin-top: 0;">Stale (${stales.length}) — entries not touched in 90+ days</h2>
			<p class="muted">Refresh, archive, or supersede each one based on whether the record still reflects reality.</p>
			<table>
				<thead><tr><th>Title</th><th>Collection</th><th>Updated</th><th>Last change</th></tr></thead>
				<tbody>${renderTable(stales)}</tbody>
			</table>
		</div>`
		: '';

	const empty = (stubs.length === 0 && stales.length === 0)
		? '<div class="card"><p>Nothing in the review queue. Your cortex is in clean shape — no stubs awaiting completion, no stale entries needing refresh.</p></div>'
		: '';

	const content = `
<h1 style="margin-top: 0;">Review queue</h1>
<p class="muted">Entries the cortex has flagged for your attention. The autonomy default has the agent act with whatever confidence it has — anything genuinely unclear lands here.</p>
${stubsTable}${stalesTable}${empty}`;

	return c.html(LAYOUT('Review queue - Wiki', content));
});

// Tree view: R2 path hierarchy as a navigable indented list.
dashboardRoutes.get('/dashboard/wiki/tree', async (c) => {
	// Listing R2 — paginated, fetch up to 1000 keys per page. For typical
	// cortexes (50-500 entries) this is one or two pages.
	const allKeys: string[] = [];
	let cursor: string | undefined;
	for (let i = 0; i < 5; i++) {
		const result = await c.env.WIKI.list({ prefix: 'wiki/', limit: 1000, cursor });
		for (const obj of result.objects) allKeys.push(obj.key);
		if (!result.truncated) break;
		cursor = result.cursor;
	}

	// Sort lexicographically — folders sort together
	allKeys.sort();

	// Build indented HTML. Each key like "wiki/orgs/acme-corp/entity.md" becomes
	// a nested entry; depth comes from path segment count.
	const escapedRows: string[] = [];
	let lastSegments: string[] = [];

	for (const key of allKeys) {
		const segments = key.split('/').filter(Boolean);
		// Render folder rows for any new prefix vs lastSegments
		for (let depth = 0; depth < segments.length - 1; depth++) {
			if (lastSegments[depth] !== segments[depth]) {
				// New folder at this depth
				const indent = depth * 24;
				escapedRows.push(
					`<div style="padding: 0.15rem 0 0.15rem ${indent}px;" class="muted">📁 ${escapeHtml(segments[depth])}/</div>`,
				);
			}
		}
		// Render the file row
		const fileDepth = segments.length - 1;
		const filename = segments[fileDepth];
		const indent = fileDepth * 24;
		const isCanonical = /^(entity|contact|project|decision|concept|profile|task|investigation)\.md$/.test(filename);
		// Build a click-through to the entry detail page when filename is a canonical
		const linkPath = isCanonical && segments.length >= 3
			? `/dashboard/wiki/${segments[1]}/${segments[2]}`
			: null;
		const fileLabel = linkPath
			? `<a href="${linkPath}">${escapeHtml(filename)}</a>`
			: escapeHtml(filename);
		escapedRows.push(
			`<div style="padding: 0.15rem 0 0.15rem ${indent}px; font-family: ui-monospace, monospace; font-size: 0.85em;">📄 ${fileLabel}</div>`,
		);
		lastSegments = segments;
	}

	const treeHtml = escapedRows.join('');

	const content = `
<h1 style="margin-top: 0;">Wiki tree</h1>
<p class="muted">Full R2 path hierarchy. Click any canonical file (entity.md, contact.md, project.md, decision.md, concept.md) to open its detail view. Non-canonical files (notes/, sessions/, attachments/) are listed here but don't yet have detail pages.</p>
<div class="card" style="max-height: 80vh; overflow-y: auto;">
  ${treeHtml || '<p class="muted">No wiki content yet. Run <a href="/dashboard/setup">setup</a> or wire your Goose to start populating.</p>'}
</div>
<p class="muted" style="margin-top: 1rem; font-size: 0.85em;">${allKeys.length} files total.</p>`;

	return c.html(LAYOUT('Wiki tree - Office Town', content));
});

// Serves arbitrary R2 wiki-folder files (images, PDFs, attachments) at
// /dashboard/wiki-files/<collection>/<slug>/<rest...> so entries can
// reference images alongside their canonical markdown. Gated by the
// dashboard middleware (cookie auth) like everything else under
// /dashboard/. The route only serves keys under the matching wiki/<col>/<slug>/
// prefix so it can't be used to fetch other R2 paths.
dashboardRoutes.get('/dashboard/wiki-files/:collection/:slug/*', async (c) => {
	const collection = c.req.param('collection');
	const slug = c.req.param('slug');
	const folderPrefix = `wiki/${collection}/${slug}/`;
	const reqPath = c.req.path;
	const marker = `/dashboard/wiki-files/${collection}/${slug}/`;
	const idx = reqPath.indexOf(marker);
	if (idx === -1) return c.notFound();
	const rest = reqPath.slice(idx + marker.length);
	if (!rest || rest.includes('..')) return c.notFound();

	const r2Key = `${folderPrefix}${rest}`;
	const obj = await c.env.WIKI.get(r2Key);
	if (!obj) return c.notFound();

	const headers = new Headers();
	if (obj.httpMetadata?.contentType) {
		headers.set('content-type', obj.httpMetadata.contentType);
	}
	if (obj.httpEtag) {
		headers.set('etag', obj.httpEtag);
	}
	headers.set('cache-control', 'private, max-age=300');
	return new Response(obj.body, { headers });
});

dashboardRoutes.get('/dashboard/wiki/:collection/:slug', async (c) => {
	const collection = c.req.param('collection');
	const slug = c.req.param('slug');
	const row = await c.env.DB.prepare(
		'SELECT collection, slug, title, body, frontmatter_json, updated_at, r2_key FROM wiki_entries WHERE id = ?'
	)
		.bind(`${collection}:${slug}`)
		.first<{ collection: string; slug: string; title: string | null; body: string; frontmatter_json: string; updated_at: string; r2_key: string }>();
	if (!row) return c.html(LAYOUT('Not found', '<h1>Not found</h1>'), 404);

	const frontmatter = JSON.parse(row.frontmatter_json) as Record<string, unknown>;
	const fmRows = Object.entries(frontmatter)
		.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${linkifyValue(k, v)}</td></tr>`)
		.join('');

	// Resolve [[wikilinks]] against D1 in one batched query, then render.
	// Relative `![alt](attachments/foo.png)` resolves to the auth-gated
	// wiki-files route under the same entry folder.
	const wikilinkResolver = await resolveWikilinks(c.env, row.body);
	const innerBody = renderMarkdownBody(row.body, {
		imageBasePath: `/dashboard/wiki-files/${collection}/${slug}`,
		wikilinkResolver,
	});

	// Companion files: list R2 objects under wiki/<collection>/<slug>/
	// and surface any that aren't the canonical entry (notes/, sessions/,
	// research/, attachments — the entity-as-folder companion shape).
	const folderPrefix = `wiki/${collection}/${slug}/`;
	const companionList = await c.env.WIKI.list({ prefix: folderPrefix, limit: 100 });
	const companions = companionList.objects
		.filter((obj) => obj.key !== row.r2_key)
		.sort((a, b) => a.key.localeCompare(b.key));

	const companionsHtml = companions.length
		? `<details class="card" style="margin-bottom: 1.5rem;" open>
  <summary style="cursor: pointer; font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif; font-weight: 600; font-size: 1.05rem; letter-spacing: 0.02em; color: var(--ink);">Companion files (${companions.length})</summary>
  <p class="muted" style="margin-top: 0.5rem; font-size: 0.9em;">Notes, sessions, research, attachments — anything else under <code>${escapeHtml(folderPrefix)}</code>.</p>
  <ul style="margin: 0.75rem 0 0; padding-left: 1.25rem; font-family: ui-monospace, monospace; font-size: 0.88em;">
    ${companions.map((obj) => {
			const relPath = obj.key.slice(folderPrefix.length);
			const sizeKb = (obj.size / 1024).toFixed(1);
			return `<li><code>${escapeHtml(relPath)}</code> <span class="muted">— ${sizeKb} KB</span></li>`;
		}).join('')}
  </ul>
</details>`
		: '';

	const content = `
<nav class="muted" style="margin-bottom: 1rem; font-size: 0.9em;">
  <a href="/" style="color: var(--accent);">Home</a> ›
  <a href="/dashboard/wiki" style="color: var(--accent);">Wiki</a> ›
  <a href="/dashboard/wiki?c=${row.collection}" style="color: var(--accent);">${row.collection}</a> ›
  <span>${escapeHtml(row.slug)}</span>
</nav>
<h1 style="margin-top: 0;">${escapeHtml(row.title ?? row.slug)}</h1>
<div class="card" style="margin-bottom: 1.5rem;">
  <div>${innerBody}</div>
</div>
${companionsHtml}
<details class="card" style="margin-bottom: 1.5rem;">
  <summary style="cursor: pointer; font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif; font-weight: 600; font-size: 1.05rem; letter-spacing: 0.02em; color: var(--ink);">Frontmatter</summary>
  <table style="margin-top: 0.75rem;">${fmRows}</table>
</details>`;
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

// Public one-liner installer. Curl-pipes a bash script that bootstraps the
// goose CLI if missing, disables Goose's built-in Memory, then runs
// `goose mcp add` × 6 with values from WORKER_URL + MCP_BEARER env vars.
//
// The script holds no secrets — the bearer comes from the user's shell
// invocation, never via the URL. Bearer-in-URL would land in worker
// access logs + browser history; env-var-on-the-command-line stays in
// the user's shell history only.
dashboardRoutes.get('/connect.sh', async () => {
	const script = `#!/usr/bin/env bash
# Office Town — one-line installer.
#
# Run with:
#   curl -fsSL <worker>/connect.sh | WORKER_URL='https://<worker>' MCP_BEARER='<token>' bash
#
# What this does (default):
#   1. Bootstraps the goose CLI (brew on macOS, curl-installer otherwise) if missing
#   2. Disables Goose's built-in Memory extension (wiki MCP replaces it)
#   3. Adds 6 office-town-* MCPs to ~/.config/goose/config.yaml via 'goose mcp add'
#
# Optional add-on (with WITH_SYNC=1):
#   4. Installs the officetowd sync daemon binary
#   5. Prints the two-command finish for officetowd (configure + start)
#
# Env vars:
#   WORKER_URL   (required) — your Office Town worker URL
#   MCP_BEARER   (required) — the dashboard / MCP bearer token
#   WITH_SYNC=1  (optional) — also install the officetowd sync daemon

set -euo pipefail

if [ -z "\${WORKER_URL:-}" ] || [ -z "\${MCP_BEARER:-}" ]; then
  cat >&2 <<'USAGE'
Office Town: missing required env vars.

Run as:
  curl -fsSL <worker>/connect.sh | WORKER_URL='https://<worker>' MCP_BEARER='<token>' bash

The dashboard "Connect" page gives you a pre-filled one-liner.
USAGE
  exit 1
fi

WORKER_URL="\${WORKER_URL%/}"

echo "→ Office Town installer"
echo "  worker: $WORKER_URL"
echo ""

# ---- Stage 1: Goose CLI ----------------------------------------------------
# Goose Desktop ships as a GUI app and doesn't put the CLI on PATH by itself.
# Bootstrap the CLI if it isn't there.
if ! command -v goose >/dev/null 2>&1; then
  echo "→ Goose CLI not found on PATH. Installing..."
  if command -v brew >/dev/null 2>&1; then
    brew install block/tap/goose
  else
    curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash
  fi
  hash -r 2>/dev/null || true
  if ! command -v goose >/dev/null 2>&1; then
    echo "" >&2
    echo "Goose installed, but its bin dir isn't on PATH for this shell." >&2
    echo "Open a fresh terminal (so PATH refreshes) and re-run this installer." >&2
    exit 1
  fi
fi
echo "→ Goose: $(goose --version 2>/dev/null || echo 'version unknown')"
echo ""

# ---- Stage 2: Wire the 6 MCPs ---------------------------------------------
# Office Town's wiki MCP replaces Goose's built-in Memory extension with
# persistent R2-backed storage + semantic search.
echo "→ Disabling Goose built-in Memory extension (wiki MCP replaces it)..."
goose mcp disable memory 2>/dev/null || true

AUTH_HEADER="Authorization: Bearer $MCP_BEARER"
for name in wiki files email cron voice sandbox; do
  echo "→ Adding office-town-$name..."
  goose mcp add "office-town-$name" \\
    --transport streamable_http \\
    --url "$WORKER_URL/mcp/$name" \\
    --header "$AUTH_HEADER"
done
echo ""
echo "✓ All 6 Office Town MCPs wired into Goose."
echo ""

# ---- Stage 3: officetowd sync daemon (opt-in) -----------------------------
# Skipped by default. Set WITH_SYNC=1 to also install the local sync daemon.
if [ "\${WITH_SYNC:-0}" != "1" ]; then
  echo "→ Skipping officetowd sync daemon (set WITH_SYNC=1 to install)."
else
  echo "→ Installing officetowd sync daemon..."

  case "$(uname -s)" in
    Darwin) OS=darwin ;;
    Linux)  OS=linux ;;
    *)
      echo "  ! Unsupported OS for officetowd: $(uname -s). Skipping daemon install."
      OS=""
      ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH=arm64 ;;
    x86_64|amd64)  ARCH=amd64 ;;
    *)
      echo "  ! Unsupported arch for officetowd: $(uname -m). Skipping daemon install."
      ARCH=""
      ;;
  esac

  if [ -n "$OS" ] && [ -n "$ARCH" ]; then
    DAEMON_REPO="jezweb/officetowd"
    LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/$DAEMON_REPO/releases/latest" \\
      | grep -E '"tag_name"' | head -1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\\1/')

    if [ -z "$LATEST_TAG" ]; then
      echo "  ! Could not resolve officetowd latest release. Skipping daemon install."
    else
      ASSET="officetowd-\${OS}-\${ARCH}.tar.gz"
      URL="https://github.com/$DAEMON_REPO/releases/download/$LATEST_TAG/$ASSET"

      INSTALL_DIR_DEFAULT="/usr/local/bin"
      LOCAL_BIN="$HOME/.local/bin"
      if [ -w "$INSTALL_DIR_DEFAULT" ]; then
        INSTALL_DIR="$INSTALL_DIR_DEFAULT"
        SUDO=""
      elif sudo -n true 2>/dev/null; then
        INSTALL_DIR="$INSTALL_DIR_DEFAULT"
        SUDO=sudo
      else
        mkdir -p "$LOCAL_BIN"
        INSTALL_DIR="$LOCAL_BIN"
        SUDO=""
        case ":$PATH:" in
          *":$LOCAL_BIN:"*) ;;
          *) echo "  ! $LOCAL_BIN not on PATH. Add: export PATH=\\"\\$HOME/.local/bin:\\$PATH\\"" ;;
        esac
      fi

      TMP=$(mktemp -d)
      trap "rm -rf $TMP" EXIT
      echo "  Downloading $ASSET ($LATEST_TAG)..."
      if curl -fsSL "$URL" -o "$TMP/officetowd.tar.gz"; then
        tar -xzf "$TMP/officetowd.tar.gz" -C "$TMP"
        \${SUDO:-} install -m 0755 "$TMP/officetowd" "$INSTALL_DIR/officetowd"
        echo "  ✓ Installed officetowd to $INSTALL_DIR/officetowd"
        echo ""
        echo "  Finish setup with:"
        echo "    officetowd configure --from-dashboard $WORKER_URL"
        echo "    officetowd start"
      else
        echo "  ! Download failed from $URL — skipping daemon install."
      fi
    fi
  fi
fi
echo ""

# ---- Finish ---------------------------------------------------------------
echo "Done. Next:"
echo "  • Restart Goose Desktop (if it was open) so the config reloads."
echo "  • In a fresh Goose chat, try:  list contacts in the wiki"
echo "  • Verify the MCP wiring:       goose mcp list"
if [ "\${WITH_SYNC:-0}" = "1" ]; then
  echo "  • Configure officetowd:        officetowd configure --from-dashboard $WORKER_URL"
fi
`;

	return new Response(script, {
		headers: {
			'content-type': 'text/x-shellscript; charset=utf-8',
			'cache-control': 'no-store',
			'content-disposition': 'inline; filename="connect.sh"',
		},
	});
});

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
<div class="card" style="max-width: 800px; margin-bottom: 1.5rem; background: linear-gradient(180deg, #fbf3e9 0%, var(--card-bg) 100%); border-color: var(--amber);">
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
<p class="muted">One line in your terminal wires all 6 Office Town MCPs into Goose. If the <code>goose</code> CLI isn't installed yet, the script will bootstrap it for you.</p>

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

<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Run this in your terminal</h2>
  <p style="margin: 0.5rem 0;" class="muted">Open Terminal (macOS / Linux) or WSL (Windows) and paste this single line. It bootstraps Goose CLI if missing, then wires the 6 MCPs.</p>

  <label style="display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.75rem 0; padding: 0.6rem 0.8rem; background: var(--code); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">
    <input id="with-sync" type="checkbox" style="margin-top: 0.2rem;">
    <span>
      <strong style="font-size: 0.95em;">Also install the local sync daemon (officetowd)</strong>
      <span class="muted" style="display: block; font-size: 0.85em; margin-top: 0.15rem;">
        Mirrors your wiki + files to a folder on this Mac/Linux/WSL host so you can edit in Obsidian, VSCode, Typora, or any editor. Skip if you'll only edit via the AI agent.
      </span>
    </span>
  </label>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 0.75rem 0;">
    <button id="copy-btn" type="button" onclick="copyOneliner()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy one-liner</button>
    <span id="copy-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="oneliner" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.85em; overflow-x: auto; line-height: 1.45; white-space: pre-wrap; word-break: break-all;"></pre>

  <p class="muted" style="font-size: 0.85em; margin-top: 0.75rem;">Restart Goose Desktop afterward (if it was open) so it picks up the new extensions. Then in a fresh chat, try <code>list contacts in the wiki</code> to confirm.</p>

  <details style="margin-top: 1rem; font-size: 0.9em;">
    <summary style="cursor: pointer; color: var(--accent);">What does the script do?</summary>
    <ol style="margin-top: 0.6rem; padding-left: 1.25rem;">
      <li>Checks for the <code>goose</code> CLI; installs it via Homebrew (macOS) or the official curl-installer (Linux) if missing.</li>
      <li>Disables Goose's built-in Memory extension — the Office Town wiki MCP replaces it with persistent R2-backed storage.</li>
      <li>Runs <code>goose mcp add</code> six times — once per MCP (wiki, files, email, cron, voice, sandbox), all pointed at this worker with the bearer above.</li>
      <li><em>If sync is enabled above:</em> downloads the <code>officetowd</code> binary for your OS + arch and prints the two-command finish (<code>officetowd configure</code> → <code>officetowd start</code>).</li>
    </ol>
    <p style="margin-top: 0.6rem;">Inspect the full script source at <a href="/connect.sh" target="_blank"><code>/connect.sh</code></a>. The bearer never appears in the URL — it stays in your shell's env vars / history only.</p>
  </details>
</div>

<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2>What gets installed</h2>
  <p class="muted" style="font-size: 0.9em; margin: 0.25rem 0 0.75rem;">The six MCP servers wired into your Goose. Each points at this worker; all share the bearer above.</p>
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
function shSingleQuote(s) {
  // single-quote, escape embedded singles via close-escape-reopen
  return "'" + String(s).replace(/'/g, "'\\\\''") + "'";
}

function generateOneliner() {
  const url = document.getElementById('worker-url').value.replace(/\\/+$/, '');
  const bearer = document.getElementById('bearer').value.trim();
  const withSync = document.getElementById('with-sync').checked;
  const urlSafe = url || 'https://YOUR-WORKER-URL.workers.dev';
  const bearerSafe = bearer || 'YOUR_MCP_BEARER_TOKEN';

  return 'curl -fsSL ' + shSingleQuote(urlSafe + '/connect.sh') +
    ' | WORKER_URL=' + shSingleQuote(urlSafe) +
    ' MCP_BEARER=' + shSingleQuote(bearerSafe) +
    (withSync ? ' WITH_SYNC=1' : '') +
    ' bash';
}

function refreshOneliner() {
  document.getElementById('oneliner').textContent = generateOneliner();
}

function copyOneliner() {
  const text = generateOneliner();
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

document.getElementById('worker-url').addEventListener('input', refreshOneliner);
document.getElementById('bearer').addEventListener('input', refreshOneliner);
document.getElementById('with-sync').addEventListener('change', refreshOneliner);
refreshOneliner();
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

<div class="card" style="max-width: 760px; margin-top: 1.5rem; background: linear-gradient(180deg, #fbf3e9 0%, var(--card-bg) 100%); border-color: var(--amber);">
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
          <button onclick="navigator.clipboard.writeText('${redirectUri}'); this.textContent='✓'; setTimeout(()=>this.textContent='Copy',1500);" style="margin-left: 0.5rem; padding: 2px 8px; font-size: 0.85em; border: 1px solid var(--border); background: var(--card-bg); color: var(--fg); border-radius: 4px; cursor: pointer;">Copy</button>
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

// Local-sync (officetowd) setup guide — same shape as wire-domain +
// wire-google-signin. Three install paths shown verbatim so the user
// reads exactly what they're running.
//
// The actual installer/configure scripts come from /api/sync/install.sh
// (worker-generated bash with worker URL + bearer baked in).
dashboardRoutes.get('/dashboard/wire-sync', async (c) => {
	const reqUrl = new URL(c.req.url);
	const workerHost = reqUrl.host;
	const workerUrl = `${reqUrl.protocol}//${workerHost}`;
	const effectiveBearer = await getEffectiveBearer(c.env);

	const installCommand = `curl -fsSL ${workerUrl}/api/sync/install.sh | bash`;

	const agentPrompt = [
		"Help me install the Office Town sync daemon (officetowd) on this machine.",
		"It mirrors my wiki + files between Cloudflare R2 and a local folder so I",
		"can edit in my editor of choice, drop binaries into Finder, etc.",
		"",
		"Worker URL:  " + workerUrl,
		"MCP bearer:  (read from the /dashboard/connect page — same value used for MCPs)",
		"",
		"GROUND RULES:",
		"- Be transparent. Tell me what you're about to do before running anything.",
		"- The daemon writes to my filesystem under a folder I'll choose (default: ~/Documents/my-town).",
		"- It writes to R2 via the worker only — no R2 token needed on this machine.",
		"- Same bearer rotation story as MCPs: rotate via 'wrangler secret put MCP_BEARER_TOKEN'.",
		"",
		"STEPS:",
		"",
		"1. Pick a local folder for the wiki mirror. Default: ~/Documents/my-town",
		"   Confirm the path with me before creating it.",
		"",
		"2. Install officetowd:",
		"     brew tap jezweb/tap",
		"     brew install officetowd",
		"   (On Linux/Windows, ask me to download from",
		"    https://github.com/jezweb/officetowd/releases)",
		"",
		"3. Configure with one command — fetches credentials from the dashboard:",
		"     officetowd configure --from-dashboard " + workerUrl,
		"   It'll ask for the MCP bearer and the local folder, write",
		"   ~/.officetowd/config.yaml with mode 0600.",
		"",
		"4. Start the daemon. On macOS:",
		"     officetowd start",
		"   (This creates a launchd plist that runs the daemon under your user",
		"    and starts it. The plist auto-starts on login.)",
		"",
		"5. Verify it's running + initial sync happened:",
		"     officetowd status",
		"   Should show 'watching <local-dir> ↔ <worker-url> (interval 60s)'.",
		"   First sync pulls down whatever's already in the wiki bucket.",
		"",
		"6. Test bidirectional sync:",
		"   a. Edit a markdown file in the local folder; wait ~5 sec.",
		"   b. Verify the change appears at " + workerUrl + "/dashboard/wiki",
		"   c. Make a wiki change via Goose (e.g. wiki(action:'write', why:'test'));",
		"      wait ~60 sec for the periodic sweep.",
		"   d. Verify the new entry appears locally.",
		"",
		"CONSTRAINTS:",
		"- Don't touch any MCP wiring — sync is separate from MCPs.",
		"- If a step fails, stop and tell me — don't paper over conflicts.",
		"- Conflicts (both sides changed) get saved as .conflict-<ts> siblings;",
		"  let me resolve manually.",
	].join('\n');

	const content = `
<h1 style="margin-top: 0;">Wire local sync (officetowd)</h1>
<p class="muted">Optional. Mirrors your wiki + binary attachments (PDFs, images) to a local folder so you can edit in your editor of choice, drop binaries into Finder, and use Spotlight on wiki content. All writes still flow through this worker for audit + indexing.</p>

<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">What you get</h2>
  <ul style="line-height: 1.65;">
    <li><strong>Wiki on disk</strong> — markdown entries + images + PDFs visible in <code>~/Documents/my-town</code> (or wherever you point it)</li>
    <li><strong>Edit in any editor</strong> — Obsidian, VSCode, Typora; the daemon detects + uploads on save</li>
    <li><strong>Multi-machine</strong> — install on each machine, all sync to the same worker, conflicts resolved with <code>.conflict-&lt;timestamp&gt;</code> siblings</li>
    <li><strong>Binary-safe</strong> — PDFs and images go through as raw bytes (not base64)</li>
    <li><strong>No R2 token</strong> — daemon talks to this worker via the MCP bearer; the worker handles all R2 access</li>
  </ul>
</div>

<!-- OPTION A — one-line shell install -->
<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Option A — one-line shell install</h2>
  <p style="margin: 0.5rem 0;" class="muted">Pipes our install script into bash. The script is shown verbatim below — read before you copy. Downloads the right binary for your OS from GitHub Releases, writes config under <code>~/.officetowd/</code>, registers a launchd plist (macOS) or systemd unit (Linux), starts the daemon.</p>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 0.75rem 0;">
    <button id="copy-install-btn" type="button" onclick="copyInstallCmd()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy install command</button>
    <span id="copy-install-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="install-cmd" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.9em; line-height: 1.45;">${installCommand}</pre>

  <p style="margin: 0.75rem 0 0.5rem; font-size: 0.9em;" class="muted">
    Want to see the script first?
    <a href="/api/sync/install.sh" target="_blank">Open <code>/api/sync/install.sh</code> in a new tab →</a>
    The script is generated from your worker with your URL + bearer baked in.
  </p>
</div>

<!-- OPTION B — homebrew tap -->
<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Option B — homebrew (macOS/Linux)</h2>
  <p style="margin: 0.5rem 0;" class="muted">If you prefer brew managing the binary.</p>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 0.75rem 0;">
    <button id="copy-brew-btn" type="button" onclick="copyBrew()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy brew commands</button>
    <span id="copy-brew-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="brew-cmd" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.9em; line-height: 1.45;"># Install
brew tap jezweb/tap
brew install officetowd

# Configure (fetches worker URL + bearer interactively)
officetowd configure --from-dashboard ${workerUrl}

# Start
officetowd start

# Verify
officetowd status</pre>
</div>

<!-- OPTION C — agent prompt -->
<div class="card" style="max-width: 800px; margin-top: 1.5rem;">
  <h2 style="margin-top: 0;">Option C — paste this prompt into your AI agent</h2>
  <p style="margin: 0.5rem 0;" class="muted">Have Claude Code, Goose, Aider, or Cline walk you through it. Full prompt below — read before pasting.</p>

  <div style="display: flex; gap: 0.75rem; align-items: center; margin: 0.75rem 0;">
    <button id="copy-sync-agent-btn" type="button" onclick="copySyncAgent()" style="padding: 0.5rem 1rem; border: 0; border-radius: 6px; background: var(--accent); color: white; font-size: 0.95em; font-weight: 500; cursor: pointer;">Copy agent prompt</button>
    <span id="copy-sync-agent-status" class="muted" style="font-size: 0.85em;"></span>
  </div>

  <pre id="sync-agent-prompt" style="background: var(--code); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-size: 0.85em; overflow-x: auto; line-height: 1.45; max-height: 500px; white-space: pre-wrap; word-break: break-word;"></pre>
</div>

<div class="card" style="max-width: 800px; margin-top: 1.5rem; background: #f8fafc;">
  <h2 style="margin-top: 0;">Architecture (in case you're curious)</h2>
  <p style="margin: 0.5rem 0;">
    Daemon watches your local folder via fsnotify. On change, it HTTP-PUTs to this worker's <code>/api/sync/object/&lt;key&gt;</code> endpoint. The worker writes to R2 via its binding (you don't need an R2 token), logs an audit row, fires the indexing queue, and (for markdown) repairs broken YAML frontmatter with Workers AI before storing.
  </p>
  <p style="margin: 0.5rem 0;">
    Periodic pulls (every 60 sec) fetch the worker's object listing and download anything new. Same bisync-keep-both pattern as goannad — if both sides changed, you get a <code>.conflict-&lt;timestamp&gt;</code> sibling locally to resolve manually.
  </p>
  <p style="margin: 0.5rem 0; font-size: 0.9em;" class="muted">
    Worker source: <a href="https://github.com/jezweb/office-town-cloud/blob/main/src/sync/routes.ts" target="_blank">src/sync/routes.ts</a> · Daemon source: <a href="https://github.com/jezweb/officetowd" target="_blank">jezweb/officetowd</a>
  </p>
</div>

<script>
const SYNC_AGENT_PROMPT = ${JSON.stringify(agentPrompt)};
const INSTALL_CMD = ${JSON.stringify(installCommand)};
const BREW_BLOCK = document.getElementById('brew-cmd').textContent;

document.getElementById('sync-agent-prompt').textContent = SYNC_AGENT_PROMPT;

function flashCopy(btnId, statusId, msg) {
  const status = document.getElementById(statusId);
  const btn = document.getElementById(btnId);
  status.textContent = msg;
  status.style.color = 'var(--green)';
  btn.style.background = 'var(--green)';
  setTimeout(() => { status.textContent = ''; btn.style.background = 'var(--accent)'; }, 2500);
}
function flashFail(btnId, statusId, err) {
  document.getElementById(statusId).textContent = 'Copy failed: ' + err.message;
  document.getElementById(statusId).style.color = 'var(--red)';
}

function copyInstallCmd() {
  navigator.clipboard.writeText(INSTALL_CMD)
    .then(() => flashCopy('copy-install-btn', 'copy-install-status', '✓ Copied — paste into terminal'))
    .catch((err) => flashFail('copy-install-btn', 'copy-install-status', err));
}
function copyBrew() {
  navigator.clipboard.writeText(BREW_BLOCK)
    .then(() => flashCopy('copy-brew-btn', 'copy-brew-status', '✓ Copied — paste into terminal'))
    .catch((err) => flashFail('copy-brew-btn', 'copy-brew-status', err));
}
function copySyncAgent() {
  navigator.clipboard.writeText(SYNC_AGENT_PROMPT)
    .then(() => flashCopy('copy-sync-agent-btn', 'copy-sync-agent-status', '✓ Copied — paste into your AI agent'))
    .catch((err) => flashFail('copy-sync-agent-btn', 'copy-sync-agent-status', err));
}
</script>`;

	// Reference effectiveBearer to defeat unused-var lint (it'd be useful
	// in future for a "bearer-baked install URL" pattern but we're keeping
	// the user as the gate for now).
	void effectiveBearer;

	return c.html(LAYOUT('Wire local sync - Office Town', content));
});
