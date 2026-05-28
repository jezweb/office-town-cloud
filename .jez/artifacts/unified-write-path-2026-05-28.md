# Unified Write Path — Architecture Note

**Date**: 2026-05-28
**Status**: shipped (Phase 1–4 complete, demo-town end-to-end verified)

## The decision

All writes to Office Town's substrate (wiki + files buckets) flow through
the worker, not directly to R2. Multiple call paths converge on the same
HTTP endpoint set:

```
                      ┌──────────────────────────────┐
                      │   /api/sync/object/<key>     │
                      │   /api/wiki MCP write        │
                      │   /api/files MCP upload      │
                      │   future: dashboard kanban   │
                      │   future: server-side agents │
                      └──────────────┬───────────────┘
                                     │
                                     ▼
                          Single write-orchestrator:
                            - parse + validate
                            - frontmatter repair (AI)
                            - R2 write via binding
                            - D1 wiki_entries upsert
                            - wiki_audit row
                            - INDEX_QUEUE message
                                     │
                                     ▼
                                R2 + D1 + Vectorize
```

## Why this is the architecture

### 1. Audit completeness

Every change — daemon sync, MCP write, dashboard edit, future kanban
drag — lands a `wiki_audit` row with `agent_slug`, `prev_hash`,
`new_hash`, and `why`. No path bypasses audit. Without this, a sync
daemon could write straight to R2 and the audit log would be blind
to half of all changes.

### 2. Frontmatter repair on the way through

The worker's PUT handler parses YAML frontmatter on every markdown
write. If it fails, Workers AI (gpt-oss-20b) repairs it before the
bytes hit R2. A daemon syncs a file with a colon-in-value YAML bug;
the repaired version is what gets stored. The agent that next reads
the entry sees the fixed YAML.

This pattern generalises: **any server-side validation/repair/
enrichment can hook into the write path** without changing clients.
Future hooks could:
- Validate links against `wiki_collections`
- Auto-tag entries via embedding-based classification
- Strip executable script tags from HTML fields
- Run a "policy check" agent before accepting writes

### 3. Indexing kicks off identically regardless of source

`INDEX_QUEUE` fires on every accepted PUT — daemon, MCP, future
dashboard edit. The queue consumer rebuilds the Vectorize embedding
from the D1 row. We never have to ask "did the indexer see this
change?" because there's one place where changes happen.

### 4. Multi-machine convergence is serialised by the worker

Two daemons on two machines edit the same file. Both PUT to the
worker. The worker processes them in arrival order; the loser sees a
409 in a future iteration. Today the daemon falls back to `.conflict-
<ts>` sibling files. Tomorrow we could add `If-Match: <etag>`
optimistic concurrency at the API layer.

### 5. Zero R2 tokens on the client side

The worker has `env.WIKI` + `env.FILES` bindings. Clients (daemon,
MCP server itself) only need the MCP bearer. One credential boundary
for the whole system. User never sees an R2 token; never has to go
to the Cloudflare R2 dashboard to mint one. **Removed a user setup
step that was the worst part of the install flow.**

### 6. Server-side AI agents become first-class tools

Workers AI runs IN the worker. The frontmatter repair is the first
example — gpt-oss-20b reads broken YAML and returns fixed YAML, all
within a single HTTP request. Future agents could:
- "Summarise this entry's body and write the summary to a sibling
  field"
- "Tag this entry against the collection's taxonomy"
- "Reject writes that don't pass these policies"

All as middleware in the write path. None of which is possible if
clients write to R2 directly.

## What this unlocked downstream

### Interactive dashboard editors become trivial

Today the dashboard is read-only. To make it editable (kanban drag
& drop, frontmatter form editor), the new code just calls
`PUT /api/sync/object/wiki/tasks/<slug>/task.md` with the updated
content. Same code path as the daemon. Free audit log. Free repair.
Free index. The dashboard editor doesn't have to reimplement
"write a wiki entry"; it sends bytes to the chokepoint.

### Goose can wire any flow

Same `office-town-wiki` MCP that already exists. Add MCP actions
like `wiki(action:transform_all, query, transform_fn)` — the agent
reads N entries, runs a transform, writes them back. The worker
serializes the writes, audits them, repairs broken frontmatter,
re-indexes. No special "bulk update" infrastructure needed.

### Worker-side agent loops

A scheduled job (already supported via `cron_jobs` table) could run:
"every Monday, summarise all `decisions` collection entries from the
prior week into a digest entry". The job reads from D1, runs Workers
AI, writes back via the same write path. The summary entry gets
audited, indexed, embedded — everything normal entries get.

## Component summary

| File | Role |
|---|---|
| `src/sync/routes.ts` | The 6 sync endpoints + frontmatter repair + wiki_entries upsert |
| `src/auth/middleware.ts` | Routes /api/sync/* through MCP bearer auth (plus `PUBLIC_AUTH_EXCEPTIONS` for `install.sh`) |
| `src/queue/index-consumer.ts` | Reads `wiki_entries` row, computes embedding, upserts Vectorize |
| `src/dashboard/routes.ts` | `/dashboard/wire-sync` page with 3 install paths |
| `internal/client/client.go` (officetowd) | HTTP client; replaces aws-sdk-go-v2 |
| `internal/sync/sync.go` (officetowd) | Bisync engine; unchanged logic, swapped transport |

## What's not in this architecture (yet)

These are deliberate gaps to address later:

1. ~~Delete propagation to `wiki_entries`~~ ✅ **Closed 2026-05-28**.
   Sync DELETE now calls `deleteWikiRows()` at the API boundary,
   targeting `wiki_entries` (for .md) or `wiki_attachments` (for
   binary attachments) based on the key shape.

2. **Optimistic concurrency on PUT** — today we accept any PUT and
   resolve conflicts client-side via `.conflict-<ts>` files. Server-
   side `If-Match` + 409 responses would catch races at the API
   layer. Defer until the daemon supports it.

3. ~~Binary attachment metadata~~ ✅ **Closed 2026-05-28**. Sync PUT
   for non-.md files under `wiki/<col>/<slug>/<file>` now upserts
   `wiki_attachments` with content_type + size + uploaded_at via
   `upsertWikiAttachment()`. Idempotent via the unique
   (collection, slug, filename) index.

4. ~~Bulk upload endpoint~~ ✅ **Closed 2026-05-28 (different approach)**.
   Rather than adding a server-side batch endpoint, the daemon now
   parallelises apply ops at concurrency 8 (semaphore-bounded
   goroutine pool). Initial syncs of thousands of files are ~8x
   faster with no worker-side complexity. v0.2.1 released.

5. **Optimistic concurrency** still open (was #2 above) — the only
   real remaining item. Will be a v1.2 feature when we add
   if-match-aware daemon resync semantics.

## Verified end-to-end

Tested 2026-05-28 against demo-town deployment:

- ✓ Push markdown with valid frontmatter
- ✓ Push markdown with NO frontmatter
- ✓ Push markdown with BROKEN frontmatter (AI repair triggered)
- ✓ Push binary PNG (R2 only, no wiki_entries upsert)
- ✓ Pull — MCP write detected by daemon, downloaded
- ✓ Conflict — both sides changed, `.conflict-<ts>` sibling + local
  uploaded as authoritative
- ✓ Delete — local rm → remote deletion + audit row
- ✓ `wiki(action:list)` shows synced entries with correct sextet
  frontmatter (last_edited_by=officetowd:mac, last_change_summary=
  'synced from <machine>')
- ✓ Audit log shows every change with `agent_slug='officetowd:mac'`
- ✓ install.sh from worker downloads + installs from GitHub Releases
- ✓ Binary size 17MB (was 22MB with aws-sdk-go-v2)

Test traces archived in worker logs and in `.jez/artifacts/sync-e2e-
2026-05-28.md` (the test commands themselves are documented in this
note).
