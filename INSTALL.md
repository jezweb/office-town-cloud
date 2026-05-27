# Install Office Town

Office Town is a set of **capabilities you add to Goose**. It assumes you've already installed Goose Desktop or Goose CLI from https://block.github.io/goose/.

## Two steps

### 1. Deploy the backend (one click)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud)

Click that button. Cloudflare's flow signs you in (you don't need to create an API token), provisions D1 + R2 + Vectorize + Queue + Workers AI + Browser Rendering from `wrangler.jsonc`, and asks you for one required secret:

- **`MCP_BEARER_TOKEN`** — generate via `openssl rand -hex 32`. Keep this somewhere safe; you'll paste it into Goose's config.

The deploy form has optional fields too. Leave blank to skip those tools; you can add them later:

- `BETTER_AUTH_SECRET` — only if you'll use the dashboard's Google sign-in.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — same.
- `SMTP2GO_API_KEY` — for outbound email via the email MCP.
- `CF_API_TOKEN` — for the devops MCP (Cloudflare account operations).

~2 minutes later Cloudflare hands you a URL like `https://office-town-<you>.<account>.workers.dev`. Copy it. That's your **deployment URL**.

### 2. Wire it into Goose

Paste this prompt into any capable AI agent (Goose itself, Claude Code, Aider, Cline):

```
I want to add Office Town capabilities to my Goose installation.

Office Town is a content bundle (one Cloudflare Worker + Goose plugin
+ template) that installs INTO an existing Goose. NOT a Goose
replacement.

I'll provide:
- My Cloudflare deployment URL (just deployed via the Deploy to
  Cloudflare button)
- My MCP_BEARER_TOKEN (entered into the Cloudflare deploy form)
- A town folder path (default: ~/Documents/my-town)

GROUND RULES:
- Be transparent. Say what you're about to do.
- Ask before destructive ops or any software install.
- If Goose isn't installed: stop, point me at
  https://block.github.io/goose/.
- Don't echo or save credentials. Env vars only.

STEPS:

1. Check Goose is installed (`goose --version`). If not, stop.

2. Verify the deployment URL works:
     curl -s <URL>/health
   Should return {"status":"ok","service":"office-town",...}

3. Install Goose plugins:
     goose plugin install jezweb/office-town-plugin
     goose plugin install jezweb/office-town-pack-knowledge
   Verify with `goose plugin list`.

4. Edit ~/.config/goose/config.yaml. Show me the diff first. Add
   under `extensions:`:

       office-town-wiki:
         type: streamable_http
         url: <URL>/mcp/wiki
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>
       office-town-browser:
         type: streamable_http
         url: <URL>/mcp/browser
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>
       office-town-devops:
         type: streamable_http
         url: <URL>/mcp/devops
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>
       office-town-email:
         type: streamable_http
         url: <URL>/mcp/email
         headers:
           Authorization: Bearer <MCP_BEARER_TOKEN>

   Also disable Goose's built-in `memory` extension so it doesn't
   compete with the wiki MCP. Set `disabled: true` on the memory
   extension entry, or remove it.

5. Clone the town template to my chosen folder (default
   ~/Documents/my-town):
     git clone https://github.com/jezweb/office-town <town path>

   Seed the wiki with the knowledge pack — find where Goose
   installed it (try `goose plugin info office-town-pack-knowledge`)
   and copy its concepts/ into <town>/wiki/knowledge/.

6. Restart Goose (Desktop) or start a fresh CLI session.

7. SMOKE TEST in a fresh Goose chat at the town folder:
   a. Ask wiki.create to make a test entry in collection "contacts"
      with slug "smoke-test", frontmatter {name: "Test", kind: "contact"},
      body "Install smoke test."
   b. wiki.search "Test" — expect a hit.
   c. @boss "introduce the team" — expect coherent reply referencing
      the 4 buildings (office/library/workshop/lookout) and the 4
      default roles (boss/librarian/worker/scout).

8. Final report:

     Office Town installed for Goose.
       Deployment URL:    <URL>
       Town folder:       <path>
       Plugins:           office-town-plugin + office-town-pack-knowledge
       Wiki seeded:       <N> concepts in knowledge/

     Try: @librarian "extract everything I know about my biggest
     client" — the librarian will walk you through capturing their
     first wiki entries.

CONSTRAINTS:
- DO NOT install a different agent host. Goose is the host.
- DO NOT touch wrangler, pnpm, or your local Cloudflare account from
  here — the button already did all of that.
- Ask before editing config.yaml; show me the diff first.
```

The agent walks itself through the seven steps in about 5 minutes.

---

## Connect a second machine

Already have Office Town running and want to add a second Goose install on the same town?

Paste this:

```
I already have Office Town running. Wire this new Goose installation
to my existing deployment.

I'll provide:
- The deployment URL
- My MCP_BEARER_TOKEN
- A town folder path on this machine

Steps (no button click needed — the workers are already up):

1. Check Goose is installed.
2. curl -s <URL>/health — verify the deployment is reachable.
3. goose plugin install jezweb/office-town-plugin
4. goose plugin install jezweb/office-town-pack-knowledge
5. Edit ~/.config/goose/config.yaml — add the same 4 streamable_http
   extension entries (wiki/browser/devops/email under <URL>/mcp/<name>
   with Bearer <token>).
6. git clone https://github.com/jezweb/office-town <town path>.
7. Smoke test: open Goose in the town folder, ask wiki.search "" —
   should return entries from my existing town.
```

---

## Bonus: claim your `.town` domain

`.town` is a real TLD. Cloudflare sells it for about $30/yr at Dashboard → Domains → Registration → Register Domains. After registering, the devops MCP knows how to wire it as a custom domain on your worker — ask any agent: *"Wire app.<yourbusiness>.town as a custom domain for my office-town worker."*

(Short / brand-name `.town` domains are mostly taken from 2014 defensive registrations — check availability before getting attached.)

## Help / problems

File an issue at https://github.com/jezweb/office-town/issues. Include which agent ran the install (Goose / Claude Code / Aider) and the failing step.

## Licence

MIT. © 2026 Jezweb Pty Ltd.
