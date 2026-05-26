# Extensions Catalogue

Every planned MCP extension for Office Town Cloud, in priority order, with the API surface, dependencies, and effort estimate per extension.

All extensions are streamable-HTTP MCP servers hosted in the user's Cloudflare account. Each has a tool surface; agents call them via Goose's MCP integration.

## v1 — ship with first release

### `office-town-wiki`

**Purpose:** team knowledge layer — entity-as-folder collections with FTS5 + Vectorize hybrid search.

**Tools:**
- `wiki.create(collection, slug, body, frontmatter?)` — create entry
- `wiki.read(collection, slug)` — fetch full entry
- `wiki.update(collection, slug, patch)` — modify
- `wiki.delete(collection, slug)` — soft-delete with archive
- `wiki.search(query, collections?, filters?)` — FTS + vector hybrid
- `wiki.list(collection)` — list entries in a collection
- `wiki.list_collections()` — discover schema
- `wiki.register_collection(name, description, convention, purpose)` — add a collection deliberately
- `wiki.export(format='markdown' | 'json')` — bulk export

**Bindings:** R2, D1, Vectorize, Workers AI (embeddings).

**Effort:** 2 days.

### `office-town-files`

**Purpose:** file storage + content extraction + signed sharing.

**Tools:**
- `files.upload(content, name?, mime?)` — store in R2, return key
- `files.download(key)` — retrieve
- `files.list(prefix?)` — list files
- `files.share(key, ttl?)` — generate signed URL
- `files.extract(key)` — content extraction (markdown/text from PDF/DOCX/audio/video — mediabox-shaped)
- `files.delete(key)`

**Bindings:** R2, Workers AI, Workers Media Transformations.

**Effort:** 1 day.

### `office-town-publish`

**Purpose:** markdown → public web page with permanent URL.

**Tools:**
- `publish.page(slug, markdown, title?, theme?)` — create published page
- `publish.list()` — list published pages
- `publish.read(slug)` — get current published version
- `publish.update(slug, markdown)` — modify
- `publish.revoke(slug)` — unpublish

Pages live at `/p/<slug>` with rendered HTML + simple theming. Distinct from `files.share` (temp URLs for binaries) — publish is for permanent rendered pages.

**Bindings:** R2, Workers Markdown rendering (or built-in).

**Effort:** half-day.

### `office-town-cron`

**Purpose:** schedule recurring agent work.

**Tools:**
- `cron.schedule(id, cron_expr, recipe_path, params?)` — add a scheduled job
- `cron.list()` — list schedules
- `cron.remove(id)` — delete
- `cron.run_now(id)` — fire immediately for testing
- `cron.history(id)` — past runs

Worker cron triggers fire on schedule; trigger Goose's headless mode or fire a recipe via the user's Goose endpoint.

**Bindings:** D1, Workers Cron Triggers.

**Effort:** half-day.

### `office-town-search` (DIY backend by default)

**Purpose:** unified search across the wiki — same as `wiki.search` but with backend flexibility for AI Search evaluation.

**Tools:**
- `search.query(q, collections?, filters?, limit?)` — hybrid search
- `search.recall(q)` — recall with synthesis
- `search.list_backends()` — diagnostic

**Backends:** v1 ships DIY (FTS5 + Vectorize + RRF). v1.1 adds AI Search backend with toggle.

**Bindings:** D1, Vectorize, Workers AI.

**Effort:** rolled into wiki + 1 day for AI Search wrapper (v1.1).

---

## v1.1 — the killer Cloudflare extensions

### `office-town-voice`

**Purpose:** voice calls to agents ("phone the librarian").

**Tools:**
- `voice.start_session(role)` — begin a WebRTC call to a role
- `voice.message(audio_bytes)` — transmit audio frame
- `voice.end_session()` — close call
- `voice.outbound_call(phone_number, role)` — agent calls a real phone number (via Twilio bridge)
- `voice.list_active_sessions()`

**Bindings:** Realtime SFU + TURN, Workers AI (Nova-3 STT, Aura-2 TTS, Pipecat smart-turn-v2).

**Effort:** 2-3 days.

### `office-town-browser`

**Purpose:** agents drive web pages.

**Tools:**
- `browser.navigate(url)` — open URL in a session
- `browser.screenshot()` — capture current view
- `browser.extract(selector_or_prompt)` — pull structured data
- `browser.click(selector_or_description)` — click element
- `browser.fill(selector, value)` — fill form field
- `browser.action(prompt)` — Stagehand-style natural-language action
- `browser.audit(url)` — Lighthouse-style report
- `browser.session_save()` / `browser.session_load()` — persistent logged-in sessions

**Bindings:** Browser Rendering, Workers AI (vision), KV (session state).

**Effort:** 2 days.

### `office-town-email`

**Purpose:** agents have real email addresses.

**Tools:**
- `email.send(to, subject, body, from_role?)` — outbound send
- `email.list_inbox(role?)` — read inbox
- `email.reply(message_id, body)` — reply to inbound
- `email.forward(message_id, to, note?)` — forward with context
- `email.draft(...)` — draft without sending

Inbound emails fire tool calls automatically; the role can act on them.

**Bindings:** Email Routing, Email Service REST, R2 (attachments), D1 (message log).

**Effort:** 2 days.

### `office-town-sandbox`

**Purpose:** agents execute code in sandboxed containers.

**Tools:**
- `sandbox.run(language, code, files?)` — execute code, return output
- `sandbox.shell(commands)` — multi-command shell session
- `sandbox.upload_file(path, content)` — stage files
- `sandbox.download_file(path)` — retrieve output files

**Bindings:** Containers, R2 (file staging).

**Effort:** 1 day.

### `office-town-devops`

**Purpose:** Cloudflare-account-aware extension that helps the user manage their own deployment.

**Tools:**
- `cf.list_workers()` — list deployed Workers
- `cf.deploy(worker_name)` — trigger a redeploy
- `cf.list_secrets(worker_name)` — list configured secrets (names only)
- `cf.set_secret(worker_name, key, value)` — write a secret
- `cf.list_routes()` — DNS routes
- `cf.set_route(domain, worker_name)` — add a route
- `cf.check_health()` — overall deployment health
- `cf.show_logs(worker_name, since?)` — recent logs

**Bindings:** None directly; uses Cloudflare's REST API with user's CF token (stored as secret).

**Effort:** 1 day.

---

## v2 / specialised

| Extension | Purpose | Effort |
|---|---|---|
| `office-town-stream` | Video artifacts (Cloudflare Stream) | 1 day |
| `office-town-pipelines` | Event ingestion at scale | 1 day |
| `office-town-crawl-control` | Client AI-readiness audits | 1 day |
| `office-town-images` | Image transform pipeline (Cloudflare Images) | 1 day |
| `office-town-fleet` | Persistent always-on roles (Cloudflare Agents SDK) | 2-3 days |
| `office-town-vpc` | Private resource bridges | specialised |
| `office-town-hyperdrive` | Client Postgres acceleration | specialised |

---

## Composing with Goose built-ins

Office Town deployments also enable Goose's built-in extensions:

- **Memory** (built-in) — per-role preferences
- **Top of Mind / MOIM** (built-in) — town-wide standing orders
- **Chat Recall** (built-in) — cross-session memory
- **Summon** (built-in) — subagent dispatch
- **Apps** (built-in) — for in-chat dashboards
- **Auto Visualiser** (built-in) — automatic charts
- **Developer** (built-in) — local filesystem
- **Knowledge Graph** (npm package) — opt-in for relational reasoning

The Office Town plugin configures these as defaults; users can disable per deployment.

---

## Distribution

Each extension is its own package within the office-town-cloud monorepo. They deploy to a single Cloudflare account on `pnpm deploy`. Users get one URL per extension that they wire into Goose.

Versioning: monorepo-shared semver. Each MCP server publishes its OpenAPI / MCP schema at `/api/mcp/<name>/schema` for discoverability.
