#!/usr/bin/env bash
# provision.sh — stand up Office Town on a Cloudflare account.
#
# Creates the resources office-town-cloud needs (R2 / Vectorize / Queue / D1),
# writes the new D1 id into wrangler.jsonc, and deploys.
# Idempotent: re-running skips anything that already exists.
#
# Run from the repo root after `npm install`.
#
# DEFAULT is free-tier — no Containers, no Docker. The sandbox MCP (cloud code
# execution) is OFF; a local Goose agent already runs code via its own shell.
# Pass --with-sandbox (or WITH_SANDBOX=1) to add it — that path needs Workers
# Paid + Docker, and injects the container bindings into wrangler.deploy.jsonc.
#
# Requires:
#   - CLOUDFLARE_API_TOKEN  (a Workers-deploy-capable token for the target account)
#   - CLOUDFLARE_ACCOUNT_ID (only if the token can see more than one account)
#   With --with-sandbox only:
#   - The account on **Workers Paid** (Cloudflare Containers are not free-tier)
#   - Docker running locally (the Sandbox container is built on deploy)
#
# This is the script the setup skill/recipe runs; the agent handles the judgement
# bits around it (which account, connector consent, verification).
set -uo pipefail

WITH_SANDBOX="${WITH_SANDBOX:-0}"
for arg in "$@"; do
  case "$arg" in
    --with-sandbox) WITH_SANDBOX=1 ;;
    --no-sandbox)   WITH_SANDBOX=0 ;;
  esac
done

WR="npx wrangler"
log()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- prerequisites ----------------------------------------------------------
[ -f wrangler.jsonc ] || die "run from the office-town-cloud repo root (no wrangler.jsonc here)"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die "set CLOUDFLARE_API_TOKEN (a Workers-deploy token for the target account)"
command -v node >/dev/null || die "node is required"
[ -d node_modules ] || { log "installing deps…"; npm install >/dev/null || die "npm install failed"; }
if [ "$WITH_SANDBOX" = "1" ]; then
  # Sandbox build needs Docker; flag it but don't gate — the deploy says so if missing.
  docker info >/dev/null 2>&1 || warn "Docker not running — --with-sandbox builds the Sandbox container and needs it; start Docker if the deploy fails (re-run is safe, this is idempotent)."
fi
log "Provisioning Office Town${CLOUDFLARE_ACCOUNT_ID:+ on account $CLOUDFLARE_ACCOUNT_ID} (sandbox: $([ "$WITH_SANDBOX" = "1" ] && echo on || echo off))"

# create a resource, tolerating "already exists"
cf_create() { # <description> <wrangler args...>
  local desc="$1"; shift
  local out
  if out="$($WR "$@" 2>&1)"; then ok "$desc"; return 0; fi
  if printf '%s' "$out" | grep -qiE "already exists|already created|already taken|already in use|conflict|duplicate|same name|11009"; then
    warn "$desc — already exists, skipping"; return 0
  fi
  printf '%s\n' "$out" >&2; die "$desc — failed (see above)"
}

# --- R2 buckets (name-based: no config change) ------------------------------
for b in office-town-wiki office-town-wiki-preview office-town-files office-town-files-preview; do
  cf_create "R2 bucket $b" r2 bucket create "$b"
done

# --- Vectorize: 768 dims / cosine (matches @cf/baai/bge-base-en-v1.5) -------
cf_create "Vectorize index office-town-vec" vectorize create office-town-vec --dimensions=768 --metric=cosine

# --- Queue ------------------------------------------------------------------
cf_create "Queue office-town-index" queues create office-town-index

# --- D1: create + capture the new database_id, write it into wrangler.jsonc --
log "Creating D1 office-town-d1…"
d1out="$($WR d1 create office-town-d1 2>&1 || true)"
dbid="$(printf '%s' "$d1out" | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
if [ -z "$dbid" ]; then
  # already exists — read the id back (grep the uuid; tolerates wrangler's banner noise)
  dbid="$($WR d1 info office-town-d1 --json 2>/dev/null | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
fi
[ -n "$dbid" ] || die "could not determine the D1 database id (create output above)"
ok "D1 office-town-d1 → $dbid"
node -e '
  const fs=require("fs"), f="wrangler.jsonc";
  let t=fs.readFileSync(f,"utf8");
  const before=t;
  t=t.replace(/("database_id":\s*")[0-9a-fA-F-]+(")/, `$1${process.argv[1]}$2`);
  fs.writeFileSync(f,t);
  process.exit(before===t?0:0);
' "$dbid"
ok "wrote D1 id into wrangler.jsonc"

# --- Deploy ------------------------------------------------------------------
# Default: deploy wrangler.jsonc as-is (free-tier, no container).
# --with-sandbox: inject the container bindings into wrangler.deploy.jsonc first.
if [ "$WITH_SANDBOX" = "1" ]; then
  node scripts/build-deploy-config.mjs || die "could not build the sandbox deploy config"
  log "Deploying with the code sandbox (first run builds the container — this is slow)…"
  depout="$($WR deploy -c wrangler.deploy.jsonc 2>&1)" || { printf '%s\n' "$depout" >&2; die "deploy failed — with --with-sandbox the common causes are: account not on Workers Paid (Cloudflare Containers), Docker not running, or CLOUDFLARE_ACCOUNT_ID needed for a multi-account token"; }
else
  log "Deploying (free-tier, no code sandbox)…"
  depout="$($WR deploy 2>&1)" || { printf '%s\n' "$depout" >&2; die "deploy failed — common causes: CLOUDFLARE_ACCOUNT_ID needed for a multi-account token, or an invalid CLOUDFLARE_API_TOKEN"; }
fi
printf '%s\n' "$depout"
url="$(printf '%s' "$depout" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)"
ok "Deployed${url:+: $url}"

# warm it once so the schema bootstraps + the bearer is minted
[ -n "$url" ] && curl -fsS "$url/health" >/dev/null 2>&1 || true

echo
ok "Done."
echo "Next: open ${url:-<your-worker-url>}/dashboard/connect to claim the install,"
echo "      copy the bearer token, and run the one-line connect command it shows"
echo "      (that wires Goose + the daemon + the apps). Then install OfficeCLI and"
echo "      seed the cortex — the setup skill walks the rest."
