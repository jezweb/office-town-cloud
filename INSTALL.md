# Install Office Town

You have a capable AI agent — Claude Code, Goose, Aider, Cline, Cursor agent, OpenAI Codex, etc. Don't read setup docs. Hand your agent the prompts below and watch.

The install is split into **two prompts** so you can audit between them:

- **[Prompt A — Prerequisites](#prompt-a--prerequisites)** (~5-15 min) — makes sure the machine has Node, pnpm, wrangler, Cloudflare access, and confirms which agent host is in play. Doesn't touch Office Town.
- **[Prompt B — Install Office Town](#prompt-b--install-office-town)** (~10-15 min) — deploys backend + wires plugin into your host + creates first town folder. Assumes Prompt A is done.

Optional add-ons further down: **[connect a second machine](#connecting-a-second-machine)** to an existing town, **[grab `.town` domain](#bonus--claim-your-town-domain)**.

---

## Prompt A — Prerequisites

Paste this into your agent. It checks what's installed, installs what's missing, and confirms Cloudflare access. **It does NOT install Office Town yet.** Stop point is "ready to proceed".

```
You are preparing this machine for an Office Town install. Office Town
is a CONTENT BUNDLE (markdown agents + skills + recipes + a Cloudflare
Workers backend) that installs INTO an existing AI agent host. It is
NOT an agent runtime itself — it doesn't replace Claude Code, Goose,
or whatever host you're already running in.

WHAT YOU ARE NOT DOING:
- You are NOT installing Goose. Goose is one possible host, not a
  dependency. If Goose is already this user's host, fine — but don't
  install it just because the repos mention it.
- You are NOT installing a new agent runtime. The host you are running
  in IS the runtime. You'll lay Office Town content into ITS config dir.
- You are NOT creating a custom CLI called "office-town". There is no
  such command. There's a methodology + cloud backend + plugin content.

WHAT OFFICE TOWN ACTUALLY IS (so you know what to install in Prompt B):
- 5 Cloudflare Workers deployed to the user's CF account (the cloud
  backend — wiki + files + publish + cron + 4 MCP servers)
- A plugin (markdown agents/, skills/, commands/, rules/) that gets
  copied or symlinked into the user's existing host config dir
  (~/.claude/ for Claude Code, ~/.config/goose/ for Goose, etc.)
- A template folder (4 buildings + 11 wiki collection dirs + AGENTS.md)
  cloned to the user's machine — typically ~/Documents/my-town
- 4 MCP server registrations in the host's config, pointing at the
  user's freshly-deployed workers

Source repos (all public, github.com/jezweb):
- office-town          (template + methodology — buildings/, roles/, wiki/)
- office-town-cloud    (Cloudflare Workers backend)
- office-town-plugin   (Open Plugin Spec plugin — agents/skills/commands)
- office-town-pack-knowledge  (17 portable concepts to seed the wiki)

DO NOT install Office Town in THIS prompt. This prompt is prerequisites
ONLY (toolchain + Cloudflare access + host detection). Stop at "ready
for Prompt B".

Procedure:

1. DETECT AGENT HOST (don't install one).

   You ARE the agent host's runtime. Office Town will install into
   whatever you are. Identify yourself:
   - If running inside Claude Code (anthropic CLI), say "Claude Code".
     Common signals: ~/.claude/ exists, `claude --version` works,
     or you can tell from your own internal context.
   - If running inside Goose (`goose run` or Goose Desktop), say "Goose".
   - If running inside another Open Plugin Spec host (Aider, Cline,
     Cursor agent, OpenAI Codex CLI, Hermes, etc.), say which one.
   - If you genuinely can't introspect, ask me once and don't ask again.

   Record the host name for Prompt B.

   ⚠️ DO NOT install Goose just because the Office Town repos mention it.
   ⚠️ DO NOT install Claude Code if Goose is what's here.
   ⚠️ DO NOT install a NEW agent host because the user "doesn't have one" —
      if they're running you, they have one (you).

2. DETECT + INSTALL TOOLCHAIN.

   Required (skip any already at the right version):
   - git (any modern version)
   - node 20 or higher
   - pnpm 10 or higher
   - wrangler 3 or higher (npm install -g wrangler@latest)

   Install strategy:
   - On macOS:
     - If `brew` exists, use it: `brew install node pnpm`
     - If `brew` is missing AND you have permission, install Homebrew
       via the official curl script from brew.sh and re-try.
     - If user denies brew install, fall back to fnm or volta (download
       from official sources, install Node 20+ in user space, then
       corepack enable pnpm).
   - On Linux: use apt/dnf/pacman per the distro; or fnm/volta in
     user space if no root.
   - On Windows: use winget or scoop.

   After each install, verify with `--version` and report.

   wrangler: install globally with `npm install -g wrangler@latest`
   (or `pnpm add -g wrangler@latest`). Verify with `wrangler --version`.

3. CLOUDFLARE ACCESS.

   Ask me for:
   - My Cloudflare account ID (32-char hex, visible at
     dash.cloudflare.com -> any account -> right sidebar)
   - A Cloudflare API token with these permissions:
       Workers Scripts: Edit
       Workers Routes: Edit
       D1: Edit
       R2: Edit (Object + Bucket)
       Vectorize: Edit
       Queues: Edit
       Workers AI: Read
       Account Settings: Read
     Create at: dash.cloudflare.com -> profile -> API Tokens ->
     Create Token. Use the "Edit Cloudflare Workers" template as a
     starting point, then add the others.

   DO NOT echo these back, save them in cleartext, or commit them.
   Stash them in env vars for this session only:
     export CLOUDFLARE_ACCOUNT_ID=...
     export CLOUDFLARE_API_TOKEN=...

   Verify the token works:
     CLOUDFLARE_API_TOKEN=$TOKEN wrangler whoami
   Expected: shows my email + account list. If it shows an error,
   walk me through fixing the token (most common: missing scope).

4. CONFIRM STORAGE AVAILABILITY.

   Ask me where to put my town folder. Default: ~/Documents/my-town.
   Don't create the folder yet (Prompt B does that). Just verify the
   PARENT directory exists and is writable.

5. REPORT BACK.

   Single line per item, in this exact format:

     Agent host:     <name>
     git:            <version>
     node:           <version>
     pnpm:           <version>
     wrangler:       <version>
     Cloudflare:     <account name, masked id like 5369****7728>
     Town folder:    <chosen path, parent verified>
     Status:         READY FOR PROMPT B  (or BLOCKED: <reason>)

If anything is BLOCKED, name the blocker and what I need to provide
or decide. Then stop. Don't proceed to Prompt B.

What you should NOT do in this prompt:
- Clone any of the Office Town repos
- Run any wrangler create/deploy commands
- Modify ~/.claude/ or any host config
- Save credentials to disk

Total expected time: 5-15 minutes depending on what's already installed.
```

---

## Prompt B — Install Office Town

After Prompt A reports `READY FOR PROMPT B`, paste this. It does the actual Office Town install end-to-end.

```
You completed Office Town prerequisites in the previous prompt. The
toolchain is installed, Cloudflare credentials are in env vars
(CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN), and you know which
agent host I'm using.

REMINDER OF WHAT YOU ARE INSTALLING (4 things, into MY EXISTING host):

  1. CLOUD BACKEND -> 5 Cloudflare Workers deployed to my CF account
                       (uses my CLOUDFLARE_API_TOKEN; creates resources
                       under my account ID; ~$2-5/month)
  2. PLUGIN CONTENT -> markdown agents/ + skills/ + commands/ + rules/
                       laid into MY agent host's config dir
                       (~/.claude/ for Claude Code,
                        ~/.config/goose/ for Goose, etc.)
                       NOT into a new "office-town" directory.
  3. TEMPLATE FOLDER -> github.com/jezweb/office-town cloned to my
                       chosen path (typically ~/Documents/my-town).
                       Contains 4 buildings + 11 wiki collection dirs.
  4. MCP REGISTRATIONS -> 4 MCP servers added to MY host's config,
                       pointing at the 4 worker URLs from #1, each
                       authenticated with the same bearer token.

WHAT YOU ARE NOT DOING:
- NOT installing Goose (unless my host IS Goose; you checked in Prompt A)
- NOT installing any new "office-town" CLI — no such command exists
- NOT creating a sandbox/container/venv called "office-town"
- NOT replacing my agent host with something else

The user is still chatting with you (Claude Code, Goose, or whatever
host you actually are) — Office Town doesn't change that. After all 4
things above are installed, the user will keep talking to YOU, but you
will now have access to 4 new MCP servers, and the agent files
(@boss, @librarian, etc.) will be available for @-mention.

Source repos (all public on github.com/jezweb):
- office-town          (template + methodology)
- office-town-cloud    (Cloudflare Workers backend)
- office-town-plugin   (Open Plugin Spec plugin — agents/skills/recipes)
- office-town-pack-knowledge  (17 portable concepts to seed wiki)

Procedure:

1. CLONE THE CLOUD REPO + DEPLOY BACKEND.

   a. git clone https://github.com/jezweb/office-town-cloud
      ~/src/office-town-cloud (or wherever you prefer; not the town
      folder itself).

   b. cd into the cloned repo. pnpm install — the workspace root is
      the REPO ROOT (pnpm-workspace.yaml lists `packages/*`). Don't
      cd into a subfolder before installing.

   c. Generate a 32-byte hex MCP bearer token:
        openssl rand -hex 32
      Save to keychain (macOS: `security add-generic-password`) or
      a .env file in the cloned repo with key MCP_BEARER_TOKEN.
      Remember this value — you'll set it as a wrangler secret AND
      hand it to my agent host config in step 3.

   d. Create the D1 database:
        wrangler d1 create office-town-d1
      Patch the returned database_id into
      packages/core/wrangler.jsonc (the d1_databases section).

   e. Run migrations against the remote D1:
        cd packages/core
        wrangler d1 migrations apply office-town-d1 --remote
      Expect 4 migration files (0000-0003) to run.

   f. Create R2 buckets (all four):
        wrangler r2 bucket create office-town-wiki
        wrangler r2 bucket create office-town-wiki-preview
        wrangler r2 bucket create office-town-files
        wrangler r2 bucket create office-town-files-preview

   g. Create Vectorize index:
        wrangler vectorize create office-town-vec --dimensions=768 --metric=cosine

   h. CRITICAL: Create metadata indexes BEFORE any worker is deployed.
      Vectorize won't retroactively index existing vectors. Run:
        wrangler vectorize create-metadata-index office-town-vec --property-name=collection --type=string
        wrangler vectorize create-metadata-index office-town-vec --property-name=slug --type=string
        wrangler vectorize create-metadata-index office-town-vec --property-name=entry_id --type=string
      Verify with `wrangler vectorize info office-town-vec`.

   i. Create the indexing queue:
        wrangler queues create office-town-index

   j. Set the MCP bearer token as a wrangler secret on the core worker:
        cd packages/core
        echo -n "$MCP_BEARER_TOKEN" | wrangler secret put MCP_BEARER_TOKEN
      (The `echo -n` prevents a trailing newline; SMTP2Go and similar
      services parse tokens strict.)

   k. DEPLOY in this order (core first; the MCPs service-bind to it):
        cd packages/core      && wrangler deploy
        cd ../mcp-wiki        && wrangler deploy
        cd ../mcp-browser     && wrangler deploy
        cd ../mcp-devops      && wrangler deploy
        cd ../mcp-email       && wrangler deploy

      Each MCP worker also needs its own MCP_BEARER_TOKEN secret:
        echo -n "$MCP_BEARER_TOKEN" | wrangler secret put MCP_BEARER_TOKEN
      (run from each mcp-* package dir before its deploy).

   l. Verify health endpoints. Record the workers.dev URLs each
      deploy printed; for each, curl <url>/health and expect HTTP 200
      with a JSON body containing `"status":"ok"`.

   m. Verify the wiki API works:
        curl -H "Authorization: Bearer $MCP_BEARER_TOKEN" \
             <core-url>/api/wiki/collections
      Expect 11 default collections.

   If any wrangler command errors:
   - "Authentication error" -> token is missing a scope; fix it
   - "Already exists" -> idempotent, continue
   - "No D1 binding" -> wrangler.jsonc database_id wasn't patched
   - "Vectorize metadata index already exists" -> idempotent, continue
   - Anything else: paste full error to me; diagnose; don't blindly retry

2. SET UP THE TOWN FOLDER.

   git clone https://github.com/jezweb/office-town <my chosen path>
   cd into it. Confirm the 4 building folders exist:
     buildings/office/AGENTS.md
     buildings/library/AGENTS.md
     buildings/workshop/AGENTS.md
     buildings/lookout/AGENTS.md
   And the roles at roles/{boss,librarian,worker,scout}.md.

3. WIRE THE PLUGIN INTO MY AGENT HOST.

   The plugin's source is github.com/jezweb/office-town-plugin. Clone
   it to a stable path:
     git clone https://github.com/jezweb/office-town-plugin ~/src/office-town-plugin

   Then make its contents available to my host:

   - If host is Claude Code:
     - Symlink or copy the plugin's agents/, skills/, commands/, rules/
       into ~/.claude/ (respect existing files — don't overwrite).
     - Use `claude mcp add` for the 4 MCP servers:
         claude mcp add office-town-wiki    \
           --transport http <core-url>/mcp/wiki      \
           --header "Authorization: Bearer $MCP_BEARER_TOKEN"
         claude mcp add office-town-browser \
           --transport http <mcp-browser-url>/mcp    \
           --header "Authorization: Bearer $MCP_BEARER_TOKEN"
         claude mcp add office-town-devops  \
           --transport http <mcp-devops-url>/mcp     \
           --header "Authorization: Bearer $MCP_BEARER_TOKEN"
         claude mcp add office-town-email   \
           --transport http <mcp-email-url>/mcp      \
           --header "Authorization: Bearer $MCP_BEARER_TOKEN"
     - If the CLI form is different in this Claude Code version, run
       `claude mcp --help` and adapt.

   - If host is Goose:
     - goose plugin install jezweb/office-town-plugin
     - goose plugin install jezweb/office-town-pack-knowledge
     - Edit ~/.config/goose/config.yaml (or use `goose mcp add`)
       to add the same 4 streamable-HTTP MCP servers.

   - If host is something else: read its plugin/MCP docs and adapt.
     The plugin's .plugin/plugin.json is Open Plugin Spec compliant.

4. SEED THE WIKI WITH STARTER KNOWLEDGE.

   git clone https://github.com/jezweb/office-town-pack-knowledge ~/src/office-town-pack-knowledge

   Copy the concepts into my town's wiki:
     mkdir -p <town-path>/wiki/knowledge
     cp -r ~/src/office-town-pack-knowledge/concepts/* \
           <town-path>/wiki/knowledge/

   These are 17 portable agent concepts + 35 coding gotchas. They
   become readable by all agents on this town.

5. SMOKE TEST.

   a. Open my agent host. Call the wiki MCP directly to create a
      test contact:

        wiki.create with input:
        {
          "collection": "contacts",
          "slug": "test-smoke",
          "frontmatter": {
            "name": "Test Person",
            "kind": "contact"
          },
          "body": "Created during initial Office Town install smoke test."
        }
      Expect a 201-shaped response.

   b. Call wiki.search "Test Person" and confirm a hit comes back.

   c. Open a new chat. @-mention boss (or the host's equivalent —
      Claude Code uses agent files in ~/.claude/agents/, mention via
      `@boss` or whatever the host syntax is). Ask: "who's on this
      town?". The boss should respond coherently, knowing about the
      4 buildings and the 4 default roles.

   d. (Optional) Delete the test contact to keep the wiki clean:
        wiki.delete contacts/test-smoke

6. REPORT BACK.

   Print exactly these lines:

     Office Town deployed successfully.

     Workers:
       core:    <url>/health => 200
       wiki:    <url>/health => 200
       browser: <url>/health => 200
       devops:  <url>/health => 200
       email:   <url>/health => 200

     MCP bearer token: stored at <keychain key or .env path>
     Town folder:      <path>, 4 buildings present
     Plugin wired:     <host> via <how>
     Wiki seeded:      knowledge/ has <N> concepts

     Estimated monthly cost: ~$2-5 USD at typical SMB volume.
       Variables: Vectorize queries, Workers AI embeddings, Queue
       messages. Other services usually inside free tier.

     Try this next:
       Open my agent host. @mention the librarian. Ask it to
       "extract everything I know about [my main client]". It will
       walk me through capturing their first wiki entries.

CONSTRAINTS:
- Never delete D1 databases, R2 buckets, or the Vectorize index
  without asking me first.
- If a wrangler command would exceed 60s, tell me it's running and
  give a rough ETA.
- If any deploy fails after 2 retries, stop. Don't keep retrying.
  Paste the full error and your hypothesis.
- DO NOT install Goose unless Goose IS my host (you established this
  in Prompt A).
- DO NOT save my credentials to a committed file or any path under
  a git-tracked directory.

Total expected time: 10-15 minutes if Prompt A was successful.
```

---

## Connecting a second machine

If you already deployed once and want a second device (laptop + desktop, work + personal Mac, etc.) on the same town:

```
You are wiring this new machine to an existing Office Town deployment.
Don't deploy any workers — they're already running. Just install the
host-side bits.

What I'll provide:
- The base URL of my office-town-core worker (e.g.
  https://office-town-core.xxx.workers.dev or app.<my-domain>)
- The URLs of my 3 other MCP workers (mcp-wiki/browser/devops/email)
- My MCP_BEARER_TOKEN (treat as a secret; store in env or keychain)
- Local town folder path (default: ~/Documents/my-town)

Procedure:
1. Detect my agent host (same as Prompt A step 1).
2. Toolchain: only git is required for this. No wrangler needed —
   we're not deploying anything.
3. Clone the template:
     git clone https://github.com/jezweb/office-town <path>
4. Clone the plugin to a stable path:
     git clone https://github.com/jezweb/office-town-plugin ~/src/office-town-plugin
5. Wire the plugin contents into my host (~/.claude/ for Claude Code,
   or `goose plugin install` for Goose). Same as Prompt B step 3.
6. Wire the 4 MCP servers via `claude mcp add` or `goose mcp add`.
7. Smoke test: from agent host, call wiki.search "" and confirm I get
   real entries back (proves I'm connected to the existing town's data).

Report: which town, which host, which path on this machine.
```

---

## Bonus — claim your `.town` domain

`.town` is a real TLD. Cloudflare sells it for **about $30/yr** with no markup or renewal hikes — go to your Cloudflare dashboard → **Domains → Registration → Register Domains** and search.

Some other registrars do first-year promo pricing (~$12 USD) but renew at $55+/yr — always check renewal price before clicking buy. Cloudflare wins year-2 onwards.

Bonus of Cloudflare Registrar: DNS is already on Cloudflare → no nameserver swap needed when wiring custom worker domains.

Heads-up: short / brand-name `.town` domains (e.g. `office.town`, single-word company names) are mostly taken — usually defensive registrations from 2014. Check availability before getting attached.

After you register, ask your agent:

```
I registered <yourbusiness>.town. Wire it as a custom domain for my
Office Town Cloud deployment:
- <yourbusiness>.town -> office-town-landing-or-redirect (optional)
- app.<yourbusiness>.town -> office-town-core
- download.<yourbusiness>.town -> (optional) GitHub Releases redirect

You know how to add a Cloudflare zone, update nameservers at my
registrar, and bind worker custom domains. The pattern is in
office-town-cloud/packages/core/wrangler.jsonc routes section.
```

## Why this works

Modern agents already know wrangler, pnpm, MCP, Cloudflare APIs. Office Town is just naming a specific pattern. By splitting prerequisites from install, you can audit between stages and the agent doesn't get confused mid-flow about whether to install Goose or not.

If something goes wrong, copy the failing step back to your agent. It's usually a per-account quirk (Workers AI not enabled, account billing not active, etc.) that the agent can diagnose by reading Cloudflare's error response.

## Help / problems

File an issue at https://github.com/jezweb/office-town/issues with:
- Which agent you used (model + version)
- Which prompt(s) you ran (A, B, second-machine)
- What it produced (paste the full transcript or the failing step)

## Licence

MIT. © 2026 Jezweb Pty Ltd.
