# Office Town Cloud

Cloudflare-backed backend for the [Office Town](https://github.com/jezweb/office-town) AI agent fleet. Deploys to your own Cloudflare account; serves a set of MCP extensions to Goose; runs the wiki, kanban, search, voice, email, browser, and other agent capabilities.

**Status:** v0.1 — architecture spec phase. Code is being designed; not yet implemented.

## What this is

Office Town (the template) is markdown files + role definitions. That works on its own, but the team-knowledge layer is shallow without a backend. Office Town Cloud provides the cloud half:

- **Wiki extension** — entity-as-folder collections (orgs/contacts/knowledge/decisions/projects/team) with FTS + vector search, exposed as MCP tools
- **Kanban view** — tasks across the town rendered as a board (HTML dashboard + markdown export)
- **Voice extension** — "phone the librarian" via Cloudflare Realtime + Workers AI Nova-3/Aura-2
- **Browser extension** — agents drive web pages via Browser Rendering + Stagehand
- **Email extension** — each role gets a real email address; inbound becomes tool calls
- **Search extension** — semantic + FTS search across the wiki
- **Sandbox extension** — Containers-backed code execution
- **Files / publish extensions** — R2-backed storage with signed share URLs and permanent publish URLs
- **Cron / devops extensions** — recurring tasks, deployment management

## Who this is for

- **Office Town template users** who want the full backend
- **Small businesses** deploying an AI agent fleet — one-click install to their own Cloudflare account
- **Developers** wanting Cloudflare-backed Goose extensions as reference architecture

## Quick start

> Not yet implemented — see `BUILD-SPEC.md` for the build plan.

When ready:

1. Click "Deploy to Cloudflare" — clones this repo into your account, sets up R2/D1/Vectorize bindings
2. Configure secrets (LLM provider API key, comms channels)
3. Goose desktop points at your deployed MCP endpoints
4. Done — your town has memory, search, voice, browser, email

## Architecture at a glance

```
User's machine                    User's Cloudflare account
─────────────────                 ─────────────────────────
Goose Desktop/CLI    ──MCP──→     Substrate Worker
+ office-town                       - Wiki / kanban / search
plugin (roles)                      - R2 + D1 + Vectorize
                                  
                     ──MCP──→     Tools Worker
                                    - Voice / browser / email
                                    - Sandbox / publish

                     ──HTTP──→    Web Dashboard
                                    - Town map
                                    - Kanban board
                                    - Search UI
```

Two workers, plus the web dashboard. Single repo, pnpm workspace. Deployed to user's Cloudflare account; one-time setup.

## Documents

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system architecture, primitive decisions, data flow
- **[BUILD-SPEC.md](BUILD-SPEC.md)** — phased build plan with effort estimates
- **[EXTENSIONS-CATALOGUE.md](EXTENSIONS-CATALOGUE.md)** — every planned MCP extension, in priority order
- **[WIKI-SCHEMA.md](WIKI-SCHEMA.md)** — the v1 wiki collections and conventions
- **[docs/](docs/)** — deeper references (memory architecture, voice agent stack, etc.)

## Repo layout

```
office-town-cloud/
├── README.md                 ← this file
├── ARCHITECTURE.md           ← system architecture
├── BUILD-SPEC.md             ← phased build plan
├── EXTENSIONS-CATALOGUE.md   ← all planned extensions
├── WIKI-SCHEMA.md            ← wiki collections + conventions
├── LICENSE                   ← MIT
├── package.json              ← root package (workspace orchestration)
├── pnpm-workspace.yaml
├── packages/
│   ├── shared/               ← shared types, schemas, utilities
│   ├── core/                 ← substrate Worker (wiki, kanban, search, dashboard)
│   ├── tools/                ← tools Worker (email, files, publish, devops)
│   ├── mcp-wiki/             ← MCP server adapter for wiki tools
│   ├── mcp-files/            ← (per extension)
│   ├── mcp-publish/
│   ├── mcp-voice/
│   ├── mcp-browser/
│   ├── mcp-email/
│   ├── mcp-search/
│   ├── mcp-cron/
│   ├── mcp-sandbox/
│   └── mcp-devops/
├── docs/                     ← deeper reference docs
├── scripts/                  ← deploy-all.sh, seed-substrate.sh, verify.sh
└── .github/workflows/        ← CI for tests + deploys
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Jezweb Pty Ltd.

## Related

- **Office Town template** (the markdown side): https://github.com/jezweb/office-town
- **Goose** (the runtime): https://github.com/block/goose
- **Canonical methodology doc**: `~/Documents/.jez/knowledge/office-town.md`
- **Cloudflare AI Search** (potential migration target for memory): https://blog.cloudflare.com/ai-search-agent-primitive/
