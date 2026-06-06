# office-town-cloud — agent notes

Backend Worker + the Office Town MCP gateways. The model + project state live outside this
repo (local, not committed): `~/Documents/.jez/office-town/NORTH-STAR.md` (the point + the
buildings/wiki model) and `STATE-*.md` (current deployment).

## Gotchas
- **Code sandbox (Cloudflare Containers) is OPT-IN** — `bash scripts/provision.sh --with-sandbox`. Default is free-tier (no Containers, no Docker, no Workers Paid). Containers are the only thing that needs Workers Paid; R2 + Browser Rendering also need a payment method *enabled* on a fresh account even though usage is free-tier.
- **Empty R2 buckets before redeploying onto a reused account** — officetowd syncs R2 directly, so old objects bleed into a "fresh" town. wrangler has no bulk-empty; use the dashboard (bucket → Settings → Empty).
- **`wrangler d1 execute office-town-d1`** resolves the DB id from `wrangler.jsonc`'s binding, not by name — if the committed id ≠ the deployed id you get `7404`. Point the config at the real id first.
- **`officetowd resync`** = safe clean re-clone (drops the manifest). A plain bisync will re-upload local files if you `rm` the local folder without resetting the manifest.
- **The Goose "Add to Desktop" deep-link** creates a standalone `officetown` extension that goes stale when the worker URL/bearer changes — distinct from the connect.sh-wired `office-town-*` extensions. Remove it from `~/.config/goose/config.yaml` if it 404s.
- **Deploy via the recipe/skill or `provision.sh`**, not the bare "Deploy to Cloudflare" button for dev — the button can't provision Containers and clones into the user's GitHub.

## Repo restructure (planned, not built)
Extract the default town (`buildings/` + `wiki/` + `workflows/`) into a new `office-town-starter` repo; move demo example data out of `src/seeds/example-entries.ts` into a separate examples repo/flag; consolidate the `office-town-pack-*` repos. See NORTH-STAR.md.
