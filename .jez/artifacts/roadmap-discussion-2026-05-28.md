# Roadmap Discussion — What Could We Add Next

**Date**: 2026-05-28
**Status**: Discussion doc — captures candidate additions across the stack so Jez can react. Not a plan; not committed.

Organised by layer (Cloudflare / Goose / Office Town capabilities / external integrations / dev experience) and tiered by effort × value.

## Tier 1 — Cheap wins, high value (worth doing soon)

### CF — Workers AI gateway in front of model calls
Use Cloudflare AI Gateway to add per-model caching, request analytics, and fallback chains. Today we call `env.AI.run(...)` directly; gateway adds a logging + cost layer for free. **Effort**: ~1 hr (add `gateway: { id: '...' }` to AI binding config; the rest happens server-side). **Value**: visibility into AI cost + automatic dedup of repeated prompts.

### CF — Durable Objects for per-user conversation state
Per-user DO instances let an agent maintain context across requests without re-loading from D1. Useful for "long conversation with the boss" patterns. Already have a DO infrastructure (Sandbox container DOs). **Effort**: ~1 session. **Value**: dramatic latency improvement for multi-turn agent flows.

### CF — Frontmatter repair → queue
Right now `/api/sync/object` PUT calls Workers AI inline for frontmatter repair (+500-2000ms on broken-frontmatter writes). Move it to the queue consumer (OpenHuman pattern #1). **Effort**: ~30 min. **Value**: PUTs return immediately; repair happens async.

### OT — Kanban editor (write back via sync API)
Dashboard's `/dashboard/kanban` is read-only. Add drag-to-change-status — uses `PUT /api/sync/object/wiki/tasks/<slug>/task.md` with updated frontmatter status. Same code path as the daemon. **Effort**: ~1 session. **Value**: real edit-in-browser UX without leaving the dashboard.

### OT — Frontmatter form editor on dashboard
Per-entry "edit metadata" form on `/dashboard/wiki/<col>/<slug>`. Fields driven by `wiki_collections.required_fields_json`. Saves via the sync API. **Effort**: ~half session. **Value**: non-CLI users can update typed fields without learning YAML.

### OT — Cron execution loop
We have `cron_jobs` + `cron_runs` tables and the cron MCP gateway. What's missing is the worker's `scheduled()` handler that actually runs due jobs. Today they sit in D1 unexecuted. **Effort**: ~half session. **Value**: scheduled agent work (weekly digest, daily standup, periodic audits) finally happens.

### Goose — `/goal` integration in installer prompt
Per OpenHuman pattern + Goose v1.36 features, add `/goal "Office Town installed and verified"` at the end of the installer agent prompt. Agent self-checks before claiming done. **Effort**: ~10 min — one paragraph in INSTALL.md. **Value**: better install reliability; cleaner "is it really done?" handoff.

## Tier 2 — Solid additions (medium effort, medium-high value)

### CF — Vectorize metadata filters + namespaces
We currently `upsert([{id, values, metadata: {collection, slug, entry_id}}])` and query without filters. Adding metadata indexes (per `cloudflare-storage.md` rule — must be created BEFORE inserts) lets us narrow searches: "vector search but only within `projects:` collection". **Effort**: ~1 session (re-create index with metadata indexes upfront, re-embed). **Value**: faster, more relevant semantic search per collection.

### CF — Browser Rendering for richer scraping
We have the binding but the `files(action:fetch_with_js)` only does basic page-grab. Add: snapshot-as-PDF, multi-page navigation, screenshot regions. **Effort**: ~1 session. **Value**: scout role can crawl + summarise sites way better.

### CF — Workers Analytics Engine for usage metrics
Track per-MCP call counts, per-collection write volume, per-agent activity. Already have observability on; AE gives queryable analytics. **Effort**: ~half session (binding + per-write `writeDataPoint`). **Value**: dashboards showing what's getting used.

### OT — Structure-shaped ingestion pipeline (Phase A only)
Per `structure-shaped-ingestion-2026-05-28.md`. Phase A: `POST /api/ingest` endpoint that takes `{content, target_collection, target_slug}`, runs Workers AI extraction against the collection schema, writes via the sync path. **Effort**: ~half session. **Value**: foundation for inbox → typed entries. Even without the router (Phase B), this is useful — you can paste an email into the dashboard and it becomes a structured entry.

### OT — Inbox collection + `derived_from` provenance
New `wiki/inbox/<sha>/<id>.md` collection for raw ingested content. `wiki_links` extended with `derived_from` / `derived_to` kinds. Every auto-generated entry carries its provenance. **Effort**: ~half session. **Value**: full citation trail; agents can answer "where does this fact come from".

### Goose — Curator role + skills bundled into office-town-plugin

**Promoted to Tier 1** following 2026-05-28 architecture decision (see `curator-pattern-2026-05-28.md` and `cortex-pattern-2026-05-28.md`). The curator is a Goose subagent that holds user-side connector credentials (gmail/slack/github/xero/jim2/etc. — whatever MCPs the user has installed in Goose) and bridges them to Office Town's structured write path. Connectors stay on the user's laptop; structure stays on the worker; curator is the seam.

Pre-package the role definition plus skills that wrap common patterns:
- `office-town:curate-inbox` — pull recent items from connected sources into the inbox collection
- `office-town:extract-decision` — convert a thread/doc into a structured decision entry with `wiki_links` to people + projects + orgs
- `office-town:reconcile-org` — merge duplicates across sources (Xero contact + Jim2 cardfile + Google Contact → one org)
- `office-town:promote-from-inbox` — graduate an Inbox chunk into a typed entry when it earns the compute
- `office-town:weekly-digest` — generate the global weekly summary
- `office-town:cite-source` — adds `derived_from:` provenance to any auto-generated entry

**Effort**: ~1 session for the role definition + first 4 skills. ~2 sessions to cover the full set. **Value**: this is the lever that turns Office Town from "wiki with MCPs" into "agent cortex with structured ingestion."

### Goose — Hooks for `why:` enforcement
`PreToolUse` hook on the wiki MCP that blocks any `wiki(action:write|update|...)` call missing a `why:` field. Surfaces the requirement to the LLM before the worker rejects it. **Effort**: ~30 min. **Value**: better LLM behaviour around audit hygiene.

### Goose — Recipes for ingestion flows
A recipe per common ingestion: "save this email", "summarise this PDF into the wiki", "extract action items from this thread". Each recipe wraps a sequence of MCP calls. **Effort**: ~1 session for 4-5 recipes. **Value**: shipped UX for common chores.

### Goose — Subagents per role with constrained tool access
Each of boss/librarian/worker/scout could be a Goose subagent with a narrower toolset. E.g. scout has files + sandbox + browser; librarian has wiki + files; worker has everything. **Effort**: ~half session. **Value**: cleaner role boundaries, better @-mention semantics.

## Tier 3 — Real features (larger sessions)

### OT — Email inbound → router → typed entries
Wire `email()` handler into the structure-shaped ingestion pipeline. Inbound mail at `inbox+<token>@officetown.<domain>` lands → router classifies → extractors fill entries. Per `structure-shaped-ingestion` Phase B+C. **Effort**: ~2 sessions. **Value**: turn the email firehose into structured wiki content automatically.

### OT — Multi-tenant ("multiple towns per worker")
Today: one worker = one town. Multi-tenant: `office-town-<tenant>` bucket prefixes + D1 row scoping + dashboard subdomain routing. Lets a single deployer host multiple isolated wikis. **Effort**: ~2-3 sessions. **Value**: agency use case (Jezweb manages towns for client orgs).

### CF — Realtime voice rooms (v1.2 from earlier discussion)
`@cloudflare/realtime-agents` + DO + `/dashboard/call/<id>` widget. "Phone the librarian" — real voice conversation with an agent. **Effort**: ~1-2 sessions. **Value**: novel UX, dogfood material, marketing demo.

### OT — Hotness-driven lazy materialisation
`wiki_entries.reference_count` column + decay job + gate expensive operations on threshold. Per OpenHuman pattern #3. **Effort**: ~half session for the plumbing, ~1 session for the cost analysis showing it actually matters. **Value**: makes large ingestion ($$$-bounded) tractable. Less critical until ingestion is heavy.

### OT — Webhook outbound on entry changes
When `wiki_entries` change, fire HTTP POST to user-configured URLs. Lets external systems react to wiki changes (Zapier, n8n, custom). **Effort**: ~half session. **Value**: enables integrations we don't have to write.

### Goose — Top of Mind / standing orders
Office Town-specific "standing context" that the agent has across every session. E.g. "Always update `last_contacted:` when you send an email." Lives in the plugin config. **Effort**: ~half session. **Value**: persistent behaviour without re-prompting.

### Goose — ACP server exposure
Expose Office Town MCPs to non-Goose ACP clients (Claude Code, Cursor, etc.) — already mostly works via streamable_http, but doc + smoke-test it. **Effort**: ~half session. **Value**: broadens audience.

## Tier 4 — Big-picture explorations (designed-but-not-built territory)

### ~~External integrations as worker-side packs~~ — superseded 2026-05-28
**Status**: Architectural decision moved connector ownership to Goose. The user's Goose holds OAuth state for gmail/slack/github/calendar/xero/jim2/etc.; the curator subagent uses those connectors and writes structured entries back to Office Town. The worker stays free of external-service credentials.

What's left on the worker side:
- **Push-event receivers** — `/api/webhook/<source>` endpoints accepting Gmail push, Slack events, GitHub webhooks. They don't pull data themselves; they queue an "agent task" in D1 that the user's curator picks up next time it runs. Optional — only matters if "real-time without my laptop on" matters.

See `curator-pattern-2026-05-28.md` for the agent-side architecture and `cortex-pattern-2026-05-28.md` for why this fits a 20-year-business ingest.

**Effort saved**: ~4 sessions (one per connector pack). **Replaced by**: ~1-2 sessions for the curator role + skills, now promoted to Tier 1.

### Dashboard as PWA + offline-capable
Service worker, IndexedDB for the wiki cache, conflict-aware UI. Lets dashboard work in-flight or with no internet. **Effort**: ~2 sessions. **Value**: nice but niche.

### Audit log → time-travel UI
Every change is in `wiki_audit`. Build a `/dashboard/history/<col>/<slug>` page showing the full change history of an entry with restore-to-this-version button. **Effort**: ~half session. **Value**: confidence + recoverability.

### CF — D1 read replicas for read-heavy dashboards
Once usage scales, enable D1 read replication (recently GA). **Effort**: ~10 min config. **Value**: low-latency reads from anywhere; only matters at scale.

## Tier 5 — Dev experience / quality (always worth some)

### Tests
Worker: vitest test suite hitting the sync API against an in-memory D1 + R2 mock. Daemon: integration tests against a stub worker. **Effort**: ~1 session for basic coverage. **Value**: catches regressions; lets us refactor confidently.

### Type safety on D1 queries
We use raw `env.DB.prepare(...).first<T>()` with TypeScript generics on the result. Could switch to Drizzle for compile-time query validation. **Effort**: ~1 session for the migration. **Value**: catches typos and field renames at build time.

### Local dev story
`wrangler dev` works but needs D1 + R2 local emulation. Document the full local-dev loop. **Effort**: ~half session. **Value**: more contributors can hack on it.

### Performance benchmarks
"How fast is initial sync on a 1000-file wiki?" Measure + document. **Effort**: ~half session. **Value**: known limits.

### Error reporting
Workers errors go to console — no aggregation. Hook up Sentry or use Logpush to R2. **Effort**: ~half session. **Value**: see real-world failures.

## My top-5 picks (if asked)

If you forced me to pick the next 5 things to ship in order:

1. **Cron execution loop** (Tier 1) — unlocks scheduled work; we already have the table
2. **Skills bundled into office-town-plugin** (Tier 2) — biggest UX leverage per session of effort
3. **Structure-shaped ingestion Phase A** (Tier 2) — foundation for the OpenHuman-pattern stuff; useful even alone
4. **Kanban + frontmatter form editor** (Tier 1) — dashboard stops being read-only
5. **Curator role + 4 skills in office-town-plugin** (Tier 1, promoted 2026-05-28) — turns Office Town into an agent cortex; bridges user's Goose-side connectors to the worker's structured write path. See `curator-pattern-2026-05-28.md` + `cortex-pattern-2026-05-28.md`.

These together would shift Office Town from "Goose with a smart wiki backend" to "a real knowledge-work platform with structured ingestion + scheduled automation + editable surfaces".

## Questions for you to react to

1. **Search-shaped vs structure-shaped balance** — happy with the bet on structure-shaped (typed entries + graph) as the canonical store, with FTS/Vectorize as the search layer? Or do you want more chunks/RAG too?

2. ~~**Connector breadth** — first-party Cloudflare-native (slow but reliable) vs reuse something like Composio (fast but with their issues)?~~ **Resolved 2026-05-28**: Connectors live in the user's Goose (whichever MCPs they install — gmail, slack, github, composio, custom). Office Town's curator subagent uses those connectors and writes structured entries via the worker. Worker holds NO external credentials. See `curator-pattern-2026-05-28.md`.

3. **Multi-tenant timing** — is the multi-town-per-worker feature on the near horizon (you want to host client wikis) or a v2 thing?

4. **Voice** — is the v1.2 voice-rooms feature still worth doing, or has the priority shifted given the structured-ingestion angle is more interesting?

5. **Tier 1 vs Tier 2** — focus on cheap wins for a few sessions, or do you want to take a big chunk of Tier 2 (structure-shaped ingestion + skills + kanban editor) in one focused push?
