---
title: Single-Worker Collapse — Build Spec
date: 2026-05-27
status: drafted, awaiting Jez review
companion: single-worker-collapse-plan-2026-05-27.md
---

# Single-Worker Collapse — Build Spec

> Companion plan: `single-worker-collapse-plan-2026-05-27.md` (the why and shape).
> This doc is build-ready. A future session opens it cold and starts construction
> without asking architectural questions.

## Verify before any code starts

These must be true on the executing machine before Phase 1:

- `cd ~/Documents/office-town-cloud && git status` is clean (or only has
  the new `.jez/artifacts/*.md` plan docs untracked)
- `git log --oneline -5` shows recent state in sync with `origin/main`
- The 5 existing workers are deployed and healthy:
  ```bash
  for u in https://office-town-core.{jezweb,webfonts}.workers.dev \
           https://office-town-mcp-wiki.{jezweb,webfonts}.workers.dev \
           ... ; do
    curl -sS "$u/health" 2>&1 | head -1
  done
  ```
  (Adjust per Jez's actual deploy domain.)
- `wrangler whoami` returns the correct account (`jez@jezweb.au` for
  the 2026+ deployments, or `jeremy@jezweb.net` for the personal one)

If any of these fail, stop and resolve before proceeding.

## Naming conventions

| Thing | Convention |
|---|---|
| Worker name | `office-town` (drop the `-core` suffix from the merged worker) |
| Repo | `office-town-cloud` (unchanged) |
| Resource names (D1, R2, Vectorize, queue) | Unchanged — `office-town-d1`, `office-town-wiki`, `office-town-wiki-preview`, `office-town-files`, `office-town-files-preview`, `office-town-vec`, `office-town-index` |
| Bearer auth secret | `MCP_BEARER_TOKEN` (unchanged) |
| Bindings | `DB` (D1), `BUCKET` (wiki R2), `MEDIA` (files R2), `VEC` (Vectorize), `QUEUE` (Queue), `AI` (Workers AI), `BROWSER` (Browser Rendering), `EMAIL` (Email Routing if wired) |

## Files NOT touched (rollback safety)

- `~/Documents/office-town/` — template repo, no changes
- `~/Documents/office-town-plugin/` — Goose plugin, no changes
- `~/Documents/office-town-pack-knowledge/` — concepts pack, no changes
- The D1 database itself (no schema migrations in this refactor)
- The R2 buckets (no data migration)
- The Vectorize index (no re-embedding)

If anything goes wrong, rollback is "revert the commit on
`office-town-cloud` and redeploy the old 5 workers from `git log`."

---

# Phase 1 — Restructure `office-town-cloud/` into a single worker

**Effort:** ~1 hour
**Verification gate before Phase 2:** `pnpm run dev` (or `wrangler dev`)
starts the worker locally, hits `/health` and returns 200, hits
`/mcp/wiki` with a `tools/list` JSON-RPC body and returns the expected
wiki tools list.

## 1.1 — New folder structure

Target layout (everything under `office-town-cloud/`):

```
src/
├── index.ts                 # Hono app, mounts all routes
├── env.ts                   # Env type (shared bindings + secrets)
├── auth.ts                  # MCP_BEARER_TOKEN middleware
├── api/                     # The HTTP API (not MCP)
│   ├── index.ts             # Mounts api routes
│   ├── wiki.ts              # CRUD + search routes
│   ├── files.ts             # File upload/download
│   ├── publish.ts           # Public publish routes
│   └── dashboard.ts         # HTML dashboard renderer
├── mcp/                     # MCP servers (4 of them)
│   ├── _shared.ts           # Streamable-HTTP envelope, session helpers
│   ├── wiki.ts              # /mcp/wiki — wiki tools
│   ├── browser.ts           # /mcp/browser — browser tools
│   ├── devops.ts            # /mcp/devops — Cloudflare devops tools
│   └── email.ts             # /mcp/email — email tools
├── db/                      # Drizzle schema + helpers
│   ├── schema.ts
│   └── client.ts
├── lib/
│   ├── search.ts            # FTS + Vectorize + RRF fusion
│   ├── frontmatter.ts
│   ├── signed-urls.ts
│   └── embeddings.ts
├── queue.ts                 # Queue consumer (index pipeline)
├── cron.ts                  # Scheduled handler
└── workflows/               # Cloudflare Workflows (if any)
    └── index-content.ts
drizzle/                     # D1 migrations (unchanged from packages/core/drizzle/)
public/                      # Static assets for the dashboard
.dev.vars.example            # Template for deploy-UI secrets
wrangler.jsonc               # ALL bindings declared here
package.json                 # Single package, no workspaces
tsconfig.json
README.md                    # Top of file: [Deploy to Cloudflare] button
INSTALL.md                   # Rewritten for new flow
```

## 1.2 — Migration commands (deterministic)

Run these in order at `~/Documents/office-town-cloud/`:

```bash
# Capture today's state
git checkout -b refactor/single-worker-collapse

# Move core's src/* up to top-level src/
mkdir -p src
mv packages/core/src/index.ts src/
mv packages/core/src/auth src/auth.ts || true   # adjust paths
mv packages/core/src/db src/db
mv packages/core/src/cron src/cron.ts
mv packages/core/src/queue src/queue.ts
mv packages/core/src/files src/api/files.ts
mv packages/core/src/publish src/api/publish.ts
mv packages/core/src/dashboard src/api/dashboard.ts
# (these are illustrative — adjust to actual current paths)

# Move D1 drizzle files
mv packages/core/drizzle drizzle
mv packages/core/drizzle.config.ts ./

# Convert each MCP package's src/index.ts into src/mcp/<name>.ts
mkdir -p src/mcp
mv packages/mcp-wiki/src/index.ts src/mcp/wiki.ts
mv packages/mcp-browser/src/index.ts src/mcp/browser.ts
mv packages/mcp-devops/src/index.ts src/mcp/devops.ts
mv packages/mcp-email/src/index.ts src/mcp/email.ts

# Fold packages/shared/src/* into src/lib/
mkdir -p src/lib
mv packages/shared/src/* src/lib/

# Delete obsolete monorepo packages + manifests
rm -rf packages/
rm pnpm-workspace.yaml

# Delete empty placeholder packages (mcp-cron, mcp-files, mcp-publish,
# mcp-sandbox, mcp-search, mcp-voice, tools, mcp-files, mcp-publish)
# — already deleted above by removing packages/
```

After moves, all imports break. Phase 1.3 fixes them.

## 1.3 — Fix imports

Old imports like:
```ts
import { wikiCreate } from "@office-town/shared/wiki"
import { authMiddleware } from "@office-town/core/auth"
```

Become:
```ts
import { wikiCreate } from "../lib/wiki"
import { authMiddleware } from "../auth"
```

Strategy: use `tsc --noEmit` to surface every broken import. Walk
them, fix each. Estimate: 20-30 broken imports across the codebase.

## 1.4 — `src/index.ts` — the new Hono root

```ts
import { Hono } from "hono"
import { cors } from "hono/cors"
import type { Env } from "./env"
import { authMiddleware } from "./auth"
import { apiRoutes } from "./api"
import { wikiMcp } from "./mcp/wiki"
import { browserMcp } from "./mcp/browser"
import { devopsMcp } from "./mcp/devops"
import { emailMcp } from "./mcp/email"
import { dashboardRoutes } from "./api/dashboard"
import { publishRoutes } from "./api/publish"

const app = new Hono<{ Bindings: Env }>()

// CORS for browser clients
app.use("*", cors())

// Health — public, no auth
app.get("/health", (c) =>
  c.json({ status: "ok", version: "1.0", worker: "office-town" }),
)

// Public publish routes (no auth — token in URL for signed shares)
app.route("/p", publishRoutes)
app.route("/s", publishRoutes)

// Dashboard (HTML) — auth handled inline
app.route("/dashboard", dashboardRoutes)

// HTTP API — auth via MCP_BEARER_TOKEN (same secret as MCPs use)
app.use("/api/*", authMiddleware)
app.route("/api", apiRoutes)

// MCP servers — each its own subapp, auth via MCP_BEARER_TOKEN
app.use("/mcp/*", authMiddleware)
app.route("/mcp/wiki", wikiMcp)
app.route("/mcp/browser", browserMcp)
app.route("/mcp/devops", devopsMcp)
app.route("/mcp/email", emailMcp)

// Cron + queue consumer (export at module level)
export default {
  fetch: app.fetch,
  scheduled: (await import("./cron")).default,
  queue: (await import("./queue")).default,
}
```

Note: each MCP module exports a `Hono<{ Bindings: Env }>` instance
so it can be mounted as a sub-app under its path.

## 1.5 — `src/env.ts` — unified Env type

```ts
export interface Env {
  // D1
  DB: D1Database

  // R2
  BUCKET: R2Bucket          // wiki content
  MEDIA: R2Bucket           // file uploads

  // Vectorize
  VEC: VectorizeIndex

  // Queue (producer side; consumer is defined in wrangler.jsonc)
  QUEUE: Queue

  // Cloudflare AI
  AI: Ai

  // Browser Rendering (for the browser MCP)
  BROWSER: Fetcher          // @cloudflare/puppeteer compatible

  // Email Routing (for the email MCP — optional, see Phase 2.4)
  EMAIL: SendEmail

  // Secrets (from .dev.vars locally, dashboard for prod)
  MCP_BEARER_TOKEN: string
  // Add provider keys as the deploy form needs them:
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_API_KEY?: string
}
```

## 1.6 — `src/auth.ts` — bearer token middleware

```ts
import type { MiddlewareHandler } from "hono"
import type { Env } from "./env"

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> =
  async (c, next) => {
    const auth = c.req.header("Authorization") || ""
    const token = auth.replace(/^Bearer\s+/, "")
    if (!token || token !== c.env.MCP_BEARER_TOKEN) {
      return c.json({ error: "Unauthorized" }, 401)
    }
    await next()
  }
```

## 1.7 — Each MCP module: shape

Every `src/mcp/{name}.ts` exports a Hono app that handles the
streamable-HTTP MCP protocol on its own subpath. Pattern from
`src/mcp/_shared.ts`:

```ts
// src/mcp/_shared.ts
import { Hono } from "hono"
import type { Env } from "../env"
import { z } from "zod"

export type McpTool = {
  name: string
  description: string
  inputSchema: z.ZodSchema
  handler: (args: any, env: Env, c: any) => Promise<any>
}

export function createMcpServer(opts: {
  name: string                   // e.g. "office-town-wiki"
  tools: McpTool[]
}): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>()

  // initialize — streamable-HTTP transport handshake
  app.post("/", async (c) => {
    const body = await c.req.json()
    const id = body.id ?? null
    const method = body.method

    // Session ID — scope per MCP path (see Phase 3 for collision fix)
    const sessionId = c.req.header("Mcp-Session-Id") ?? crypto.randomUUID()

    switch (method) {
      case "initialize":
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: opts.name, version: "1.0" },
          },
        }, 200, { "Mcp-Session-Id": sessionId })

      case "tools/list":
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: opts.tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: zodToJsonSchema(t.inputSchema),
            })),
          },
        })

      case "tools/call": {
        const { name, arguments: args } = body.params
        const tool = opts.tools.find((t) => t.name === name)
        if (!tool) return mcpError(id, -32601, `Unknown tool: ${name}`)
        try {
          const parsed = tool.inputSchema.parse(args)
          const result = await tool.handler(parsed, c.env, c)
          return c.json({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: JSON.stringify(result) }] },
          })
        } catch (e) {
          return mcpError(id, -32603, e instanceof Error ? e.message : String(e))
        }
      }

      default:
        return mcpError(id, -32601, `Method not found: ${method}`)
    }
  })

  return app
}

function mcpError(id: any, code: number, message: string) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0", id, error: { code, message }
  }), { status: 200, headers: { "content-type": "application/json" } })
}
```

Each MCP file then defines its tools list and exports the server:

```ts
// src/mcp/wiki.ts
import { z } from "zod"
import { createMcpServer } from "./_shared"
import { wikiCreate, wikiRead, wikiSearch, /* ... */ } from "../lib/wiki"

const tools = [
  {
    name: "wiki.create",
    description: "Create a new wiki entry.",
    inputSchema: z.object({
      collection: z.string(),
      slug: z.string(),
      frontmatter: z.record(z.any()),
      body: z.string(),
    }),
    handler: async (args, env) => wikiCreate(env, args),
  },
  // ... wiki.read, wiki.update, wiki.delete, wiki.search,
  //     wiki.list_collections, wiki.register_collection
]

export const wikiMcp = createMcpServer({ name: "office-town-wiki", tools })
```

Same shape for `browser.ts`, `devops.ts`, `email.ts`.

## 1.8 — Verify Phase 1

```bash
cd ~/Documents/office-town-cloud
pnpm install                       # (or npm; workspace is gone now)
wrangler dev --local               # local with --local flag
# In another terminal:
curl -s http://localhost:8787/health
# → {"status":"ok","version":"1.0","worker":"office-town"}

# MCP probe — pass auth + initialize body
curl -s -X POST http://localhost:8787/mcp/wiki \
  -H "Authorization: Bearer $(grep MCP_BEARER_TOKEN .dev.vars | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq
# → {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26",...}}

curl -s -X POST http://localhost:8787/mcp/wiki \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.result.tools[].name'
# → "wiki.create", "wiki.read", "wiki.update", "wiki.delete",
#   "wiki.search", "wiki.list_collections", "wiki.register_collection"
```

Repeat for `/mcp/browser`, `/mcp/devops`, `/mcp/email`. Each returns
its own tool list, scoped to that MCP.

---

# Phase 2 — Merge `wrangler.jsonc`

**Effort:** ~30 min
**Verification gate:** `wrangler types` runs clean, generated
`worker-configuration.d.ts` includes every binding.

## 2.1 — Target `wrangler.jsonc`

Replace all 5 `wrangler.jsonc` files with one at the repo root:

```jsonc
{
  "$schema": "https://json.schemastore.org/wrangler.json",
  "name": "office-town",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "observability": {
    "enabled": true,
    "logs": { "invocation_logs": true, "head_sampling_rate": 1 }
  },

  "vars": {
    "DEFAULT_TOWN_NAME": "your-town"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "office-town-d1",
      "database_id": "29609657-4b16-47d7-bff2-fb2b41293c13",
      "migrations_dir": "drizzle"
    }
  ],

  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "office-town-wiki",
      "preview_bucket_name": "office-town-wiki-preview"
    },
    {
      "binding": "MEDIA",
      "bucket_name": "office-town-files",
      "preview_bucket_name": "office-town-files-preview"
    }
  ],

  "vectorize": [
    {
      "binding": "VEC",
      "index_name": "office-town-vec"
    }
  ],

  "queues": {
    "producers": [
      { "binding": "QUEUE", "queue": "office-town-index" }
    ],
    "consumers": [
      {
        "queue": "office-town-index",
        "max_batch_size": 10,
        "max_batch_timeout": 5,
        "max_retries": 3,
        "dead_letter_queue": "office-town-index-dlq"
      }
    ]
  },

  "ai": { "binding": "AI" },

  "browser": { "binding": "BROWSER" },

  "send_email": [
    { "name": "EMAIL", "destination_address": "agent@yourbusiness.com" }
  ],

  "triggers": {
    "crons": ["0 */6 * * *"]
  }
}
```

**Note for the existing deploy:** `database_id` MUST be the existing
ID (`29609657-...`). Same for bucket names and `index_name`. The new
worker points at the same data plane.

**Note for fresh deploys via the button:** the button auto-creates
D1/R2/Vectorize/Queue with NEW IDs and patches them into `wrangler.jsonc`
during the deploy flow. So the `database_id` etc. above act as defaults
that get replaced when the button runs. The string `29609657-...` in
the repo is a placeholder; deploy-button users get fresh resources.

## 2.2 — `.dev.vars.example`

```bash
# Secret that gates HTTP API + all 4 MCP servers.
# Generate via: openssl rand -hex 32
MCP_BEARER_TOKEN=

# LLM provider keys (one minimum) used for MCP Sampling fallback
# inside skills. Set only what you have — at least one required.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
DASHSCOPE_API_KEY=
OPENROUTER_API_KEY=
```

When the deploy button runs, Cloudflare's UI reads this file and
prompts the user for each value. Empty defaults force the user to
provide them.

## 2.3 — `package.json` cleanup

```json
{
  "name": "office-town",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "build": "echo 'no build step — wrangler handles bundling'",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply office-town-d1 --local",
    "db:migrate:remote": "wrangler d1 migrations apply office-town-d1 --remote",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "drizzle-orm": "^0.40.0",
    "zod": "^3.24.0",
    "@cloudflare/puppeteer": "^0.0.13"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "@cloudflare/vitest-pool-workers": "^0.5.40",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.99.0"
  }
}
```

(Adjust versions to current latest — check `npm view <pkg> version`
before locking.)

## 2.4 — Optional bindings

- `send_email` (Email Routing): only include if Email Routing is set
  up on the user's domain. If not, the email MCP returns
  "email not configured" errors. Document in INSTALL.md.
- `browser`: requires Browser Rendering enabled on the account.
  Cloudflare's button should prompt the user if needed.

## 2.5 — Verify Phase 2

```bash
wrangler types          # generates worker-configuration.d.ts
tsc --noEmit            # no errors after import fixes from Phase 1
wrangler deploy --dry-run   # validates wrangler.jsonc against API
```

---

# Phase 3 — MCP session scoping per-path

**Effort:** ~30 min
**Verification gate:** open a session against `/mcp/wiki`, then call
`/mcp/browser` with the same `Mcp-Session-Id` — second call gets a
fresh session, not the wiki's.

## 3.1 — The collision risk

Streamable-HTTP MCP sessions are keyed by the `Mcp-Session-Id` header.
If the agent reuses a session ID across paths (some clients do), our
storage would let `/mcp/browser` read state set by `/mcp/wiki`.

## 3.2 — Fix

In `src/mcp/_shared.ts`, include the MCP path in any session storage
key:

```ts
// helper
function sessionKey(mcpName: string, sessionId: string): string {
  return `mcp_session:${mcpName}:${sessionId}`
}

// when storing session state (if we add any — most tools are stateless):
await c.env.KV.put(sessionKey(opts.name, sessionId), JSON.stringify(state))
```

Today our MCP servers are mostly stateless (each `tools/call` is
self-contained). But the fix is preventative — the next MCP that
needs cursor pagination or streaming state will Just Work.

## 3.3 — Verify

Probe with same session ID across two MCPs:
```bash
SID=$(uuidgen)
curl -s -X POST localhost:8787/mcp/wiki \
  -H "Authorization: Bearer $T" -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

curl -s -X POST localhost:8787/mcp/browser \
  -H "Authorization: Bearer $T" -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
# Both succeed independently; neither sees the other's state.
```

---

# Phase 4 — Migrate Jez's existing deployment

**Effort:** ~30 min
**Verification gate:** the single `office-town` worker serves all
endpoints AND the wiki retains every entry it had pre-migration.

## 4.1 — Pre-migration snapshot

```bash
# Snapshot wiki entries count (D1)
wrangler d1 execute office-town-d1 --remote \
  --command "SELECT COUNT(*) AS n FROM wiki_entries;"

# Snapshot R2 keys
wrangler r2 object list office-town-wiki | wc -l
wrangler r2 object list office-town-files | wc -l

# Snapshot Vectorize
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/vectorize/v2/indexes/office-town-vec/info" \
  -H "Authorization: Bearer $TOKEN" | jq '.result.vectorsCount'
```

Save the counts. They must be identical after migration.

## 4.2 — Deploy the new worker

```bash
cd ~/Documents/office-town-cloud
git add -A && git commit -m "feat: collapse to single worker"
wrangler deploy
```

This creates a new `office-town` worker that points at the SAME D1,
R2 buckets, and Vectorize index. **Existing data is untouched** —
the bindings are just being attached to a different JS bundle.

## 4.3 — Verify on the new worker

```bash
NEW_URL=https://office-town.<account>.workers.dev

# Health
curl -s $NEW_URL/health
# → {"status":"ok",...}

# Wiki API still sees the data
curl -s -H "Authorization: Bearer $T" "$NEW_URL/api/wiki/contacts" | jq '.entries | length'
# → same count as pre-migration

# Search the wiki
curl -s -X POST -H "Authorization: Bearer $T" "$NEW_URL/api/wiki/search" \
  -d '{"query":"test"}' | jq '.results | length'
# → > 0 if there was any indexed data

# MCP probe
curl -s -X POST -H "Authorization: Bearer $T" "$NEW_URL/mcp/wiki" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
# → 7 (wiki tools count)
```

## 4.4 — Wire Goose to the new URL

Edit `~/.config/goose/config.yaml`:

```yaml
extensions:
  office-town-wiki:
    type: streamable_http
    url: https://office-town.<account>.workers.dev/mcp/wiki
    headers:
      Authorization: Bearer <MCP_BEARER_TOKEN>
  office-town-browser:
    url: https://office-town.<account>.workers.dev/mcp/browser
    # (same headers shape)
  office-town-devops:
    url: https://office-town.<account>.workers.dev/mcp/devops
  office-town-email:
    url: https://office-town.<account>.workers.dev/mcp/email
```

(Same bearer token, just one base URL with four paths instead of
four separate hostnames.)

Restart Goose.

## 4.5 — End-to-end smoke test

In Goose:

1. `@librarian` "list everything you remember about my biggest client"
   — wiki.search runs, returns triage shapes (frontmatter + excerpt).
2. `@worker` "screenshot google.com" — browser.screenshot runs.
3. `@scout` "check the office-town worker's health" — devops.check
   runs (calls the worker's `/health` endpoint).

If all three work, the migration is good.

## 4.6 — Delete the 5 old workers (only after 4.5 passes)

```bash
for w in office-town-core office-town-mcp-wiki office-town-mcp-browser \
         office-town-mcp-devops office-town-mcp-email; do
  wrangler delete --name $w
done
```

Custom domains on the old workers (if any) get removed automatically.

---

# Phase 5 — Deploy to Cloudflare button + landing page

**Effort:** ~30 min
**Verification gate:** the button URL on the README, when visited
fresh (incognito), renders Cloudflare's deploy UI with the correct
project name and bindings listed.

## 5.1 — Make the repo public + push

Already public (per Jez's earlier flip).

## 5.2 — Add button to README

Top of `office-town-cloud/README.md`:

```markdown
# Office Town Cloud

The Cloudflare backend for [Office Town](https://github.com/jezweb/office-town)
— capabilities you add to your [Goose](https://block.github.io/goose/)
installation.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud)

Click the button → Cloudflare provisions D1, R2, Vectorize, Queue,
Workers AI, Browser Rendering, and Email Routing automatically.
Returns a URL like `https://office-town-<you>.workers.dev`. Wire that
into Goose's config with the `office-town-plugin` and you're running.
```

## 5.3 — Landing page

Update `~/Documents/officetown.au/index.html` hero block:

- Replace the `📋 Copy full prompt` button with a `🚀 Deploy to
  Cloudflare` primary button + a smaller `📋 Copy install prompt`
  secondary button.
- Update the "Get Started" table to 3 rows (down from 2):
  1. Install Goose
  2. Click Deploy to Cloudflare → wait ~2 min
  3. Paste the URL into your AI agent; it walks you through the rest

Deploy via `wrangler deploy` from `~/Documents/officetown.au`.

## 5.4 — Verify

```bash
# Open the button URL in incognito
open "https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud"
```

Confirm the UI shows:
- Project name: `office-town`
- Bindings: D1, R2 (×2), Vectorize, Queue, Workers AI, Browser, Email
- Secrets requested: `MCP_BEARER_TOKEN` + optional provider keys

Don't actually click "Deploy" unless you're prepared to provision
fresh resources on the test account.

---

# Phase 6 — Rewrite INSTALL.md

**Effort:** ~30 min
**Verification gate:** the new prompt is under 100 lines and tests
clean on a fresh agent.

## 6.1 — New prompt shape

Replace the existing single-prompt (currently ~280 lines) with the
new shape:

```
I want to add Office Town capabilities to my Goose installation.

Office Town is a content bundle (Cloudflare Workers backend + Goose
plugin + town template + MCP wirings) that installs INTO an existing
Goose. NOT a Goose replacement.

GROUND RULES:
- Be transparent. Say what you're about to do.
- Ask before destructive ops or any software install.
- If Goose isn't installed: stop, send me to https://block.github.io/goose/.
- Don't echo or save credentials. Env vars only.

I'll provide as we go:
- A Cloudflare deployment URL (after I click the deploy button below)
- Confirmation of which Goose config file to edit
- Town folder location (default: ~/Documents/my-town)

PHASE 1 — VERIFY GOOSE + CLAIM A CLOUDFLARE DEPLOYMENT
  1. Check Goose installed (`goose --version`). If not, stop.
  2. Tell me to open this URL in my browser:
       https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud
     I'll sign in to Cloudflare, pick a project name, paste any AI
     provider keys it asks for, and click Deploy. ~2 min later
     Cloudflare gives me a URL like https://office-town-foo.workers.dev.
  3. Wait for me to paste that URL back.

PHASE 2 — INSTALL GOOSE PLUGIN + TEMPLATE
  1. goose plugin install jezweb/office-town-plugin
  2. goose plugin install jezweb/office-town-pack-knowledge
  3. Verify with `goose plugin list`.
  4. git clone https://github.com/jezweb/office-town <my town folder>
     (default: ~/Documents/my-town).
  5. mkdir -p <town>/wiki/knowledge && copy concepts from the pack
     plugin's install path.

PHASE 3 — WIRE 4 MCP SERVERS INTO GOOSE
  Edit ~/.config/goose/config.yaml. Add 4 entries under `extensions:`,
  all sharing the deployment URL I pasted, with different paths:

    extensions:
      office-town-wiki:
        type: streamable_http
        url: <URL>/mcp/wiki
        headers:
          Authorization: Bearer <MCP_BEARER_TOKEN>
      office-town-browser:
        ... url: <URL>/mcp/browser ...
      office-town-devops:
        ... url: <URL>/mcp/devops ...
      office-town-email:
        ... url: <URL>/mcp/email ...

  (Where <MCP_BEARER_TOKEN> is the value Cloudflare's deploy UI
  prompted me for in Phase 1. If I lost it, look it up in the CF
  dashboard under Workers > office-town > Settings > Secrets.)

PHASE 4 — SMOKE TEST + REPORT
  1. In Goose, ask wiki.create to make a test entry.
  2. wiki.search "test" — expect a hit.
  3. @boss "introduce the team" — expect coherent reply naming
     the 4 buildings.

CONSTRAINTS:
- DO NOT install a different agent host. Goose is the host.
- DO NOT touch wrangler or pnpm — Cloudflare's deploy button does
  all of that.
- Ask before editing config.yaml; show me the diff first.
```

(Trim further on the second pass — aim for ~80 lines total.)

## 6.2 — Mirror INSTALL.md

Copy from `office-town-cloud/INSTALL.md` to:
- `~/Documents/office-town/INSTALL.md`
- `~/Documents/office-town-plugin/INSTALL.md`

(Same `INSTALL.md` lives in three repos as historical convention.)

## 6.3 — Update landing-page copy button

Embed the new prompt text in the `<script type="text/plain"
id="install-prompt-full">` block of `~/Documents/officetown.au/index.html`
so the "Copy install prompt" button delivers the latest version.
Redeploy: `wrangler deploy`.

---

# Phase 7 — Smoke test on a fresh machine

**Effort:** ~30 min
**Verification gate:** a clean Mac with Goose installed but no other
toolchain completes the install in under 8 minutes.

## 7.1 — Setup

Get a fresh user account on a Mac (or use a second Mac, or a clean
VM). Install only Goose Desktop. Open Goose.

## 7.2 — Run the new prompt

Paste the new INSTALL.md prompt into a Goose session. Observe.

## 7.3 — What to look for

- Goose doesn't try to install wrangler, pnpm, or node (Phase 1
  doesn't need them).
- The agent correctly waits for the user to click the button and
  paste the URL back — doesn't try to deploy itself.
- Phase 2 plugin installs run without Hermit PATH problems
  (Goose CLI is bundled with Goose Desktop).
- Phase 3 config edit works — agent shows the diff before applying.
- Phase 4 smoke test passes.

If any step hits friction, capture the transcript to
`.jez/dogfood/install-run-<date>.md` and patch the prompt.

## 7.4 — End-of-test cleanup

If the fresh-machine test used Jez's CF account, delete the test
worker via `wrangler delete --name office-town-<test-name>` and
release the auto-provisioned resources (D1, R2, Vectorize, Queue)
from the CF dashboard. Don't leave orphans.

---

# Cross-cutting concerns

## Privacy
- The deploy button stores the user's CF credentials in their own
  account — we never see them.
- `MCP_BEARER_TOKEN` lives only in their worker's secrets — we never
  see it.
- The wiki content stays in the user's R2 — we never see it.

## Mobile
- Dashboard at `/dashboard` already responsive (per existing build).
- The MCP endpoints don't have a UI — irrelevant.

## Errors
- Every Hono route should `try/catch` and return `{ error: "...",
  details: "..." }` JSON on failure.
- MCP handlers return JSON-RPC errors (code -32603 for internal,
  -32601 for unknown method, -32602 for invalid params).
- Workers `observability` is enabled in `wrangler.jsonc` so
  `wrangler tail` works for live debugging.

## Cost
- Single worker has the same data plane as 5 workers — D1/R2/Vec
  charges identical.
- Worker requests pricing: 5 workers' request counts collapse to
  1 worker, so total requests don't change. Per-request cost is
  the same. **Net cost is roughly identical**, possibly slightly
  lower (fewer cold starts from fewer workers).

## Backwards compat for users with old 5-worker deploy
- Their existing config.yaml has 4 entries pointing at separate
  hostnames. After migration, those hostnames 404 (workers deleted).
- INSTALL.md Phase 3 contains the new config block — they overwrite.
- Add a one-paragraph "If you had Office Town v1.0 (5-worker)"
  migration note to README.md.

---

# TL;DR

| Step | Cmd / file |
|---|---|
| Branch off main | `git checkout -b refactor/single-worker-collapse` |
| Move src/* into new layout | Phase 1.2 |
| Fix imports | Phase 1.3 |
| Write new index.ts | Phase 1.4 |
| Merge wrangler.jsonc | Phase 2.1 |
| Add .dev.vars.example | Phase 2.2 |
| Cleanup package.json | Phase 2.3 |
| Session-scope fix | Phase 3.2 |
| Snapshot data | Phase 4.1 |
| Deploy new worker | `wrangler deploy` |
| Verify data intact | Phase 4.3 |
| Wire Goose | Phase 4.4 |
| Smoke test | Phase 4.5 |
| Delete old 5 workers | Phase 4.6 |
| README button | Phase 5.2 |
| Landing page button | Phase 5.3 |
| Rewrite INSTALL.md | Phase 6.1 |
| Fresh-machine smoke | Phase 7 |
| Commit + push | conventional commits, DCO-signed if upstreaming |

Total walk time: ~4 hours.
