# Install Office Town

Office Town adds **team-shaped capabilities** to your [Goose](https://block.github.io/goose/) installation: addressable role agents, a Cloudflare-backed wiki that replaces Goose's built-in Memory, MCP gateway servers (wiki, files, email, cron, voice, workflows — plus an opt-in code sandbox), interactive apps that run inside Goose Desktop, and a local cortex folder you can open in Finder.

It installs in two halves — a **cloud** worker (all the Cloudflare bindings) and the **local** wiring on your Mac (Goose config + the sync daemon + the apps + OfficeCLI). Two ways to do the cloud half (button or agent); the local half is always one pasted line.

## The easiest path — the Deploy button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud)

One click — **no API token, no Docker.** Cloudflare signs you in (OAuth), clones this repo into your GitHub account, provisions the resources, and builds + deploys on its own infra.

1. **Click the button.** You'll need a **GitHub account** (it makes you a copy of the backend) and a **Cloudflare account** (free-tier is fine — the default config is container-free).
2. In the deploy form, set Vectorize **Dimensions `768`** and **Metric `cosine`** (Cloudflare's config schema can't carry those, so they're entered by hand). Leave everything else blank — the worker mints its own `MCP_BEARER_TOKEN` on first request.
3. ~2-3 minutes later you have a worker URL. Open `<your-worker-url>/dashboard/connect`, click **Claim this install**, and paste the one-liner it gives you to wire Goose (see [Wire this Mac](#2-wire-this-mac)).

> If the button errors with **"failed to get repository contents"**, use the agent or CLI path below instead — neither depends on Cloudflare's repo-fetch.

## Prerequisites (agent / CLI paths)

- **Goose** — https://block.github.io/goose/ (Desktop or CLI).
- **A Cloudflare account** — the default install is **free-tier** (D1, R2, Vectorize, Queues, Workers AI, Browser Rendering and Images all have free tiers). For a client box this is usually a fresh account the client owns.
- **A Cloudflare credential** — `wrangler login` (one browser click, no token) **or** a **Workers-deploy API token** (dashboard → My Profile → API Tokens; best for headless / client boxes).
- **Node + git**.

**Only if you opt into the code sandbox** (`--with-sandbox` — cloud code execution, off by default):

- The account on **Workers Paid** — Cloudflare Containers aren't free-tier.
- **Docker running** — the first deploy builds the Sandbox container locally.

You rarely need it: a local Goose agent already runs Python/Node/Bash via its own shell — faster, and it can see your `~/OfficeTown/` files directly. Leave it off unless you specifically want *isolated cloud* execution.

## The agent path — hand it to a Goose agent

Skip the GitHub fork and let the agent do the local half too. On the box, set a credential, open Goose, and paste a prompt. The **agent** clones the repo, reads the skill, and does everything else.

```bash
# in a terminal on the box, before you open Goose — pick ONE:
wrangler login                                     # browser click, no token (simplest)
# …or, for headless / client boxes:
export CLOUDFLARE_API_TOKEN='<your workers-deploy token>'
export CLOUDFLARE_ACCOUNT_ID='<your account id>'   # if the token sees more than one account
```

Then, in Goose, paste:

```
Install Office Town on this Mac. The installer lives at
github.com/jezweb/office-town-cloud — clone it and follow
skills/setup-office-town/SKILL.md end to end: provision the Cloudflare
worker, wire this Mac, install OfficeCLI, seed the cortex, and verify.

Cloudflare account id: <your-account-id>
I'm authed to Cloudflare (wrangler login, or CLOUDFLARE_API_TOKEN in the env).
Industry pack: ask   (or: trades / professional-services / creative / web-agency / bookings-services)
Code sandbox: off (free-tier default — only add it if I ask)

Check with me before anything irreversible or account-level.
```

That's it — the agent takes it from there.

### Or run the recipe yourself (headless / CLI)

If you'd rather drive it from the command line than chat to an agent, clone first and run the recipe:

```bash
git clone https://github.com/jezweb/office-town-cloud && cd office-town-cloud
export CLOUDFLARE_API_TOKEN='<your workers-deploy token>'
goose run --recipe recipes/install-office-town.yaml \
  --params account_id=<your-account-id> pack=ask
```

Either way, Goose follows the [`setup-office-town`](skills/setup-office-town/SKILL.md) skill end to end:

1. **Provision** — runs [`scripts/provision.sh`](scripts/provision.sh): creates R2 / Vectorize (768-dim, cosine) / Queue / D1, writes the new D1 id into `wrangler.jsonc`, then `wrangler deploy` (binding AI / Images / Browser / Email). Idempotent — safe to re-run. With `--with-sandbox` it also injects the container bindings and builds the Sandbox container.
2. **Mint the bearer** — sets a `MCP_BEARER_TOKEN` secret it controls.
3. **Wire this Mac** — runs the worker's own `connect.sh`: bootstraps the Goose CLI if missing, disables Goose's built-in Memory (the `wiki` MCP replaces it), wires the `office-town-*` MCPs into `~/.config/goose/config.yaml` (six by default, plus `sandbox` when the deployment has it), installs the [plugin](https://github.com/jezweb/office-town-plugin) (roles + skills + recipes + hooks) and the [officetowd](https://github.com/jezweb/officetowd) sync daemon, creates `~/OfficeTown/`, runs a first bisync, and auto-installs the apps onto your Apps page.
4. **Install OfficeCLI** — Word/Excel/PowerPoint support via the [`install-officecli`](https://github.com/jezweb/goose-skills/tree/main/skills/install-officecli) skill.
5. **Seed the cortex** — owner voice, your business entity, and the industry pack matching your work (`pack=ask` lets the agent pick with you).
6. **Verify** — exercises the tools, confirms the apps render, the daemon syncs.

`pack=` can be set up front: `trades` · `professional-services` · `creative` · `web-agency` · `bookings-services`. Add `with_sync=false` for an AI-access-only box with no local folder, or `with_sandbox=true` to add the cloud code sandbox (Workers Paid + Docker).

## Doing it by hand

Prefer to drive each step? The same two halves, run yourself:

### 1. Provision the cloud

```bash
npm install
bash scripts/provision.sh                  # free-tier default
# or: bash scripts/provision.sh --with-sandbox   # adds the code sandbox (Workers Paid + Docker)
```

Prints your worker URL (`https://office-town.<subdomain>.workers.dev`). Set a bearer you control:

```bash
MCP_BEARER="$(openssl rand -hex 32)"
printf '%s' "$MCP_BEARER" | npx wrangler secret put MCP_BEARER_TOKEN
```

### 2. Wire this Mac

```bash
curl -fsSL "<your-worker-url>/connect.sh" \
  | WORKER_URL='<your-worker-url>' MCP_BEARER="$MCP_BEARER" bash
```

(`WITHOUT_SYNC=1` to skip the local folder + daemon. The dashboard's `/dashboard/connect` page also hands you this line pre-filled.)

### 3. Office documents (optional)

Install [OfficeCLI](https://github.com/jezweb/goose-skills/tree/main/skills/install-officecli) for `.docx`/`.xlsx`/`.pptx` — it registers as a Goose MCP server. The `goose-skills` repo has the checksum-verified install skill.

### 4. Smoke test

Restart Goose, then in a fresh chat at `~/OfficeTown/`:

```
wiki(action: 'list', collection: 'contacts')     # returns cleanly
```

Then say **"hi"** — an agent welcomes you and offers a few ways to start. The fastest first move: drop a pile of real documents into `~/OfficeTown/inbox/` and ask it to go through them.

## What you get

**MCP gateway tools** (one per server, each with multiple actions — six by default, plus the opt-in `sandbox`):

| Tool | Purpose |
|---|---|
| `wiki` | Memory layer — write / get / read / search (FTS5 + vector hybrid) / update / supersede / archive / link / list / tree / recent / collections / attach. Replaces Goose Memory. Every mutation needs `why:` (audit). |
| `files` | Everything non-markdown — upload / download / share / publish / convert (any-doc → markdown) / transform_image / fetch_with_js / screenshot / generate_image (FLUX) / speak (Aura-2). |
| `email` | `send` (Cloudflare Email Routing) + `draft`. Inbound auto-filed at `wiki/research/`. |
| `cron` | Recurring + one-off scheduled agent work (7 actions). |
| `voice` | transcribe (Nova-3) / synthesize (Aura-2, 40 voices) / list_voices / call_*. |
| `sandbox` | *(opt-in, `--with-sandbox`)* Isolated **cloud** code execution — Python/Node/TS/Bash (Cloudflare Containers, Workers Paid). Off by default; a local Goose agent runs code via its own shell. |
| `workflows` | The visual + app surface — `cortex_ui`, `create_app`, `create_share_app`, `launch_app`, `install_pack`. |

**Plus**: the dashboard (wiki browser, cron, files, published pages, apps, packs), inbound email handler, the apps on your Apps page, and the `officetowd` daemon mirroring `~/OfficeTown/` to/from R2.

**Goose's Memory extension is disabled** — the `wiki` MCP replaces it (see [`docs/MEMORY-COMPARISON.md`](docs/MEMORY-COMPARISON.md)).

## Connecting a second machine

Already running Office Town? On the new Mac, run the same `connect.sh` with your existing worker URL + bearer — it wires Goose, the daemon, and the apps against the deployment that's already up. No need to re-provision. The daemon gives every machine the same `~/OfficeTown/` folder, bisynced through your worker.

## Bonus: claim your `.town` domain

`.town` is a real TLD (~$30/yr at Cloudflare → Domains → Register). After registering, any capable agent can wire it as a custom domain on your worker via the Cloudflare-pack MCPs.

## Help

File an issue at https://github.com/jezweb/office-town/issues — include which step failed and the output.

## Licence

MIT. © 2026 Jezweb Pty Ltd.
