---
title: Conversation audit — what we actually decided
date: 2026-05-28
status: source-of-truth, derived from full transcript review
agents-used: 4 parallel general-purpose agents reading the 43MB session jsonl
---

# Conversation audit — full design vs shipped state

Four parallel agents read the entire session transcript
(`8fa7aacd-5c9d-4fe3-9725-046f0ee5560d.jsonl`, 13,935 lines, 2026-05-25 to
2026-05-28). This consolidates what we ACTUALLY decided across the
conversation, versus what's in code today.

## 1. Wiki MCP — the memory layer (per MEMORY-COMPARISON.md decision)

### Designed shape: ONE gateway tool `wiki` with 8 actions

```
wiki(action: 'list'|'get'|'search'|'write'|'supersede'|'link'|'archive'|'history', ...args)
```

The 8 actions are: **list, get, search, write, supersede, link, archive, history**.

Per `~/.claude/rules/mcp-gateway-pattern.md` (Jezweb standard for all
MCPs — basalt-cortex, smtp2go, gmail, etc. all use it). Our shipped
state uses 7 SEPARATE tools (`wiki.create`, `wiki.read`, `wiki.update`,
`wiki.delete`, `wiki.search`, `wiki.list_collections`,
`wiki.register_collection`) — wrong shape.

### Plus a "Claude Code file-finding equivalent" exploration layer

Jez surfaced (line 5787 transcript): *"the wiki MCP must support
browsing as a first-class use case, not just question-answering."*

Designed tools (verbatim from transcript line 5787):

```
wiki.tree(path?, depth?)       — list directory structure
wiki.list(collection, filters?) — list entries with optional frontmatter filters
wiki.list_collections()        — list all collections
wiki.recent(since?, kind?, limit?) — recently-modified entries
wiki.related(slug, depth?)     — entries linked to / from this one
wiki.glob(pattern)             — pattern match across paths (find . -name "X*")
wiki.head(slug, lines?)        — first N lines of an entry (cat | head)
wiki.head_many(slugs[])        — bulk first-N-lines across multiple
```

Mapped against Claude Code's primitives:

| Claude Code tool | Wiki equivalent |
|---|---|
| `ls` / `find . -type f` | `wiki.tree`, `wiki.list` |
| `find . -name "pattern*"` | `wiki.glob(pattern)` |
| `grep` | `wiki.search` (FTS5 + Vectorize hybrid) |
| `cat` | `wiki.get(slug)` |
| `head` | `wiki.head(slug, lines?)` |
| `ls -t` (recent) | `wiki.recent(since?, kind?, limit?)` |
| `git log` (history) | `history` action of gateway |

**None of these browse/find tools are shipped.** Only `wiki.search` +
`wiki.read` + `wiki.list_collections` exist.

### The 8 design contracts (verbatim from transcript line 5177)

1. **List/search NEVER return bodies** — only metadata + signed URLs
2. **Static preamble at handshake is ≤2KB** count-only (not the
   bloated-system-prompt failure mode of Goose Memory)
3. **Required `why:` field** on every write/supersede/archive
4. **Stable UUIDs** per entry (returned on write)
5. **Atomic supersession via D1 transaction** — old → new in one tx
6. **Search filters to `status: active` by default** — archived
   excluded unless explicit
7. **MCP Sampling for synthesis** — `wiki.search({synthesize: true})`
   uses the host LLM, not our own model (zero cost added)
8. **Audit table logs every write** — `wiki_audit` D1 table

### `wiki_audit` D1 table schema (verbatim from transcript line 5177)

```
wiki_audit:
  audit_id     — UUID
  ts           — timestamp
  action       — write|supersede|archive|delete|link
  slug         — entry slug
  agent_slug   — which agent did this (librarian, boss, worker, scout, etc.)
  session_id   — Goose session ID
  prev_hash    — SHA256 of prior content (null on first write)
  new_hash     — SHA256 of new content (null on archive/delete)
  why          — REQUIRED reason string
```

Not in schema today. `drizzle/` has no `wiki_audit.sql`.

### Shipped vs designed — the gap

| Designed | Shipped | Status |
|---|---|---|
| Gateway `wiki` tool, 8 actions | 7 separate tools | **structural mismatch** |
| `wiki.list / tree / recent / glob / related / head / head_many / get` | only `wiki.read` (which is `get`-equivalent) | **8 browse tools missing** |
| `wiki.supersede` (atomic in D1) | `wiki.update` does PATCH | **no supersession** |
| `wiki.search(synthesize: true)` via MCP Sampling | no synthesize flag | **no synthesis** |
| `wiki_audit` table with `why` required | no table | **no audit** |
| Stable UUIDs returned on write | slug returned, UUID unclear | **partial** |
| ≤2KB preamble | unclear (not measured) | **likely OK but not enforced** |
| Default filter `status: active` | no filter | **archived entries return** |
| Required `why:` on writes | optional `last_change_summary` field exists | **partial** |
| `wiki.link` (cross-reference) | not built | **missing** |
| `wiki.archive` (soft delete) | only `wiki.delete` (hard) | **missing** |
| `wiki.history` (audit log read) | not built | **missing** |

## 2. v1.0 scope — full extension list per EXTENSIONS-CATALOGUE.md

**v1.0 (was supposed to ship)**: substrate (wiki), kanban, cron, files, publish

**v1.1 (deferred)**: voice, browser, email, sandbox, search, devops

**Files + publish were merged into `office-town-share`** mid-session:
> *"Files + publish should be one tool, not two. … One office-town-share extension with share(content, mode='temp' | 'public')"*

Today we have:
- ✅ Wiki MCP (wrong shape, missing 12+ designed actions/tools)
- ⚠ Files MCP (only `convert` + `transform_image`, missing the `share` tool surface that was supposed to subsume publish)
- 🔴 Browser MCP — built but is v1.1 per plan
- 🔴 Email MCP — built but is v1.1 per plan (devops MCP correctly dropped)
- ❌ Kanban MCP — never built
- ❌ Cron MCP — only HTTP API, no MCP tool surface
- ❌ Publish MCP — only HTTP API, never merged into share

## 3. Ecosystem wiring — what's supposed to be in INSTALL.md

### Goose default extensions (Jez verbatim, line 12281)
> "Analyze, Apps, Developer, Extension Manager, Skills, Summon, Todo, Top Of Mind"

All 8 stay enabled (defaults). The two we explicitly lean on:
- **Summon** — for `@worker` / `@scout` subagent delegation
- **Apps** — could host the dashboard inside Goose Desktop (v1.1)

### `memory` extension
Disable in INSTALL.md — wiki MCP replaces it. **Already correctly
documented** in current INSTALL.md.

### Cloudflare's official MCPs
Source: `github.com/cloudflare/mcp` — products mentioned: **Workers,
DNS, KV, R2, D1**. Bundled via `office-town-pack-cloudflare` plugin.
**Not yet in INSTALL.md** — should be added.

### Third-party MCPs from Goose's catalogue
Mentioned in transcript: Firecrawl, Playwright, Knowledge Graph
Memory, GitHub, Tavily, Figma, Vercel, Netlify, Supabase, ElevenLabs,
MongoDB, JetBrains, YouTube Transcript, Selenium, Reddit, PDF Reader,
Nano Banana. Of these, **Playwright** is the Goose-native equivalent
of our too-eagerly-built browser MCP.

### Distribution mechanism
- `goose plugin install <git-url>` — for OUR plugins (plugin, pack-knowledge, role packs, pack-cloudflare)
- `config.yaml` editing for MCPs (NOT `goose mcp add`) — 5 streamable_http entries currently

## 4. Major pivots — for context preservation

| When | Pivot | Trigger |
|---|---|---|
| 2026-05-26 | "Office Town as capabilities, not a fork" — first articulation | Jez |
| 2026-05-26 | Files + publish merged into `office-town-share` | Jez "needs to be really easy for agents to share screenshots, images, docs, html pages, md" |
| 2026-05-26 | Replace Goose Memory entirely | Jez "im sure you can make a better memory system, extract the goose memory extension" |
| 2026-05-27 morning | Drop custom Goose distro, "capabilities for Goose" | Jez "we discovered that was coming soon in the discord discussion. how about we put the desktop app repo private" |
| 2026-05-27 | Single-prompt collapse (was 2 prompts) | Jez "can we just have one prompt" |
| 2026-05-27 | Qwen 3.6 dogfood failure on fresh Mac (Phase 2 stuck) | dogfood evidence |
| 2026-05-27 | Deploy to Cloudflare button → single-worker collapse | Jez "must be a better cloudflare way" |
| 2026-05-27 | "Bindings over API keys" universalised | Jez "bindings are best, do it" |
| 2026-05-28 | Drop SMTP2Go | Jez "we dont need smtp2go, cloudflare has email sending" |
| 2026-05-28 | Drop devops MCP (defer to Cloudflare's official) | Jez "can we leave that for an agent pack?" |
| 2026-05-28 | Stop building, audit what's missing | Jez "time for a proper detailed careful review" |

## 5. What Jez consistently emphasises (recurring values across the session)

1. **Simplicity over cleverness** — fewer repos, workers, prompts, steps. "Less confusing" is the recurring justification.
2. **No upstream Goose dependency** — Office Town must work on stock Goose. *"i dont think we should make office town depending on anything i might do or not do with goose."*
3. **Ultrathink at architecture inflection points** — explicitly invokes it.
4. **Files-everywhere, markdown-everywhere visibility** — the Goanna instinct. Wiki uses markdown + frontmatter, no opaque schemas.
5. **Don't standardise on what's taken** — AGENTS.md (not CLAUDE.md, not anthro).
6. **Drop the trail when you pivot** — scrub the desktop-distro mentions, don't deprecate.
7. **Dogfood on the actual constraint** — fresh Mac + non-Claude model surfaced what passed in dev.
8. **Defer to platform primitives** — Cloudflare email → drop SMTP2Go. Cloudflare MCPs → drop devops. Bindings exist → use them.
9. **Question abstractions when they keep changing shape** — distro doubt, memory doubt, worker-count doubt all from the same instinct.
10. **Single-tenant first, multi-tenant never** — per-deployment CF accounts, no SaaS ambitions.

## 6. The honest summary

The wiki MCP we shipped is **maybe 30% of what MEMORY-COMPARISON.md
promised**. The missing 70% includes:

- The entire browse/find layer (8 tools — `tree`, `list`, `recent`,
  `glob`, `related`, `head`, `head_many`, `get`)
- Atomic supersession with audit
- Synthesis via MCP Sampling
- The audit table itself
- Soft-delete (`archive`) vs hard-delete
- Cross-reference (`link`)
- History reads
- The gateway-shape consolidation (8 actions on one tool)

PLUS the browser and email MCPs are early (v1.1 work shipped in v1.0)
and the kanban/cron-as-MCP/share are missing entirely.

The build sequence I'd recommend now, in priority order:

1. **Wiki browse layer** (`wiki.tree`, `wiki.list`, `wiki.recent`,
   `wiki.glob`, `wiki.head`, `wiki.head_many`) — fixes the immediate
   "can't browse the wiki" complaint Jez raised. ~3 hours.
2. **Audit table + supersession** — the durability promise. New
   Drizzle migration, `wiki_audit` table, `wiki.supersede` action,
   require `why:` on every write. ~3 hours.
3. **Drop the over-built MCPs** (browser, email — keep inbound
   email() handler). ~30 min.
4. **Rewrite INSTALL.md** with the full ecosystem wiring (Goose
   built-ins to keep enabled, `memory` to disable, our worker MCPs,
   Cloudflare's official MCPs via pack-cloudflare). ~1 hour.
5. **Synthesis via MCP Sampling** — v1.1 (advanced).
6. **Reshape wiki MCP from 7-tools to 1-gateway** — v1.1 (breaking
   change to plugin/dashboard consumers; do it once).
7. **Files MCP merger with publish into `share` shape** — v1.1.
8. **Kanban/cron MCPs** — v1.1.

Total v1.0 remediation: ~7-8 hours of focused work.
