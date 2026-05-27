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

1. CREDENTIALS GATHER. I'll provide:
   - my Cloudflare account ID (visible at dash.cloudflare.com)
   - my Cloudflare API token (create one with permissions for
     Workers Scripts, D1, R2, Vectorize, Queues, Workers AI)
   - the local folder where my town should live
     (default: ~/Documents/my-town)
   Don't echo these back, don't save them anywhere unencrypted.

2. DEPLOY BACKEND to my Cloudflare account:
   - Clone office-town-cloud
   - pnpm install at the ui/ workspace level
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

3. INSTALL PLUGIN:
   - For Goose: goose plugin install jezweb/office-town-plugin
     and goose plugin install jezweb/office-town-pack-knowledge
   - For Claude Code: clone the plugin repo + symlink agents/,
     skills/, commands/ into ~/.claude/ or however Claude Code
     discovers plugins. Check the plugin's .plugin/plugin.json for
     the exact shape.
   - Configure MCP servers in my agent host to point at my newly
     deployed workers with the bearer token from step 1 (see
     office-town-plugin/README for the streamable-HTTP shape).

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
2. pnpm install (workspace root is ui/, not the package dir)
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

`.town` is a real TLD (~$30 AUD/yr at most registrars including Synergy Wholesale, Hover, Porkbun). If your town deserves its own URL, register `<yourbusiness>.town` and point it at your Office Town Cloud deployment.

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
