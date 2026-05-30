// Cortex browser panel — overview (collection tiles) → collection list →
// rendered markdown entry. Navigation is via `prompt` actions: a click asks
// the agent to re-open the browser at the next view (Goose stubs `tool`
// actions, so a click is one chat round-trip). When externalUrl + in-frame
// fetch lands, this becomes fluid in-panel navigation with no round-trip.

import { esc, jsPrompt, uiPage } from './ui-kit';

const ICONS: Record<string, string> = {
	orgs: '🏢', contacts: '👤', projects: '📋', decisions: '⚖️', knowledge: '📚',
	research: '🔬', people: '👥', sites: '📍', team: '🧑‍💼', owner: '🪪', business: '💼',
};
export const icon = (name: string): string => ICONS[name] ?? '📁';

const OPEN_BROWSER = 'Open the cortex browser.';
const browseCollection = (c: string) => `Browse the "${c}" collection in the cortex browser.`;
const openEntry = (c: string, s: string) => `Open "${c}/${s}" in the cortex browser.`;

function tile(name: string, count: number): string {
	return `<button class="tile" onclick='act(${jsPrompt(browseCollection(name))})'>
    <div class="tile-ico">${icon(name)}</div>
    <div class="tile-name">${esc(name)}</div>
    <div class="tile-count">${count} ${count === 1 ? 'entry' : 'entries'}</div>
  </button>`;
}

function entryRow(collection: string, slug: string, excerpt: string): string {
	return `<button class="entry" onclick='act(${jsPrompt(openEntry(collection, slug))})'>
    <div class="entry-slug">${icon(collection)} ${esc(slug)}</div>
    ${excerpt ? `<div class="entry-ex">${esc(excerpt)}</div>` : ''}
  </button>`;
}

export function renderOverview(
	collections: Array<{ name: string; count: number }>,
	recent: Array<{ collection: string; slug: string; excerpt: string }>,
): string {
	const tiles = collections.filter((c) => c.count > 0).map((c) => tile(c.name, c.count)).join('');
	const recentRows = recent.length
		? recent.map((r) => entryRow(r.collection, r.slug, r.excerpt)).join('')
		: `<div class="empty">Nothing filed yet. Drop a file in inbox/ and let filing-cabinet sort it.</div>`;
	return uiPage({
		title: 'Office Town — Cortex',
		subtitle: 'Everything your cortex knows. Tap a collection or a recent entry.',
		body: `
      <section><h2>Collections</h2>
        ${tiles ? `<div class="tiles">${tiles}</div>` : `<div class="empty">No collections yet.</div>`}
      </section>
      <section><h2>Recently filed</h2>${recentRows}</section>`,
	});
}

export function renderCollection(
	collection: string,
	entries: Array<{ slug: string; excerpt: string }>,
): string {
	const rows = entries.length
		? entries.map((e) => entryRow(collection, e.slug, e.excerpt)).join('')
		: `<div class="empty">No entries in ${esc(collection)} yet.</div>`;
	return uiPage({
		title: `${icon(collection)} ${collection}`,
		body: `
      <div class="crumb"><button class="btn ghost sm" onclick='act(${jsPrompt(OPEN_BROWSER)})'>← Cortex</button></div>
      ${rows}`,
	});
}

export function renderEntry(collection: string, slug: string, frontmatter: Record<string, unknown>, bodyHtml: string): string {
	const fmChips = Object.entries(frontmatter)
		.filter(([k]) => ['kind', 'status', 'org', 'client', 'role'].includes(k))
		.map(([k, v]) => `<span class="badge">${esc(k)}: ${esc(v)}</span>`)
		.join('');
	return uiPage({
		title: `${icon(collection)} ${slug}`,
		body: `
      <div class="crumb">
        <button class="btn ghost sm" onclick='act(${jsPrompt(OPEN_BROWSER)})'>← Cortex</button>
        <button class="btn ghost sm" onclick='act(${jsPrompt(browseCollection(collection))})'>${esc(collection)}</button>
      </div>
      ${fmChips ? `<div class="fm">${fmChips}</div>` : ''}
      <div class="md">${bodyHtml}</div>`,
	});
}
