# Office Town Cloud

The Cloudflare Workers backend that powers [Office Town](https://github.com/jezweb/office-town) — capabilities you add to your [Goose](https://block.github.io/goose/) installation. Wiki + files + publish + cron + dashboard, plus MCP servers for browser, devops, and email.

## Get started

You need Goose installed first — https://block.github.io/goose/.

👉 [INSTALL.md](./INSTALL.md) — paste one prompt into any capable AI agent (Goose, Claude Code, Aider, etc.). It checks your toolchain, asks before installing anything missing, deploys this backend to your Cloudflare account, and wires it into Goose. ~20-30 minutes.

Or [SETUP.md](https://github.com/jezweb/office-town/blob/main/SETUP.md) in the template repo for a manual step-by-step.

## What this is

5 Cloudflare Workers + the data plane they need:

| Worker | Purpose | URL pattern |
|---|---|---|
| `office-town-core` | Wiki CRUD + FTS5/Vectorize search + files + publish + cron + dashboard | `app.<yourdomain>` or `*.workers.dev` |
| `office-town-mcp-wiki` | Streamable-HTTP MCP — wiki.create/read/update/search/etc. | `mcp-wiki.<yourdomain>` |
| `office-town-mcp-browser` | Browser Rendering MCP (puppeteer-based fetch/screenshot/extract) | `mcp-browser.<yourdomain>` |
| `office-town-mcp-devops` | Cloudflare API wrapper (zones/workers/DNS/logs — read-only by default) | `mcp-devops.<yourdomain>` |
| `office-town-mcp-email` | Outbound email via SMTP2Go, drafts to FILES bucket | `mcp-email.<yourdomain>` |

Data plane provisioned per deployment:

- **D1**: `office-town-d1` — wiki index, FTS5 virtual table, cron jobs
- **R2**: `office-town-wiki` (markdown source-of-truth), `office-town-files` (uploads + share links + published pages)
- **Vectorize**: `office-town-vec` — 768-dim cosine + metadata indexes on collection/slug/entry_id
- **Queue**: `office-town-index` — embedding pipeline
- **Workers AI**: bge-base-en-v1.5 for embeddings

Live reference deployment (Jez's): https://app.officetown.au

## Cost

Typical SMB volume: ~$2-5/month on Cloudflare.

Variables: Vectorize ($0.04 per 1M dimensions queried), Workers AI embeddings ($0.011 per 1M tokens), Queue ($0.40 per 1M messages). Other services (Workers, D1, R2) usually inside the free tier at this scale.

## Local development

```bash
# Hermit (Node 24 + pnpm 10.30) — required by goose ui workspace
source bin/activate-hermit

# Install
cd ui/desktop-not-yet-a-workspace-here-just-our-packages
pnpm install

# Run wiki MCP locally
pnpm -F @office-town/core dev

# Typecheck everything
pnpm -r typecheck

# Run wiki service unit tests
pnpm -F @office-town/core test
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the deep design — substrate-as-R2 + index-in-D1 + vector-in-Vectorize hybrid, the universal sextet frontmatter, triage-shape search results, etc.

See [BUILD-SPEC.md](./BUILD-SPEC.md) for phased build plan.

See [WIKI-SCHEMA.md](./WIKI-SCHEMA.md) for the 11 default collections.

## Repos in this family

- [office-town](https://github.com/jezweb/office-town) — methodology + template
- [office-town-plugin](https://github.com/jezweb/office-town-plugin) — Goose plugin (roles + skills + recipes + hooks)
- [office-town-pack-*](https://github.com/jezweb?tab=repositories&q=office-town-pack) — 8 role packs

## Licence

MIT. © 2026 Jezweb Pty Ltd.
