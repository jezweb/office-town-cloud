# Wire-Sync Walkthrough — demo2-town

**Date**: 2026-05-28
**Status**: Walkthrough for the cold install test on demo2-town. Grounded in the actual install script (pulled from the live worker 2026-05-28) and the `/dashboard/wire-sync` page source.

**Target deployment**: `https://demo2-town.jezweb.workers.dev`

---

## TL;DR — the 5-minute path

```bash
# 1. Login at the dashboard (you've probably already done this)
open https://demo2-town.jezweb.workers.dev/dashboard/connect

# 2. Install the daemon
curl -fsSL https://demo2-town.jezweb.workers.dev/api/sync/install.sh | bash

# 3. Configure (interactive — asks for bearer + local folder)
officetowd configure --from-dashboard https://demo2-town.jezweb.workers.dev

# 4. Start the daemon
officetowd start

# 5. Verify
officetowd status
```

If that completes cleanly and `status` shows `watching ~/Documents/my-town ↔ https://demo2-town.jezweb.workers.dev (interval 60s)`, the daemon is live. Continue to "End-to-end test" below.

---

## What you'll see at `/dashboard/wire-sync`

The page presents three install paths. Pick whichever feels best:

| Option | What it does | Best when |
|---|---|---|
| **A — Pipe install.sh to bash** | Downloads + installs the binary; tells you the configure command | Fastest. You read the script first via the "Open in new tab" link |
| **B — Homebrew** | `brew tap jezweb/tap && brew install officetowd` | If you like brew managing binaries |
| **C — Agent prompt** | Copies a prompt to paste into Claude Code or Goose; the AI does the install transparently | If you want an AI to drive + explain each step |

The page also shows the install command with the worker URL already baked in — so you don't have to remember the demo2-town URL. The "Open `/api/sync/install.sh` in a new tab" link lets you read the script before piping it.

### What the install script actually does (verified 2026-05-28)

The header of `install.sh` claims 7 steps; the actual script does steps 1-3 (download + install binary). Steps 4-7 (configure, plist/systemd, start) are reminded but **the script tells you to run them manually**. This is deliberate — it gives you a checkpoint to confirm the binary is good before letting it touch your config.

Reality check from `head /api/sync/install.sh`:

```bash
# 1. Detects your OS + architecture     ← runs
# 2. Downloads the right officetowd binary from GitHub Releases  ← runs
# 3. Installs to /usr/local/bin/officetowd (or ~/.local/bin/ if no sudo)  ← runs
# 4. Prompts for your MCP bearer token + local sync folder  ← you run this via `officetowd configure`
# 5. Writes ~/.officetowd/config.yaml (mode 0600)  ← part of configure
# 6. Sets up launchd plist (macOS) or systemd unit (Linux)  ← part of `officetowd start`
# 7. Starts the daemon  ← part of `officetowd start`
```

After the script runs you'll see:

```
→ Installed: /usr/local/bin/officetowd (officetowd version v0.2.1)
→ Now configure: /usr/local/bin/officetowd configure --from-dashboard https://demo2-town.jezweb.workers.dev
  Then start with: /usr/local/bin/officetowd start
```

That's your next two commands.

---

## Step 2 — Configure

Run:

```bash
officetowd configure --from-dashboard https://demo2-town.jezweb.workers.dev
```

What it asks (in order):

1. **MCP bearer token** — paste it. You can find it on the `/dashboard/connect` page (look for "MCP bearer" or check the connection details). Same bearer you'd use for any Office Town MCP.
2. **Local sync folder** — default: `~/Documents/my-town`. Press enter for the default OR type a different path. The folder gets created if it doesn't exist.

Output you should see:

```
→ Worker: https://demo2-town.jezweb.workers.dev
→ Local:  ~/Documents/my-town  (created)
→ Wrote:  ~/.officetowd/config.yaml (mode 0600)
```

Confirm the config file:

```bash
cat ~/.officetowd/config.yaml
```

Should show:

```yaml
worker_url: https://demo2-town.jezweb.workers.dev
bearer: <your-bearer>
local_dir: ~/Documents/my-town
interval_seconds: 60
```

(The `bearer:` value is the actual token, mode 0600 so only you can read it.)

---

## Step 3 — Start the daemon

```bash
officetowd start
```

On macOS this creates a launchd plist at `~/Library/LaunchAgents/com.jezweb.officetowd.plist` and starts it. The plist auto-starts at login.

On Linux it creates a systemd user unit at `~/.config/systemd/user/officetowd.service`.

Expected output:

```
→ Created launchd plist: ~/Library/LaunchAgents/com.jezweb.officetowd.plist
→ Loaded + started.
→ Daemon running. Verify with: officetowd status
```

If the binary's at `~/.local/bin/officetowd` instead of `/usr/local/bin/officetowd`, the plist will reference the local path automatically.

---

## Step 4 — Verify

```bash
officetowd status
```

Expected output:

```
officetowd v0.2.1
config: ~/.officetowd/config.yaml
watching: ~/Documents/my-town ↔ https://demo2-town.jezweb.workers.dev
interval: 60s
manifest: ~/.officetowd/state.db (SQLite)
state: running
last sync: <recent timestamp>
files watched: <N>
```

If the worker has wiki content already (created via the MCP or via the dashboard), `files watched` will be > 0 and `~/Documents/my-town/` will have markdown files in it.

If the worker is empty (a fresh deployment), `files watched: 0` is correct — the daemon's just sitting ready for the first write.

---

## End-to-end test

The most thorough proof that the cortex is live. Five steps.

### A. Push from local

```bash
mkdir -p ~/Documents/my-town/wiki/test-collection
cat > ~/Documents/my-town/wiki/test-collection/hello.md <<'EOF'
---
slug: hello
kind: test-collection
created: 2026-05-28T13:00:00Z
last_updated: 2026-05-28T13:00:00Z
last_edited_by: jeremy
last_change_summary: first end-to-end test
---

# Hello from local

This file was created in the local sync folder. It should sync to the worker within ~5 seconds.
EOF
```

Wait ~5 seconds. Then:

```bash
officetowd status | grep "last sync\|files watched"
```

`files watched` should now be at least 1. `last sync` should be very recent.

### B. Verify it landed in R2

Via the worker's API (with your bearer):

```bash
BEARER="<your-bearer>"
curl -s -H "Authorization: Bearer $BEARER" \
  "https://demo2-town.jezweb.workers.dev/api/sync/list?prefix=wiki/test-collection/" | jq
```

Should return:

```json
{
  "objects": [
    { "key": "wiki/test-collection/hello.md", "size": ..., "uploaded": "..." }
  ]
}
```

### C. Verify it landed in D1 (wiki_entries)

Via the dashboard:

```
https://demo2-town.jezweb.workers.dev/dashboard/wiki
```

You should see the `test-collection` collection (if it auto-registers; otherwise see "Collection not registered" below). Click into it to see the hello entry.

### D. Pull from remote

Make a wiki change via the worker (e.g. via Goose with the wiki MCP, or via the dashboard's edit UI when it exists). The daemon should pick up the change on the next 60-second sweep.

Quick check from the worker via curl:

```bash
curl -s -X PUT \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: text/markdown" \
  --data-binary @- \
  "https://demo2-town.jezweb.workers.dev/api/sync/object/wiki/test-collection/from-server.md" <<'EOF'
---
slug: from-server
kind: test-collection
created: 2026-05-28T13:05:00Z
last_updated: 2026-05-28T13:05:00Z
last_edited_by: api-curl
last_change_summary: testing remote-to-local sync
---

# From the server

Created via curl PUT. Should appear locally within 60s.
EOF
```

Wait 60s, then:

```bash
ls ~/Documents/my-town/wiki/test-collection/
```

You should see `from-server.md` alongside `hello.md`.

### E. Conflict test (optional)

If both sides change the same file between sync ticks, the daemon writes the remote version as `<path>.conflict-<timestamp>` and uploads the local as authoritative.

To test: edit `hello.md` locally AND via curl PUT in close succession. After the next sync tick you should see `hello.md.conflict-<ts>` in the local folder.

---

## Verification checklist

Tick these as you go. If all five pass, the deployment is end-to-end working:

- [ ] `officetowd status` shows `state: running`
- [ ] Local file created → appears in `/api/sync/list` within 5-10s
- [ ] Remote PUT → appears locally within 60s
- [ ] `wiki_entries` D1 row exists for the test entry (via dashboard `/dashboard/wiki`)
- [ ] `wiki_audit` has the write events (visible in worker logs via `wrangler tail` if you want detail)

---

## Common failure modes + how to recover

### "Couldn't find latest release on jezweb/officetowd"

The install script depends on the GitHub Releases for jezweb/officetowd having a v0.2.x release with assets named `officetowd-{os}-{arch}.tar.gz`. Check:

```bash
curl -s "https://api.github.com/repos/jezweb/officetowd/releases/latest" | jq '.tag_name'
```

Should return `"v0.2.1"` or newer. If empty or 404, the daemon hasn't been published yet (shouldn't be the case on demo2-town since v0.2.1 shipped).

### "401 Unauthorized" on a sync call

The bearer is wrong or the request didn't include `Authorization: Bearer <token>`. Confirm:

```bash
cat ~/.officetowd/config.yaml | grep bearer
```

Then verify the bearer against `/dashboard/connect`'s MCP bearer value. They should match. If they don't, re-run `officetowd configure`.

### "officetowd: command not found"

The binary went to `~/.local/bin/` but that's not on your PATH. Add to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then `source ~/.zshrc` (or `.bashrc`) and try again.

### Daemon running but no files appear locally

`officetowd status` shows `state: running` but `~/Documents/my-town/` is empty. Likely the worker's wiki bucket is empty (no content to sync yet). Verify:

```bash
curl -s -H "Authorization: Bearer $BEARER" \
  "https://demo2-town.jezweb.workers.dev/api/sync/list" | jq '.objects | length'
```

If `0`, the worker's empty — that's fine, just nothing to pull yet. Create a wiki entry to test.

### Local file written but no upload happening

Check the daemon logs:

```bash
# macOS launchd
log show --predicate 'process == "officetowd"' --last 5m

# Or directly
tail -f ~/.officetowd/daemon.log    # if logs go there
```

Likely causes:
- Permissions on `~/.officetowd/config.yaml` — should be 0600. Fix: `chmod 600 ~/.officetowd/config.yaml`
- Bearer expired / rotated. Re-run `officetowd configure`.
- Network: can the daemon reach the worker? `curl -I https://demo2-town.jezweb.workers.dev`

### "Collection not registered" when writing a non-starter collection

Office Town's starter collections (set in src/bootstrap.ts) are: business, owner, team, contacts, orgs, projects, decisions, knowledge, research, feedback, tasks. If you wrote to a non-registered collection (e.g. `test-collection`), the sync still puts the file in R2 + audit, but `wiki_entries` won't have a row because the collection isn't recognised.

Fix options:
- Use one of the starter collections (e.g. `knowledge/test-entry/concept.md`)
- Wait until Session 1 build ships the `/api/install-collection-schemas` endpoint, then call it to register your collection

For the immediate cold-install test, use `knowledge/<slug>/concept.md` shape — that's the safest collection to test against.

---

## What success looks like (the brand-new-Mac test, mini version)

After the walkthrough:

1. You have `officetowd` running as a daemon
2. `~/Documents/my-town/` is a live mirror of demo2-town's wiki bucket
3. Edits in your editor of choice (Obsidian, VSCode, etc.) sync to R2 within ~5s
4. Wiki changes made via Goose's wiki MCP or the dashboard sync down within ~60s
5. The worker's audit log captures every write with `agent_slug: officetowd:<machine>`

That's the daemon side of the brand-new-Mac test. The full test (a fresh Goose install picking up the cortex context) requires Goose to be running with the right MCP servers configured — that's Session 2 territory (curator persona + first end-to-end conversation).

---

## Next steps after wire-sync works

Once the install + verification passes:

1. **Tell the framework doc the install works** — file a finding in `wiki/agents/librarian/findings/2026-05-28-demo2-cold-install.md` or similar (or just note it here)
2. **Start Session 1** — build the cortex foundation per `session-1-build-spec-2026-05-28.md`. The migrations + collection seeds + `/api/ingest` + frontmatter→links derivation
3. **Try a content seed** — once collections are registered, paste a sample email or two via `/api/ingest` to confirm the extractor produces sensible typed entries
4. **Then Session 2** — curator persona + first Gmail end-to-end

---

## Related docs

- `office-town-framework-2026-05-28.md` — the full publishable framework
- `session-1-build-spec-2026-05-28.md` — what to build next
- `cortex-shape-2026-05-28.md` — design contract for collections + frontmatter
- `unified-write-path-2026-05-28.md` — why all writes go through the worker (incl. the daemon's)
- `goanna-doctrine-extracted-2026-05-28.md` — Goanna lessons absorbed
- The live install script: `https://demo2-town.jezweb.workers.dev/api/sync/install.sh`
