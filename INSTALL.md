# Install Office Town

Office Town is a set of **capabilities you add to Goose**. It assumes you've already installed Goose Desktop or Goose CLI from https://block.github.io/goose/.

What gets installed INTO your existing Goose:

| Capability | Where it goes |
|---|---|
| 5 Cloudflare Workers (cloud backend: wiki + files + publish + cron + MCPs) | Your Cloudflare account (~$2-5/month) |
| 4 MCP server registrations (wiki, browser, devops, email) | Your Goose config |
| Goose plugin (agents/, skills/, commands/, rules/) | `goose plugin install jezweb/office-town-plugin` |
| Knowledge starter pack (17 portable concepts) | `goose plugin install jezweb/office-town-pack-knowledge`, then copied into your town's wiki |
| Town template (4 buildings + 11 wiki collections) | Cloned to your chosen folder, e.g. `~/Documents/my-town` |

End state: open Goose, `@boss` / `@librarian` / `@worker` / `@scout` are available, they read+write the wiki, the wiki is persisted in your Cloudflare account.

---

## Before you start

You need two things in place:

1. **Goose** installed from https://block.github.io/goose/ (Desktop or CLI, either works).
2. **A Cloudflare account** at https://dash.cloudflare.com — free tier is enough to start.

You don't need to pre-install Node / pnpm / wrangler. The agent doing the install will check for those and ask before installing anything missing.

---

## The install — paste one prompt into a capable AI agent

The agent doing the install can be Goose itself, Claude Code, Aider, Cline — anything that can run shell commands. Office Town runs inside Goose afterward regardless of which agent did the setup.

Total time: ~20-30 minutes. Most of it is wrangler waiting on Cloudflare.

```
I want to add Office Town capabilities to my Goose installation.

Office Town is a content bundle (Cloudflare Workers + Goose plugin +
template + MCP wirings) that installs INTO an existing Goose. It is
NOT a Goose replacement, NOT a separate agent runtime, NOT a CLI of
its own. The host I want to install it into is Goose; if I'm using
something else right now (Claude Code, Aider, etc.) you are just the
agent running the install — Office Town runs in Goose afterward.

Source repos (all public, github.com/jezweb):
- office-town          (template + methodology)
- office-town-cloud    (Cloudflare Workers backend)
- office-town-plugin   (Goose plugin: agents/skills/commands/rules)
- office-town-pack-knowledge  (concepts to seed the wiki)

GENERAL RULES FOR THE WHOLE INSTALL:
- Be transparent. Tell me what you're about to do before doing it.
- Ask before destructive operations (delete, drop, force-push, etc).
- Ask before any software install (brew, node, wrangler, goose).
- If something is missing (Goose, Cloudflare account, etc.), tell me
  how to get it and pause — don't try to invent workarounds.
- Don't echo credentials. Stash them in env vars; never in a file
  that ends up tracked by git.
- After each phase, summarise what got done before proceeding.

==============================================================
PHASE 1 — DETECT STATE + SET UP PREREQUISITES
==============================================================

1. Check Goose is installed.
     goose --version
   If not found: stop. Tell me to install Goose first from
   https://block.github.io/goose/, then re-run this prompt. Don't
   try to install Goose yourself unless I explicitly tell you to.

2. Check toolchain. Run version checks for:
     git --version              (any modern version)
     node --version             (need 20+)
     pnpm --version             (need 10+)
     wrangler --version         (need 3+)

   For each missing or out-of-date:
   - Tell me what's missing
   - Propose how to install on my platform:
     * macOS: brew (preferred) or fnm/volta if I don't want brew
     * Linux: apt/dnf/pacman, or fnm/volta in user space
     * Windows: winget or scoop
   - Ask "should I install <X> via <method>?" and wait for my
     confirmation before installing
   - On macOS, if brew itself is missing, ask before installing
     Homebrew via the official curl script from brew.sh

   wrangler specifically: install globally with
     npm install -g wrangler@latest
   (or pnpm equivalent). Verify with wrangler --version.

3. Cloudflare credentials.

   Check if CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are
   already set in my environment. If yes, verify them with:
     wrangler whoami

   If not set, or verify fails:
   a. Ask me for my Cloudflare account ID (32-char hex, visible at
      dash.cloudflare.com -> any account -> right sidebar). If I
      don't have an account: pause, tell me to sign up free at
      https://dash.cloudflare.com/sign-up, wait until I confirm.

   b. Ask me for a Cloudflare API token with these permissions:
        Workers Scripts: Edit
        Workers Routes: Edit
        D1: Edit
        R2: Edit (Object + Bucket)
        Vectorize: Edit
        Queues: Edit
        Workers AI: Read
        Account Settings: Read
      Tell me how to create it: dash.cloudflare.com -> My Profile ->
      API Tokens -> Create Token. Use the "Edit Cloudflare Workers"
      template, then add the other scopes.

   c. When I paste them, immediately stash in env vars (don't echo,
      don't save to disk):
        export CLOUDFLARE_ACCOUNT_ID=...
        export CLOUDFLARE_API_TOKEN=...

   d. Verify: wrangler whoami should show my email + account list.
      If error, walk me through fixing the token (usually missing
      a scope).

4. Town folder.
   Ask where my town folder should live. Default: ~/Documents/my-town.
   Verify the PARENT directory exists and is writable.
   Don't create the town folder yet — phase 2 does that.

5. SUMMARY before proceeding.
   Print:
     Goose:          <version>
     git:            <version>
     node:           <version>
     pnpm:           <version>
     wrangler:       <version>
     Cloudflare:     <account name, masked id like 5369****7728>
     Town folder:    <chosen path>
     Status:         READY TO INSTALL

   Then ask: "Proceed with Phase 2 (the actual install)? It will
   create 5 workers + D1 + R2 buckets + Vectorize index + queue +
   secrets in my Cloudflare account, costs ~$2-5/month, ~15 min
   to complete."

   Wait for my "yes" before continuing.

==============================================================
PHASE 2 — DEPLOY THE CLOUD BACKEND
==============================================================

1. Clone office-town-cloud:
     git clone https://github.com/jezweb/office-town-cloud ~/src/office-town-cloud
     cd ~/src/office-town-cloud
     pnpm install     # workspace root is the repo root

2. Generate MCP bearer token:
     export MCP_BEARER_TOKEN=$(openssl rand -hex 32)
   You'll use it multiple times below. Don't lose it.

3. Create D1, patch its ID into packages/core/wrangler.jsonc:
     wrangler d1 create office-town-d1
     # then edit packages/core/wrangler.jsonc:
     #   d1_databases[0].database_id = <returned id>

   Then apply migrations:
     cd packages/core
     wrangler d1 migrations apply office-town-d1 --remote
     cd ../..

4. Create R2 buckets:
     wrangler r2 bucket create office-town-wiki
     wrangler r2 bucket create office-town-wiki-preview
     wrangler r2 bucket create office-town-files
     wrangler r2 bucket create office-town-files-preview

5. Create Vectorize index, then metadata indexes BEFORE deploying
   any worker (Vectorize won't retroactively index existing vectors):
     wrangler vectorize create office-town-vec --dimensions=768 --metric=cosine
     wrangler vectorize create-metadata-index office-town-vec --property-name=collection --type=string
     wrangler vectorize create-metadata-index office-town-vec --property-name=slug         --type=string
     wrangler vectorize create-metadata-index office-town-vec --property-name=entry_id     --type=string

6. Create the indexing queue:
     wrangler queues create office-town-index

7. Set MCP_BEARER_TOKEN as a wrangler secret on each worker, then
   deploy in order — core first; the MCPs service-bind to it:

     for pkg in packages/core packages/mcp-wiki packages/mcp-browser packages/mcp-devops packages/mcp-email; do
       (cd "$pkg" && echo -n "$MCP_BEARER_TOKEN" | wrangler secret put MCP_BEARER_TOKEN && wrangler deploy)
     done

   Each deploy prints the worker's .workers.dev URL. Record all 5.

8. Verify health on each:
     for u in <core-url> <mcp-wiki-url> <mcp-browser-url> <mcp-devops-url> <mcp-email-url>; do
       curl -sS "$u/health" && echo
     done
   Each returns {"status":"ok",...}.

9. Verify wiki API:
     curl -H "Authorization: Bearer $MCP_BEARER_TOKEN" <core-url>/api/wiki/collections
   Expect 11 default collections.

If any wrangler command errors:
- "Authentication error" -> token is missing a scope; help me fix
- "Already exists" -> idempotent, continue
- "No D1 binding" -> wrangler.jsonc database_id wasn't patched
- "Vectorize metadata index already exists" -> idempotent, continue
- Anything else: paste full error to me, diagnose, don't blindly
  retry (especially destructive ops)

==============================================================
PHASE 3 — CLONE TEMPLATE + INSTALL GOOSE PLUGIN
==============================================================

1. Clone the town template:
     git clone https://github.com/jezweb/office-town <my chosen path>
   Confirm the 4 building folders exist:
     buildings/{office,library,workshop,lookout}/AGENTS.md
   And the roles at roles/{boss,librarian,worker,scout}.md.

2. Install the Goose plugin + knowledge pack:
     goose plugin install jezweb/office-town-plugin
     goose plugin install jezweb/office-town-pack-knowledge

   Verify with: goose plugin list

3. Wire the 4 MCP servers into Goose. Edit ~/.config/goose/config.yaml
   and add under extensions:

     extensions:
       office-town-wiki:
         type: streamable_http
         url: <core-url>/mcp/wiki
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>
       office-town-browser:
         type: streamable_http
         url: <mcp-browser-url>/mcp
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>
       office-town-devops:
         type: streamable_http
         url: <mcp-devops-url>/mcp
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>
       office-town-email:
         type: streamable_http
         url: <mcp-email-url>/mcp
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>

   If `goose mcp add` is available in this Goose version, use that
   instead. Otherwise edit config.yaml directly.

4. Seed the wiki:
     mkdir -p <town-path>/wiki/knowledge
     cp -r ~/.config/goose/plugins/office-town-pack-knowledge/concepts/* \
           <town-path>/wiki/knowledge/
   Path may differ slightly per Goose version. Find it via
   `goose plugin info office-town-pack-knowledge` if needed.

5. Restart Goose (Desktop), or for CLI just start a fresh session.

==============================================================
PHASE 4 — SMOKE TEST + REPORT
==============================================================

In a Goose chat at <town-path>:

1. Ask Goose to call wiki.create with:
     {"collection": "contacts", "slug": "test-smoke",
      "frontmatter": {"name": "Test Person", "kind": "contact"},
      "body": "Initial install smoke test."}
   Expect 201-shaped response.

2. wiki.search "Test Person" — expect a hit.

3. @boss "introduce the team" — expect coherent response referencing
   the 4 buildings + 4 default roles.

4. (Optional) wiki.delete contacts/test-smoke

5. Final report. Print exactly:

     Office Town installed for Goose.

     Workers (all returning HTTP 200 /health):
       core:    <url>
       wiki:    <url>
       browser: <url>
       devops:  <url>
       email:   <url>

     MCP bearer token: stored at <where>
     Town folder:      <path>, 4 buildings present
     Goose plugins:    jezweb/office-town-plugin + office-town-pack-knowledge
     Wiki seeded:      knowledge/ has <N> concepts

     Estimated monthly cost: ~$2-5 USD at typical SMB volume.

     Try this next:
       In a Goose chat at <town-path>, @librarian "extract
       everything I know about [my main client]". The librarian
       will walk me through capturing their first wiki entries.

CONSTRAINTS:
- Never delete D1 / R2 / Vectorize without asking.
- If a wrangler command will take longer than 60s, tell me + ETA.
- If a deploy fails after 2 retries, stop. Don't keep retrying.
- DO NOT install a different agent host. Goose is the host.
- DO NOT save my Cloudflare token to a git-tracked path.
```

---

## Connecting a second machine

If you already have an Office Town deployment and want a second Goose install on the same town:

```
I already have Office Town running. Wire this new Goose installation
to my existing deployment.

I'll provide:
- The 5 worker URLs (or just the core URL — you can derive others
  from the convention)
- My MCP_BEARER_TOKEN
- Town folder path on this machine (default: ~/Documents/my-town)

Steps:
1. Check Goose is installed (`goose --version`). If not, stop.
2. git clone https://github.com/jezweb/office-town to my chosen path.
3. goose plugin install jezweb/office-town-plugin
4. goose plugin install jezweb/office-town-pack-knowledge
5. Edit ~/.config/goose/config.yaml to add the 4 streamable-HTTP
   MCP servers pointing at my existing workers with my existing
   bearer token.
6. Smoke test: open Goose in the town path, ask it to call
   wiki.search "" — should return entries from my existing town.

Don't deploy any workers; they're already running on my CF account.
```

---

## Bonus — claim your `.town` domain

`.town` is a real TLD. Cloudflare sells it for **about $30/yr** with no markup — Dashboard → Domains → Registration → Register Domains.

Some other registrars do first-year promo pricing (~$12 USD) but renew at $55+/yr — check renewal price before clicking buy.

After registering, ask any agent:

```
I registered <yourbusiness>.town. Wire it as a custom domain for my
Office Town Cloud deployment:
- app.<yourbusiness>.town -> office-town-core worker

You know how to add a Cloudflare zone, update nameservers at my
registrar, and bind worker custom domains.
```

Heads-up: short / brand-name `.town` domains are mostly taken (defensive registrations from 2014). Check availability before getting attached.

## Help / problems

File an issue at https://github.com/jezweb/office-town/issues with:
- Which agent you used to do the install (Goose itself, Claude Code, etc.)
- Which phase failed (1/2/3/4)
- Paste the full transcript or failing step

## Licence

MIT. © 2026 Jezweb Pty Ltd.
