// Wiki search — FTS5 + Vectorize, fused via RRF.

import type { WikiSearchInput, WikiTriageHit } from '@office-town/shared';
import type { Env } from '../types';

const RRF_K = 60; // reciprocal rank fusion constant

interface FtsRow {
	id: string;
	collection: string;
	slug: string;
	title: string | null;
	body: string;
	frontmatter_json: string;
	rank: number;
}

interface VectorMatch {
	id: string;
	score: number;
}

function makeExcerpt(body: string, query: string, max = 300): string {
	const terms = query
		.split(/\s+/)
		.filter((t) => t.length >= 2)
		.map((t) => t.toLowerCase());
	const lower = body.toLowerCase();

	let idx = -1;
	for (const term of terms) {
		const found = lower.indexOf(term);
		if (found !== -1 && (idx === -1 || found < idx)) {
			idx = found;
		}
	}
	if (idx === -1) return body.slice(0, max);

	const start = Math.max(0, idx - 80);
	const end = Math.min(body.length, start + max);
	const prefix = start > 0 ? '…' : '';
	const suffix = end < body.length ? '…' : '';
	return `${prefix}${body.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function signedUrl(_collection: string, _slug: string, _bearer: string | undefined): string {
	// In production this returns a tokenised URL the agent can fetch via wiki.read.
	// For now we return the MCP-tool-readable URI shape. The actual signing is done
	// by the publish/files endpoints — wiki entries are auth-protected anyway.
	return `wiki://${_collection}/${_slug}`;
}

export async function searchWiki(
	env: Env,
	input: WikiSearchInput
): Promise<WikiTriageHit[]> {
	const limit = Math.min(input.limit ?? 10, 50);
	const collectionFilter = input.collections && input.collections.length > 0 ? input.collections : null;

	// FTS5 query — basic phrase escaping.
	const ftsQuery = input.query
		.split(/\s+/)
		.filter((w) => w.length >= 2)
		.map((w) => w.replace(/"/g, '""'))
		.map((w) => `"${w}"*`)
		.join(' OR ');

	const ftsResults: FtsRow[] = [];
	if (ftsQuery.length > 0) {
		const collectionClause = collectionFilter
			? `AND e.collection IN (${collectionFilter.map(() => '?').join(',')})`
			: '';
		const stmt = env.DB.prepare(
			`SELECT e.id, e.collection, e.slug, e.title, e.body, e.frontmatter_json, bm25(wiki_fts) AS rank
			FROM wiki_fts
			JOIN wiki_entries e ON e.id = wiki_fts.id
			WHERE wiki_fts MATCH ? ${collectionClause}
			ORDER BY rank ASC
			LIMIT ?`
		);
		const params: unknown[] = [ftsQuery];
		if (collectionFilter) params.push(...collectionFilter);
		params.push(limit * 2);
		const rows = await stmt.bind(...params).all<FtsRow>();
		if (rows.results) ftsResults.push(...rows.results);
	}

	// Vector query — embed the input, fan out to Vectorize. Best-effort: skip on error.
	const vectorMatches: VectorMatch[] = [];
	try {
		const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [input.query] });
		const vector = (embed as { data: number[][] }).data?.[0];
		if (vector) {
			const queryOpts: { topK: number; filter?: { collection: { $in: string[] } } } = {
				topK: limit * 2,
			};
			if (collectionFilter) {
				queryOpts.filter = { collection: { $in: collectionFilter } };
			}
			const result = await env.VECTOR_INDEX.query(vector, queryOpts);
			for (const m of result.matches ?? []) {
				vectorMatches.push({ id: m.id, score: m.score });
			}
		}
	} catch (err) {
		console.error(JSON.stringify({ event: 'vector_query_failed', error: String(err) }));
	}

	// RRF fusion — rank from each source, score = sum of 1/(k+rank).
	const fused = new Map<string, { score: number; matchedBy: Set<'fts' | 'vector'> }>();
	ftsResults.forEach((r, idx) => {
		const existing = fused.get(r.id) ?? { score: 0, matchedBy: new Set<'fts' | 'vector'>() };
		existing.score += 1 / (RRF_K + idx + 1);
		existing.matchedBy.add('fts');
		fused.set(r.id, existing);
	});
	vectorMatches.forEach((m, idx) => {
		const existing = fused.get(m.id) ?? { score: 0, matchedBy: new Set<'fts' | 'vector'>() };
		existing.score += 1 / (RRF_K + idx + 1);
		existing.matchedBy.add('vector');
		fused.set(m.id, existing);
	});

	const ranked = [...fused.entries()]
		.sort((a, b) => b[1].score - a[1].score)
		.slice(0, limit);

	if (ranked.length === 0) return [];

	const ids = ranked.map(([id]) => id);
	const placeholders = ids.map(() => '?').join(',');
	const rows = await env.DB.prepare(
		`SELECT id, collection, slug, body, frontmatter_json
		FROM wiki_entries WHERE id IN (${placeholders})`
	)
		.bind(...ids)
		.all<{
			id: string;
			collection: string;
			slug: string;
			body: string;
			frontmatter_json: string;
		}>();

	const rowMap = new Map(
		(rows.results ?? []).map((r) => [r.id, r])
	);

	const hits: WikiTriageHit[] = [];
	for (const [id, { score, matchedBy }] of ranked) {
		const row = rowMap.get(id);
		if (!row) continue;
		const matched: WikiTriageHit['matched_by'] =
			matchedBy.size === 2 ? 'fused' : matchedBy.has('fts') ? 'fts' : 'vector';
		hits.push({
			collection: row.collection,
			slug: row.slug,
			score,
			matched_by: matched,
			frontmatter: JSON.parse(row.frontmatter_json),
			excerpt: makeExcerpt(row.body, input.query),
			signed_url: signedUrl(row.collection, row.slug, undefined),
		});
	}
	return hits;
}
