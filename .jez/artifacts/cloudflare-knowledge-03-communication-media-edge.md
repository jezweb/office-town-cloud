# Cloudflare Knowledge — Communication, Media, Sandboxes, Edge

> Domain 3 of the Office Town Cloud knowledge sweep. Covers Email Routing, Realtime, Stream, Containers, Pipelines, Workflows, Pages/Assets, Browser Rendering, Cron Triggers, Tail Workers/Observability, Tunnels, Registrar, DNS/SSL/WAF, and the cloudflare/mcp + cloudflare/skills repos. Each section: API patterns, limits/costs, Office Town v1/v1.1/v2 relevance, post-deploy setup steps a user must take.
>
> Companion docs: `cloudflare-knowledge-01-*` (Workers + storage), `cloudflare-knowledge-02-*` (AI + Vectorize + Queues), and the goose-knowledge series.
>
> **Source-of-truth dates verified 2026-05-28.** Re-check pricing pages before quoting numbers to customers — Cloudflare changes them weekly.

---

## Table of contents

| Section | Office Town relevance |
|---|---|
| 1. Email Routing (inbound + send_email) | v1 — `email.send` MCP tool + inbound `email()` handler |
| 2. Realtime SFU (WebRTC) | v2 — voice agent feature, optional |
| 3. Stream (video) | v2 — video knowledge ingest, optional |
| 4. Containers / Workers Containers | v1.1 — sandboxed code execution for agents |
| 5. Pipelines | v2 — high-volume event ingestion |
| 6. Workflows | v1 — multi-step durable orchestration |
| 7. Pages → Workers Assets | v1 — dashboard SPA served via assets binding |
| 8. Browser Rendering | v1 — `browser` MCP server (fetch / screenshot / extract) |
| 9. Cron Triggers | v1 — scheduled embedding sweeps, link checks |
| 10. Tail Workers + Observability | v1 — required for production debugging |
| 11. Cloudflare Tunnel | v1 — Goose local installs reaching private resources |
| 12. Registrar | v1 — Office Town pre-purchases `*.officetown` style domains |
| 13. DNS / SSL / WAF | v1 — custom domain auto-managed certs, CSP header for dashboard |
| 14. `cloudflare/mcp` repo (12+ servers) | v1.1 — Goose users add directly; we don't reimplement |
| 15. `cloudflare/skills` repo (8 skills) | v1.1 — bundled in Office Town's Goose plugin |

---

## 1. Email Routing

> The cornerstone of `office-town-email` (one of the five Office Town MCP servers).

Cloudflare Email Routing has two layers: **inbound** (catch-all / per-address rules → Worker `email()` handler or forward to verified destination) and **outbound** (`send_email` binding, free up to 100/day, scales with paid plan). Both are zone-attached features — the domain must use Cloudflare as authoritative nameservers (full DNS, not partial CNAME).

### 1.1 What Office Town uses it for

- **Inbound** — `email()` handler on the Worker captures messages sent to `inbox@<your-domain>` and turns them into wiki pages under `agents/<slug>/inbox/`. Goose agents read them via `goanna_agents` MCP tool. Optional per-address rules let users route `support@`, `pm@`, etc. to different agent slugs.
- **Outbound** — `email.send` MCP tool wraps `env.SEB.send(new EmailMessage(...))`. SMTP2Go is the fallback for high-volume or external-destination sending. The Cloudflare path is free up to 100/day and ideal for system notifications, agent-to-human messaging within Jezweb domains, and replies.

### 1.2 Inbound: `email()` handler

```ts
// src/email.ts — Worker entry point
import PostalMime from 'postal-mime'

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const parsed = await PostalMime.parse(message.raw)
    // parsed.from, parsed.to, parsed.subject, parsed.text, parsed.html, parsed.attachments

    // Optional spam/allowlist gate
    if (!isAllowedSender(parsed.from?.address)) {
      message.setReject('Address not allowed')
      return
    }

    // Persist as wiki page
    const slug = inferAgentSlug(parsed.to)  // support@ → agent=support
    const wikiPath = `agents/${slug}/inbox/${new Date().toISOString().slice(0,10)}-${shortid()}.md`
    await env.WIKI_BUCKET.put(wikiPath, frontmatterAndBody(parsed))

    // Optional forward to a human
    if (slug === 'urgent') await message.forward('jez@jezweb.net')

    // Optional auto-reply via send_email binding (see 1.3)
    if (env.SEB) await acknowledgementReply(env.SEB, parsed)
  },
}
```

**EmailMessage runtime API:**

| Method | Purpose |
|---|---|
| `message.from` | Sender address (envelope) |
| `message.to` | Recipient address (envelope) |
| `message.raw` | `ReadableStream<Uint8Array>` of the full RFC 5322 message |
| `message.rawSize` | Size in bytes |
| `message.headers` | `Headers` object (parsed) |
| `message.setReject(reason)` | Bounce back to sender with reason |
| `message.forward(addr, headers?)` | Forward to a **verified** destination address |
| `message.reply(EmailMessage)` | Reply in-thread (uses In-Reply-To / References) |

**`postal-mime` (npm: `postal-mime`)** is the standard MIME parser for Workers — `mailparser` won't run because it needs Node streams. PostalMime works in Workers, returns `{from, to, cc, bcc, subject, text, html, attachments: [{filename, mimeType, content, contentId}], headers}`.

### 1.3 Outbound: `send_email` binding

```jsonc
// wrangler.jsonc — three binding flavours
"send_email": [
  // (1) Unrestricted — can send to any verified destination on the account
  { "name": "SEB" },

  // (2) Targeted — locked to one destination address
  { "name": "SEB_NOTIFY", "destination_address": "ops@jezweb.net" },

  // (3) Allowlisted — multiple specific destinations
  {
    "name": "SEB_TEAM",
    "allowed_destination_addresses": ["jez@jezweb.net", "anthro@jezweb.net"]
  }
]
```

```ts
import { EmailMessage } from 'cloudflare:email'
import { createMimeMessage } from 'mimetext'

const msg = createMimeMessage()
msg.setSender({ name: 'Office Town', addr: 'office-town@example.com' })
msg.setRecipient('user@example.com')
msg.setSubject('Your weekly digest')
msg.addMessage({ contentType: 'text/plain', data: 'Hello from your agent fleet.' })
msg.addMessage({ contentType: 'text/html', data: '<p>Hello from your agent fleet.</p>' })

const email = new EmailMessage(
  'office-town@example.com',                // From (must be on a domain with Email Routing enabled)
  'user@example.com',                        // To (must be a verified destination unless using a different sender domain config)
  msg.asRaw()                                // RFC 5322 message
)

await env.SEB.send(email)
```

**Key constraints (verified 2026-05-28):**

| Limit | Value |
|---|---|
| Free tier | **100 outbound emails per day** per zone |
| Message size | 25 MiB |
| Custom rules per domain | 200 |
| Destination addresses per account | 200 |
| Sender domain | Must be a zone with Email Routing enabled |
| Recipient | Must be a verified destination (for unrestricted binding) OR any address (with paid quota and proper SPF/DKIM) |

### 1.4 Destination verification

Before any address can receive forwarded mail or appear in `send_email` configs, Cloudflare emails a verification link to it. Click the link → address is verified → it can be used. Verification is per-account, not per-zone — verify `jez@jezweb.net` once and it works across every zone in the account.

**Post-deploy steps for Office Town:**

1. Open Cloudflare Dashboard → Email → Email Routing → Destination addresses.
2. Add `<your-email>` (the human who'll receive forwarded mail).
3. Click the verification link in the email Cloudflare sends you.
4. (If outbound) confirm at least one destination is verified — `send_email` won't activate without it.

If the dashboard shows `Email Routing is not enabled` after deploy, see "subdomain limitation" below.

### 1.5 DKIM, SPF, DMARC

When you enable Email Routing on a zone, Cloudflare auto-creates:

| Record | Purpose | Auto? |
|---|---|---|
| MX (5 records pointing to `*.mx.cloudflare.net`) | Receive mail | ✓ |
| SPF (`TXT` `v=spf1 include:_spf.mx.cloudflare.net ~all`) | Allow Cloudflare to send on behalf of your domain | ✓ |
| DKIM (CNAME records under `cf2024-1._domainkey` etc.) | Cryptographic signing | ✓ |

**DMARC is NOT auto-created** — add manually:

```
_dmarc.example.com  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; pct=100; adkim=r; aspf=r"
```

Start with `p=none` for monitoring, escalate to `p=quarantine` then `p=reject` over weeks as you confirm legitimate mail passes.

### 1.6 Subdomain limitation (per our `cloudflare-email-routing.md` rule)

**Update April 2026:** Cloudflare added an official subdomain Email Routing feature (see [docs/email-routing/setup/subdomains](https://developers.cloudflare.com/email-routing/setup/subdomains/)). Try this first. The old failure mode still applies if the **root domain uses Google Workspace MX** while the subdomain tries to use Cloudflare Email Routing — historically all `*@subdomain.example.com` returned `421 4.3.0 Upstream error`.

| If your setup is... | Email Routing works? |
|---|---|
| Root domain on Cloudflare DNS, no other MX, want inbox on root | ✓ Yes |
| Root domain on Cloudflare DNS, want inbox on `*.subdomain` only | ✓ Try the new subdomain feature first |
| Root domain on Google Workspace MX, want inbox on subdomain via Cloudflare | ⚠️ Verify with a test; may still fail |
| Root domain on third-party DNS (partial CNAME) | ✗ Won't work — needs full DNS |

**Office Town recommendation:** for first-time installs, register `<theirname>.officetown.au` (or buy a dedicated TLD) and put it fully on Cloudflare DNS. Avoid the subdomain-mixed-MX trap entirely.

### 1.7 Outbound costs beyond free tier

The 100/day free is per-zone. For larger volume, the Cloudflare Email Service (the consolidated successor to standalone Email Routing) is moving toward a metered pricing model — verify current pricing at [cloudflare.com/email-service](https://www.cloudflare.com/email-service/) before quoting customers. For now, Office Town's strategy: use the free Cloudflare path for low-volume system mail (notifications, replies), fall back to SMTP2Go for transactional bulk.

### 1.8 Office Town setup checklist

```text
[ ] Domain on Cloudflare DNS (full, not partial CNAME)
[ ] Email Routing enabled in Dashboard → Email
[ ] At least one destination address verified
[ ] (Optional) Catch-all rule → Worker (for inbox-per-agent pattern)
[ ] DMARC record added (p=none initially)
[ ] send_email binding in wrangler.jsonc declares all permitted senders
[ ] Worker email() handler deployed
[ ] Test inbound: send a message to anything@<domain>, watch wiki/inbox/ for the page
[ ] Test outbound: trigger email.send MCP tool, confirm receipt
```

---

## 2. Realtime (SFU + TURN)

Cloudflare Realtime SFU is a **Selective Forwarding Unit** for WebRTC — a serverless media server that routes audio, video, and data streams across hundreds of edge cities. Pricing: **$0.05/GB egress, 1000 GB free monthly**, combined with TURN on the same line item.

### 2.1 Use cases

| Use case | Realtime fit |
|---|---|
| 1-on-1 video calls | ✓ — replace Twilio / Daily.co |
| Multi-party conferencing (~10 participants) | ✓ — SFU model handles fanout efficiently |
| Live broadcasting (1-to-many, 100s of viewers) | ✓ — use as a WebRTC CDN |
| Voice agents (LLM speaking to user) | ✓ — pair with Workers AI for STT/TTS |
| Recording / archive | ✗ — use Stream for stored playback |

### 2.2 Architecture

```text
  Client A ──┐               ┌── Client B
             │   ┌────────┐  │
             ├──▶│   SFU  │◀─┤
             │   │ (edge) │  │
  Client C ──┘   └────────┘  └── Client D

  Pub/sub model — no "room" abstraction
  Each client pushes "local tracks" up, pulls "remote tracks" down
  SFU does NO transcoding — clients negotiate codecs themselves
```

### 2.3 API model

Realtime SFU exposes a REST API authenticated by **App ID + App Secret** (created in Dashboard → Realtime → SFU → Apps). The two atomic objects:

| Object | Purpose |
|---|---|
| **Session** | A peer's connection to the SFU |
| **Track** | A media or data stream pushed up or pulled down within a session |

Typical flow from a Worker backend:

```ts
// 1. Create a session for the user
const session = await fetch(
  `https://rtc.live.cloudflare.com/v1/apps/${env.RTC_APP_ID}/sessions/new`,
  { method: 'POST', headers: { Authorization: `Bearer ${env.RTC_APP_SECRET}` } }
).then(r => r.json())

// 2. Browser does the SDP exchange via session.sessionId
// 3. Browser pushes local tracks (mic, cam)
// 4. Other clients pull those tracks by trackName + originSessionId
// 5. All signalling happens through the SFU REST API — no STUN/TURN servers to run
```

The official getting-started has a working voice/video demo: [github.com/cloudflare/orange-meets](https://github.com/cloudflare/orange-meets) — React + Workers + Realtime, ~1500 lines, copy-paste foundation for any audio/video app.

### 2.4 Voice agents with Workers AI

The compelling pattern for Office Town v2: an agent answers a voice call, transcribes the user's speech, runs reasoning, speaks back — all on Cloudflare.

```text
   User ─[mic]─▶ Realtime SFU ─[track]─▶ Worker
                                          │
                                          ├─▶ Workers AI: @cf/deepgram/nova-3 (STT)
                                          │     ↓ transcript
                                          ├─▶ LLM (any provider) ─▶ response text
                                          │     ↓
                                          └─▶ Workers AI: @cf/deepgram/aura-2 (TTS)
                                                ↓ audio
   User ◀──[speaker]─ Realtime SFU ◀────[track]─┘
```

**Pipecat integration** — Pipecat is the open-source voice-agent framework from Daily. Cloudflare has a `pipecat-cloudflare` transport that uses Realtime as the media layer instead of Daily's hosted SFU. Same Python orchestration, runs the audio path through your Cloudflare account at $0.05/GB. See [github.com/pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) → `transports/cloudflare`.

### 2.5 Costs

| Item | Cost |
|---|---|
| SFU egress (Cloudflare → client) | $0.05/GB |
| TURN relayed traffic | $0.05/GB (same pool) |
| Free tier | 1000 GB/month combined |
| Inbound (client → Cloudflare) | Free |
| Connections, sessions | No charge |

For Office Town context: 1000 GB ≈ ~2,800 hours of 2-way audio at 128kbps, or ~50 hours of HD video. Enough for any SMB voice-agent rollout.

### 2.6 Office Town v2 plan

Realtime is **opt-in for v2**, not v1. Reasoning: most installs won't need voice, and the dashboard / wiki / MCP tools deliver value without it. When users want voice agents, they enable a separate Worker (`office-town-voice`) that imports the Realtime SDK and pairs with the existing Workers AI / wiki / MCP stack.

---

## 3. Stream (video)

Cloudflare Stream is a managed video platform: upload, transcode (HLS + MP4 + DASH), live ingest, player embed, signed URLs for private playback, AI captions.

### 3.1 Pricing

| Item | Cost |
|---|---|
| **Storage** | $5 per 1,000 video-minutes stored |
| **Delivery** | $1 per 1,000 video-minutes delivered |
| **Encoding / ingest** | Free |
| **Bandwidth** | Included in delivery |
| **Live broadcasting (zero viewers)** | Free (recording still consumes storage) |
| **Media transformations** | $0.50 per 1,000 ops, 5,000 free/month |

Buffering and preloading count toward delivery. Cached content doesn't re-bill.

### 3.2 Office Town relevance

| Scenario | Stream needed? |
|---|---|
| Upload a 20-min meeting recording, agent transcribes + indexes | ✓ Stream + AI captions |
| Demo videos embedded in wiki pages | ✓ Stream Player |
| Live broadcasting weekly all-hands | ✓ |
| Storing small clips on R2 directly | ✗ — R2 is cheaper for files < 50MB |
| Hosting marketing videos publicly | ✓ — Stream's CDN is faster than R2 |

**Decision rule for Office Town files MCP**: if a user uploads a `.mp4` to the wiki and it's < 50 MB, store it on R2 and embed via direct URL. If it's > 50 MB or they want adaptive bitrate playback, push it to Stream. The `files.convert` MCP tool can include a stream upload action when Stream is enabled in the install.

### 3.3 Upload API

```ts
// Worker: get a one-time upload URL, give it to the client
const tokenResp = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/direct_upload`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ maxDurationSeconds: 3600, creator: userId }),
  }
)
const { result } = await tokenResp.json()
// result.uploadURL — TUS-protocol URL the browser uploads to
// result.uid       — Stream video ID, store this in your DB

// Client uses tus-js-client to upload directly (no Worker bandwidth used)
```

Alternative: `fetch` + multipart for files < 200 MB straight from the Worker.

### 3.4 Player embed

```html
<!-- Public video -->
<iframe
  src="https://customer-<sub>.cloudflarestream.com/<uid>/iframe"
  style="border:none; aspect-ratio: 16/9;"
  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
  allowfullscreen
></iframe>

<!-- Or use the web component -->
<script src="https://embed.cloudflarestream.com/embed/sdk.latest.js"></script>
<stream src="<uid>" controls></stream>
```

### 3.5 Signed URLs for private videos

```ts
// Generate a 1-hour signed token
const tokenResp = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}/token`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  }
)
const { result } = await tokenResp.json()
// Use result.token in the iframe URL: https://...cloudflarestream.com/<token>/iframe
```

Useful for: agent dossiers that contain video evidence, client-only training videos, internal post-mortems with screen recordings.

### 3.6 Stream + AI

Cloudflare auto-generates captions for any uploaded video (optional, opt-in per video). Captions are queryable via the API and can be piped into the wiki's FTS5 index — making `office-town-wiki` searchable across video content.

```ts
// Enable captions on upload
await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/stream/${uid}/captions/en/generate`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
})

// Fetch captions text
const captions = await fetch(`https://customer-<sub>.cloudflarestream.com/${uid}/captions/en/vtt`)
  .then(r => r.text())
// Parse VTT → indexable plaintext → wiki body
```

### 3.7 Office Town v2 plan

Optional bolt-on. The `files.convert` MCP tool can include a `stream_upload` action when the user has Stream enabled. Without Stream, video uploads go to R2 and play via direct URL (works for short clips, not adaptive bitrate).

---

## 4. Containers / Workers Containers

Sandboxed code execution alongside Workers. Each container runs as a Durable Object instance with a Docker image, gets a port to listen on, sleeps after idle.

### 4.1 Use cases

| Use case | Container fit |
|---|---|
| Agent runs untrusted Python code (data science, plotting, regex) | ✓ — sandbox is the whole point |
| Long-running build/compile jobs | ✓ — but Workflows is often simpler |
| Existing CLI tool that's not a Worker | ✓ — wrap it in a container |
| Database (Postgres, Redis) | ✗ — use D1, KV, Hyperdrive instead |
| Stateless API endpoint | ✗ — write a regular Worker |

### 4.2 Lifecycle

```text
   Worker fetch ─▶ Durable Object ─▶ Container (cold start 1-3s)
                                       │
                                       ├─ active (sleepAfter=10m default)
                                       │
                                       └─ idle 10m → SIGTERM → 15m grace → SIGKILL

   Lifecycle hooks: onStart(), onStop(), onActivityExpired(), onError()
```

### 4.3 Wrangler config

```jsonc
{
  "name": "office-town-sandbox",
  "main": "src/worker.ts",
  "compatibility_date": "2026-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [
    {
      "class_name": "PythonSandbox",
      "image": "./Dockerfile",
      "max_instances": 10
    }
  ],
  "durable_objects": {
    "bindings": [{ "name": "PYSANDBOX", "class_name": "PythonSandbox" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["PythonSandbox"] }]
}
```

### 4.4 Container class

```ts
import { Container } from '@cloudflare/containers'

export class PythonSandbox extends Container {
  defaultPort = 8080
  sleepAfter = '5m'
  envVars = { PYTHONUNBUFFERED: '1' }

  override async onStart() {
    console.log('Container started')
  }
  override async onStop() {
    console.log('Container stopped')
  }
  override async onError(err: unknown) {
    console.error('Container error:', err)
  }
}

// Worker entry
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const id = env.PYSANDBOX.idFromName('default')
    const stub = env.PYSANDBOX.get(id)
    return stub.fetch(req)  // Routes to the container's HTTP server
  },
}
```

### 4.5 Instance types and pricing

Six configurations from "lite" (1/16 vCPU, 256 MiB, 2 GB disk) to "standard-4" (4 vCPU, 12 GiB, 20 GB).

**Included in Workers Paid ($5/mo):**

| Resource | Free quota | Overage |
|---|---|---|
| Memory | 25 GiB-hours/month | $0.0000025/GiB-second |
| CPU | 375 vCPU-minutes/month | $0.000020/vCPU-second |
| Disk | 200 GB-hours/month | $0.00000007/GB-second |
| Egress (NA/EU) | 1 TB/month | $0.025/GB |
| Egress (other) | 500 GB/month | $0.04-0.05/GB |

You only pay when a request hits the container OR you manually `start()` it. Idle (post-sleep) consumes nothing.

**Practical cost for Office Town:** an SMB running ~50 Python sandbox executions a day, each ~3s, fits comfortably in the free Workers Paid quota.

### 4.6 Cloudflare's `sandbox-sdk` skill

The `cloudflare/skills` repo ships a dedicated `sandbox-sdk` skill that covers safe code execution patterns for AI interpreters, CI/CD, and interactive development. Office Town v1.1 plan: bundle this skill into the Goose plugin so agents know how to invoke the container for untrusted code.

### 4.7 Routing patterns

**Stateful** — one container per user/conversation/agent:
```ts
const id = env.PYSANDBOX.idFromName(`user:${userId}`)
```

**Stateless load balance** — pool of N interchangeable containers:
```ts
import { getContainer } from '@cloudflare/containers'
const stub = await getContainer(env.PYSANDBOX, { instances: 5 })
```

**SSH for debug** — Wrangler can SSH into a running container:
```bash
npx wrangler containers ssh PythonSandbox
```

### 4.8 Office Town v1.1 plan

The `office-town-sandbox` MCP tool is a v1.1 add-on. v1 ships without containers to keep the install simple. v1.1 adds a `sandbox.exec` tool that an agent calls with Python/Bash code; the Worker routes to a `PythonSandbox` container with a 10 min sleepAfter.

---

## 5. Pipelines

Event ingestion at scale: HTTP endpoint or Worker binding → Cloudflare-managed durable queue → SQL transformation → R2 (Iceberg tables or Parquet/JSON files). Currently **open beta**, Workers Paid required, **no extra charge during beta** beyond standard R2 storage.

### 5.1 Three components

| Part | What |
|---|---|
| **Stream** | Buffered queue; receives events via HTTP or Worker binding; exactly-once delivery |
| **Pipeline** | SQL-based transformation (validation, filter, enrichment) |
| **Sink** | R2 destination — Apache Iceberg tables OR raw Parquet/JSON files |

### 5.2 Use cases

| Use case | Pipelines fit |
|---|---|
| High-volume page-view events, write to R2 hourly | ✓ |
| Agent activity log (tool calls, costs, latency) for analytics | ✓ |
| Slow change-feed from D1 | ✗ — use Workers + R2 directly |
| Real-time triggers (latency-critical) | ✗ — use Queues + Workers |

### 5.3 Setup

```bash
npx wrangler pipelines setup
# Interactive — creates a Stream, Pipeline (SQL), and R2 Sink
```

```jsonc
// wrangler.jsonc — add the Stream binding
"pipelines": [
  { "binding": "EVENTS_STREAM", "pipeline": "office-town-events" }
]
```

```ts
// Worker pushes events
await env.EVENTS_STREAM.send({
  ts: Date.now(),
  agent: 'librarian',
  tool: 'wiki.search',
  query: 'norton commando',
  result_count: 12,
  latency_ms: 240,
  user: 'jez',
})
```

The transformation is plain SQL evaluated per batch:

```sql
SELECT
  ts,
  agent,
  tool,
  query,
  result_count,
  latency_ms,
  date_trunc('hour', from_unixtime(ts / 1000)) AS hour
FROM stream
WHERE latency_ms IS NOT NULL
```

Results land in R2 partitioned by `agent=X/hour=Y/`. DuckDB or Athena can query directly.

### 5.4 Office Town v2 plan

Pipelines is **v2 opt-in**. The default install uses D1 + R2 directly for the small amount of telemetry we need. When a fleet grows past 10-20 active agents and starts emitting > 100k events/day, switching to Pipelines becomes the obvious win for analytics.

---

## 6. Workflows

Durable multi-step orchestration: write a `WorkflowEntrypoint` class, each `step.do()` is checkpointed and retried independently, `step.sleep()` and `step.waitForEvent()` let a workflow hibernate for hours/days, then resume on its own.

### 6.1 Key primitives

| Primitive | What it does |
|---|---|
| `step.do('name', async () => { ... })` | Atomic step; result cached, auto-retried on error |
| `step.sleep('name', '1 hour')` | Pause; worker hibernates, resumes after duration |
| `step.sleepUntil('name', date)` | Sleep until a specific Date |
| `step.waitForEvent('name', { event, timeout })` | Pause until an external `sendEvent` arrives |
| `step.do('name', { retries: { limit: 5, backoff: 'exponential' } }, fn)` | Custom retry policy |

### 6.2 Limits

| Limit | Value |
|---|---|
| Step CPU time | ~30 seconds (subrequest budget) |
| Step wall time | ~30 minutes |
| Step output size | 1 MB serialised |
| Sleep duration | Unlimited (hibernation) |
| Workflow instance lifetime | 1 year |
| Concurrent instances | 1000 per workflow class (free) / unlimited (paid) |

### 6.3 Wrangler + code

```jsonc
"workflows": [
  { "name": "wiki-index-sweep", "binding": "WIKI_SWEEP", "class_name": "WikiSweep" }
]
```

```ts
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'

export class WikiSweep extends WorkflowEntrypoint<Env, { since: string }> {
  async run(event: WorkflowEvent<{ since: string }>, step: WorkflowStep) {
    const pages = await step.do('list-pages-since', async () =>
      this.env.WIKI_DB.prepare('SELECT path FROM wiki WHERE updated_at > ?')
        .bind(event.payload.since).all()
    )

    for (const page of pages.results) {
      await step.do(`embed:${page.path}`, async () => {
        const body = await this.env.WIKI_BUCKET.get(page.path as string)
        const text = await body!.text()
        const { data } = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', { text })
        await this.env.VECTORS.upsert([{ id: page.path as string, values: data[0] }])
      })
    }

    // Sleep until tomorrow 03:00 UTC
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(3, 0, 0, 0)
    await step.sleepUntil('next-run', tomorrow)
  }
}

// Trigger from another Worker
await env.WIKI_SWEEP.create({ params: { since: '2026-05-27T00:00:00Z' } })
```

### 6.4 Office Town v1 plan

Workflows powers:

1. **`wiki-index-sweep`** — nightly Workflow that re-embeds changed pages, rebuilds FTS5, prunes orphan vectors.
2. **`link-checker`** — weekly Workflow that fetches every external link in the wiki, marks dead ones in D1.
3. **`backup-wiki`** — daily Workflow that exports D1 → R2 with date-stamped key.

All three already declared in `wrangler.jsonc`. Code lives in `src/workflows/`.

### 6.5 Common gotchas (from our own rules)

- **WASM in Workflows accumulates memory** — see `~/.claude/rules/cloudflare-workers.md`. Don't decode big images in every step; check D1 for already-processed items first.
- **`step.do` output capped at 1 MB** — store big binaries to R2, return the key.
- **Step retries multiply cost** — set sensible retry limits; default is 5 with exponential backoff.

---

## 7. Pages → Workers Assets

**Cloudflare Pages is being absorbed into Workers Assets.** New projects should use Workers Assets directly via the `assets` binding in `wrangler.jsonc`. Pages remains live for existing projects but receives no new features; Cloudflare's official migration guide ([developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)) lays out the path.

### 7.1 Why Workers Assets

| Feature | Pages | Workers Assets |
|---|---|---|
| Static file serving | ✓ | ✓ |
| Server-side functions | Pages Functions (separate handler) | Worker `fetch()` (same module) |
| Bindings to D1/R2/KV/etc | Via Functions | Direct |
| SPA fallback | ✓ | ✓ (`not_found_handling: "single-page-application"`) |
| Run worker first for API paths | Awkward | `run_worker_first: ["/api/*"]` |
| Asset caching | Auto | Auto, tiered |
| Future-proof | ✗ | ✓ |

### 7.2 wrangler.jsonc

```jsonc
{
  "name": "office-town-cloud",
  "main": "src/worker.ts",
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/mcp/*", "/health"]
  }
}
```

### 7.3 The `run_worker_first` gotcha

From our `~/.claude/rules/better-auth-cloudflare.md`: if you don't set `run_worker_first` for `/api/*`, the OAuth callback path falls back to `index.html` and silently breaks auth.

**Office Town pattern:** declare all worker-handled paths explicitly:

```jsonc
"run_worker_first": [
  "/api/*",      // bearer-gated REST API
  "/mcp/*",      // streamable-HTTP MCP servers
  "/p/*",        // public published pages
  "/s/*",        // share links
  "/health",     // healthcheck
  "/dashboard/*" // dashboard SSR
]
```

Everything else (the `/`, JS bundles, CSS, images) gets served straight from R2-backed asset storage.

### 7.4 Office Town v1 plan

v1 uses Workers Assets exclusively. No Pages. The dashboard SPA is built with Vite, output to `dist/client/`, served via the `ASSETS` binding. The Worker handles all dynamic paths.

---

## 8. Browser Rendering

Headless Chrome on Cloudflare's edge. Two access modes: **Quick Actions** (REST, no code) and **Workers binding** (`@cloudflare/puppeteer` with full Puppeteer API).

### 8.1 Quick Actions endpoints

| Endpoint | Output |
|---|---|
| `/content` | Raw HTML |
| `/screenshot` | PNG/JPEG image |
| `/pdf` | PDF document |
| `/markdown` | Markdown extraction |
| `/snapshot` | DOM snapshot + screenshot |
| `/scrape` | Extracts specific selectors |
| `/json` | AI-powered structured data extraction |
| `/links` | All hyperlinks |
| `/crawl` | Multi-page recursive |

```bash
# Screenshot via REST (no Worker needed)
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCT/browser-rendering/screenshot" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com", "viewport": {"width": 1440, "height": 900} }' \
  --output screenshot.png
```

### 8.2 Workers binding (Puppeteer)

```jsonc
"browser": { "binding": "MYBROWSER" }
```

```ts
import puppeteer from '@cloudflare/puppeteer'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const browser = await puppeteer.launch(env.MYBROWSER, { keep_alive: 600_000 })
    const page = await browser.newPage()
    await page.goto('https://example.com', { waitUntil: 'networkidle0' })
    const png = await page.screenshot()
    await browser.close()  // omit to keep session for next call
    return new Response(png, { headers: { 'Content-Type': 'image/png' } })
  },
}
```

**Session reuse** — `keep_alive` keeps the browser warm for up to 10 minutes. Faster than launching fresh, costs the same in browser-time.

```ts
// Reconnect to existing session
const sessions = await puppeteer.sessions(env.MYBROWSER)
if (sessions.length > 0) {
  const browser = await puppeteer.connect(env.MYBROWSER, sessions[0].sessionId)
}
```

### 8.3 Stagehand (AI element detection)

[Stagehand](https://github.com/browserbase/stagehand) is an AI-driven wrapper over Playwright that lets you describe what to do in natural language ("click the buy button") and an LLM figures out the selector. Cloudflare ships a Stagehand-compatible adapter:

```ts
import { Stagehand } from '@browserbasehq/stagehand'
// Cloudflare adapter — uses Workers AI for the LLM
```

Useful for: agents that need to fill forms on sites that change layouts; QA bots that don't want to maintain selectors.

### 8.4 Limits & costs

| Item | Free plan | Paid plan |
|---|---|---|
| Concurrent browsers | 3 | 30 |
| Browser-minutes/day | 10 | Unlimited (metered) |
| Session timeout | 60s default, 10min max keep-alive | Same |
| Cold start | 1-3s typical | Same |

**Pricing (paid):** ~$0.09 per browser-hour. A typical screenshot takes 2-4s, so ~$0.0001 per screenshot. 10,000 screenshots/month = ~$1.

**Cold-start mitigation:**
- Reuse sessions with `keep_alive`
- Pre-warm during cron triggers
- Use Quick Actions for one-off jobs (slightly slower cold start, no Worker required)

### 8.5 Office Town v1 plan

The `office-town-browser` MCP server exposes three tools:

| Tool | Implementation |
|---|---|
| `browser.fetch(url)` | Quick Actions `/content` or Puppeteer `page.content()` |
| `browser.screenshot(url, viewport?)` | Quick Actions `/screenshot` |
| `browser.extract(url, schema)` | Quick Actions `/json` (AI-powered, falls back to Puppeteer + page.evaluate for selectors) |

---

## 9. Cron Triggers

Worker handlers that run on a UTC schedule. Quartz-extended five-field cron syntax. The Worker's `scheduled()` handler receives a `ScheduledEvent`.

### 9.1 Syntax

```text
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day-of-week (1-7 or sun, mon, tue, ...; L = last; # = nth)
│ │ │ └─── Month (1-12 or jan, feb, ...)
│ │ └───── Day-of-month (1-31; L = last; W = nearest weekday)
│ └─────── Hour (0-23)
└───────── Minute (0-59)

Special chars: * (any) , (list) - (range) / (step)
```

### 9.2 Examples

| Schedule | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Top of every hour |
| `0 3 * * *` | 03:00 UTC daily |
| `0 3 * * 0` | 03:00 UTC every Sunday |
| `0 17 * * sun` | 17:00 UTC every Sunday |
| `0 0 1 * *` | Midnight UTC, 1st of month |
| `59 23 LW * *` | Last weekday of month, 23:59 UTC |
| `0 9 * * 1-5` | 09:00 UTC Mon-Fri |

### 9.3 Wrangler config

```jsonc
"triggers": {
  "crons": [
    "*/15 * * * *",     // every 15min — process queue
    "0 3 * * *",        // 03:00 UTC daily — wiki sweep
    "0 0 * * 0"         // weekly Sunday — link checker
  ]
}
```

### 9.4 Handler

```ts
export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case '*/15 * * * *':
        ctx.waitUntil(processIndexQueue(env))
        break
      case '0 3 * * *':
        await env.WIKI_SWEEP.create({ params: { since: yesterday() } })
        break
      case '0 0 * * 0':
        await env.LINK_CHECKER.create({ params: {} })
        break
    }
  },
}
```

### 9.5 Limits

| Limit | Value |
|---|---|
| Min schedule resolution | 1 minute |
| Cron triggers per Worker | 5 (free) / unlimited (paid) |
| Execution timezone | UTC only — convert in code if you need local |
| Max CPU time per invocation | Standard Worker limits (30s default, configurable to 5min) |
| Wall time | Same as fetch handler |
| Retention | Last 100 invocations visible in dashboard; longer with Workers Logs |

### 9.6 Local testing

```bash
# Invoke a cron manually during wrangler dev
curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
```

### 9.7 Office Town v1 plan

Three cron triggers ship with v1, all defined in `wrangler.jsonc` (see 9.3 above). They invoke Workflows for the actual work — the cron is just the entry point.

---

## 10. Tail Workers + Observability

### 10.1 Built-in observability

```jsonc
"observability": {
  "enabled": true,
  "logs": {
    "invocation_logs": true,
    "head_sampling_rate": 1   // 1 = log every invocation; 0.01 = 1% sample
  }
}
```

Workers-created-by-wrangler don't have this on by default — must opt in. With it on:

- **Logs view** in dashboard — searchable, filterable by status / path / log content
- **7-day retention**
- **Structured JSON** is searchable per-field

### 10.2 Tail Workers (chained log forwarder)

A Tail Worker is a second Worker that receives traces from a "producer" Worker after each invocation. Use cases: forward to Sentry/Honeycomb/Grafana, aggregate to Analytics Engine, route alerts to chat.

```jsonc
// Producer Worker's wrangler.jsonc
"tail_consumers": [
  { "service": "office-town-tail" }
]
```

```ts
// Tail Worker code
export default {
  async tail(events: TraceItem[], env: Env, ctx: ExecutionContext) {
    for (const event of events) {
      if (event.exceptions.length > 0) {
        // Alert on uncaught errors
        await env.SLACK_WEBHOOK.send({ text: `Worker error: ${event.exceptions[0].message}` })
      }
      // Forward all logs to external observability
      ctx.waitUntil(forwardToHoneycomb(event))
    }
  },
}
```

Tail events include: timestamps, HTTP request/response info, `console.log` output, exceptions, sub-request details, durable object events.

**Billed by CPU time, not invocation count.**

### 10.3 Logpush (export to R2/S3/Datadog)

```bash
# Create a Logpush job for a Worker
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCT/logpush/jobs" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -d '{
    "destination_conf": "r2://office-town-logs/workers/{DATE}",
    "dataset": "workers_trace_events",
    "enabled": true,
    "output_options": { "field_names": ["EventTimestampMs", "Outcome", "ScriptName"] }
  }'
```

### 10.4 Office Town v1 plan

Default install:

- `observability.enabled = true` with `head_sampling_rate = 1` for the first 30 days, drop to 0.1 after to control cost
- No Tail Workers in v1 (the dashboard logs view is enough)
- v1.1: optional Tail Worker that forwards uncaught exceptions to the configured email destination

---

## 11. Cloudflare Tunnel (`cloudflared`)

Securely expose local services to Cloudflare. Outbound-only — `cloudflared` daemon makes connections out, Cloudflare routes inbound to it.

### 11.1 Use cases for Office Town

| Scenario | Tunnel fit |
|---|---|
| User runs Goose locally, needs Office Town MCP to reach their local DB | ✓ |
| Dev tunnel for `wrangler dev` (replaces ngrok) | ✓ |
| Expose home server to the internet without opening ports | ✓ |
| Production Cloudflare Worker → on-prem service (e.g. customer's Jim2 ERP) | ✓ |
| Static site hosting | ✗ — use Workers Assets |

### 11.2 Quick Tunnel (one command, ephemeral)

```bash
cloudflared tunnel --url http://localhost:3000
# Returns a https://<random>.trycloudflare.com URL valid for the session
```

### 11.3 Named Tunnel (persistent, your domain)

```bash
# 1. Authenticate
cloudflared tunnel login

# 2. Create a tunnel
cloudflared tunnel create office-town-local

# 3. Route a hostname to it
cloudflared tunnel route dns office-town-local local.officetown.au

# 4. Run with a config file
cloudflared tunnel --config ~/.cloudflared/config.yml run office-town-local
```

```yaml
# ~/.cloudflared/config.yml
tunnel: office-town-local
credentials-file: /Users/jez/.cloudflared/<uuid>.json
ingress:
  - hostname: local.officetown.au
    service: http://localhost:3000
  - service: http_status:404
```

### 11.4 Free tier

Cloudflare Tunnel is free. No bandwidth charges. No connection limits. You only pay if you upgrade to Zero Trust for advanced policies.

### 11.5 Office Town v1 plan

The INSTALL.md mentions Cloudflare Tunnel as an optional Step 5: if the user has on-prem resources they want their cloud-hosted Office Town to reach, install `cloudflared` locally and create a tunnel. Not required for the default install (everything is on Cloudflare already).

---

## 12. Cloudflare Registrar

At-cost domain registration. No markup. Renewal at registry list price.

### 12.1 Pricing (approx — verify on the dashboard before quoting)

| TLD | Price/year |
|---|---|
| `.com` | ~$10 |
| `.au` | ~$12 |
| `.net` | ~$13 |
| `.org` | ~$12 |
| `.dev` | ~$14 |
| `.app` | ~$15 |
| `.town` | ~$30 |
| `.io` | ~$32 |
| `.ai` | ~$85 |

These are **registry wholesale prices passed through**. No transfer fees. No "first year cheap, second year $50" trickery.

### 12.2 Constraints

- Must use Cloudflare's nameservers (full DNS, not partial)
- Domain must be on a Cloudflare plan (Free is fine)
- ICANN fees and registry-mandated changes get passed through (small, occasional)
- Free DNSSEC, free WHOIS redaction

### 12.3 Transfer to Cloudflare

```bash
# Via cf-mcp tool
cf_registrar transfer --domain example.com --auth-code <EPP>
# Or via dashboard: Add Domain → Transfer
```

Transfer takes 5-7 days (ICANN-mandated). Domain continues to work throughout.

### 12.4 Office Town v1 plan

For new installs Office Town suggests registering `<theirname>.officetown.au` (if Jez owns the parent TLD and runs it as a registrar-style service) or any cheap domain via Cloudflare Registrar. The deploy button doesn't auto-create a domain — that's a separate step the user takes via the dashboard.

---

## 13. DNS, SSL, WAF (the minimum Office Town cares about)

### 13.1 DNS

Cloudflare DNS is global anycast, ~10ms median resolution, free at all plans. Office Town needs:

| Record | Purpose | Proxied? |
|---|---|---|
| `A` / `AAAA` for Worker custom domain | Auto-managed by Workers when you set `custom_domain: true` | n/a (managed) |
| `CNAME` for Email Routing | Auto-created when enabling Email Routing | No (per SMTP2Go rule) |
| `MX` for Email Routing | Auto-created | n/a |
| `TXT` for SPF/DMARC | Auto for SPF; manual for DMARC | n/a |

### 13.2 SSL/TLS

- **Free certs from Let's Encrypt or Google Trust Services** — auto-issued, auto-renewed
- **Universal SSL** — covers the apex + `*.<zone>`
- **Advanced Certificate Manager ($10/mo)** — wildcard for deeper subdomains, custom validity, CAA control
- **Custom hostname** for SaaS apps that need vanity domains pointed at their Worker

Office Town v1 uses Universal SSL only. The Worker custom domain (`<install>.officetown.au` or whatever the user chose) gets a free cert automatically.

### 13.3 WAF (minimum)

The dashboard exposes a CSP-friendly default. Office Town's main concern is:

- **Don't block webhook paths** — the rule from `cloudflare-workers.md` about Browser Integrity Check applies to anything POSTed by external services (Stripe, Telegram, etc.). For Office Town v1 the only external POST is the inbound Email Routing handler, which uses MTA → Worker (not HTTP) and is unaffected.
- **CSP header for the dashboard** — Worker emits `Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; ...` — locked down so even if a wiki page contains malicious markdown, the rendered HTML can't exfiltrate cookies.

```ts
// In Worker — set on dashboard responses
const cspHeader = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "media-src 'self' https://customer-*.cloudflarestream.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com",
  "frame-ancestors 'none'",
].join('; ')
```

---

## 14. Cloudflare's MCP servers — `github.com/cloudflare/mcp-server-cloudflare`

The big win for Office Town v1.1: **don't reimplement what Cloudflare already publishes**. Goose users can add these MCP servers directly to their `~/.config/goose/config.yaml` and get full Cloudflare ops without us writing anything.

### 14.1 The full list (14 servers, all `streamable-http` over `/mcp`)

| # | Server | URL | What it does |
|---|---|---|---|
| 1 | **Documentation** | `docs.mcp.cloudflare.com/mcp` | Up-to-date Cloudflare docs reference. Search + fetch. |
| 2 | **Workers Bindings** | `bindings.mcp.cloudflare.com/mcp` | Storage, AI, compute primitives — D1, R2, KV, Vectorize, Queues ops. |
| 3 | **Workers Builds** | `builds.mcp.cloudflare.com/mcp` | Insights and management of Workers Builds CI/CD. |
| 4 | **Observability** | `observability.mcp.cloudflare.com/mcp` | Debug Workers logs and analytics — equivalent to dashboard "Logs" view. |
| 5 | **Radar** | `radar.mcp.cloudflare.com/mcp` | Global Internet traffic insights, trends, URL scans, utilities. |
| 6 | **Container** | `containers.mcp.cloudflare.com/mcp` | Spin up sandbox development environments. |
| 7 | **Browser Rendering** | `browser.mcp.cloudflare.com/mcp` | Fetch web pages, markdown, screenshots. |
| 8 | **Logpush** | `logs.mcp.cloudflare.com/mcp` | Summaries for Logpush job health. |
| 9 | **AI Gateway** | `ai-gateway.mcp.cloudflare.com/mcp` | Search logs, get prompt/response details. |
| 10 | **Audit Logs** | `auditlogs.mcp.cloudflare.com/mcp` | Query audit logs, generate review reports. |
| 11 | **DNS Analytics** | `dns-analytics.mcp.cloudflare.com/mcp` | Optimize DNS performance, debug current setup. |
| 12 | **Digital Experience Monitoring** | `dex.mcp.cloudflare.com/mcp` | Insights on critical apps for your org. |
| 13 | **Cloudflare One CASB** | `casb.mcp.cloudflare.com/mcp` | Security misconfiguration detection for SaaS apps. |
| 14 | **GraphQL** | `graphql.mcp.cloudflare.com/mcp` | Analytics data via Cloudflare's GraphQL API. |

### 14.2 There's also a meta-server: `mcp.cloudflare.com/mcp`

> "A token-efficient MCP server for the entire Cloudflare API. 2500 endpoints in 1k tokens, powered by Code Mode."

Repo: `github.com/cloudflare/mcp`. Two tools only:

| Tool | Purpose |
|---|---|
| `search` | Query the API specification to find endpoints |
| `execute` | Call the Cloudflare API with discovered endpoints |

Coverage: Workers, KV, R2, D1, Pages, DNS, Firewall, Load Balancers, Stream, Images, AI Gateway, Vectorize, Access, Gateway, "and more" — effectively the entire Cloudflare REST surface.

### 14.3 Goose install pattern

```yaml
# ~/.config/goose/config.yaml — Office Town v1.1 plugin adds these
extensions:
  cloudflare-docs:
    type: sse
    enabled: true
    url: https://docs.mcp.cloudflare.com/mcp

  cloudflare-bindings:
    type: sse
    enabled: true
    url: https://bindings.mcp.cloudflare.com/mcp

  cloudflare-observability:
    type: sse
    enabled: true
    url: https://observability.mcp.cloudflare.com/mcp

  cloudflare-browser:
    type: sse
    enabled: true
    url: https://browser.mcp.cloudflare.com/mcp

  cloudflare-radar:
    type: sse
    enabled: true
    url: https://radar.mcp.cloudflare.com/mcp

  cloudflare-api:
    type: sse
    enabled: true
    url: https://mcp.cloudflare.com/mcp  # the meta-server
```

**Authentication:** these servers use OAuth — Goose opens a browser, user logs in to Cloudflare, OAuth token persists. No API key configuration needed in `config.yaml`. Re-auth happens silently when the token expires.

### 14.4 What Office Town does NOT need to build

Looking at our existing `office-town-devops` MCP server:

| Tool we ship | Replaceable by Cloudflare's MCP? |
|---|---|
| `devops.list_zones` | ✓ `cloudflare-api` (meta) or DNS Analytics |
| `devops.list_workers` | ✓ `cloudflare-api` |
| `devops.worker_logs` | ✓ `cloudflare-observability` |
| `devops.dns_records` | ✓ `cloudflare-api` |
| `devops.account_summary` | ✓ `cloudflare-api` + Radar |

**Implication for v1.1 planning:** `office-town-devops` is mostly redundant once we ship the Goose plugin that pre-wires Cloudflare's official MCP servers. Possible move: deprecate `office-town-devops` in favour of telling users to enable Cloudflare's servers directly. Saves us maintenance, gives users richer tooling. Decide in Phase 3.

### 14.5 Limitations of Cloudflare's MCP

- **OAuth-only auth** — works for interactive sessions, awkward for service-to-service (use the REST API directly there)
- **Account-scoped** — switching between Jez's two accounts requires re-auth (vs our `cf_account set_default` switch)
- **Rate-limited** — Cloudflare doesn't publish exact limits but the servers are shared infra
- **No local fallback** — if Cloudflare's MCP servers are down, no tools

For Office Town v1.1: ship our plugin pre-wiring all 14 servers, document the OAuth flow in INSTALL.md, keep `office-town-devops` as a thin wrapper that uses the user-supplied `CF_API_TOKEN` (works when the official servers are down or for service-account scenarios).

---

## 15. Cloudflare Skills — `github.com/cloudflare/skills`

The Skills repo gives Claude Code (and any other skill-aware agent) deep Cloudflare expertise without ballooning the context window. Each skill is markdown that loads on demand.

### 15.1 The eight published skills

| # | Skill | What it covers |
|---|---|---|
| 1 | **`cloudflare`** | Comprehensive platform: Workers, Pages, KV/D1/R2, Workers AI, Vectorize, Agents SDK, Tunnel, Spectrum, WAF, DDoS, Terraform, Pulumi |
| 2 | **`agents-sdk`** | Agents SDK: state management, scheduling, RPC, MCP servers, email, streaming chat |
| 3 | **`durable-objects`** | Stateful coordination: chat rooms, games, booking, RPC, SQLite, alarms, WebSockets |
| 4 | **`sandbox-sdk`** | Secure code execution for AI interpreters, CI/CD, interactive dev |
| 5 | **`wrangler`** | Deployment tooling: Workers, KV, R2, D1, Vectorize, Queues, Workflows |
| 6 | **`web-perf`** | Core Web Vitals auditing (FCP, LCP, TBT, CLS), render-blocking resources, network chains |
| 7 | **`building-mcp-server-on-cloudflare`** | Remote MCP servers with tools, OAuth, deployment |
| 8 | **`building-ai-agent-on-cloudflare`** | AI agents with state, WebSockets, tool integration |

### 15.2 What each skill is

A skill is a markdown directory at `cloudflare/skills/<skill-name>/SKILL.md` (plus optional supporting files). When loaded:

```markdown
---
name: building-mcp-server-on-cloudflare
description: Use when building a remote MCP server on Cloudflare Workers...
---

# Building MCP Server on Cloudflare

[~500 lines of focused, actionable guidance]
```

Claude Code loads them via the `Skill` tool or the `find-skills` recommender; Goose loads them via the `claude-md-management` / `skill-creator` ecosystem (still being integrated). Office Town's Goose plugin will preload the eight Cloudflare skills, so agents in a Goose session can invoke them by name.

### 15.3 Distribution channels

| Channel | How |
|---|---|
| Direct clone | `git clone github.com/cloudflare/skills` → copy into `~/.claude/skills/cloudflare/` |
| Claude Code plugin | They publish a Claude Code plugin (`cloudflare` plugin) that adds all 8 |
| Goose plugin (Office Town) | Office Town v1.1 plugin includes them as `.claude/skills/cloudflare/*` so they're auto-discovered by any tool that reads that path |

### 15.4 Office Town v1.1 plan

Our Goose plugin (`office-town-plugin`) becomes a bundle of:

1. **The five Office Town MCP servers** (wiki, files, browser, devops, email) — already shipping
2. **Goose extensions** that pre-wire Cloudflare's 14 MCP servers (see §14.3)
3. **All 8 Cloudflare skills** copied into the plugin's `skills/` folder
4. **Office Town-specific skills** (`office-town-deploy`, `office-town-troubleshoot`, etc.) we author

A single install of the plugin = a Goose agent that knows everything Cloudflare publishes plus everything we publish, without the user manually copying anything.

### 15.5 Skill content quality notes

From inspecting them (verified 2026-05-28):

- The `cloudflare` skill is comprehensive but high-level — points at official docs for details
- `agents-sdk` is the highest-value skill for Office Town because it covers the Durable-Object-as-agent pattern that maps onto our own agent shape
- `wrangler` skill is excellent — covers all the gotchas (compatibility_date, migrations, env-scoped vars)
- `web-perf` is the surprise — it knows how to read a Lighthouse report and propose optimisations; useful for the Office Town dashboard performance pass
- `building-mcp-server-on-cloudflare` overlaps strongly with what we did building our own MCP servers — read it as a sanity check on our `office-town-wiki` implementation

---

## 16. Quick reference: post-deploy user steps

Office Town's deploy button provisions infrastructure. Some things require user action after:

| Step | When | What |
|---|---|---|
| 1. Verify Email Routing destination | Right after deploy | Click verification link Cloudflare emails you. Required for forwarding + send_email. |
| 2. Add DMARC record | First week | Cloudflare auto-adds SPF and DKIM; you add DMARC manually. Start with `p=none`. |
| 3. Bind custom domain | Optional | Either via `wrangler.jsonc` `custom_domain: true` route, or buy a domain through Registrar. |
| 4. Authenticate Cloudflare MCP servers | When enabling them via the Goose plugin | OAuth flow — opens browser, you sign in to Cloudflare, token persists. |
| 5. Set up Tunnel | Only if needed | `cloudflared tunnel` for connecting on-prem resources. |
| 6. Configure observability | Recommended | Set `head_sampling_rate` to 1 for the first 30 days; tail through dashboard. |
| 7. Add SMTP2Go API key | If sending > 100 emails/day | Per-zone free tier limit. SMTP2Go is the documented fallback. |
| 8. (v2) Provision Stream / Realtime | If voice or video features needed | Enable in dashboard; add bindings to wrangler.jsonc. |

---

## 17. Capability matrix — what Office Town can do per Cloudflare service

| Capability | Service | v1 | v1.1 | v2 |
|---|---|:-:|:-:|:-:|
| Persistent wiki storage | R2 + D1 | ✓ | ✓ | ✓ |
| Vector search over wiki | Vectorize + Workers AI | ✓ | ✓ | ✓ |
| Inbound email → wiki page | Email Routing `email()` | ✓ | ✓ | ✓ |
| Outbound email from agent | `send_email` binding (free 100/day) | ✓ | ✓ | ✓ |
| Outbound email at scale | SMTP2Go fallback | ✓ | ✓ | ✓ |
| Browser automation (fetch/screenshot) | Browser Rendering binding | ✓ | ✓ | ✓ |
| AI-extracted structured web data | Browser Rendering `/json` | ✓ | ✓ | ✓ |
| File conversion (PDF/DOCX/audio → markdown) | Workers AI `toMarkdown` | ✓ | ✓ | ✓ |
| Image resize / format convert | Cloudflare Images | ✓ | ✓ | ✓ |
| Sandboxed code execution for agents | Containers | ✗ | ✓ | ✓ |
| Multi-step durable orchestration | Workflows | ✓ | ✓ | ✓ |
| Scheduled batch jobs | Cron Triggers | ✓ | ✓ | ✓ |
| Event ingestion at scale | Pipelines | ✗ | ✗ | ✓ |
| Voice agent (STT/TTS over WebRTC) | Realtime + Workers AI | ✗ | ✗ | ✓ |
| Video upload / playback / live | Stream | ✗ | ✗ | ✓ |
| Cloudflare ops from Goose | `cloudflare/mcp` servers | ✗ | ✓ | ✓ |
| Cloudflare expertise in agent context | `cloudflare/skills` bundled | ✗ | ✓ | ✓ |
| Tail Worker for error alerts | Tail Workers | ✗ | ✓ | ✓ |
| Logs export to R2/S3 | Logpush | ✗ | ✗ | ✓ |
| Private resource access | Tunnel (`cloudflared`) | optional | ✓ | ✓ |
| At-cost domain reg | Registrar | external link | ✓ | ✓ |

---

## 18. Cross-references to existing rules

This research connects to several rules in `~/.claude/rules/`:

| Topic | Rule |
|---|---|
| Email Routing subdomain trap | `cloudflare-email-routing.md` |
| `run_worker_first` for SPA + API | `better-auth-cloudflare.md` |
| SMTP2Go as outbound fallback | `smtp2go.md` |
| Browser Rendering vs playwright-cli | `playwright-cli.md` |
| Cloudflare bindings preferred over API tokens | `cloudflare-workers.md` |
| WASM memory in Workflows | `cloudflare-workers.md` |
| AI Gateway streaming caveats | `cloudflare-workers.md` |
| D1 / Vectorize patterns | `cloudflare-storage.md` |
| Workers AI gotchas (FLUX, Aura 2, Nova 3) | `workers-ai-gotchas.md` |
| Bot Fight Mode blocking webhooks | `cloudflare-workers.md` + `http-patterns.md` |

These collectively form the "Cloudflare in production" knowledge surface. The two new things this document adds:

1. **Cloudflare's 14 MCP servers** — most are new since the existing rules were written
2. **Cloudflare's 8 official skills** — published mid-2026, not yet referenced anywhere else

---

## 19. Decision points for Office Town

### 19.1 Does v1 ship without Containers and Realtime?

**Yes.** Both are valuable but neither is core to the wiki + files + email + browser MCP suite. Adding them in v1.1 / v2 lets users grow into them without making the v1 install heavier.

### 19.2 Do we deprecate `office-town-devops` in favour of Cloudflare's MCP servers?

**Lean yes, but verify in Phase 3.** Cloudflare's official servers cover everything our devops MCP does, with better auth (OAuth vs API token) and richer tools. The only reason to keep ours is the fallback for service-account use cases. Decide in Phase 3 plan.

### 19.3 Where do the Cloudflare skills live in the plugin?

**Bundle them in the Goose plugin's `skills/` folder.** That way `npm install office-town-plugin` (or however we distribute it) brings them along, no separate setup. Update strategy: pin to a commit hash of `cloudflare/skills`, bump quarterly.

### 19.4 Should the dashboard use the GraphQL MCP server for analytics?

**Defer to v1.1.** v1 ships with a minimal dashboard. v1.1 can wire up Cloudflare's GraphQL MCP server to fetch real-time analytics into the dashboard if it earns its place.

### 19.5 Pipelines vs Queue for telemetry

**Queues for now (v1), revisit Pipelines for v2.** Queues are simpler, free up to 1M messages/month, and we're already using them for the index pipeline. Pipelines is overkill until volume justifies SQL-transformation-in-flight.

---

## 20. TL;DR for Office Town authors

If you're building or reviewing Office Town code and need to reach for a Cloudflare service:

| If you need... | Reach for... |
|---|---|
| Persistent files | R2 |
| Fast lookup keys | KV |
| Relational data | D1 |
| Vector search | Vectorize + Workers AI embeddings |
| Background queue | Queues |
| Schedule jobs | Cron Triggers |
| Multi-step orchestration | Workflows |
| Inbound email | Email Routing `email()` handler |
| Outbound email (low volume) | `send_email` binding |
| Outbound email (high volume) | SMTP2Go fallback |
| Fetch web content | Browser Rendering binding |
| Convert PDF/DOCX/audio | Workers AI `toMarkdown` |
| Resize images | Cloudflare Images |
| Run agent code in a sandbox | Containers (v1.1+) |
| Voice agent | Realtime SFU + Workers AI (v2) |
| Video knowledge | Stream (v2) |
| Production logs | Observability + (optionally) Tail Worker |
| Cloudflare API from a Goose agent | Cloudflare's 14 official MCP servers |
| Cloudflare best-practices in agent context | Cloudflare's 8 official skills (bundled in plugin) |
| Custom domain | Workers Custom Domain or Registrar |
| On-prem connectivity | Cloudflare Tunnel |

When unsure: ask the `cloudflare-docs` MCP server.

---

**Document version:** 1.0
**Last verified:** 2026-05-28
**Companion docs:** `cloudflare-knowledge-01-*` (Workers + storage), `cloudflare-knowledge-02-*` (AI + Vectorize + Queues), `goose-knowledge-*` (Goose architecture)
