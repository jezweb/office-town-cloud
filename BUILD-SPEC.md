> **SUPERSEDED 2026-05-28.** This document is preserved for history but is no longer authoritative.
> Read `.jez/artifacts/MASTER-PLAN-2026-05-28.md` first for current truth.
> Decisions in this doc that conflict with the master plan are wrong; this doc may still be useful for context on the substrate-as-R2 architecture, the universal sextet, the wiki schema, and the decision rationale.

---

# Build Spec — Office Town Cloud

Phased build plan. Each phase ships value independently and is bounded by realistic time estimates. Total v1: ~6-8 focused days of work; v1.1 adds another ~5-7 days for the killer Cloudflare extensions.

## Phase 0 — Architecture spec (this folder, this commit)

**Effort:** 2-3 hours
**Status:** ✅ done with the initial commit

Deliverable: ARCHITECTURE.md, BUILD-SPEC.md, EXTENSIONS-CATALOGUE.md, WIKI-SCHEMA.md, repo skeleton (pnpm-workspace + package directories).

## Phase 1 — Repo bootstrap (vite-flare-starter patterns)

**Effort:** half-day

Establish the technical foundation by adopting proven patterns from vite-flare-starter without forking it.

Deliverables:
- `package.json` (root) with workspace orchestration scripts
- `pnpm-workspace.yaml`
- `tsconfig.json` with paths (`@/shared/*`, `@/core/*`, `@/tools/*`)
- `biome.json` (lint/format)
- `packages/shared/` — types, schemas, common utilities
- `packages/core/` — Hono app skeleton, wrangler.jsonc with all bindings declared (commented), `src/server/modules/` folder
- `packages/tools/` — same shape
- Drizzle ORM setup with initial migration (0000-init)
- better-auth wiring (Google OAuth, allowlist via env)
- Health check endpoint (`/health`)
- Smoke tests via Vitest + `@cloudflare/vitest-pool-workers`
- `.dev.vars.example`, `.gitignore`, deploy script

Verification: `pnpm deploy` produces a deployed Worker; `curl /health` returns 200; better-auth Google login works against test account.

## Phase 2 — Wiki extension (substrate Worker core)

**Effort:** 2-3 days (includes MCP Sampling spike)

The wiki MCP is the central differentiator. Get this working before anything else.

### Sub-phase 2.0 — MCP Sampling spike (half-day, do first)

Before writing the wiki CRUD, validate that MCP Sampling works for our classification use case. **This determines whether our cost model is $2/month (sampling) or $15/month (own LLM calls).**

- Set up a minimal `packages/mcp-wiki-spike/` server
- Implement one tool that does an MCP Sampling call to classify content
- Test via Goose CLI with a real LLM provider
- Verify: the host LLM responds, latency is acceptable (<2s), token costs land on the user's bill, not ours

If passes: wiki MCP uses sampling for classification, synthesis, and any "is this safe?" gating. If fails: fall back to Workers AI gpt-oss-20b as the cost-side classifier.

### Sub-phase 2.1 — Wiki CRUD + FTS (1.5-2 days)

Deliverables:
- `packages/core/src/server/modules/wiki/` with:
  - Drizzle schema for `wiki_entries` + `wiki_fts` (FTS5 virtual table)
  - CRUD routes (`POST/GET/PATCH/DELETE /api/wiki/<collection>/<slug>`)
  - FTS5 search route (`POST /api/wiki/search`)
  - Frontmatter parser (js-yaml or similar)
  - INDEX.md regenerator (worker-managed)
- `packages/mcp-wiki/` — streamable-HTTP MCP adapter exposing:
  - `wiki.create` — write entry (with optional sampling-based type classification)
  - `wiki.read` — fetch entry (full body)
  - `wiki.update` — modify entry
  - `wiki.delete` — remove entry (with archive)
  - `wiki.search` — FTS query returning **triage shapes** (frontmatter + 300-char excerpt + signed URL); `expanded: true` for full bodies
  - `wiki.list_collections` — discover schema
  - `wiki.register_collection` — add a new collection deliberately
- R2 binding + event notifications wired to a Queue
- Workflow consumer: read R2 → parse → upsert D1 FTS
- Tests for each tool

Verification: A test agent (Goose CLI in headless mode) calls wiki.create with a contact (no category specified → sampling classifies → librarian collection), then wiki.search finds it (returns triage shape), then wiki.read(expanded=true) returns full body. INDEX.md regenerates correctly. Smart Context Management doesn't compact away the search results.

## Phase 3 — Goose integration test

**Effort:** half-day

Connect a real Goose desktop to the deployed wiki MCP and verify the dogfood loop works.

Deliverables:
- Documented config: how to add the wiki MCP to Goose's extensions
- A simple recipe: "use the wiki to remember this contact"
- Verified: librarian agent (from office-town plugin) can call wiki tools, store/retrieve entries

Verification: Open Goose at `~/Documents/jezweb-town/buildings/library`, ask the librarian to file a new contact. The contact appears in R2 + D1 + Vectorize-eventually.

## Phase 4 — Vector search + RRF fusion

**Effort:** 1 day

Add semantic search to complete the hybrid recall pattern.

Deliverables:
- Vectorize index created with metadata indexes (BEFORE inserting any vectors)
- Embedding pipeline added to the Workflow consumer
- `wiki.search` updated to fan out FTS + vector in parallel, fuse via RRF
- Optional synthesis step (gpt-oss-20b summarises top results)

Verification: search returns semantically-similar entries even when keyword match is poor.

## Phase 5 — Share extension (unified files + publish)

**Effort:** 1.5 days

One extension, one tool, handles all agent-shareable artefacts. Mode parameter chooses temp signed URL vs permanent public page. Content type drives rendering (markdown → HTML, image → image, PDF → PDF, etc.).

Deliverables:
- `packages/mcp-share/` exposing:
  - `share(content, mode='temp'|'public', filename?, title?, ttl_days?)` — share anything
  - `list_shares(mode?, since?, limit?)` — recent shares
  - `revoke(url_or_id)` — invalidate temp / unpublish permanent
  - `extract(content_or_url)` — content extraction (markdown/text from any file — mediabox-shaped)
  - `download(url_or_id)` — server-side retrieval
- Routes: `/p/<slug>` for public pages, `/s/<token>` for signed temporary shares
- Theming for HTML renders (markdown → styled HTML page)
- Image transformation via Cloudflare Images binding (optional)

**Why merged from files + publish:** agent ergonomics. One tool call to share anything. Mode parameter, not separate extensions.

Verification: agent generates a screenshot, calls `share(content, mode='temp')`, gets URL back, URL works for 7 days. Agent writes a markdown doc, calls `share(content, mode='public', title='Q3 Report')`, URL is permanent at `/p/<slug>`.

## Phase 6 — Kanban view + Town map dashboard (MCP Apps + HTML)

**Effort:** 1 day

The visual surfaces. Both backed by the same data; just two views.

Deliverables:
- `packages/core/src/server/dashboard/` — HTML pages served at `/`, `/kanban`, `/library`
- Town map: SVG/canvas showing 4 buildings with status indicators (recent activity, open tasks)
- Kanban: cards grouped by status, organised by role
- Markdown export: `wiki/kanban.md` auto-regenerated by cron
- MCP App spec: a Goose-loadable iframe app for the town map

Verification: open `https://<deployment>.workers.dev/kanban` in browser; cards reflect actual task entries from the wiki.

## Phase 7 — Cron extension

**Effort:** half-day

Schedule recurring agent work via Workers Cron Triggers.

Deliverables:
- `packages/mcp-cron/` — `cron.schedule`, `cron.list`, `cron.remove`, `cron.run_now`
- Stores schedules in D1
- Worker reads schedule daily, fires recipes via Goose's headless mode (calls user's Goose endpoint if configured) or via direct LLM call

Verification: schedule a "Monday 9am AI news sweep" routine; it fires on schedule.

## Phase 8 — v1 release

**Effort:** half-day

Deliverables:
- Polished README, SETUP.md
- "Deploy to Cloudflare" button configured
- Smoke tests in CI
- LICENSE finalised
- Tagged v1.0.0

Push to public GitHub. Announce.

---

# v1.1 — The killer Cloudflare extensions

These are the differentiators. None exist for Goose yet.

## Phase 9 — Voice extension ("phone the librarian")

**Effort:** 2-3 days

Cloudflare Realtime SFU + Workers AI Nova-3 (STT) + Aura-2 (TTS) + Pipecat smart-turn-v2 (turn detection).

Deliverables:
- `packages/mcp-voice/` with WebRTC widget + audio framing + turn detection
- Browser endpoint where users can "call" an agent
- Optional outbound voice via Twilio bridge

Verification: open the call page, talk to the librarian, librarian responds via voice.

## Phase 10 — Browser extension (agents drive the web)

**Effort:** 2 days

Browser Rendering + Stagehand (AI element detection).

Deliverables:
- `packages/mcp-browser/` with persistent browser session management
- Tools: `browser.screenshot`, `browser.extract`, `browser.action` (click/fill/navigate), `browser.audit`
- Credential storage for logged-in flows

Verification: agent logs into a test WordPress admin and reports back what it sees.

## Phase 11 — Email extension (real email addresses)

**Effort:** 2 days

Email Workers (inbound) + Email Service / SMTP2Go (outbound).

Deliverables:
- `packages/mcp-email/` with inbound handler that triggers agent tool calls
- Outbound API
- Per-role email addresses configurable
- Reply-with-context pattern (agent receives, summarises, can reply or forward)

Verification: send mail to `librarian@officetown.<domain>`, it triggers a tool call; librarian replies via outbound.

## Phase 12 — Sandbox extension (Containers)

**Effort:** 1 day

Cloudflare Containers for code execution.

Deliverables:
- `packages/mcp-sandbox/` with `sandbox.run_python`, `sandbox.run_node`, etc.
- Per-session container lifecycle (sleep after inactivity)

Verification: agent runs Python code; gets output back.

## Phase 13 — Search extension (AI Search evaluation + wrapper)

**Effort:** 1-2 days

Wrapper that lets us swap between our DIY stack and Cloudflare AI Search.

Deliverables:
- `packages/mcp-search/` with stable tool surface
- Two backend implementations (DIY + AI Search)
- Bake-off scripts: identical corpus, identical queries, compare quality/latency/cost

Verification: search tool works against both backends; benchmark report comparing them.

## Phase 14 — Devops extension (Cloudflare-account-aware)

**Effort:** 1 day

The "Cloudflare agent" that helps users set up and maintain their own deployment.

Deliverables:
- `packages/mcp-devops/` with `cf.list_workers`, `cf.deploy`, `cf.list_buckets`, `cf.list_secrets`, `cf.set_dns`, `cf.check_health`
- Requires user's CF API token (per-deployment secret)

Verification: agent can list the user's CF resources and trigger redeploys.

## Phase 15 — Release v1.1

**Effort:** half-day

Polish, document, tag v1.1.0. The killer trio (voice + browser + email) is the demo.

---

# v2 / future

| Item | Sketch |
|---|---|
| **Cloudflare Agents SDK integration** | Persistent always-on roles via Durable Objects |
| **Stream extension** | Video artifacts for client deliverables |
| **Pipelines extension** | Event ingestion at scale (>100k events/day) |
| **AI Crawl Control extension** | Client SEO/AI-readiness audits |
| **Images extension** | Generated image transform pipeline |
| **Hyperdrive extension** | Client Postgres acceleration (per deployment) |
| **Council of Mine wrapper** | Multi-persona deliberation for big decisions |

---

# Build discipline

- **Brains-trust review every non-trivial PR** — at least 2 frontier reviewers (gpt-5+, claude opus, gemini pro). Cross-validated Criticals fix before commit; Highs before deploy. See `~/.claude/CLAUDE.md` for the pattern.
- **TDD where it earns its place** — recipes with `retry.checks` + `response.json_schema` are the verification primitive; not all code is testable that way, but the worker endpoints are.
- **Smoke tests in CI** — every PR runs against a live test deployment.
- **Documentation as part of feature** — no extension ships without a `docs/<name>.md` entry.
- **Cost-track every phase** — review actual CF bill after each deploy; if a phase pushes costs above the model, investigate before continuing.
