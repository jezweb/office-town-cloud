// Publish service — markdown -> public page at /p/<slug>.

import type { Env } from '../types';

export interface PublishInput {
	slug: string;
	title?: string;
	markdown: string;
	visibility?: 'public' | 'unlisted';
}

export interface PublishedPage {
	slug: string;
	title: string;
	visibility: 'public' | 'unlisted';
	created_at: string;
	updated_at: string;
	public_url: string;
}

const PUBLISH_PREFIX = 'published/';
const META_PREFIX = 'published-meta/';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const LIST_UL_PATTERN = /^[-*]\s+/;
const LIST_OL_PATTERN = /^\d+\.\s+/;
const FENCE_PATTERN = /^```/;
const QUOTE_PATTERN = /^>\s/;
const HR_PATTERN = /^-{3,}$|^\*{3,}$/;
const BLOCK_BREAK_PATTERN = /^(#{1,6}|>\s|[-*]\s+|\d+\.\s+|```|\|)/;
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const ITALIC_PATTERN = /\*([^*]+)\*/g;
const CODE_PATTERN = /`([^`]+)`/g;
const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const TABLE_ROW_PATTERN = /^\|(.+)\|\s*$/;
const TABLE_SEPARATOR_PATTERN = /^\|(\s*:?-+:?\s*\|)+\s*$/;

function isValidPublishSlug(slug: string): boolean {
	return SLUG_PATTERN.test(slug);
}

function defaultTitle(slug: string): string {
	return slug
		.split('-')
		.map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

export class PublishService {
	constructor(private readonly env: Env) {}

	async publish(input: PublishInput): Promise<PublishedPage> {
		if (!isValidPublishSlug(input.slug)) {
			throw new Error(`Invalid slug: ${input.slug}`);
		}
		const visibility = input.visibility ?? 'public';
		const now = new Date().toISOString();
		const title = input.title ?? defaultTitle(input.slug);

		await this.env.FILES.put(`${PUBLISH_PREFIX}${input.slug}.md`, input.markdown, {
			httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
		});

		const existingMeta = await this.env.FILES.get(`${META_PREFIX}${input.slug}.json`);
		const createdAt = existingMeta
			? ((await existingMeta.json()) as PublishedPage).created_at
			: now;

		const meta: PublishedPage = {
			slug: input.slug,
			title,
			visibility,
			created_at: createdAt,
			updated_at: now,
			public_url: `/p/${input.slug}`,
		};
		await this.env.FILES.put(`${META_PREFIX}${input.slug}.json`, JSON.stringify(meta), {
			httpMetadata: { contentType: 'application/json' },
		});

		return meta;
	}

	async unpublish(slug: string): Promise<void> {
		await this.env.FILES.delete(`${PUBLISH_PREFIX}${slug}.md`);
		await this.env.FILES.delete(`${META_PREFIX}${slug}.json`);
	}

	async readPublic(slug: string): Promise<{ markdown: string; meta: PublishedPage } | null> {
		const [mdObj, metaObj] = await Promise.all([
			this.env.FILES.get(`${PUBLISH_PREFIX}${slug}.md`),
			this.env.FILES.get(`${META_PREFIX}${slug}.json`),
		]);
		if (!mdObj || !metaObj) return null;
		const markdown = await mdObj.text();
		const meta = (await metaObj.json()) as PublishedPage;
		return { markdown, meta };
	}

	async list(): Promise<PublishedPage[]> {
		const listing = await this.env.FILES.list({ prefix: META_PREFIX, limit: 1000 });
		const pages = await Promise.all(
			listing.objects.map(async (obj) => {
				const meta = await this.env.FILES.get(obj.key);
				if (!meta) return null;
				return (await meta.json()) as PublishedPage;
			})
		);
		return pages.filter((p): p is PublishedPage => p !== null);
	}
}

/**
 * Minimal markdown -> HTML renderer. Inline, no external dep. Covers
 * headings, paragraphs, fenced code, lists, links, bold/italic, blockquotes.
 */
export function renderMarkdownToHtml(md: string, title: string): string {
	const escape = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const body = renderBlocks(md, escape);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root { --bg: #fafafa; --fg: #1a1a1a; --muted: #6b6b6b; --accent: #2563eb; --code: #f4f4f5; --border: #e5e7eb; }
* { box-sizing: border-box; }
body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--fg); background: var(--bg); margin: 0; padding: 2rem 1rem; }
main { max-width: 720px; margin: 0 auto; padding: 2rem; background: white; border: 1px solid var(--border); border-radius: 12px; }
h1, h2, h3, h4 { line-height: 1.2; margin-top: 1.5em; }
h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
p { margin: 1em 0; }
a { color: var(--accent); }
code { background: var(--code); padding: 2px 5px; border-radius: 4px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.9em; }
pre { background: var(--code); padding: 1rem; border-radius: 8px; overflow-x: auto; }
pre code { background: transparent; padding: 0; }
blockquote { border-left: 3px solid var(--accent); margin: 1em 0; padding-left: 1em; color: var(--muted); }
ul, ol { padding-left: 1.5em; }
hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
footer { max-width: 720px; margin: 1rem auto; color: var(--muted); font-size: 0.85em; text-align: center; }
</style>
</head>
<body>
<main>
${body}
</main>
<footer>Published with Office Town Cloud</footer>
</body>
</html>`;
}

function renderBlocks(md: string, escape: (s: string) => string): string {
	const lines = md.split('\n');
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (FENCE_PATTERN.test(line)) {
			const lang = line.slice(3).trim();
			i++;
			const code: string[] = [];
			while (i < lines.length && !FENCE_PATTERN.test(lines[i])) {
				code.push(lines[i]);
				i++;
			}
			i++;
			out.push(
				`<pre><code${lang ? ` class="language-${escape(lang)}"` : ''}>${escape(code.join('\n'))}</code></pre>`
			);
			continue;
		}

		const heading = HEADING_PATTERN.exec(line);
		if (heading) {
			const level = heading[1].length;
			out.push(`<h${level}>${renderInline(heading[2], escape)}</h${level}>`);
			i++;
			continue;
		}

		if (QUOTE_PATTERN.test(line)) {
			const quote: string[] = [];
			while (i < lines.length && QUOTE_PATTERN.test(lines[i])) {
				quote.push(lines[i].replace(QUOTE_PATTERN, ''));
				i++;
			}
			out.push(`<blockquote>${renderInline(quote.join(' '), escape)}</blockquote>`);
			continue;
		}

		if (LIST_UL_PATTERN.test(line)) {
			const items: string[] = [];
			while (i < lines.length && LIST_UL_PATTERN.test(lines[i])) {
				items.push(`<li>${renderInline(lines[i].replace(LIST_UL_PATTERN, ''), escape)}</li>`);
				i++;
			}
			out.push(`<ul>${items.join('')}</ul>`);
			continue;
		}

		if (LIST_OL_PATTERN.test(line)) {
			const items: string[] = [];
			while (i < lines.length && LIST_OL_PATTERN.test(lines[i])) {
				items.push(`<li>${renderInline(lines[i].replace(LIST_OL_PATTERN, ''), escape)}</li>`);
				i++;
			}
			out.push(`<ol>${items.join('')}</ol>`);
			continue;
		}

		if (HR_PATTERN.test(line.trim())) {
			out.push('<hr>');
			i++;
			continue;
		}

		// GFM table: header row matching `^| col | col |$`, then a separator
		// row matching `^| --- | --- |$`, then any number of body rows.
		if (TABLE_ROW_PATTERN.test(line) && i + 1 < lines.length && TABLE_SEPARATOR_PATTERN.test(lines[i + 1])) {
			const headers = splitTableRow(line);
			i += 2; // skip header + separator
			const bodyRows: string[][] = [];
			while (i < lines.length && TABLE_ROW_PATTERN.test(lines[i])) {
				bodyRows.push(splitTableRow(lines[i]));
				i++;
			}
			const headerCells = headers.map((h) => `<th>${renderInline(h, escape)}</th>`).join('');
			const bodyHtml = bodyRows
				.map((row) => {
					const cells = row.map((c) => `<td>${renderInline(c, escape)}</td>`).join('');
					return `<tr>${cells}</tr>`;
				})
				.join('');
			out.push(
				`<table class="md-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
			);
			continue;
		}

		if (line.trim() === '') {
			i++;
			continue;
		}

		const para: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() !== '' &&
			!BLOCK_BREAK_PATTERN.test(lines[i])
		) {
			para.push(lines[i]);
			i++;
		}
		out.push(`<p>${renderInline(para.join(' '), escape)}</p>`);
	}

	return out.join('\n');
}

function renderInline(text: string, escape: (s: string) => string): string {
	let result = escape(text);
	result = result.replace(CODE_PATTERN, '<code>$1</code>');
	result = result.replace(BOLD_PATTERN, '<strong>$1</strong>');
	result = result.replace(ITALIC_PATTERN, '<em>$1</em>');
	result = result.replace(LINK_PATTERN, (_, label, href) => {
		const safeHref = href.replace(/"/g, '&quot;');
		return `<a href="${safeHref}">${label}</a>`;
	});
	// [[wiki-link]] or [[slug|Label]] -> search link to wiki for now
	result = result.replace(WIKILINK_PATTERN, (_, slug, label) => {
		const safeSlug = slug.trim().replace(/"/g, '&quot;');
		const linkLabel = (label ?? slug).trim();
		return `<a href="/dashboard/wiki?q=${encodeURIComponent(safeSlug)}" class="wikilink">${linkLabel}</a>`;
	});
	return result;
}

// Split a "| col1 | col2 | col3 |" row into ["col1", "col2", "col3"].
function splitTableRow(line: string): string[] {
	const matched = line.match(TABLE_ROW_PATTERN);
	if (!matched) return [];
	return matched[1].split('|').map((c) => c.trim());
}
