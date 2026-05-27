# Cloudflare Knowledge: Workers + Storage + Compute

**Captured:** 2026-05-28
**Source of truth:** developers.cloudflare.com (verified via the official `cloudflare-docs` MCP server)
**Scope:** Foundations needed to design and ship Office Town on Cloudflare — single Worker, multiple stores, AI fleet running on Goose. Targeted at building the master plan synthesis (Phase 3) and a v1.0 to v2 roadmap.

This is a reference document. Read top-to-bottom once, then jump by section. Every binding, limit, price and gotcha is meant to be quotable into the build spec.

---

## Table of contents

1. Workers runtime
2. Compatibility dates and flags
3. Workers Builds (CI/CD)
4. Smart Placement
5. Cron Triggers
6. Tail Workers and Observability
7. D1 (SQLite database)
8. R2 (object storage)
9. KV (key-value)
10. Vectorize (vector DB)
11. Durable Objects
12. Hyperdrive (Postgres/MySQL acceleration)
13. Queues
14. Workflows (durable execution)
15. Pipelines (event ingestion)
16. Pages to Workers Assets
17. Workers Assets (static hosting)
18. Secrets Store
19. Wrangler config — full binding catalogue
20. Deploy to Cloudflare button
21. Cloudflare's official MCP servers
22. Office Town relevance matrix (v1.0 to v2)

---

## 1. Workers runtime

Workers are stateless JavaScript/TypeScript/Python/Rust/etc. functions that run inside V8 isolates on Cloudflare's global network (300+ POPs, ~50ms from 95% of internet users). Each invocation starts in an isolate, services a request, and either hibernates or is recycled. There is no container, no warm-up, no per-region deployment.

### 1.1 Request flow

```
Client -> CF edge POP -> Worker isolate (with bindings injected on env)
                          -> optional subrequests (fetch, KV, D1, R2, Vectorize, AI)
                          -> Response
```

The `env` object carries every binding declared in `wrangler.jsonc`. Bindings are auto-authenticated — no secrets needed for same-account resources.

### 1.2 Account plan limits (verified 2026-05)

| Feature                                                                   | Workers Free | Workers Paid   |
| ------------------------------------------------------------------------- | ------------ | -------------- |
| Daily requests                                                            | 100,000/day  | No limit       |
| CPU time per invocation                                                   | 10 ms        | **5 minutes** (default 30 s) |
| Memory                                                                    | 128 MB       | 128 MB         |
| Subrequests per invocation                                                | 50           | **10,000** (configurable up to 10 million) |
| Simultaneous outgoing connections per request                             | 6            | 6              |
| Environment variables / Worker                                            | 64           | 128            |
| Environment variable size                                                 | 5 KB         | 5 KB           |
| Worker script size (compressed)                                           | 3 MB         | 10 MB          |
| Worker startup time                                                       | 1 s          | 1 s            |
| Number of Workers per account                                             | 100          | 500            |
| Cron Triggers per account                                                 | 5            | 250            |
| Static asset files per Worker version                                     | 20,000       | 100,000        |
| Individual static asset file size                                         | 25 MiB       | 25 MiB         |

> **Important 2026 change:** Workers are **no longer limited to 1000 subrequests per invocation** (changelog Feb 11, 2026). Paid plan default is 10,000, configurable up to 10,000,000 in `limits.subrequests`. Free plan stays at 50 external subrequests.

### 1.3 Request and response limits

| Limit                | Value                                          |
| -------------------- | ---------------------------------------------- |
| URL size             | 16 KB                                          |
| Request header size  | 128 KB total                                   |
| Response header size | 128 KB total                                   |
| Response body size   | No enforced limit (CDN cache: 512 MB Free/Pro/Business, 5 GB Enterprise) |
| Request body size    | 100 MB Free/Pro, 200 MB Business, 500 MB Enterprise (account-plan-driven, not Workers-plan) |

Requests exceeding the request body cap return `413 Request entity too large`.

### 1.4 CPU time semantics

CPU time = time the CPU is *actually executing your code*. **Waiting on network (fetch, KV read, D1 query) does NOT count.** A Worker that takes 800 ms wall-clock but only spends 12 ms in JS bills as 12 ms. This is the model — design for it.

Default per-invocation cap: 30 seconds. Max configurable: 5 minutes (`limits.cpu_ms = 300000`).
For Cron Triggers and Queue Consumers: max **15 minutes** of CPU per invocation.

### 1.5 Pricing (Standard usage model — current default)

| Metric          | Free                                | Paid (after Free tier)                                                |
| --------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Subscription    | $0                                  | $5/mo                                                                 |
| Requests        | 100,000/day                         | 10M/mo included, then **$0.30 per million**                            |
| CPU time        | 10 ms cap                           | 30M CPU ms/mo included, then **$0.02 per million CPU ms**              |
| Duration        | n/a                                 | No charge for duration (CPU only)                                     |
| Static asset requests | Free + unlimited              | Free + unlimited                                                      |

Example from docs: 100M requests/month × 7 ms CPU = $5 + $27 + $13.40 = **$45.40/mo**.

WebSocket *connection upgrades* are billed as a request. Messages routed through an established WebSocket are NOT additional requests.

### 1.6 Custom limit configuration

```jsonc
{
  "limits": {
    "cpu_ms": 100,
    "subrequests": 50000
  }
}
```

Use to cap runaway/denial-of-wallet risk on hostile or buggy code paths.

### 1.7 Routing options

- `workers_dev: true` -> free `<worker-name>.<subdomain>.workers.dev` host.
- `routes: [{ pattern, custom_domain: true }]` -> custom domain. **Custom domains added via dashboard/API are dropped on the next `wrangler deploy` if not in `wrangler.jsonc`.** (See `rules/cloudflare-workers.md`.)
- `routes: [{ pattern, zone_id }]` -> traditional zone routes (must be on a zone in your CF account).

### 1.8 Office Town fit

Workers is **the foundation** — every Office Town instance is exactly one Worker. CPU/subrequest budgets are well within v1.0 needs (most page renders + agent webhooks are O(10-50 ms) CPU and O(5-20) subrequests).

---

## 2. Compatibility dates and flags

### 2.1 What they do

`compatibility_date` selects the snapshot of runtime semantics + bug fixes available to your Worker. Setting a recent date gets you newer APIs and fixes; older dates lock behaviour for stability. **Recommendation per Cloudflare's Workers Best Practices (Feb 2026):** set to today's date on new projects, refresh periodically.

`compatibility_flags` opts you into specific behaviour changes that are *not yet default* for your compat date, or out of defaults you don't want.

### 2.2 The flag every Office Town Worker needs

```jsonc
{
  "compatibility_date": "2026-05-28",
  "compatibility_flags": ["nodejs_compat"]
}
```

`nodejs_compat` (since compat date `2024-09-23`) gives access to:

- Built-in Node.js runtime APIs (full implementations of large subsets of `node:crypto`, `node:buffer`, `node:stream`, `node:async_hooks`, etc.)
- Wrangler-injected polyfill shims for npm packages that import Node modules

Sub-flag interactions:
- With compat date >= `2024-09-23`, `nodejs_compat` implicitly enables `nodejs_compat_v2` (bundles extra polyfills + globals; slightly bigger bundle).
- `no_nodejs_compat_v2` opts out of v2 specifically while keeping v1.
- Pre-`2024-09-23`: add `nodejs_compat_v2` explicitly if wanted.

### 2.3 Required compat date for specific features

| Feature                                        | Compat date / flag                              |
| ---------------------------------------------- | ----------------------------------------------- |
| Built-in nodejs APIs                           | >= `2024-09-23` + `nodejs_compat` flag           |
| Better-auth + Hyperdrive (any Postgres driver) | Same as above                                   |
| R2 `list({ include: [...] })` honored          | >= `2022-08-04` OR `r2_list_honor_include` flag  |
| Durable Object `deleteAll()` also deletes alarm | >= `2026-02-24`                                  |

### 2.4 Office Town fit

Current `wrangler.jsonc` has `compatibility_date: "2025-01-15"`. **Refresh to today's date** in v1.0 to pick up subrequest-limit raise + DO `deleteAll` semantics + other 2026 fixes. Keep `nodejs_compat`.

---

## 3. Workers Builds (CI/CD)

Cloudflare's native CI/CD that connects a Worker to a GitHub or GitLab repo and auto-builds + deploys on every push to the production branch.

### 3.1 Setup flow

1. Dashboard -> Workers and Pages -> Create application -> Import a repository.
2. Pick GitHub or GitLab account, select repo.
3. Choose:
   - **Git branch** (production branch — defaults to `main`).
   - **Build command** (e.g. `npm run build`, optional).
   - **Deploy command** — defaults to `npx wrangler deploy`. Wrangler version is read from `package.json`.
4. Save -> first build runs immediately.

For an *existing* Worker: Dashboard -> that Worker -> Settings -> Builds -> Connect Git.

### 3.2 What gets injected at build time

Workers Builds auto-injects these env vars (per Pages convention, available to Builds since Jun 2025):

- `CF_PAGES` / `CI=true` — flag a build is running on CF
- `CF_PAGES_COMMIT_SHA` — git SHA
- `CF_PAGES_BRANCH` — branch name
- `CF_PAGES_URL` — preview URL

### 3.3 Environment variables for Builds

- Up to **64 env vars per Worker** (since Nov 21, 2025; previously a 5 KB total cap)
- Up to **5 KB per variable**
- Set them in Dashboard -> Worker -> Settings -> Builds -> Variables

### 3.4 Non-production branch builds + preview URLs

Toggle "non-production branch builds" to get a Workers Build per pushed branch with its own preview URL + PR comment status. This is how `--preview` deploys work for Workers.

### 3.5 Deploy Hooks

Every Worker connected to Git can have one or more deploy hooks — unique POST URLs that trigger a build on demand:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/<DEPLOY_HOOK_ID>"
```

Use for headless CMS rebuilds, external cron triggers, conditional pipelines.

### 3.6 External CI/CD alternative

If you're on Bitbucket, self-hosted GitHub/GitLab, or need richer pipelines: use GitHub Actions / GitLab CI/CD + `npx wrangler deploy` with `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` secrets. Cloudflare ships templates for both.

### 3.7 Automatic configuration (GA Feb 2026)

Running `wrangler deploy` in a project with no `wrangler.jsonc`:
1. Detects framework from `package.json`
2. Prompts for confirmation
3. Installs required adapters
4. Generates `wrangler.jsonc`
5. Deploys

Connecting a repo via dashboard now auto-opens a PR with the generated config + a preview deploy.

### 3.8 Office Town fit

Office Town's "deploy your own" model leans hard on Workers Builds + the Deploy to Cloudflare button (see §20). A user clicking the button gets: forked repo -> resources provisioned -> Workers Build wired to their fork -> ongoing CI on push.

---

## 4. Smart Placement

By default a Worker runs in the POP closest to the *user*. Smart Placement moves execution closer to the *backend* when that's faster end-to-end.

### 4.1 When to enable

- Worker makes >= 3 sequential round trips to a back end (DB, third-party API, origin).
- Back end is in one or few regions (e.g. AWS us-east-1).
- The combined latency of multiple back-end calls > the latency of one extra leg to the user.

Smart Placement only affects `fetch` handlers — not RPC, not named entrypoints, not Workers without `fetch`.

### 4.2 Config

```jsonc
{ "placement": { "mode": "smart" } }
```

Cloudflare continually measures request duration in different POPs and re-places dynamically. Only POPs that already see traffic for this Worker are considered.

### 4.3 Static assets caveat

Static assets (via Workers Assets binding) are **always** served from the POP nearest the user, even when Smart Placement moves the dynamic Worker elsewhere. If you fetch assets via the binding from inside the Worker, they get fetched from the *Worker's* POP, not the user's.

### 4.4 Office Town fit

Office Town has D1 + R2 + Vectorize all on Cloudflare -> low value from Smart Placement (CF resources are co-located). Current `wrangler.jsonc` has `placement: { mode: "smart" }` — harmless but not a wins source. Consider removing or leaving as-is; no urgent action.

---

## 5. Cron Triggers

Schedule a Worker to run on a cron expression — emits a `scheduled` event handled by the default export's `scheduled` method.

### 5.1 Config

```jsonc
{
  "triggers": {
    "crons": ["0 */6 * * *", "30 2 * * *"]
  }
}
```

To disable, set `crons: []`. **Commenting out the key does NOT disable** — pre-existing schedules persist.

### 5.2 Limits and budget

- Max 5 (Free) / 250 (Paid) Cron Triggers per account.
- Max CPU per invocation: **15 minutes**.
- Cron supports 5-field standard cron syntax + Quartz extensions: `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`, plus step ranges (`*/15`), lists (`1,15,30`), and predefined.

### 5.3 Handler

```ts
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(rebuildSearchIndex(env));
  }
};
```

`event.cron` tells you which schedule fired (useful with multiple triggers in one Worker). `ctx.waitUntil()` extends the lifetime up to the CPU cap.

### 5.4 Office Town fit

v1.0 cron jobs: re-embed unindexed pages, garbage-collect orphaned R2 objects, refresh fleet roster cache. Current config: `["0 */6 * * *"]` (every 6 hours). Plenty of headroom.

---

## 6. Tail Workers and Observability

### 6.1 Workers Logs (default observability)

Per-Worker structured logs ingested + queryable from the dashboard, retained 7 days.

```jsonc
{
  "observability": {
    "enabled": true,
    "logs": { "invocation_logs": true, "head_sampling_rate": 1 }
  }
}
```

- `head_sampling_rate`: 0-1; 1 = log every request, 0.01 = 1% sample.
- New Workers default `enabled: true`.
- Use structured JSON for queryability.

### 6.2 Traces (automatic instrumentation)

```jsonc
{ "observability": { "traces": { "enabled": true } } }
```

Captures: every `fetch`, every binding call (KV/R2/D1/DO/Vectorize/AI), every handler invocation. Spans + attributes available in the dashboard. **No code changes required.**

### 6.3 Real-time logs

```bash
wrangler tail my-worker
```

Streams logs near-realtime for the running Worker. Use during dev/debug.

### 6.4 Tail Workers

A separate Worker bound to a *producer* Worker that receives every execution event (logs, headers, response status, exceptions, console output, sub-request metadata). Use to transform, sample, or forward to external observability platforms (Datadog, Honeycomb, Axiom, etc.).

Producer Worker config:

```jsonc
{
  "tail_consumers": [
    { "service": "my-tail-worker", "environment": "production" }
  ]
}
```

The tail Worker receives a `tail()` method on its default export with the event array.

### 6.5 Logpush (long-term log shipping)

Push Workers Trace Event logs to R2, S3, GCS, or supported HTTPS endpoints (Datadog, Splunk, Sumo, New Relic) for permanent retention + advanced analytics.

### 6.6 Office Town fit

v1.0: leave `observability.enabled: true` (already set). Skip Tail Workers + Logpush — overkill for solo installs. Document for v1.1 when fleet operators want centralised log shipping.

---

## 7. D1 (SQLite database)

D1 is Cloudflare's serverless SQLite — pure SQLite engine, exposed via a Worker binding. Each database is backed by a Durable Object under the hood, replicated across regions if Read Replication is enabled.

### 7.1 Binding

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "office-town-d1",
      "database_id": "<uuid-from-wrangler-d1-create>",
      "migrations_dir": "drizzle"
    }
  ]
}
```

`database_id` placeholder (`00000000-0000-0000-0000-000000000000`) is auto-replaced during Deploy-to-Cloudflare provisioning (§20).

### 7.2 Worker API

```ts
const stmt = env.DB.prepare("SELECT * FROM pages WHERE slug = ?").bind(slug);
const row = await stmt.first();
const { results } = await stmt.all();
const meta = await stmt.run();
const raw = await stmt.raw();
const batch = await env.DB.batch([s1, s2, s3]);
```

D1's `batch()` runs each statement sequentially inside an implicit transaction; if any fails, the entire batch rolls back. **Use for any multi-row write or multi-statement migration.**

Parameter binding uses `?` (anonymous) or `?NNNN` (numbered). Named params (`:name`, `$name`) not yet supported.

### 7.3 Limits

| Metric                                      | Limit                                                          |
| ------------------------------------------- | -------------------------------------------------------------- |
| Storage per database                        | **10 GB hard cap** (not raisable)                              |
| Databases per account                       | 50,000 (Paid) / 10 (Free)                                      |
| Simultaneous connections per Worker invocation | 6                                                           |
| Maximum SQL statement size                  | 100 KB                                                         |
| Maximum bind parameters per statement       | 100                                                            |
| Maximum bound parameter value size          | 5 KB (text/blob)                                               |
| Concurrent in-flight requests per DB        | Inherently single-threaded — backed by a single DO              |
| Throughput                                  | ~1000 q/s @ 1 ms queries, ~10 q/s @ 100 ms queries              |

> **D1 is single-threaded per database.** If you need horizontal scale, shard (one DB per tenant) or enable Read Replication.

### 7.4 Read Replication

Beta as of mid-2025; available via `withSession()` API on the binding. Each replica is a separate DO in another region. **No extra cost** — same `rows_read`/`rows_written` billing applies.

```ts
const session = env.DB.withSession("first-unconstrained");
const { results } = await session.prepare("SELECT ...").all();
```

Regions: ENAM, WNAM, WEUR, EEUR, APAC, OC.

### 7.5 Supported SQLite extensions

- **FTS5** (full-text search, including `fts5vocab`) — Office Town uses this for wiki search.
- **JSON** (json_extract, json_set, json_array, json_object, etc.).
- **Math functions** (sin, cos, log, sqrt, etc.).

Refer to workerd `sqlite.c++` source for the full whitelist. **Spatial extensions (R-Tree) NOT supported.**

### 7.6 PRAGMA support

D1 supports a curated PRAGMA subset:
- `PRAGMA table_info(table_name)`
- `PRAGMA index_list(table_name)`
- `PRAGMA foreign_keys = ON/OFF`
- `PRAGMA optimize` (since 2025-02-19, recommended after schema changes)
- `PRAGMA defer_foreign_keys`

### 7.7 SQLite gotchas D1 inherits

- `date('now', '-6 weeks')` -> silently `NULL`. SQLite doesn't have `weeks`. Use `-42 days`. (See `rules/cloudflare-storage.md`.)
- Large `UPDATE`/`DELETE` (>100k rows) will exceed execution limit — batch in chunks of ~1000.
- Bulk INSERT with > ~10-15 rows in a single statement can fail silently. Batch in chunks.

### 7.8 Migrations via Drizzle

D1 ships first-class `wrangler d1 migrations` tooling, but Drizzle is the recommended workflow for Office Town:

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID,
    token: process.env.CLOUDFLARE_D1_TOKEN,
  }
});
```

```bash
npx drizzle-kit generate
npx wrangler d1 migrations apply office-town-d1 --local
npx wrangler d1 migrations apply office-town-d1 --remote
```

> **Always run migrations on BOTH local AND remote.** See `/d1-migration` skill. Drizzle column names live in the schema definition (`text('case_number')`) — TypeScript field names can be camelCase (`caseNumber`).

### 7.9 Pricing

| Metric         | Free            | Paid                                              |
| -------------- | --------------- | ------------------------------------------------- |
| Rows read      | 5 million / day | 25 billion/mo included + **$0.001 / million rows** |
| Rows written   | 100k / day      | 50 million/mo included + **$1.00 / million rows** |
| Storage        | 5 GB total      | 5 GB included + **$0.75 / GB-mo**                  |
| Egress         | Free            | Free                                              |

Notes:
- Free-tier daily limits **reset at 00:00 UTC**.
- Free-tier write limit hit -> DB returns errors until reset OR upgrade.
- Each index write counts as +1 row written (table row + index row). Reads usually offset this.
- Read Replicas don't charge extra storage or compute.

### 7.10 D1 + FTS5 quick pattern

```sql
CREATE VIRTUAL TABLE pages_fts USING fts5(
  title, body, content='pages', content_rowid='id'
);

CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

SELECT pages.* FROM pages_fts
JOIN pages ON pages.id = pages_fts.rowid
WHERE pages_fts MATCH ?
ORDER BY rank LIMIT 20;
```

### 7.11 Office Town fit

D1 is **the spine** of Office Town. Pages, page versions, fleet roster, agent journals, audit trail — all D1. 10 GB cap -> enough for ~50k-500k wiki pages depending on average size. Beyond that: shard by domain or move large binary content to R2.

---

## 8. R2 (object storage)

S3-compatible object storage with **zero egress fees**. Workers binding is the preferred access path; S3 SDK for external clients; presigned URLs for browser-direct upload/download.

### 8.1 Binding

```jsonc
{
  "r2_buckets": [
    {
      "binding": "WIKI",
      "bucket_name": "office-town-wiki",
      "preview_bucket_name": "office-town-wiki-preview"
    }
  ]
}
```

### 8.2 Workers API

```ts
await env.WIKI.put(key, value, { httpMetadata, customMetadata });

const obj = await env.WIKI.get(key);
if (obj === null) return new Response("Not found", { status: 404 });
const headers = new Headers();
obj.writeHttpMetadata(headers);
headers.set("etag", obj.httpEtag);
return new Response(obj.body, { headers });

const obj2 = await env.WIKI.get(key, {
  onlyIf: request.headers,
  range: request.headers,
});

const meta = await env.WIKI.head(key);

await env.WIKI.delete(key);
await env.WIKI.delete([k1, k2, k3]);

const listed = await env.WIKI.list({
  prefix: "pages/",
  limit: 500,
  include: ["customMetadata", "httpMetadata"],
  cursor: previousCursor,
  delimiter: "/",
});
```

R2 writes + deletes are **strongly consistent globally** — once the promise resolves, the change is visible everywhere.

### 8.3 Multipart upload

```ts
const upload = await env.WIKI.createMultipartUpload(key);
const part1 = await upload.uploadPart(1, chunk1);
const part2 = await upload.uploadPart(2, chunk2);
await upload.complete([part1, part2]);
```

For files > 5 GiB or when chunked client upload makes sense. Resume with `resumeMultipartUpload(key, uploadId)`.

### 8.4 Limits

| Metric                      | Limit                                                    |
| --------------------------- | -------------------------------------------------------- |
| Maximum object size         | 5 TiB                                                    |
| Maximum upload size (single PUT) | 5 GiB                                              |
| Maximum part size (multipart) | 5 GiB                                                 |
| Maximum parts per multipart upload | 10,000                                            |
| Maximum keys returned per `list()` | 1000                                              |
| Maximum keys deleted per `delete([])` | 1000                                            |
| Maximum metadata size per object | 2 KiB (custom) + standard headers                   |
| Buckets per account         | 1,000                                                     |
| Operations per second       | No published cap — scale by adding buckets if needed     |

### 8.5 Presigned URLs

Generate via S3 SDK + signature v4. Expiry: 1 second to 7 days (604,800 s). No call to R2 — fully client-side signature.

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY, secretAccessKey: env.R2_SECRET_KEY }
});

const signed = await getSignedUrl(
  S3,
  new PutObjectCommand({ Bucket: "office-town-files", Key: "uploads/foo.pdf" }),
  { expiresIn: 3600 }
);
```

Office Town pattern: use presigned PUT URLs for browser-to-R2 direct upload (skips routing the binary through your Worker).

### 8.6 Lifecycle rules

Configure per-bucket via dashboard or API:
- Delete objects N days after upload
- Abort incomplete multipart uploads after N days
- Transition to Infrequent Access storage class after N days

### 8.7 Event notifications

R2 emits events on object create/delete/lifecycle into a Queue you bind. Consumer Worker reads + processes.

Use for: extract-then-embed pipelines after PDF upload, virus scanning, image-resize-on-upload, mirror to backup bucket.

### 8.8 Storage classes

| Class             | Storage rate     | Class A      | Class B      | Retrieval        |
| ----------------- | ---------------- | ------------ | ------------ | ---------------- |
| **Standard**      | $0.015/GB-mo     | $4.50/M      | $0.36/M      | Free             |
| **Infrequent Access** | $0.01/GB-mo  | $9.00/M      | $0.90/M      | $0.01/GB         |

- **Class A**: writes/mutates (PUT, COPY, POST, LIST, multipart).
- **Class B**: reads (GET, HEAD).

Free tier (Standard only): 10 GB-mo storage, 1M Class A/mo, 10M Class B/mo. **Free tier does NOT cover Infrequent Access.**

### 8.9 S3 compatibility

Endpoint pattern: `https://<account-id>.r2.cloudflarestorage.com`
Region: `auto` (R2 isn't regional).
Supported APIs: PutObject, GetObject, HeadObject, DeleteObject, DeleteObjects, ListObjectsV2, CopyObject, CreateMultipartUpload, UploadPart, CompleteMultipartUpload, AbortMultipartUpload, ListMultipartUploads, ListParts, presigned URLs.
Not supported: Object Lock, Versioning, Replication (use Super Slurper / Sippy for migration), object tagging.

### 8.10 Public buckets

Two options to serve R2 over HTTP:
1. **Custom domain** — bind a hostname directly to the bucket. Recommended.
2. **r2.dev managed subdomain** — `pub-<hash>.r2.dev`. Dev-only (rate-limited, no SLA).

For Office Town, serve user-uploaded files via a Worker route (gives auth + observability) rather than public buckets.

### 8.11 Office Town fit

R2 is **the body** of Office Town — Markdown source files for wiki pages, uploaded user files, AI-generated artefacts. Two buckets in current config (`WIKI`, `FILES`) is right. Use presigned PUTs for any browser-to-R2 binary uploads beyond ~10 MB.

---

## 9. KV (key-value)

Eventually-consistent edge KV store. Reads from any POP are ~1ms after the local cache warms; writes propagate globally in up to 60s.

### 9.1 Binding

```jsonc
{
  "kv_namespaces": [
    { "binding": "CACHE", "id": "<32-hex-namespace-id>" }
  ]
}
```

### 9.2 Workers API

```ts
await env.CACHE.put(key, value, {
  expirationTtl: 3600,
  expiration: Math.floor(Date.now()/1000)+3600,
  metadata: { foo: "bar" },
});

const value = await env.CACHE.get(key);
const obj = await env.CACHE.get(key, "json");
const stream = await env.CACHE.get(key, "stream");
const buf = await env.CACHE.get(key, "arrayBuffer");

const { value: v, metadata } = await env.CACHE.getWithMetadata(key);

await env.CACHE.delete(key);

const listed = await env.CACHE.list({ prefix: "user:", limit: 100, cursor });
```

`get()` second arg: `"text"` (default), `"json"`, `"arrayBuffer"`, `"stream"`.

Bulk read API: `getBulk()` — counted as a single subrequest regardless of key count.

### 9.3 Consistency model

- **Read your writes** in the *same POP*: usually immediate.
- **Other POPs**: up to 60 seconds for the cached prior value to TTL.
- Writes from same POP propagate via push + lazy pull from central store.

Writes via Binding API: rate-limited to **1 write/second/key**, unlimited across keys. Writes via REST API: shares the global REST API rate limit.

### 9.4 Limits

| Metric                        | Limit                                        |
| ----------------------------- | -------------------------------------------- |
| Namespace count per account   | **1000** (raised from 200 in Jan 2025)        |
| Maximum key size              | 512 bytes                                    |
| Maximum value size            | 25 MiB                                       |
| Maximum metadata size         | 1024 bytes                                   |
| Maximum keys per namespace    | Unlimited                                    |
| Min TTL                       | 60 seconds                                   |
| Default cache TTL             | 60 seconds (configurable up to forever)      |

### 9.5 Pricing

| Metric        | Free            | Paid                              |
| ------------- | --------------- | --------------------------------- |
| Keys read     | 100,000/day     | 10M/mo + $0.50/M                  |
| Keys written  | 1,000/day       | 1M/mo + $5.00/M                   |
| Keys deleted  | 1,000/day       | 1M/mo + $5.00/M                   |
| List requests | 1,000/day       | 1M/mo + $5.00/M                   |
| Stored data   | 1 GB            | 1 GB + $0.50/GB-mo                |

Bulk reads are billed per-key.

### 9.6 KV vs D1 — when to use which

| Pattern                                | Use   |
| -------------------------------------- | ----- |
| Read-heavy, infrequent writes          | **KV** |
| Configuration / feature flags / allow-lists | **KV** |
| Per-request session lookups            | **KV** (or DO if strongly consistent needed) |
| Relational queries / joins             | **D1** |
| Multi-row transactions                 | **D1** |
| Need write-after-write consistency     | **D1** or **DO** |
| Counter / rate limiter / coordination  | **DO** (KV won't do atomic increments) |
| Storing many MB per key                | **R2** (KV value cap 25 MiB but pricing model wrong for binaries) |

### 9.7 Office Town fit

Not currently in `wrangler.jsonc`. Add when needed for:
- Session cookies (auth signed JWT validation cache)
- Rate-limit counters (with `expirationTtl` for sliding-window)
- Feature flags / install configuration not worth a D1 row
- Cache of computed embeddings / fleet roster for sub-ms reads

v1.0: skip unless friction shows. v1.1: likely a small `CONFIG` namespace.

---

## 10. Vectorize (vector DB)

Cloudflare's managed vector database. Used for semantic search, retrieval-augmented generation (RAG), recommendation systems.

### 10.1 Binding

```jsonc
{
  "vectorize": [
    { "binding": "VECTOR_INDEX", "index_name": "office-town-vec" }
  ]
}
```

Index is created out-of-band via wrangler (not auto-created on first use):

```bash
npx wrangler vectorize create office-town-vec \
  --dimensions=768 --metric=cosine
```

### 10.2 Worker API

```ts
await env.VECTOR_INDEX.insert([
  { id: "page:123", values: [/* floats */], metadata: { docId: "123", type: "wiki" } }
]);

await env.VECTOR_INDEX.upsert([{ id, values, metadata }]);

const matches = await env.VECTOR_INDEX.query(queryVector, {
  topK: 10,
  returnValues: false,
  returnMetadata: "indexed",
  filter: { type: "wiki", lang: "en" },
  namespace: "tenant-foo",
});

await env.VECTOR_INDEX.deleteByIds(["page:123"]);
const list = await env.VECTOR_INDEX.getByIds(["page:123"]);
const page = await env.VECTOR_INDEX.list({ cursor, limit: 100 });
```

### 10.3 Distance metrics

- `cosine` — normalised similarity, 1.0 = identical, range -1..1 (or 0..1 if vectors normalised).
- `euclidean` — straight L2 distance, lower = closer.
- `dot-product` — inner product; cheapest if vectors are pre-normalised.

Pick at index creation; **cannot be changed later** without recreating.

### 10.4 Metadata indexes (CRITICAL — order matters)

**Metadata indexes must be created BEFORE inserting vectors.** Vectors inserted before metadata index creation are NOT retroactively indexed — filtered queries return 0 results.

```bash
# CORRECT ORDER
npx wrangler vectorize create office-town-vec --dimensions=768 --metric=cosine
npx wrangler vectorize create-metadata-index office-town-vec \
  --property-name=type --type=string
npx wrangler vectorize create-metadata-index office-town-vec \
  --property-name=tenant --type=string
# NOW insert vectors

# WRONG ORDER (existing vectors NOT filterable)
```

To fix existing index: delete + recreate index, create metadata indexes, re-insert all vectors. (See `rules/cloudflare-storage.md`.)

### 10.5 Limits (V2 indexes — current default)

| Feature                                                | Limit                                |
| ------------------------------------------------------ | ------------------------------------ |
| Indexes per account                                    | 50,000 (Paid) / 100 (Free)            |
| Maximum dimensions per vector                          | **1536** (float32)                    |
| Maximum vector ID length                               | 64 bytes                              |
| Metadata per vector                                    | 10 KiB                                |
| topK with values or `returnMetadata: "all"`            | **50** (raised from 20 in Mar 2026)   |
| topK without values + metadata                         | 100                                   |
| Upsert batch size                                      | 1000 (Workers) / 5000 (HTTP API)      |
| Vectors per index                                      | **10 million** (raised from 5M, Jan 2026) |
| Namespaces per index                                   | 50,000 (Paid) / 1000 (Free)           |
| Maximum upload size (single insert/upsert call)        | 100 MB                                |
| Metadata indexes per Vectorize index                   | 10                                    |
| Indexed data per metadata index per vector             | 64 bytes                              |

### 10.6 Pricing

| Metric                        | Free               | Paid                                                 |
| ----------------------------- | ------------------ | ---------------------------------------------------- |
| Queried vector dimensions     | 30M/mo             | 50M/mo included + **$0.01 per million**              |
| Stored vector dimensions      | 5M total           | 10M included + **$0.05 per 100M**                    |

Formula: `((queried + stored) * dims * $0.01/1M) + (stored * dims * $0.05/100M)`

Example: 50k stored × 768 dims = 38.4M stored dimensions. 200k queries/mo × 768 = 153.6M queried dimensions.

- Stored: 38.4M minus 10M included = 28.4M × $0.05/100M = **$0.014/mo**
- Queried: 153.6M minus 50M = 103.6M × $0.01/1M = **$1.036/mo**
- Total: ~$1.05/mo

Production-scale ($23.42/mo example in docs): 500k vectors @ 1536 dims, 1M queries/mo.

### 10.7 Integration with Workers AI

Vectorize pairs naturally with `@cf/baai/bge-base-en-v1.5` (768d) or `@cf/baai/bge-large-en-v1.5` (1024d) for embeddings, but you can use any embedding model:

```ts
const embed = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: query });
const matches = await env.VECTOR_INDEX.query(embed.data[0], { topK: 10 });
```

### 10.8 Office Town fit

Vectorize is **the discovery layer** for Office Town's wiki + journal corpus. v1.0: 768d cosine index `office-town-vec`. Re-embed on publish via Queue. v1.1: add per-tenant `namespace` for multi-org installs.

---

## 11. Durable Objects

Singletons-with-storage. Each DO is globally unique by `id` (derived from a `name` or freshly generated), provides serialized access to a single point of coordination + private SQLite storage.

### 11.1 Binding

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "ROOMS", "class_name": "Room" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["Room"] }
  ]
}
```

The migration tag is required when adding/renaming/deleting DO classes. `new_sqlite_classes` opts into the modern SQLite backend (recommended for all new classes).

### 11.2 Class

```ts
import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {
  async fetch(request) { /* HTTP */ }
  async alarm() { /* scheduled wakeup */ }
  async webSocketMessage(ws, message) { /* ... */ }
  async webSocketClose(ws, code, reason, wasClean) { /* ... */ }
  async webSocketError(ws, error) { /* ... */ }
}
```

### 11.3 Invoking from a Worker

```ts
const id = env.ROOMS.idFromName("room-42");
const stub = env.ROOMS.get(id);

const resp = await stub.fetch("https://internal/load", { method: "POST" });
const result = await stub.someMethod(arg1, arg2);
```

### 11.4 Storage — SQLite backend (recommended)

Inside the DO class, use `this.ctx.storage.sql` for SQL operations and `this.ctx.storage.put/get/delete/deleteAll` for the synchronous KV-style API.

SQLite-backed DOs also have:
- **Point-in-Time Recovery** — restore to any moment in the last 30 days.
- **Full SQL** including JOINs, indices, transactions.
- Synchronous SQL API (cursor pattern) — much lower per-statement overhead than D1.

### 11.5 Alarms

```ts
await this.ctx.storage.setAlarm(Date.now() + 60_000);
const next = await this.ctx.storage.getAlarm();
await this.ctx.storage.deleteAlarm();

async alarm() {
  // exactly-once delivery best effort; runtime auto-retries on uncaught errors
}
```

### 11.6 WebSockets — hibernation pattern

```ts
async fetch(request) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  this.ctx.acceptWebSocket(server);
  return new Response(null, { status: 101, webSocket: client });
}
async webSocketMessage(ws, msg) {
  // DO has been hibernated; this method wakes it
}
```

Hibernation = idle DO is unloaded from memory; in-memory state lost, persisted SQLite state survives. Wakes on next event.

### 11.7 Limits

| Metric                                         | Limit                                              |
| ---------------------------------------------- | -------------------------------------------------- |
| DOs per Worker script                          | Identical to Workers script limits                  |
| Storage per DO                                  | 10 GB (Paid) / 5 GB total per account (Free)        |
| CPU time per request invocation                 | 30 s (resets on each incoming request/message)      |
| Maximum SQL statement size                      | Same as D1                                          |
| WebSocket connections per DO                    | 32,768 (per the runtime; practical limit lower)     |

### 11.8 Pricing (SQLite backend, Jan 2026+)

| Metric         | Free          | Paid                                                |
| -------------- | ------------- | --------------------------------------------------- |
| Rows read      | 5M/day        | 25B/mo + $0.001/M                                   |
| Rows written   | 100k/day      | 50M/mo + $1.00/M                                    |
| Storage        | 5 GB total    | 5 GB + $0.20/GB-mo                                  |
| Requests       | (Workers free) | (Workers paid)                                     |
| Duration       | $12.50/M GB-s | (after free tier)                                    |

Each `setAlarm()` counts as 1 row written. KV operations on SQLite-backed DOs (get/put/delete/list) bill as rows read/written.

### 11.9 Office Town fit

**Not used in v1.0 — Office Town is "single Worker, stateless".** Future v1.1 candidates:
- Live collaboration on wiki pages (WebSocket + CRDT).
- Per-fleet agent rate limiter (atomic counters).
- Long-running multi-step agent runs that need WebSocket hibernation.

Document but don't ship.

---

## 12. Hyperdrive (Postgres/MySQL acceleration)

Connection pool + query cache + edge connection setup for external Postgres / MySQL. Use when you have an existing Postgres/MySQL you can't migrate to D1 (e.g. RDS, Supabase, Neon, PlanetScale).

### 12.1 Binding

```jsonc
{
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<config-id>" }
  ]
}
```

Created via wrangler:

```bash
npx wrangler hyperdrive create my-pg \
  --connection-string="postgres://user:pwd@host:5432/db"
```

Requires `nodejs_compat` (database drivers depend on it).

### 12.2 Worker API

```ts
import postgres from "postgres";

export default {
  async fetch(request, env, ctx) {
    const sql = postgres(env.HYPERDRIVE.connectionString);
    const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
    ctx.waitUntil(sql.end());
    return Response.json(rows);
  }
};
```

Hyperdrive operates in **transaction-mode pooling**: each transaction (or single query) borrows a connection from the pool, returns it after `COMMIT`/`ROLLBACK`. `SET` statements only persist for the duration of an explicit `BEGIN`/`COMMIT` block.

### 12.3 Query caching

Read queries (SELECT) are cached by Hyperdrive for `max_age` seconds. Writes invalidate by table. Configure cache or disable per-config.

### 12.4 Recommended driver: node-postgres (pg)

Best Hyperdrive compatibility, supported by most ORMs (Drizzle, Prisma, Knex). `postgres.js` also supported. MySQL: `mysql2`.

### 12.5 Pricing

| Metric           | Free        | Paid       |
| ---------------- | ----------- | ---------- |
| Database queries | 100k/day    | Unlimited  |

No charge for pooling, caching, or egress.

### 12.6 Office Town fit

**Not used.** Office Town runs everything on D1 — no external Postgres. Document for v2 if "BYO database" enters scope (e.g. some org wants Office Town to wiki-fy their existing Postgres knowledge base).

---

## 13. Queues

Worker-to-Worker message bus. Producer Workers `send()` messages; Consumer Workers receive batched deliveries. Built-in retries + dead-letter queues.

### 13.1 Bindings

```jsonc
{
  "queues": {
    "producers": [
      { "binding": "INDEX_QUEUE", "queue": "office-town-index" }
    ],
    "consumers": [
      {
        "queue": "office-town-index",
        "max_batch_size": 10,
        "max_batch_timeout": 5,
        "max_retries": 3,
        "max_concurrency": 5,
        "dead_letter_queue": "office-town-index-dlq",
        "retry_delay": 60
      }
    ]
  }
}
```

### 13.2 Producer API

```ts
await env.INDEX_QUEUE.send({ pageId: 123, op: "embed" });
await env.INDEX_QUEUE.send(msg, { delaySeconds: 60, contentType: "json" });
await env.INDEX_QUEUE.sendBatch([
  { body: msg1 },
  { body: msg2, delaySeconds: 30 }
]);
```

### 13.3 Consumer handler

```ts
export default {
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        await processMessage(message.body, env);
        message.ack();
      } catch (err) {
        message.retry({ delaySeconds: 60 });
      }
    }
  }
};
```

If you don't call `ack()`/`retry()`, the message follows the default rule: batch success -> all acked; batch throws -> all retried.

### 13.4 Delivery semantics

- **At-least-once delivery.** Duplicates possible — make consumers idempotent.
- Retries: configurable, default 3, max 100. Each retry is a separate read (billed).
- Failed-past-max-retries messages -> DLQ (if configured) or discarded.
- Retried messages stay invisible until `retry_delay` elapses.

### 13.5 Concurrency autoscaling

Consumers autoscale based on backlog + error rate. Max concurrency: configurable (`max_concurrency`), capped at the queue's published per-second limit.

### 13.6 Limits

| Metric                              | Limit                          |
| ----------------------------------- | ------------------------------ |
| Queues per account                  | 10,000                         |
| Message size                        | 128 KB                         |
| Maximum retries                     | 100                            |
| Consumer batch size                 | 100 messages                   |
| `sendBatch()` max                   | 100 messages OR 256 KB         |
| Maximum batch wait time             | 60 seconds                     |
| Per-queue message throughput        | **5000 msgs/s** (raised 2025)  |
| Message retention                   | Configurable up to **14 days** |
| Per-queue backlog size              | 25 GB                          |
| Pull consumer rate                  | 5000 msgs/s/queue              |

### 13.7 Pull consumers (HTTP)

Consume messages from non-Workers infrastructure:

```bash
curl "https://api.cloudflare.com/client/v4/accounts/${ACCT}/queues/${Q}/messages/pull" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{ "visibility_timeout": 10000, "batch_size": 10 }'
```

Useful for: bridging to non-CF workers, on-prem consumers, language ecosystems not yet on Workers.

### 13.8 Pricing

| Metric    | Free | Paid                       |
| --------- | ---- | -------------------------- |
| Operations | n/a  | $0.40 per million ops      |

An operation = 1 read OR 1 write OR 1 delete. Each retry counts as +1 read.

No egress charges.

### 13.9 Office Town fit

Current config uses `INDEX_QUEUE` for re-indexing wiki pages on publish. Right call. v1.1: add a `WEBHOOK_QUEUE` for outbound integrations + a DLQ pattern.

---

## 14. Workflows (durable execution)

Multi-step orchestrations with checkpointed steps, automatic retries, sleep/wait, and exactly-once semantics per step. Survives Worker isolate recycles + redeploys.

### 14.1 Binding

```jsonc
{
  "workflows": [
    { "name": "indexing", "binding": "INDEXING", "class_name": "IndexingWorkflow" }
  ]
}
```

### 14.2 Class

```ts
import { WorkflowEntrypoint } from "cloudflare:workers";

export class IndexingWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const page = await step.do("fetch page", async () => {
      return await loadPage(this.env, event.payload.pageId);
    });

    await step.sleep("rate limit", "5 seconds");

    const embedding = await step.do(
      "generate embedding",
      { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" } },
      async () => await this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: page.body })
    );

    await step.waitForEvent("await approval", { event: "approved", timeout: "24 hours" });

    await step.do("store", async () => {
      await this.env.VECTOR_INDEX.upsert([{ id: page.id, values: embedding.data[0] }]);
    });
  }
}
```

### 14.3 Invoking

```ts
const instance = await env.INDEXING.create({ params: { pageId: "123" } });
const status = await instance.status();
await instance.terminate();
await instance.pause();
await instance.resume();
await instance.sendEvent({ type: "approved", payload: {} });
```

### 14.4 Step semantics

- Each `step.do` is checkpointed — if the Worker dies mid-step, the next replay re-runs only the failed step.
- Step return values are JSON-serialised and persisted; **max 1 MB per step result** (store large binary in R2, pass the key).
- `step.sleep("5 minutes")` and `step.sleepUntil(new Date(...))` survive isolate recycling.
- `step.waitForEvent(name, { timeout })` blocks for an externally-sent event.

### 14.5 Retry config

```ts
step.do("name", {
  retries: { limit: 5, delay: "30 seconds", backoff: "exponential" },
  timeout: "10 minutes"
}, async () => { /* ... */ });
```

Step context (since Mar 2026): `step.do("name", async (ctx) => { /* ctx.attempt is 1-indexed */ })`.

### 14.6 Limits

| Metric             | Limit                                                   |
| ------------------ | ------------------------------------------------------- |
| Per-step CPU       | Same as Workers (default 30 s, max 5 min via `limits.cpu_ms`) |
| Per-step output    | 1 MB                                                    |
| Workflow duration  | Unbounded (steps can sleep days/weeks)                  |
| Concurrent instances | Per Workers script limits                              |

### 14.7 Pricing

| Metric          | Free                                  | Paid                                                       |
| --------------- | ------------------------------------- | ---------------------------------------------------------- |
| Requests        | Shares Workers daily 100k             | Shares Workers 10M/mo + $0.30/M                            |
| CPU time        | 10 ms cap per invocation              | 30M CPU ms/mo + $0.02/M                                    |
| Storage         | 1 GB                                  | 1 GB included + $0.20/GB-mo (billing live since Sep 2025) |

### 14.8 Workflows vs Queues vs Durable Objects

| Pattern                                        | Use                          |
| ---------------------------------------------- | ---------------------------- |
| Fire-and-forget message processing             | **Queues**                   |
| Linear N-step pipeline with sleeps/waits       | **Workflows**                |
| Stateful coordination, WebSockets, real-time   | **Durable Objects**          |
| Background indexer (1 page -> 1 message)        | **Queues**                   |
| Human-in-loop approval chain                   | **Workflows** (`waitForEvent`) |
| Per-customer state machine                     | **Durable Objects**          |
| Multi-tenant per-tenant async work             | **Queues + Workflows** combo |

### 14.9 Office Town fit

v1.0: not strictly needed — `INDEX_QUEUE` covers async embedding. v1.1: a `PUBLISH_WORKFLOW` for "draft -> review -> publish -> backlink scan -> re-embed -> notify" multi-step flows. v1.5+: human-in-loop approval for fleet-published content.

---

## 15. Pipelines (event ingestion)

High-volume event ingestion -> SQL transformation -> R2 (often as Apache Iceberg tables in R2 Data Catalog). Designed for analytics, log shipping, e-commerce events at scale.

### 15.1 Components

- **Stream** — accepts events via HTTP endpoint or Worker binding, with a typed JSON schema.
- **Sink** — destination (R2 bucket or R2 Data Catalog table) with format (Parquet / JSON / Iceberg) and compression.
- **Pipeline** — SQL statement connecting stream -> sink, optionally transforming.

### 15.2 Setup

```bash
npx wrangler pipelines setup
```

Auto-creates R2 bucket + data catalog if missing.

### 15.3 Binding (Worker producer)

```jsonc
{
  "pipelines": [
    { "binding": "STREAM", "pipeline": "ecommerce-stream" }
  ]
}
```

```ts
await env.STREAM.send([
  { user_id: "u1", event_type: "view", product_id: "p42", amount: null },
  { user_id: "u1", event_type: "purchase", product_id: "p42", amount: 19.99 }
]);
```

Since Feb 2026: `wrangler types` generates typed bindings — schema mismatches caught at compile time.

### 15.4 Querying ingested data

R2 SQL queries Iceberg tables in R2 directly:

```bash
npx wrangler r2 sql query "SELECT user_id, COUNT(*) FROM ecommerce_table GROUP BY user_id"
```

### 15.5 Office Town fit

**Skip.** Office Town events are O(100s/day per install), not the O(millions/sec) Pipelines is built for. Use D1 + a simple `events` table.

---

## 16. Pages to Workers Assets

### 16.1 Status (May 2026)

Cloudflare Pages is **not officially "deprecated"** but Cloudflare's own best-practices guide says explicitly:

> *"Workers Static Assets is the recommended way to deploy static sites, single-page applications, and full-stack apps on Cloudflare. If you are starting a new project, use Workers instead of Pages."*

> *"Pages continues to work, but new features and optimizations are focused on Workers."*

Workers Sites (the original 2019-era static-asset solution via KV) **is deprecated** in Wrangler v4.

### 16.2 Feature gap (Workers Assets > Pages)

Pages projects cannot use:
- Durable Objects (partial)
- Cron Triggers
- Workers Logs / Logpush / Tail Workers
- Source maps
- All-in-one observability

Workers Assets gets all of these.

### 16.3 Migration path

`/migrate-from-pages` skill exists. Common steps:
1. Move `_worker.js` content to standard ES module export.
2. Replace Pages Functions (`functions/api/foo.ts`) with Hono or chi-style routing.
3. Add `assets: { directory, binding }` to wrangler.jsonc.
4. Redeploy via `wrangler deploy`.

### 16.4 Office Town fit

Office Town is greenfield -> use **Workers Assets** (§17). Pages does not enter the conversation.

---

## 17. Workers Assets (static hosting)

The modern static asset binding inside a Worker. Replaces Pages + Workers Sites.

### 17.1 Static-only site (no Worker code)

```jsonc
{
  "name": "my-site",
  "compatibility_date": "2026-05-28",
  "assets": { "directory": "./dist" }
}
```

That's the whole config — `wrangler deploy` serves `./dist` from CF's CDN at `<name>.<subdomain>.workers.dev`.

### 17.2 Full-stack site (static + API)

```jsonc
{
  "name": "office-town",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-28",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/auth/*"]
  }
}
```

Routing precedence:
1. If a static file matches the path -> serve from CDN, **don't invoke the Worker** (free + fast).
2. Else (or matches `run_worker_first`) -> Worker handles via `fetch()`.
3. Inside the Worker, fall back: `return env.ASSETS.fetch(request);`

### 17.3 `not_found_handling` options

- `none` (default) — return 404 for missing paths.
- `404-page` — serve `404.html` from assets.
- `single-page-application` — serve `index.html` for any unmatched path (SPA routing).

### 17.4 `run_worker_first`

Critical for SPA + API workers. **`/api/*` must hit the Worker, not the SPA's index.html.**

```jsonc
"run_worker_first": ["/api/*", "/auth/*", "/oauth/callback/*"]
```

Without this, `/api/auth/callback/google` falls back to `index.html` -> OAuth breaks silently (see `rules/better-auth-cloudflare.md`).

### 17.5 Limits

| Metric                              | Free       | Paid        |
| ----------------------------------- | ---------- | ----------- |
| Files per Worker version            | 20,000     | 100,000     |
| Individual file size                | 25 MiB     | 25 MiB      |
| Requests to static assets           | Free + unlimited | Free + unlimited |

Headers + redirects can be configured via `_headers` and `_redirects` files in the asset directory (same format as Pages).

### 17.6 Office Town fit

v1.0: skip — Office Town has no SPA. v1.5: if a Goose Browser Extension UI lands inside the Worker, this is how it's served.

---

## 18. Secrets Store

Account-level secret manager. Centralised across Workers, with auditing + access control. Different from per-Worker secrets (`wrangler secret put`).

### 18.1 Binding

```jsonc
{
  "secrets_store_secrets": [
    {
      "binding": "OPENAI_KEY",
      "store_id": "demo",
      "secret_name": "openai-api-key"
    }
  ]
}
```

### 18.2 Setup via wrangler

```bash
wrangler secrets-store store create demo --remote

wrangler secrets-store secret create demo \
  --name openai-api-key --scopes workers --remote

wrangler secrets-store secret update demo --name openai-api-key --remote
```

### 18.3 Access in Worker

```ts
const apiKey = await env.OPENAI_KEY.get();
```

(Note: this differs from `wrangler secret put` which gives you `env.OPENAI_KEY` as a synchronous string.)

### 18.4 vs `wrangler secret put`

| Concern                                  | `wrangler secret put`                  | Secrets Store                       |
| ---------------------------------------- | -------------------------------------- | ----------------------------------- |
| Scope                                    | Per Worker                             | Account-wide                        |
| Shared across Workers                    | No — must duplicate                     | Yes — one source, many bindings     |
| Access                                   | Sync `env.NAME`                        | Async `await env.NAME.get()`        |
| Audit trail                              | Limited                                | Full audit log                      |
| IAM granularity                          | Worker-level                            | Per-secret access policies          |
| Local dev value                          | `.dev.vars`                            | `.dev.vars` + scope to `workers`    |
| Cost                                     | Free                                   | Free (beta)                         |

### 18.5 Limits

- 1 store per account (open beta).
- 100 secrets per store.
- Each secret value <= 1024 bytes.

### 18.6 Office Town fit

v1.0: use `wrangler secret put` for simplicity (one Worker, one set of secrets). v1.1: revisit if multiple Workers share secrets (e.g. a separate webhook receiver Worker reusing OPENAI_API_KEY).

---

## 19. Wrangler config — full binding catalogue

Reference list of every binding type Office Town might touch, with verbatim wrangler.jsonc snippets.

### 19.1 Top-level

```jsonc
{
  "$schema": "https://json.schemastore.org/wrangler.json",
  "name": "office-town",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-28",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "preview_urls": true,
  "keep_vars": false,
  "account_id": "..."
}
```

### 19.2 Routes / domains

```jsonc
"routes": [
  { "pattern": "officetown.au/*", "custom_domain": true },
  { "pattern": "*.officetown.au/*", "zone_id": "<zone-id>" }
]
```

### 19.3 Static assets

```jsonc
"assets": {
  "directory": "./dist/client",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

### 19.4 D1

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "office-town-d1",
    "database_id": "<uuid>",
    "migrations_dir": "drizzle"
  }
]
```

### 19.5 R2

```jsonc
"r2_buckets": [
  {
    "binding": "WIKI",
    "bucket_name": "office-town-wiki",
    "preview_bucket_name": "office-town-wiki-preview"
  }
]
```

### 19.6 KV

```jsonc
"kv_namespaces": [
  { "binding": "CACHE", "id": "<32-hex>" }
]
```

### 19.7 Vectorize

```jsonc
"vectorize": [
  { "binding": "VECTOR_INDEX", "index_name": "office-town-vec" }
]
```

### 19.8 Workers AI

```jsonc
"ai": { "binding": "AI" }
```

### 19.9 Cloudflare Images

```jsonc
"images": { "binding": "IMAGES" }
```

### 19.10 Browser Rendering

```jsonc
"browser": { "binding": "BROWSER" }
```

### 19.11 Email (Email Routing send)

```jsonc
"send_email": [
  { "name": "SEND_EMAIL" }
]
```

### 19.12 Queues

```jsonc
"queues": {
  "producers": [
    { "binding": "INDEX_QUEUE", "queue": "office-town-index" }
  ],
  "consumers": [
    {
      "queue": "office-town-index",
      "max_batch_size": 10,
      "max_batch_timeout": 5,
      "max_retries": 3,
      "dead_letter_queue": "office-town-index-dlq",
      "max_concurrency": 5,
      "retry_delay": 60
    }
  ]
}
```

### 19.13 Durable Objects

```jsonc
"durable_objects": {
  "bindings": [
    { "name": "ROOMS", "class_name": "Room" }
  ]
},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["Room"] }
]
```

### 19.14 Workflows

```jsonc
"workflows": [
  { "name": "indexing", "binding": "INDEXING", "class_name": "IndexingWorkflow" }
]
```

### 19.15 Hyperdrive

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE", "id": "<config-id>" }
]
```

### 19.16 Service Bindings (Worker to Worker RPC)

```jsonc
"services": [
  { "binding": "AUTH_WORKER", "service": "office-town-auth" }
]
```

### 19.17 Pipelines

```jsonc
"pipelines": [
  { "binding": "STREAM", "pipeline": "events-stream" }
]
```

### 19.18 Secrets Store

```jsonc
"secrets_store_secrets": [
  { "binding": "OPENAI_KEY", "store_id": "demo", "secret_name": "openai-api-key" }
]
```

### 19.19 Env vars (plaintext) + Secrets (sensitive)

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "ALLOWED_AUTH_DOMAINS": "jezweb.net"
}
```

Sensitive values -> `wrangler secret put NAME` (NOT `vars`).

### 19.20 Cron Triggers

```jsonc
"triggers": {
  "crons": ["0 */6 * * *"]
}
```

### 19.21 Observability + Traces

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1,
  "logs": { "invocation_logs": true, "head_sampling_rate": 1 },
  "traces": { "enabled": true }
}
```

### 19.22 Placement

```jsonc
"placement": { "mode": "smart" }
```

### 19.23 Custom limits

```jsonc
"limits": {
  "cpu_ms": 100000,
  "subrequests": 50000
}
```

### 19.24 Tail Workers

```jsonc
"tail_consumers": [
  { "service": "office-town-tail", "environment": "production" }
]
```

### 19.25 Environments

```jsonc
"env": {
  "staging": {
    "name": "office-town-staging",
    "vars": { "ENVIRONMENT": "staging" },
    "d1_databases": [{ "binding": "DB", "database_name": "office-town-d1-staging", "database_id": "..." }]
  }
}
```

Non-inheritable: bindings, vars, secrets. Must be declared per environment.

---

## 20. Deploy to Cloudflare button

Cloudflare's "fork + provision + deploy" flow. Anyone clicking the button gets:

1. **Repo cloned to their GitHub/GitLab account.**
2. **Resources auto-provisioned on their CF account** — D1, R2, KV, Vectorize, Durable Objects, Workers AI, Queues, Hyperdrive, Secrets Store.
3. **Workers Builds wired up** for ongoing CI/CD.
4. **wrangler.jsonc updated** with the newly minted resource IDs.

Critical for Office Town's "deploy your own" pitch.

### 20.1 Embedding the button

```markdown
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/office-town-cloud)
```

URL pattern: `https://deploy.workers.cloudflare.com/?url=<repo-url>`
Optionally specify subdirectory: `?url=<repo>&path=<subdir>`

### 20.2 What gets prompted to the user

For each binding in `wrangler.jsonc`:
- **D1 database** -> user picks a name (default from config) -> CF provisions, updates `database_id`.
- **R2 bucket** -> name -> provisions, sets `bucket_name`.
- **KV namespace** -> name -> provisions, sets `id`.
- **Vectorize index** -> name + dimensions + metric (from config) -> provisions.
- **Queues** -> name -> provisions producer + consumer queues.
- **Durable Object class** -> assumes migration declared -> provisions.
- **Workers AI / Browser / Images / send_email** -> bindings auto-active (no provisioning).

### 20.3 Default values your repo must provide

> *"To ensure successful deployment, please make sure your source repository includes default values for resource names, resource IDs and any other properties for each binding."*

In practice:
- `database_name`, `database_id` (use placeholder UUID for `database_id`).
- `bucket_name`.
- `kv_namespaces[].id` (placeholder OK).
- `vectorize[].index_name`.
- `queues.producers[].queue`, `consumers[].queue`.

Office Town's current `wrangler.jsonc` uses `database_id: "00000000-0000-0000-0000-000000000000"` — correct placeholder pattern.

### 20.4 Env vars + secrets via the button

Env vars: declared in `wrangler.jsonc` `vars` — copied across.

Secrets: declared in **`.dev.vars.example`** or **`.env.example`** in the repo:

```dotenv
# .dev.vars.example
COOKIE_SIGNING_KEY=  # required, generate with `openssl rand -hex 32`
OPENAI_API_KEY=      # required, get from platform.openai.com
SMTP2GO_API_KEY=     # optional, for SMTP2Go fallback
```

The user is prompted for each blank value during the deploy flow. Comments after `#` are shown as help text. Required vs optional is by convention (blank = required, value = default).

Secrets Store secrets: declared in `wrangler.jsonc` as normal — user is prompted to enter values, which get stored in their Secrets Store on deploy.

### 20.5 Sharing existing apps

Once you've deployed an app via Workers Builds, the dashboard's "Share" button generates a Deploy-to-Cloudflare snippet for that exact repo.

### 20.6 Office Town fit

**Primary deployment mechanism.** Every Office Town README, install doc, and marketing page links to this button. The repo MUST keep `wrangler.jsonc` resource placeholders + a thorough `.dev.vars.example`.

---

## 21. Cloudflare's official MCP servers

GitHub: `github.com/cloudflare/mcp-server-cloudflare`. Each is deployed as a hosted MCP at a stable URL.

| Server | URL | Purpose |
| --- | --- | --- |
| **Code mode** (full API) | `https://mcp.cloudflare.com/mcp` | Broad access to the full Cloudflare API via code execution, minimal token overhead |
| **Workers Bindings** | `https://bindings.mcp.cloudflare.com/mcp` | Build Workers apps with storage, AI, compute primitives |
| **Workers Builds** | `https://builds.mcp.cloudflare.com/mcp` | Get insights + manage Workers Builds |
| **Observability** | `https://observability.mcp.cloudflare.com/mcp` | Debug + inspect app logs + analytics |
| **Documentation** | `https://docs.mcp.cloudflare.com/mcp` | Search up-to-date Cloudflare docs |
| **GraphQL** | `https://graphql.mcp.cloudflare.com/mcp` | Analytics via Cloudflare's GraphQL API |
| **AI Gateway** | `https://ai-gateway.mcp.cloudflare.com/mcp` | Search AI Gateway logs, prompts/responses |
| **Audit Logs** | `https://auditlogs.mcp.cloudflare.com/mcp` | Query account audit logs |
| **Browser Rendering** | `https://browser.mcp.cloudflare.com/mcp` | Fetch web pages -> markdown / screenshots |
| **Container** | `https://containers.mcp.cloudflare.com/mcp` | Spin up sandbox dev environments |
| **DNS Analytics** | `https://dns-analytics.mcp.cloudflare.com/mcp` | Optimize DNS performance + debug |
| **Logpush** | `https://logs.mcp.cloudflare.com/mcp` | Summarise Logpush job health |
| **Radar** | `https://radar.mcp.cloudflare.com/mcp` | Internet traffic insights, URL scans |
| **Cloudflare One CASB** | `https://casb.mcp.cloudflare.com/mcp` | Identify SaaS app security misconfigs |
| **Digital Experience Monitoring** | `https://dex.mcp.cloudflare.com/mcp` | Critical-app monitoring insights |

### 21.1 Auth model

OAuth flow — user authorises the MCP server against their CF account via dashboard prompt.

### 21.2 Office Town fit

Goose-running Office Town fleets benefit from:
- **bindings.mcp.cloudflare.com/mcp** — for an agent to create + bind a new D1 database for a workspace expansion.
- **observability.mcp.cloudflare.com/mcp** — for an agent to debug "why is this page slow?" via logs.
- **docs.mcp.cloudflare.com/mcp** — for an agent to look up "how do I add a Queue?" with current syntax.

These should be in the Office Town Goose extensions catalogue.

---

## 22. Office Town relevance matrix (v1.0 to v2)

> When in v1.x or never. Phase aligns with current ship plan.

| Capability | v1.0 | v1.1 | v2 | Never | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| **Workers runtime** | x | | | | The whole product is one Worker. |
| **Compatibility date refresh** | x | | | | Bump to today's date. |
| **nodejs_compat** | x | | | | Already on. |
| **Workers Builds** | x | | | | Deploy-button user gets this auto-wired. |
| **Smart Placement** | x | | | | Already on; harmless. |
| **Cron Triggers** | x | | | | Already configured `0 */6 * * *`. |
| **Workers Logs** | x | | | | Already enabled. |
| **Workers Traces** | | x | | | Add when debugging perf becomes routine. |
| **Tail Workers** | | | x | | Only for centralised fleet log shipping. |
| **Logpush** | | | x | | Same — Enterprise log retention. |
| **D1 (FTS5)** | x | | | | Spine of the wiki. |
| **D1 Read Replication** | | x | | | If multi-region installs become a thing. |
| **R2 (Standard)** | x | | | | `WIKI` + `FILES` buckets. |
| **R2 Infrequent Access** | | | x | | If wiki snapshots grow huge. |
| **R2 presigned URLs** | x | | | | For browser-direct uploads > 10 MB. |
| **R2 event notifications -> Queue** | | x | | | "PDF uploaded -> embed it" pipelines. |
| **KV** | | x | | | Sessions, feature flags, rate limit. |
| **Vectorize** | x | | | | Embedding-backed wiki search. |
| **Vectorize namespaces** | | x | | | Per-tenant separation. |
| **Durable Objects (SQLite backend)** | | | x | | Live collab, real-time fleet coordination. |
| **Durable Objects (WebSockets + hibernation)** | | | x | | Multiplayer editing. |
| **Workers AI binding** | x | | | | Already bound; embeddings + chat. |
| **Cloudflare Images binding** | x | | | | Already bound; on-upload resize/EXIF strip. |
| **Browser Rendering binding** | x | | | | Already bound; "save URL as wiki page". |
| **Email (send_email via Routing)** | x | | | | Already bound. |
| **Email Routing inbound** | | x | | | "email-to-wiki" feature. |
| **Queues (producer + consumer)** | x | | | | Already configured `INDEX_QUEUE`. |
| **Queues DLQ** | | x | | | Tighten when re-index failures hit. |
| **Queues pull consumers (HTTP)** | | | x | | Only if external consumer ever needed. |
| **Workflows** | | x | | | "draft -> review -> publish -> embed" chain. |
| **Workflows `waitForEvent`** | | | x | | Human-in-loop approval gates. |
| **Hyperdrive** | | | | x | Office Town uses D1, not external Postgres. |
| **Pipelines** | | | | x | Volume mismatch — D1 events table fine. |
| **Pages** | | | | x | Greenfield -> Workers Assets directly. |
| **Workers Assets (static SPA)** | | | x | | If a browser-extension/admin SPA ships. |
| **Secrets Store** | | x | | | Switch from `wrangler secret put` once multiple Workers share secrets. |
| **Wrangler config — full binding catalogue** | x | | | | §19 = the reference. |
| **Deploy to Cloudflare button** | x | | | | Primary install path. |
| **Cloudflare MCP servers (bindings + docs + observability)** | x | | | | Document in Goose extensions catalogue. |
| **Cloudflare MCP servers (CASB / DEX / Radar)** | | | | x | Out of scope for a wiki + agents product. |

---

## Appendix A — Office Town's current wrangler.jsonc annotated

```jsonc
{
  "$schema": "https://json.schemastore.org/wrangler.json",
  "name": "office-town",
  "main": "src/index.ts",
  // FIX: bump to today's date 2026-05-28 to pick up subrequest raise + DO deleteAll
  "compatibility_date": "2025-01-15",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "observability": {
    "enabled": true,
    "logs": { "invocation_logs": true, "head_sampling_rate": 1 }
  },

  "d1_databases": [{
    "binding": "DB",
    "database_name": "office-town-d1",
    "database_id": "00000000-0000-0000-0000-000000000000",
    "migrations_dir": "drizzle"
  }],

  "r2_buckets": [
    { "binding": "WIKI", "bucket_name": "office-town-wiki", "preview_bucket_name": "office-town-wiki-preview" },
    { "binding": "FILES", "bucket_name": "office-town-files", "preview_bucket_name": "office-town-files-preview" }
  ],

  "vectorize": [{ "binding": "VECTOR_INDEX", "index_name": "office-town-vec" }],
  // RISK: metadata indexes must be declared in setup script BEFORE first vector insert

  "ai": { "binding": "AI" },
  "browser": { "binding": "BROWSER" },
  "images": { "binding": "IMAGES" },

  "send_email": [{ "name": "SEND_EMAIL" }],

  "queues": {
    "producers": [{ "binding": "INDEX_QUEUE", "queue": "office-town-index" }],
    "consumers": [{
      "queue": "office-town-index",
      "max_batch_size": 10,
      "max_batch_timeout": 5,
      "max_retries": 3
      // CONSIDER: add "dead_letter_queue": "office-town-index-dlq" for v1.1
    }]
  },

  "vars": {
    "ENVIRONMENT": "production",
    "ALLOWED_AUTH_DOMAINS": "jezweb.net,jezweb.com.au",
    "DEFAULT_FROM_EMAIL": "agent@example.com",
    "DEFAULT_FROM_NAME": "Office Town Agent"
  },

  "triggers": { "crons": ["0 */6 * * *"] },

  "placement": { "mode": "smart" }
}
```

---

## Appendix B — Cross-references to ~/.claude/rules

- `cloudflare-workers.md` — bindings vs API keys, custom-domain drift, HTMLRewriter entity decoding, DO alarm resilience, WASM + memory in Workflows, step output 1MB cap, Browser Integrity Check + webhooks, AI Gateway warnings.
- `cloudflare-storage.md` — D1 bulk insert batching, D1 snake_case vs camelCase, D1 migration workflow, SQLite `weeks` modifier, Vectorize metadata index ordering.
- `cloudflare-email-routing.md` — subdomain MX conflicts with root Google Workspace, diagnose via SMTP2Go activity logs.
- `better-auth-cloudflare.md` — `nodejs_compat` flag required, `run_worker_first` for OAuth callbacks, `wrangler secret put` newline gotcha, D1 + Drizzle adapter notes.
- `workers-ai-gotchas.md` — model selection per workload, FLUX 1/2 API differences, Vectorize integration patterns.
- `pwa-navigate-fallback.md` — `navigateFallbackDenylist` for API routes when shipping a PWA.

---

## Appendix C — Compatibility date / feature crosswalk

| Feature | Compat date / flag required |
| --- | --- |
| `nodejs_compat` built-in Node APIs | >= `2024-09-23` + `nodejs_compat` flag |
| `nodejs_compat_v2` polyfills (auto) | >= `2024-09-23` + `nodejs_compat` (auto) |
| `r2_list_honor_include` | >= `2022-08-04` OR flag |
| DO `deleteAll()` clears alarm | >= `2026-02-24` |
| Vectorize metadata `returnMetadata` option | >= `2024-11-26` (always-true via flag pre-date) |
| Workers Builds `CF_PAGES_*` env vars | Build-time injection (no compat date) |
| Subrequests > 1000 | Wrangler `limits.subrequests` set (any compat date) |

---

**End of foundation document. Companion docs to follow:**
- `cloudflare-knowledge-02-ai-compute-edge.md` — Workers AI, AI Gateway, Browser Rendering, Containers, Images.
- `cloudflare-knowledge-03-networking-security.md` — Routing, Zero Trust, WAF, Turnstile, Workers VPC (only what touches Office Town).
- `cloudflare-knowledge-04-developer-experience.md` — Wrangler v4, Vite plugin, local dev, remote bindings, testing.
