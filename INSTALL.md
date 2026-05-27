# Install Office Town

Office Town is a set of **capabilities you add to Goose**. It assumes you've already installed Goose Desktop or Goose CLI from https://block.github.io/goose/.

What you're installing INTO your existing Goose:

| Capability | Where it goes |
|---|---|
| 5 Cloudflare Workers (cloud backend — wiki + files + publish + cron + MCPs) | Your Cloudflare account (~$2-5/month) |
| 4 MCP server registrations (wiki, browser, devops, email) | Your Goose config |
| Goose plugin (agents/, skills/, commands/, rules/) | `goose plugin install jezweb/office-town-plugin` |
| Knowledge starter pack (17 portable concepts) | `goose plugin install jezweb/office-town-pack-knowledge`, then copied into your town's wiki |
| Town template (4 buildings + 11 wiki collections) | Cloned to your chosen folder, e.g. `~/Documents/my-town` |

End state: open Goose, `@boss` / `@librarian` / `@worker` / `@scout` are available, they can read+write the wiki, the wiki is persisted in your Cloudflare account.

---

## Don't have Goose yet?

Install it first from https://block.github.io/goose/. Pick Desktop (GUI) or CLI — either works with Office Town. Then come back here.

---

## The install — paste two prompts into a capable AI agent

You can use **any** capable agent to do the install — Goose itself, Claude Code, Aider, etc. The agent only needs to run wrangler commands and edit your Goose config. Office Town runs inside Goose afterward.

### Prompt A — Prerequisites

This checks Node/pnpm/wrangler, gathers Cloudflare credentials, confirms Goose is installed. ~5-15 minutes depending on what's already set up.

```
I want to add Office Town capabilities to my Goose installation. Office
Town is a content bundle (Cloudflare Workers + Goose plugin + template
+ MCP wirings) that installs INTO an existing Goose. It is NOT a
Goose replacement, NOT a separate runtime, NOT a CLI of its own.

This prompt is PREREQUISITES ONLY — checking the machine is ready.
Stop at "ready for Prompt B".

Source repos (all public, github.com/jezweb):
- office-town          (template + methodology)
- office-town-cloud    (Cloudflare Workers backend)
- office-town-plugin   (Goose plugin — agents/skills/commands/rules)
- office-town-pack-knowledge  (concepts to seed the wiki)

Procedure:

1. CONFIRM GOOSE IS INSTALLED.
   Run `goose --version`. If not found, stop and tell me to install
   Goose first from https://block.github.io/goose/. Don't try to
   install Goose yourself.

2. DETECT + INSTALL TOOLCHAIN.
   Required (skip any already at the right version):
   - git (any modern version)
   - node 20 or higher
   - pnpm 10 or higher
   - wrangler 3 or higher (npm install -g wrangler@latest)

   On macOS: prefer brew. If brew is missing and I haven't said no,
   install Homebrew via the official curl script from brew.sh, then
   retry. If I deny brew, fall back to fnm or volta in user space.

   On Linux: apt/dnf/pacman, or fnm/volta in user space.
   On Windows: winget or scoop.

   After each install, verify with --version and report.

3. GET CLOUDFLARE CREDENTIALS.
   Ask me for:
   - My Cloudflare account ID (32-char hex, visible at
     dash.cloudflare.com -> right sidebar of any account)
   - A Cloudflare API token with these permissions:
       Workers Scripts: Edit
       Workers Routes: Edit
       D1: Edit
       R2: Edit (Object + Bucket)
       Vectorize: Edit
       Queues: Edit
       Workers AI: Read
       Account Settings: Read
     Create at: dash.cloudflare.com -> My Profile -> API Tokens ->
     Create Token. Start from "Edit Cloudflare Workers" template
     and add the others.

   DO NOT echo these back. Stash in env vars for this session:
     export CLOUDFLARE_ACCOUNT_ID=...
     export CLOUDFLARE_API_TOKEN=...

   Verify with: wrangler whoami
   Expected: my email + account list. If error, walk me through
   adding the missing scope.

4. CONFIRM TOWN FOLDER PATH.
   Ask me where my town should live. Default: ~/Documents/my-town.
   Don't create the folder yet — just verify the PARENT directory
   exists and is writable.

5. REPORT BACK.
   Single line per item:

     Goose:          <version>
     git:            <version>
     node:           <version>
     pnpm:           <version>
     wrangler:       <version>
     Cloudflare:     <account name, masked id like 5369****7728>
     Town folder:    <chosen path, parent verified>
     Status:         READY FOR PROMPT B  (or BLOCKED: <reason>)

If BLOCKED, name the blocker and what I need to provide or decide.
Then stop. Don't proceed to Prompt B.

What you should NOT do in this prompt:
- Clone any Office Town repos (Prompt B does that)
- Run any wrangler create/deploy commands (Prompt B does that)
- Modify ~/.config/goose/ or any Goose config (Prompt B does that)
- Install Goose if it's missing (tell me to install it first)
```

### Prompt B — Install Office Town

After Prompt A reports `READY FOR PROMPT B`, paste this.

```
You completed Office Town prerequisites in the previous prompt. Goose
is installed, the toolchain is in place, Cloudflare creds are in env
vars (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN). Now install
Office Town capabilities into my Goose.

Source repos (all public on github.com/jezweb):
- office-town          (template — buildings + wiki dirs)
- office-town-cloud    (Cloudflare Workers backend)
- office-town-plugin   (Goose plugin)
- office-town-pack-knowledge  (concepts to seed wiki)

Procedure:

1. DEPLOY THE CLOUD BACKEND.

   git clone https://github.com/jezweb/office-town-cloud ~/src/office-town-cloud
   cd ~/src/office-town-cloud
   pnpm install     # workspace root is the repo root

   Generate a 32-byte hex MCP bearer token (save it; you'll use it
   multiple times below):
     export MCP_BEARER_TOKEN=$(openssl rand -hex 32)

   Create D1, patch its ID into packages/core/wrangler.jsonc:
     wrangler d1 create office-town-d1
     # patch d1_databases[0].database_id in packages/core/wrangler.jsonc

   Apply migrations:
     cd packages/core
     wrangler d1 migrations apply office-town-d1 --remote
     cd ../..

   Create R2 buckets:
     wrangler r2 bucket create office-town-wiki
     wrangler r2 bucket create office-town-wiki-preview
     wrangler r2 bucket create office-town-files
     wrangler r2 bucket create office-town-files-preview

   Create Vectorize index, then metadata indexes BEFORE deploying
   any worker (Vectorize won't retroactively index existing vectors):
     wrangler vectorize create office-town-vec --dimensions=768 --metric=cosine
     wrangler vectorize create-metadata-index office-town-vec --property-name=collection --type=string
     wrangler vectorize create-metadata-index office-town-vec --property-name=slug --type=string
     wrangler vectorize create-metadata-index office-town-vec --property-name=entry_id --type=string

   Create the queue:
     wrangler queues create office-town-index

   Set MCP_BEARER_TOKEN as a wrangler secret on each worker, then
   deploy in order (core first; the MCPs service-bind to core):

     for pkg in packages/core packages/mcp-wiki packages/mcp-browser packages/mcp-devops packages/mcp-email; do
       (cd "$pkg" && echo -n "$MCP_BEARER_TOKEN" | wrangler secret put MCP_BEARER_TOKEN && wrangler deploy)
     done

   Each deploy prints the worker's .workers.dev URL. Record all 5.

   Verify health on each:
     for u in <core-url> <mcp-wiki-url> <mcp-browser-url> <mcp-devops-url> <mcp-email-url>; do
       curl -sS "$u/health" && echo
     done
   Each returns {"status":"ok",...}.

   Verify the wiki API:
     curl -H "Authorization: Bearer $MCP_BEARER_TOKEN" <core-url>/api/wiki/collections
   Expect 11 default collections.

   If any wrangler command errors:
   - "Authentication error" -> token is missing a scope; help me fix
   - "Already exists" -> idempotent, continue
   - "No D1 binding" -> wrangler.jsonc database_id wasn't patched
   - "Vectorize metadata index already exists" -> idempotent, continue
   - Anything else: paste full error to me, diagnose, don't blindly
     retry

2. CLONE THE TOWN TEMPLATE.

   git clone https://github.com/jezweb/office-town <my chosen path>
   cd into it. Confirm the 4 building folders exist:
     buildings/office/AGENTS.md
     buildings/library/AGENTS.md
     buildings/workshop/AGENTS.md
     buildings/lookout/AGENTS.md
   And the roles at roles/{boss,librarian,worker,scout}.md.

3. INSTALL THE GOOSE PLUGIN + KNOWLEDGE PACK.

     goose plugin install jezweb/office-town-plugin
     goose plugin install jezweb/office-town-pack-knowledge

   These give Goose the 4 default agent roles, the per-role skills,
   the recipes (e.g. office-town-setup), and the town's standing
   orders. They don't auto-wire the MCP servers — that's step 4.

   Verify with: goose plugin list
   Should show both plugins.

4. WIRE THE 4 MCP SERVERS INTO GOOSE.

   The fast path: edit ~/.config/goose/config.yaml and add the 4
   streamable-HTTP MCP servers under extensions:

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

   Substitute the 4 worker URLs from step 1 and the bearer token.

   Alternative: if `goose mcp add` exists in this Goose version, use
   that. Otherwise edit the config.yaml directly.

   Restart Goose Desktop, or if using Goose CLI just start a fresh
   session — the new MCP servers should appear.

5. SEED THE WIKI WITH STARTER KNOWLEDGE.

   The knowledge pack you installed in step 3 includes 17 portable
   concepts + 35 coding gotchas. Copy them into the town's wiki:

     mkdir -p <town-path>/wiki/knowledge
     cp -r ~/.config/goose/plugins/office-town-pack-knowledge/concepts/* \
           <town-path>/wiki/knowledge/

   (Path may differ slightly per Goose version; find the pack's
   install location via `goose plugin info office-town-pack-knowledge`
   if needed.)

6. SMOKE TEST.

   Open a Goose chat in <town-path>.

   a. Ask Goose to call wiki.create with:
        {"collection": "contacts", "slug": "test-smoke",
         "frontmatter": {"name": "Test Person", "kind": "contact"},
         "body": "Initial install smoke test."}
      Expect a 201-shaped response.

   b. Ask Goose to call wiki.search "Test Person".
      Expect a hit.

   c. @boss "introduce the team". Expect a coherent response
      referencing the 4 buildings + 4 default roles.

   d. (Optional cleanup) Ask Goose to wiki.delete contacts/test-smoke.

7. REPORT BACK.

   Print exactly:

     Office Town installed for Goose.

     Workers (all returning HTTP 200 /health):
       core:    <url>
       wiki:    <url>
       browser: <url>
       devops:  <url>
       email:   <url>

     MCP bearer token: stored at <keychain key or .env path>
     Town folder:      <path>, 4 buildings present
     Goose plugins:    jezweb/office-town-plugin + office-town-pack-knowledge
     Wiki seeded:      knowledge/ has <N> concepts

     Estimated monthly cost: ~$2-5 USD at typical SMB volume.

     Try this next:
       In a Goose chat at <town-path>, @librarian "extract
       everything I know about [my main client]". The librarian
       will walk me through capturing their first wiki entries.

CONSTRAINTS:
- Never delete D1 / R2 / Vectorize without asking me.
- If a wrangler command would take longer than 60s, tell me + ETA.
- If a deploy fails after 2 retries, stop. Don't keep retrying.
- DO NOT install a different agent host. Goose is the host.
- DO NOT save my Cloudflare token to a git-tracked path.

Total expected time: 10-15 minutes if Prompt A was successful.
```

---

## Connecting a second machine

If you already have an Office Town deployment and want a second Goose install on the same town:

```
I already have Office Town running. Wire this new Goose installation
to my existing deployment.

I'll provide:
- The 5 worker URLs (or just the core URL — you can derive others
  from my MCP_BEARER_TOKEN auth + the convention)
- My MCP_BEARER_TOKEN
- Town folder path on this machine (default: ~/Documents/my-town)

Steps:
1. Confirm Goose is installed (`goose --version`). If not, stop.
2. git clone https://github.com/jezweb/office-town to my chosen path.
3. goose plugin install jezweb/office-town-plugin
4. goose plugin install jezweb/office-town-pack-knowledge
5. Edit ~/.config/goose/config.yaml to add the 4 streamable-HTTP
   MCP servers (same shape as Prompt B step 4) pointing at my
   existing workers with my existing bearer token.
6. Smoke test: open Goose in the town path, ask it to call
   wiki.search "" with no query — should return entries from my
   existing town's data.

Don't deploy any workers — they're already running on my CF account.
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
- Which prompt you were on (A, B, or connect-existing)
- Paste the full transcript or failing step

## Licence

MIT. © 2026 Jezweb Pty Ltd.
