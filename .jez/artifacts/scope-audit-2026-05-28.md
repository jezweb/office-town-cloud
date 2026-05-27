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

From `office-town.md` (last revised 2026-05-26 v1.1):

> **Memory architecture: use Goose built-ins; Office Town adds the wiki**
>
> | Layer | Existing extension | Purpose |
> |---|---|---|
> | Per-role preferences | **Memory** (built-in) | Save preferences and patterns |
> | Per-turn guardrails | **Top of Mind / MOIM** (built-in) | Injected every turn |
> | Relational reasoning | **Knowledge Graph** (npm package) | Multi-hop queries |
> | Cross-session FTS | **Chat Recall** (built-in) | What did we talk about last week |
> | **Team knowledge curation** | `office-town-wiki` (we build) | Shared wiki |
>
> The other four layers are **existing Goose primitives we *enable*, not replace.**

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

## My honest recommendation

**Option A** — drop over-built MCPs, add the missing memory tools,
document the integration map. This:

1. Honours the original design intent (use Goose built-ins for memory,
   external MCPs for browser/email, build only the wiki + things we
   genuinely need).
2. Fixes the actual user complaint (can't browse the wiki, no
   guidance on what other extensions to install).
3. Doesn't throw away the genuinely useful pieces (files.convert is
   real value — Workers AI's toMarkdown is genuinely better than asking
   the user to install their own PDF extractor; files.transform_image
   ditto for Cloudflare Images).
4. Cleans up the README to be honest about what comes from where.

The work would be:

1. Remove `/mcp/browser` from the worker (it's a v1.1 thing per the plan;
   users get browser via Playwright plugin or Cloudflare's MCP)
2. Remove `/mcp/email` *outbound* MCP from the worker (Gmail MCP handles
   reading; outbound send-via-Cloudflare can stay as a worker route if
   we want, but doesn't need MCP exposure since the librarian doesn't
   need to send email — that's user-driven)
3. Keep the `email()` inbound handler — that's binding-based and ties
   inbound email into the wiki, which IS our value-add
4. Add `wiki.list`, `wiki.recent`, `wiki.list_recent_changes` to the
   wiki MCP — fills the memory gap
5. Rewrite INSTALL.md step 4 to list ALL the extensions a user should
   wire:
   - Our 1 (or 2) MCPs from the worker
   - Goose built-ins to enable
   - External MCPs to install via `goose mcp add` (Cloudflare's,
     Playwright, optional Gmail)
   - The Knowledge Graph npm package install if reasoning wanted

## Decision needed

Pick A / B / C, or propose a different shape. Then I execute that
without scope creep.
