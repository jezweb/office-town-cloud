---
name: setup-office-town
description: Stand up a complete Office Town box from scratch — provision the Cloudflare worker (R2/Vectorize/Queue/D1/AI/Images/Browser/Email/Containers), mint the bearer, wire Goose + the officetowd sync daemon + the apps onto this Mac, install OfficeCLI for Word/Excel/PowerPoint, and seed the cortex. Run this when deploying a new client box or a fresh personal instance. The Cloudflare "Deploy to Cloudflare" button does NOT work for this repo (it can't read private/multi-binding contents) — this skill is the supported installer.
---

# Setup Office Town

The end-to-end installer an agent runs on the box itself. Two halves: **cloud** (a Cloudflare worker with all its bindings) and **local** (Goose config + the sync daemon + the apps + OfficeCLI + a seeded cortex). You drive both. The human supplies the Cloudflare account choice and connector consent; everything else you do and verify.

## When to invoke

- Deploying a **new client box** (a Mac mini going into a business) — usually a fresh, dedicated Cloudflare account so the client owns their data.
- Standing up a **fresh personal instance**.
- The user tried the Cloudflare deploy button and it failed with "failed to get repository contents" — that button can't handle this repo; use this skill instead.

Don't run on a box that's already connected (check `~/.config/goose/config.yaml` for `office-town-*` MCPs first — if they're there, the box is set up; use the dashboard to reconnect or re-seed instead).

## What you're building

```
  Cloudflare account                    This Mac
  ┌────────────────────────┐            ┌─────────────────────────────┐
  │ office-town worker      │            │ Goose CLI + 7 office-town    │
  │  R2 ×4  Vectorize  D1   │◀──bearer──▶│  MCPs in config.yaml         │
  │  Queue  AI  Images      │            │ officetowd daemon  ←bisync→  │
  │  Browser  Email  DO     │            │ ~/OfficeTown/ cortex folder  │
  └────────────────────────┘            │ OfficeCLI (docx/xlsx/pptx)   │
       provision.sh                      │ apps on the Apps page        │
                                         └─────────────────────────────┘
                                              connect.sh + this skill
```

## Procedure

### 0. Preflight

**You (the agent) do this — the human only supplied a prompt + the account/token.** Get the installer onto the box: clone `https://github.com/jezweb/office-town-cloud` if you're not already in it, and work from its root.

Then make sure the basics are in place for *this* box, and tell the human (don't work around it) if something's missing:

- **Node** and a working **Cloudflare token** for the right account (`CLOUDFLARE_API_TOKEN` in the env; set `CLOUDFLARE_ACCOUNT_ID` too if the token sees more than one account). `provision.sh` fails clearly if the token's wrong — read the error.
- **Docker running** — normally needed because the deploy builds the Sandbox container. If it's not running and the deploy needs it, you'll see a clear error; start Docker and re-run (idempotent).
- The account must be on **Workers Paid** (Containers + Browser Rendering aren't free-tier). Can't be pre-checked cheaply — surfaces as a deploy error if not.

For a client box the account is usually a fresh one the client owns and has invited Jez into. Confirm which account before you provision — that's a checkpoint, not a default.

### 1. Provision the cloud (provision.sh)

```bash
npm install            # once
bash scripts/provision.sh
```

This creates the R2 buckets / Vectorize index / Queue / D1 (writing the new D1 id into `wrangler.jsonc`), then `wrangler deploy` — which builds the Sandbox container and binds AI / Images / Browser / Email / the Durable Object. It's **idempotent**: re-run it freely; existing resources are skipped. It prints the worker URL on success (`https://office-town.<subdomain>.workers.dev`). Capture it:

```bash
WORKER_URL="$(bash scripts/provision.sh | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)"
```

### 2. Mint the bearer

The worker accepts an explicit `MCP_BEARER_TOKEN` secret (it wins over the auto-generated one). Generate one you control, so you know the value without querying anything:

```bash
MCP_BEARER="$(openssl rand -hex 32)"
printf '%s' "$MCP_BEARER" | npx wrangler secret put MCP_BEARER_TOKEN
```

(Already-deployed box where you don't know the token? Read the auto-generated one back instead:
`npx wrangler d1 execute office-town-d1 --remote --json --command "SELECT value FROM worker_config WHERE key='auto_bearer'"`.)

### 3. Wire this Mac (connect.sh)

The worker serves its own installer. Run it with the URL + bearer from above:

```bash
curl -fsSL "$WORKER_URL/connect.sh" | WORKER_URL="$WORKER_URL" MCP_BEARER="$MCP_BEARER" bash
```

That bootstraps the Goose CLI if missing, disables Goose's built-in Memory (the `wiki` MCP replaces it), wires the 7 `office-town-*` MCPs into `~/.config/goose/config.yaml`, installs the office-town-plugin (roles + skills + recipes + hooks), installs the **officetowd** daemon, creates `~/OfficeTown/`, runs a first bisync, and auto-installs the apps onto the Apps page. (`WITHOUT_SYNC=1` for an AI-access-only box with no local folder.)

### 4. Install OfficeCLI

Microsoft Office files are table stakes for a business box. Compose with the `install-officecli` skill (in the goose-skills repo): it fetches the checksum-verified OfficeCLI binary and registers it as an MCP gateway tool. After it runs:

```bash
officecli --help >/dev/null && echo "officecli ok"
```

### 5. Seed the cortex (judgement)

A blank cortex is a cold start. Seed the minimum that makes the first session useful — this is the part you reason about, not a fixed script:

- **Owner voice** — `wiki/owner/voice.md` (how the business writes; load-bearing for any drafted output). Ask the human for a few real emails/docs to derive it, or draft a first pass and have them correct it.
- **The business entity** — one org entry under `wiki/orgs/<slug>/entity.md`.
- **A pack** — pick the industry pack matching the business (trades / professional-services / creative / web-agency / bookings-services) so the right apps + starter collections land. See the packs table in the repo README.
- **Personas** — the office-town-plugin roles. Seed only what the business needs day one; more can be added later.

Don't over-seed. The cortex grows from real work; seeding is just enough scaffolding that session one isn't "what's going on?".

### 6. Verify (don't declare done on a summary)

```bash
# MCPs respond
goose run --no-session -q -t "List the wiki collections and the installed apps, then stop." --with-builtin developer
# daemon alive + folder syncing
ls ~/OfficeTown/ && pgrep -fl officetowd
# apps visible
curl -fsS -H "Authorization: Bearer $MCP_BEARER" "$WORKER_URL/api/apps/" | head
# office files work
officecli --help >/dev/null && echo "office ok"
```

Open the dashboard (`$WORKER_URL/dashboard`) and the Apps page in a browser; confirm the apps render and the cortex has the seeded entries. **Inspect, don't assume** — a green provision step is not a working box.

## Verification checklist

- [ ] `provision.sh` completed and printed a worker URL
- [ ] `MCP_BEARER_TOKEN` secret set; you know the value
- [ ] `~/.config/goose/config.yaml` has the 7 `office-town-*` MCPs
- [ ] `officetowd` is running and `~/OfficeTown/` exists with synced content
- [ ] OfficeCLI responds (`officecli --help`)
- [ ] Apps appear on the Apps page; dashboard loads
- [ ] Cortex has owner voice + the business entity + the chosen pack
- [ ] A `goose run` smoke prompt actually used the MCP tools (not just described them)

## Failure modes

| Symptom | Cause / fix |
|---|---|
| `provision.sh` dies at deploy | Account not on Workers Paid, or Docker not running, or a multi-account token without `CLOUDFLARE_ACCOUNT_ID`. |
| `could not determine the D1 database id` | wrangler's skills banner polluted stdout — the script greps the uuid to dodge it; re-run, it's idempotent. |
| connect.sh: goose tools don't appear | Bearer mismatch — confirm the `MCP_BEARER` you passed equals the secret you set in step 2. |
| Apps page empty | First daemon sync hasn't run / reconciled — `pgrep officetowd`, wait one sync cycle, re-check. |
| deploy button "failed to get repository contents" | Expected — that button can't read this repo. This skill is the path. |

## See also

- `scripts/provision.sh` — the cloud-side script this skill runs (idempotent)
- `install-officecli` (goose-skills) — step 4
- `recipes/install-office-town.yaml` — a launcher that runs this skill with params
- Repo `README.md` — packs table, MCP gateway reference, the connect flow
- `~/Documents/.jez/office-town-client-deployment-playbook.md` — the commercial/legal/ops wrapper around the technical setup

## Last updated

2026-06-01 — initial author. provision.sh proven end-to-end on the main account; this skill orchestrates provision → bearer → connect → OfficeCLI → seed → verify.
