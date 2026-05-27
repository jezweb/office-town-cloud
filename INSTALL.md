# Install Office Town

You already have a capable AI agent — Claude Code, Goose, OpenAI Codex, Aider, Cline, Cursor agent, etc. **Paste one of the prompts below into it and it'll do everything.**

You shouldn't read setup docs. Your agent should.

## Prompt 1 — Full install (deploy backend + wire up + first town)

Paste this into your agent. It'll deploy Office Town Cloud to your own Cloudflare account, install the Goose plugin, set up your first town, and verify everything works.

```
I want to install Office Town — a markdown-based AI agent fleet
methodology running on Cloudflare Workers. Source repos:

- https://github.com/jezweb/office-town (template + methodology)
- https://github.com/jezweb/office-town-cloud (Workers backend)
- https://github.com/jezweb/office-town-plugin (Goose plugin)
- https://github.com/jezweb/office-town-pack-knowledge (concept seed)

Walk me through these in order, asking for input when needed:

0. CLARIFY UPFRONT before doing anything else:

   a. **Which agent host am I configuring?** Detect from what's installed:
      - Goose CLI present (`goose --version` works) -> use Goose plugin path
      - ~/.claude/ exists / you're running inside Claude Code -> use Claude Code path
      - both / neither -> ask me
      The end-game is: 4 MCP servers wired into my agent host pointing at
      my deployed workers. The plugin contents (agents/, skills/, commands/)
      translate to whichever host I use; don't force Goose if Claude Code is
      what's here.

   b. **Toolchain bootstrap if missing.** On a fresh Mac you'll often have only
      git. Check for: node 20+, pnpm 10+, wrangler. If absent, install via
      whatever's available (Homebrew, mise, fnm, nvm, n, or download
      installers). Don't assume Homebrew exists — install it first if you
      need it. Run version checks after each step. This can add 5-15 min
      to the install on a clean machine; tell me before you start.

   c. **Inspect both INSTALL.md (canonical) AND each repo's actual
      wrangler.jsonc** before deploying — if they disagree on values
      (region, dimensions, binding names), the wrangler.jsonc wins.
      Flag mismatches; don't silently guess.

1. CREDENTIALS GATHER. I'll provide:
   - my Cloudflare account ID (visible at dash.cloudflare.com)
   - my Cloudflare API token (create one with permissions for
     Workers Scripts, D1, R2, Vectorize, Queues, Workers AI)
   - the local folder where my town should live
     (default: ~/Documents/my-town)
   Don't echo these back, don't save them anywhere unencrypted.

2. DEPLOY BACKEND to my Cloudflare account:
   - Clone office-town-cloud
   - pnpm install at the **repo root** (pnpm-workspace.yaml is at top
     level; lists packages/* as members)
   - Generate a random 32-byte hex MCP bearer token, save to keychain
     OR a .env in the cloned repo (the README explains both)
   - Create D1 database office-town-d1 via wrangler
   - Patch the D1 ID into packages/core/wrangler.jsonc
   - Run drizzle migrations (0000_init, 0001_fts5, 0002_cron_tables,
     0003_add_tasks_collection) via wrangler d1 migrations apply --remote
   - Create R2 buckets: office-town-wiki + office-town-files (and -preview
     variants). The wrangler.jsonc has the binding names.
   - Create Vectorize index office-town-vec (768 dims, cosine metric)
   - CRITICAL: create metadata indexes on collection/slug/entry_id
     BEFORE deploying the worker that would insert vectors. Vectorize
     won't retroactively index existing vectors.
   - Create the indexing Queue (office-town-index)
   - wrangler secret put MCP_BEARER_TOKEN < the token from step 1
   - Deploy office-town-core (packages/core)
   - Deploy mcp-wiki, mcp-browser, mcp-devops, mcp-email
     (each in packages/mcp-*). All have service bindings to core, so
     they need core deployed first.
   - Verify all 5 /health endpoints return 200
   - Verify GET /api/wiki/collections returns 11 default collections
     using the bearer token

3. WIRE THE PLUGIN INTO MY AGENT HOST:

   The plugin (jezweb/office-town-plugin) follows the Open Plugin Spec —
   it's just markdown agents/, skills/, commands/ folders that any
   conformant host can use. The "install" mechanism differs per host:

   - **Goose**: `goose plugin install jezweb/office-town-plugin`
     and `goose plugin install jezweb/office-town-pack-knowledge`.
     Goose handles the rest.

   - **Claude Code**: clone jezweb/office-town-plugin to a stable path
     (e.g. ~/.claude/plugins/office-town/). Then either symlink
     agents/ skills/ commands/ rules/ into ~/.claude/ subdirs, OR
     copy them in. Check ~/.claude/agents/ for existing files first;
     don't overwrite. Same for office-town-pack-knowledge — its
     concepts/ go into wiki/knowledge/ in my town folder
     (step 4), not the Claude config.

   - **Other Open Plugin Spec hosts**: read the host's docs on plugin
     discovery; the office-town-plugin's .plugin/plugin.json is spec-
     compliant so any conformant host should pick it up.

   AFTER the agents are in place, wire the 4 MCP servers into the host:
   - office-town-wiki    -> {core_url}/mcp/wiki
   - office-town-browser -> {mcp-browser worker url}/mcp
   - office-town-devops  -> {mcp-devops worker url}/mcp
   - office-town-email   -> {mcp-email worker url}/mcp
   All four use Bearer auth with the token from step 1.

   For Goose: edit ~/.config/goose/config.yaml or use `goose mcp add`.
   For Claude Code: `claude mcp add <name> --transport http <url> --header "Authorization: Bearer <token>"`.

4. SET UP TOWN FOLDER:
   - git clone github.com/jezweb/office-town to my chosen folder
   - Confirm the 4 building folders exist with their AGENTS.md
   - Run the office-town-setup recipe (it's a slash-command in
     office-town-plugin/commands/office-town-setup.yaml) to capture
     my business identity, voice, team, and a few anchor contacts.

5. SMOKE TEST:
   - Use my agent host to call wiki.create with a test contact
     (e.g. {name: "Test Person", kind: "contact"} in the contacts
     collection)
   - Call wiki.search "Test Person" and confirm the result comes back
   - Open a chat / new session and @-mention the librarian.
     The librarian should know what it does.

6. REPORT BACK:
   - The 5 deployed worker URLs (probably on *.workers.dev unless
     I've already wired a custom domain)
   - Where my MCP_BEARER_TOKEN is stored (keychain key or .env path)
   - Path to my town folder
   - Any failures or warnings
   - Estimated monthly cost on my Cloudflare account
     (~$2-5/month is typical at low volume; Vectorize + Workers AI
     usage are the variables)

CONSTRAINTS:
- Never delete a D1 database, R2 bucket, or Vectorize index without
  asking me first.
- If wrangler asks for credentials interactively and the API token
  flow works programmatically, prefer the programmatic path.
- If you hit a Cloudflare API error, paste the full error and try to
  diagnose. Don't silently retry destructive operations.
- If a step would take longer than 5 minutes (e.g. wrangler login,
  big install), tell me what's happening and ETA.

When done, the first thing I should be able to do is open my agent
host, @-mention the boss agent, ask it to "introduce the team", and
get a coherent response that references my actual business identity.
```

## Prompt 2 — Cloud-only (I already have an agent host configured)

If you've already got Goose / Claude Code set up and just need the backend deployed so you can wire it up yourself:

```
I want to deploy Office Town Cloud to my Cloudflare account so I can
wire it into my existing AI agent host.

Source: https://github.com/jezweb/office-town-cloud

I'll provide:
- Cloudflare account ID
- Cloudflare API token (Workers, D1, R2, Vectorize, Queues, Workers AI)

Steps:
1. Clone office-town-cloud
2. pnpm install (workspace root is the **repo root**;
   pnpm-workspace.yaml lists `packages/*` as members)
3. Generate a random 32-byte hex bearer token
4. Create D1 office-town-d1 + patch ID into core/wrangler.jsonc
5. Create R2 buckets (wiki + files + -preview variants)
6. Create Vectorize index office-town-vec (768 dim cosine) +
   metadata indexes on collection/slug/entry_id BEFORE any deploy
7. Create Queue office-town-index
8. wrangler secret put MCP_BEARER_TOKEN < the token
9. Deploy 5 workers: office-town-core, mcp-wiki, mcp-browser,
   mcp-devops, mcp-email (core first — others have service
   bindings to it)
10. Verify GET https://office-town-core.<subdomain>.workers.dev/health
    returns 200
11. Apply migrations: 0000_init, 0001_fts5, 0002_cron_tables,
    0003_add_tasks_collection via
    wrangler d1 migrations apply office-town-d1 --remote

Report back: 5 worker URLs + the bearer token + the streamable-HTTP
MCP config I should paste into my agent host.
```

## Prompt 3 — Connect another machine to my existing town

If you already deployed once and want a second device on the same town:

```
I already have an Office Town deployment running. I need to wire up
this new machine (Goose / Claude Code / etc.) to talk to it.

I'll provide:
- The base URL of my office-town-core worker
- My MCP_BEARER_TOKEN
- The local folder where the town will live on this machine

Steps:
1. git clone https://github.com/jezweb/office-town to my chosen folder
   (it'll sync from the wiki on first session start)
2. goose plugin install jezweb/office-town-plugin
   (or equivalent for whichever agent host I use)
3. Add streamable-HTTP MCP servers to my agent host config:
   - office-town-wiki     -> https://office-town-mcp-wiki.<sub>.workers.dev/mcp
   - office-town-browser  -> https://office-town-mcp-browser.<sub>.workers.dev/mcp
   - office-town-devops   -> https://office-town-mcp-devops.<sub>.workers.dev/mcp
   - office-town-email    -> https://office-town-mcp-email.<sub>.workers.dev/mcp
   All four use the same Bearer token I provide.
4. Smoke test: open agent host, @-mention librarian, ask it what's
   in the wiki. Should return real entries.

Don't try to redeploy any workers — they're already running. Just
wire the local config.
```

## Why this works

Your agent already knows wrangler. Already knows pnpm. Already knows how to deploy Cloudflare Workers. Already knows MCP. Office Town is just a specific pattern — the agent is more capable than the setup docs at recognising what you actually need.

When you paste the prompt, the agent will probably:
1. Ask you for the credentials (don't paste them back in the chat — your agent should call wrangler/CF API directly)
2. Run wrangler commands, occasionally asking for confirmation on destructive bits
3. Report each step as it goes
4. End with a list of URLs and a "try this" suggestion

If it gets stuck, copy the error back to your agent. Modern agents (Claude 4+, GPT-5+, Goose with Sonnet) are very good at debugging Cloudflare deploys, especially with the source repo cloned where they can read configs.

## If your agent is less capable

If you're using a smaller model and want a deterministic path: there's also a `deploy.sh` script in office-town-cloud that does steps 1-2 from Prompt 1 without an agent (you provide creds via env vars). Less elegant but fully reproducible.

## Bonus — claim your `.town` domain

`.town` is a real TLD. Cloudflare sells it for **about $30/yr** with no markup or renewal hikes — go to your Cloudflare dashboard → **Domains → Registration → Register Domains** and search.

Some other registrars do first-year promo pricing (~$12 USD) but renew at $55+/yr — always check renewal price before clicking buy. Cloudflare wins year-2 onwards.

Bonus of Cloudflare Registrar: DNS is already on Cloudflare → no nameserver swap needed when wiring custom worker domains.

Heads-up: short / brand-name `.town` domains (e.g. `office.town`, single-word company names) are mostly taken — usually defensive registrations from 2014. Check availability before getting attached.

After registration, ask your agent:

```
I just registered acmecorp.town. Wire it as a custom domain for my
Office Town Cloud deployment so app.acmecorp.town points at the
office-town-core worker, and download.acmecorp.town redirects to
GitHub Releases for Office Town Desktop (if I'm distributing my
own custom .app).
```

Your agent already knows how to add a Cloudflare zone, update
nameservers at your registrar, and bind worker custom domains.

## Help / problems

File an issue at https://github.com/jezweb/office-town/issues with:
- Which agent you used (model + version)
- Which prompt you ran (1/2/3)
- What it produced (paste the full transcript or the failing step)

The prompts will improve with usage data.

## Licence

MIT. Use, modify, redistribute. © 2026 Jezweb Pty Ltd.
