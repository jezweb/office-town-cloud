# Scripts

Provisioning + operations scripts for Office Town Cloud.

| Script | What it does |
|---|---|
| [`provision.sh`](provision.sh) | Stand up Office Town on a Cloudflare account — creates R2 / Vectorize / Queue / D1 (writing the new D1 id into `wrangler.jsonc`), then `wrangler deploy`. Idempotent: skips anything that already exists. Needs `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID` for a multi-account token), Docker running, and the account on Workers Paid. This is the cloud half of the install. |
| [`smoke-test.mjs`](smoke-test.mjs) | Hit a deployed worker's health + a few endpoints to confirm it's live. |

`provision.sh` is what the [`setup-office-town`](../skills/setup-office-town/SKILL.md) skill and the [`install-office-town`](../recipes/install-office-town.yaml) recipe run. The local-side wiring (Goose config, daemon, apps) is the worker's own `connect.sh` — see [`INSTALL.md`](../INSTALL.md).
