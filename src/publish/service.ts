// Publish service — markdown -> public page at /p/<slug>.

import { Marked, type Tokens } from 'marked';
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

// Render options:
//   - imageBasePath: prefix for relative image srcs (so agents can write
//     `![alt](attachments/foo.png)` and have it resolve to the auth-gated
//     /dashboard/wiki-files/... route).
//   - wikilinkResolver: slug → resolution. Lets the renderer turn
//     `[[engagement-trace]]` into a direct link to the entity's detail
//     page when there's a unique match, a search link when the slug is
//     ambiguous (multiple collections), and a styled "broken" link when
//     no match exists yet. Build the map BEFORE rendering with
//     resolveWikilinks(env, md).
export interface WikilinkTarget {
	collection: string;
	slug: string;
	title: string | null;
}

export type WikilinkResolution =
	| { kind: 'resolved'; target: WikilinkTarget }
	| { kind: 'ambiguous'; candidates: WikilinkTarget[] }
	| { kind: 'broken' };

export interface MarkdownRenderOptions {
	imageBasePath?: string;
	wikilinkResolver?: (slug: string) => WikilinkResolution;
}

const ABSOLUTE_HREF_PATTERN = /^(https?:\/\/|data:|\/)/i;
const WIKILINK_SCAN_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * Scan markdown for [[wikilink]] references and resolve them against D1
 * in a single batched query. Returns a resolver function suitable for
 * passing as `wikilinkResolver` to renderMarkdownBody / renderMarkdownToHtml.
 */
export async function resolveWikilinks(
	env: Env,
	md: string,
): Promise<(slug: string) => WikilinkResolution> {
	const slugs = new Set<string>();
	for (const match of md.matchAll(WIKILINK_SCAN_PATTERN)) {
		slugs.add(match[1].trim());
	}
	if (slugs.size === 0) {
		return () => ({ kind: 'broken' });
	}

	const placeholders = Array.from(slugs).map(() => '?').join(',');
	const rows = await env.DB.prepare(
		`SELECT collection, slug, title FROM wiki_entries WHERE slug IN (${placeholders}) AND status != 'deleted'`,
	)
		.bind(...slugs)
		.all<{ collection: string; slug: string; title: string | null }>();

	const grouped = new Map<string, WikilinkTarget[]>();
	for (const row of rows.results ?? []) {
		const list = grouped.get(row.slug) ?? [];
		list.push(row);
		grouped.set(row.slug, list);
	}

	return (slug: string): WikilinkResolution => {
		const candidates = grouped.get(slug);
		if (!candidates || candidates.length === 0) return { kind: 'broken' };
		if (candidates.length === 1) return { kind: 'resolved', target: candidates[0] };
		return { kind: 'ambiguous', candidates };
	};
}

// One Marked instance per render — keeps extension state scoped to the
// call. Marked's image renderer is overridden to apply imageBasePath;
// the wikilink extension handles `[[slug]]` and `[[slug|Label]]`.
function buildRenderer(options: MarkdownRenderOptions = {}): Marked {
	const m = new Marked({ gfm: true, breaks: false, async: false });

	m.use({
		extensions: [
			{
				name: 'wikilink',
				level: 'inline',
				start(src: string) {
					return src.indexOf('[[');
				},
				tokenizer(src: string) {
					const match = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src);
					if (match) {
						return {
							type: 'wikilink',
							raw: match[0],
							slug: match[1].trim(),
							label: (match[2] ?? match[1]).trim(),
						};
					}
					return undefined;
				},
				renderer(token: Tokens.Generic) {
					const slug = String(token.slug);
					const label = String(token.label);
					const safeSlug = slug.replace(/"/g, '&quot;');
					const safeLabel = label
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;');

					const resolution = options.wikilinkResolver?.(slug) ?? { kind: 'broken' as const };

					if (resolution.kind === 'resolved') {
						const t = resolution.target;
						const titleAttr = t.title ? ` title="${t.title.replace(/"/g, '&quot;')}"` : '';
						return `<a href="/dashboard/wiki/${encodeURIComponent(t.collection)}/${encodeURIComponent(t.slug)}" class="wikilink wikilink-resolved"${titleAttr}>${safeLabel}</a>`;
					}
					if (resolution.kind === 'ambiguous') {
						return `<a href="/dashboard/wiki?q=${encodeURIComponent(safeSlug)}" class="wikilink wikilink-ambiguous" title="Multiple entries share this slug — search to pick">${safeLabel}</a>`;
					}
					// broken — no matching entry yet
					return `<a href="/dashboard/wiki?q=${encodeURIComponent(safeSlug)}" class="wikilink wikilink-broken" title="No entry yet for &quot;${safeSlug}&quot;">${safeLabel}</a>`;
				},
			},
		],
		renderer: {
			image(token: Tokens.Image) {
				let href = token.href ?? '';
				if (options.imageBasePath && !ABSOLUTE_HREF_PATTERN.test(href)) {
					href = `${options.imageBasePath.replace(/\/$/, '')}/${href.replace(/^\.\//, '')}`;
				}
				const safeHref = href.replace(/"/g, '&quot;');
				const safeAlt = (token.text ?? '').replace(/"/g, '&quot;');
				const safeTitle = token.title ? ` title="${token.title.replace(/"/g, '&quot;')}"` : '';
				return `<img src="${safeHref}" alt="${safeAlt}"${safeTitle} loading="lazy" style="max-width: 100%; height: auto;">`;
			},
		},
	});

	return m;
}

/**
 * Render markdown to body HTML only (no <html>/<head>/<style> wrapper).
 * Used by the dashboard which has its own LAYOUT.
 */
export function renderMarkdownBody(md: string, options: MarkdownRenderOptions = {}): string {
	const m = buildRenderer(options);
	return m.parse(md, { async: false }) as string;
}

/**
 * Render markdown to a full standalone HTML page. Used by the public
 * /p/<slug> publish path.
 */
export function renderMarkdownToHtml(md: string, title: string, options: MarkdownRenderOptions = {}): string {
	const escape = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const body = renderMarkdownBody(md, options);
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
table { border-collapse: collapse; margin: 1em 0; width: 100%; }
table th, table td { border: 1px solid var(--border); padding: 0.5em 0.75em; text-align: left; }
table th { background: var(--code); font-weight: 600; }
img { max-width: 100%; height: auto; border-radius: 6px; }
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
