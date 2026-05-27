# Office Town Cloud

The Cloudflare Workers backend for [Office Town](https://github.com/jezweb/office-town) — capabilities you add to your [Goose](https://block.github.io/goose/) installation. A single Worker hosts the wiki + files + publish + cron + dashboard alongside five MCP servers (wiki, files, browser, devops, email) plus an inbound email handler.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud)

Click the button. Cloudflare provisions everything in your account from `wrangler.jsonc`:

- **D1** (`office-town-d1`) — wiki index + FTS5 virtual table + cron jobs
- **R2** (`office-town-wiki`, `office-town-files`) — markdown source-of-truth + uploads + share links + published pages
- **Vectorize** (`office-town-vec`) — 768-dim cosine
- **Queue** (`office-town-index`) — embedding pipeline
- **Workers AI** (bge-base-en-v1.5 for embeddings + `toMarkdown` for PDF/DOCX/audio conversion)
- **Browser Rendering** (for the browser MCP)
- **Images** (resize / format-convert for the files MCP)
- **Email Routing** (outbound `send_email` binding + inbound `email()` handler — no API key needed)

The deploy UI prompts you for `MCP_BEARER_TOKEN` (generate via `openssl rand -hex 32`) and a couple of optional provider keys (`SMTP2GO_API_KEY` for email send, `CF_API_TOKEN` for devops). ~2 minutes end-to-end. Cloudflare hands you a URL like `https://office-town-<you>.<account>.workers.dev`.

## Wire it into Goose

You need Goose installed: https://block.github.io/goose/.

👉 **[Open INSTALL.md](./INSTALL.md)** — paste one prompt into any capable AI agent (Goose itself, Claude Code, Aider). It installs the Goose plugin + knowledge pack, edits your `~/.config/goose/config.yaml` to wire all five MCP servers to the URL you got from the button, clones the town template to your folder, runs a smoke test. ~5 minutes after the button finishes.

Goose sees five MCP servers, each at a different path on the same base URL:

| Server | URL path | Tools |
|---|---|---|
| `office-town-wiki` | `/mcp/wiki` | wiki.create / read / update / delete / search / list_collections / register_collection |
| `office-town-files` | `/mcp/files` | files.convert (any-doc → markdown via Workers AI), files.transform_image (resize/format via Cloudflare Images) |
| `office-town-browser` | `/mcp/browser` | browser.fetch / screenshot / extract |
| `office-town-devops` | `/mcp/devops` | devops.list_zones / list_workers / worker_logs / dns_records / account_summary |
| `office-town-email` | `/mcp/email` | email.send (Cloudflare Email Routing → SMTP2Go fallback), email.draft |

## What runs on the Worker

| Surface | Routes |
|---|---|
| HTTP API (bearer-gated) | `POST/GET/PATCH/DELETE /api/wiki/*`, `/api/files/*`, `/api/publish/*`, `/api/cron/*` |
| MCP servers (streamable-HTTP JSON-RPC) | `POST /mcp/{wiki,browser,devops,email}` + `GET /mcp/*/sse` |
| Dashboard (HTML) | `/`, `/dashboard/*` |
| Public publish reader | `/p/<slug>`, `/s/<token>` |
| Health | `/health` |
| Cron + queue consumer | exported alongside `fetch` |

## Cost

Typical SMB volume: **~$2-5/month** on Cloudflare. Variables: Vectorize ($0.04 per 1M dimensions queried), Workers AI embeddings ($0.011 per 1M tokens), Queue ($0.40 per 1M messages). Workers + D1 + R2 usually inside the free tier at this scale.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in MCP_BEARER_TOKEN at minimum
pnpm dev
```

`wrangler dev` against the deployed bindings. For type checking: `pnpm typecheck`. For tests: `pnpm test`.

## Architecture

- [ARCHITECTURE.md](./ARCHITECTURE.md) — substrate-as-R2 + index-in-D1 + vector-in-Vectorize, universal sextet frontmatter, triage-shape search results
- [BUILD-SPEC.md](./BUILD-SPEC.md) — phased build plan
- [WIKI-SCHEMA.md](./WIKI-SCHEMA.md) — the 11 default collections

## Repos in this family

- [office-town](https://github.com/jezweb/office-town) — methodology + template
- [office-town-plugin](https://github.com/jezweb/office-town-plugin) — Goose plugin (roles + skills + recipes + hooks)
- [office-town-pack-*](https://github.com/jezweb?tab=repositories&q=office-town-pack) — 8 role packs

## Licence

MIT. © 2026 Jezweb Pty Ltd.
