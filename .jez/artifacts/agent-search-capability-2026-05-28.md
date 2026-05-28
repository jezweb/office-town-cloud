# Agent Search Capability

**Date**: 2026-05-28
**Status**: Design requirement. Surfaced 2026-05-28 — agents working against Office Town need first-class search across files AND Cloudflare-hosted state, equivalent to what an agent has when working on a local Mac with terminal access.

## The gap

On a Mac with terminal, an agent can:
- `grep -r "pattern" .` across thousands of files in milliseconds
- `find . -name '*.md'` to enumerate by pattern
- Pipe results, count matches, sample lines, filter

Against Office Town today, the agent has:
- `wiki(action: get, slug)` — fetch one entry by slug
- `wiki(action: list, collection)` — list entries in a collection
- `wiki(action: search, query)` — FTS5 search over body text
- `wiki(action: related, slug)` — graph traversal

What's missing: **pattern search across both content AND structure**, including the raw archive, attachments, audit log, frontmatter values, and Vectorize-embedded chunks. An agent investigating "everywhere we've mentioned ABR verification" or "all the orgs where the primary contact's email is at the same domain as the org's website" needs to compose queries across multiple data stores.

## What an agent should be able to do

Concrete search shapes Office Town must support:

### 1. Content grep (FTS5 + raw archive)

> "Find every wiki entry mentioning 'state mismatch' in body or frontmatter."

Backed by FTS5 over `wiki_entries.body` + the raw archive's vectorised chunks. Returns entry slugs + relevance ranking + a few words of context per hit.

### 2. Structured field filter (D1)

> "All orgs where `vertical: insurance-broker` AND `status: active` AND no project linked in the last 12 months."

Backed by D1 SELECT joining `wiki_entries` + `wiki_links` + frontmatter-extracted columns. Returns entry slugs + the filter-matching fields.

### 3. Graph traversal

> "Starting from `contact:sarah-smith`, all orgs she's linked to, then all projects in those orgs, then all decisions in those projects."

Backed by recursive `wiki_links` walking. Returns the path of slugs.

### 4. Semantic similarity

> "Entries semantically similar to: 'we decided to move authentication from Better Auth to a custom implementation'."

Backed by Vectorize. Returns entry slugs + similarity scores.

### 5. Temporal slice

> "What did the cortex know about org `acme-corp` as of 2024-06-01?"

Backed by `wiki_audit` replay. Returns the entry state at the requested date.

### 6. Cross-store join

> "Every contact whose primary email domain doesn't match any of their linked orgs' domains."

Backed by D1 query + frontmatter parsing. Returns flagged entries.

### 7. Raw archive grep

> "Every email in the last 30 days mentioning a price quote between $5K and $50K."

Backed by Vectorize chunk search + range filters. Returns raw archive paths + the matching chunks.

### 8. Discrepancy detection

> "Entries where confidence < 0.7 OR review_status = pending OR status = stub."

Backed by D1 with the new cortex columns. Returns the agent's own backlog.

## Implementation: extend the wiki MCP

The existing wiki MCP gateway pattern already handles `get | list | search | related | create | update`. Add new actions:

### `wiki(action: grep, pattern, scope?, limit?)`

- `pattern` — substring or regex
- `scope` — array of `body | frontmatter | both | raw | attachments` (default: `both`)
- `limit` — max results (default: 50)

Returns: array of `{ slug, collection, hits: [{ field, snippet, line_number }] }`.

Internally:
- For `body | frontmatter | both`: FTS5 query
- For `raw`: Vectorize keyword filter + R2 spot-read for snippets
- For `attachments`: limited — most binaries aren't searchable; PDFs would need extraction (deferred to Session 4+)

### `wiki(action: filter, where, limit?)`

Structured filter expression evaluated against frontmatter + wiki_entries columns.

- `where` — object like `{ collection: 'orgs', frontmatter: { vertical: 'insurance-broker' }, status: 'active', confidence_gte: 0.8 }`
- `limit` — default 100

Returns: array of `{ slug, collection, matched_fields }`.

Internally: composes a D1 SELECT from the `where` clause. JSON path queries into `frontmatter_json` for frontmatter fields not promoted to columns.

### `wiki(action: walk, start_slug, edge_kinds?, max_depth?)`

Graph traversal from a starting entry following specific edge kinds.

- `start_slug` — entry to start from
- `edge_kinds` — array of `wiki_links.kind` values to follow (default: all)
- `max_depth` — default 3

Returns: array of paths `[{ from, kind, to }]`.

### `wiki(action: semantic, query, k?, filter?)`

Vectorize similarity search.

- `query` — text to embed and search against
- `k` — top K results (default 10)
- `filter` — optional metadata filter (collection, source_system)

Returns: array of `{ slug | raw_path, similarity_score }`.

### `wiki(action: at_date, slug, as_of)`

Temporal lookup — what did the entry look like at the given date?

- `slug` — entry to inspect
- `as_of` — ISO timestamp

Returns: `{ slug, body, frontmatter, last_change_at }` reconstructed from `wiki_audit`.

### `wiki(action: pending)`

The agent's own backlog — entries in stub/pending/low-confidence states.

Returns: `{ stubs: [], review_pending: [], low_confidence: [], stale: [] }` — slug lists per category.

## Why this is necessary for autonomy-default

The agent-autonomy-default doctrine assumes the agent can research before asking. That requires the *research tools to be there*. An agent that wants to verify a peer-vs-umbrella decision needs to:

- `wiki(action: filter, where: { collection: 'orgs', frontmatter: { primary_domain: 'acme-corp.example.com' } })` to find other orgs with the same domain
- `wiki(action: walk, start: 'org:acme-corp', edge_kinds: ['contacts'])` to find shared contacts
- `wiki(action: semantic, query: 'shared services with Acme')` for related conversations

If those tools don't exist, the agent has no choice but to ask the user.

The flip side is also true: an agent with rich search tools but no autonomy mandate will use them inefficiently. Both have to land together.

## Implementation effort

This is a Session 2-4 piece. Rough sizing:

| Action | Effort | Depends on |
|---|---|---|
| `grep` | Half session | Existing FTS5 |
| `filter` | Half session | D1 + JSON path |
| `walk` | Half session | `wiki_links` (already exists) |
| `semantic` | Half session | Vectorize (already exists) |
| `at_date` | One session | `wiki_audit` (already exists) — but reconstruction logic is the work |
| `pending` | 30 min | Just SELECTs |

About 3-4 sessions total. None of these block Session 1 — the foundation works without them. But they're the second-most-important capability after Session 1's foundation, because they're what makes autonomy real.

## Recommended sequence

Add to the roadmap as Tier 1 (alongside Curator role + skills):

- **Session 2 (or split into 2a/2b)**: Curator + Gmail demo + `wiki(action: grep|filter|pending)`. Without `grep` + `filter`, curator can't reconcile.
- **Session 3**: Reconciliation surface + `wiki(action: walk|semantic)`. The reconciler uses these heavily.
- **Session 4**: Temporal/at_date + lint pass. Less critical for ingestion; matters for the dashboard's time-travel UX.

## Related docs

- `agent-autonomy-default-2026-05-28.md` — the principle this capability serves
- `cortex-shape-2026-05-28.md` Q9 — reconciliation, which depends on these tools
- `curator-pattern-2026-05-28.md` — curator step 5, which now references "query the cortex" as a research step
- `mcp-gateway-pattern.md` (in ~/.claude/rules/) — the gateway-action shape the new actions follow
