# Architecture

This document describes the system architecture, the primitive decisions, and the data flow. It's the contract that subsequent build phases execute against.

## Goals

1. **Single-tenant per deployment.** Each install is one town belonging to one user / team. No multi-tenant complexity in v1.
2. **One-click "Deploy to Cloudflare"**. User clicks a button, follows the wizard, has a deployed town.
3. **Markdown files as source of truth.** Indexes are derived; if the index dies, the files are unchanged.
4. **Composable extensions.** Each MCP is a focused tool surface; Office Town deployments enable what they need.
5. **Cloudflare-native.** All primitives are Cloudflare's; no external dependencies (except LLM providers).
6. **Cost-effective.** Target: ~$15/month per typical deployment (10 agents, 10k memory records, 1k queries/day).

## High-level shape

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User's machine                                  │
│                                                                          │
│   Goose Desktop / CLI                                                    │
│   + office-town plugin (roles, skills, hooks, recipes)                   │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ MCP (streamable-HTTP, OAuth 2.1)
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       User's Cloudflare account                          │
│  (deployed via "Deploy to Cloudflare" button — single-tenant)            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Substrate Worker                                                  │   │
│  │  ────────────────                                                  │   │
│  │  • Wiki CRUD + FTS5 + Vectorize search                            │   │
│  │  • Kanban view (HTML + markdown export)                            │   │
│  │  • Town map dashboard                                              │   │
│  │  • Agent registry                                                  │   │
│  │  • Activity log                                                    │   │
│  │  Bindings: R2 (markdown), D1 (index), Vectorize (embeddings),     │   │
│  │            Workers AI (embeddings + extraction), Workflows         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Tools Worker                                                      │   │
│  │  ─────────────                                                     │   │
│  │  • Email (inbound + outbound)                                      │   │
│  │  • Files (R2 upload + signed URLs)                                 │   │
│  │  • Publish (markdown → public web page)                            │   │
│  │  • Devops (Cloudflare API wrapper)                                 │   │
│  │  Bindings: R2 (files), Email Routing, Workers AI                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MCP Adapters (one per extension)                                  │   │
│  │  ───────────────────────────────                                   │   │
│  │  Thin Workers exposing the workers above as streamable-HTTP MCP    │   │
│  │  servers. Each handles MCP protocol; logic lives in the workers.   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Specialised Workers (deploy if used)                              │   │
│  │  Voice (Realtime + Aura-2 + Nova-3), Browser (Browser Rendering),  │   │
│  │  Sandbox (Containers), Cron (Scheduled Workers)                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Primitive decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Repo shape** | One repo, multiple workers (pnpm workspace) | Single clone/install/deploy; clean factoring; shared types |
| **Source of truth** | Markdown files in R2 with YAML frontmatter | Portable, transparent, tool-neutral; matches goanna premise |
| **FTS engine** | D1 with FTS5 + BM25 | Mature; free tier covers typical deployment; cheap |
| **Vector store** | Vectorize V2 with metadata namespaces | Cheap; built-in metadata filtering; 10M vectors/index ceiling |
| **Embedding model** | `@cf/baai/bge-large-en-v1.5` (1024d) | $0.20/M tokens; price/quality sweet spot |
| **Ingest LLM** | `@cf/openai/gpt-oss-20b` | Bake-off winner; tool-calling native; cheap; fast |
| **Reindex trigger** | R2 events → Queue → Workflow | Durable, free retries, decoupled |
| **Tenant isolation** | Single-tenant per deployment | No multi-tenancy in v1 |
| **MCP transport** | streamable-HTTP | Current MCP standard; SSE is legacy |
| **Auth (Goose → MCP)** | OAuth 2.1 with PKCE + bearer fallback | MCP spec direction; Goose supports both |
| **Web dashboard auth** | better-auth + Google OAuth + allowlist | Inherited from vite-flare-starter patterns |
| **Module structure** | `server/modules/<name>/{routes,db/schema}.ts` | Inherited from vite-flare-starter; proven |
| **Lint/format** | Biome | Faster than ESLint+Prettier |
| **Memory type model** | Typed registry (declared, not enum) | Cloudflare's 4-fixed-enum is a SDK compromise; we offer extensibility |
| **Memory categorisation when type omitted** | Workers AI classifier (`gpt-oss-20b`) | Cheap, fast, frees agent from explicit typing |
| **Agent runtime** | Goose (we don't build one) | Goose has 30+ providers, scheduler, sub-agents, recipes — vastly superior to anything we'd build |
| **Goose's built-in memory** | Use it; don't replace | Per-role preferences; pairs with our wiki extension |
| **Wiki extension contributes** | Team knowledge layer | Distinct from Goose's per-role memory |

## Data flow — recall (search)

```
1. Agent calls wiki.recall("how do we deploy?") via MCP
2. MCP adapter forwards to Substrate Worker
3. Worker fans out IN PARALLEL:
   a. Embed query (Workers AI bge-large)
   b. D1 FTS5 query (top 20 by BM25)
   c. Vectorize.query (top 20 by cosine, filtered by tenant namespace + metadata)
4. Worker fuses results via Reciprocal Rank Fusion (k=60)
5. Worker fetches top 10 markdown bodies from R2
6. Optional synthesis: pass top 5 to gpt-oss-20b for a synthesised answer
7. Return to agent with sources cited
```

## Data flow — remember (write)

```
1. Agent calls wiki.remember(category, content, ...) via MCP
2. If category omitted → classify via Workers AI (gpt-oss-20b)
3. Validate category against registered types
4. Write markdown file to R2: `{tenant}/{category}/{slug}.md`
5. R2 event → Queue → Workflow
6. Workflow:
   a. Read R2 object
   b. Parse frontmatter
   c. Chunk body (~400 tokens, 50 overlap)
   d. Embed each chunk (bge-large)
   e. Upsert vectors into Vectorize (metadata: tenant, category, slug, status, ts)
   f. Upsert FTS5 row in D1
7. Activity log entry
```

## Storage layout

### R2 (source of truth)

```
{tenant}/
  wiki/
    contacts/<slug>/contact.md
    orgs/<slug>/entity.md
    knowledge/<topic>/concept.md
    decisions/<slug>/decision.md
    projects/<slug>/project.md
    ...
  memory/
    {agent}/facts/<slug>.md
    {agent}/events/<YYYY-MM-DD>-<topic>.md
    ...
  files/
    {hash-prefix}/{hash}.{ext}      ← content-addressed file storage
  publish/
    {slug}/index.html               ← published pages
```

### D1 (index)

```sql
CREATE TABLE wiki_entries (
  id TEXT PRIMARY KEY,        -- {collection}:{slug}
  tenant_id TEXT,
  collection TEXT,
  slug TEXT,
  frontmatter JSON,
  body_excerpt TEXT,
  updated_at TEXT,
  ...
);

CREATE VIRTUAL TABLE wiki_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tags,
  tokenize='porter'
);

CREATE TABLE memory_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  agent_id TEXT,
  type TEXT,                   -- facts | events | instructions | tasks | custom
  content TEXT,
  metadata JSON,
  status TEXT,
  created_at TEXT,
  ...
);

CREATE TABLE memory_types (
  name TEXT PRIMARY KEY,
  lifecycle TEXT,              -- persistent | append-only | ephemeral | bridge | queue
  indexed JSON,
  description TEXT,
  ...
);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,
  actor TEXT,
  action TEXT,
  resource TEXT,
  metadata JSON
);
```

### Vectorize (semantic search)

```
Index: officetown
Dimensions: 1024 (bge-large)
Metadata indexes:
  - tenant_id (string)
  - collection (string) | type (string)
  - status (string)
  - created_at (number)

Namespaces: per-tenant (string)
```

## Authentication

### Web dashboard

- **better-auth** with Google OAuth
- Allowlist via env vars (`ALLOWED_AUTH_EMAILS`, `ALLOWED_AUTH_DOMAINS`)
- Session cookies with 5-min refresh cache
- `skipStateCookieCheck: true` (required on Workers)
- IP capture via `cf-connecting-ip`
- Role enum: user | manager | admin
- Auto-create personal org via `databaseHooks.user.create.after`

### MCP endpoints (Goose → our workers)

- **OAuth 2.1 with PKCE** for browser-mediated flows
- **Bearer token** for service accounts (recommended for fixed deployments where Goose is itself a trusted client)
- Per-deployment client secret in Cloudflare secrets

## Deployment story

```bash
# User clicks "Deploy to Cloudflare" button →
# Cloudflare clones repo into user's account, prompts:
#  - workers.dev subdomain or custom domain?
#  - LLM provider API key?
#  - Comms channel (iMessage / Slack / email) for the post-office?

# Deployment runs:
pnpm install
pnpm deploy   # deploys all workers + MCP adapters

# User goes to:
https://office-town.<their-subdomain>.workers.dev
# Logs in via Google
# Their town is alive
```

For the user's Goose desktop:

```bash
# In Goose Settings → Extensions → Add streamable-http MCP
# URL: https://office-town.<their-subdomain>.workers.dev/api/mcp/wiki
# Auth: paste bearer token from deploy output
# Repeat for each enabled MCP (kanban, search, files, voice, etc.)

# Or distribute a Goose config preset that wires them all
```

## Multi-machine setup (optional)

If the user runs Goose on multiple machines:
- Each Goose desktop points at the same deployed workers
- MCP calls work identically from any machine
- Session storage is per-Goose-installation (use Goose's external-server toggle to centralise if needed)
- Optional: `goannad`-style daemon for local file mirror of the wiki (separate optional install)

## Cost model (typical deployment)

| Service | Monthly usage | Cost |
|---|---|---|
| R2 storage | <100 MB | $0 (free tier) |
| D1 storage + ops | <500 MB, ~50k queries | $0 (free tier) |
| Vectorize | 20-50M stored dims | ~$0.01-0.02 |
| Workers AI embeddings | ~6M tokens/month | ~$1.20 |
| Workers AI gpt-oss-20b (ingest extraction) | ~45M tokens/month | ~$10.50 |
| Worker requests | <100k/month | $0 (free tier) |
| Workflows | <10k invocations | $0 (free tier) |
| **Total** | | **~$12-15/month** |

Ingest extraction is the cost driver. If a deployment uses rule-based parsing instead of LLM extraction, total drops to ~$2/month.

## Open questions (deferred)

1. **AI Search vs DIY** — Cloudflare AI Search (announced April 2026, free in beta) does most of what our memory MCP does. Plan: ship DIY first behind an MCP abstraction, evaluate AI Search at 90 days, swap if it wins on quality + cost.
2. **Per-deployment data sync across machines** — single-tenant assumed v1. Multi-machine via goannad-style daemon is optional.
3. **Custom Distribution** (white-labelled Goose .app) — supported by Goose; defer until product matures.

## What we deliberately don't build

- Our own agent runtime — Goose handles this; we add capabilities not orchestration
- Multi-tenancy — single tenant per deployment; users have their own Cloudflare accounts
- Per-role memory MCP (Cloudflare-style 4-category) — use Goose's built-in Memory; we add the wiki layer
- A custom auth provider — better-auth + Google OAuth
- A bespoke UI framework — Goose's MCP Apps spec for in-chat UI; standard React + shadcn for the web dashboard
