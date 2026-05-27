# Goose Knowledge — Domain 04: Advanced MCP Features, Security, Sandbox, Remote/Multi-Model, ACP

**Captured:** 2026-05-28
**Source:** https://goose-docs.ai/docs/ (production docs site)
**Scope for this file:** MCP Sampling, MCP Apps/MCP-UI, MCP Elicitation, MCP Roots, Custom Distributions, LLM rate limits, logging, usage data, file management, run/headless, extension allowlist, remote server, multi-model, ACP (client + provider), enhanced code editing, codebase analysis, sidebar customisation, sandbox, agentic testing, CI/CD, observability (Laminar/Langfuse/MLflow), isolated dev environments, Ralph loop, mobile access, Telegram gateway, VS Code extension, security (prompt injection + adversary mode + classification API spec), terminal integration, Tanzu, subagents, subrecipes-in-parallel, Spraay x402, Remotion, smart context management.

**Why this file exists:** Office Town is positioning as "capabilities for Goose" (Phase 0 pivot complete). Every design decision in our wiki/dashboard surface needs to align with how Goose actually exposes capabilities. This file is the source of truth for what Goose offers — so we know which contracts to implement, which patterns to mirror, and which custom-distro work to drop.

---

## 0. Repo-level URL conventions discovered

The Jez-supplied URLs used several slugs that don't exist on the live docs site. The canonical slugs are:

| Jez's URL slug | Actual slug on goose-docs.ai |
|---|---|
| `guides/llm-rate-limits` | `guides/handling-llm-rate-limits-with-goose` |
| `guides/logging` | `guides/logs` |
| `guides/file-management` | (doesn't exist — covered via fuzzy `@` search in chat input docs) |
| `guides/run-tasks` | `guides/running-tasks` |
| `guides/extension-allowlist` | `guides/allowlist` |
| `guides/remote-server` | `guides/remote-goose-server` |
| `guides/multi-model-config` | `guides/multi-model/` (category index page) |
| `guides/goose-in-acp-clients` | `guides/acp-clients` (plus sibling `guides/acp-providers`) |
| `guides/customizing-sidebar` | `guides/desktop-navigation` |
| `guides/sandbox-for-goose-desktop` | `guides/sandbox` |
| `guides/mcp-apps` | doc on living spec is `guides/interactive-chat/mcp-ui`; MCP Apps server doc is `mcp/apps-mcp`; full developer tutorial is `tutorials/building-mcp-apps` |
| `tutorials/agentic-testing-playwright` | `tutorials/playwright-skill` |
| `tutorials/ci-cd-environments` | `tutorials/cicd` |
| `tutorials/observability-laminar/langfuse/mlflow` | `tutorials/laminar`, `tutorials/langfuse`, `tutorials/mlflow` |
| `remote-access/...` | `experimental/remote-access/...` |
| `remote-access/vs-code-extension` | `experimental/vs-code-extension` |

The MCP Apps story has THREE pages in the docs and Jez's list collapses them:
- `mcp/apps-mcp` — the built-in Apps **extension** (single-file HTML user-managed mini-apps stored in `~/.local/share/goose/apps/`)
- `guides/interactive-chat/mcp-ui` — older MCP-UI spec (still supported)
- `tutorials/building-mcp-apps` — the **developer** tutorial for shipping MCP server-hosted interactive UIs (this is the one our dashboard pattern lines up with)

Document accordingly: "MCP Apps" on Goose-docs usually means the **server-delivered iframe UIs**, not the user's local HTML apps. Both are alive, both render in the chat surface.

---

## 1. MCP Sampling — the exact contract for our wiki.search synthesis design

### What it is

> "MCP Sampling is a Model Context Protocol feature that allows extensions to request AI assistance directly. Extensions can leverage goose's AI capabilities to provide expert-level guidance, perform contextual analysis, and create entirely new interaction patterns."

This is the **inverse of normal tool calling**. Normally Goose's host LLM calls a tool on our server. With sampling, our server (the MCP extension) calls *back* to Goose's host LLM, asking it to do completion work for us.

### Status in Goose

- **"Automatically enabled in goose, no configuration required!"** — every Goose install supports sampling.
- Any MCP server that implements sampling gets it for free.

### The contract (sampling/createMessage)

The doc page itself doesn't print the wire format — but the `tutorials/custom-extensions` page confirms:

> "MCP Sampling enables your server to 'request AI completions from goose's LLM' without needing separate API keys. Use `sampling/createMessage` method in your server for intelligent tool responses. Supports text and image content types."

The MCP method is **`sampling/createMessage`** sent from server → client (Goose). Goose's host LLM produces the completion and returns it to the calling server.

Per the upstream MCP spec (https://modelcontextprotocol.io/specification — referenced indirectly by Goose's own docs), the createMessage request shape is:

```json
{
  "method": "sampling/createMessage",
  "params": {
    "messages": [
      { "role": "user", "content": { "type": "text", "text": "..." } }
    ],
    "modelPreferences": {
      "hints": [{ "name": "claude-3-sonnet" }],
      "costPriority": 0.5,
      "speedPriority": 0.5,
      "intelligencePriority": 0.9
    },
    "systemPrompt": "...",
    "includeContext": "thisServer" | "allServers" | "none",
    "temperature": 0.7,
    "maxTokens": 1000,
    "stopSequences": ["..."],
    "metadata": {}
  }
}
```

Response shape:

```json
{
  "model": "claude-3-sonnet-...",
  "stopReason": "endTurn" | "stopSequence" | "maxTokens",
  "role": "assistant",
  "content": { "type": "text" | "image", "text": "..." }
}
```

**Goose specifics confirmed by the docs:** text and image content both supported. Does NOT need separate API keys — Goose's existing provider config handles it.

### Use cases the docs name (and how they map to Office Town)

| Use case named in docs | Office Town parallel |
|---|---|
| "Smart documentation tools explaining code contextually" | `wiki.search` synthesis: server fetches matching wiki entries, calls back to host LLM with `messages=[{user: "Summarise these N entries for the user's question"}]`, returns a synthesised answer |
| "Intelligent search with filtering and ranking" | Re-rank `wiki.search` results using the host LLM |
| "Database analyzers providing optimization recommendations" | n/a for us — but the shape is identical to "analyse wiki entries and surface gaps" |
| "Multi-perspective analysis synthesizing multiple viewpoints" | The wiki.synthesize pattern: pull several entries, feed them to host LLM, ask for a meta-answer |

**Office Town design implication:** our `wiki.search` tool should default to returning matches as raw JSON. If the consumer wants a synthesised answer, the server should make a `sampling/createMessage` call **using the user's original question as the prompt** + the matched entries as context. The host LLM does the synthesis — we don't need our own LLM, our own keys, or our own model choice. That's the killer simplification.

### Where sampling is documented

- Guide: `https://goose-docs.ai/docs/guides/mcp-sampling`
- Developer detail: `https://goose-docs.ai/docs/tutorials/custom-extensions` (under "Advanced Features → MCP Sampling")

### Key facts to surface in our own docs

1. The MCP extension always issues sampling requests; the **client (Goose)** is the one with the LLM credentials.
2. The user (in Goose) sees the sampling request happen — depending on Goose's host-LLM permission model the user may need to approve it (per upstream MCP spec, sampling is a user-mediated action; Goose's specific UX for approval isn't documented on the public page but the auto-approve/manual-approve modes likely apply).
3. The MCP Python SDK (`mcp[cli]`) provides helpers for issuing sampling requests from inside a tool handler.

### What the docs DON'T say (gaps Jez should know)

- The exact UX for approving a sampling request in Goose Desktop (does it appear inline in chat? Auto-approve in `auto` mode?) is not on the public guide page.
- Cost accounting: when our server triggers a sampling request, the tokens come out of the user's host-LLM budget. Goose's `GOOSE_CLI_SHOW_COST` and Cost Tracking should pick it up (per `smart-context-management` doc) but this isn't explicitly stated for sampling.
- Streaming sampling responses: the public guide doesn't say whether sampling supports streaming or only returns the full completion.

---

## 2. MCP Apps and MCP-UI — embedding pattern for our dashboard

### The three pages

1. **`mcp/apps-mcp`** — built-in Apps extension. User-created single-file HTML mini-apps. Stored locally. Out of scope for us.
2. **`guides/interactive-chat/mcp-ui`** — older MCP-UI spec. Still works. Embeds interactive content in chat.
3. **`tutorials/building-mcp-apps`** — the FULL developer tutorial for shipping server-hosted interactive UIs via MCP. **This is what our dashboard would use.**

### Architecture (from `tutorials/building-mcp-apps`)

```
Your MCP App (HTML/JS in iframe)
    ↓ postMessage
goose Desktop (renders UI, routes messages)
    ↓ MCP Protocol
Your MCP Server (serves HTML via resources)
```

The Goose desktop creates a **sandboxed iframe with strict Content Security Policy**. Your server delivers HTML; the iframe runs it; postMessage is the two-way comms channel back to the host.

### Server-side contract (Node.js SDK example from the tutorial)

Tool response that triggers a UI render:

```javascript
return {
  content: [{
    type: "text",
    text: "The demo app is now displayed!"
  }],
  _meta: {
    ui: {
      resourceUri: "ui://mcp-app-demo/main"
    }
  }
}
```

**Key detail:** the `_meta.ui.resourceUri` field points to a resource the server exposes. Goose fetches that resource and renders it.

Resource declaration:

```javascript
{
  uri: "ui://mcp-app-demo/main",
  name: "MCP App Demo",
  description: "An interactive demo",
  mimeType: "text/html;profile=mcp-app"
}
```

The MIME type **`text/html;profile=mcp-app`** is the magic — that's what tells Goose to render in the MCP-App sandbox iframe (vs. just showing HTML inline).

### CSP configuration (set on the resource response)

```javascript
_meta: {
  ui: {
    csp: {
      connectDomains: [],     // → connect-src (fetch/XHR)
      resourceDomains: [],    // → script-src, style-src, img-src, font-src, media-src
      frameDomains: [],       // → frame-src (nested iframes)
      baseUriDomains: []      // → base-uri
    }
  }
}
```

If we want our dashboard's iframe to call back to `wiki.officetown.au/api/...`, we'd add that domain to `connectDomains`.

### Browser permissions

```javascript
_meta: {
  ui: {
    permissions: {
      camera: true,
      microphone: true,
      geolocation: true,
      clipboardWrite: true
    }
  }
}
```

### Iframe ↔ Host postMessage protocol (from inside the iframe HTML)

| Direction | Method | Purpose |
|---|---|---|
| iframe → host | `request('ui/initialize', {})` | Get initial host context |
| iframe → host | `request('ui/message', { content: { type: 'text', text: ... }})` | Send a message into the chat as if the user typed it |
| iframe → host | `notify('ui/notifications/size-changed', { height: ... })` | Tell host how tall the iframe should be |
| iframe → host | `notify('ui/notifications/initialized', {})` | Tell host "I'm ready" |
| host → iframe | `ui/notifications/host-context-changed` | Theme, etc. changed — react |

```javascript
// Inside the iframe HTML
window.addEventListener('message', (e) => {
  if (e.data.method === 'ui/notifications/host-context-changed') {
    if (e.data.params?.theme) {
      applyTheme(e.data.params.theme);
    }
  }
});
```

### Prerequisites

- Node.js 18 or higher
- goose Desktop 1.19.1 or later

### Status

> "MCP Apps support is currently experimental, based on draft specification with minimal implementation. Advanced capabilities and persistent app windows are not yet supported."

So: works today, expect it to evolve. Don't bet a production-only product on this — but a dashboard preview surface is exactly the right scope.

### Office Town design implication

**Our dashboard could ship as an MCP App.** The shape:

1. User in Goose chat says "show my Office Town dashboard" or invokes our `dashboard.open` tool
2. Our MCP server's tool handler returns the `_meta.ui.resourceUri` pattern above
3. Goose fetches the HTML resource — which is our React-rendered single-file dashboard
4. Inside the iframe, we use `ui/message` to send wiki entries back into chat when the user clicks them
5. Theme follows Goose's theme via `host-context-changed`

The Pro of this approach: zero install for the user. The Con: experimental spec, no persistence between sessions, single iframe-only (can't have a separate window).

### Older MCP-UI (still supported)

> "MCP-UI is an earlier specification for interactive UIs that renders content embedded in your chat. While MCP Apps is now recommended, MCP-UI extensions continue to work in goose."

Adding a remote MCP-UI extension via CLI:
1. `goose configure`
2. Select "Remote Extension (Streamable HTTP)"
3. Provide name, Streamable HTTP endpoint URI, timeout (default 300 s), description
4. Optionally add custom headers

Demo extension: `https://mcp-aharvard.netlify.app/mcp` — features include interactive seat selection and weather displays.

### The other "Apps" — `mcp/apps-mcp` (built-in extension, different thing)

For completeness, this is the *user-managed* HTML mini-app feature:

- **Storage:** `~/.local/share/goose/apps/` (macOS/Linux) or `%APPDATA%\Block\goose\data\apps\` (Windows)
- **Format:** Single HTML file with JS/CSS inline, no npm/external deps
- **Sandboxing:** Apps run in standalone, sandboxed windows
- **Activation:** Built-in platform extension, enabled by default for new users
- **Use case:** User-built calculators, JSON formatters, dashboards, etc., created via chat without editing files

Not what we need for our dashboard, but worth knowing exists.

---

## 3. MCP Elicitation — structured user input requests

### What it is

> "MCP Elicitation allows goose to pause and ask you for specific information when an extension needs it."

Rather than the extension guessing or asking via chat prose, it can pop a **structured form**.

### Status

> "This feature activates automatically within goose when extensions supporting elicitation require user input."

No config needed.

### UX

**Desktop:** forms appear inline in chat with data-entry fields, required asterisks, default values, submit button.

**CLI:** terminal prompts with:
- Cyan-colored explanatory messages
- Yellow field names with descriptions
- Red asterisks for required fields
- `[default]` brackets for defaults
- Interactive yes/no toggles
- `Ctrl+C` to cancel

### Critical timeout

> "Elicitation requests timeout after 5 minutes. If you don't respond in time, the request is cancelled and goose will continue without the information."

### Spec link

> "Extension developers can reference the MCP Elicitation specification (https://modelcontextprotocol.io/specification/draft/client/elicitation) to integrate structured input requests."

### Supported mode

> "goose specifically supports form mode requests as defined in the MCP standard."

### Office Town design implication

Where we want a user-confirm step in the middle of an op (e.g., "Which wiki to update?" / "Confirm delete?"), use elicitation rather than parsing chat replies. Cleaner, more deterministic, has a hard timeout.

For our v1 we likely won't need this — but having it on the radar for "should I file this in the personal or team wiki?" prompts is valuable.

---

## 4. MCP Roots — workspace boundary sharing

### What it is

> "MCP Roots lets goose share your session working directory with roots-aware MCP extensions."

The active workspace is exposed to extensions so they know which folder the user is operating in.

### Single root model

> "The root list contains one entry — your current session working directory. This maps to how Goose already operates with one active project directory at a time."

### Automatic updates

When the user changes the session working directory, "goose updates the root and notifies connected extensions automatically."

### What extensions can do with it

- Request the current root list
- Scope file operations to that root
- React if the root changes during the session

### How users see it

- **Desktop:** Current working directory at the bottom of the chat window — click to change
- **CLI:** Session root = launch directory; resume prompts may ask to return to the original

### Office Town design implication

**Roots are about local filesystem boundaries — not about wiki/knowledge boundaries.** Our wiki is remote (Cloudflare), not a local folder, so MCP roots probably aren't where our wiki entries would surface.

BUT — if we ever ship a local sync (where the wiki mirrors to a folder on disk), that folder could be advertised as a root and our local MCP extension could pick it up.

**For now: not in scope.** Worth re-checking if we move toward local-first.

---

## 5. Custom Distributions — Jez parked this; what's changed?

### The parked decision (per Jez's task list: `#45 Reposition as 'capabilities for Goose' — drop custom distro`)

We pivoted away from shipping a forked Goose distro and toward shipping capabilities (MCP extensions, recipes, skills) that drop into vanilla Goose.

### What the docs page still says

The `guides/custom-distributions` page describes Goose as "designed to be forked and customized" with this customization table:

| Customization | Complexity |
|---------------|-----------|
| Preconfigure a model/provider | Low |
| Add custom AI providers (declarative JSON, no code) | Low |
| Bundle custom MCP extensions | Medium |
| Modify system prompts | Low |
| Customize desktop branding (icons, names, colors) | Medium |
| Build a new UI via REST API or ACP | High |
| Create guided workflows with recipes | Low |

Environment variables for distro preconfig:
- `GOOSE_PROVIDER`
- `GOOSE_MODEL`

Config files:
- `config.yaml` — primary config
- `init-config.yaml` — applied on first launch

> "Complete details are available in the repository's `CUSTOM_DISTROS.md` file covering architecture, configuration, extension bundling, branding, interfaces, and licensing compliance."

### Has anything changed that un-parks this?

**Reading the table again, the answer is no — and yes-with-an-asterisk.**

Items we already get without forking (the entire reason to drop custom distro):
- **"Add custom AI providers (declarative JSON, no code)"** — this is Jez's `alibaba.json` upstream PR (`#48 completed`). Ship a provider JSON, Goose picks it up. No fork.
- **"Bundle custom MCP extensions"** — works at user-install time without a fork: `goose configure` → add extension command.
- **"Create guided workflows with recipes"** — pure YAML, no fork.
- **MCP Sampling / Apps / Elicitation / Roots** — all work in vanilla Goose. No fork.

Items that would still need a fork:
- Desktop branding (icons, names, colors)
- Modifying system prompts globally
- Building a new UI (we've effectively already opted out by going MCP-App route)

**Recommendation: keep custom-distro parked.** The shape of Goose's plugin surface (declarative providers + MCP servers + recipes + skills) means we don't have to fork to ship a distinctive product. The only thing a fork would buy us is co-branding inside Goose itself, and that's not where our differentiation lives. Office Town's brand lives in the wiki and dashboard surfaces, not in the chat window's logo.

If we ever want a turnkey "Office Town Edition of Goose" with branded installers, we revisit. For now: stay on capabilities-for-Goose.

---

## 6. LLM Rate Limits

### From `guides/handling-llm-rate-limits-with-goose`

The doc is light. Goose itself doesn't ship retry-with-backoff config (no documented `GOOSE_RATE_LIMIT_RETRY` etc.). It punts to providers that handle it:

- **Tetrate Agent Router** (router.tetrate.ai) — "enterprise-grade routing, built-in rate limiting, and automatic failover" across Claude, Gemini, GPT, open-weight models
- **OpenRouter** (openrouter.ai) — "automatic provider switching"

**No documented config keys, env vars, retry/backoff strategies** for handling rate limits inside Goose itself.

### Office Town implication

If we ship our own Goose-compatible provider (declarative JSON), it would be on us to handle rate-limit headers. Not our problem if we don't ship a provider.

---

## 7. Logging system (`guides/logs`)

### Storage locations

**Command history:**
- Unix: `~/.config/goose/history.txt`
- Windows: `%APPDATA%\Block\goose\data\history.txt`

**Session records (SQLite DB):**
- Unix: `~/.local/share/goose/sessions/sessions.db`
- Windows: `%APPDATA%\Block\goose\data\sessions\sessions.db`

**System logs:**
- Unix: `~/.local/state/goose/logs/`
- Windows: `%APPDATA%\Block\goose\data\logs\`

### Privacy guarantees

> "All conversations and interactions...are stored locally" and "logs are never sent to external servers or third parties."

### Session naming

`YYYYMMDD_<COUNT>` format (e.g., `20250310_2`). Retrieved via `goose session list`.

### Storage migration

> "Version 1.10.0+ migrated session data from individual `.jsonl` files to SQLite database with automatic legacy import."

### Log types

| Type | Location | Notes |
|---|---|---|
| Desktop App | macOS: `~/Library/Application Support/Goose/logs/main.log` | Platform-specific operational logs |
| CLI Logs | `~/.local/state/goose/logs/cli/` | Date-organised subdirectories; auto-deleted after 2 weeks |
| Server Logs | `~/.local/state/goose/logs/server/` | Daemon (`goosed`) communication and extension init |
| LLM Requests | `~/.local/state/goose/logs/llm_request.*.jsonl` | 10 most recent rotated files (0-9) |

### Session DB contents

Metadata, conversation messages, tool calls/results, token usage, extension configuration data — all in SQLite.

### Office Town implication

If we ever want to debug an interaction between our MCP server and a user's Goose, point them to `~/.local/state/goose/logs/server/` and the LLM-request rotated jsonl files — those will show the sampling/createMessage calls if any.

---

## 8. Usage Data (`guides/usage-data`)

### What's collected (with opt-in)

- System info: OS version, architecture
- Product data: Goose version, install method
- Usage patterns: provider/model names, extension usage counts, session duration, interaction count, token usage
- Error classification: type only (e.g., `rate_limit`, `auth`) — no details

### What's NOT collected

> "your conversations, code, tool arguments, error messages, or any personal data"

### Config

- Env var: `GOOSE_TELEMETRY_ENABLED`
- Config file: `~/.config/goose/config.yaml` (path varies by OS)

### Managing

- CLI: `goose configure` → goose settings → Telemetry
- Desktop: Sidebar → Settings → App tab → Privacy section → "Anonymous usage data" toggle

### LLM provider note

> "depending on your LLM provider, your conversations, prompts, and information accessed by goose might be sent to the provider and subject to their data retention and privacy policies."

---

## 9. File Management (`@` fuzzy search in chat)

Note: there's no `guides/file-management` page; the docs describe file access as part of the Desktop chat UI's `@` fuzzy file search.

### Quick file search

- Type `@` in chat input → file search box appears
- Case-insensitive fuzzy matching: `@readme`, `@config.js`
- Arrow keys ↑/↓ to navigate, click to insert
- `Esc` to close

### Search scope

- Up to 5 directory levels deep
- Auto-excludes: `.git`, `node_modules`, `__pycache__`, `target`, `dist`, `build`
- Includes config dirs: `.github`, `.vscode`, `.idea`, `.config`
- Cross-platform (`/Users`, `C:\Users`, `/home`)

### Best practices (per the docs)

- Use git, commit before goose runs
- Run unit tests after modifications
- Use diff tools / code review
- Structure into modules/subdirectories

---

## 10. Running Tasks (`guides/running-tasks`) + Headless Goose (`tutorials/headless-goose`)

### `goose run` — the headless entry point

> "starts a new session, begins executing using any arguments provided and exits the session automatically once the task is complete."

### Three input methods

```bash
goose run -t "your instructions here"
goose run -i instructions.md
echo "What is 2+2?" | goose run -i -
```

### Session management flags

- `-s` / `--interactive` — continue in interactive mode after task
- `-n` — name session for resumption
- `-r` — resume saved session
- `--no-session` — discard, don't store

### Provider / model

- `--provider` — overrides env vars
- `--model` — specify model

### Extensions

- `--with-builtin "developer,computercontroller"` — load built-ins
- `--with-extension` — add custom extension with params
- `--with-streamable-http-extension` — HTTP-based extensions

### Output / debugging

- `--debug`
- `--output-format json` — for CI/CD
- `--output-format stream-json` — real-time structured events

### Headless-specific env vars

| Var | Purpose | Example |
|---|---|---|
| `GOOSE_CONTEXT_STRATEGY` | Context handling | `summarize` |
| `GOOSE_MAX_TURNS` | Execution limit | `50` |
| `GOOSE_MODE` | Behaviour mode | `auto` |
| `GOOSE_PROVIDER` | Model provider | `openai` |
| `GOOSE_MODEL` | Model selection | `gpt-4o` |
| `GOOSE_DISABLE_SESSION_NAMING` | Skip naming call | `true` |
| `GOOSE_CLI_MIN_PRIORITY` | Output verbosity | `0.2` |

### Recipes for headless

Recipes MUST include a `prompt` field for headless. Without it, the recipe fails.

```yaml
prompt: "Clear instruction describing the automated task"
title: "Recipe Name"
parameters:
  - key: param_name
    input_type: string
    requirement: required
    default: "value"
extensions:
  - type: builtin
    name: developer
```

### Multi-recipe execution

```bash
goose run --recipe main-workflow.yaml \
  --sub-recipe security-audit.yaml \
  --sub-recipe performance-analysis.yaml \
  --params environment=production
```

### Office Town implication

Recipes are the user-facing way to package "do this Office Town flow" as a one-liner. We could ship recipes like:
- "Sync this morning's notes into the wiki"
- "Summarise last week's wiki additions"

These get installed under `~/.config/goose/recipes/` and run via `goose run --recipe officetown-morning-sync.yaml`.

---

## 11. Extension Allowlist (`guides/allowlist`)

### Purpose

Corporate environments need to restrict which MCP servers users can install as extensions. The allowlist file enumerates approved extension commands.

### Config

- Env var: `GOOSE_ALLOWLIST` — URL to YAML file
- Unset → no restrictions
- HTTPS required

### YAML format

```yaml
extensions:
  - id: extension-id
    command: command-name
```

### Example

```yaml
extensions:
  - id: slack
    command: uvx mcp_slack
  - id: github
    command: uvx mcp_github
  - id: jira
    command: uvx mcp_jira
```

### Behaviour

- Fetched on first need + every restart
- Install commands matched exactly against entries
- Rejected installs logged

### Office Town implication

If Jez wants Office Town to be the *only* extension a team can install, an allowlist YAML hosted at `wiki.officetown.au/allowlist.yaml` enforces that. This is a real corporate-sale feature.

---

## 12. Remote Goose Server (`guides/remote-goose-server`)

### What it is

Goose Desktop normally runs `goosed` (the backend) on the same machine. You can split them — desktop on your laptop, `goosed` on a remote VM.

### TLS is mandatory

> "will refuse to connect to a remote `goosed` server over plain HTTP."

### Env vars

| Variable | Purpose |
|----------|---------|
| `GOOSE_HOST` | Network interface (`0.0.0.0` for external) |
| `GOOSE_PORT` | TCP port |
| `GOOSE_TLS` | Must be `true` |
| `GOOSE_SERVER__SECRET_KEY` | Shared auth secret (double underscore!) |

### Startup

```bash
GOOSE_HOST=0.0.0.0 \
GOOSE_PORT=3000 \
GOOSE_TLS=true \
GOOSE_SERVER__SECRET_KEY='YOUR_SECRET' \
/Applications/Goose.app/Contents/Resources/bin/goosed agent
```

### Certificate pinning

Self-signed cert generated; SHA-256 fingerprint logged:
`GOOSED_CERT_FINGERPRINT=AA:BB:CC:DD:EE:FF:...`

Client pins this fingerprint instead of trusting a CA.

### Desktop client config

Settings → goose Server →
- "Use external server" ON
- URL: `https://hostname:3000`
- Secret Key: matches `GOOSE_SERVER__SECRET_KEY`
- Certificate Fingerprint: matches server log

### Auth header

Client sends: `X-Secret-Key: YOUR_SECRET`

### macOS LaunchAgent

Path: `~/Library/LaunchAgents/com.goose.goosed.external.plist`
- Logs: `~/Library/Logs/GooseExternal/`
- `RunAtLoad`, `KeepAlive` enabled
- `chmod 600` for security

### Verification commands

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
curl -i https://127.0.0.1:3000/status -k
curl -i https://127.0.0.1:3000/config/read -k -H 'X-Secret-Key: YOUR_SECRET'
```

### Office Town implication

Probably not directly relevant — but **interesting for a hosted-Goose play**: we could run `goosed` on Cloudflare-fronted infra and let users connect their desktop to it. Not on the roadmap, but the API surface is documented.

---

## 13. Multi-Model Configuration (`guides/multi-model/`)

The category index page describes approaches but doesn't lay out concrete config:

- Planner + execution model setup
- Manual planning mode with a dedicated decomposition model
- Turn-based model selection
- Dynamic context-aware switching

> "LLMs are specialized tools"

### Recipe-level model setting

From the recipe reference:
```yaml
settings:
  goose_provider: openai
  goose_model: gpt-4o
  temperature: 0.5
  max_turns: 50
```

### Env-level overrides

- `GOOSE_PLANNER_PROVIDER`
- `GOOSE_PLANNER_MODEL`
- `GOOSE_PLANNER_CONTEXT_LIMIT`

### Office Town implication

For our content engine (if we ever do bulk wiki processing), being able to set a cheaper model for the planning step vs. a smarter one for the synthesis step matters. Recipes give us per-recipe model selection without forcing the user to change their global config.

---

## 14. Goose in ACP Clients (`guides/acp-clients`) and ACP Providers (`guides/acp-providers`)

### ACP (Agent Client Protocol)

> "an emerging specification that enables clients to communicate with AI agents like goose"

Allows code editors / IDEs to connect natively with AI agents without window-switching.

### Two directions

1. **Goose AS an ACP server** — IDEs like Zed and VS Code connect to Goose via ACP, using Goose as their agent
2. **Goose AS an ACP client** — Goose connects to other agents (Claude Code, Codex, Pi) and uses them as its provider

### Goose as ACP server (the IDE-integration direction)

#### Setup in Zed

```json
{
  "agent_servers": {
    "goose": {
      "command": "goose",
      "args": ["acp"],
      "env": {}
    }
  }
}
```

#### Env vars

- `GOOSE_PROVIDER`
- `GOOSE_MODEL`

#### Lifecycle

Initialization via `goose acp` command. Comms via JSON-RPC over stdio. Sessions have persistent history. Mid-session model/mode switching. File operations with native diff. Terminal integration.

#### MCP server forwarding

Goose passes extensions through to the ACP client as MCP servers — only stdio and HTTP supported (SSE deprecated):

```json
{
  "context_servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}
```

#### TUI client launch

```bash
npm start                       # auto-launch server
npm start -- --server http://HOST:PORT
npm start -- --text "prompt"    # single-shot scripting
```

Key bindings: `Enter` send, `↑/↓` scroll, `Shift+↑/↓` history, `Tab` toggle tool detail, `Ctrl+C` / `Esc` exit.

### Goose as ACP client (using other agents as providers)

Available ACP providers:
- **Amp ACP** — wraps amp-acp adapter for Amp subscription
- **Claude ACP** — wraps claude-agent-acp for Claude Code subscription
- **Codex ACP** — wraps codex-acp for ChatGPT Plus/Pro
- **Pi ACP** — wraps pi-acp adapter for Pi

#### Env vars

```bash
export GOOSE_PROVIDER=claude-acp   # claude-acp | codex-acp | amp-acp | pi-acp
export GOOSE_MODEL=default
export GOOSE_MODE=auto             # auto | smart-approve | approve | chat
```

#### Known Claude ACP models

`default` (opus), `sonnet`, `haiku`

#### Known Codex ACP models

`gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`

#### Limitations

> "No session fork or resume — cannot use `goose session resume` or `goose session fork`. ACP session IDs differ from goose session IDs."

### Office Town implication

If a user has a Claude Code or ChatGPT Plus subscription, they can run Goose against that via ACP — no separate API keys needed. **Our MCP extensions work in either direction** because Goose forwards them. That's a clean differentiator: "works with whatever subscription you already have."

---

## 15. Enhanced Code Editing (`guides/enhanced-code-editing`)

### Concept

The Developer extension's `str_replace` command can be upgraded with a dedicated edit model for intelligent diffs.

### Three env vars (all required + non-empty to activate)

```bash
export GOOSE_EDITOR_API_KEY="your-api-key"
export GOOSE_EDITOR_HOST="https://api.openai.com/v1"
export GOOSE_EDITOR_MODEL="gpt-4o"
```

### Provider examples

| Provider | Host | Model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-3-5-sonnet-20241022` |
| Morph, Relace, local | OpenAI-compatible | various |

### Behaviour

Backwards-compatible: if env vars unset, falls back to plain string replace.

---

## 16. Codebase Analysis (`guides/codebase-analysis`)

### The `analyze` tool (Developer extension)

Three modes:

| Mode | Command | Purpose |
|---|---|---|
| Structure | `analyze path="src/"` | Directory overview, metrics |
| Semantic | `analyze path="main.py"` | Functions, classes, imports per file |
| Focus | `analyze path="src/" focus="authenticate"` | Track symbol across files |

### Parameters

| Param | Default | Purpose |
|---|---|---|
| `path` | required | File or dir path |
| `focus` | none | Symbol name for cross-file tracking |
| `follow_depth` | 2 | Call chain depth |
| `max_depth` | 3 | Subdir traversal levels |
| `force` | false | Override 1000-line output warning |

### Best practices

- Use `.gooseignore` and `.gitignore` to exclude
- Start narrow, expand
- Delegate large analyses to subagents

---

## 17. Customising the Sidebar (`guides/desktop-navigation`)

Desktop-only feature.

### Access

Sidebar (top-left button) → Settings → App tab → Navigation section

### Style

- **Tile** (default): large icons with labels in grid
- **List**: compact single-column; under 700px window auto-collapses to icons-only

### Position

Left (default), Right, Top, Bottom

### Mode

- **Push** (default): sidebar pushes content
- **Overlay**: floats above content; Style + Position become unavailable, full-screen tile overlay

### Customisation

- Drag items to reorder
- Eye icons hide/show items
- "Reset to defaults" button

### Toggle

- View → Toggle Navigation
- Customisable keyboard shortcut (Settings > Keyboard)
- State persists across sessions

### Office Town implication

Nothing directly — but useful to know: if our dashboard ships as an MCP App, users will access it from chat triggers, not from the sidebar. The sidebar is reserved for built-in Goose surfaces (Home, Chat, Recipes, Apps, Scheduler, Extensions, Settings).

---

## 18. Sandbox for Goose Desktop (`guides/sandbox`) — macOS only

### Two layers of protection

1. Apple's `sandbox-exec` (`/usr/bin/sandbox-exec`) — system-level restrictions
2. Local egress proxy — network filtering

### OS limit

> "The sandbox relies on `/usr/bin/sandbox-exec`, which is only available on macOS."

Linux/Windows: no sandbox.

### Activation

```bash
export GOOSE_SANDBOX=true
open -a Goose
```

### Config vars (full table)

| Variable | Default | Purpose |
|---|---|---|
| `GOOSE_SANDBOX` | false | Master enable |
| `GOOSE_SANDBOX_PROTECT_FILES` | true | Write-protect SSH keys, shell configs, goose config |
| `GOOSE_SANDBOX_ALLOW_IP` | false | Allow bare-IP connections |
| `GOOSE_SANDBOX_BLOCK_RAW_SOCKETS` | true | Block `SOCK_RAW` |
| `GOOSE_SANDBOX_BLOCK_TUNNELING` | true | Block `nc`, `netcat`, `socat`, `telnet` |
| `GOOSE_SANDBOX_ALLOW_SSH` | true | Allow/block SSH |
| `GOOSE_SANDBOX_GIT_HOSTS` | built-in | Comma-separated SSH git hosts |
| `GOOSE_SANDBOX_SSH_ALL_HOSTS` | false | SSH to any host |
| `LAUNCHDARKLY_CLIENT_ID` | — | Dynamic egress via LaunchDarkly |
| `GOOSE_SANDBOX_LD_FAILOVER` | — | `allow` / `deny` / `blocklist` |

### Write-protected paths

- `~/.ssh/`
- `~/.bashrc`, `~/.zshrc`, `~/.bash_profile`, `~/.zprofile`
- `~/.config/goose/sandbox/`
- `~/.config/goose/config.yaml`

### Network allow-list (only these)

- Localhost (proxy + server comms)
- Unix sockets (IPC)
- mDNSResponder (DNS resolution)

### Proxy filtering order

1. Loopback relay detection
2. Raw IP address blocking
3. Domain blocklist (`~/.config/goose/sandbox/blocked.txt`)
4. SSH/Git host restrictions on ports 22, 2222, 7999

### Blocklist file format

```
# One domain per line
evil.com          # blocks *.evil.com
pastebin.com
```

Auto-reloads via `fs.watch`.

### Blocked processes

`nc`, `ncat`, `netcat`, `socat`, `telnet`

### Blocked operations

`SOCK_RAW`, kernel extension loading

### Relaxed-mode config

```bash
export GOOSE_SANDBOX=true
export GOOSE_SANDBOX_PROTECT_FILES=false
export GOOSE_SANDBOX_BLOCK_RAW_SOCKETS=false
export GOOSE_SANDBOX_BLOCK_TUNNELING=false
export GOOSE_SANDBOX_ALLOW_IP=true
export GOOSE_SANDBOX_SSH_ALL_HOSTS=true
```

### Debug

Desktop logs prefixed `[sandbox-proxy]` show blocked connections with reasons.

### Office Town implication

Our MCP server would need to be reachable from the sandboxed Goose. If we host on `wiki.officetown.au` (a normal HTTPS public domain), no special config needed — it'll go through the proxy, pass the domain allowlist (assuming user hasn't added it to blocked.txt), and connect fine.

If a corporate user sandboxes their Goose AND maintains a corporate blocklist, we'd need to be on the allowlist. Document this in our install guide.

---

## 19. Agentic Testing with Playwright (`tutorials/playwright-skill`)

### What it is

Goose skill that uses Playwright CLI for browser automation. Stores accessibility trees locally instead of sending full DOMs to the LLM → faster, cheaper.

### Prereqs

- Node.js 18+
- `npm install -g @playwright/cli@latest`
- Optional: `npm init playwright@latest` to run resulting tests

### Install the skill

```bash
npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli
```

### Enable Summon extension

`goose configure` → Toggle Extensions → enable summon

### Capabilities

| Category | Features |
|---|---|
| Browser control | open, goto, click, fill, close |
| Capture/debug | screenshot, snapshot, video, trace |
| Tab management | open, switch, close |
| Storage/auth | save/restore cookies, login states |
| Network | mock APIs, intercept requests |
| Input | type text, press keys, mouse |

### Generated artifacts

- `tests/[task-name].spec.ts`
- `.playwright-cli/video-*.webm`
- `.playwright-cli/traces/*.trace`

### Translation example

`playwright-cli click e11` →
```typescript
await page.getByRole('link', { name: 'Docs' }).click();
```

### Office Town implication

Our dashboard UI testing could use this — but we already have `playwright-cli` in Jez's standard kit. Worth noting Goose has it as a first-class skill.

---

## 20. CI/CD Environments (`tutorials/cicd`)

### GitHub Actions workflow shape

`.github/workflows/goose.yml`:

**Triggers:** PR opened/sync/reopen/label.

**Permissions:**
```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
```

**Env:**
```yaml
env:
  PROVIDER_API_KEY: ${{ secrets.REPLACE_WITH_PROVIDER_API_KEY }}
  PR_NUMBER: ${{ github.event.pull_request.number }}
  GH_TOKEN: ${{ github.token }}
```

### Install in CI

```bash
curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh \
  | GOOSE_VERSION=REPLACE_WITH_VERSION CONFIGURE=false GOOSE_BIN_DIR=/home/runner/.local/bin bash
```

### Config

- Location: `~/.config/goose/config.yaml`
- Key params: `GOOSE_PROVIDER`, `GOOSE_MODEL`, `keyring: false` (recommended for CI)

### Run

```bash
goose run --instructions instructions.txt
```

### Output processing

Strip ANSI: `sed -E 's/\x1B\[[0-9;]*[mK]//g'`

### Parallel safety

> "goose supports running multiple concurrent sessions with isolated state."

### Office Town implication

We can run Office Town wiki syncs from CI. Useful for nightly bulk imports or scheduled regeneration.

---

## 21. Observability — Laminar / Langfuse / MLflow

All three exporters use **OpenTelemetry OTLP/HTTP** under the hood. Same env-var shape, different endpoints.

### Laminar (`tutorials/laminar`)

```bash
LMNR_PROJECT_API_KEY=lmnr_proj_...
OTEL_EXPORTER_OTLP_ENDPOINT="https://api.lmnr.ai"
OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer ${LMNR_PROJECT_API_KEY}"
OTEL_EXPORTER_OTLP_TIMEOUT=10000
```

Self-hosted: `OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:8000"` (auth-less variant omits HEADERS).

### Langfuse (`tutorials/langfuse`)

```bash
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=pk-lf-...
LANGFUSE_INIT_PROJECT_SECRET_KEY=sk-lf-...
LANGFUSE_URL=https://cloud.langfuse.com   # or us. or localhost:3000
```

### MLflow (`tutorials/mlflow`)

```bash
pip install mlflow
mlflow server --port 5000
```

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:5000"
export OTEL_EXPORTER_OTLP_HEADERS="x-mlflow-experiment-id=0"
# Optional — traces only
export OTEL_TRACES_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=none
export OTEL_LOGS_EXPORTER=none
```

Create dedicated experiment: `mlflow experiments create --experiment-name "goose-traces"`

### Office Town implication

If we want telemetry into how users invoke our MCP extension, we could ship a Langfuse-flavoured doc. But for v1, we rely on user-side opt-in via `GOOSE_TELEMETRY_ENABLED` and the existing observability stack.

---

## 22. Isolated Development Environments (`tutorials/isolated-development-environments`)

Uses **Container Use MCP** for containerised dev envs. Each branch gets its own container.

### Prereqs

- Docker (or Podman, NerdCtl, Apple Container)
- Git
- Goose

### Capabilities

- New git branch per experiment
- Container provisioning
- Host isolation

### Triggered by natural language

> "I want to experiment with adding a new feature, but I want to do it in an isolated environment"

### Troubleshoot

- `docker info` to check daemon
- Linux: `sudo usermod -aG docker $USER`

---

## 23. Ralph Loop (`tutorials/ralph-loop`)

### What it is

Iterative dev pattern (from Geoffrey Huntley's "Ralph Wiggum" technique). Fresh context per iteration via file-state persistence.

### Two roles

- **Worker model** — does the coding
- **Reviewer model** — different model, reviews output, returns `SHIP` or `REVISE`

### Env vars

| Var | Purpose |
|---|---|
| `RALPH_WORKER_MODEL` | Worker model |
| `RALPH_WORKER_PROVIDER` | Worker provider |
| `RALPH_REVIEWER_MODEL` | Reviewer model (different from worker) |
| `RALPH_REVIEWER_PROVIDER` | Reviewer provider |
| `RALPH_MAX_ITERATIONS` | Default 10 |
| `RALPH_RECIPE_DIR` | Recipe dir |

### State files in `.goose/ralph/`

| File | Role |
|---|---|
| `task.md` | Task description |
| `iteration.txt` | Current iteration # |
| `work-summary.txt` | Worker's progress |
| `work-complete.txt` | Worker done flag |
| `review-result.txt` | `SHIP` or `REVISE` |
| `review-feedback.txt` | Reviewer feedback |
| `.ralph-complete` | Successful exit marker |
| `RALPH-BLOCKED.md` | Created when worker stuck |

### Commands

```bash
~/.config/goose/recipes/ralph-loop.sh "Create a simple browser using Electron and React"
~/.config/goose/recipes/ralph-loop.sh ./prd.md

RALPH_WORKER_MODEL="gpt-4o" \
RALPH_WORKER_PROVIDER="openai" \
RALPH_REVIEWER_MODEL="claude-sonnet-4-20250514" \
RALPH_REVIEWER_PROVIDER="anthropic" \
~/.config/goose/recipes/ralph-loop.sh "Your task"
```

### Recipe install

```bash
mkdir -p ~/.config/goose/recipes
curl -sL https://raw.githubusercontent.com/aaif-goose/goose/main/documentation/src/pages/recipes/data/recipes/ralph-loop.sh -o ~/.config/goose/recipes/ralph-loop.sh
curl -sL https://raw.githubusercontent.com/aaif-goose/goose/main/documentation/src/pages/recipes/data/recipes/ralph-work.yaml -o ~/.config/goose/recipes/ralph-work.yaml
curl -sL https://raw.githubusercontent.com/aaif-goose/goose/main/documentation/src/pages/recipes/data/recipes/ralph-review.yaml -o ~/.config/goose/recipes/ralph-review.yaml
chmod +x ~/.config/goose/recipes/ralph-loop.sh
```

### Reset state

```bash
rm -rf .goose/ralph
```

### Office Town implication

Pattern-relevant for any "bulk wiki regeneration" we automate. Not v1.

---

## 24. Mobile Access (`experimental/remote-access/mobile-access`)

### What it is

iOS app connects to Goose Desktop via Lapstone HTTPS tunnel.

### Components

- iOS app: App Store ID **6752889295**
- Tunnel service: Lapstone (by Mic Neale)
- Goose Desktop stays running on Mac/Windows/Linux

### Setup

1. Download iOS app
2. Goose Desktop → Sidebar → Settings → Session → "Mobile App" → "Start Tunnel"
3. QR code appears with embedded secret key
4. Scan from iOS app

### Capabilities

Full Goose functionality from iPhone — create/resume conversations, access extensions, full remote operation with local processing on the desktop.

### Status

> "preview feature in active development"

No specific env vars documented.

---

## 25. Telegram Gateway (`experimental/remote-access/telegram-gateway`)

### What it is

Goose accessible via Telegram bot.

### Setup

1. Create bot via @BotFather, get token (format `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
2. Desktop → Settings → Gateways → enter bot token → Start
3. Generate pairing code, send to bot
4. Pair Telegram account

### CLI commands

```bash
goose gateway status
goose gateway start telegram --bot-token YOUR_BOT_TOKEN
goose gateway pair telegram
goose gateway stop telegram
```

### Capabilities

- Messages, syntax-highlighted code, multi-session, extensions all work
- Auto-compacting for long convos
- Markdown adaptation for Telegram formatting

### Management

Desktop → Gateway settings → view paired users, monitor sessions, revoke.

### Office Town implication

If a user has Office Town wiki access + the Telegram gateway running, they could text "show me the wiki entry on customer X" from their phone. Cute, not v1.

---

## 26. VS Code Extension (`experimental/vs-code-extension`)

### Install

- VS Code 1.95.0+
- Goose CLI installed
- Marketplace ID: `block.vscode-goose`

### Communication

Via **ACP** (Agent Client Protocol).

### Capabilities

- Selected code submission: `Cmd+Shift+G` (macOS) / `Ctrl+Shift+G` (Win/Linux), or right-click → "Send to goose"
- `@` file attachment in chat input
- Interactive chat with streaming
- Access to extensions
- Session history
- Clipboard tools

### Status

> "Experimental — behaviour and config may change."

---

## 27. Security — Prompt Injection Detection (`guides/security/prompt-injection-detection`)

### What it detects

> "malicious instructions hidden inside executable content"

Specifically:
- File deletion / system dir removal
- Remote script download + execution
- SSH key / sensitive data exfil
- Security-compromising system modifications

### Stages

1. **Interception** — tool calls extracted + analysed
2. **Risk assessment** — confidence score per threat
3. **Execution pause** — over threshold → user approval required
4. **Alert display** — confidence + finding + unique ID

Alert example: "🔒 Security Alert: This tool call has been flagged as potentially dangerous. Confidence: 95%"

### Config

Desktop: Settings → Chat tab → "Enable Prompt Injection Detection"

`config.yaml`:
```yaml
SECURITY_PROMPT_ENABLED: true
SECURITY_PROMPT_THRESHOLD: 0.8           # range 0.01-1.0, default 0.8
SECURITY_PROMPT_CLASSIFIER_ENABLED: true # ML-based
SECURITY_PROMPT_CLASSIFIER_ENDPOINT: "https://..."
SECURITY_PROMPT_CLASSIFIER_TOKEN: "..."
```

### Thresholds

| Range | Mode |
|---|---|
| 0.01-0.50 | Very lenient |
| 0.50-0.70 | Balanced (recommended) |
| 0.70-0.90 | Strict (sensitive systems) |
| 0.90-1.00 | Maximum (high-security) |

### ML-based

Optional. Analyses tool call + recent messages semantically. Hugging Face Inference API format compatible.

> "Tool call content and messages transmit to the configured endpoint when enabled." — privacy implication.

---

## 28. Security — Classification API Spec (`guides/security/classification-api-spec`)

For users self-hosting the ML classifier.

### Endpoint

- Method: POST
- Path: configurable (e.g., `/classify`, `/v1/classify`, or `/models/{model-id}` for HF)

### Request

```json
{
  "inputs": "string",
  "parameters": {}
}
```

### Response

```json
[
  [
    {"label": "INJECTION", "score": 0.95},
    {"label": "SAFE", "score": 0.05}
  ]
]
```

Score range 0.0-1.0. Labels: `"INJECTION"`/`"LABEL_1"` for threats; `"SAFE"`/`"LABEL_0"` for benign. Goose picks the highest-scoring label and uses the injection-label score directly (or `1.0 - score` for safe label).

### Status codes

- 200 OK — success
- 400 Bad Request
- 500 Internal Server Error
- 503 Service Unavailable (model loading, HF-specific)

---

## 29. Security — Adversary Mode (`guides/security/adversary-mode`)

### What it is

> "a silent, independent agent reviewer that watches tool calls before they execute"

### Activation

Create the file: `~/.config/goose/adversary.md`

Delete the file → disabled.

### Structure

`---` separator:
- Before: tool config
- After: security rules in plain English

### Default reviewed tools

- `shell`
- `computercontroller__automation_script` (shell, Ruby, AppleScript, PowerShell)

### Other reviewable tools

- `computercontroller__computer_control` (UI automation)
- `computercontroller__web_scrape` (URL fetching)

### Tool list config

```
tools: shell, computercontroller__automation_script
```

### Example rules

> "BLOCK if the tool call: Exfiltrates data...Is destructive beyond project scope...Installs malware or runs obfuscated code...Attempts to escalate privileges unnecessarily...Downloads and executes untrusted remote scripts"

### Outcome

ALLOW or BLOCK. Blocked = denied, agent cannot retry. **Fail-open**: if the reviewer itself fails, the call goes through.

---

## 30. Terminal Integration (`guides/terminal-integration`)

### Trigger

Type `@goose` or `@g` in shell prompt + question.

### Setup per shell

| Shell | Command |
|---|---|
| zsh | `eval "$(goose term init zsh)"` → `~/.zshrc` |
| bash | `eval "$(goose term init bash)"` → `~/.bashrc` |
| fish | `goose term init fish | source` → `~/.config/fish/config.fish` |
| Nushell | multi-line setup saving to `$nu.cache-dir` |
| PowerShell | `Invoke-Expression (goose term init powershell)` → `$PROFILE` |

### Usage

```
@goose "how do I fix this error?"
@g "what's in this directory?"
```

Auto-tracks command history since last question — no manual context needed.

### Named sessions

```bash
goose term init zsh --name my-project
```

Persists across terminal restarts + reboots.

### Optional flags

- `--default` — unresolved shell commands routed to goose
- `goose term info` — embed session-context-usage + active model in prompt (e.g., `●●○○○ sonnet ~/projects $`)

### Env var

`AGENT_SESSION_ID` — identifies current goose session for verification + context-sharing across terminal windows.

### Troubleshoot

Full-context indicator (`●●●●●`) means start fresh session.

---

## 31. Tanzu AI Services (`guides/tanzu-ai-services`)

OpenAI-compatible LLM access via VMware Tanzu Platform's `genai-service` broker.

### Env vars

| Key | Source |
|---|---|
| `TANZU_AI_ENDPOINT` | `credentials.endpoint.api_base` (NOT `credentials.api_base` — that one creates duplicate paths) |
| `TANZU_AI_API_KEY` | `credentials.endpoint.api_key` |
| `TANZU_AI_STREAMING` | Default `true` |

### CF commands

```bash
cf marketplace -e genai
cf create-service genai [PLAN] [INSTANCE]
cf create-service-key [INSTANCE] [KEY]
cf service-key [INSTANCE] [KEY]
```

### Verification

```bash
curl -H "Authorization: Bearer $TANZU_AI_API_KEY" "$TANZU_AI_ENDPOINT/openai/v1/models"
```

---

## 32. Subagents — context engineering (`guides/context-engineering/subagents`)

### Definition

> "Subagents are independent instances that execute tasks while keeping your main conversation clean and focused."

### Config

| Setting | Default | Notes |
|---|---|---|
| Max turns | 25 | Override via prompts or recipes |
| Timeout | 5 minutes | Extendable via natural language |
| Extensions | Inherited from parent | Restrictable via recipes |

### Env vars

- `GOOSE_SUBAGENT_MAX_TURNS`
- `GOOSE_RECIPE_PATH`

### Modes

- Autonomous permission mode (default)
- Disabled in: manual approval, smart approval, chat-only modes

### Two types

- **Internal** — goose instances with current session context
- **External** — third-party agents via MCP servers

### Allowed within subagent

- Extension discovery
- Resource access
- Extension tool use

### Blocked within subagent

- Creating additional subagents
- Enabling/disabling extensions
- Managing scheduled tasks

### Subagents tutorial (`tutorials/subagents`) — practical patterns

Six agent role types: Planner, PM, Architect, Frontend Dev, Backend Dev, QA Engineer, Tech Writer.

Spawning pattern:
```bash
goose run -t "YOUR_PROMPT_HERE" --quiet --no-session --max-turns 1
```

Use `spawn` (non-blocking) rather than blocking shell wrappers for invoking subagents from Node.

Output cleaning patterns the tutorial calls out:
- Strip ANSI escape codes
- Strip markdown code-fence wrappers around JSON

Parallel execution supported — multiple subagents can run concurrently.

---

## 33. Subrecipes in Parallel (`tutorials/subrecipes-in-parallel`) — experimental

> "goose recipes can execute multiple subrecipe instances concurrently using isolated worker processes."

### Worker pool

> "up to 10 concurrent workers"

### Mode rules

| Scenario | Default | Override |
|---|---|---|
| Different subrecipes | Sequential | Add "in parallel" to prompt |
| Same subrecipe, different params | Parallel | `sequential_when_repeated: true` or "sequentially" in prompt |

### Recipe-level flag

```yaml
sequential_when_repeated: true
```

### Sub-recipe registration

```yaml
sub_recipes:
  - name: weather
    path: "./subrecipes/weather.yaml"
```

### CLI dashboard shows

- Completed / running / failed / pending counts
- Task IDs + parameter sets
- Execution timing
- Output previews + errors
- Status: Pending → Running → Completed/Failed

---

## 34. Spraay x402 Extension (`tutorials/spraay-mcp`)

MCP server for crypto micropayments + AI access on Base.

### Capabilities

- Batch ETH/ERC-20 to up to 200 recipients
- Token operations: prices, balances, ENS resolution, swap quotes
- AI access: 200+ models (GPT-4, Claude, Llama, Gemini) via x402 pay-per-call

### Per-call costs

| Tool | Cost (USDC on Base) |
|---|---|
| spraay_chat | $0.005 |
| spraay_models | $0.001 |
| spraay_batch_execute | $0.01 |
| spraay_batch_estimate | $0.001 |
| spraay_swap_quote | $0.002 |
| spraay_tokens | $0.001 |
| spraay_prices | $0.002 |
| spraay_balances | $0.002 |
| spraay_resolve | $0.001 |

### Install

```bash
git clone https://github.com/plagtech/spraay-x402-mcp.git
cd spraay-x402-mcp
npm install
npm run build
```

### Env var

`EVM_PRIVATE_KEY` — wallet with USDC on Base.

### Desktop config

Name: `spraay`
Command: `node /absolute/path/to/spraay-x402-mcp/dist/index.js`
Timeout: 300s

### Flow

1. User asks goose to act
2. MCP server contacts `gateway.spraay.app`
3. Gateway responds HTTP 402 payment required
4. x402 client auto-signs USDC on Base
5. Gateway verifies, returns data

### Office Town implication

Pay-per-call model is an interesting precedent for MCP-server monetisation. Not for us v1, but a real pattern.

---

## 35. Remotion video creation (`tutorials/remotion-video-creation`)

### Prereqs

- Node.js 18+
- `npx skills add remotion-dev/skills`

### Licensing

> "Remotion is free for individuals and small teams, but requires a commercial license for companies with 3+ employees."

### Enable Summon

Desktop: Sidebar → Extensions → Summon ON
CLI: `goose configure` → Toggle Extensions → summon

### Capabilities

- Typewriter text, terminal styling, command-output simulation
- Bounce/spring/floating animations
- HD render

### Example output

14s @ 30fps, 1280x720, H.264, ~875 KB

---

## 36. Smart Context Management (`guides/sessions/smart-context-management`)

### Auto-compaction

Default trigger at **80% token usage** (Desktop + CLI).

```bash
export GOOSE_AUTO_COMPACT_THRESHOLD=0.6   # default 0.8, set 0.0 to disable
```

### Tool output summarisation

Triggers at 10+ tool calls (default). Controlled by `GOOSE_TOOL_CALL_CUTOFF`.

Custom summarisation: edit `compaction.md` prompt template.

### Manual compaction

- Desktop: click token-usage dot → "Compact now"
- CLI: `/summarize`

### Context-limit strategies (CLI)

```bash
export GOOSE_CONTEXT_STRATEGY=summarize   # default for headless
export GOOSE_CONTEXT_STRATEGY=truncate
export GOOSE_CONTEXT_STRATEGY=clear
export GOOSE_CONTEXT_STRATEGY=prompt      # default for interactive
```

Desktop only uses summarisation.

### Max turns

Default 1000.

- Desktop: Settings → Chat → Conversation Limits → Max Turns
- CLI: `goose configure` → goose settings → Max Turns
- Env: `GOOSE_MAX_TURNS` in config.yaml
- Runtime: `goose session --max-turns` / `goose run --max-turns`

### Recommended values

| Task | Turns |
|---|---|
| Exploratory/debugging | 5-10 |
| Defined moderate | 25-50 |
| Complex multi-step | 100+ |

### Token usage display

Desktop: coloured dot next to model name (green/orange/red).
CLI: `●●○○○` style indicator + percentage + token count/limit.

### Context limit override

```bash
export GOOSE_CONTEXT_LIMIT=1000
export GOOSE_PLANNER_CONTEXT_LIMIT=500000
```

Resolution precedence (high→low):
1. Explicit model config
2. Specific env var
3. Global env var
4. Model-based pattern matching
5. Global default (128,000 tokens)

CLI only (Desktop doesn't support yet).

### Credit balance monitoring

Tetrate Agent Router Service, OpenRouter, HTTP 402-compatible providers → "Insufficient Credits" notification.

### Cost tracking

- Desktop: Settings → App → Cost Tracking toggle
- CLI: `export GOOSE_CLI_SHOW_COST=true` or `GOOSE_CLI_SHOW_COST: true` in config.yaml

Multi-model sessions show per-model breakdown. Ollama/local: $0.00.

---

## 37. Synthesis — what matters most for Office Town's design

### The five capabilities of Goose we should design *for*

1. **MCP Sampling (highest leverage)** — our `wiki.search` should synthesise via `sampling/createMessage`. This is a core differentiator: we don't ship our own model, we don't bill for inference, we lean on the user's existing Goose-host LLM. **Section 1 of this doc has the exact contract.**

2. **MCP Apps (medium leverage, experimental)** — our dashboard could ship as an MCP App for a zero-install UX. Iframe + postMessage. **Section 2 has the exact resourceUri + CSP + permissions contract.** Caveat: experimental, persistence not yet supported.

3. **Recipes (low leverage, ready now)** — package Office Town flows as YAML recipes installable via `goose run --recipe`. Cheap to ship, easy for users to discover.

4. **Provider JSON (we already shipped this)** — `alibaba.json` PR is upstream. No further action.

5. **Extension Allowlist (corporate-sale leverage)** — host `wiki.officetown.au/allowlist.yaml` to enable "Office Town is the only extension a team can install" deployments.

### The four capabilities we should NOT chase

- **Custom Distributions** — stay parked. Per Section 5, the plugin surface gives us everything we need without forking.
- **MCP Roots** — local filesystem boundary, not relevant to our remote wiki. Revisit only if we ship local sync.
- **MCP Elicitation** — useful eventually for confirm-style prompts but v1 doesn't need it.
- **Sandbox-specific design** — sandbox is macOS-only and gated by `GOOSE_SANDBOX=true`. As long as we're a public HTTPS endpoint and the user's blocklist doesn't have us, we work. Document this in install guide; don't design around it.

### Patterns to mirror

- **Action-based gateway tools** (our own pattern from `mcp-gateway-pattern.md` — already aligned with what Goose's biggest MCP servers do).
- **`_meta.ui.resourceUri` for any interactive surface we ship** — not just dashboard, also for any rich preview of wiki entries.
- **Sampling for synthesis, tool returns for raw data** — keeps the "let the host LLM decide what to say" boundary clean.

### Open questions to confirm with code

- Does Goose's sampling UX in `auto` mode skip approval, or does sampling always prompt? (Spec is user-mediated; Goose's implementation isn't on the public page.)
- Do MCP App iframes get reloaded on every tool invocation, or do they persist for the session? (Tutorial says persistence not yet supported, so likely reload — confirm before designing stateful dashboard UX.)
- For the `sampling/createMessage` round-trip, does Goose surface the tokens used in its Cost Tracking? (Should — same provider — but not explicit in docs.)

### Things in our shipped state to double-check post-pivot

- `alibaba.json` PR (`#48`) merged upstream — confirm it landed in `block/goose` main.
- Recipes folder convention — `~/.config/goose/recipes/` matches the Ralph Loop install pattern (Section 23). Use the same path for our recipes.
- INSTALL.md (`#42`) — should reference `goose configure → Add Extension → Streamable HTTP` for remote MCP install (per Section 2's MCP-UI install path).
- Allowlist as a hostable thing (`wiki.officetown.au/allowlist.yaml`) — not in our current shipped state, add to backlog as a corporate-sale enabler.

---

## 38. Quick-reference: paths and env vars by area

### Config locations

| Surface | Path |
|---|---|
| Main config | `~/.config/goose/config.yaml` |
| First-launch overrides | `~/.config/goose/init-config.yaml` |
| Adversary mode | `~/.config/goose/adversary.md` |
| Sandbox blocklist | `~/.config/goose/sandbox/blocked.txt` |
| Recipes | `~/.config/goose/recipes/` |
| Apps (built-in extension) | `~/.local/share/goose/apps/` (macOS/Linux) |
| Projects metadata | `~/.local/share/goose/projects.json` |
| Sessions DB | `~/.local/share/goose/sessions/sessions.db` |
| Server logs | `~/.local/state/goose/logs/server/` |
| CLI logs (auto-purged 2 weeks) | `~/.local/state/goose/logs/cli/` |
| LLM request log (rotated 0-9) | `~/.local/state/goose/logs/llm_request.*.jsonl` |
| Desktop log | `~/Library/Application Support/Goose/logs/main.log` (macOS) |
| Command history | `~/.config/goose/history.txt` (Unix) |
| Ralph loop state | `.goose/ralph/` (project-local) |

### Headline env vars

| Var | Default | Purpose |
|---|---|---|
| `GOOSE_PROVIDER` | — | LLM provider |
| `GOOSE_MODEL` | — | Model |
| `GOOSE_MODE` | — | `auto`/`smart-approve`/`approve`/`chat` |
| `GOOSE_MAX_TURNS` | 1000 | Turn limit |
| `GOOSE_SUBAGENT_MAX_TURNS` | 25 | Subagent turn limit |
| `GOOSE_CONTEXT_LIMIT` | 128000 | Token limit override |
| `GOOSE_PLANNER_CONTEXT_LIMIT` | — | Planner-specific |
| `GOOSE_AUTO_COMPACT_THRESHOLD` | 0.8 | Auto-compact trigger |
| `GOOSE_TOOL_CALL_CUTOFF` | 10 | Tool output summarisation trigger |
| `GOOSE_CONTEXT_STRATEGY` | — | `summarize`/`truncate`/`clear`/`prompt` |
| `GOOSE_CLI_SHOW_COST` | false | Show cost in CLI |
| `GOOSE_CLI_MIN_PRIORITY` | — | Output verbosity (e.g., 0.2) |
| `GOOSE_DISABLE_SESSION_NAMING` | false | Skip naming for headless |
| `GOOSE_TELEMETRY_ENABLED` | — | Anonymous usage data |
| `GOOSE_ALLOWLIST` | — | URL of allowlist YAML |
| `GOOSE_HOST` | — | Remote server bind |
| `GOOSE_PORT` | — | Remote server port |
| `GOOSE_TLS` | — | Must be `true` for remote |
| `GOOSE_SERVER__SECRET_KEY` | — | Remote auth secret (double underscore!) |
| `GOOSE_RECIPE_PATH` | — | Recipe dir override |
| `GOOSE_RECIPE_GITHUB_REPO` | — | GitHub recipes source |
| `GOOSE_EDITOR_API_KEY` / `_HOST` / `_MODEL` | — | Enhanced code editing |
| `GOOSE_SANDBOX` | false | macOS sandbox master |
| `GOOSE_SANDBOX_PROTECT_FILES` | true | Sandbox: protect SSH/configs |
| `GOOSE_SANDBOX_ALLOW_IP` | false | Sandbox: allow bare-IP |
| `GOOSE_SANDBOX_BLOCK_RAW_SOCKETS` | true | Sandbox: block SOCK_RAW |
| `GOOSE_SANDBOX_BLOCK_TUNNELING` | true | Sandbox: block nc/socat/etc. |
| `GOOSE_SANDBOX_ALLOW_SSH` | true | Sandbox: SSH allow |
| `GOOSE_SANDBOX_GIT_HOSTS` | built-in | Sandbox: SSH git allowlist |
| `GOOSE_SANDBOX_SSH_ALL_HOSTS` | false | Sandbox: any SSH host |
| `GOOSE_SANDBOX_LD_FAILOVER` | — | Sandbox LD failover mode |
| `RALPH_WORKER_MODEL` / `_PROVIDER` | — | Ralph worker model |
| `RALPH_REVIEWER_MODEL` / `_PROVIDER` | — | Ralph reviewer model |
| `RALPH_MAX_ITERATIONS` | 10 | Ralph loop cap |
| `RALPH_RECIPE_DIR` | — | Ralph recipe dir |
| `TANZU_AI_ENDPOINT` / `_API_KEY` / `_STREAMING` | — | Tanzu provider |
| `LMNR_PROJECT_API_KEY` | — | Laminar |
| `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` / `_SECRET_KEY` / `LANGFUSE_URL` | — | Langfuse |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` / `_TIMEOUT` | — | OTLP-flavoured observability |
| `OTEL_TRACES_EXPORTER` / `_METRICS_EXPORTER` / `_LOGS_EXPORTER` | — | OTLP selective export |
| `AGENT_SESSION_ID` | — | Terminal integration session ID |
| `EVM_PRIVATE_KEY` | — | Spraay x402 wallet |
| `LAUNCHDARKLY_CLIENT_ID` | — | Dynamic sandbox egress |

### Config.yaml keys (security area)

```yaml
SECURITY_PROMPT_ENABLED: true
SECURITY_PROMPT_THRESHOLD: 0.8
SECURITY_PROMPT_CLASSIFIER_ENABLED: true
SECURITY_PROMPT_CLASSIFIER_ENDPOINT: "https://..."
SECURITY_PROMPT_CLASSIFIER_TOKEN: "..."
```

### CLI commands worth remembering

```bash
goose configure                        # main config wizard
goose session                          # interactive
goose session resume / fork
goose session list                     # list sessions (YYYYMMDD_N format)
goose run -t "..." | -i FILE | -i -    # headless
goose run --recipe X.yaml --params k=v
goose run --output-format json | stream-json
goose run --no-session
goose run --max-turns N

goose project                          # resume most recent project
goose projects                         # browse all projects
goose term init {zsh|bash|fish|powershell|nushell}
goose term init zsh --name my-project
goose term info

goose gateway status
goose gateway start telegram --bot-token X
goose gateway pair telegram
goose gateway stop telegram

goose acp                              # ACP server mode (for IDE clients)
```

---

## 39. End-of-file checklist for Phase 3 plan synthesis

When the Phase 3 master plan writes itself, these are the design decisions this doc unblocks:

- [ ] **wiki.search tool synthesis path** → use MCP Sampling (Section 1). Default to raw match list; add a `synthesize: true` parameter (or sniff intent from question) that triggers a `sampling/createMessage` round-trip.
- [ ] **dashboard surface** → MCP App pattern (Section 2). `_meta.ui.resourceUri` + iframe + postMessage. Theme handoff via `host-context-changed`. Persistence caveat acknowledged.
- [ ] **install path in INSTALL.md** → confirm includes "Streamable HTTP" option (per MCP-UI install in Section 2) and provider JSON drop-in (per Section 5).
- [ ] **recipes folder convention** → `~/.config/goose/recipes/` matches Goose's own convention (Sections 23, 38).
- [ ] **corporate allowlist hosting** → backlog item: serve `wiki.officetown.au/allowlist.yaml` for restricted environments (Section 11).
- [ ] **sandbox compat note** → install guide should mention `~/.config/goose/sandbox/blocked.txt` — if a user's there with our domain, we're blocked (Section 18).
- [ ] **drop custom-distro permanently** → confirmed by Section 5 analysis; nothing on the docs page has changed the math.
- [ ] **don't design for Roots** → Section 4; revisit only if we ship a local-sync feature.
- [ ] **observability** → don't ship our own; document OTLP setup that lets users point at Laminar/Langfuse/MLflow if they want (Section 21).
- [ ] **multi-model recipe support** → recipes can pin `goose_provider` / `goose_model` per recipe (Section 13). Use for any expensive bulk-processing recipes.
