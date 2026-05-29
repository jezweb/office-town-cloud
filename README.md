# Office Town Cloud

The Cloudflare Workers backend for [Office Town](https://github.com/jezweb/office-town) — capabilities you add to your [Goose](https://block.github.io/goose/) installation. A single Worker hosts the substrate (wiki + files + publish + dashboard + cron + inbound email) alongside **6 MCP gateway tools** (wiki, files, email, cron, voice, sandbox) that give agents every kind of file/input/output a knowledge worker needs.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud)

Cloudflare provisions everything from `wrangler.jsonc`:

- **D1** — wiki index, FTS5 search, audit log, cron jobs
- **R2** (substrate bucket) — markdown entries + binary attachments + published pages + signed shares (Goanna-style entity-as-folder layout)
- **Vectorize** — 768-dim semantic search (bge-base-en-v1.5)
- **Queue** — embedding pipeline
- **Workers AI** — bge embeddings + toMarkdown for PDF/DOCX/audio/images
- **Images** — resize / format-convert / strip-EXIF
- **Email Routing** — outbound `send_email` binding + inbound `email()` handler (writes inbound to wiki/research/)

**Two fields the deploy form asks for** — fill these in:

| Field | Value |
|---|---|
| Vectorize **Dimensions** | `768` |
| Vectorize **Metric** | `cosine` |

(These match Workers AI's `bge-base-en-v1.5` embedding model. Cloudflare's deploy-button schema doesn't currently allow pre-filling these from `wrangler.jsonc`.)

**Everything else can stay blank** — `MCP_BEARER_TOKEN` auto-generates on first request. Optional fields (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`) are post-deploy opt-ins for dashboard sign-in.

~2 min, returns `https://office-town-<you>.<account>.workers.dev`.

## Wire it into Goose

You need Goose installed: https://block.github.io/goose/.

👉 **The one-line installer** (`<your-worker-url>/connect.sh`) bootstraps the Goose CLI if needed, wires the 6 MCP servers into `~/.config/goose/config.yaml` (Goose has no non-interactive `mcp add`, so we edit the config directly), installs the plugin (roles + skills + the workflows runner), sets up `officetowd` with a stable device id + persistent background sync, verifies all 6 tools respond, and opens your cortex folder. ~5 min after the button. The dashboard's **Connect** page gives you the pre-filled command.

### Optional — wire local file sync

Want the wiki + binary attachments on your laptop, editable in Obsidian/VSCode/Finder?

`<your-worker-url>/dashboard/wire-sync` — pick one of: shell one-liner, homebrew, or agent prompt. Installs [officetowd](https://github.com/jezweb/officetowd) — a small Go daemon that bisyncs your local folder against the worker. Same MCP bearer; no R2 token needed. Goanna-style conflict resolution.

See `.jez/artifacts/unified-write-path-2026-05-28.md` for why all writes flow through the worker (audit, frontmatter repair, indexing).

## The MCP gateway tools — 57 actions across 6 servers

Each MCP server exposes ONE gateway tool with multiple actions (per `~/.claude/rules/mcp-gateway-pattern.md`):

### `wiki` — 22 actions (the team memory layer)

| Reading | Writing |
|---|---|
| `get` / `read` — fetch by collection+slug | `write` — create entry |
| `search` — FTS5 + vector hybrid + optional MCP-Sampling synthesis | `update` — merge frontmatter patch |
| `list` — browse a collection with frontmatter filter | `supersede` — atomic replace with audit |
| `tree` — directory shape of all collections | `archive` — soft delete (filterable out) |
| `recent` — last-modified entries | `delete` — hard delete (audit-logged) |
| `glob` — pattern match like `find -name` | `link` — cross-reference two entries |
| `head` / `head_many` — first-N-lines preview | `register` — add a new collection |
| `history` — audit log for an entry | `attach` / `detach` — non-markdown files on an entity |
| `related` — what links to/from this entry | |
| `collections` — list all collection definitions | |
| `list_attachments` — files on an entity | |

Every mutation requires `why:` per the audit design contract.

### `files` — 10 actions (everything-non-markdown for agents)

| Action | Purpose |
|---|---|
| `upload` / `download` / `list` / `delete` | R2 file ops |
| `share` (mode: temp\|public) / `revoke` | Signed-URL share + public publishing |
| `publish` / `unpublish` | Render markdown → `/p/<slug>` |
| `convert` | Any-doc → markdown via Workers AI `toMarkdown` (PDF, DOCX, XLSX, PPTX, HTML, image-OCR, audio-transcribe) |
| `transform_image` | Resize / crop / format-convert via Cloudflare Images |

### `email` — 2 actions

| Action | Purpose |
|---|---|
| `send` | Outbound via Cloudflare Email Routing (verified destinations) |
| `draft` | Save draft to substrate bucket for human review |

Inbound is auto-filed by the worker's `email()` handler at `wiki/research/`.

## Workflows — the standing jobs your cortex owns

A **Workflow** is the core unit Office Town ships: a standing responsibility the cortex owns. You turn it on once; it fires on a **trigger** (a file landing in inbox/, a schedule, or an inbound **webhook**), does the work end to end with the agent's judgement, and reports back in a one-line receipt — never extra work for you.

Each is plain markdown in the cortex at `workflows/<slug>/workflow.md` (frontmatter = the contract: trigger, owner, trust; body = the goal in plain language), with `log.md` (receipts) and `pending/` (drafts awaiting your OK). Five ship seeded: **filing-cabinet**, **ask-my-cortex**, **meeting-to-actions**, **morning-brief**, **relationship-keeper**.

- **Trust tiers** — `auto` (file/organise silently), `review` (drafts to `pending/`, you approve — anything outward/lossy), `ask`. Nothing irreversible without a yes.
- **Two runtimes** — *local* (the Goose agent, with all your connectors, when your machine is up) and a *cloud bridge*: an inbound webhook (`POST /api/triggers/:id`, per-source secret) enqueues a **job** for a device; the `officetowd` daemon polls, claims it, and runs the workflow locally via headless Goose. So a Stripe payment or a form submit can fire a workflow.
- **Devices** — each connected machine has an identity (`devices` table); timezone/region come free from the connection (`request.cf`), so the daemon stays a minimal courier. `/dashboard/workflows` shows every workflow + connected devices with sync freshness.

## Architecture

Single Worker. Single R2 substrate bucket. Designed filesystem-friendly so v1.1's `officetowd` daemon (Go-lang Goanna-style bisync) can mirror it locally.

| Surface | Routes |
|---|---|
| HTTP API (bearer-gated) | `/api/wiki/*`, `/api/files/*`, `/api/publish/*`, `/api/cron/*`, `/api/sync/*`, `/api/workflows/*`, `/api/jobs/*` |
| MCP gateways (JSON-RPC over streamable-HTTP) | `POST /mcp/{wiki,files,email,cron,voice,sandbox}` + `GET /mcp/*/sse` |
| Inbound webhooks (per-source secret, public) | `POST /api/triggers/:id` → enqueues a workflow job |
| Dashboard (HTML) | `/`, `/dashboard/*` (incl. `/dashboard/workflows`) |
| Public reader | `/p/<slug>`, `/s/<token>` |
| Health | `/health` |
| Cron + queue consumer + inbound email | exported handlers alongside `fetch` |

## Cost

Typical SMB volume: **~$2-5/month**. Variables: Vectorize ($0.04 per 1M dims queried), Workers AI embeddings ($0.011 per 1M tokens), Queue ($0.40 per 1M messages), Cloudflare Images (free up to 100k transformations/month), Email Routing (free up to 100 outbound/day). Workers + D1 + R2 inside free tier at this scale.

## Documentation

Master plan + reference knowledge live in `.jez/artifacts/`:

| File | Purpose |
|---|---|
| `MASTER-PLAN-2026-05-28.md` | Authoritative current plan — read this first |
| `officetowd-spec-2026-05-28.md` | v1.1 sync daemon spec |
| `goose-knowledge-{01..05}.md` | ~5000 lines of Goose primitives reference |
| `cloudflare-knowledge-{01..03}.md` | ~5000 lines of Cloudflare primitives reference |
| `conversation-audit-2026-05-28.md` | Full design decision history |
| `single-worker-collapse-{plan,build-spec}-2026-05-27.md` | Refactor that got us here |

Older docs (`ARCHITECTURE.md`, `EXTENSIONS-CATALOGUE.md`, `BUILD-SPEC.md`, `SHIP-PLAN.md`) are superseded — kept for history.



## v1.1 plan + new MCPs

See `.jez/artifacts/V1.1-PLAN-2026-05-28.md` for the full v1.1 build plan.

Already shipped in v1.1 (Phase 1 + 3):
- Browser rendering restored (as `files(action:fetch_with_js)` + `files(action:screenshot)`)
- MCP Sampling synthesis on `wiki(action:search, synthesize:true)` (via Workers AI direct call; pure-MCP-Sampling in v1.2)
- Cron MCP gateway at `/mcp/cron` (7 actions)
- Voice MCP gateway at `/mcp/voice` (transcribe + synthesize + 40 Aura-2 voices, Realtime placeholder)
- Sandbox MCP gateway at `/mcp/sandbox` (Containers placeholder)
- `office-town-pack-cloudflare` plugin scaffold (bundles Cloudflare's official MCPs)

Pending implementation (scaffolds in place):
- `jezweb/officetowd` Go daemon for local⇄R2 bisync (~1-2 weeks)
- Cloudflare Realtime SFU wiring for voice MCP `call_*` actions
- Cloudflare Containers wiring for sandbox MCP `run` action
- AI Search benchmark spike

## Repos in this family

- [office-town](https://github.com/jezweb/office-town) — methodology + template
- [office-town-plugin](https://github.com/jezweb/office-town-plugin) — Goose plugin (4 role agents + skills + recipes + hooks)
- [office-town-pack-knowledge](https://github.com/jezweb/office-town-pack-knowledge) — concepts pack to seed the wiki
- [office-town-pack-*](https://github.com/jezweb?tab=repositories&q=office-town-pack) — other role packs
- `officetowd` (v1.1, coming) — Go-lang sync daemon for local⇄R2

## Licence

MIT. © 2026 Jezweb Pty Ltd.
