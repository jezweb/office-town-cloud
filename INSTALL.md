# Install Office Town

Office Town adds **team-shaped capabilities** to your [Goose](https://block.github.io/goose/) installation: four addressable roles (boss, librarian, worker, scout), a Cloudflare-backed wiki that replaces Goose's built-in Memory extension, and the Cloudflare primitives an agent needs to handle every kind of file/input/output.

## The shortest path (recommended)

### 1. Deploy the backend (one click)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud)

Click the button. Cloudflare's flow signs you in (no API token required), provisions D1 + R2 + Vectorize + Queue + Workers AI + Images + Email Routing + Containers (for the sandbox MCP) from `wrangler.jsonc`.

**Two fields you must fill in** (Cloudflare's form leaves them blank):

| Field | Value |
|---|---|
| Vectorize **Dimensions** | `768` |
| Vectorize **Metric** | `cosine` |

These match Workers AI's `@cf/baai/bge-base-en-v1.5` embedding model that the wiki uses. The Cloudflare deploy form can't read these from `wrangler.jsonc` (the schema doesn't allow create-time params on Vectorize bindings — verified against wrangler 4.95 config schema), so they need to be entered by hand.

**Everything else can stay blank** — leave the 4 secret fields empty, the worker auto-generates the bearer on first request.

~2-3 minutes later you'll have a worker URL like `https://office-town-<you>.<account>.workers.dev`. (First deploy is ~30 sec slower than subsequent ones — Cloudflare builds the sandbox container image once and caches it.)

> **Want to wire Google sign-in for the dashboard, or rotate the bearer to a value of your choice?** Set these post-deploy via `wrangler secret put NAME` (none of them are required, none appear in the deploy form):
>
> - `MCP_BEARER_TOKEN` — overrides the auto-generated one
> - `BETTER_AUTH_SECRET` — session signing for dashboard Google sign-in (`openssl rand -hex 32`)
> - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — from `https://console.cloud.google.com/apis/credentials`

> **Self-deploying via `wrangler deploy` instead of the button?** You'll need Docker running locally for that first deploy — wrangler builds the sandbox container image on your machine and pushes it to Cloudflare's registry. After that, normal deploys reuse the cached image. End-users clicking the button above don't need Docker (Cloudflare's hosted build infra handles it).

### 2. Open `<your-worker-url>/dashboard/connect`

First visit shows a yellow **"Claim this install"** banner — click the button. That locks the dashboard so future visitors need to sign in with the bearer (without that click, anyone with the URL could see the same page).

After claiming you land on the dashboard. Open `/dashboard/connect` again, click **Copy install script**, paste into a terminal. The script wires all 6 MCPs into your local Goose installation (`goose mcp add` × 6 + `goose mcp disable memory`).

> **Lost your cookie / want to access from another browser?** Open `/dashboard/connect` and paste your bearer token into the sign-in form. The bearer doubles as the dashboard password. Rotate any time via `wrangler secret put MCP_BEARER_TOKEN`.

### 3. Clone the town template

```bash
git clone https://github.com/jezweb/office-town ~/Documents/my-town
```

Restart Goose, smoke-test: `wiki(action: 'list', collection: 'contacts')` should return cleanly. Then `@boss "introduce the team"`.

That's it — about 5 minutes total.

---

## Fallback path — agent-driven install (if the connect page is unreachable)

Paste this prompt into any capable AI agent (Claude Code, Goose, Aider, Cline):

```
I want to add Office Town capabilities to my Goose installation.

Office Town is a content bundle (one Cloudflare Worker + Goose plugin
+ town template) that installs INTO an existing Goose. NOT a Goose
replacement. The Worker hosts 6 MCP servers (wiki, files, email,
cron, voice, sandbox) plus a dashboard. The plugin adds 4 agent
roles + skills + recipes.

I'll provide:
- My Cloudflare deployment URL (from the Deploy button)
- My MCP bearer token (from <my-worker>/dashboard/connect — auto-generated)
- A town folder path (default: ~/Documents/my-town)

GROUND RULES:
- Be transparent. Say what you're about to do.
- Ask before destructive ops or any software install.
- If Goose isn't installed: stop, point me at
  https://block.github.io/goose/.
- Don't echo or save credentials. Env vars only.

STEPS:

1. Check Goose is installed:
     goose --version
   If not, stop and direct me to https://block.github.io/goose/.

2. Verify the deployment URL works:
     curl -s <URL>/health
   Should return {"status":"ok","service":"office-town",...}

3. Install the Office Town plugin (Open Plugin Spec — installs to
   ~/.agents/plugins/):
     goose plugin install jezweb/office-town-plugin
     goose plugin install jezweb/office-town-pack-knowledge
   Verify:
     goose plugin list

   OPTIONAL — for Cloudflare account ops (DNS, R2, D1 admin):
     goose plugin install jezweb/office-town-pack-cloudflare
   This bundles Cloudflare's official MCPs from github.com/cloudflare/mcp.

4. Disable Goose's built-in Memory extension — the wiki MCP replaces
   it (per docs/MEMORY-COMPARISON.md). Use Goose's CLI:
     goose mcp disable memory
   Or in the Desktop UI: Extensions → Memory → toggle off.

5. Wire the 6 Office Town MCPs via `goose mcp add` (NOT raw YAML
   editing — let Goose validate the config). Same bearer for all six:

     for name in wiki files email cron voice sandbox; do
       goose mcp add office-town-$name \\
         --transport streamable_http \\
         --url <URL>/mcp/$name \\
         --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
     done

   Or one at a time if you prefer:

     goose mcp add office-town-wiki    --transport streamable_http --url <URL>/mcp/wiki    --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
     goose mcp add office-town-files   --transport streamable_http --url <URL>/mcp/files   --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
     goose mcp add office-town-email   --transport streamable_http --url <URL>/mcp/email   --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
     goose mcp add office-town-cron    --transport streamable_http --url <URL>/mcp/cron    --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
     goose mcp add office-town-voice   --transport streamable_http --url <URL>/mcp/voice   --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
     goose mcp add office-town-sandbox --transport streamable_http --url <URL>/mcp/sandbox --header "Authorization: Bearer <MCP_BEARER_TOKEN>"

   Note: `office-town-voice` (the call_* actions) and
   `office-town-sandbox` (the run action) are v1.1-alpha — they return
   `status: not_yet_wired` placeholders until the Realtime + Containers
   bindings land. Their other actions (transcribe, synthesize,
   list_voices, list_languages) work today.

   If `goose mcp add` isn't available in your Goose version, fall back
   to editing ~/.config/goose/config.yaml under `extensions:`. Show me
   the diff before applying.

6. Clone the town template to my chosen folder (default
   ~/Documents/my-town):
     git clone https://github.com/jezweb/office-town <town path>

7. Restart Goose (Desktop) or start a fresh CLI session.

8. SMOKE TEST in a fresh Goose chat at the town folder:
   a. Use the wiki gateway tool:
        wiki(action: 'write',
             collection: 'contacts',
             slug: 'smoke-test',
             frontmatter: {name: 'Test', kind: 'contact'},
             body: 'Install smoke test.',
             why: 'install verification')
      Should return {slug, uuid, audit_id, ...}.
   b. wiki(action: 'search', query: 'Test')
      Should return the smoke-test hit.
   c. wiki(action: 'list', collection: 'contacts')
      Should show smoke-test in the list.
   d. @boss "introduce the team"
      Should respond coherently mentioning the 4 buildings
      (office/library/workshop/lookout) and 4 default roles
      (boss/librarian/worker/scout).

9. Final report:

     Office Town installed for Goose.
       Deployment URL:    <URL>
       Town folder:       <path>
       MCP servers:       office-town-{wiki,files,email,cron,voice,sandbox}
                          (6 gateway tools, 57 actions total)
       Plugins:           office-town-plugin + office-town-pack-knowledge
       Memory:            Goose built-in disabled — wiki MCP replaces it
       Alpha:             voice.call_* + sandbox.run return placeholders
                          pending Realtime + Containers wiring (v1.1)

     Try: @librarian "extract everything I know about my biggest client"

CONSTRAINTS:
- DO NOT install a different agent host. Goose is the host.
- DO NOT touch wrangler, pnpm, or your local Cloudflare account from
  this prompt — the button already provisioned everything.
- Ask before editing config.yaml; show me the diff first.
- 'why:' is REQUIRED on every wiki mutation (write/update/supersede/
  archive/delete/link/attach). The wiki MCP enforces this for audit.
```

That's it. ~5 min agent work after the ~2 min button click. ~7 min end-to-end.

---

## What you get

**6 MCP gateway tools** (one per server, each with multiple actions — 57 actions total):

| Tool | Actions | Purpose |
|---|---|---|
| `wiki` | write, get, read, search, update, supersede, archive, delete, history, link, related, list, tree, recent, glob, head, head_many, collections, register, attach, list_attachments, detach (22) | Team wiki — replaces Goose Memory |
| `files` | upload, download, list, delete, share, revoke, convert (any-doc → markdown), transform_image, publish, unpublish, fetch_with_js (puppeteer + toMarkdown), screenshot, generate_image (FLUX 2), speak (Aura-2) (14) | Files + share + publish + AI conversion + browser + image-gen + TTS |
| `email` | send, draft (2) | Outbound via Cloudflare Email Routing |
| `cron` | schedule, list, get, due, history, run_now, delete (7) | Recurring agent work + one-off scheduled jobs |
| `voice` | transcribe (Nova-3), synthesize (Aura-2 + 40 voices), list_voices, call_create, call_end, call_status (6) | STT/TTS today + Realtime SFU voice conversations (alpha) |
| `sandbox` | run, list_languages, persist_create, persist_run, persist_end, persist_list (6) | Isolated code execution — Python/Node/TS/Bash (alpha, pending Containers) |

**Plus**: inbound email handler (Email Routing → `wiki/research/`) and dashboard pages (wiki browser, cron, files, published pages, kanban view).

**Plus Goose's defaults you keep enabled**: Analyze, Apps, Developer, Extension Manager, Skills, Summon (delegation to @worker / @scout), Todo, Top Of Mind (standing orders).

**Goose's Memory extension is disabled** — wiki MCP replaces it.

## Recommended ecosystem extensions (install if you want)

| Extension | Purpose | How to install |
|---|---|---|
| `office-town-pack-cloudflare` | Bundles Cloudflare's official MCPs (DNS, R2, D1, Workers, observability) | `goose plugin install jezweb/office-town-pack-cloudflare` |
| Playwright MCP | Browser automation (we used to ship our own; Playwright does it better) | `goose mcp add playwright --command "npx -y @modelcontextprotocol/server-playwright"` |
| Gmail MCP | For the librarian to read inbound Gmail (we only do Email Routing inbound) | See Goose's MCP catalogue |
| Tavily / Firecrawl | Web search | See Goose's MCP catalogue |
| Knowledge Graph MCP (npm) | Multi-hop relational reasoning over the wiki | See Goose's MCP catalogue |

## Multi-machine setup (v1.1 — coming soon)

For users who want the wiki **on every machine** in Finder + their editor of choice, v1.1 will ship `officetowd` — a Go-lang sync daemon (Goanna-style) that bisyncs `<town-path>/` to/from R2. Install via:

```bash
brew install jezweb/tap/officetowd
officetowd configure   # interactive — fills config
officetowd start
```

Until then: v1.0 is cloud-only (agents access the wiki via the MCP). For a single-machine workaround in v1.0, `rclone mount` against R2 works but is slow.

---

## Connecting a second machine to an existing deployment

Already have Office Town running? Paste this:

```
I already have Office Town running. Wire this new Goose installation
to my existing deployment.

I'll provide:
- The deployment URL
- My MCP_BEARER_TOKEN
- A town folder path

Steps (the workers are already up):

1. goose --version  — verify Goose installed
2. curl -s <URL>/health  — verify deployment reachable
3. goose plugin install jezweb/office-town-plugin
4. goose plugin install jezweb/office-town-pack-knowledge
5. goose mcp disable memory
6. Loop wire all six MCPs:
     for name in wiki files email cron voice sandbox; do
       goose mcp add office-town-$name --transport streamable_http \\
         --url <URL>/mcp/$name --header "Authorization: Bearer <token>"
     done
7. git clone https://github.com/jezweb/office-town <town path>
8. Smoke test: wiki(action: 'list', collection: 'contacts') in Goose
```

---

## Bonus: claim your `.town` domain

`.town` is a real TLD. Cloudflare sells it for about $30/yr at Dashboard → Domains → Registration → Register Domains. After registering, any capable agent can wire it as a custom domain on your worker via the Cloudflare-pack MCPs.

## Help

File an issue at https://github.com/jezweb/office-town/issues. Include which agent ran the install + the failing step.

## Licence

MIT. © 2026 Jezweb Pty Ltd.
