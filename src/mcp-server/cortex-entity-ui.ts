// Entity card — the "CRM cell". A compact, data-driven view of one wiki entity
// (org / contact / project / decision / …). The SAME renderer adapts to
// whatever fields the entity actually has: a contact surfaces email/role, an
// org surfaces ABN/status, a project surfaces client/stage. Deterministic code,
// data-driven output — the data shapes the card, not hand-written markup.

import { esc, jsPrompt, uiPage } from './ui-kit';
import { icon } from './cortex-browser-ui';

// Frontmatter keys shown elsewhere (title/kind) or internal bookkeeping — not
// data rows. Keeps the card to the fields a person actually cares about.
const HIDE = new Set([
	'title', 'name', 'kind', 'slug', 'uuid', 'seed',
	'schema_version', 'status', 'confidence', 'review_status',
	'created', 'last_updated', 'last_edited_by', 'last_edited_at', 'last_change_summary',
]);

function fieldRows(fm: Record<string, unknown>): string {
	const rows = Object.entries(fm).filter(
		([k, v]) => !HIDE.has(k) && v != null && v !== '' && typeof v !== 'object',
	);
	if (!rows.length) return '';
	return (
		'<div class="kv">' +
		rows.map(([k, v]) => `<div class="kvrow"><span class="kvk">${esc(k)}</span><span class="kvv">${esc(v)}</span></div>`).join('') +
		'</div>'
	);
}

function summarise(body: string, n = 240): string {
	const t = body
		.replace(/^---[\s\S]*?---/, '')
		.replace(/^#.*$/gm, '')
		.replace(/[#>*`_[\]]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return t.length > n ? t.slice(0, n).trimEnd() + '…' : t;
}

function relChip(r: { collection: string; slug: string; kind?: string }): string {
	const open = `Open ${r.collection}/${r.slug} in the cortex browser.`;
	return `<button class="badge rel" onclick='act(${jsPrompt(open)})'>${icon(r.collection)} ${esc(r.slug)}${r.kind ? ` · ${esc(r.kind)}` : ''}</button>`;
}

export function renderEntityCard(
	collection: string,
	slug: string,
	frontmatter: Record<string, unknown>,
	body: string,
	related: { outgoing: Array<{ collection: string; slug: string; kind?: string }>; incoming: Array<{ collection: string; slug: string; kind?: string }> },
): string {
	const title = (frontmatter.title as string) ?? (frontmatter.name as string) ?? slug;
	const type = collection.replace(/s$/, '');
	const kind = frontmatter.kind as string | undefined;
	// Only show kind when it adds something beyond the collection type.
	const kindChip = kind && kind !== collection && kind !== type ? `<span class="badge">${esc(kind)}</span>` : '';
	const summary = summarise(body);

	const seen = new Set<string>();
	const rels = [...related.outgoing, ...related.incoming].filter((r) => {
		const k = `${r.collection}/${r.slug}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});

	const openFull = `Open ${collection}/${slug} in the cortex browser.`;
	const body_html = `
    <div class="badges"><span class="badge">${esc(type)}</span>${kindChip}</div>
    ${fieldRows(frontmatter)}
    ${summary ? `<div class="esum">${summary}</div>` : ''}
    ${rels.length ? `<div class="erel-h">Related</div><div class="badges">${rels.map(relChip).join('')}</div>` : ''}
    <div class="row" style="margin-top:14px;">
      <button class="btn primary sm" onclick='act(${jsPrompt(openFull)})'>Open full entry</button>
    </div>`;

	return uiPage({ title: `${icon(collection)} ${title}`, body: body_html });
}
