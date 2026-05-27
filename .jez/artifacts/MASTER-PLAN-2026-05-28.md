---
title: Office Town — Master Plan
date: 2026-05-28
status: AUTHORITATIVE — supersedes prior planning docs
supersedes:
  - ARCHITECTURE.md (sections that conflict; sections about substrate-as-R2 still valid)
  - EXTENSIONS-CATALOGUE.md (v1/v1.1 splits — corrected here)
  - BUILD-SPEC.md (pre-single-worker-collapse; collapse plan in artifacts/ is current)
  - SHIP-PLAN.md (M1-M8 milestones — current state captured in §6 here)
authoritative-companions:
  - docs/MEMORY-COMPARISON.md (pivot rationale — unchanged, still authoritative)
  - WIKI-SCHEMA.md (collection schema — unchanged)
  - .jez/artifacts/conversation-audit-2026-05-28.md (full decision history)
  - .jez/artifacts/scope-audit-2026-05-28.md (shipped-vs-designed gap)
  - .jez/artifacts/goose-knowledge-{01..05}.md (Goose primitives reference)
  - .jez/artifacts/cloudflare-knowledge-{01..03}.md (Cloudflare primitives reference)
---

# Office Town — Master Plan v1.0

This document is the authoritative source of truth for what Office Town is, what it ships, and how it gets built. It synthesizes everything from the 8 knowledge files (5 Goose + 3 Cloudflare) and the full conversation audit into one coherent plan.

A future session reads THIS first. Stale planning docs (ARCHITECTURE.md, EXTENSIONS-CATALOGUE.md, BUILD-SPEC.md, SHIP-PLAN.md) are noted as superseded — they're preserved for historical context but the decisions here win.

## 1. What Office Town is, in one paragraph

Office Town adds **team-shaped capabilities** to a [Goose](https://block.github.io/goose/) installation: four addressable roles (boss, librarian, worker, scout), a Cloudflare-backed shared wiki that REPLACES Goose's built-in Memory extension (per [`docs/MEMORY-COMPARISON.md`](../../docs/MEMORY-COMPARISON.md)), MCP servers for the agent-facing surface, and a Goose plugin that bundles the agents/skills/recipes/hooks. Distribution: open-source Goose plugin (`goose plugin install`) + one-click Cloudflare deployment. User brings their own LLM provider via Goose's standard provider system.

## 2. Architecture — locked-in decisions

These are settled. Future sessions don't re-litigate without `ultrathink` mode.

| Decision | Choice | Source |
|---|---|---|
| **Replace Goose Memory?** | YES — wiki MCP is the memory layer | MEMORY-COMPARISON.md (source-code audit) |
| **Worker count?** | ONE worker, `office-town`, four MCPs at `/mcp/{path}` | single-worker-collapse-plan-2026-05-27.md |
| **Distribution?** | Deploy-to-Cloudflare button + `goose plugin install` + `goose mcp add` | conversation-audit (Qwen install failure drove pivot) |
| **Custom Goose distro?** | PARKED — Goose Desktop is mature enough; we add capabilities not a fork | conversation-audit 2026-05-27 morning |
| **Email outbound?** | Cloudflare `send_email` binding only (no SMTP2Go) | 2026-05-28 decision |
| **Devops MCP?** | DROPPED — defer to Cloudflare's official MCPs (`github.com/cloudflare/mcp`) | 2026-05-28 decision |
| **Bindings vs API keys?** | Bindings wherever they exist | universalised |
| **MCP server shape?** | Gateway tool with N actions (per `~/.claude/rules/mcp-gateway-pattern.md`) | Jezweb standard |
| **Plugin format?** | Open Plugin Spec — `.plugin/plugin.json` + `agents/` + `skills/` + `commands/` + `hooks/` + `rules/` | Goose roadmap #9173 |
| **Plugin location?** | `~/.agents/plugins/<name>/` (NOT `~/.goose/plugins/`) | goose-knowledge-02 confirmed |
| **Recipe format?** | YAML in `commands/<name>.yaml` per Goose recipe spec | goose-knowledge-02 |
| **MCP transport?** | streamable-HTTP for our Cloudflare-hosted MCPs | matches our hosting model |
| **Substrate?** | R2 markdown canonical + D1 (FTS5 index) + Vectorize (semantic) | ARCHITECTURE.md (still valid) |
| **Search?** | Hybrid FTS5 + Vectorize with RRF fusion | ARCHITECTURE.md |
| **Universal sextet?** | YAML frontmatter: slug, kind, created, last_updated, last_edited_by, last_change_summary | WIKI-SCHEMA.md |
| **Audit?** | `wiki_audit` D1 table with REQUIRED `why:` field per write/supersede/archive | MEMORY-COMPARISON.md |
| **Synthesis on recall?** | MCP Sampling (host LLM) — zero added cost | MEMORY-COMPARISON.md + goose-knowledge-04 |
| **Apps + Summon + Skills (Goose defaults)** | Stay enabled; we lean on Summon for `@worker` / `@scout` delegation, Apps as a future dashboard target | goose-knowledge-03 |
| **Goose's Memory extension** | DISABLE in `~/.config/goose/config.yaml` during install — wiki replaces it | MEMORY-COMPARISON.md |

## 3. File / Input / Output Capability Matrix

For every kind of file/input/output an agent encounters, this table specifies which primitive handles it. This is the answer to *"maximise capabilities with every kind of file, input, output"*.

### 3.1 Document ingestion (file → markdown)

| Input | Cloudflare primitive | Office Town tool | Notes |
|---|---|---|---|
| PDF | `env.AI.toMarkdown()` | `files.convert` | Free for PDF/DOCX/XLSX/PPTX/HTML/MD; charged for images/audio |
| DOCX | `env.AI.toMarkdown()` | `files.convert` | |
| XLSX | `env.AI.toMarkdown()` | `files.convert` | |
| PPTX | `env.AI.toMarkdown()` | `files.convert` | |
| HTML | `env.AI.toMarkdown()` | `files.convert` | Strips boilerplate; preserves structure |
| Image (OCR) | `env.AI.toMarkdown()` | `files.convert` | Workers AI vision OCR; charged |
| Image (caption) | Workers AI vision models | `files.describe` (v1.1) | Llama 4 Scout multimodal |
| Audio (transcribe) | `env.AI.toMarkdown()` or Workers AI Whisper | `files.convert` | $0.0005/min via Whisper |
| Plain text | direct read | `files.read` | Trivial |
| Markdown | direct read | `files.read` / `wiki.read` | |
| CSV | Parse + LLM-format via `wiki.search(synthesize: true)` | `files.convert` (special-cased) | v1.1 |
| Web URL | Browser MCP `browser.fetch` + `env.AI.toMarkdown()` | `browser.fetch_markdown` (composition) | Two-step today; could be one tool |
| Email (inbound) | `email()` worker handler + PostalMime parse | inbound handler writes wiki/research/<date>-<sender> | Built today |

### 3.2 Web research

| Input | Primitive | Tool |
|---|---|---|
| URL → rendered HTML | Browser Rendering binding (`@cloudflare/puppeteer`) | `browser.fetch` |
| URL → screenshot (PNG) | Browser Rendering | `browser.screenshot` |
| URL → extracted data (CSS selectors) | Browser Rendering | `browser.extract` |
| URL → markdown (one-step) | Browser Rendering + toMarkdown | `browser.fetch_markdown` (new — combine) |
| Search the web | External: Tavily MCP or Firecrawl MCP | (user-installed extension) |
| AI Search | Cloudflare AI Search (April 2026) | future swap for wiki backend |

### 3.3 Image generation + transformation

| Output | Primitive | Tool |
|---|---|---|
| Generate image (text → image) | Workers AI FLUX 2 (`@cf/black-forest-labs/flux-2-*`) | `files.generate_image` (v1.1) |
| Resize image | Cloudflare Images binding (`env.IMAGES.input().transform()`) | `files.transform_image` |
| Format-convert (HEIC→JPG, etc.) | Cloudflare Images | `files.transform_image` |
| Strip EXIF | Cloudflare Images | `files.transform_image` |
| Thumbnail | Cloudflare Images | `files.transform_image` |
| Image hosting + signed URLs | R2 + `files.share` | `files.share` |

### 3.4 Audio + Video

| Input/Output | Primitive | Tool |
|---|---|---|
| Audio → text (transcribe) | Workers AI Whisper / Nova-3 | `files.convert` |
| Text → audio (TTS) | Workers AI Aura-2 | `files.speak` (v1.1) |
| Voice conversation | Cloudflare Realtime SFU + Pipecat + Nova-3 + Aura-2 | `voice.call` (v1.1) |
| Video upload + transcode | Cloudflare Stream | `files.video_upload` (v2) |
| Video captions (auto) | Stream + Workers AI Whisper | (v2) |

### 3.5 Email (inbound + outbound)

| Direction | Primitive | Tool |
|---|---|---|
| Outbound (to verified destinations) | `send_email` binding | `email.send` |
| Inbound (catch-all or per-address) | `email()` worker handler | (writes to wiki/research/) |
| Drafts | R2 storage via FilesService | `email.draft` |
| Send to arbitrary recipients | Out of scope (Cloudflare's binding requires verified destinations) | (user installs Gmail MCP for this) |

### 3.6 Publishing + sharing

| Use case | Primitive | Tool |
|---|---|---|
| Public page from markdown | Worker `/p/<slug>` route + renderMarkdownToHtml | `publish.create` |
| Temporary signed share link | Worker `/s/<token>` route + R2 | `files.share` (mode: temp) |
| Permanent share link | Worker `/p/<slug>` + R2 | `files.share` (mode: public) |
| Revoke share | D1 record + worker | `files.revoke` |

### 3.7 Memory + recall (the wiki)

| Use case | Tool | Backend |
|---|---|---|
| Write an entry | `wiki(action: write)` | R2 + D1 + Vectorize embed via queue |
| Read an entry by slug | `wiki(action: get)` | R2 (canonical markdown) |
| Search (hybrid FTS + vector) | `wiki(action: search)` | D1 FTS5 + Vectorize + RRF |
| Search with synthesis | `wiki(action: search, synthesize: true)` | + MCP Sampling host LLM |
| Browse a collection | `wiki(action: list, collection: ...)` | D1 metadata index |
| Recent entries | `wiki(action: list, sort: recent)` | D1 ORDER BY updated_at |
| Find by frontmatter filter | `wiki(action: list, filter: {kind: contact})` | D1 indexed filter |
| Path-pattern match | `wiki(action: glob, pattern: 'contacts/*')` | D1 LIKE |
| First N lines preview | `wiki(action: head, slug, lines: 30)` | R2 partial read |
| Cross-reference (related) | `wiki(action: related, slug, depth: 1)` | D1 link table + frontmatter |
| Atomic replace (supersede) | `wiki(action: supersede, slug, new_body, why)` | D1 tx + audit row |
| Soft-delete | `wiki(action: archive, slug, why)` | D1 status='archived' |
| Hard delete (rare) | `wiki(action: delete, slug, why)` | D1 + R2 remove |
| Audit log | `wiki(action: history, slug)` | D1 wiki_audit query |
| Collection schema | `wiki(action: collections)` | D1 collections table |
| Register new collection | `wiki(action: register, name, shape, ...)` | D1 collections insert |

### 3.8 Cron + scheduling

| Use case | Primitive | Tool |
|---|---|---|
| Recurring routine (e.g. weekly news sweep) | Worker `triggers.crons` in wrangler.jsonc + cron handler | `cron(action: schedule)` (v1.1 MCP wrapper around HTTP API) |
| One-off schedule | Durable Object alarms (v2 via Agents SDK) | v2 |

### 3.9 Code execution (sandbox)

| Use case | Primitive | Tool |
|---|---|---|
| Run untrusted code | Cloudflare Containers binding | `sandbox.run` (v1.1) |

### 3.10 Agent operations (subagent delegation, plans)

| Use case | Primitive | Mechanism |
|---|---|---|
| Delegate to a role | Goose's **Summon** extension (default-enabled) — `@worker`, `@scout`, etc. | Built into Goose; we just provide the role .md files via the plugin |
| Multi-step plan | Goose's **Plan** mode + Recipes | Built into Goose |
| Task list | Goose's **Todo** extension (default) | Built into Goose |
| Standing orders | Goose's **Top of Mind / MOIM** (default) + our `rules/town-standing-orders.md` | Built into Goose; we provide the rules file via plugin |

## 4. Tool surface — locked design

### 4.1 The wiki MCP (`/mcp/wiki`)

**One gateway tool `wiki` with 14 actions**. (The 8 from MEMORY-COMPARISON.md plus the 6 browse-layer actions from the transcript.)

```typescript
wiki(action: 'write' | 'get' | 'search' | 'supersede' | 'archive' | 'delete' |
             'history' | 'link' | 'list' | 'tree' | 'recent' | 'glob' |
             'head' | 'head_many' | 'related' | 'collections' | 'register',
     ...args)
```

| Action | Purpose | Required args | Returns |
|---|---|---|---|
| `write` | Create new entry | `collection, slug?, frontmatter, body, why` | `{slug, uuid, audit_id}` |
| `get` | Fetch full entry | `collection, slug` | full entry |
| `search` | Hybrid FTS+vector | `query, collections?, limit?, expanded?, synthesize?` | triage shapes (frontmatter + 300-char excerpt + signed URL) OR synthesized answer |
| `supersede` | Atomic old→new | `collection, slug, new_frontmatter?, new_body?, why` | new entry |
| `archive` | Soft delete (filterable out) | `collection, slug, why` | `{ok}` |
| `delete` | Hard delete (rare) | `collection, slug, why` | `{ok}` |
| `history` | Audit log | `collection, slug, limit?` | array of audit rows |
| `link` | Cross-reference | `from, to, kind?` | link record |
| `list` | Browse a collection | `collection, filter?, limit?, cursor?, sort?` | array of {slug, frontmatter, byte_count} |
| `tree` | Directory shape | `path?, depth?` | nested tree |
| `recent` | Last-modified | `since_days?, collection?, kind?, limit?` | array of recents |
| `glob` | Pattern match | `pattern` (e.g. 'contacts/acme-*') | array of slugs |
| `head` | First N lines | `collection, slug, lines?` | preview string |
| `head_many` | Bulk preview | `slugs: [{collection, slug}], lines?` | array of previews |
| `related` | Linked entries | `collection, slug, depth?` | tree of related |
| `collections` | List all | (none) | array of collection defs |
| `register` | New collection | `name, shape, canonical_filename, required_fields, description, why` | `{ok}` |

**Design contracts** (per MEMORY-COMPARISON.md):

1. List/search NEVER return bodies — only metadata + signed URLs
2. Static preamble at MCP handshake is ≤2KB count-only
3. `why:` field REQUIRED on every mutation
4. Stable UUIDs returned on `write`
5. Atomic supersession via D1 transaction
6. Search filters `status: active` by default
7. MCP Sampling for synthesis (zero added cost)
8. Audit table logs every mutation

**Audit table schema**:

```sql
CREATE TABLE wiki_audit (
  audit_id     TEXT PRIMARY KEY,
  ts           INTEGER NOT NULL,           -- unix ms
  action       TEXT NOT NULL,              -- write/supersede/archive/delete/link/register
  collection   TEXT NOT NULL,
  slug         TEXT NOT NULL,
  agent_slug   TEXT,                       -- librarian/boss/worker/scout/etc.
  session_id   TEXT,                       -- Goose session ID
  prev_hash    TEXT,                       -- SHA256 of prior content (null on first write)
  new_hash     TEXT,                       -- SHA256 of new content (null on archive/delete)
  why          TEXT NOT NULL,              -- REQUIRED reason
  FOREIGN KEY (collection, slug) REFERENCES wiki_entries(collection, slug)
);
CREATE INDEX wiki_audit_by_entry ON wiki_audit(collection, slug, ts DESC);
CREATE INDEX wiki_audit_by_agent ON wiki_audit(agent_slug, ts DESC);
```

### 4.2 The files MCP (`/mcp/files`)

**One gateway tool `files` with 8 actions**.

| Action | Purpose |
|---|---|
| `convert` | Any-doc → markdown (PDF/DOCX/XLSX/PPTX/HTML/image/audio via Workers AI toMarkdown) |
| `transform_image` | Resize/crop/format-convert via Cloudflare Images |
| `upload` | Put a file into R2 |
| `download` | Get a file from R2 |
| `list` | List files in a path |
| `delete` | Remove a file |
| `share` | Create signed-URL share (mode: temp \| public) |
| `revoke` | Invalidate a share |

This merges the originally-planned "share" MCP (files + publish) into one. Publish becomes `share(mode: public)`.

### 4.3 The email MCP (`/mcp/email`)

**One gateway tool `email` with 2 actions** (small surface, fewest tools).

| Action | Purpose |
|---|---|
| `send` | Outbound via Cloudflare Email Routing binding (verified destinations only) |
| `draft` | Save draft to FILES bucket for review |

Inbound is the worker's `email()` handler, NOT a tool — it fires when mail arrives.

### 4.4 What we do NOT build (defer to ecosystem)

| Capability | Where users get it |
|---|---|
| Browser automation | Playwright MCP plugin OR Cloudflare's official browser MCP at `github.com/cloudflare/mcp` |
| Inbound Gmail / IMAP reading | Goose's Gmail MCP extension (third-party) |
| Cloudflare account ops (DNS, R2 admin, workers list) | `office-town-pack-cloudflare` plugin bundles Cloudflare's 14 official MCPs from `github.com/cloudflare/mcp` |
| Code search / repo analysis | Goose's Repomix or Pieces MCPs |
| Knowledge Graph reasoning | Goose's Knowledge Graph npm MCP (opt-in) |
| Web search | Goose's Tavily or Firecrawl MCPs |
| Voice (real-time) | v1.1 only — `office-town-voice` MCP via Realtime + Nova-3 + Aura-2 |
| Sandbox execution | v1.1 only — `office-town-sandbox` MCP via Containers |
| Cron MCP wrapper | v1.1 — HTTP API exists today; MCP wrapper for agent ergonomics |

## 5. Install flow — locked design

This is what INSTALL.md prescribes. Two steps for the user, ~7 minutes total.

### Step 1 — Deploy backend (Cloudflare button, ~2 min)

User clicks `[Deploy to Cloudflare]` button on the README. Cloudflare web flow:
1. Signs them in (no API token required)
2. Reads `wrangler.jsonc` from `office-town-cloud` repo
3. Auto-provisions D1, R2 buckets, Vectorize, Queue, Workers AI binding, Browser binding, Images binding, send_email binding
4. Prompts for required secrets from `.dev.vars.example`: `MCP_BEARER_TOKEN`, `BETTER_AUTH_SECRET`
5. Optionally prompts for: `GOOGLE_CLIENT_ID/SECRET` (dashboard auth)
6. Deploys
7. Returns: `https://office-town-<hash>.<account>.workers.dev`

### Step 2 — Wire into Goose (paste prompt into any capable agent, ~5 min)

User pastes the INSTALL.md prompt into Goose / Claude Code / Aider with:
- The deployment URL
- The MCP_BEARER_TOKEN

Agent runs (proper way per goose-knowledge-01):

```bash
# Verify deployment
curl -s <URL>/health
# Expect: {"status":"ok","service":"office-town",...}

# Install plugins (Open Plugin Spec, installed to ~/.agents/plugins/)
goose plugin install jezweb/office-town-plugin
goose plugin install jezweb/office-town-pack-knowledge

# OPTIONAL: pack-cloudflare for CF account ops (bundles cloudflare/mcp + cloudflare/skills)
goose plugin install jezweb/office-town-pack-cloudflare

# Wire MCP extensions properly via Goose's CLI (NOT raw YAML editing)
goose mcp add office-town-wiki --transport streamable_http \
  --url <URL>/mcp/wiki \
  --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
goose mcp add office-town-files --transport streamable_http \
  --url <URL>/mcp/files \
  --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
goose mcp add office-town-email --transport streamable_http \
  --url <URL>/mcp/email \
  --header "Authorization: Bearer <MCP_BEARER_TOKEN>"

# Disable Goose's built-in memory extension (wiki replaces it)
goose mcp disable memory

# Clone town template
git clone https://github.com/jezweb/office-town <town path>

# Restart Goose
```

Smoke test:
- `@boss "introduce the team"` — should know about the 4 buildings + 4 roles
- `wiki(action: write, collection: contacts, slug: smoke-test, frontmatter: {name: 'Test', kind: 'contact'}, body: 'Install test', why: 'smoke test')`
- `wiki(action: search, query: 'Test')` — should find it
- `wiki(action: list, collection: contacts)` — should show smoke-test

### Step 3 (optional, v1.1) — Declarative extension JSONs upstream

Same pattern as the Alibaba PR I shipped — declarative extension JSONs in Goose's `crates/goose/src/providers/declarative/office-town-{wiki,files,email}.json`. Users select "Office Town Wiki" from Goose's extension picker; URL+token prompts pop up. PR upstream. This is v1.1 polish, not v1.0 blocking.

## 6. Build plan — priority-ordered with effort

### Now-shipping work (v1.0 remediation, ~12 hours total)

| # | Item | Effort | Dependency |
|---|---|---|---|
| 1 | **Drop /mcp/browser from worker** — defer to Playwright plugin or Cloudflare's browser MCP | 30 min | — |
| 2 | **Reshape wiki MCP from 7 separate tools to 1 gateway with 14 actions** | 2 h | — |
| 3 | **Wiki audit table + `why` required** — Drizzle migration, populate on every mutation | 2 h | #2 |
| 4 | **`wiki(action: supersede)` atomic** — D1 transaction | 1 h | #3 |
| 5 | **Browse layer**: `list`, `tree`, `recent`, `glob`, `head`, `head_many`, `related` actions | 2.5 h | #2 |
| 6 | **`wiki(action: search, synthesize: true)`** via MCP Sampling | 1 h | #2 |
| 7 | **`files` MCP reshape to gateway + add `upload/download/list/delete/share/revoke` actions** | 1.5 h | — |
| 8 | **Rewrite INSTALL.md to use `goose mcp add`** instead of raw YAML | 30 min | — |
| 9 | **Update `compatibility_date` in wrangler.jsonc** to a recent date (picks up subrequest raise, DO deleteAll semantics) per cloudflare-knowledge-01 | 5 min | — |
| 10 | **Drop /mcp/email from worker too** OR keep as a single-action `send` gateway (decision needed) | 30 min | — |

### Post-v1.0 (deferred, listed for completeness)

**v1.1 (~2-3 weeks of focused work after v1.0 ships)**:
- Declarative extension JSONs upstream (Goose PR) — 4 hours per extension
- Voice MCP via Realtime + Nova-3 + Aura-2 — 2-3 days
- Sandbox MCP via Containers — 1-2 days
- Cron MCP wrapper — 4 hours
- `office-town-pack-cloudflare` (bundles Cloudflare's MCPs + skills) — 1 day
- AI Search benchmark spike (compare to our DIY stack) — 1 day

**v2 (after v1.1)**:
- Cloudflare Agents SDK integration for always-on personalised assistants
- Stream MCP for video
- Office Town Desktop reconsideration (only if init-config + first-launch wizard add genuine value)

## 7. Decisions locked in (was "open" — now resolved)

1. **`/mcp/email`**: KEEP — single-action gateway `email(action: send | draft)`. Binding-only outbound is genuinely useful and the surface is small.
2. **`/mcp/browser`**: DROP — Playwright plugin + `files.convert(source: url)` composition replaces it.
3. **Plugin location**: `~/.agents/plugins/office-town-plugin/` per Open Plugin Spec (Goose-knowledge-02 confirmed).
4. **Wiki schema migration**: gateway shape change is one big v1.0 commit; plugin skills/recipes updated in the same release.
5. **Bucket architecture (NEW — Jez raised 2026-05-28)**: Single substrate bucket with **entity-as-folder** layout (Goanna-style). Every entity gets a folder; `entity.md` is canonical; any sibling files (logo.png, contract.pdf, recording.m4a) are first-class attachments. Wiki MCP indexes `.md`; files MCP handles binaries via attachment actions.
6. **Local sync daemon (NEW)**: v1.1 "officetowd" daemon (Goanna-style bisync). v1.0 ships cloud-only but **paths are designed filesystem-friendly** so the daemon can mirror without scheme translation. v1.0 users who want local sync today are documented to use `rclone mount` or `mountpoint-s3` against R2.

### Bucket layout — locked

```
office-town-substrate/  (single R2 bucket, was WIKI+FILES split)
├── wiki/
│   ├── <collection>/
│   │   ├── <slug>/
│   │   │   ├── entity.md         ← canonical (indexed in D1+Vectorize)
│   │   │   ├── <any>.png         ← attachment
│   │   │   ├── <any>.pdf         ← attachment
│   │   │   └── <subfolder>/...
│   │   └── _index.md             ← collection-level (optional)
│   └── _config/                  ← collections registry, schemas
├── files/                        ← general user uploads, not entity-bound
├── published/                    ← /p/<slug> rendered HTML
├── shares/                       ← signed-URL temp shares
└── email-drafts/                 ← email.draft destinations
```

This is filesystem-mountable as-is — `rclone mount office-town-substrate: ~/Documents/<town>/` gives users their wiki in Finder + accessible via Goose's Developer extension (filesystem tools).

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Wiki MCP reshape breaks plugin skills that hardcode `wiki.search` etc. | Skills are in `office-town-plugin` repo — update simultaneously. Add a migration note. |
| `goose mcp add` CLI may not exist or differ from docs | Verify via `goose mcp --help` before shipping INSTALL.md. Fall back to deeplink (`goose://extension?...`) or config.yaml editing as graceful degradation. |
| Cloudflare deploy button + placeholder `00000000-0000-...` D1 ID — does CF auto-create fresh? | Test on a clean account before announcing. If it doesn't, document a 2-step install (CF dashboard create D1 first, then deploy). |
| MCP Sampling may not work in every Goose host context | `synthesize: true` is opt-in. Fall back to returning raw triage shapes. |
| Vectorize metadata indexes must exist before first vector — deploy button might insert before indexes are created | Add a startup hook that creates metadata indexes on first request if absent. Defensive. |
| 25-tool ceiling per session (Goose limit) — our 14 wiki actions + 8 files actions + 2 email = 24 — tight | Gateway-action shape means ONE tool per MCP — so it's 4 tools total (wiki+files+email+browser-if-kept), well under the ceiling. ✓ |

## 9. Files we'll touch in v1.0 remediation

Source code:
- `src/types.ts` — Env updates (no changes; bindings already declared)
- `src/db/schema.ts` — add `wiki_audit` table
- `drizzle/0004_wiki_audit.sql` (new migration)
- `src/wiki/service.ts` — reshape to gateway action handler
- `src/wiki/search.ts` — keep, used by gateway's search action
- `src/wiki/routes.ts` — keep HTTP API parallel to MCP (dashboard uses it)
- `src/mcp-server/wiki.ts` — reshape from 7 tools to 1 gateway tool
- `src/mcp-server/files.ts` — reshape to gateway, add upload/download/list/delete/share/revoke
- `src/mcp-server/email.ts` — reshape to single gateway action `send` (or drop entirely)
- `src/mcp-server/browser.ts` — DELETE (defer to Playwright/Cloudflare official)
- `src/index.ts` — remove browser route mount
- `wrangler.jsonc` — drop `browser: { binding: BROWSER }` if dropping browser MCP; bump compatibility_date
- `package.json` — drop `@cloudflare/puppeteer` if dropping browser MCP

Docs:
- `INSTALL.md` — rewrite step 4 to use `goose mcp add`
- `README.md` — update tool surface table (5 → 3 MCPs)
- `EXTENSIONS-CATALOGUE.md` — mark as superseded, point to this master plan
- `ARCHITECTURE.md` — same
- `BUILD-SPEC.md` — same
- `SHIP-PLAN.md` — same

Plugin (`office-town-plugin` repo):
- `skills/*` — update any skill markdown that hardcodes old tool names
- `commands/*.yaml` — update recipes that call wiki tools
- `agents/*.md` — update role definitions if they hardcode tools

## 10. The acceptance test

Office Town v1.0 is "done" when a fresh user on a fresh Mac with only Goose installed can:

1. Visit `officetown.au` or `github.com/jezweb/office-town-cloud`
2. Click "Deploy to Cloudflare" button
3. Sign into Cloudflare, paste generated bearer token, click Deploy
4. Wait ~2 min, get back a worker URL
5. Open Goose, paste the INSTALL.md prompt with URL + token
6. Agent installs the plugin + adds the 3 MCPs via `goose mcp add` + disables Goose Memory + clones template
7. In Goose: `@boss "introduce the team"` returns coherent response
8. `wiki(action: write, ...)` succeeds
9. `wiki(action: search, ...)` finds it
10. `wiki(action: list, collection: contacts)` browses
11. `files(action: convert, source: 'url', source_value: 'https://example.com/test.pdf', filename: 'test.pdf')` returns markdown
12. Done in under 10 minutes total.

---

## Appendix A — Knowledge file index

For deep reference, the 8 knowledge files capture everything researched:

| File | Coverage | Lines |
|---|---|---|
| `goose-knowledge-01-getting-started-guides.md` | Install, providers, extensions, sessions, context, hints, plans, subagents, skills | ~1500 |
| `goose-knowledge-02-recipes-tools-config.md` | Recipes, hooks, plugins, prompt templates, tool permissions, config files, env vars | ~1400 |
| `goose-knowledge-03-custom-extensions-and-existing.md` | Custom Extensions tutorial + 25 existing MCP servers' details | ~1700 |
| `goose-knowledge-04-advanced-mcp-features.md` | MCP Sampling, Apps/UI, Elicitation, Roots, Sandbox, multi-model, ACP | ~2000 |
| `goose-knowledge-05-architecture-deep-dive.md` | Architecture, Extensions design, error handling, security, sources, troubleshooting | ~900 |
| `cloudflare-knowledge-01-workers-storage-compute.md` | Workers, D1, R2, KV, Vectorize, DO, Hyperdrive, Queues, Workflows, Pipelines, Pages, Assets, Secrets Store | ~2000 |
| `cloudflare-knowledge-02-ai-products.md` | Workers AI, toMarkdown, AI Gateway, AI Search, Agents SDK, Vectorize-as-AI, Images, Stream, Realtime, MCP Sampling | ~1800 |
| `cloudflare-knowledge-03-communication-media-edge.md` | Email Routing, Realtime, Stream, Containers, Pipelines, Workflows, Browser Rendering, cloudflare/mcp + cloudflare/skills | ~1400 |

Total: ~12,700 lines of structured Goose + Cloudflare reference. Future sessions read these for any specific feature deep-dive without needing to re-research.

## Appendix B — Decision provenance

Every decision in §2 has a paper trail:

- MEMORY-COMPARISON.md (Goose Memory audit + pivot rationale)
- conversation-audit-2026-05-28.md (full session decision history)
- scope-audit-2026-05-28.md (shipped-vs-designed gap analysis)
- goose-knowledge-{01..05}.md (Goose primitives reference)
- cloudflare-knowledge-{01..03}.md (Cloudflare primitives reference)
- `~/.claude/rules/mcp-gateway-pattern.md` (Jezweb's MCP shape standard)
- `~/.claude/rules/cloudflare-workers.md` (CF gotchas)
- `~/.claude/rules/cloudflare-storage.md` (CF storage gotchas)

When in doubt, consult the source.
