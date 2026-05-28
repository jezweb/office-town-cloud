# Session 1 Build Spec — Cortex Foundation

**Date**: 2026-05-28
**Status**: Build-ready. A future session can open this cold and start construction without re-deriving design decisions.

**Companion plan**: `cortex-shape-2026-05-28.md` (the why and shape — read first if returning cold without context).

---

## TL;DR

By the end of Session 1, the worker accepts `POST /api/ingest` with structured content, runs Workers AI extraction against a per-collection schema, and writes a typed wiki entry with provenance back to immutable `raw/` content. Frontmatter is the source of truth; `wiki_links` rows are derived from it on write. Six starter collections exist with their CLAUDE.md schema docs and frontmatter contracts.

**Demo at the end**:
```bash
curl -X POST https://<worker>/api/ingest \
  -H "Authorization: Bearer <bearer>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "<text of an email about Acme Corp>",
    "target_collection": "inbox",
    "source_ref": { "source_system": "manual", "source_id": "demo-001", "fetched_at": "2026-05-28T..." },
    "agent_slug": "test",
    "why": "first ingest demo"
  }'
# Returns: { ok: true, entry_slug: "inbox/<sha>/...", raw_path: "raw/manual/demo-001", derived: { ... } }

# Verify in dashboard:
# /dashboard/wiki/inbox shows the new entry with derived_from
# /dashboard/wiki/orgs may show an Acme stub if the extractor confidently named one
# Audit log shows write with why
```

---

## Pre-flight checks (verify BEFORE coding)

Run these first. If any fail, stop and fix before writing code.

```bash
# 1. Worker deploys cleanly with current main
cd /Users/jez/Documents/office-town-cloud
wrangler deploy --dry-run
# Should print compile success + bundle size

# 2. D1 schema matches src/db/schema.ts
wrangler d1 execute office-town --remote --command "PRAGMA table_info(wiki_entries)" --json | jq '.[0].results | length'
# Should be 14 (current schema column count)

# 3. wiki_collections already seeded (the 11 starter rows from bootstrap)
wrangler d1 execute office-town --remote --command "SELECT count(*) as c FROM wiki_collections" --json | jq '.[0].results[0].c'
# Should be 11 or more

# 4. Workers AI binding works
wrangler tail --once   # then trigger any AI-using endpoint and confirm @cf/openai/gpt-oss-20b returns

# 5. R2 binding works
wrangler r2 object list office-town --prefix wiki/ | head -3
# Should list existing wiki content
```

---

## Naming conventions used throughout

- **Migration files**: `drizzle/000<n>_<topic>.sql` (e.g. `drizzle/0001_cortex_foundation.sql`)
- **D1 columns**: snake_case, suffix `_json` for stringified JSON, `_at` for timestamps
- **TypeScript types**: PascalCase interfaces, camelCase fields (Drizzle handles the snake↔camel boundary)
- **Route paths**: `/api/<area>/<verb>` (e.g. `/api/ingest`, `/api/sync/object/:key`)
- **R2 keys**: `wiki/<collection>/<slug>/<filename>` for canonical, `wiki/raw/<source>/<id>.md` for archive
- **Status values**: `active | stale | dormant | archived | stub` (extending current `active | archived | deleted` — `deleted` stays but is reserved for tombstones not soft-state)
- **Audit `agent_slug` for these endpoints**: `ingest-api` (for /api/ingest), `bootstrap` (for migration), `derivation` (for the worker-side wiki_links derivation pass)

---

## Phase 1.0 — D1 schema additions

**Goal**: Extend `wiki_entries` with cortex columns + extend `wiki_collections` with schema_version and config_json.

### File: `drizzle/0001_cortex_foundation.sql` (new)

Drizzle keeps this as the canonical migration record. The actual application-time migration runs through `src/bootstrap.ts` (self-healing).

```sql
-- Cortex foundation: extend wiki_entries with structured-ingestion fields
-- and wiki_collections with schema versioning + config.

ALTER TABLE wiki_entries ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wiki_entries ADD COLUMN superseded_by TEXT;
ALTER TABLE wiki_entries ADD COLUMN valid_from TEXT;
ALTER TABLE wiki_entries ADD COLUMN valid_until TEXT;
ALTER TABLE wiki_entries ADD COLUMN confidence REAL;
ALTER TABLE wiki_entries ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE wiki_entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wiki_entries ADD COLUMN references_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wiki_entries ADD COLUMN query_hits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wiki_entries ADD COLUMN last_referenced_at TEXT;
ALTER TABLE wiki_entries ADD COLUMN relevance_score REAL NOT NULL DEFAULT 0;
ALTER TABLE wiki_entries ADD COLUMN aliases_json TEXT;

ALTER TABLE wiki_collections ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wiki_collections ADD COLUMN config_json TEXT;

-- Internal-migration tracker so bootstrap.ts knows what's been applied.
-- (Drizzle's own tracker handles the .sql files; this one handles
-- bootstrap.ts's self-healing pass against a freshly-restored DB.)
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (name, applied_at)
  VALUES ('0001_cortex_foundation', datetime('now'));

-- Indexes for the new query paths
CREATE INDEX IF NOT EXISTS idx_wiki_entries_status_relevance
  ON wiki_entries(collection, status, relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_entries_last_referenced
  ON wiki_entries(last_referenced_at);

CREATE INDEX IF NOT EXISTS idx_wiki_entries_review
  ON wiki_entries(review_status, collection)
  WHERE review_status != 'approved';
```

### File: `src/bootstrap.ts` (modify)

Bootstrap.ts is the runtime self-healing path. Add a small helper that uses `schema_migrations` as a flag, plus `PRAGMA table_info` to safely ALTER only when needed.

```typescript
// Add near the top, after the STATEMENTS array
async function applyAlterIfMissing(
  db: D1Database,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = info.results?.some((row) => (row as { name: string }).name === column);
  if (!exists) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    console.log(JSON.stringify({ event: 'bootstrap_add_column', table, column }));
  }
}

// Then in bootstrap()'s main loop (after STATEMENTS run), add:
async function applyCortexFoundation(env: Env): Promise<void> {
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'schema_version', 'INTEGER NOT NULL DEFAULT 1');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'superseded_by', 'TEXT');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'valid_from', 'TEXT');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'valid_until', 'TEXT');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'confidence', 'REAL');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'review_status', "TEXT NOT NULL DEFAULT 'approved'");
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'references_in', 'INTEGER NOT NULL DEFAULT 0');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'query_hits', 'INTEGER NOT NULL DEFAULT 0');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'last_referenced_at', 'TEXT');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'relevance_score', 'REAL NOT NULL DEFAULT 0');
  await applyAlterIfMissing(env.DB, 'wiki_entries', 'aliases_json', 'TEXT');
  await applyAlterIfMissing(env.DB, 'wiki_collections', 'schema_version', 'INTEGER NOT NULL DEFAULT 1');
  await applyAlterIfMissing(env.DB, 'wiki_collections', 'config_json', 'TEXT');

  // Indexes (idempotent)
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wiki_entries_status_relevance
    ON wiki_entries(collection, status, relevance_score DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wiki_entries_last_referenced
    ON wiki_entries(last_referenced_at)`).run();

  // schema_migrations tracker
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (name, applied_at)
    VALUES ('0001_cortex_foundation', datetime('now'))`).run();
}
```

Call `applyCortexFoundation(env)` from the existing bootstrap entry-point right after the existing STATEMENTS loop.

### File: `src/db/schema.ts` (modify — Drizzle types)

Update the `wikiEntries` + `wikiCollections` declarations to include the new columns. Match the SQL types exactly. Add a new `schemaMigrations` table.

```typescript
export const wikiEntries = sqliteTable('wiki_entries', {
  // existing 14 columns above...
  schema_version: integer('schema_version').notNull().default(1),
  superseded_by: text('superseded_by'),
  valid_from: text('valid_from'),
  valid_until: text('valid_until'),
  confidence: integer('confidence', { mode: 'number' }),   // Drizzle SQLite quirk; treat as REAL at runtime
  review_status: text('review_status').notNull().default('approved'),
  pinned: integer('pinned').notNull().default(0),
  references_in: integer('references_in').notNull().default(0),
  query_hits: integer('query_hits').notNull().default(0),
  last_referenced_at: text('last_referenced_at'),
  relevance_score: integer('relevance_score', { mode: 'number' }).notNull().default(0),
  aliases_json: text('aliases_json'),
});

export const wikiCollections = sqliteTable('wiki_collections', {
  // existing columns above...
  schema_version: integer('schema_version').notNull().default(1),
  config_json: text('config_json'),
});

export const schemaMigrations = sqliteTable('schema_migrations', {
  name: text('name').primaryKey(),
  applied_at: text('applied_at').notNull(),
});
```

### Verification gate 1.0 — must pass before continuing

```bash
# 1. Deploy
wrangler deploy

# 2. Trigger bootstrap (any GET endpoint that calls bootstrap on startup will do)
curl -s https://<worker>/dashboard | head -5

# 3. Confirm columns exist
wrangler d1 execute office-town --remote --command "PRAGMA table_info(wiki_entries)" --json \
  | jq '.[0].results[].name' | grep -c -E "schema_version|relevance_score|review_status"
# Should be 3 (or more)

# 4. Confirm schema_migrations row written
wrangler d1 execute office-town --remote --command "SELECT * FROM schema_migrations" --json \
  | jq '.[0].results[].name'
# Should include "0001_cortex_foundation"

# 5. Confirm existing wiki_entries still queryable (no regression)
wrangler d1 execute office-town --remote --command \
  "SELECT id, status, schema_version, relevance_score FROM wiki_entries LIMIT 5" --json
# Should return rows with defaults for new columns
```

---

## Phase 1.1 — Collection schemas + per-collection CLAUDE.md

**Goal**: Define the six starter collections' schemas (required fields + voice + allowed subfolders), one CLAUDE.md per collection, and seed them into D1 + R2.

### File: `src/wiki/seeds/collections.ts` (new)

```typescript
/**
 * Starter collection definitions for Office Town's cortex.
 * Each entry is the seed-of-record for D1 wiki_collections + the
 * source-of-truth for the per-collection CLAUDE.md at wiki/<col>/CLAUDE.md.
 */

export interface CollectionSeed {
  name: string;
  shape: 'entity-as-folder' | 'dated-stream' | 'flat-topic' | 'content-hash';
  canonical_filename: string;
  description: string;
  schema_version: number;
  required_fields: string[];
  relationship_fields: string[];   // names of frontmatter fields that hold ID arrays
  allowed_subfolders: string[];     // notes/, sessions/, research/, attachments/, etc.
  claudeMd: string;                 // the schema doc body
}

const FRONTMATTER_NOTE = `Required frontmatter sextet on every entry:

- \`slug\` — stable ID assigned at first observation. Never renamed.
- \`kind\` — entry type (matches collection name)
- \`created\` — ISO timestamp of first write
- \`last_updated\` — ISO timestamp of most recent write
- \`last_edited_by\` — agent slug or user identifier
- \`last_change_summary\` — one-line why for the most recent change

Plus universal extensions:

- \`schema_version\` — integer; bumps when this collection's required_fields change
- \`status\` — one of: active | stale | dormant | archived | stub
- \`derived_from\` — array of raw/ archive IDs this entry was derived from
- \`confidence\` — 0.0-1.0, for auto-generated entries
- \`review_status\` — pending | approved | rejected (most entries default to approved)
`;

export const STARTER_COLLECTIONS: CollectionSeed[] = [
  {
    name: 'inbox',
    shape: 'content-hash',
    canonical_filename: 'entry.md',
    description: 'Staging area for ingested raw content awaiting classification or promotion.',
    schema_version: 1,
    required_fields: ['source_system', 'source_id'],
    relationship_fields: ['related_to', 'derived_from'],
    allowed_subfolders: [],
    claudeMd: `# Inbox

Short-lived staging collection. Curator writes here when content arrives that hasn't yet been
classified into a typed collection (orgs/contacts/projects/decisions/knowledge).

## Path shape

\`wiki/inbox/<sha-prefix>/<content-hash>.md\` — SHA prefix (first 2 chars of the sha256 of content)
keeps R2 listings manageable. Filename is the full content hash. Two identical inputs land at the
same path, dedup is automatic.

## When entries leave inbox

- **Promoted** → curator runs classification + extraction; new typed entry gets written; this entry
  gets \`status: archived\` and \`superseded_by: <typed-entry-slug>\`.
- **Discarded** → not relevant; status flips to \`dormant\` and stays for forensics.
- **Aged out** → after 90 days untouched and unreferenced, status flips to \`dormant\`. Never
  deleted; raw archive holds the original.

## Required frontmatter

${FRONTMATTER_NOTE}

Plus inbox-specific:

- \`source_system\` — e.g. \`gmail\`, \`slack\`, \`manual\`, \`jim2\`
- \`source_id\` — the source system's ID for this content (Gmail message ID, Slack ts, manual UUID)
- \`fetched_at\` — when curator pulled this in
- \`raw_path\` — pointer into \`wiki/raw/\` for the immutable archive

## Voice

Minimal narrative. Curator may add a one-sentence summary at the top. Body is the original content
or a faithful excerpt. NOT a summary — that's what typed entries are for.

## Lint rules

- Must have \`source_system\` + \`source_id\`
- Must have \`derived_from\` pointing to a \`raw/\` entry, OR have its own body be the raw content
- Title is auto-generated if absent: first 60 chars of body
`,
  },

  {
    name: 'orgs',
    shape: 'entity-as-folder',
    canonical_filename: 'entity.md',
    description: 'External organisations (clients, vendors, partners, leads).',
    schema_version: 1,
    required_fields: ['name', 'entity_type'],
    relationship_fields: ['contacts', 'projects', 'related_orgs', 'derived_from'],
    allowed_subfolders: ['notes', 'sessions', 'research', 'attachments', 'findings'],
    claudeMd: `# Orgs

External organisations the cortex owner does business with: clients, vendors, partners, prospects.

## Path shape

\`wiki/orgs/<slug>/entity.md\` (canonical), with optional subfolders:

- \`notes/<date>.md\` — ad-hoc working notes
- \`sessions/<date>.md\` — meeting/call narratives
- \`research/<topic>.md\` — investigations
- \`findings/<topic>.md\` — audit results
- \`attachments/<file>\` — binaries (contracts, logos, docs)

## Required frontmatter

${FRONTMATTER_NOTE}

Plus org-specific:

- \`name\` — display name (e.g. "Acme Corporation Pty Ltd")
- \`entity_type\` — client | vendor | partner | prospect | dormant
- \`abn\` (optional) — Australian Business Number if applicable. Required before writing \`vertical:\` or \`groups:\`.
- \`vertical\` (optional) — industry classification. Don't write without ABR verification.
- \`groups\` (optional) — cross-cutting attributes (e.g. \`["referrable", "active-projects"]\`)
- \`primary_contact\` — slug of the contact who's the main point
- \`contacts\` — array of contact slugs at this org
- \`projects\` — array of project slugs run with this org
- \`related_orgs\` — array of org slugs (sister entities, parents, subsidiaries) with relationship notes in body
- \`aliases\` — array of alternative names this org has been known by (e.g. previous trading names)

## Peer-record vs umbrella

When an entity operates multiple legal entities, decide:

- **Peer records** (separate \`orgs/\` folders) when service relationships are independent (separate
  domain, separate hosting, separate support history)
- **Umbrella section** (section inside parent's entity.md) when legally distinct but operationally
  unified (shared domain, shared hosting, shared support footprint)

Diagnostic: *"Does the cortex owner have two separate service relationships, or one?"*

## Voice

- Thin record: ~30-80 lines. Frontmatter does the structured work; body has narrative.
- Lead with one-sentence what-they-are. Then current relationship summary. Then notable history.
- Don't pad. Pages are as long as they need to be.
- Source claims: \`source: <url-or-doc>\` for non-obvious facts. Audit trail comes from \`wiki_audit\`.

## Lint rules

- Required: \`name\`, \`entity_type\`
- Must have at least one outbound link (either via \`contacts\`, \`projects\`, or in the body) — "a note without links is a bug"
- If \`vertical\` is set, \`abn\` must be set (ABR-verify-first discipline)
- If \`status: stub\`, surface in dashboard as needing completion
`,
  },

  {
    name: 'contacts',
    shape: 'entity-as-folder',
    canonical_filename: 'contact.md',
    description: 'External people (employees of orgs, contractors, individuals).',
    schema_version: 1,
    required_fields: ['name'],
    relationship_fields: ['orgs', 'projects', 'derived_from'],
    allowed_subfolders: ['notes', 'sessions', 'attachments'],
    claudeMd: `# Contacts

External people. Employees of orgs the cortex owner works with; contractors; individuals.

## Path shape

\`wiki/contacts/<slug>/contact.md\` (canonical) + optional \`notes/\`, \`sessions/\`, \`attachments/\` subfolders.

## Required frontmatter

${FRONTMATTER_NOTE}

Plus contact-specific:

- \`name\` — display name
- \`email\` — primary email
- \`phone\` (optional) — primary phone
- \`role\` (optional) — job title or role
- \`orgs\` — array of org slugs this contact is associated with
- \`primary_org\` (optional) — slug of the contact's main org
- \`projects\` — array of project slugs this contact participates in
- \`last_contacted_at\` (optional) — timestamp of last meaningful interaction
- \`relationship_history\` (optional) — array of \`{period, role}\` records for tracking role changes over time

## Voice

- Thin record. Frontmatter for filterable fields; prose for the rest.
- Recent interactions in body, date-stamped; trim as prose absorbs them.
- No personal commentary; factual + sourced.

## Lint rules

- Required: \`name\`
- Must have at least one of: \`email\`, \`phone\`, or a body that includes contact info
- Must have at least one \`orgs\` entry OR be explicitly tagged \`independent\`
- "Source or it didn't happen" — body claims about a person should cite where they came from
`,
  },

  {
    name: 'projects',
    shape: 'entity-as-folder',
    canonical_filename: 'project.md',
    description: 'Active or historical projects (client work, internal initiatives).',
    schema_version: 1,
    required_fields: ['name'],
    relationship_fields: ['org', 'contacts', 'related_projects', 'decisions', 'derived_from'],
    allowed_subfolders: ['notes', 'sessions', 'research', 'attachments', 'findings', 'plans'],
    claudeMd: `# Projects

Active or historical work — client projects, internal initiatives, experiments. Each project
is an entity with a defined scope and (eventually) outcome.

## Path shape

\`wiki/projects/<slug>/project.md\` (canonical) + subfolders:

- \`plans/<date>-<topic>-plan.md\` — design plans (per plan-spec-split discipline)
- \`plans/<date>-<topic>-build-spec.md\` — build specs (sibling to plans)
- \`sessions/<date>.md\` — work session narratives
- \`notes/<date>.md\` — ad-hoc working notes
- \`research/<topic>.md\` — investigations
- \`findings/<topic>.md\` — audit results
- \`attachments/<file>\` — contracts, briefs, deliverables

## Required frontmatter

${FRONTMATTER_NOTE}

Plus project-specific:

- \`name\` — display name
- \`org\` — slug of the client/owner org
- \`contacts\` — array of contact slugs participating
- \`stage\` — proposal | active | paused | complete | archived
- \`started_at\` — ISO date when work began
- \`ended_at\` (optional) — ISO date when work concluded
- \`tags\` (optional) — domain tags (\`["web-design", "shopify"]\`) — sparse use only
- \`related_projects\` — array of project slugs (similar past projects, dependent projects)
- \`decisions\` — array of decision slugs made within this project

## Voice

- Lead with stage + one-sentence what it is.
- Goals → outcomes (when known) → notable decisions → current status.
- Numbered phases if multi-stage; tables for stakeholders.
- Avoid project marketing voice; this is internal cortex content.

## Lint rules

- Required: \`name\`, \`org\` (or explicit \`internal\` tag)
- Must have \`stage\`; defaults to \`active\`
- If \`stage: complete\`, \`ended_at\` should be set
- Should link to at least one decision OR have a body that names the work
`,
  },

  {
    name: 'decisions',
    shape: 'entity-as-folder',
    canonical_filename: 'decision.md',
    description: 'Decisions made — with rationale, alternatives, and consequences. Append-only via supersede.',
    schema_version: 1,
    required_fields: ['title'],
    relationship_fields: ['orgs', 'contacts', 'projects', 'related_decisions', 'derived_from'],
    allowed_subfolders: ['attachments'],
    claudeMd: `# Decisions

Decisions made — each is its own written-once entry. When a decision is revised, write a NEW
decision and link the old one with \`superseded_by\`. Never silently overwrite.

## Path shape

\`wiki/decisions/<slug>/decision.md\` (canonical). Slug pattern: \`<date>-<topic>\` (e.g. \`2026-05-28-cortex-curator-roles\`).

## Required frontmatter

${FRONTMATTER_NOTE}

Plus decision-specific:

- \`title\` — descriptive title
- \`decided_on\` — ISO date the decision was made (NOT when it was recorded)
- \`decided_by\` — array of contact/team slugs
- \`orgs\` (optional) — array of orgs the decision affects
- \`projects\` (optional) — array of projects the decision is within
- \`alternatives_considered\` (optional) — array of \`{option, why_not}\` records
- \`related_decisions\` (optional) — array of decision slugs (prior decisions this builds on)
- \`superseded_by\` (optional) — set when a newer decision overrides this one

## Body shape (Goanna's decision record pattern)

Numbered sections:

1. **Context** — what prompted the decision; what was the alternative-free baseline
2. **Decision** — what was chosen, in one paragraph
3. **Consequences** — what changes downstream; what becomes possible; what becomes constrained
4. **Alternatives considered** — what else was on the table, why each was rejected

## Voice

- Plain language. No hedging in the Decision section.
- Source any cited evidence. Date any claim.
- If the decision was contested, surface the disagreement in Alternatives, not paper over it.

## Lint rules

- Required: \`title\`, \`decided_on\`, \`decided_by\`
- Body must contain numbered Context / Decision / Consequences sections
- If \`status: archived\` AND \`superseded_by\` is unset, surface as warning (archived decisions should usually point to their successor)
`,
  },

  {
    name: 'knowledge',
    shape: 'entity-as-folder',
    canonical_filename: 'concept.md',
    description: 'Promoted patterns + concepts that have earned their place across multiple agents/sessions.',
    schema_version: 1,
    required_fields: ['title'],
    relationship_fields: ['related_concepts', 'derived_from'],
    allowed_subfolders: ['attachments'],
    claudeMd: `# Knowledge

Promoted patterns + concepts. Entries here have earned their place — they're not stubs, not
single-instance observations. Watching-brief discipline: an observation lives as a finding or
in an entity's body until 3+ confirmed instances justify promotion.

Exception: upstream-confirmed architectural realities can be promoted at n=1 (e.g. an
API quirk verified against the vendor's docs).

## Path shape

\`wiki/knowledge/<slug>/concept.md\` (canonical). Slug is short topic name (\`gravity-wells\`, \`abr-verify-first\`, etc.).

## Required frontmatter

${FRONTMATTER_NOTE}

Plus knowledge-specific:

- \`title\` — descriptive title
- \`type\` — concept | pattern | gotcha | procedure
- \`evidence_count\` — number of confirmed instances behind the promotion (n)
- \`promoted_at\` — when this graduated from finding/watching-brief
- \`related_concepts\` — array of other concept slugs (see-also)
- \`applies_to\` (optional) — array of contexts where this is relevant

## Body shape

- One-sentence definition at the top
- "When to use" — the situations where the pattern applies
- "Approach" — the actual technique or rule
- "Gotchas" — known failure modes
- "References" — source URLs + access dates for any cited evidence

## Voice

- Precise. Sourced. Layered.
- Use technical vocabulary where audience expects it.
- Avoid marketing words (\`leverage\`, \`harness\`, \`unlock\`, \`seamless\`, \`comprehensive\`).
- Use \`see also\`, \`source:\`, \`current as of\`, \`alternative:\`, \`superseded by:\`.

## Lint rules

- Required: \`title\`, \`type\`, \`evidence_count\`
- \`evidence_count: 1\` requires explicit "upstream-confirmed" annotation in body
- Must cite sources (URLs or doc refs) for any factual claim
- Should link to at least one related concept or external reference
`,
  },
];
```

### File: `src/wiki/seeds/install.ts` (new)

```typescript
import type { Env } from '../../types';
import { STARTER_COLLECTIONS, type CollectionSeed } from './collections';

/**
 * Idempotent: seed the starter collections into wiki_collections,
 * then write each collection's CLAUDE.md to R2 at wiki/<col>/CLAUDE.md.
 *
 * Safe to call multiple times. Uses INSERT OR REPLACE for collection
 * rows so we can bump schema_version + config_json without manual ops.
 *
 * The CLAUDE.md write is conditional — if the file already exists with a
 * different body_hash, we DON'T overwrite (preserves user customisations).
 * To force a refresh, pass { forceClaudeMd: true }.
 */
export async function installStarterCollections(
  env: Env,
  opts: { forceClaudeMd?: boolean } = {},
): Promise<{ inserted: number; updated: number; claude_md_written: number; claude_md_skipped: number }> {
  let inserted = 0;
  let updated = 0;
  let claudeMdWritten = 0;
  let claudeMdSkipped = 0;
  const now = new Date().toISOString();

  for (const seed of STARTER_COLLECTIONS) {
    const config_json = JSON.stringify({
      relationship_fields: seed.relationship_fields,
      allowed_subfolders: seed.allowed_subfolders,
      schema_version: seed.schema_version,
    });
    const required_fields_json = JSON.stringify(seed.required_fields);

    const existing = await env.DB.prepare(
      'SELECT name, schema_version FROM wiki_collections WHERE name = ?',
    )
      .bind(seed.name)
      .first<{ name: string; schema_version: number }>();

    if (existing) {
      await env.DB.prepare(
        `UPDATE wiki_collections
         SET shape = ?, canonical_filename = ?, required_fields_json = ?, description = ?,
             schema_version = ?, config_json = ?
         WHERE name = ?`,
      )
        .bind(
          seed.shape,
          seed.canonical_filename,
          required_fields_json,
          seed.description,
          seed.schema_version,
          config_json,
          seed.name,
        )
        .run();
      updated += 1;
    } else {
      await env.DB.prepare(
        `INSERT INTO wiki_collections
          (name, shape, canonical_filename, required_fields_json, description, created_at, schema_version, config_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          seed.name,
          seed.shape,
          seed.canonical_filename,
          required_fields_json,
          seed.description,
          now,
          seed.schema_version,
          config_json,
        )
        .run();
      inserted += 1;
    }

    const claudePath = `wiki/${seed.name}/CLAUDE.md`;
    const existingClaude = await env.WIKI.get(claudePath);
    if (existingClaude && !opts.forceClaudeMd) {
      claudeMdSkipped += 1;
    } else {
      await env.WIKI.put(claudePath, seed.claudeMd, {
        httpMetadata: { contentType: 'text/markdown' },
      });
      claudeMdWritten += 1;
    }
  }

  // Also write the wiki/raw/CLAUDE.md (covered in Phase 1.5; placed here so install
  // is one call).
  const rawClaudePath = 'wiki/raw/CLAUDE.md';
  const existingRaw = await env.WIKI.get(rawClaudePath);
  if (!existingRaw || opts.forceClaudeMd) {
    const { RAW_CLAUDE_MD } = await import('./raw');
    await env.WIKI.put(rawClaudePath, RAW_CLAUDE_MD, {
      httpMetadata: { contentType: 'text/markdown' },
    });
    claudeMdWritten += 1;
  }

  return { inserted, updated, claude_md_written: claudeMdWritten, claude_md_skipped: claudeMdSkipped };
}
```

### File: `src/wiki/seeds/raw.ts` (new — small)

```typescript
export const RAW_CLAUDE_MD = `# Raw — immutable source archive

Append-only. The agent reads this; the agent never edits files in here.
Curator + the sync daemon are the only writers.

## Path shape

\`wiki/raw/<source-system>/<id>.md\` for markdown content (emails, docs, transcripts).
\`wiki/raw/<source-system>/<id>.<ext>\` for binaries (PDFs, images, attachments).

Source systems we expect to see:

- \`gmail\` — Gmail message bodies + metadata
- \`slack\` — Slack messages, channel archives
- \`docs\` — imported Google Docs / Word docs / Markdown
- \`jim2\` — cardfile/job/quote snapshots
- \`xero\` — invoice/payment/contact snapshots
- \`github\` — repo state snapshots, issue/PR exports
- \`scrapes\` — Browser Rendering output (saved web pages)
- \`manual\` — user pasted into dashboard

## Why immutable

When a schema changes upstream in \`wiki/\`, we can regenerate every typed entry from
\`raw/\`. If \`raw/\` were mutable, that safety net is gone.

## Why files-only (no D1 metadata table for raw entries)

R2 is the index. The content's path encodes everything we need to find it. Wiki entries
point into \`raw/\` via their \`derived_from:\` frontmatter; that's the only "index" needed.

## Lifecycle

- **Add**: curator writes when new content arrives
- **Reference**: wiki entries cite raw paths in \`derived_from:\`
- **Never edit**: corrections become a NEW raw entry; old one stays
- **Never delete**: even when wiki entries archive, raw stays for forensics

## Vectorize layer

Long-form raw content (emails, docs, transcripts) is section-split + embedded into
Vectorize. Vector hits return raw chunk IDs; the chunk's metadata points back to its
parent raw file. Wiki entries are the structured projection; raw + Vectorize is the
search projection.
`;
```

### Verification gate 1.1

```bash
# After deploying:
curl -s -X POST -H "Authorization: Bearer <bearer>" https://<worker>/api/install-collection-schemas
# Returns: { inserted: N, updated: N, claude_md_written: 7, claude_md_skipped: N }

# Confirm collections updated
wrangler d1 execute office-town --remote --command \
  "SELECT name, schema_version, config_json IS NOT NULL as has_config FROM wiki_collections WHERE name IN ('inbox','orgs','contacts','projects','decisions','knowledge')" --json \
  | jq '.[0].results'

# Confirm CLAUDE.md files in R2
wrangler r2 object list office-town --prefix wiki/inbox/CLAUDE.md
wrangler r2 object list office-town --prefix wiki/raw/CLAUDE.md
# Both should appear
```

The `/api/install-collection-schemas` endpoint is added in Phase 1.2.

---

## Phase 1.2 — Install endpoint + bootstrap integration

**Goal**: Expose `installStarterCollections` via an HTTP endpoint, AND wire it into bootstrap so a fresh deployment self-installs.

### File: `src/wiki/routes.ts` (modify — add route)

```typescript
// Near the other admin routes
app.post('/api/install-collection-schemas', async (c) => {
  const force = c.req.query('force') === 'true';
  const result = await installStarterCollections(c.env, { forceClaudeMd: force });
  return c.json({ ok: true, ...result });
});
```

### File: `src/bootstrap.ts` (modify)

After `applyCortexFoundation(env)` (added in Phase 1.0), add:

```typescript
const { installStarterCollections } = await import('./wiki/seeds/install');
await installStarterCollections(env);   // safe: idempotent + non-destructive
```

### Verification gate 1.2

- Cold-deploy to a freshly-blank D1 + R2 should result in the six collections + their CLAUDE.md files automatically.
- Subsequent deploys are no-op (idempotent — collections stay current, CLAUDE.md stays as-is unless `?force=true`).

---

## Phase 1.3 — `/api/ingest` Phase A

**Goal**: Accept raw content, classify it (optional), extract structured fields via Workers AI against the collection's schema, write the typed entry, return the path.

### File: `src/ingest/routes.ts` (new)

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { extractEntry, type ExtractInput } from './extract';

const app = new Hono<{ Bindings: Env }>();

const IngestRequest = z.object({
  content: z.string().min(1).max(500_000),
  target_collection: z.string(),
  target_slug: z.string().optional(),
  source_ref: z.object({
    raw_path: z.string().optional(),
    source_system: z.string(),
    source_id: z.string(),
    fetched_at: z.string(),
  }),
  agent_slug: z.string(),
  why: z.string().min(3),
  // Optional override — skip Workers AI extraction, take the structured payload directly.
  // Used by deterministic Tier-1 extractors (Xero, Jim2) that have known mappings.
  structured: z
    .object({
      frontmatter: z.record(z.unknown()),
      body: z.string(),
    })
    .optional(),
});

app.post('/api/ingest', async (c) => {
  const parsed = IngestRequest.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_request', details: parsed.error.format() }, 400);
  }
  const input: ExtractInput = parsed.data;
  const result = await extractEntry(c.env, input);
  return c.json(result);
});

export default app;
```

Mount the route in `src/index.ts`:

```typescript
import ingestRoutes from './ingest/routes';
// ...
app.route('/', ingestRoutes);
```

### File: `src/ingest/extract.ts` (new)

```typescript
import type { Env } from '../types';

export interface ExtractInput {
  content: string;
  target_collection: string;
  target_slug?: string;
  source_ref: {
    raw_path?: string;
    source_system: string;
    source_id: string;
    fetched_at: string;
  };
  agent_slug: string;
  why: string;
  structured?: {
    frontmatter: Record<string, unknown>;
    body: string;
  };
}

export interface ExtractResult {
  ok: boolean;
  entry_slug?: string;
  entry_path?: string;
  raw_path?: string;
  derived?: {
    frontmatter: Record<string, unknown>;
    body: string;
    confidence: number;
    new_entry: boolean;
  };
  error?: string;
}

/**
 * The full ingest pipeline:
 *  1. Resolve the target collection — must exist in wiki_collections
 *  2. Optionally write the source content to wiki/raw/<system>/<id>.md
 *  3. Run extraction (Workers AI gpt-oss-20b OR use provided structured payload)
 *  4. Compute target slug (use provided OR derive from extracted name/title)
 *  5. Write the typed entry to wiki/<col>/<slug>/<canonical> via the unified write path
 *  6. Audit + return
 */
export async function extractEntry(env: Env, input: ExtractInput): Promise<ExtractResult> {
  // 1. Resolve collection
  const collection = await env.DB.prepare(
    `SELECT name, shape, canonical_filename, required_fields_json, schema_version, config_json
     FROM wiki_collections WHERE name = ?`,
  )
    .bind(input.target_collection)
    .first<{
      name: string;
      shape: string;
      canonical_filename: string;
      required_fields_json: string;
      schema_version: number;
      config_json: string | null;
    }>();

  if (!collection) {
    return { ok: false, error: `unknown_collection:${input.target_collection}` };
  }

  const requiredFields = JSON.parse(collection.required_fields_json) as string[];
  const config = collection.config_json ? JSON.parse(collection.config_json) : {};
  const relationshipFields = (config.relationship_fields as string[]) ?? [];

  // 2. Write raw content if not already there
  let rawPath = input.source_ref.raw_path;
  if (!rawPath) {
    rawPath = `wiki/raw/${input.source_ref.source_system}/${input.source_ref.source_id}.md`;
  }
  const existingRaw = await env.WIKI.get(rawPath);
  if (!existingRaw) {
    await env.WIKI.put(rawPath, input.content, {
      httpMetadata: { contentType: 'text/markdown' },
      customMetadata: {
        source_system: input.source_ref.source_system,
        source_id: input.source_ref.source_id,
        fetched_at: input.source_ref.fetched_at,
      },
    });
  }

  // 3. Extract (skip if structured payload provided)
  let extractedFrontmatter: Record<string, unknown>;
  let extractedBody: string;
  let confidence: number;

  if (input.structured) {
    extractedFrontmatter = input.structured.frontmatter;
    extractedBody = input.structured.body;
    confidence = 1.0; // structured payload bypasses AI
  } else {
    const extracted = await runExtractor(env, {
      content: input.content,
      collection: collection.name,
      requiredFields,
      relationshipFields,
      claudeMd: await loadCollectionClaudeMd(env, collection.name),
    });
    extractedFrontmatter = extracted.frontmatter;
    extractedBody = extracted.body;
    confidence = extracted.confidence;
  }

  // 4. Compute target slug
  const targetSlug =
    input.target_slug ||
    (extractedFrontmatter.slug as string | undefined) ||
    deriveSlugFromContent(extractedFrontmatter, collection.name, input.source_ref);

  // 5. Build the entry's full frontmatter (universal + collection-specific)
  const now = new Date().toISOString();
  const fullFrontmatter: Record<string, unknown> = {
    slug: targetSlug,
    kind: collection.name,
    created: now,
    last_updated: now,
    last_edited_by: input.agent_slug,
    last_change_summary: input.why,
    schema_version: collection.schema_version,
    status: confidence < 0.7 ? 'stub' : 'active',
    confidence,
    review_status: confidence < 0.5 ? 'pending' : 'approved',
    derived_from: [rawPath],
    ...extractedFrontmatter,    // collection-specific fields, may override defaults like status if explicit
  };

  // 6. Compose the markdown body
  const yamlFm = stringifyFrontmatter(fullFrontmatter);
  const fullBody = `---\n${yamlFm}---\n\n${extractedBody}\n`;

  // 7. Write via the unified write path (same code path as /api/sync/object PUT)
  //    so audit + frontmatter repair + index queue all fire normally.
  const entryPath = computeEntryPath(collection, targetSlug);
  const writeResult = await writeViaUnifiedPath(env, {
    r2_key: entryPath,
    body: fullBody,
    agent_slug: input.agent_slug,
    why: input.why,
  });

  return {
    ok: true,
    entry_slug: targetSlug,
    entry_path: entryPath,
    raw_path: rawPath,
    derived: {
      frontmatter: fullFrontmatter,
      body: extractedBody,
      confidence,
      new_entry: writeResult.created,
    },
  };
}

function computeEntryPath(
  collection: { name: string; shape: string; canonical_filename: string },
  slug: string,
): string {
  switch (collection.shape) {
    case 'entity-as-folder':
      return `wiki/${collection.name}/${slug}/${collection.canonical_filename}`;
    case 'flat-topic':
      return `wiki/${collection.name}/${slug}.md`;
    case 'dated-stream':
      // Slug is expected to be `<date>-<topic>`
      return `wiki/${collection.name}/${slug}.md`;
    case 'content-hash':
      // Inbox: slug is the content hash; prefix is first 2 chars
      return `wiki/${collection.name}/${slug.slice(0, 2)}/${slug}.md`;
    default:
      throw new Error(`unknown shape: ${collection.shape}`);
  }
}
```

### File: `src/ingest/workers-ai.ts` (new — the extractor)

```typescript
import type { Env } from '../types';

const EXTRACTOR_SYSTEM_PROMPT = `You are an expert at extracting structured business data from unstructured text into typed wiki entries.

You are given:
1. A piece of raw content (an email, a doc, a transcript, an invoice, a meeting note)
2. The target collection's schema — required fields, relationship fields, voice rules

Your job: extract the structured fields, write a clean body, and return JSON.

CRITICAL RULES:

- ONLY extract facts that are present in the content. Do NOT invent.
- If a required field cannot be determined from the content, return it as null and set confidence appropriately low.
- Stable slug IDs: kebab-case, lowercase, ASCII-only. For org names, strip suffixes like "Pty Ltd" / "Inc" / "Ltd" from the slug (but keep them in the \`name\` field).
- For relationship fields (e.g. \`contacts\`, \`projects\`, \`orgs\`), return slug arrays. Use the canonical slug pattern even if you're inventing a placeholder — downstream reconciliation will merge if a real entry exists.
- For the body: write 2-6 paragraphs of narrative. Be specific about dates, names, numbers from the content. Skip generic preamble. Don't summarise content that's already structured (e.g. don't restate the org's name in prose if it's in frontmatter).
- Confidence: 0.0-1.0. 1.0 = explicit + unambiguous in content. 0.7 = inferred from clear context. 0.4 = guessed from weak signal. Below 0.4 = mark required fields null.

OUTPUT FORMAT: pure JSON, no markdown fence:

{
  "frontmatter": {
    "<field>": <value>,
    ...
  },
  "body": "<markdown body text>",
  "confidence": <number 0.0-1.0>
}`;

interface ExtractorInput {
  content: string;
  collection: string;
  requiredFields: string[];
  relationshipFields: string[];
  claudeMd: string;
}

interface ExtractorOutput {
  frontmatter: Record<string, unknown>;
  body: string;
  confidence: number;
}

export async function runExtractor(env: Env, input: ExtractorInput): Promise<ExtractorOutput> {
  const userPrompt = `Target collection: \`${input.collection}\`

Required fields: ${JSON.stringify(input.requiredFields)}
Relationship fields (return slug arrays): ${JSON.stringify(input.relationshipFields)}

Schema doc (the collection's CLAUDE.md) follows. Use this for voice + field rules:

---
${input.claudeMd}
---

CONTENT TO EXTRACT FROM:

${input.content}

Return the JSON now.`;

  const response = await env.AI.run('@cf/openai/gpt-oss-20b', {
    messages: [
      { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 4096,
    temperature: 0.2,
  });

  // coerceToString per workers-ai-gotchas
  const raw = coerceToString(response);

  // gpt-oss-20b sometimes emits a leading code-fence — strip it
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '').trim();

  let parsed: ExtractorOutput;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error(JSON.stringify({ event: 'extractor_parse_failure', raw, cleaned, error: String(err) }));
    return {
      frontmatter: {},
      body: input.content.slice(0, 2000), // fall back to raw content excerpt
      confidence: 0,
    };
  }

  // Defensive defaults
  parsed.frontmatter ??= {};
  parsed.body ??= '';
  parsed.confidence ??= 0;
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

  return parsed;
}

function coerceToString(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result == null) return '';
  const r = result as Record<string, unknown>;
  if (typeof r.response === 'string') return r.response;
  const choices = r.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    if (typeof msg?.content === 'string') return msg.content;
  }
  return JSON.stringify(result);
}
```

### Helpers in `src/ingest/extract.ts` (continued)

```typescript
async function loadCollectionClaudeMd(env: Env, collection: string): Promise<string> {
  const obj = await env.WIKI.get(`wiki/${collection}/CLAUDE.md`);
  if (!obj) return '';
  return await obj.text();
}

function deriveSlugFromContent(
  fm: Record<string, unknown>,
  collection: string,
  sourceRef: { source_system: string; source_id: string },
): string {
  // For content-hash collections (inbox), use the source_id directly (caller passes the hash).
  // For entity-as-folder, use the name → slug.
  // For dated-stream, use date-title.
  if (collection === 'inbox') {
    return sourceRef.source_id;
  }
  const name = (fm.name || fm.title || sourceRef.source_id) as string;
  return slugify(name);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function stringifyFrontmatter(fm: Record<string, unknown>): string {
  // Use the project's existing YAML stringifier. If none, basic shim:
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      for (const item of v) {
        lines.push(`  - ${typeof item === 'string' ? item : JSON.stringify(item)}`);
      }
    } else if (typeof v === 'object') {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      const sv = String(v);
      const needsQuoting = /[:{}\[\]&*!|>'"%@`#,\n]/.test(sv);
      lines.push(`${k}: ${needsQuoting ? JSON.stringify(sv) : sv}`);
    }
  }
  return lines.join('\n') + '\n';
}

async function writeViaUnifiedPath(
  env: Env,
  args: { r2_key: string; body: string; agent_slug: string; why: string },
): Promise<{ created: boolean }> {
  // This is the same code path /api/sync/object PUT goes through.
  // Reuse src/sync/routes.ts handlers — extract the writer into a callable
  // function if it's currently inline. Returns { created: bool } based on whether
  // the entry existed.
  // TODO during build: refactor src/sync/routes.ts to expose putWikiObject(env, args)
  // ...stub for now...
  return { created: true };
}
```

### Verification gate 1.3

```bash
# Send a minimal ingest call with a Markey-Group-like email body
curl -s -X POST https://<worker>/api/ingest \
  -H "Authorization: Bearer <bearer>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hi Jeremy, this is Sarah from Acme Corp Pty Ltd (acme.com.au). We need to renew our hosting contract for next year. Can you send a quote? Cheers, Sarah",
    "target_collection": "inbox",
    "source_ref": {
      "source_system": "manual",
      "source_id": "test-001",
      "fetched_at": "2026-05-28T13:00:00Z"
    },
    "agent_slug": "test",
    "why": "first ingest test"
  }' | jq

# Should return:
# {
#   "ok": true,
#   "entry_slug": "test-001",
#   "entry_path": "wiki/inbox/te/test-001.md",
#   "raw_path": "wiki/raw/manual/test-001.md",
#   "derived": { ... confidence ~0.8 ... }
# }

# Confirm in R2
wrangler r2 object get office-town wiki/inbox/te/test-001.md
wrangler r2 object get office-town wiki/raw/manual/test-001.md

# Confirm in D1
wrangler d1 execute office-town --remote --command \
  "SELECT id, status, schema_version, confidence, frontmatter_json FROM wiki_entries WHERE collection='inbox' ORDER BY created_at DESC LIMIT 1" --json | jq

# Confirm audit row
wrangler d1 execute office-town --remote --command \
  "SELECT action, agent_slug, why FROM wiki_audit ORDER BY ts DESC LIMIT 1" --json | jq

# Try extraction into a typed collection (orgs):
curl -s -X POST https://<worker>/api/ingest \
  -H "Authorization: Bearer <bearer>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Acme Corp Pty Ltd (acme.com.au) is a client based in Newcastle NSW. Primary contact is Sarah Smith (sarah@acme.com.au, 0412 345 678). Active project: 2024 hosting renewal.",
    "target_collection": "orgs",
    "source_ref": { "source_system": "manual", "source_id": "test-002", "fetched_at": "2026-05-28T13:05:00Z" },
    "agent_slug": "test",
    "why": "first typed-extraction test"
  }' | jq

# Should return: entry_path: "wiki/orgs/acme-corp/entity.md", frontmatter includes contacts: ["sarah-smith"], etc.
```

---

## Phase 1.4 — Frontmatter → wiki_links derivation

**Goal**: When any entry is written (via sync or ingest), the worker derives `wiki_links` rows from the entry's frontmatter relationship fields.

### File: `src/wiki/derive-links.ts` (new)

```typescript
import type { Env } from '../types';

/**
 * Derive wiki_links rows from an entry's frontmatter.
 *
 * Reads the collection's config_json to know which frontmatter fields are
 * relationship fields. For each relationship field that's an array of slugs,
 * writes a wiki_links row.
 *
 * Idempotent: deletes existing wiki_links for the source entry (with kind matching
 * one of the relationship fields) before re-deriving. Other link kinds (e.g.
 * user-created via wiki(action:link)) are preserved.
 */
export async function deriveLinksForEntry(
  env: Env,
  args: {
    collection: string;
    slug: string;
    frontmatter: Record<string, unknown>;
  },
): Promise<{ written: number; removed: number }> {
  const conf = await env.DB.prepare(
    'SELECT config_json FROM wiki_collections WHERE name = ?',
  )
    .bind(args.collection)
    .first<{ config_json: string | null }>();

  const relationshipFields = conf?.config_json
    ? ((JSON.parse(conf.config_json).relationship_fields as string[]) ?? [])
    : [];

  if (relationshipFields.length === 0) {
    return { written: 0, removed: 0 };
  }

  // Remove existing derived links for this source where kind is in relationshipFields
  const removeResult = await env.DB.prepare(
    `DELETE FROM wiki_links
     WHERE from_collection = ? AND from_slug = ?
       AND kind IN (${relationshipFields.map(() => '?').join(',')})`,
  )
    .bind(args.collection, args.slug, ...relationshipFields)
    .run();

  // Re-derive
  let written = 0;
  const now = Date.now();
  for (const field of relationshipFields) {
    const value = args.frontmatter[field];
    if (!Array.isArray(value)) continue;

    for (const item of value) {
      if (typeof item !== 'string') continue;
      const target = parseTargetSlug(item, field);
      if (!target) continue;
      const link_id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO wiki_links
          (link_id, from_collection, from_slug, to_collection, to_slug, kind, why, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          link_id,
          args.collection,
          args.slug,
          target.collection,
          target.slug,
          field,
          'derived_from_frontmatter',
          now,
        )
        .run();
      written += 1;
    }
  }

  return { written, removed: removeResult.meta.changes ?? 0 };
}

/**
 * Parse a relationship reference into target collection + slug.
 *
 * Conventions:
 *  - "contact-sarah-smith" → derive collection from field name (contacts → contacts/sarah-smith)
 *  - "orgs/acme-corp" → explicit collection/slug
 *  - "raw/gmail/msg-xyz" → cross-store reference (for derived_from)
 */
function parseTargetSlug(
  item: string,
  fieldName: string,
): { collection: string; slug: string } | null {
  if (item.includes('/')) {
    const [collection, ...rest] = item.split('/');
    return { collection: collection!, slug: rest.join('/') };
  }
  // Map field name to collection
  const fieldToCollection: Record<string, string> = {
    orgs: 'orgs',
    contacts: 'contacts',
    projects: 'projects',
    decisions: 'decisions',
    related_orgs: 'orgs',
    related_projects: 'projects',
    related_decisions: 'decisions',
    related_concepts: 'knowledge',
    related_to: 'inbox',
    derived_from: 'raw',
  };
  const collection = fieldToCollection[fieldName];
  if (!collection) return null;
  return { collection, slug: item };
}
```

### File: `src/sync/routes.ts` (modify — hook into write path)

In the existing `upsertWikiEntry` function (the one introduced in the unified-write-path build), call `deriveLinksForEntry` after the row is upserted:

```typescript
// After: env.DB.prepare(... upsert wiki_entries ...).run();
import { deriveLinksForEntry } from '../wiki/derive-links';

await deriveLinksForEntry(env, {
  collection,
  slug,
  frontmatter: parsedFrontmatter,
});
```

### Verification gate 1.4

```bash
# After the second ingest test above (Acme Corp):
wrangler d1 execute office-town --remote --command \
  "SELECT from_collection, from_slug, to_collection, to_slug, kind, why
   FROM wiki_links
   WHERE from_collection = 'orgs' AND from_slug = 'acme-corp'" --json | jq

# Should return rows like:
# { from: orgs/acme-corp, to: contacts/sarah-smith, kind: contacts, why: derived_from_frontmatter }
# { from: orgs/acme-corp, to: raw/manual/test-002.md, kind: derived_from, why: derived_from_frontmatter }

# Now update the entry (call /api/ingest again with a different contact list) and re-verify
# Existing derived rows should be removed; new ones written.
```

---

## Phase 1.5 — wiki/raw/ + gravity-wells mapping

**Goal**: One short markdown doc, written to `wiki/CLAUDE.md`, that declares the gravity-wells doctrine for the install and maps the six starter collections to their well-creation status (5 forces × 6 collections).

This is the schema-doc-at-root that Karpathy talks about and that warms up the cortex for any agent.

### File: `src/wiki/seeds/wiki-claude-md.ts` (new)

```typescript
export const WIKI_ROOT_CLAUDE_MD = `# Office Town wiki

This is the typed-entity layer of the cortex — what the LLM reads on every session.
\`wiki/raw/\` holds the immutable source archive (read but not edited).

## How content is placed (the placement principle)

Gravity wells: location and naming of content shape how often, how reliably, and by whom it
gets read. Five forces have to be true for a file (or folder) to attract content reliably:

1. **Path predictability** — well lives at a documented fixed location
2. **Name-content match** — filename predicts contents
3. **Size matched to read frequency** — frequently-read files must be small
4. **Cross-link reinforcement** — every file mentioning a concept links to its canonical home
5. **Warm-up loadbearing** — highest-traffic files declared as required reading

When new content arrives, ask three questions in order:
1. Is there an existing well whose name and purpose match?
2. If no, does the content earn a new well? (Section → file → subfolder at 5+ items)
3. Is a sink forming?

## Collections

| Collection | Shape | Canonical file | Purpose |
|---|---|---|---|
| \`inbox/\` | content-hash | \`entry.md\` | Staging for raw ingested content |
| \`orgs/\` | entity-as-folder | \`entity.md\` | External organisations |
| \`contacts/\` | entity-as-folder | \`contact.md\` | External people |
| \`projects/\` | entity-as-folder | \`project.md\` | Active + historical work |
| \`decisions/\` | entity-as-folder | \`decision.md\` | Decisions made, append-only via supersede |
| \`knowledge/\` | entity-as-folder | \`concept.md\` | Promoted patterns (n≥3 evidence) |

Each collection has its own \`CLAUDE.md\` declaring its schema, voice rules, and lint rules.
Read \`wiki/<collection>/CLAUDE.md\` when working with that collection.

## Frontmatter sextet (universal)

Every entry has: \`slug, kind, created, last_updated, last_edited_by, last_change_summary\`.

Plus the cortex extensions: \`schema_version, status, derived_from, confidence, review_status\`.

See each collection's CLAUDE.md for the collection-specific required + relationship fields.

## Status lifecycle

\`active | stale | dormant | archived | stub\`

- \`stub\` — entry exists but lacks required fields; surface in dashboard
- \`active\` — current canonical
- \`stale\` — not updated in 90+ days; needs review
- \`dormant\` — superseded or aged out, kept for forensics
- \`archived\` — explicitly retired (usually with \`superseded_by\` pointer)

Append-don't-edit: when a fact changes (a contact's role, a project's stage), create a new
entry or add to a \`history:\` block; don't overwrite silently.

## Discipline rules

- A note without links is a bug.
- Slug IDs are assigned at first observation and never changed.
- Append, don't edit, for facts with provenance.
- Source or it didn't happen. Citations beat memory.
- Indexes are derived; don't ask the agent to maintain them.

## Pointers

- Provenance archive: \`wiki/raw/CLAUDE.md\`
- Schema for any collection: \`wiki/<collection>/CLAUDE.md\`
- Index of everything: \`/INDEX.md\` (regenerated by worker)
- Activity log: \`/LOG.md\` (regenerated by worker)
`;
```

### File: `src/wiki/seeds/install.ts` (modify)

Add a call to write `wiki/CLAUDE.md`:

```typescript
const rootClaudePath = 'wiki/CLAUDE.md';
const existingRoot = await env.WIKI.get(rootClaudePath);
if (!existingRoot || opts.forceClaudeMd) {
  const { WIKI_ROOT_CLAUDE_MD } = await import('./wiki-claude-md');
  await env.WIKI.put(rootClaudePath, WIKI_ROOT_CLAUDE_MD, {
    httpMetadata: { contentType: 'text/markdown' },
  });
  claudeMdWritten += 1;
}
```

### Verification gate 1.5

```bash
# Confirm all schema docs in R2
wrangler r2 object list office-town --prefix wiki/ | grep CLAUDE.md
# Should list:
# wiki/CLAUDE.md
# wiki/raw/CLAUDE.md
# wiki/inbox/CLAUDE.md
# wiki/orgs/CLAUDE.md
# wiki/contacts/CLAUDE.md
# wiki/projects/CLAUDE.md
# wiki/decisions/CLAUDE.md
# wiki/knowledge/CLAUDE.md
```

---

## Phase 1.6 — End-to-end verification + demo

After all five prior phases pass their gates:

### Demo script (save to `.jez/scripts/session-1-demo.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

WORKER="${WORKER:?set WORKER=https://office-town-<you>.workers.dev}"
BEARER="${BEARER:?set BEARER=your-mcp-bearer}"

echo "=== 1. Install collections ==="
curl -s -X POST -H "Authorization: Bearer $BEARER" "$WORKER/api/install-collection-schemas?force=true" | jq

echo
echo "=== 2. Ingest into Inbox ==="
curl -s -X POST -H "Authorization: Bearer $BEARER" -H "Content-Type: application/json" \
  -d '{
    "content": "Hi Jeremy, just got off the call with Sarah at Acme Corp Pty Ltd. They want to renew their hosting (acme.com.au) and add a new staging environment. Budget around $2000/year. Sarah is the decision-maker; her direct is sarah@acme.com.au.",
    "target_collection": "inbox",
    "source_ref": {
      "source_system": "manual",
      "source_id": "demo-call-acme-2026-05-28",
      "fetched_at": "2026-05-28T13:00:00Z"
    },
    "agent_slug": "demo",
    "why": "session-1 demo: capture a call summary"
  }' "$WORKER/api/ingest" | jq

echo
echo "=== 3. Ingest the same content into orgs (typed extraction) ==="
curl -s -X POST -H "Authorization: Bearer $BEARER" -H "Content-Type: application/json" \
  -d '{
    "content": "Hi Jeremy, just got off the call with Sarah at Acme Corp Pty Ltd. They want to renew their hosting (acme.com.au) and add a new staging environment. Budget around $2000/year. Sarah is the decision-maker; her direct is sarah@acme.com.au.",
    "target_collection": "orgs",
    "source_ref": {
      "source_system": "manual",
      "source_id": "demo-call-acme-2026-05-28",
      "fetched_at": "2026-05-28T13:00:00Z"
    },
    "agent_slug": "demo",
    "why": "session-1 demo: typed-extract org from call"
  }' "$WORKER/api/ingest" | jq

echo
echo "=== 4. Verify wiki_entries written ==="
wrangler d1 execute office-town --remote --command \
  "SELECT collection, slug, status, schema_version, confidence FROM wiki_entries WHERE collection IN ('inbox','orgs') ORDER BY created_at DESC LIMIT 5" --json | jq '.[0].results'

echo
echo "=== 5. Verify wiki_links derived ==="
wrangler d1 execute office-town --remote --command \
  "SELECT from_slug, to_collection, to_slug, kind FROM wiki_links WHERE from_collection = 'orgs' ORDER BY created_at DESC LIMIT 10" --json | jq '.[0].results'

echo
echo "=== 6. Verify audit trail ==="
wrangler d1 execute office-town --remote --command \
  "SELECT action, collection, slug, agent_slug, why FROM wiki_audit ORDER BY ts DESC LIMIT 5" --json | jq '.[0].results'

echo
echo "=== Done. Visit $WORKER/dashboard/wiki/orgs/acme-corp to view the extracted entry. ==="
```

### What "done" looks like

- `/api/ingest` accepts content + target_collection, returns a structured entry path
- The Acme-Corp demo produces an `orgs/acme-corp/entity.md` entry with confidence ≥0.7
- The entry's frontmatter includes: `name: Acme Corp Pty Ltd`, `entity_type: client`, `contacts: [sarah-smith]`, `derived_from: [wiki/raw/manual/demo-call-acme-2026-05-28.md]`, `schema_version: 1`, `status: active`
- `wiki_links` has the derived rows for `contacts` + `derived_from`
- `wiki_audit` has one row for the entry write with `agent_slug: demo` and the `why`
- Dashboard shows the new entry with proper formatting
- All six collection CLAUDE.md files + the root `wiki/CLAUDE.md` + `wiki/raw/CLAUDE.md` are in R2

---

## Files NOT touched this session (rollback safety)

- `src/sync/routes.ts` — only adding the `deriveLinksForEntry` call; the existing PUT/GET/DELETE logic stays as-is. If anything regresses, the diff is small and reversible.
- `src/mcp-server/*` — the wiki MCP is untouched. Curator + Librarian work happens in future sessions, not this one.
- `src/dashboard/routes.ts` — no changes; the dashboard will surface the new entries via existing read paths automatically (any `wiki_entries` row shows up).
- `src/email/*`, `src/cron/*`, `src/files/*`, `src/publish/*` — completely untouched.
- `officetowd` daemon — untouched. The daemon already writes via the unified path; new behaviour (frontmatter→wiki_links derivation) kicks in transparently when it does.

---

## What's deferred to Session 2

- Curator subagent definition + skills bundle in `office-town-plugin/`
- First Gmail end-to-end demo (curator pulls real email, /api/ingest extracts, wiki entries appear)
- The `office-town:curate-inbox` skill markdown
- Routing logic (Phase B of structure-shaped-ingestion) — for Session 1 the caller picks `target_collection`; no auto-classifier yet

## What's deferred to Session 3

- `relevance_score` auto-computation (the column exists; nothing populates it yet)
- Reference-count rollup job
- Promotion-from-Inbox skill
- Reconciliation surface (peer-vs-umbrella + ABN-verify)

---

## Pre-build smoke tests (run BEFORE any code lands)

These are dependencies whose breakage would cascade. Verify each before starting:

1. `@cf/openai/gpt-oss-20b` returns structured JSON for a test prompt. Run a one-off Worker fetch in `wrangler dev` against the binding.
2. R2 PUT + GET round-trip works for `wiki/raw/` paths. The bucket is the same; just confirming the prefix isn't somehow restricted.
3. `wrangler d1 execute office-town --remote --command "PRAGMA table_info(wiki_entries)"` returns the expected 14 columns. If not, the bootstrap state is unexpected — pause and investigate.
4. Worker compiles cleanly with the new imports before deploying.

---

## Estimated effort

| Phase | Effort | Risk |
|---|---|---|
| 1.0 Migrations | 30 min | Low — pure ALTER, idempotent |
| 1.1 Collection seeds | 90 min | Low — most of the work is writing the per-collection CLAUDE.md content |
| 1.2 Install endpoint + bootstrap wire-up | 15 min | Low |
| 1.3 /api/ingest endpoint + extractor | 90 min | Medium — Workers AI extractor needs prompt iteration |
| 1.4 Frontmatter → wiki_links derivation | 45 min | Low — pure D1 |
| 1.5 wiki/CLAUDE.md + wiki/raw/CLAUDE.md | 15 min | Low |
| 1.6 Verify + demo | 30 min | The truth-checker |
| **Total** | **~5 hours of focused work** | |

Within one session for a Claude Opus 4.7 working with Jez as reviewer.

---

## Companion docs

- **Plan**: `cortex-shape-2026-05-28.md` — the why and shape
- **Strategic framing**: `cortex-pattern-2026-05-28.md` — the moat
- **Curator architecture** (next session's target): `curator-pattern-2026-05-28.md`
- **Worker write architecture this builds on**: `unified-write-path-2026-05-28.md`
- **Research**: `research-wiki-for-agents-2026-05-28.md` (Karpathy + Obsidian-AI), `openhuman-research-2026-05-28.md` (OpenHuman patterns)
