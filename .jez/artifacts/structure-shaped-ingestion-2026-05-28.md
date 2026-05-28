# Structure-Shaped Ingestion — Design Note

**Date**: 2026-05-28
**Status**: Design — not yet shipped. Sketches the v1.2/v1.3 ingestion architecture.
**Companion to**: `unified-write-path-2026-05-28.md` (the write chokepoint architecture this builds on) + `openhuman-research-2026-05-28.md` (the competitor analysis that surfaced the distinction)

## The architectural choice in one sentence

When external content arrives, **parse it into typed records against known collection schemas** before storing, rather than **chunking + vectorizing it and reconstructing answers at query time**.

## Two intelligences

| | Search-shaped | Structure-shaped |
|---|---|---|
| **AI's role at ingestion** | Chunk text + embed | Classify + extract typed fields per schema |
| **Canonical store** | Vector index + raw chunks | Typed entity records + explicit graph edges |
| **Query path** | Embed query → vector search → LLM synthesises answer from chunks | Direct lookup of structured fields + traversal of `wiki_links` |
| **AI's role at query** | Synthesis (heavy) | Optional summarisation (light) |
| **Wins on** | "Tell me about Sarah" — narrative, fuzzy | "Show me decisions with status=pending and deadline this week" — structured, exact |
| **Loses on** | Anything requiring structured query or constraint | Casual notes that don't fit a schema |
| **Used by** | OpenHuman, mem.ai, most "second-brain" tools, naive RAG | Office Town (via `wiki_collections.required_fields_json`) |
| **The bet** | Breadth of connection (118 OAuth connectors) | Depth of structure (per-collection schemas + edges) |

Office Town's `wiki_collections` table already declares the per-collection schemas (`required_fields_json`). The infrastructure for structure-shaped storage exists. What's missing is the **ingestion pipeline** that converts unstructured external input into typed records.

## The pipeline

```
External source
(email body, slack thread, calendar event, manual paste, etc.)
        │
        ▼
  ┌─────────────┐
  │ Inbox write │  raw content → wiki/inbox/<sha-prefix>/<id>.md
  │             │  frontmatter: { kind: 'inbox', source: 'gmail', ts, refs: [] }
  └──────┬──────┘
         │ async, queue-driven
         ▼
  ┌─────────────┐
  │   Router    │  Workers AI classifier (@cf/openai/gpt-oss-20b):
  │   agent     │    "which collections does this content affect?"
  │             │  Output: [{collection, confidence, reason}]
  │             │  Routes to N per-collection extractors.
  └──────┬──────┘
         │ fan-out
         ▼
  ┌──────────────────────────────────────────────────┐
  │  Per-collection extractors                        │
  │                                                   │
  │  contacts/extractor      orgs/extractor           │
  │  decisions/extractor     projects/extractor       │
  │  research/extractor      knowledge/extractor      │
  │                                                   │
  │  Each is a Workers AI call with:                  │
  │    - system: schema for THIS collection           │
  │    - user:   the inbox content + any existing     │
  │              entry to merge into                  │
  │    - output: JSON conforming to required_fields   │
  │              + body (optional narrative)          │
  └──────┬───────────────────────────────────────────┘
         │
         ▼
  ┌────────────────────────────────────┐
  │  Worker writes structured entries  │
  │  via the existing /api/sync/object │
  │  PUT path (audit + index + repair) │
  │                                    │
  │  Plus inserts wiki_links:          │
  │    inbox:<id> →derived_to→ entry   │
  │    entry →derived_from→ inbox:<id> │
  └────────────────────────────────────┘
```

### Concrete worked example

**Input**: an email arrives at `inbox+jezweb@officetown.net` (Cloudflare Email Routing → worker `email()` handler).

Body excerpt:
> Hi Jeremy — Sarah here from Acme Corp. Just confirming we're locked in on the
> $50k retainer for the new SEO programme, starting June 15. Need your sign-off
> on the SoW by EoD Friday. Cheers.

**Step 1 — Inbox write** (immediate):
```
wiki/inbox/a3f2/sarah-acme-retainer-confirm.md
---
kind: inbox
source: gmail
source_id: <msg-id-from-headers>
received_at: 2026-05-28T14:30:00Z
from: sarah@acme.example.com
subject: SoW confirmation — SEO retainer
status: pending-classification
---

[raw body]
```

**Step 2 — Router** (async via queue):
```json
{
  "classifications": [
    { "collection": "contacts", "slug_hint": "sarah", "confidence": 0.95, "reason": "named sender with company" },
    { "collection": "orgs", "slug_hint": "acme-corp", "confidence": 0.95, "reason": "explicit company reference" },
    { "collection": "decisions", "slug_hint": "acme-seo-retainer-2026", "confidence": 0.90, "reason": "explicit dollar amount + sign-off deadline" },
    { "collection": "projects", "slug_hint": "acme-seo-programme", "confidence": 0.85, "reason": "new programme starting date" }
  ]
}
```

**Step 3 — Per-collection extraction** (parallel):

*contacts extractor* output:
```yaml
collection: contacts
slug: sarah-jones-acme  # if multiple Sarahs, slug includes org
frontmatter:
  name: Sarah
  kind: contact
  org: orgs:acme-corp
  email: sarah@acme.example.com
  last_contacted: 2026-05-28
  topics: [seo-retainer]
body: |
  Sarah is Jezweb's primary point of contact at Acme Corp for the SEO retainer.
  ## Recent
  - 2026-05-28 — confirmed $50k SEO retainer SoW, awaiting Jez sign-off by EOD Friday
```

*decisions extractor* output:
```yaml
collection: decisions
slug: acme-seo-retainer-2026
frontmatter:
  title: Acme Corp SEO retainer 2026
  kind: decision
  status: pending-signoff
  parties: [orgs:acme-corp, owner]
  amount: 50000
  currency: AUD
  decision_required_by: 2026-05-31
  start_date: 2026-06-15
body: |
  Acme Corp confirmed $50k SEO retainer for new programme starting 2026-06-15.
  Awaiting Jez's sign-off on SoW by EOD Friday 2026-05-31.
```

(Similar typed outputs for orgs + projects extractors.)

**Step 4 — Worker writes structured entries** via `PUT /api/sync/object/wiki/<col>/<slug>/<canonical>.md`. Each write goes through the unified-write-path: audit, frontmatter validation, queue indexing.

**Step 5 — Cross-references**: worker inserts into `wiki_links`:
```
inbox:sarah-acme-retainer-confirm →derived_to→ contacts:sarah-jones-acme
inbox:sarah-acme-retainer-confirm →derived_to→ orgs:acme-corp
inbox:sarah-acme-retainer-confirm →derived_to→ decisions:acme-seo-retainer-2026
inbox:sarah-acme-retainer-confirm →derived_to→ projects:acme-seo-programme

decisions:acme-seo-retainer-2026 →parties→ orgs:acme-corp
contacts:sarah-jones-acme →works-at→ orgs:acme-corp
projects:acme-seo-programme →client→ orgs:acme-corp
```

Now an agent (or a kanban view, or a digest cron) can answer:
- "What decisions are pending sign-off?" — direct query on `wiki_entries WHERE status='pending-signoff'`
- "What's on the Acme Corp account?" — graph traversal from `orgs:acme-corp`
- "Where did this fact come from?" — `derived_from` traces back to the inbox entry, which has the raw email

## What this gives us that search-shaped systems can't

1. **Typed queries** — "decisions with status=pending and amount>10k and deadline this week". Vector search can't answer this; it'd surface plausible-looking chunks. Structured query is exact.

2. **Schema-enforced validation** — if the extractor produces a malformed contact (no name field), the existing worker-side `required_fields_json` check rejects it. Bad inputs surface as visible failures, not as silent low-quality entries buried in the corpus.

3. **Composable graph traversal** — "find all decisions made on projects we have with clients in NSW". Multi-hop joins across `wiki_links` are SQL queries against D1, milliseconds.

4. **Updates merge into existing entries** — second email from Sarah doesn't create `contacts:sarah-jones-acme-2`; it updates the existing record. The extractor reads the existing entry as context, the merge is structured (add a row to `topics:`, update `last_contacted`), not by-summary-rewrite.

5. **Cheap agent answers** — most agent queries become D1 lookups + return the structured record. LLM only fires for narrative summaries. Way cheaper than RAG-everywhere.

## What this costs (honest tradeoffs)

1. **Schemas have to exist or be auto-evolved** — for content that doesn't fit existing collections, either reject (fail loud), or auto-suggest a new collection (`could-be: 'meetings', 'tasks', 'invoices'`) for the user to confirm. Don't silently shoehorn into the wrong shape.

2. **Per-collection extractors are model calls** — N extractors × M classified collections per inbox item. Workers AI cost scales with ingestion volume. Hotness gating (only extract for entities/collections that get queried) is the lever per OpenHuman pattern #3.

3. **Extractor quality matters** — a bad extractor could write garbage into structured fields. The `wiki_audit` table catches every write; bad extractor results can be rolled back. Bias toward small focused extractors per collection, not one giant general-purpose one. Each can be evaluated against a small golden-set of historical inputs.

4. **More moving parts** — router, N extractors, the inbox→typed-entry merge logic. Compared to "chunk + vectorize" it's more code. The payoff is structured query + composable graph; you decide whether that's worth it.

## Implementation phases (sketch)

### Phase A — Schema-aware single-collection ingestion
Add `POST /api/ingest` endpoint. Body: `{ content, target_collection, target_slug, source_id }`.  
Worker calls Workers AI with the collection's schema, extractor produces JSON, worker writes the structured entry via existing sync path.  
**Effort**: ~half session. Useful for "I want to paste this email and have it become a typed entry".

### Phase B — Router
Add `POST /api/ingest/raw`. Body: `{ content, source }`.  
Router classifies into N collections, fans out to extractors (Phase A), aggregates results, returns the set of writes.  
**Effort**: ~1 session.

### Phase C — Inbox + provenance
`wiki/inbox/` collection with content-hashed IDs.  
Every ingest path writes the raw to inbox first, then extracts. `derived_from` / `derived_to` populated in `wiki_links`.  
**Effort**: ~half session (mostly schema work — new collection, new link kind).

### Phase D — External-source connectors
First connector: Email Routing inbound (already wired). When `email()` fires, the body lands in the ingest pipeline.  
Second: scheduled scraper jobs (Browser Rendering + the cron table).  
Third: pull from Goose-MCP'd external systems (Gmail, GitHub) on demand via `/api/ingest/from-source`.  
**Effort**: 1 session per connector after the inbox infra is in place.

### Phase E — Hotness gating
`wiki_entries.reference_count` column.  
Extractors run only for collections that have been queried recently, OR entities that exceed a hotness threshold.  
Quiet entries don't burn Workers AI tokens until they get traffic.  
**Effort**: ~half session.

## What this is NOT

- **Not** a replacement for Vectorize + FTS5. We still want fuzzy text search. The structured layer is in addition, not instead.

- **Not** "give the LLM access to write anything it wants". The schema is the contract. Extractor outputs that don't validate get rejected at the worker boundary.

- **Not** an attempt to model the whole world as a graph. We have ~11 collections. They cover business shape (org/contacts/projects/decisions/etc). Extending the schema is deliberate, not auto-inferred from data.

- **Not** competing with OpenHuman on connector breadth. We have 5-10 connectors at most for v1.x. The bet is structure quality, not source count.

## Open questions to resolve before building

1. **Multi-extractor coordination** — if router fires 4 extractors and they all want to create entries, in what order, with what dependency? Probably: orgs first, then contacts (depend on org), then decisions/projects (depend on both). Encode as a small DAG?

2. **Confidence thresholds** — at what confidence does the router say "I don't know which collection this goes in" → write to inbox only, flag for human review? Probably 0.7?

3. **Merge vs append on update** — if the extractor wants to add a fact to an existing contact, does it (a) rewrite the body, (b) append to a Recent: list, (c) emit a separate event entry that gets linked? Probably (c) for events, (b) for slow-changing facts.

4. **Reverse confirmation** — should the user see "we extracted these 4 entries from this email, OK?" or should it just happen? For v1 I'd say "auto for high confidence, queue for review on low".

5. **Idempotency** — what if the same email gets ingested twice (same `source_id`)? Inbox write is idempotent via content-hash ID, but extractors need to detect "this source_id already produced these entries" and skip. Audit log + inbox `derived_to` make this checkable.

## Discovered

2026-05-28 conversation with Jez:
> "How are they making intelligent understanding of the content that's coming in?
> Because if they're just piping it straight in in bulk, that's not building
> intelligent data files, is it? That's just shoving things into a vector store
> and creating relationship links, which doesn't sound as good or as efficient
> either."

The question separated "search-shaped intelligence" (chunk + embed + synthesise) from "structure-shaped intelligence" (parse into typed records). OpenHuman is firmly in the first camp. Office Town has the schemas already; building the structure-shaped ingestion pipeline is the natural next architectural step.
