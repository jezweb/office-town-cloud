---
title: Scope Audit — Office Town v1.0
date: 2026-05-28
status: honest review, awaiting Jez direction
---

# Scope Audit — Office Town v1.0

Re-grounding against the original design doc
(`~/Documents/.jez/knowledge/office-town.md`) and EXTENSIONS-CATALOGUE.md
to see where the build diverged from intent.

## TL;DR

We over-built in some places and under-built in others. The wiki MCP is
correct. The files/browser/email MCPs are partial or wrong-tier. We never
shipped kanban or search MCPs. **And critically — we never documented
which Goose built-ins and external extensions the user should install
alongside the Office Town MCPs.** That's the gap Jez is feeling.

The desktop app **did not contain any of this** — it was just rebranded
Goose with an `init-config.yaml` bundled. The bundled config would have
wired the same MCPs and extensions, but the desktop app added zero new
functionality. So nothing was "in the desktop app but lost in the
collapse." Everything that existed survived.

## What the original design said

> **CORRECTION 2026-05-28**: an earlier version of this audit cited
> `office-town.md` v1.1 (2026-05-26) saying "use Goose built-in Memory
> for per-role preferences." **That was pre-pivot.**
> `docs/MEMORY-COMPARISON.md` (2026-05-27) is the authoritative later
> decision and says the OPPOSITE: build our own wiki, DISABLE Goose's
> Memory extension entirely. Wiki replaces Memory. The audit below has
> been rewritten to reflect the actual pivot.

From `docs/MEMORY-COMPARISON.md` (the authoritative decision):

> **Three reasons to build our own memory layer:**
>
> 1. Goose Memory has confirmed structural weaknesses we cannot work
>    around (system prompt bloat, tag-as-HashMap-key bug, substring
>    deletion, no path traversal protection, race-prone writes, no
>    semantic search, no supersession, no audit, no versioning, no
>    cross-machine sync, returns Rust debug format)
> 2. Our wiki integrates with Cloudflare-native primitives (R2, D1, Vectorize)
> 3. Our wiki integrates with Goose's emerging `Source` system

> **Memory + wiki — disable one.** The Office Town INSTALL.md prompt
> instructs the agent to disable Goose's `memory` extension during
> setup — the wiki MCP replaces it.

So the memory architecture is:

| Layer | Decision |
|---|---|
| Goose's built-in `memory` extension | **REPLACE** with our wiki. Disable in INSTALL.md (we do). |
| **Top of Mind / MOIM** (Goose default) | Keep enabled — per-turn standing orders. |
| **Chat Recall** | Not in Goose's 8 defaults, not in v1 scope. |
| **Knowledge Graph (npm)** | Not in v1 scope. |
| **`office-town-wiki`** | Team-scale shared knowledge with FTS5 + Vectorize + audit + supersession. THE memory layer. |

And:

> Office Town Cloud (separately installable backend)
> - MCP extensions: **wiki, files, publish, kanban, search**
> - Cloudflare-backed: **voice, browser, email, sandbox**
> - Web dashboard / town map

And the librarian's tooling was supposed to include:

> - Email reader (Gmail / IMAP MCP)
> - Web scraper (browser-rendering MCP, Firecrawl, etc.)
> - CRM connector (HubSpot / Pipedrive / Twenty / etc.)
> - File extractor (mediabox-shaped — any file → markdown/text)
> - Chat archive reader
> - RSS / feed readers

**All EXTERNAL extensions, not built by us.**

## What we actually built (current state)

| MCP server | Status | Original tier | Notes |
|---|---|---|---|
| `office-town-wiki` (7 tools) | ✅ built | v1 | Correct scope. Wiki CRUD + hybrid search. |
| `office-town-files` (2 tools) | ⚠ partial | v1 was `share` — files+publish merged | We have `files.convert` + `files.transform_image`. Missing: `share`, `download`, `extract`, `revoke`, `list_shares`. The HTTP API has these but not exposed as MCP tools. |
| `office-town-browser` (3 tools) | 🔴 v1.1 shipped in v1 | v1.1 | Should not be in v1.0 worker. Plus Goose can use Playwright or Cloudflare's official browser MCP. |
| `office-town-email` (2 tools) | 🔴 v1.1 shipped in v1 | v1.1 | Should not be in v1.0 worker. Inbound is fine to keep (it's just an `email()` handler). Outbound MCP duplicates what Gmail MCP gives the librarian per the original plan. |
| `office-town-cron` | ❌ missing | v1 was planned | We have cron HTTP API (`/api/cron/*`) but no MCP for agents to schedule recurring routines. |
| `office-town-search` | ❌ missing | v1 was planned | The plan was a "search" MCP wrapping FTS+vector. We baked `wiki.search` into the wiki MCP instead. Could keep as-is or split out. |
| `office-town-publish` | ❌ missing as MCP | v1 was merged with files into "share" | HTTP API at `/api/publish/*` works but no MCP for agents to publish pages. |
| `office-town-voice` | ❌ not built | v1.1 | Voice MCP — WebRTC + Nova-3/Aura-2. Correctly deferred. |
| `office-town-sandbox` | ❌ not built | v1.1 | Containers MCP for code execution. Correctly deferred. |
| `office-town-devops` | ❌ removed (was built, dropped today) | v1.1 | Officially superseded by Cloudflare's own MCPs (`github.com/cloudflare/mcp`). |

## What's documented but missing from INSTALL.md

The plan called for users to install **other extensions alongside ours**.
Today INSTALL.md doesn't mention any of these:

| Missing from INSTALL | What it is | Where it should be in the flow |
|---|---|---|
| **Goose's built-in extensions** to enable | Memory, Top of Mind, Chat Recall, Skills, Developer, Summon, Apps, Todo, Knowledge Graph | Step 4 of INSTALL.md — config.yaml edit should also confirm/enable the right Goose defaults |
| **Cloudflare's official MCPs** | `github.com/cloudflare/mcp` — provides DNS, R2, D1, KV, Workers Builds, Observability MCPs | Should be installable via `goose mcp add` from INSTALL.md |
| **Gmail / IMAP MCP** | For the librarian to read inbound email | Step "if you want email-reading capability" optional add |
| **Playwright MCP plugin** | For agent browser automation (per Goose's plugin pattern) | Step "if you want browser automation" — better than our `office-town-browser` for most cases |
| **A CRM MCP of choice** | HubSpot, Pipedrive, Twenty — pick one per deployment | Optional add for businesses with a CRM |
| **mediabox or similar** | Any-file → markdown extractor for the librarian | Currently partially covered by our `files.convert` (which uses Workers AI), but the original plan referenced "mediabox-shaped" external MCP |

## What we built into the desktop app

**Nothing extra.** Reviewing the parked `office-town-desktop` plans:

> Custom Distribution build of Goose with:
>   - App rebranded (icon, name, accent colour)
>   - Our MCPs bundled via `init-config.yaml`
>   - Default recipes pre-loaded
>   - Default provider/model config
>   - Default system prompt extension
>   - Built via `goose build --custom-distribution`
>   - Code-signed + notarised .app

The desktop app would have shipped the **same** MCP wirings we now write
into the user's `config.yaml` via the INSTALL.md prompt. Same recipes
(from `office-town-plugin/commands/`). Same providers. Just a pre-baked
config instead of one written by an agent. So nothing was "lost" when
the distro was parked.

## The actual gap, named directly

Reading Jez's question — *"wheres the extensions that need to get
installed for all the cloudflare capability and the memory functions
and all of that, we arent supposd to be relying on mcp"* — the literal
answer is:

1. INSTALL.md only mentions installing **our** MCPs (wiki, files, browser,
   email). It does NOT tell the user to install:
   - Cloudflare's official MCPs (for managing CF resources)
   - Goose's built-in Memory extension (for per-role preferences)
   - Goose's Knowledge Graph (for multi-hop reasoning)
   - Gmail/IMAP MCP (for librarian email-reading)
   - Playwright MCP plugin (for browser automation)
2. We have wiki.search but not `wiki.list` (list-all-in-collection),
   `wiki.recent` (last-N-days), or `wiki.find_by_frontmatter` (filter
   by kind/tag/status). The librarian/boss can't browse the wiki, only
   search it.
3. We built browser and email MCPs that compete with established external
   options instead of leaning on them. Maintenance debt we don't need.

## Options for fixing this

### Option A — drop the over-built MCPs, document the integration map

Smallest scope. Drop `/mcp/browser` and `/mcp/email` from the worker
(reduces our maintenance footprint, defers to Goose's Playwright +
Gmail MCPs + Cloudflare's official MCPs). Add wiki listing tools.
Rewrite INSTALL.md to document the full extension surface (ours +
Goose built-ins + external).

**Effort**: ~2 hours. **Result**: matches the original design intent.

### Option B — keep the over-built MCPs, add the missing ones

Add cron MCP, search MCP, fold publish back into files-as-share MCP,
add Goose-extensions-to-enable section to INSTALL.md.

**Effort**: ~5 hours. **Result**: more code we own, less reliance on
external ecosystem, faster initial setup for users.

### Option C — minimum-viable worker, lean on ecosystem

Keep only the wiki MCP on our worker. Drop files/browser/email MCPs
entirely (their capabilities exist elsewhere or via direct binding
access for the dashboard). HTTP API stays for the dashboard.
INSTALL.md becomes a list of external extensions to wire.

**Effort**: ~1.5 hours. **Result**: tightest scope, biggest reliance
on ecosystem maturing. Trades feature breadth for maintenance simplicity.

## Wiki MCP — actual gaps against MEMORY-COMPARISON.md promises

The wiki IS the memory layer. So everything MEMORY-COMPARISON.md said
the wiki provides is what we must ship for v1.0 to actually deliver
the pivot's premise:

| Promised in MEMORY-COMPARISON.md | Shipped today | Gap |
|---|---|---|
| 1 gateway `wiki` tool with **8 actions** | 7 separate tools (wiki.create / read / update / delete / search / list_collections / register_collection) | **structural** — gateway-vs-separate-tools mismatch; missing 1 action |
| Triage shapes on search | ✓ wiki.search returns triage shapes | none |
| Synthesis on recall via MCP Sampling | ✗ not built | `wiki.search` needs `synthesize: true` mode |
| Stable UUID + slug returned on write | partial (slug yes; UUID unclear) | check + add |
| YAML frontmatter + markdown body | ✓ | none |
| FTS5 + Vectorize hybrid + RRF | ✓ | none |
| `wiki_audit` table with who/when/what/prev_hash/new_hash/why | ✗ not in schema | **add table + populate on every write** |
| Supersession (atomic old → new in D1) | ✗ — current updates are PATCH | **add wiki.supersede** |
| **Browse-without-search** (`wiki.list`, `wiki.recent`, find-by-frontmatter) | ✗ not exposed | **the librarian needs this** |
| Per-session awareness (`session_id` + `agent_slug` per audit row) | ✗ | depends on audit being added |
| Sizes designed for 10,000+ entries | infrastructure yes; tooling for browsing at scale no | listing tools fix this |

## Recommendation (replacing the earlier A/B/C)

**Path A** — fill the wiki gaps to actually deliver the
MEMORY-COMPARISON.md promises + drop over-built MCPs.

Work:

1. **Wiki listing tools** (the immediate "can't browse" pain):
   - `wiki.list({collection, limit, cursor, filter?: {frontmatter?}})`
   - `wiki.recent({collection?, since_days, limit})`
   - `wiki.find_by_frontmatter({collection, where: {kind: "contact", status: "open"}})`
2. **Audit + supersession** (the durability promise):
   - Drizzle migration: `wiki_audit` table
   - `wiki.update` populates audit row with `why` (required arg)
   - `wiki.supersede({collection, slug, new_body, new_frontmatter, why})` — atomic
   - All deletes write an audit row before removing
3. **Synthesis** (the recall-quality promise):
   - `wiki.search({...args, synthesize: true})` — uses MCP Sampling
     to summarise top hits into a single coherent answer
4. **Drop over-built MCPs**:
   - Remove `/mcp/browser` (was v1.1 per EXTENSIONS-CATALOGUE.md; Playwright
     plugin + Cloudflare's official browser MCP cover this)
   - Remove `/mcp/email` outbound MCP (was v1.1; users wire send via
     direct HTTP or wait for v1.1 to expose properly)
   - Keep the `email()` inbound handler (binding-based, ties to wiki)
5. **Rewrite INSTALL.md** to document the full extension surface a
   user wires alongside ours — for v1, that's:
   - Our wiki MCP from the worker (mandatory)
   - Our files MCP from the worker (optional, for convert+transform)
   - Goose's built-in Top of Mind (default-enabled, leave it)
   - DISABLE Goose's built-in `memory` (we already say this; keep it
     and explain why — wiki replaces)
   - Cloudflare's official MCPs from `github.com/cloudflare/mcp` —
     installed via `goose mcp add` for ops on the user's CF account

Effort: ~4-5 hours. Result: the wiki actually delivers what the
pivot decision promised.

**Path B** — minimal patch: just the listing tools, defer audit /
supersession / synthesis to v1.1.

Work: items 1 + 4 + 5 above (skip 2 and 3).

Effort: ~2 hours. Result: librarian can browse, but the durability
+ synthesis promises remain v1.1.

## Decision needed

Pick A or B. Or push back if I'm misreading MEMORY-COMPARISON.md.
