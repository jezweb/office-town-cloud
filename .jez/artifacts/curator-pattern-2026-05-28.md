# Curator Pattern — Architectural Decision

**Date**: 2026-05-28
**Status**: Decided. Replaces "worker-side connector packs" approach. See companion `cortex-pattern-2026-05-28.md` for why this matters at scale.

## The decision

External-service connectors (Gmail, Slack, GitHub, Calendar, Xero, Jim2, etc.) live in **the user's Goose**, not in the Office Town worker. A Goose subagent called the **Curator** uses those connectors and bridges them to Office Town's structured write path. The worker stays credential-free for external services.

```
User's Goose (laptop)                       Office Town worker (cloud)
─────────────────────                       ──────────────────────────
  Installed MCPs (user's choice)               office-town-wiki MCP
   ├─ gmail (user's own OAuth)                 office-town-files MCP
   ├─ slack                                    /api/ingest endpoint
   ├─ github                                   wiki_collections schemas
   ├─ xero                                     per-collection extractors
   ├─ jim2                                     wiki_links graph
   ├─ composio (if user wants)                 wiki_audit log
   └─ ...                                      dashboard

       │   Curator subagent has BOTH                     ▲
       │   ├─ user's connector MCPs                      │
       │   └─ office-town-* MCPs                         │
       ▼                                  ──── writes structured entries ┘
   Skills + recipes guide the loop:            via wiki MCP + /api/ingest
     curate-inbox
     extract-decision
     reconcile-org
     promote-from-inbox
     weekly-digest
     cite-source
```

## Why this beats worker-side connector packs

| Concern | Worker-side connectors | Curator-in-Goose |
|---|---|---|
| Where does Gmail OAuth live? | Worker (must store user tokens in D1, manage refresh, handle revocation) | User's laptop (Goose handles it) |
| Trust boundary | Worker holds external tokens for all tenants | Tokens never leave the user's machine |
| Multi-tenant | One OAuth store per tenant or shared budget pool | Each user runs their own Goose with their own tokens — trivial |
| Polling frequency | Cron decides; worst-case rate-limit fights | User decides ("curator, pull this week's emails") |
| Ambiguity resolution | Worker must guess or queue for review | Curator asks the user in-conversation |
| Adding a new source | New MCP server + OAuth flow + worker deployment | User installs an MCP in Goose; Curator picks it up |
| Where Composio fits | Either inside the worker (cost concentration) or rejected | Optional Goose plugin if the user wants 1000+ services |

## Curator's daily loop

The curator subagent is invoked by the user (interactively) or scheduled (via Goose's own scheduler):

1. **Scan** — list new items from connected sources since last run (Gmail label, Slack channel, GitHub issues, Xero invoices...). Uses the connector MCPs.
2. **Stage** — write raw content into Office Town's `wiki/inbox/<sha-prefix>/<id>.md` collection via the unified write path. Inbox is intentionally messy.
3. **Classify** — route each Inbox entry to the right target collection via the structured-ingestion router (Workers AI classifier on the worker side, behind `/api/ingest`).
4. **Extract** — for each routable item, call `/api/ingest` with `{content, target_collection, target_slug}`. Worker runs the per-collection extractor (Workers AI) and writes typed entries with `derived_from` provenance.
5. **Reconcile** — when the new entry references an entity that already exists (e.g. an Org appearing in two systems), curator attempts auto-resolution first per `agent-autonomy-default-2026-05-28.md`: query the cortex for existing matches, run ABR/billing-system/DNS lookups via MCP, check Vectorize similarity. Auto-merge at confidence ≥0.85 with any strong corroborating signal. Below that threshold, queue with a **recommended action** + supporting evidence — never with an open question. Genuinely-ambiguous cases (signals contradict) are the only ones the user sees.
6. **Link** — populate `wiki_links` between new entries and existing ones (this org owns these projects; this decision references these people).
7. **Cite** — every auto-generated entry carries `derived_from:` frontmatter pointing back to the Inbox chunk or external system source. Provenance is non-optional.

## What the curator is allowed to do

The curator's tool whitelist (defined in the Goose subagent config) determines its boundaries. Default whitelist:

| Tool source | Curator can use |
|---|---|
| User's connector MCPs (gmail/slack/...) | **read-only**: list threads, fetch content, list issues, get rows |
| Office Town wiki MCP | `wiki(action: list / get / write / update / link)` |
| Office Town files MCP | `files(action: upload / fetch_with_js)` |
| Office Town `/api/ingest` | full access (worker-side classifier + extractors) |
| **Not allowed** | sending mail, posting messages, modifying external state |

The curator can READ from the world and WRITE to Office Town. It can't post a reply on the user's behalf without explicit user approval. This separation is enforced by the subagent's tool whitelist, not by trust.

## Recipes and skills bundled in office-town-plugin

| Skill | What it does |
|---|---|
| `office-town:curate-inbox` | Pull recent items from connected sources → Inbox collection. The recurring entry-point. |
| `office-town:extract-decision` | Convert a thread/doc into a structured decision entry with wiki_links to people + projects + orgs |
| `office-town:reconcile-org` | Merge duplicates across sources (Xero contact + Jim2 cardfile + Google Contact → one Org entry, all three captured as derived_from) |
| `office-town:promote-from-inbox` | Graduate an Inbox chunk into a typed entry when hotness threshold is reached |
| `office-town:weekly-digest` | Generate global digest entry from the past week's wiki_audit + Inbox |
| `office-town:cite-source` | Append `derived_from:` provenance to any auto-generated entry. Used by other skills. |
| `office-town:link-graph` | Suggest + write wiki_links between newly-ingested entries and existing entities |

Each skill is markdown — the curator reads it as context when invoked. No engine code needed beyond the existing Office Town MCPs + the `/api/ingest` endpoint.

## What still goes on the worker (and why)

1. **`/api/ingest` endpoint** — accepts `{content, target_collection, target_slug}`, runs Workers AI classifier + extractor, writes via the unified write path. Stays on the worker because: Workers AI is on the worker, and the write path (D1 + R2 + audit + queue) is on the worker. Worth a separate doc: structure-shaped-ingestion-2026-05-28.md.
2. **Push-event receivers** — `/api/webhook/<source>` endpoints accept Gmail push, Slack events, GitHub webhooks. They don't pull data; they queue an "agent task" in D1 (`cron_jobs` or a new `agent_tasks` table). The user's curator picks up tasks next time it runs.
3. **Cron loop** — worker-side scheduled jobs (weekly-digest summarisation, hotness decay, reference-count rollup) that don't need external connectors.

## What the curator is NOT

- **Not a polling daemon**. It runs when the user asks or on Goose's local schedule. Polling-every-20-minutes lives in Goose-land, not the worker.
- **Not a write-back agent**. It doesn't send emails or post to Slack. Those would need explicit user permission and are out of scope.
- **Not the only ingestion path**. Users can also paste content directly into the dashboard's "Ingest" surface; that calls the same `/api/ingest`. The curator is the *automated* surface.
- **Not Goanna's librarian**. Goanna's librarian answers questions across the fleet; Office Town's curator pulls data into a local cortex. Different roles, complementary patterns.

## Multi-machine implications

User has 3 Macs, each running Goose with the same Office Town worker + their own connector MCPs. Curator runs on whichever Mac is awake. Conflicts:

- Two Macs both pull the same email thread → first one wins the Inbox write (content-hash IDs deduplicate at the worker)
- Two Macs both extract a Decision from the same thread → second extraction sees the existing entry, falls into the reconcile-or-skip path (handled by `office-town:reconcile-org`-style logic generalised)

The worker is the serialisation point. Curator is opportunistic — it doesn't assume it's the only one.

## Why this name

"Curator" comes from Goanna's pattern. A curator's job is to acquire, classify, and contextualise items in a collection. The role maps cleanly:
- **Acquire** = scan + stage from connected sources
- **Classify** = route to target collection via extractor
- **Contextualise** = wiki_links + derived_from + reconcile

It's a stronger metaphor than "ingestor" or "importer" because it implies judgment: not everything that arrives belongs in the wiki, and the things that do belong need to be placed thoughtfully.

## What to build first (minimum viable curator)

If we wanted to ship the smallest useful curator:

1. **Subagent definition** in `office-town-plugin/recipes/curator.yaml` — system prompt, tool whitelist, default skills
2. **`office-town:curate-inbox`** skill — single skill that handles the simplest case: "user invokes curator with no args, curator scans gmail for unread messages, writes each as an Inbox entry"
3. **`/api/ingest` endpoint** — Phase A of structure-shaped-ingestion. Single-collection extract.
4. **Inbox collection** — `wiki_collections` row + the worker accepting writes under `wiki/inbox/`

~1-2 sessions for all four. Demoable: "user says 'curator, pull this morning's emails' and the wiki gains 12 new Inbox entries with provenance."

## What unlocks after the minimum

With the minimum in place, every additional skill is a small lift:
- `extract-decision` adds a Workers AI prompt that knows the decision schema
- `reconcile-org` adds a Vectorize lookup + merge action
- `promote-from-inbox` adds a hotness check + re-classify call
- `weekly-digest` adds a scheduled curator invocation

Each is a one-session add. The infrastructure investment is the first 1-2 sessions.

## Open questions

1. **Curator vs other roles** — does the curator subsume boss/librarian/worker/scout's ingestion responsibilities, or are they parallel? My read: curator is a specialised subagent that the boss can delegate to. Boss says "go curate this week's emails" and the curator subagent runs.
2. **Goose scheduling** — Goose can run scheduled tasks locally; should curator auto-run nightly, or always be user-invoked? Probably configurable per skill.
3. **Long ingestions** — pulling 20 years of email is a multi-day job. Does curator chunk it (10K msgs per run) or stream? Probably chunk, with a `last_ingested_id` cursor in `wiki/inbox/.curator-state.md`.
4. **Cost gating** — every classify+extract call is Workers AI tokens. Curator should respect a per-user daily budget (configurable in `office-town-plugin` config) and surface "ran out of budget, pausing" to the user.

## Related docs

- `structure-shaped-ingestion-2026-05-28.md` — worker-side extractor pipeline (the `/api/ingest` endpoint)
- `cortex-pattern-2026-05-28.md` — the bigger "20-year business" picture and why structured ingest matters
- `openhuman-research-2026-05-28.md` — patterns we're adopting and anti-patterns we're rejecting
- `unified-write-path-2026-05-28.md` — worker-side write architecture that this all rides on top of
