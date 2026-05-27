---
title: officetowd — Go sync daemon spec (v1.1)
date: 2026-05-28
status: spec — ready for v1.1 implementation
---

# officetowd — local⇄R2 bisync daemon

Modelled on Goanna's `goannad`. Single binary that watches the user's local
`<town-path>/` folder and bisyncs to the office-town worker's R2 bucket.
Replaces Syncthing (too slow per Jez 2026-05-28) and `rclone mount` (too
fragile on macOS). v1.1 deliverable — not blocking v1.0.

## Why a daemon and not Syncthing/rclone

- **Syncthing** — too slow on the user's test (Jez 2026-05-28). Plus needs
  a peer to sync TO, and our peer is R2 (S3-compatible) not Syncthing-native.
- **rclone mount** — FUSE-mounting R2 means every read/write hits the network.
  Macros like `git status` in a mounted folder take seconds. Not
  acceptable for an interactive workspace.
- **mountpoint-s3** — similar problem; performance is read-heavy-optimised
  but writes are slow.
- **Custom daemon** (Goanna pattern) — local files are the source of truth
  for the editor experience; R2 is the source of truth for the agent.
  Bisync resolves conflicts; both sides have full speed access.

## What it does

1. **Watch** `<town-path>/` for filesystem changes (fsnotify on Linux/macOS,
   ReadDirectoryChangesW on Windows)
2. **Reconcile**: on startup + on every change, diff local file metadata
   against R2 metadata for the same path
3. **Push**: upload local-newer files to R2 (S3 PUT)
4. **Pull**: download R2-newer files to local (S3 GET)
5. **Conflict**: if both sides changed independently, keep both — local
   gets `.conflict-<timestamp>` suffix, audit log row in `wiki_audit`
6. **Throttle**: don't pull while user is actively typing in a file (lockfile)

## Architecture

```
~/Documents/<town>/                  ← local mirror
├── wiki/                            ← markdown entries + attachments
│   └── ...                          
├── files/                           ← agent uploads
├── published/                       ← public pages (read-only on local)
└── .officetowd/                     ← daemon state
    ├── manifest.db                  ← sqlite — last-known etags + mtimes
    ├── officetowd.log
    └── officetowd.pid

           ⇅ (bisync)

R2 bucket office-town-substrate/
├── wiki/...
├── files/...
├── published/...
└── shares/...
```

## Tech choices

- **Language**: Go. Same as `goannad`. Single static binary, easy
  cross-platform builds (macOS arm64+amd64, Linux amd64+arm64, Windows amd64).
- **Filesystem watching**: `github.com/fsnotify/fsnotify`
- **R2 access**: `github.com/aws/aws-sdk-go-v2/service/s3` against R2's
  S3-compatible endpoint
- **Local state**: SQLite via `github.com/mattn/go-sqlite3`
- **CLI shape**: cobra (start/stop/status/logs/configure)
- **Distribution**: GitHub Releases + Homebrew formula
  (`brew install jezweb/tap/officetowd`)

## Configuration

`~/.config/officetowd/config.yaml`:

```yaml
town: my-town
local_path: ~/Documents/my-town
r2:
  account_id: "<from worker deploy>"
  bucket: office-town-substrate
  access_key_id: <r2 access key>
  secret_access_key: <r2 secret>
  endpoint: https://<account>.r2.cloudflarestorage.com
sync:
  interval_seconds: 5      # passive poll fallback
  ignore:
    - "*.swp"
    - ".DS_Store"
    - "node_modules/"
auth_token: <MCP_BEARER_TOKEN — for notifying the worker of changes>
```

## Bisync algorithm (single-pass)

```
For each path that appears in EITHER local OR R2:
  local_mtime = stat(local_path) || null
  local_etag  = manifest.last_etag_for(path) || null
  r2_mtime    = head_object(path).LastModified || null
  r2_etag     = head_object(path).ETag || null

  if local_etag == r2_etag:
    no-op (in sync per manifest)
  elif local_mtime > manifest.last_local_sync_mtime AND r2_etag != local_etag:
    if r2_mtime > manifest.last_r2_sync_mtime:
      CONFLICT — keep both, file local as conflict, log to wiki_audit
    else:
      PUSH local → R2 (upload, update manifest)
  elif r2_mtime > manifest.last_r2_sync_mtime:
    PULL R2 → local (download, update manifest)
  elif local doesn't exist AND r2 doesn't exist:
    deleted on both sides — remove from manifest
  elif local doesn't exist AND manifest had it:
    DELETED locally — propagate delete to R2
  elif r2 doesn't exist AND manifest had it:
    DELETED on R2 — propagate delete locally
```

## Notify-the-worker hook

When bisync uploads a `wiki/<collection>/<slug>/entity.md`, the daemon
posts a webhook to the worker:

```
POST <worker-url>/api/internal/notify-changed
Authorization: Bearer <MCP_BEARER_TOKEN>
{ "r2_key": "wiki/orgs/acme/entity.md", "action": "upserted" }
```

The worker re-indexes the file (D1 + Vectorize). Without this, the wiki
would be out of date until the next cron run.

## CLI surface

```
officetowd start [--foreground]
officetowd stop
officetowd status
officetowd logs [--follow]
officetowd configure   # interactive — fills config.yaml
officetowd resync      # force a full bisync from scratch
officetowd push <path> # one-off push (skips conflict check)
officetowd pull <path> # one-off pull
```

## Integration with Office Town worker

The worker already has the `/api/internal/notify-changed` shape (will add
in the build) — daemon posts here, worker re-indexes. No other coupling.

Users without `officetowd` keep using the wiki via MCP tools (cloud only).
Users with `officetowd` ALSO get filesystem access — Goose's Developer
extension can `cat ~/Documents/my-town/wiki/orgs/acme/entity.md` and read
it directly, or edit it in their editor of choice.

## Effort estimate

~1-2 weeks of focused Go work:
- 2 days — fsnotify watcher + manifest sqlite
- 2 days — R2 S3 client + push/pull
- 3 days — bisync algorithm + conflict resolution
- 2 days — CLI (cobra) + config loader
- 1 day — Homebrew formula + GitHub Releases CI
- 1 day — integration with the worker's notify-changed endpoint
- 2 days — testing on macOS+Linux+Windows, edge cases

Repo: `jezweb/officetowd` (to be created). Same MIT license.

## v1.0 → v1.1 migration

v1.0 users have files only in R2. When v1.1 ships:
1. User installs `officetowd` via Homebrew
2. `officetowd configure` — fills config from the worker URL + bearer + their preferred local path
3. `officetowd start` — initial bisync downloads everything from R2 to local
4. From now on, local + R2 stay in sync automatically

No data loss. v1.0 deployment is forward-compatible — no schema changes.

## What it doesn't solve

- **Multi-user collaboration on the same town** — bisync is single-user.
  Multi-user requires CRDT or coordinator (out of scope).
- **Mobile** — Go daemon doesn't run on iOS/Android. Mobile users stay
  cloud-only via Goose mobile or the dashboard.
- **Web-only users** — perfectly fine without `officetowd`. Wiki MCP +
  dashboard work without local sync.
