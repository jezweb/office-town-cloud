# Install Office Town

Office Town adds **team-shaped capabilities** to your [Goose](https://block.github.io/goose/) installation: addressable role agents, a Cloudflare-backed wiki that replaces Goose's built-in Memory, 7 MCP gateway servers (wiki, files, email, cron, voice, sandbox, workflows), interactive apps that run inside Goose Desktop, and a local cortex folder you can open in Finder.

It installs in two halves — a **cloud** worker (all the Cloudflare bindings) and the **local** wiring on your Mac (Goose config + the sync daemon + the apps + OfficeCLI). Goose does both for you.

> **Why not the "Deploy to Cloudflare" button?** It can't reliably provision this repo — the Containers binding and multi-resource setup trip its repo-fetch step ("failed to get repository contents"), and even when it works it only does the cloud half, leaving the local wiring to you. Goose running the installer does the whole thing.

## Prerequisites

- **Goose** — https://block.github.io/goose/ (Desktop or CLI).
- **A Cloudflare account on Workers Paid** — Containers + Browser Rendering aren't free-tier. For a client box this is usually a fresh account the client owns.
- **A Workers-deploy API token** for that account (dashboard → My Profile → API Tokens).
- **Docker running** — the first deploy builds the Sandbox container locally.
- **Node + git**.

## The shortest path — hand it to a Goose agent

This is the whole job for you: on the box, set the token, open Goose, and paste a prompt. The **agent** clones the repo, reads the skill, and does everything else.

```bash
# in a terminal on the box, before you open Goose:
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
My Workers-deploy token is in the CLOUDFLARE_API_TOKEN env var.
Industry pack: ask   (or: trades / professional-services / creative / web-agency / bookings-services)

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

1. **Provision** — runs [`scripts/provision.sh`](scripts/provision.sh): creates R2 / Vectorize (768-dim, cosine) / Queue / D1, writes the new D1 id into `wrangler.jsonc`, then `wrangler deploy` (which builds the Sandbox container and binds AI / Images / Browser / Email / the Durable Object). Idempotent — safe to re-run.
2. **Mint the bearer** — sets a `MCP_BEARER_TOKEN` secret it controls.
3. **Wire this Mac** — runs the worker's own `connect.sh`: bootstraps the Goose CLI if missing, disables Goose's built-in Memory (the `wiki` MCP replaces it), wires the 7 `office-town-*` MCPs into `~/.config/goose/config.yaml`, installs the [plugin](https://github.com/jezweb/office-town-plugin) (roles + skills + recipes + hooks) and the [officetowd](https://github.com/jezweb/officetowd) sync daemon, creates `~/OfficeTown/`, runs a first bisync, and auto-installs the apps onto your Apps page.
4. **Install OfficeCLI** — Word/Excel/PowerPoint support via the [`install-officecli`](https://github.com/jezweb/goose-skills/tree/main/skills/install-officecli) skill.
5. **Seed the cortex** — owner voice, your business entity, and the industry pack matching your work (`pack=ask` lets the agent pick with you).
6. **Verify** — exercises the tools, confirms the apps render, the daemon syncs.

`pack=` can be set up front: `trades` · `professional-services` · `creative` · `web-agency` · `bookings-services`. Add `with_sync=false` for an AI-access-only box with no local folder.

## Doing it by hand

Prefer to drive each step? The same two halves, run yourself:

### 1. Provision the cloud

```bash
npm install
bash scripts/provision.sh
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

**7 MCP gateway tools** (one per server, each with multiple actions):

| Tool | Purpose |
|---|---|
| `wiki` | Memory layer — write / get / read / search (FTS5 + vector hybrid) / update / supersede / archive / link / list / tree / recent / collections / attach. Replaces Goose Memory. Every mutation needs `why:` (audit). |
| `files` | Everything non-markdown — upload / download / share / publish / convert (any-doc → markdown) / transform_image / fetch_with_js / screenshot / generate_image (FLUX) / speak (Aura-2). |
| `email` | `send` (Cloudflare Email Routing) + `draft`. Inbound auto-filed at `wiki/research/`. |
| `cron` | Recurring + one-off scheduled agent work (7 actions). |
| `voice` | transcribe (Nova-3) / synthesize (Aura-2, 40 voices) / list_voices / call_*. |
| `sandbox` | Isolated code execution — Python/Node/TS/Bash (Containers-backed). |
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
