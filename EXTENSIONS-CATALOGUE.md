> **SUPERSEDED 2026-05-28.** This document is preserved for history but is no longer authoritative.
> Read `.jez/artifacts/MASTER-PLAN-2026-05-28.md` first for current truth.
> Decisions in this doc that conflict with the master plan are wrong; this doc may still be useful for context on the substrate-as-R2 architecture, the universal sextet, the wiki schema, and the decision rationale.

---

# Extensions Catalogue

Every planned MCP extension for Office Town Cloud, in priority order, with the API surface, dependencies, and effort estimate per extension.

All extensions are streamable-HTTP MCP servers hosted in the user's Cloudflare account. Each has a tool surface; agents call them via Goose's MCP integration.

## v1 — ship with first release

### `office-town-wiki`

**Purpose:** team knowledge layer — entity-as-folder collections with FTS5 + Vectorize hybrid search, designed to be measurably better than Goose's built-in Memory extension.

**Why we build our own:** Goose's built-in Memory has confirmed weaknesses (audited from source): all globals baked into system prompt at server start, no semantic search, tag-string-as-HashMap-key broken, substring-match deletion, no audit trail, no supersession, no concurrency safety, no path traversal protection. Office Town's wiki fixes all of these.

**Tool surface (gateway pattern, one tool with actions):**

```
wiki (action: list | get | search | write | supersede | link | archive | history
              | tree | recent | related | glob | head | head_many)

  # Reading + browsing (designed for casual exploration)
  tree      { path?, depth?, kind? }                  # like `tree` / `ls -R`
  list      { collection, filters?, limit?, cursor? } # entries with snippets
  recent    { since?, kind?, limit? }                 # what's been touched
  related   { slug, depth?, follow_kinds? }           # walk the frontmatter graph
  glob      { pattern }                               # path pattern matching
  head      { slug, lines? }                          # peek without full read
  head_many { slugs[] }                               # bulk peek (compare candidates)
  get       { slug }                                  # full read (expanded)

  # Searching
  search    { query, top_k?, kinds?, synthesize?, filters? }

  # Writing
  write     { slug?, kind, frontmatter, body, supersedes?, why }
  supersede { old_slug, new_frontmatter, new_body, why }
  link      { from_slug, to_slug, relation }          # typed graph edges
  archive   { slug, why }

  # Audit + discovery
  history   { slug, limit? }
  list_collections()                                  # discover schema
```

**Design note on browsing:** the read/search/get surface alone produces "I need to know what I'm looking for" UX. The `tree`/`list`/`recent`/`related`/`glob`/`head_many` actions let agents *casually explore* the wiki the way they'd `ls` and `cat` local files — see structure, peek at candidates, follow relationships. Critical for agents joining a new town or building understanding gradually. Plus the optional goannad local mirror gives users who want actual files-on-disk that experience too.

**The Unix tool mapping** — wiki MCP actions consciously mirror standard file-system commands so the mental model is "this is a filesystem with tools" not "this is a database I have to query":

| Unix tool | Wiki MCP action |
|---|---|
| `tree` / `ls -R` | `wiki.tree(path?, depth?)` |
| `ls <dir>` | `wiki.list(collection)` |
| `cat <file>` | `wiki.get(slug)` |
| `head <file>` | `wiki.head(slug, lines?)` |
| `head -n 5 *.md` | `wiki.head_many([slugs])` |
| `find . -name "*.md" -newer 1week` | `wiki.recent(since='1 week')` |
| `grep -r "X"` | `wiki.search(query='X')` |
| `find . -name "pattern*"` | `wiki.glob(pattern)` |
| `ls -R \| xargs cat \| grep relates_to:` | `wiki.related(slug)` |

When designing future wiki actions, the question is: "what Unix tool would I reach for here?" If the answer is "none, this is a query I'd type into a SQL prompt," the action probably doesn't belong as a casual-browse tool — it belongs as a `search` filter parameter.

Per `~/.claude/rules/mcp-gateway-pattern.md` — gateway with action verb beats many separate tools (smaller context cost, clearer LLM intent).

**Critical design contracts:**

1. **List/search endpoints NEVER return bodies.** Triage shape only: `{slug, title, tags, ts, snippet (≤300 chars), summary, byte_count}`. Bodies fetched separately via `wiki.get(slug)`. Prevents context bloat from Smart Context Management auto-summarisation.
2. **Static preamble at MCP handshake is ≤2KB, count-only**. Town name + counts + pinned slugs. NEVER content dumps (the Goose Memory failure mode).
3. **Required `why:` field on every write/supersede/archive.** Forces the LLM to articulate intent; logged to audit trail.
4. **Stable UUIDs per entry** returned on write. Identity-based operations, not substring-match (Memory's footgun).
5. **Atomic supersession via D1 transaction.** `wiki.supersede(old, new)` writes new entry + updates old's `status` + `superseded_by` + logs audit row, all in one transaction.
6. **Search filters to `status: active` by default**; `include_superseded: true` for history queries.
7. **MCP Sampling for synthesis.** `wiki.search(synthesize: true)` calls back to host LLM for synthesised answer with citations. Costs go to user's LLM bill (per architecture decision); we never make our own LLM calls.
8. **Audit table in D1** logs every write: `{audit_id, ts, action, slug, agent_slug, session_id, prev_hash, new_hash, why}`. Queryable via `wiki.history(slug)`.

**Bindings:** R2 (canonical), D1 (FTS5 + index + audit), Vectorize (semantic), Workers AI (embeddings + via sampling).

**Goose integration:**
- Registers as `SourceType::Project` consumer (uses active project ID as building anchor)
- The static preamble references the active building when set
- Plays nicely with PR #8995 chain-card UX (tool action names read well in summaries)
- Designed for `GOOSE_DISABLE_TOOL_CALL_SUMMARY=true` (set by the install prompt during config wiring)

**Effort:** 2-3 days including MCP Sampling spike.

### `office-town-share` (merged files + publish)

**Purpose:** dead-simple sharing for agents. One tool call to share anything — screenshots, images, docs, HTML, markdown, PDFs. Mode parameter chooses between temporary signed URL and permanent public page.

**Tools:**
- `share(content, mode?, filename?, title?, ttl_days?)` — share anything; returns URL
  - `mode: 'temp'` (default) — signed R2 URL, expires after `ttl_days` (default 7)
  - `mode: 'public'` — permanent published page at `<deployment>/p/<slug>`
- `list_shares(mode?, since?, limit?)` — recent shares
- `revoke(url_or_id)` — invalidate a temp share or unpublish a page
- `extract(content_or_url)` — content extraction (markdown/text from PDF/DOCX/audio/video — mediabox-shaped). Useful when agents need to ingest a file
- `download(url_or_id)` — retrieve (server-side, for chaining)

**Behaviour by content type:**

| Input | mode='temp' | mode='public' |
|---|---|---|
| Image (PNG/JPG/WebP) | Signed R2 URL with TTL | Hosted at `/p/<slug>.png` |
| Markdown | Signed R2 URL to raw .md | Rendered to HTML at `/p/<slug>` with theming |
| HTML | Signed R2 URL | Hosted at `/p/<slug>` with sandboxed iframe |
| PDF | Signed R2 URL | Hosted at `/p/<slug>.pdf` |
| Any binary | Signed R2 URL | Public R2 URL at `/p/<slug>.<ext>` |

**Agent ergonomics:** one call from any role to share anything. No splitting "is this a file or a publication?" — the mode parameter handles it.

**Bindings:** R2, Workers AI (for extract), Workers Media Transformations.

**Effort:** 1.5 days (combined effort of the previous files + publish extensions).

### `office-town-cron`

**Purpose:** schedule recurring agent work.

**Tools:**
- `cron.schedule(id, cron_expr, recipe_path, params?)` — add a scheduled job
- `cron.list()` — list schedules
- `cron.remove(id)` — delete
- `cron.run_now(id)` — fire immediately for testing
- `cron.history(id)` — past runs

Worker cron triggers fire on schedule; trigger Goose's headless mode or fire a recipe via the user's Goose endpoint.

**Bindings:** D1, Workers Cron Triggers.

**Effort:** half-day.

### `office-town-search` (DIY backend by default)

**Purpose:** unified search across the wiki — same as `wiki.search` but with backend flexibility for AI Search evaluation.

**Tools:**
- `search.query(q, collections?, filters?, limit?)` — hybrid search
- `search.recall(q)` — recall with synthesis
- `search.list_backends()` — diagnostic

**Backends:** v1 ships DIY (FTS5 + Vectorize + RRF). v1.1 adds AI Search backend with toggle.

**Bindings:** D1, Vectorize, Workers AI.

**Effort:** rolled into wiki + 1 day for AI Search wrapper (v1.1).

---

## v1.1 — the killer Cloudflare extensions

### `office-town-voice`

**Purpose:** voice calls to agents ("phone the librarian").

**Tools:**
- `voice.start_session(role)` — begin a WebRTC call to a role
- `voice.message(audio_bytes)` — transmit audio frame
- `voice.end_session()` — close call
- `voice.outbound_call(phone_number, role)` — agent calls a real phone number (via Twilio bridge)
- `voice.list_active_sessions()`

**Bindings:** Realtime SFU + TURN, Workers AI (Nova-3 STT, Aura-2 TTS, Pipecat smart-turn-v2).

**Effort:** 2-3 days.

### `office-town-browser`

**Purpose:** agents drive web pages.

**Tools:**
- `browser.navigate(url)` — open URL in a session
- `browser.screenshot()` — capture current view
- `browser.extract(selector_or_prompt)` — pull structured data
- `browser.click(selector_or_description)` — click element
- `browser.fill(selector, value)` — fill form field
- `browser.action(prompt)` — Stagehand-style natural-language action
- `browser.audit(url)` — Lighthouse-style report
- `browser.session_save()` / `browser.session_load()` — persistent logged-in sessions

**Bindings:** Browser Rendering, Workers AI (vision), KV (session state).

**Effort:** 2 days.

### `office-town-email`

**Purpose:** agents have real email addresses.

**Tools:**
- `email.send(to, subject, body, from_role?)` — outbound send
- `email.list_inbox(role?)` — read inbox
- `email.reply(message_id, body)` — reply to inbound
- `email.forward(message_id, to, note?)` — forward with context
- `email.draft(...)` — draft without sending

Inbound emails fire tool calls automatically; the role can act on them.

**Bindings:** Email Routing, Email Service REST, R2 (attachments), D1 (message log).

**Effort:** 2 days.

### `office-town-sandbox`

**Purpose:** agents execute code in sandboxed containers.

**Tools:**
- `sandbox.run(language, code, files?)` — execute code, return output
- `sandbox.shell(commands)` — multi-command shell session
- `sandbox.upload_file(path, content)` — stage files
- `sandbox.download_file(path)` — retrieve output files

**Bindings:** Containers, R2 (file staging).

**Effort:** 1 day.

### `office-town-devops`

**Purpose:** Cloudflare-account-aware extension that helps the user manage their own deployment.

**Tools:**
- `cf.list_workers()` — list deployed Workers
- `cf.deploy(worker_name)` — trigger a redeploy
- `cf.list_secrets(worker_name)` — list configured secrets (names only)
- `cf.set_secret(worker_name, key, value)` — write a secret
- `cf.list_routes()` — DNS routes
- `cf.set_route(domain, worker_name)` — add a route
- `cf.check_health()` — overall deployment health
- `cf.show_logs(worker_name, since?)` — recent logs

**Bindings:** None directly; uses Cloudflare's REST API with user's CF token (stored as secret).

**Effort:** 1 day.

---

## v2 / specialised

| Extension | Purpose | Effort |
|---|---|---|
| `office-town-stream` | Video artifacts (Cloudflare Stream) | 1 day |
| `office-town-pipelines` | Event ingestion at scale | 1 day |
| `office-town-crawl-control` | Client AI-readiness audits | 1 day |
| `office-town-images` | Image transform pipeline (Cloudflare Images) | 1 day |
| `office-town-fleet` | Persistent always-on roles (Cloudflare Agents SDK) | 2-3 days |
| `office-town-vpc` | Private resource bridges | specialised |
| `office-town-hyperdrive` | Client Postgres acceleration | specialised |

---

## Role + capability packs — domain-focused bundles

Office Town distributes packs by **work domain**, not by abstract category. Each pack combines roles + wiki additions + skills + recipes for a specific kind of work.

| Pack | Roles added | Wiki additions | Skills | Audience |
|---|---|---|---|---|
| `office-town-pack-design` | designer, copywriter, video-editor | brand assets templates; references design.md per deployment | brand-mockup, typography, layout-review, remotion-video | Creative shops, agencies |
| `office-town-pack-hosting` | hostmaster, devops | `properties/{websites,apps,hosting}/` collections | dns-audit, ssl-cert-renew, server-health | Hosting providers, ops teams |
| `office-town-pack-wordpress` | wordpress-specialist | extends `properties/websites/` with WP-specific frontmatter | theme-update, plugin-audit, wp-security, wp-content-migration | WordPress shops |
| `office-town-pack-business` | estimator, project-manager, product-manager, marketer, writer | `quotes/`, expanded `projects/` | proposal-draft, client-onboarding, scope-estimation | Service businesses, consultancies |
| `office-town-pack-cloudflare` | (helper agents, not core roles) | — | Bundles **official Cloudflare skills** from `github.com/cloudflare/skills` + **official MCP servers** from `github.com/cloudflare/mcp` | Cloudflare-deployed teams (everyone using Office Town Cloud) |
| `office-town-pack-comms` | helpdesk, social-poster, newsletter-editor | — | inbox-triage, social-draft | High-comms-volume teams |

### `office-town-pack-cloudflare` — special case

This pack doesn't add new roles. It bundles **Cloudflare's own** skills + MCP servers so the user gets one-install setup for managing their Cloudflare account from Goose:

- Cloudflare skills (R2 management, Workers deploy, DNS edits) — from https://github.com/cloudflare/skills
- Cloudflare MCP servers (Workers, DNS, KV, R2, D1) — from https://github.com/cloudflare/mcp

Because Office Town Cloud runs on Cloudflare, this pack is bundled with the standard install prompt so users get the Cloudflare ops MCPs alongside their Office Town deployment. Users can disable it from their Goose config if they're not managing their own CF infrastructure.

This replaces what I'd been calling `office-town-devops` — instead of building our own Cloudflare MCP, we use Cloudflare's official ones plus add our deployment-specific recipes.

## Composing with Goose built-ins

Office Town deployments also enable Goose's built-in extensions:

- **Memory** (built-in) — per-role preferences
- **Top of Mind / MOIM** (built-in) — town-wide standing orders
- **Chat Recall** (built-in) — cross-session memory
- **Summon** (built-in) — subagent dispatch
- **Apps** (built-in) — for in-chat dashboards
- **Auto Visualiser** (built-in) — automatic charts
- **Developer** (built-in) — local filesystem
- **Knowledge Graph** (npm package) — opt-in for relational reasoning

The Office Town plugin configures these as defaults; users can disable per deployment.

---

## Distribution

Each extension is its own package within the office-town-cloud monorepo. They deploy to a single Cloudflare account on `pnpm deploy`. Users get one URL per extension that they wire into Goose.

Versioning: monorepo-shared semver. Each MCP server publishes its OpenAPI / MCP schema at `/api/mcp/<name>/schema` for discoverability.

## design.md integration (v1.1+)

Google's [design.md](https://designmd.ai/) is an emerging open draft spec for capturing a project's design system as a single markdown file (colors, typography, spacing, components, accessibility rules). It's complementary to AGENTS.md, not competing — different scope (design system vs agent context).

**Office Town integrates at two levels:**

1. **Office Town's own design system** — we ship a `design.md` at the office-town-cloud repo root describing the dashboard's visual language. Contributors building MCP Apps, community themes, or alternate dashboards have a canonical reference.
2. **Per-deployment brand guidelines** — each town's wiki carries the user's `wiki/business/design.md` describing their brand. The **designer role** (creative pack) reads it when generating mockups; the **share extension** (publish mode) uses it when rendering markdown to HTML.

The spec is in draft. We track it without committing until it stabilises. Adoption target: v1.1 alongside the creative pack.
