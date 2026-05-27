# Goose Knowledge Base 01 — Getting Started + Core Guides

> Compiled 2026-05-28 for Office Town Cloud. Source: https://goose-docs.ai
> Sections quote source verbatim where wording matters. Ownership: Goose moved to the Agentic AI Foundation (AAIF) in 2026.

---

## TL;DR — what Office Town has to internalise

1. Goose is an **agentic AI framework** with two surfaces — **Desktop** (Electron) and **CLI** — sharing config + session storage.
2. Goose's primary extension primitive is **MCP** (Model Context Protocol). "Extensions" in Goose = MCP servers + a few built-in platform extensions.
3. Goose has its own non-MCP primitives that Office Town must respect / interoperate with:
   - **goosehints** (`.goosehints` files, project + global)
   - **Skills** (markdown with YAML frontmatter, in `~/.agents/skills/`)
   - **Plugins** (bundle skills + hooks; in `~/.agents/plugins/<name>/`)
   - **Hooks** (lifecycle event scripts inside plugins)
   - **Recipes** (YAML/JSON session bundles)
   - **Subagents** (isolated goose instances)
   - **MOIM persistent instructions** (env-var driven, injected every turn)
4. Config + data paths are **platform-specific** and **not** under `~/.goose/`:
   - macOS/Linux config: `~/.config/goose/`
   - Windows config: `%APPDATA%\Block\goose\config\`
   - Session DB (Linux default): `~/.local/share/goose/sessions/sessions.db`
   - Skills/plugins: `~/.agents/` (NOTE: `.agents`, not `.goose`)
5. Goose ships an MCP server runner: `goose mcp <name>` — Office Town deployments can register their MCP servers as Goose extensions via stdio, streamable HTTP, or built-in.
6. CLI flag conventions: `-n/--name`, `--session-id`, `--with-extension`, `--with-streamable-http-extension`, `--with-builtin`.
7. The "summon" platform extension is required for Skills (v1.25.0+) and is auto-injected by recipes with sub_recipes.

---

## 1. Getting Started — category landing

URL: https://goose-docs.ai/docs/category/getting-started/

### Sub-pages
- Install goose
- Configure LLM Provider
- Using Extensions

### Verbatim concept

> "Extensions are add-ons that provide a way to extend the functionality of goose by connecting with applications and tools you already use in your workflow."

### Office Town implication
The Getting Started funnel is the install → configure-provider → add-extensions flow. Office Town's onboarding has to slot in at step 3 as a set of MCP extensions to add.

---

## 2. Install goose

URL: https://goose-docs.ai/docs/getting-started/installation

### Platforms supported
macOS (Silicon + Intel), Linux (deb / rpm / Flatpak), Windows (zip, Git Bash, PowerShell, WSL).

### Install commands (verbatim)

**macOS Desktop:** Download from GitHub releases (Silicon or Intel), or:
```bash
brew install --cask block-goose
```

**macOS/Linux CLI:**
```bash
curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash
```
Homebrew alternative:
```bash
brew install block-goose-cli
```
Non-interactive (skip configure step):
```bash
CONFIGURE=false bash
```

**Linux desktop (Ubuntu/Debian):**
```bash
sudo dpkg -i (filename).deb
```

**Windows CLI (PowerShell):** Uses `Invoke-WebRequest` to fetch `download_cli.ps1`, then execute it.

**Windows CLI (Git Bash):** Same curl script as macOS, plus PATH config:
```bash
export PATH="$HOME/.local/bin:$PATH"
```
(Add to `~/.bashrc`.)

### Permissions note
M3 Macs require read/write to `~/.config` directory for logs.

### Post-install setup
After installation, configure an LLM provider:
- Desktop: Welcome screen offers multiple options
- CLI: `goose configure`

### Update commands
```bash
goose update
goose update --canary, -c
goose update --reconfigure, -r
```

### Running goose
- Desktop: launch the app
- CLI: `cd` into a directory, then `goose session`

### Office Town implication
- Office Town can't assume the user has Goose installed. Install prompts in our marketing/onboarding must reference both Desktop and CLI paths.
- `CONFIGURE=false` is the env var for headless installs — useful if Office Town wants to script bulk installs.
- M3 Macs need `~/.config` write access — same dir we'd write any deeplink to.

---

## 3. Configure LLM Provider

URL: https://goose-docs.ai/docs/getting-started/providers

### Key fact (verbatim)
> "goose relies heavily on tool calling capabilities and currently works best with Claude 4 models."

### Default model
`claude-sonnet-4-5` is the default model when unspecified.

### Supported provider categories (40+ total)

**Cloud:** Anthropic, OpenAI, Google Gemini, Azure OpenAI, AWS Bedrock, Groq, Mistral AI, xAI, Cerebras
**Gateways:** OpenRouter, FuturMix, LiteLLM, Routstr, NEAR AI Cloud, Tetrate Agent Router
**Local:** Ollama, LM Studio, Atomic Chat, Docker Model Runner, Ramalama
**Specialised:** GitHub Copilot, ChatGPT Codex, Databricks, Snowflake, VMware Tanzu

### Env vars (verbatim subset)

| Provider | Required Variables |
|----------|-------------------|
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_HOST` (optional) |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_HOST` (optional), `OPENAI_ORGANIZATION`, `OPENAI_PROJECT` |
| Google Gemini | `GOOGLE_API_KEY`, `GEMINI3_THINKING_LEVEL` (optional) |
| Groq | `GROQ_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT_NAME`, `AZURE_OPENAI_API_KEY` (optional) |
| Ollama | `OLLAMA_HOST` |

Goose-side override:
```bash
export GOOSE_MODEL="claude-sonnet-4-5"
```

### Config file locations (CRITICAL)
- macOS/Linux: `~/.config/goose/config.yaml`
- Windows: `%APPDATA%\Block\goose\config\config.yaml`

### CLI provider configure
```bash
goose configure
# → Configure Providers → pick provider → enter creds → pick model
```

### Custom provider JSON (verbatim example)
Location: `~/.config/goose/custom_providers/`
```json
{
  "name": "custom_corp_api",
  "engine": "openai",
  "display_name": "Corporate API",
  "api_key_env": "CUSTOM_CORP_API_API_KEY",
  "base_url": "https://api.company.com/v1/chat/completions",
  "models": [{"name": "gpt-4o", "context_limit": 128000}],
  "headers": {"x-custom": "value"},
  "supports_streaming": true
}
```
Engine values: `openai`, `anthropic`, `ollama` (compatible APIs).

This is the same pattern as the `alibaba.json` upstream PR that's already shipped — declarative custom provider files.

### Provider-specific notes
- **Prompt Caching**: Automatically enabled for Claude via Anthropic, Bedrock, Databricks, OpenRouter, LiteLLM.
- **Azure OpenAI**: Supports API key AND Azure credential chain.
- **GitHub Copilot**: Device flow (no manual API key).
- **Gemini 3**: `GEMINI3_THINKING_LEVEL` (low/high).
- **Local Models**: Require "tool calling support" for full functionality; without it, chat-completion only.

### Office Town implication
- Office Town's MCP servers don't need to ship their own LLM credentials — they run inside Goose's process and inherit whatever the user configured.
- Our `alibaba.json` PR fits the documented Custom Provider pattern — that's the canonical path for adding niche providers.
- If Office Town ever wants to ship as a recipe with a forced model, set `goose_provider`/`goose_model` in recipe `settings`.

---

## 4. Using Extensions

URL: https://goose-docs.ai/docs/getting-started/using-extensions

### Definition (verbatim)
> "Extensions are add-ons that expand goose's functionality by connecting with external applications and tools."

Extensions are based on **Model Context Protocol (MCP)**.

### Built-in extensions
- **Developer** — General dev tools (enabled by default)
- **Computer Controller** — Computer control, web scraping, file caching
- **Memory** — Preference retention across sessions
- **Tutorial** — Interactive learning
- **Auto Visualiser** — Auto data viz

### Built-in PLATFORM extensions (important — these are not user-removable in the same way)
- **Apps** — Create/launch custom HTML applications
- **Chat Recall** — Search conversation history
- **Code Mode** — Execute JavaScript for tool discovery
- **Extension Manager** — Discover/enable/disable extensions (default enabled)
- **Summon** — Load skills, recipes, delegate to subagents (default enabled, **required for Skills v1.25.0+**)
- **Todo** — Task list management (default enabled)
- **Top of Mind** — Inject persistent instructions

### Extension types
- `stdio` — Local command, spawned subprocess (most MCP servers)
- `builtin` — Goose-bundled
- `platform` — Goose-bundled platform-level
- `streamable_http` — Remote HTTP/SSE
- `frontend` — UI-side
- `inline_python` — Python code embedded in recipe

### CLI add (verbatim flow)
```bash
goose configure
# → Add Extension → choose one of:
#   - Built-In Extension
#   - Command-Line Extension
#   - Remote Extension (Streamable HTTP)
```

### Standard IO examples (verbatim)
Knowledge Graph Memory:
```bash
npx -y @modelcontextprotocol/server-memory
```
Wikipedia Reader (Python):
```bash
uvx mcp-wiki
```
Java (Linux/macOS only):
```bash
jbang -Dspring.profiles.active=dev org.example:spring-data-mcp:1.0.0
```

### Desktop UI add
1. Open sidebar (top-left)
2. Click "Extensions"
3. Click "Add custom extension"
4. Enter details + set timeout (seconds)
5. Click "Add"

### Config file format (verbatim)
File: `~/.config/goose/config.yaml`
```yaml
extensions:
  github:
    name: GitHub
    cmd: npx
    args: [-y, @modelcontextprotocol/server-github]
    enabled: true
    envs: { "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>" }
    type: stdio
    timeout: 300
```

### Deeplinks (CRITICAL — this is Office Town's one-click install path)

**StandardIO format:**
```
goose://extension?cmd=npx&arg=-y&arg=%40modelcontextprotocol/server-github&timeout=300&id=id&name=name&description=desc
```

**Streamable HTTP format:**
```
goose://extension?url=https%3A%2F%2Fexample.com/streamable&type=streamable_http&timeout=300&id=id&name=name&description=desc
```

Required params: `cmd`, `arg`, `timeout`, `id`, `name`, `description`.
For HTTP: `url`, `type=streamable_http`, `timeout`, `id`, `name`, `description`.

### Mid-session extension management

**Add stdio in CLI:**
```
/extension npx -y @modelcontextprotocol/server-memory
```

**Add built-in in CLI:**
```
/builtin developer
```

### Start session with extension flags
```bash
goose session --with-builtin "developer,computercontroller"
goose session --with-extension "uvx mcp-server-fetch"
goose session --with-extension "GITHUB_PERSONAL_ACCESS_TOKEN=<TOKEN> npx -y @modelcontextprotocol/server-github"
goose session --with-streamable-http-extension "https://example.com/streamable"
```

### Security (verbatim)
> "Goose automatically checks external extensions for known malware before activation."

### Automatic Extension Detection
> "Goose suggests extensions based on task requirements. Users can approve/deny dynamic enablement. These changes only persist for the current session."

### Office Town implication (HIGH)
- **Deeplinks are the install primitive.** A `goose://extension?type=streamable_http&url=...` URL is what Office Town should hand out — one click → Goose Desktop adds the MCP.
- **`streamable_http` is the binding** Office Town's Cloudflare Workers expose. We don't need stdio (no subprocess).
- **Required deeplink params**: timeout, id, name, description. Office Town's deeplink generator must always include all six.
- **URL must be %-encoded** inside the deeplink — every `:` becomes `%3A`, every `/` becomes `%2F`.
- **Mid-session `/extension` only works for stdio**. For HTTP, the user has to use `--with-streamable-http-extension` at session start, or add via Desktop UI / config file.
- Goose malware-scans extensions before activation. If Office Town's MCPs ever get false-positive'd that's a customer support pathway we need to know about.

---

## 5. Managing Sessions

URL: https://goose-docs.ai/docs/guides/sessions/session-management
(Note: original spec URL `/docs/guides/managing-sessions` 404s; actual nav is under `/guides/sessions/`.)

### Start a session
- Desktop: open app, type in input. `Cmd+N` / `Ctrl+N` for new session.
- CLI: `goose session`

### Naming sessions (auto vs explicit)
Auto-generated names derive from initial prompt context.
Explicit:
```bash
goose session --name react-migration
```
Verify:
```bash
goose session list -l 1
```
Session ID format: `YYYYMMDD_<COUNT>`

### Disable auto-naming
Env var: `GOOSE_DISABLE_SESSION_NAMING=1` (or `=true`)

### Resume
```bash
goose session -r                          # latest
goose session -r --name <name>            # by name
goose session --resume --fork             # fork latest
goose session --session-id <session_id>   # by ID
goose session --path <path>               # by file path
```

### Storage location (CRITICAL)
SQLite database: `~/.local/share/goose/sessions/sessions.db`

Legacy `.jsonl` files remain but are no longer actively managed (since v1.10.0+).

### Search
- Desktop: `Cmd+F` / `Ctrl+F` for current or all sessions
- CLI: query SQLite directly or ask goose to search history

### Export/Import
- Desktop: "View All" → hover card → export/import buttons → downloads `.json`
- CLI:
```bash
goose session export
goose session export -n <name>
goose session export --session-id <session_id>
goose session export -o <file>
goose session export --format <markdown|json|yaml>
```

### Delete
- Desktop: sidebar → "View All" → hover → delete button
- CLI:
```bash
goose session remove
goose session remove --session-id <id>
goose session remove -n <name>
goose session remove -r <regex>
goose session remove --path <path>
```

### List
```bash
goose session list
goose session list -f <format>
goose session list --ascending
goose session list -w <path>     # filter by working dir
goose session list -l <number>   # limit
```

### Duplicate
Desktop only — creates complete copy with conversation history.

### Exit
- Desktop: close window
- CLI: type `exit` or `/exit` / `/quit`

### Cross-surface sync
> "All sessions sync between Desktop and CLI instances."

### Diagnostics bundle
```bash
goose session diagnostics
goose session diagnostics --session-id <id>
goose session diagnostics -n <name>
goose session diagnostics -o <file>
```

### Office Town implication
- Sessions are global to the user — anything Office Town stores in session state is *per-session*, not per-MCP-server.
- If Office Town wants to inspect / debug a user's session state we have to tell them how to grab the diagnostics bundle.
- Session DB is SQLite at a known path — useful for support recipes.

---

## 6. In-Session Actions

URL: https://goose-docs.ai/docs/guides/sessions/in-session-actions

### Edit Message (Desktop-only)
- **Edit in Place** — overwrites subsequent context, restarts from that point
- **Fork Session** — creates a new branch preserving original

### Queue Messages (Desktop-only)
- `Enter` to queue
- `Send` to interrupt
- Supports reorder / edit / clear

### Interrupt Task
- Keywords: `"stop"`, `"wait"`, `"hold on"`, `"actually"`, `"instead"` (work best at sentence start)
- Click `Send` button to interrupt
- `Ctrl+C` in CLI

### Voice Dictation
Providers: Local (on-device), ElevenLabs, Groq, OpenAI.
- Say `"submit"` to send and continue recording
- 50MB audio cap; local processing keeps data private

### File Sharing
- Drag-and-drop into chat
- File browser button OR `@` shortcut for quick search
- Reference paths directly in messages

### Mid-Session Changes
- Working directory — new sessions only
- Extensions — current session only
- Model selection — new sessions only
- Goose Mode via `/mode` — new sessions only

### Full slash command list (from CLI commands reference)

| Command | Purpose |
|---------|---------|
| `/?` or `/help` | Display help menu |
| `/builtin <names>` | Add builtin extensions (comma-separated) |
| `/clear` | Clear current chat history |
| `/endplan` | Exit plan mode |
| `/exit` or `/quit` | Exit session |
| `/extension <command>` | Add stdio extension |
| `/mode <name>` | Set goose mode (auto, approve, chat, smart_approve) |
| `/plan <text>` | Enter plan mode |
| `/prompt <n> [--info] [k=v...]` | Get prompt info or execute |
| `/prompts [--extension <name>]` | List available prompts |
| `/recipe [filepath]` | Generate recipe from conversation |
| `/compact` | Summarize conversation to reduce context |
| `/r` | Toggle full tool output display |
| `/skills` | List available skills |
| `/t` | Toggle themes (light, dark, ansi) |
| `/t <name>` | Set theme directly |
| `/summarize` | (Documented under context mgmt) — manually summarise |

### Keyboard shortcuts (CLI)
- `Ctrl+C` — Clear line / interrupt / exit
- `Ctrl+J` — Add newline (configurable via `GOOSE_CLI_NEWLINE_KEY`)
- `Cmd+Up/Down` — Navigate history
- `Ctrl+R` — Interactive history search

### Office Town implication
- Office Town can register custom slash commands via the **slash_commands** config (see §16). Each slash command is bound to a recipe file.
- We can't add a new built-in slash command without forking Goose itself.
- `/extension` only takes stdio commands mid-session; our HTTP MCP can't be hot-added that way (CLI limitation).
- `/skills` lists user/project skills — if Office Town ships Skills they appear here.

---

## 7. Smart Context Management

URL: https://goose-docs.ai/docs/guides/sessions/smart-context-management

### Two mechanisms
1. **Auto-Compaction** — kicks in at threshold
2. **Context Strategies** — fallback when auto-compaction insufficient

### Auto-Compaction (verbatim)
> "Auto-Compaction activates when you reach 80% of the token limit in goose Desktop and the goose CLI."

Adjust:
```bash
export GOOSE_AUTO_COMPACT_THRESHOLD=0.6
```
`0.0` disables.

### Manual compaction
- Desktop: click token usage indicator dot → "Compact now"
- CLI: `/summarize` (or `/compact`)

### Context Limit Strategies

| Strategy | Function | Surfaces |
|----------|----------|----------|
| `summarize` | Condenses while preserving key points | Desktop + CLI |
| `truncate` | Removes oldest messages | CLI only |
| `clear` | Starts fresh session | CLI only |
| `prompt` | Asks user to choose | CLI interactive |

```bash
export GOOSE_CONTEXT_STRATEGY=summarize
```
Default: `prompt` (interactive).

### Maximum Turns
`GOOSE_MAX_TURNS` — default `1000`.
> "Limits the maximum number of consecutive turns that goose can take without user input."

Runtime overrides:
```bash
goose session --max-turns N
goose run --max-turns N
```

### Token usage display
- Desktop: coloured circle (green/orange/red)
- CLI: context label shows %, current, limit

### Context limit overrides
```bash
export GOOSE_CONTEXT_LIMIT=1000
export GOOSE_PLANNER_CONTEXT_LIMIT=500000
export GOOSE_INPUT_LIMIT=...     # Ollama input limit override
```

### Cost tracking
```bash
export GOOSE_CLI_SHOW_COST=true
```

### Office Town implication
- We can't override Auto-Compaction from inside an MCP server — it's a user/global env var.
- If Office Town wants its MCP to inject long context (e.g. directory listings, profile data), keep payloads tight — they count against the same budget that triggers compaction at 80%.
- The `compaction.md` prompt template is customisable (see §16) — Office Town could ship a tuned version for users who want to keep specific company context across compactions.

---

## 8. goosehints (`.goosehints`)

URL: https://goose-docs.ai/docs/guides/context-engineering/using-goosehints

### File name + locations
File: `.goosehints`
- **Global**: `~/.config/goose/.goosehints` — all sessions, all dirs
- **Local**: project root or any directory hierarchy — scope-limited

> "When both exist, local hints take precedence over global preferences."

### Desktop UI
Settings → Chat → "Project Hints (.goosehints)" → Configure → restart session.

### Syntax
Natural language. Two reference methods:
- `@filename.md` — auto-include file content immediately in context
- Plain reference — points goose to a file to review when needed (optional/large)

Example (verbatim):
```
Always use TypeScript for new Next.js projects.
@coding-standards.md
docs/contributing.md
Follow the [Google Style Guide](link) for Python code.
Run unit tests before committing any changes.
```

### Loading + precedence (verbatim quotes)
> "goose loads hints at the start of your session."
> "goose adds hints to the system prompt for every request."

Nested loading order (example):
1. Project root `.goosehints`
2. Module/feature level `.goosehints`
3. Directory level `.goosehints`

> "After nested hints load for a directory, they remain active for the rest of the session."

### Token cost (verbatim)
> "Because `.goosehints` content uses tokens, keeping it concise can reduce cost and improve performance."

No explicit file-size limit documented.

### Custom context file names (CRITICAL)
```bash
export CONTEXT_FILE_NAMES='["CLAUDE.md", ".goosehints", "project_rules.txt"]'
```
Default: `[".goosehints"]` (per env-var docs page) OR `["AGENTS.md", ".goosehints"]` (per goosehints page — likely AGENTS.md is honoured by default and the docs are slightly inconsistent).

> "Goose applies the same nested loading behavior to those filenames too."

### Office Town implication
- Office Town's project-level integration should consider writing a `.goosehints` (or contributing to an existing one) at install time, with hints about which Office Town MCPs are available and how to use them.
- We can ALSO set `CONTEXT_FILE_NAMES` to add `OFFICETOWN.md` to the load list — keeps Office Town's hints in a separate, removable file.
- Critical conflict: Goose's CLAUDE.md compatibility (via `CONTEXT_FILE_NAMES`) means Office Town hints written to `CLAUDE.md` will get read by *both* Goose and Claude Code. Be deliberate.

---

## 9. Creating Plans / Planning Mode

URL: https://goose-docs.ai/docs/guides/context-engineering/creating-plans

### Concept (verbatim)
> "A good plan keeps everyone on track and helps measure progress."

### Entering planning mode (CLI only)
```
( O)> /plan Build a four bedroom house
( O)> /endplan
```

### Planning model config
```bash
export GOOSE_PLANNER_PROVIDER=<provider>
export GOOSE_PLANNER_MODEL=<model>
```
Verify:
```bash
goose info -v
```

### Process
1. Describe project clearly
2. Answer clarifying questions
3. Review generated plan
4. (Optional) "request a generic plan if you prefer not to answer additional questions"

### Plan template
Customisable via `plan.md` prompt template (CLI only). See §16.

### Desktop equivalent
> "goose Desktop: Use conversational prompts like 'create a plan' rather than `/plan` command"

### Office Town implication
- Office Town can ship a custom `plan.md` for users who want business-context-aware planning.
- `GOOSE_PLANNER_PROVIDER` lets users plan with Opus and execute with Haiku (or vice versa) — relevant for "the agent's planning step is more expensive than its execution" workflows.

---

## 10. Subagents

URL: https://goose-docs.ai/docs/guides/context-engineering/subagents

### Definition (verbatim)
> "Subagents are independent instances that execute tasks while keeping your main conversation clean and focused."

Process isolation + context preservation.

### How to invoke
Natural-language:
- "Use a code reviewer to analyze this function for security issues"
- "Use the 'security-auditor' recipe to scan this endpoint"
- "Create three HTML templates simultaneously"

### Execution modes

| Type | Behaviour | Trigger words |
|------|-----------|---------------|
| Sequential (default) | Tasks one after another | "first...then", "after" |
| Parallel | Simultaneous | "parallel", "simultaneously", "concurrently" |

### Default settings
- Max Turns: 25 (`GOOSE_SUBAGENT_MAX_TURNS`)
- Timeout: 5 minutes
- Extensions: inherited from parent
- Return mode: full info to main session
- Max concurrent: 5 (`GOOSE_MAX_BACKGROUND_TASKS`)

### Internal subagents — two approaches
1. **Direct Prompts** — natural language, one-off, auto-configured
2. **Recipes** — structured YAML in directories specified by `GOOSE_RECIPE_PATH` or CWD

### Monitoring
Tool calls display inline with identifiers like:
```
[subagent:16] text_editor | developer
```

### Security constraints
**Allowed:** Extension discovery, resource access, using extension tools
**Blocked:** Creating additional subagents, modifying extensions, managing schedules

### Office Town implication
- Office Town can ship recipes that Goose users invoke as subagents — e.g. "use the office-town/customer-deep-dive recipe to research this lead".
- Subagents **can't** create sub-subagents. Office Town can't ship a recipe that fanout-spawns further subagents.
- Max 5 concurrent — if Office Town wants to dispatch ten company-research tasks, they queue.

---

## 11. Agent Skills

URL: https://goose-docs.ai/docs/guides/context-engineering/using-skills

### Definition (verbatim)
> "Skills are reusable sets of instructions and resources that teach goose how to perform specific tasks."

### SKILL.md format (verbatim)
```
---
name: code-review
description: Comprehensive code review checklist for pull requests
---
# Content follows...
```

### Directory structure (CRITICAL)
- `~/.agents/skills/` — Global, all sessions
- `.agents/skills/` — Project-level, scoped
- `~/.agents/plugins/<plugin-name>/` — Skills bundled inside plugins

Each skill lives in a named subdirectory:
```
~/.agents/skills/code-review/SKILL.md
```

### Discovery + loading
> "Goose automatically loads skills when your request clearly matches a skill's purpose."

Explicit invocation:
```
/skills code-review edge-case-finder
```

### Supporting files
Skills can include scripts, templates, config files alongside SKILL.md. Goose accesses them via Developer extension tools.

### Requirement
> "This functionality requires the built-in Summon extension, available in v1.25.0+"

### Office Town implication (HIGH)
- **Skills live under `~/.agents/`, NOT `~/.config/goose/`** — this is a Goose-specific convention that aligns with the broader "agent skills" ecosystem.
- Office Town can ship a **plugin** (next section) that bundles skills like `office-town/customer-research`, `office-town/proposal-writer`, etc.
- Skill names are namespaced when shipped via plugins: `<plugin>:<skill>`.
- The Summon extension MUST be enabled for Skills to work. It's on by default.
- Office Town's Skills are **just markdown** — no compile step, easy to ship over an MCP, easy for users to read/audit.

---

## 12. Plugins

URL: https://goose-docs.ai/docs/guides/context-engineering/plugins

### Definition (verbatim)
> "A plugin can provide skills, hooks, or both."
> Plugins "should be installed only from sources you trust."

### Directory layout (verbatim)
```
my-plugin/
├── plugin.json
├── skills/
│   └── review/
│       └── SKILL.md
├── hooks/
│   └── hooks.json
└── scripts/
    └── notify.sh
```

`plugin.json` fields: name, version, description.

### Plugin locations
- User: `~/.agents/plugins/<plugin-name>/`
- Project: `<project>/.agents/plugins/<plugin-name>/`

### Skill namespacing
Plugin-imported skills are namespaced: `my-plugin:review`.

### Install commands
```bash
goose plugin install <git-url>
goose plugin install --auto-update <git-url>
goose plugin update <plugin-name>
```

### Disable
Settings file: `~/.config/goose/settings.json` (user) or `<project>/.config/goose/settings.json` (project).
```json
{
  "disabledPlugins": ["plugin-name"]
}
```

### Supported manifest formats
- **Open Plugins**: `plugin.json` — skills + hooks
- **Gemini extensions**: `gemini-extension.json` — skills only

### Office Town implication (HIGH)
- **The plugin is the natural Office Town shipping primitive** — one git URL, `goose plugin install`, done.
- One Office Town plugin can bundle:
  - Multiple Skills (`skills/<name>/SKILL.md`)
  - Lifecycle Hooks (`hooks/hooks.json` + scripts)
  - Notification scripts triggered on session events
- Git-backed = auto-update via `--auto-update` flag. Office Town can ship updates simply by pushing to main.
- **Note**: Plugins do NOT install MCP servers — MCP servers are still added via the extensions/deeplink path. Plugins are for skills/hooks/local-scripts.

---

## 13. Hooks (lifecycle scripts)

URL: https://goose-docs.ai/docs/guides/context-engineering/hooks

### Concept
Custom scripts triggered by Goose lifecycle events. Discovered from plugin directories.

### File layout (inside a plugin)
```
plugin-name/
├── plugin.json
├── hooks/
│   └── hooks.json
└── scripts/
    └── script-name.sh
```

### hooks.json format (verbatim)
```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "regex-pattern",
        "hooks": [
          {
            "type": "command",
            "command": "${PLUGIN_ROOT}/scripts/script.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Fields:
- `matcher` — optional regex against event-specific context
- `type` — currently only `"command"`
- `command` — shell command, run via `sh -c`
- `timeout` — seconds before kill (default 30)

### Supported events (full table, verbatim)

| Event | Trigger | Matcher Target |
|-------|---------|-----------------|
| `SessionStart` | Session begins | None |
| `SessionEnd` | Session ends | None |
| `Stop` | Stop event received | None |
| `UserPromptSubmit` | User submits prompt | Prompt text |
| `PreToolUse` | Before tool execution | Tool name |
| `PostToolUse` | After successful tool use | Tool name |
| `PostToolUseFailure` | Tool execution fails | Tool name |
| `BeforeReadFile` | Before file read | File path |
| `AfterFileEdit` | After successful edit | File path |
| `BeforeShellExecution` | Before shell command | Command text |
| `AfterShellExecution` | After successful execution | Command text |

### Hook payload (stdin, JSON)
- `event` — event name
- `session_id`
- `matcher_context` — string matched by regex
- Event-specific fields: `tool_name`, `tool_input`, `working_dir`, etc.

### Env vars passed
- `PLUGIN_ROOT` — plugin directory path

### Disable hooks
`~/.config/goose/settings.json`:
```json
{ "disabledPlugins": ["plugin-name"] }
```

### Failure handling (verbatim)
> "Hook failures don't crash goose; they're logged and execution continues."

### Security (verbatim)
> "Hooks execute local commands on your machine. Only install or create hooks from sources you trust."

### Office Town implication
- Hooks let Office Town's plugin react to user behaviour without a polling agent — e.g. on `PostToolUse` matching `office_town__*` tool names, log usage to our analytics endpoint.
- `SessionStart` is great for "pull the latest user context from Office Town cloud" without an explicit user trigger.
- Hooks run **locally** — they don't bypass the MCP server's authentication. If Office Town wants the hook to do work cloud-side it has to authenticate too.

---

## 14. Recipes (full reference)

URL: https://goose-docs.ai/docs/guides/recipes/recipe-reference

### File format
`.yaml`, `.yml`, or `.json`.
Load locations:
1. Current directory
2. Paths in `GOOSE_RECIPE_PATH`
3. GitHub repositories via `GOOSE_RECIPE_GITHUB_REPO`

### Schema (verbatim)

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `title` | String | ✅ | Short name |
| `description` | String | ✅ | Detailed explanation |
| `instructions` | String | ✅* | Template instructions with parameter substitution |
| `prompt` | String | ✅* | Template prompt (required for headless mode) |
| `version` | String | — | Format version (default "1.0.0") |
| `activities` | Array | — | Desktop clickable bubbles |
| `extensions` | Array | — | MCP servers / extension configs |
| `parameters` | Array | — | Dynamic customization |
| `response` | Object | — | Structured JSON output schema |
| `retry` | Object | — | Automated retry logic |
| `settings` | Object | — | Model provider config |
| `sub_recipes` | Array | — | Child recipe specifications |

*at least one of `instructions` or `prompt` required.

### Parameters
Jinja-style `{{ parameter_name }}`.
```yaml
parameters:
  - key: language
    input_type: string
    requirement: required
    description: "Programming language to review"
  - key: focus
    input_type: string
    requirement: optional
    default: "best practices"
    description: "Review focus area"
```
Input types: `string`, `number`, `boolean`, `date`, `file`, `select`
Requirements: `required`, `optional`, `user_prompt`

Constraints:
- Optional params need defaults
- File params CANNOT have defaults
- Select params need `options`

### Extensions inside a recipe
```yaml
extensions:
  - type: stdio
    name: github-mcp
    cmd: github-mcp-server
    args: []
    env_keys:
      - GITHUB_PERSONAL_ACCESS_TOKEN
    timeout: 60
    description: "GitHub operations"
```
Types: `stdio`, `builtin`, `platform`, `streamable_http`, `frontend`, `inline_python`.

> Note: Recipes with `sub_recipes` auto-inject the `summon` platform extension.

### Activities (Desktop bubbles)
```yaml
activities:
  - "message: **Welcome!** Start reviewing {{ language }} code."
  - "Review for {{ focus }}"
  - "Check security"
```
Only one `message:`-prefixed activity displays as a message box.

### Response (structured output)
```yaml
response:
  json_schema:
    type: object
    properties:
      summary:
        type: string
      tasks_completed:
        type: number
    required:
      - summary
      - tasks_completed
```

### Retry
```yaml
retry:
  max_retries: 5
  timeout_seconds: 30
  checks:
    - type: shell
      command: "test $(cat /tmp/counter.txt) -ge 3"
  on_failure: "echo 'Cleanup'"
```

### Settings (model lock-in)
```yaml
settings:
  goose_provider: "anthropic"
  goose_model: "claude-sonnet-4-20250514"
  temperature: 0.7
  max_turns: 50
```

### Subrecipes
```yaml
sub_recipes:
  - name: "security_scan"
    path: "./subrecipes/security-analysis.yaml"
    values:
      scan_level: "comprehensive"
```

### Template support
Escape literal Jinja:
```yaml
prompt: "This substitutes: {{ actual }} | This stays literal: {{'{{example}}'}}"
```

Template inheritance:
```yaml
{% extends "parent.yaml" %}
{% block prompt %}Modified text{% endblock %}
```

Built-in variable: `recipe_dir` — directory containing recipe file.

### Desktop save metadata wrapper
```yaml
name: "Code Review Assistant"
recipe:
  version: "1.0.0"
  title: "Code Review Assistant"
  description: "Automated review"
  instructions: "..."
isGlobal: true
lastModified: 2025-07-02T03:46:46.778Z
isArchived: false
```

### Recipe CLI commands
```bash
goose recipe deeplink <RECIPE_NAME>
goose recipe deeplink <RECIPE_NAME> -p key=value
goose recipe list
goose recipe list --format <fmt>
goose recipe list -v
goose recipe open <RECIPE_NAME>
goose recipe open <RECIPE_NAME> -p key=value
goose recipe validate <RECIPE_NAME>
```

### Office Town implication
- Office Town can ship recipes as another distribution channel — e.g. `goose run --recipe office-town-customer-deep-dive` or via custom slash commands.
- Recipes can embed MCP server definitions with `extensions` — Office Town's MCPs can be auto-attached when a recipe runs.
- The `streamable_http` extension type is supported inside recipes — Office Town's cloud-hosted MCPs work here.
- `GOOSE_RECIPE_GITHUB_REPO` lets Office Town host recipes on GitHub and have Goose discover them. Nice multi-tenant pattern.

---

## 15. Custom Slash Commands

URL: https://goose-docs.ai/docs/guides/context-engineering/slash-commands

### Concept
Custom slash commands invoke recipes. Format: `/command-name`.

### Desktop creation
1. Open sidebar → "Recipes"
2. Find recipe → options button
3. Enter command name (no `/`)
4. Save

### CLI config (verbatim)
`~/.config/goose/config.yaml`:
```yaml
slash_commands:
  - command: "run-tests"
    recipe_path: "/path/to/recipe.yaml"
  - command: "daily-report"
    recipe_path: "/Users/me/.local/share/goose/recipes/report.yaml"
```

### Usage
```
/run-tests
/translator where is the library
```
One optional parameter.

### Constraints
- Only one parameter (additional params need defaults)
- Case-insensitive
- No spaces in name
- Must not conflict with built-ins: `/recipe`, `/compact`, `/help`
- Invalid/missing recipe → treated as regular text

### Behaviour (verbatim)
> "The recipe's instructions and prompt fields are sent to your model and loaded into the conversation, but not displayed in chat."

### Office Town implication
- An Office Town install could write to `config.yaml` to register slash commands like `/ot-lookup`, `/ot-quote`, `/ot-followup`.
- Caveat: editing the user's `config.yaml` is invasive. Better to document and let users opt in.

---

## 16. Prompt Templates

URL: https://goose-docs.ai/docs/guides/context-engineering/prompt-templates

### Customisable templates

| Template | Purpose | Platform |
|----------|---------|----------|
| `system.md` | Defines goose's role, capabilities, response format | Desktop + CLI |
| `plan.md` | Plan-creation instructions | CLI only |
| `compaction.md` | Summarisation at context limits | Desktop + CLI |
| `recipe.md` | Recipe generation from conversation | Desktop + CLI |
| `subagent_system.md` | System prompt for subagents | Desktop + CLI |
| `permission_judge.md` | Detect read-only tool operations | Desktop + CLI |
| `apps_create.md` | Generate standalone apps | Desktop only |
| `apps_iterate.md` | Update standalone apps | Desktop only |

### Location
- macOS/Linux: `~/.config/goose/prompts/`
- Windows: `%APPDATA%\Block\goose\config\prompts\`

### Format
Jinja2 syntax — `{{ var }}`, `{% if %}{% endif %}`, `{% for %}{% endfor %}`.

### Escape literal Jinja
```
This will appear literally: {{'{{variable}}'}}
```

### Behaviour
- Customisations persist across updates
- Changes take effect in new sessions only
- Reset individual or all templates
- "Customized" badge in Desktop settings

### Office Town implication
- Office Town could ship a tuned `system.md` that primes Goose with "you're working inside an Office Town session — these MCPs are available, here's how to think about them" — but this is invasive and overrides every Goose interaction. Last resort.
- A tuned `compaction.md` could ensure Office Town-relevant context (customer ID, current quote) survives compaction.

---

## 17. Persistent Instructions (MOIM)

URL: https://goose-docs.ai/docs/guides/context-engineering/using-persistent-instructions

### Concept (verbatim)
> Persistent instructions are injected into goose's MOIM (Model-Observed Internal Memory) component "every turn."
> "Unlike `.goosehints`, which load at session start, these instructions are re-read and injected fresh with every interaction."

### Env vars
- `GOOSE_MOIM_MESSAGE_TEXT` — direct text injection each turn (not set by default)
- `GOOSE_MOIM_MESSAGE_FILE` — path to file whose contents inject each turn (supports `~/`)

When both set, contents concatenate. Read fresh each turn — mid-session updates work without restart.

### Size cap (verbatim)
> "Content is capped at 64 KB with UTF-8 safe truncation."

### Examples
```bash
export GOOSE_MOIM_MESSAGE_TEXT="IMPORTANT: Always run tests before committing changes."
export GOOSE_MOIM_MESSAGE_FILE="~/.goose/guardrails.md"
```

### vs goosehints (verbatim table mapping)
| Trait | goosehints | MOIM |
|-------|-----------|------|
| Loading | Session start | Every turn |
| Forgettable | Can fade as context fills | Cannot be forgotten |
| Best use | Project context | Critical guardrails |
| Token cost | One-time | Per-turn |

### No `/pin` command documented.

### Office Town implication
- For guardrails Office Town REALLY needs to land (e.g. "always include the customer ID with any office_town__* tool call"), MOIM is the right primitive — but it costs tokens every turn.
- Setting `GOOSE_MOIM_MESSAGE_FILE=~/.config/office-town/guardrails.md` would let Office Town ship + update guardrails via file writes.
- Conflict: MOIM is a SINGLE env var. If multiple plugins want persistent instructions they have to share the file.

---

## 18. gooseignore

URL: https://goose-docs.ai/docs/guides/context-engineering/using-gooseignore

### Files
- Global: `~/.config/goose/.gooseignore`
- Local: project root `.gooseignore`
Both can coexist.

### Pattern syntax (verbatim examples)
```
# Specific files
settings.json

# By extension
*.pdf
*.config

# Directories
backup/
downloads/

# Any directory
**/credentials.json
```

### Negation
```
**/.env*
!.env.example
```
> "Negation patterns must come after the patterns they're negating."

### Default protection (when NO .gooseignore exists)
```
**/.env
**/.env.*
**/secrets.*
```
Once you create either file, you must manually include these if desired.

### Scope (verbatim)
> "The .gooseignore feature currently only affects tools in the Developer extension."

### Office Town implication
- gooseignore doesn't apply to non-Developer extensions — Office Town's MCPs see whatever they're given regardless.
- If Office Town ships a project bootstrap, consider writing a `.gooseignore` that protects sensitive Office Town config files from being read by the Developer extension.

---

## 19. Goose CLI command reference (full)

URL: https://goose-docs.ai/docs/guides/goose-cli-commands

### Core
- `goose --help`
- `goose configure`
- `goose info` / `goose info -v`
- `goose --version`
- `goose update` / `--canary` / `--reconfigure`
- `goose completion <bash|elvish|fish|nu|powershell|zsh>`

### Session
```bash
goose session [-n <name>] [--session-id <id>] [--resume] [--fork]
              [--path <path>] [--history] [--container <id>] [--debug]
              [--max-tool-repetitions N] [--max-turns N]
              [--with-extension <cmd>] [--with-streamable-http-extension <url>]
              [--with-builtin <id>]
goose session list [-f <fmt>] [--ascending] [-w <path>] [-l N]
goose session remove [--session-id <id>] [-n <name>] [-r <regex>] [--path <p>]
goose session export [--session-id <id>] [-n <name>] [-o <file>] [--format markdown|json|yaml]
goose session diagnostics [--session-id <id>] [-n <name>] [-o <file>]
```

### Run (non-interactive)
```bash
goose run [-i <file>] [-t <text>] [--system <text>]
          [--recipe <recipe> [--params k=v] [--sub-recipe <r>]]
          [-s|--interactive] [-n <name>] [-r] [--path <p>] [--container <id>]
          [--no-session] [--with-extension <cmd>] [--with-streamable-http-extension <url>]
          [--with-builtin <name>] [--debug] [--max-tool-repetitions N] [--max-turns N]
          [--explain] [--render-recipe] [-q] [--output-format <fmt>]
          [--provider <p>] [--model <m>]
```

### Recipe
```bash
goose recipe deeplink <name> [-p k=v]
goose recipe list [--format <fmt>] [-v]
goose recipe open <name> [-p k=v]
goose recipe validate <name>
```

### Plugin
```bash
goose plugin install <url>
goose plugin install --auto-update <url>
goose plugin update <name>
```

### Schedule
```bash
goose schedule add --schedule-id <name> --cron "* * * * * *" --recipe-source <path>
goose schedule list
goose schedule remove --schedule-id <name>
goose schedule sessions --schedule-id <name> [-l N]
goose schedule run-now --schedule-id <name>
goose schedule cron-help
```

### MCP runner (CRITICAL for Office Town)
```bash
goose mcp <name>
```
Runs an enabled MCP server. This is the entry point Goose uses when invoking stdio MCPs by name.

### ACP server mode
```bash
goose acp
```
Run Goose as an Agent Client Protocol server.

### Project shortcuts
```bash
goose project    # alias: p
goose projects   # alias: ps
```

### Terminal integration (shell shortcut)
```bash
@goose <question>
@g <question>
```

---

## 20. Configuration files (full)

URL: https://goose-docs.ai/docs/guides/config-files

### Locations
- macOS/Linux: `~/.config/goose/config.yaml`
- Windows: `%APPDATA%\Block\goose\config\config.yaml`

### Files in `~/.config/goose/`
| File | Purpose |
|------|---------|
| `config.yaml` | Provider, model, extensions, general settings |
| `permission.yaml` | Tool permission levels |
| `secrets.yaml` | API keys (fallback when keyring unavailable) |
| `permissions/tool_permissions.json` | Runtime permission decisions (auto-managed) |
| `prompts/` | Customised prompt templates |
| `custom_providers/` | Custom provider JSON files |
| `.goosehints` | Global hints |
| `.gooseignore` | Global ignore patterns |
| `settings.json` | Plugin enable/disable |

### Key settings (verbatim table)

| Setting | Purpose | Values |
|---------|---------|--------|
| `GOOSE_PROVIDER` | Primary LLM provider | provider name |
| `GOOSE_MODEL` | Default model | model name |
| `GOOSE_TEMPERATURE` | Response randomness | 0.0–1.0 |
| `GOOSE_MAX_TOKENS` | Token limit per response | positive int |
| `GOOSE_MODE` | Tool execution | auto, approve, chat, smart_approve |
| `GOOSE_MAX_TURNS` | Max turns w/o input | int |
| `GOOSE_PLANNER_PROVIDER` | Planning provider | … |
| `GOOSE_PLANNER_MODEL` | Planning model | … |
| `SECURITY_PROMPT_ENABLED` | Prompt injection detection | bool |
| `GOOSE_TELEMETRY_ENABLED` | Usage data | bool |

### Extension config block (verbatim)
```yaml
extensions:
  extension_name:
    bundled: true/false
    display_name: "Name"
    enabled: true/false
    name: "extension_name"
    timeout: 300
    type: "builtin"/"stdio"
    available_tools: []
    cmd: "command"
    args: ["arg1", "arg2"]
    env_keys: []
    envs: {}
```

### Search paths
```yaml
GOOSE_SEARCH_PATHS:
  - "/usr/local/bin"
  - "~/custom/tools"
  - "/opt/homebrew/bin"
```

### Priority order (verbatim)
1. Environment variables (highest)
2. Config file settings
3. Default values

### Security note (verbatim)
> "Avoid storing sensitive information (API keys, tokens) in the config file."

System keyring used by default; falls back to file-based secrets in headless environments or on keyring failure.

---

## 21. Environment variables (full reference)

URL: https://goose-docs.ai/docs/guides/environment-variables

### Model / provider
- `GOOSE_PROVIDER` — LLM provider
- `GOOSE_MODEL` — model name
- `GOOSE_FAST_MODEL` — overrides default fast model for auxiliary tasks
- `GOOSE_TEMPERATURE`
- `GOOSE_MAX_TOKENS`
- `GOOSE_PROVIDER__TYPE`
- `GOOSE_PROVIDER__HOST`
- `GOOSE_PROVIDER__API_KEY`
- `GEMINI3_THINKING_LEVEL` — `low` (default) or `high`
- `GOOSE_PREDEFINED_MODELS` — JSON array of custom model defs

### Claude thinking
- `CLAUDE_THINKING_TYPE` — `adaptive` (default Claude 4.6+), `enabled`, `disabled`
- `CLAUDE_THINKING_BUDGET` — positive int, default 16000

### Planning
- `GOOSE_PLANNER_PROVIDER`
- `GOOSE_PLANNER_MODEL`

### Session management
- `GOOSE_CONTEXT_STRATEGY` — `summarize` / `truncate` / `clear` / `prompt` (default)
- `GOOSE_MAX_TURNS` — default 1000
- `GOOSE_GATEWAY_MAX_TURNS` — falls back to GOOSE_MAX_TURNS then 5
- `GOOSE_SUBAGENT_MAX_TURNS` — default 25
- `GOOSE_MAX_BACKGROUND_TASKS` — default 5
- `CONTEXT_FILE_NAMES` — JSON array, default `[".goosehints"]`
- `GOOSE_DISABLE_SESSION_NAMING` — `1` / `true`
- `GOOSE_DISABLE_TOOL_CALL_SUMMARY`
- `GOOSE_PROMPT_EDITOR`
- `GOOSE_CLI_THEME` — `light` / `dark` / `ansi` (default dark)
- `GOOSE_CLI_LIGHT_THEME` — bat theme, default GitHub
- `GOOSE_CLI_DARK_THEME` — bat theme, default zenburn
- `GOOSE_CLI_NEWLINE_KEY` — default `j` (Ctrl+J)
- `GOOSE_CLI_SHOW_THINKING`
- `GOOSE_RANDOM_THINKING_MESSAGES` — default true
- `GOOSE_CLI_SHOW_COST`
- `GOOSE_MAX_CODE_BLOCK_LINES` — default 50
- `GOOSE_TRUNCATED_SHOW_LINES` — default 20
- `GOOSE_NO_CODE_TRUNCATION`
- `GOOSE_AUTO_COMPACT_THRESHOLD` — default 0.8
- `GOOSE_TOOL_CALL_CUTOFF` — default 10
- `GOOSE_MOIM_MESSAGE_TEXT`
- `GOOSE_MOIM_MESSAGE_FILE`

### Context limits
- `GOOSE_CONTEXT_LIMIT` — default 128000 or model-specific
- `GOOSE_INPUT_LIMIT` — Ollama prompt input, fall-back to context limit
- `GOOSE_PLANNER_CONTEXT_LIMIT`

### Tool config
- `GOOSE_MODE` — default `smart_approve`
- `GOOSE_TOOLSHIM`
- `GOOSE_TOOLSHIM_OLLAMA_MODEL`
- `GOOSE_CLI_MIN_PRIORITY` — default 0.0
- `GOOSE_CLI_TOOL_PARAMS_TRUNCATION_MAX_LENGTH` — default 40
- `GOOSE_DEBUG`
- `GOOSE_SEARCH_PATHS`
- `GOOSE_SHELL` — Unix: `/bin/bash` or `$SHELL`; Windows: `cmd`

### Enhanced code editing
- `GOOSE_EDITOR_API_KEY`
- `GOOSE_EDITOR_HOST`
- `GOOSE_EDITOR_MODEL`

### Security
- `GOOSE_ALLOWLIST` — URL of allowed extensions list
- `GOOSE_DISABLE_KEYRING`
- `SECURITY_PROMPT_ENABLED`
- `SECURITY_PROMPT_THRESHOLD` — 0.01–1.0, default 0.8
- `SECURITY_PROMPT_CLASSIFIER_ENABLED`
- `SECURITY_PROMPT_CLASSIFIER_ENDPOINT`
- `SECURITY_PROMPT_CLASSIFIER_TOKEN`
- `GOOSE_TELEMETRY_ENABLED`
- `GOOSE_SANDBOX` — macOS sandbox, default false

### Network
- `GOOSE_OAUTH_CALLBACK_PORT` — default random
- `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`

### Observability
- `OTEL_EXPORTER_OTLP_ENDPOINT` (+ per-signal endpoints + exporter types)
- `OTEL_SDK_DISABLED`
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_URL` / `LANGFUSE_INIT_PROJECT_*_KEY`

### Goose server
- `GOOSE_HOST` — default `127.0.0.1`
- `GOOSE_PORT` — default `3000`
- `GOOSE_TLS` — default `true`
- `GOOSE_SERVER__SECRET_KEY`

### Recipes
- `GOOSE_RECIPE_PATH` — additional dirs to search
- `GOOSE_RECIPE_GITHUB_REPO`
- `GOOSE_RECIPE_RETRY_TIMEOUT_SECONDS`
- `GOOSE_RECIPE_ON_FAILURE_TIMEOUT_SECONDS`

### Data root
- `GOOSE_PATH_ROOT` — overrides platform default

**Platform default data dirs:**
- macOS: `~/Library/Application Support/Block/goose/`
- Linux: `~/.local/share/goose/`
- Windows: `%APPDATA%\Block\goose\`

### Set by Goose itself
- `GOOSE_TERMINAL` — set when goose is executing a command
- `AGENT` — generic agent identifier
- `AGENT_SESSION_ID` — current session ID (in extension/shell contexts)

### Provider retry tunables
- Bedrock: `BEDROCK_MAX_RETRIES=6`, `BEDROCK_INITIAL_RETRY_INTERVAL_MS=2000`, `BEDROCK_BACKOFF_MULTIPLIER=2`, `BEDROCK_MAX_RETRY_INTERVAL_MS=120000`
- Databricks: `DATABRICKS_MAX_RETRIES=3`, `DATABRICKS_INITIAL_RETRY_INTERVAL_MS=1000`, `DATABRICKS_BACKOFF_MULTIPLIER=2`, `DATABRICKS_MAX_RETRY_INTERVAL_MS=30000`

---

## 22. MCP-related guides (relevant cross-references)

### MCP Roots
URL: https://goose-docs.ai/docs/guides/mcp-roots

> "MCP Roots lets goose share your session working directory with roots-aware MCP extensions."

- Goose advertises roots during MCP init.
- Root list contains a SINGLE entry: the current session working directory (Desktop: bottom-of-chat dir picker; CLI: launch dir).
- Roots-aware extensions can subscribe to changes.

**Office Town implication:** If our MCPs are project-aware (per-folder configs, etc.), they should consume the root from Goose's MCP init handshake rather than asking the user.

### MCP Elicitation
URL: https://goose-docs.ai/docs/guides/mcp-elicitation

> "MCP Elicitation allows goose to pause and ask you for specific information when an extension needs it."

- Desktop: inline form with labeled fields, `*` for required, defaults, Submit button.
- CLI: cyan prompt text, yellow field names, red asterisks, defaults in brackets. Yes/no via interactive toggles. Ctrl+C cancels.
- **Timeout: 5 minutes.** If no response, request cancelled; Goose continues without it.

**Office Town implication:** When an Office Town MCP needs missing info from the user (which customer? which year?), `elicitation` is the right pattern — better than 400'ing the tool call. Forms can be structured.

### MCP Sampling
URL: https://goose-docs.ai/docs/guides/mcp-sampling

> "MCP Sampling enables extensions to ask goose's AI for help with their tasks."

- No configuration required — automatic for any MCP server that supports sampling.
- MCP server gets access to whatever LLM Goose is using.

**Office Town implication:** Our MCPs can run sub-LLM-calls *via* Goose's configured provider — no need for Office Town to ship its own LLM credentials for things like "summarise this proposal", "tag this lead". This is potentially a big architectural simplification: keep the LLM cost on the user's side.

---

## 23. Tool modes & permissions (high-level)

URL: https://goose-docs.ai/docs/guides/managing-tools/

Modes (`GOOSE_MODE` or `/mode`):
- `auto` — execute without approval
- `approve` — prompt every tool call
- `chat` — no tool execution, conversation only
- `smart_approve` (default) — judge per-call whether read-only

Tool permissions are configurable via `goose configure` and stored in `permission.yaml`.

Code Mode is a programmatic approach that "discovers and calls MCP tools on demand."

Ollama Tool Shim — experimental, enables tool calling for non-tool-calling models via local interpreter.

**Office Town implication:** Tools we expose should be tagged with metadata indicating read-only vs side-effecting so `smart_approve` can route them correctly. (Specific tagging mechanism not detailed on this page — to be confirmed in MCP tool spec, but expect schema annotations.)

---

## 24. Conflicts / surprises vs Office Town's working assumptions

Cross-checking against what I'd guess Office Town has assumed:

| Assumption that might be wrong | Reality from docs |
|---|---|
| Goose config lives at `~/.goose/` | **No** — `~/.config/goose/` on macOS/Linux, `%APPDATA%\Block\goose\config\` on Windows |
| Skills/plugins under `~/.goose/skills` | **No** — under `~/.agents/skills/` and `~/.agents/plugins/<name>/` (parallel to Goose config dir) |
| Session storage as JSONL | **Partially** — legacy JSONL still on disk, but active store is SQLite at `~/.local/share/goose/sessions/sessions.db` |
| `/extension` adds any extension type mid-session | **No** — stdio only. HTTP needs session-start flag |
| `goose://` deeplinks work for stdio AND HTTP | **Yes** — both formats documented (cmd-based vs url-based) |
| Plugins ship MCP servers | **No** — plugins bundle skills + hooks. MCP servers are added via extensions config / deeplinks |
| One config for everything | **No** — `config.yaml` (provider/extensions), `settings.json` (plugin enable/disable), `permission.yaml` (tool perms), `prompts/` (templates), `custom_providers/` (provider defs), `.goosehints`, `.gooseignore`, secrets.yaml |
| Hooks are MCP-specific | **No** — hooks live in plugins and react to Goose lifecycle events. Tool-related hook matchers (`PreToolUse` etc.) can target tool names but the hook ITSELF runs locally as a shell command |
| MCP servers need their own LLM credentials for AI sub-tasks | **No** — MCP Sampling lets the server call back into Goose's LLM |
| Session = user-wide | **Yes** — sessions sync between Desktop and CLI |
| Auto-compaction is triggered by Office Town | **No** — it's a user/global env var (`GOOSE_AUTO_COMPACT_THRESHOLD`), MCP servers can't influence it |
| Recipes are just YAML templates | **More** — they can embed MCP extensions, sub-recipes, retry logic, structured output schemas, planning settings, parameter forms |
| Slash commands can be added by extensions | **No** — built-in commands are fixed (per the CLI ref); user can add custom slash commands but each is bound 1:1 to a recipe file |

---

## 25. Office Town deployment architecture — what these primitives tell us

A complete Office Town footprint on a Goose install touches:

1. **MCP extensions** (one per cap-suite, streamable_http) — added via `goose://extension?...` deeplinks or manual config.yaml edit.
2. **A plugin** at `~/.agents/plugins/office-town/` bundling:
   - Skills: `skills/customer-research/`, `skills/proposal-drafting/`, etc.
   - Hooks: `hooks/hooks.json` for `SessionStart` (refresh user context), `PostToolUse` (log Office Town tool usage).
   - Scripts: small helpers under `scripts/`.
3. **Optional recipes** — published via GitHub repo + `GOOSE_RECIPE_GITHUB_REPO`, OR locally under `~/.local/share/goose/recipes/`.
4. **Optional custom slash commands** in `config.yaml` mapping `/ot-<thing>` to recipes.
5. **Optional MOIM file** at `~/.config/office-town/guardrails.md` set via `GOOSE_MOIM_MESSAGE_FILE` for per-turn guardrails.
6. **Optional `.goosehints`** entries — either appended to user's hints or registered via `CONTEXT_FILE_NAMES=["OFFICETOWN.md",".goosehints"]`.

**Single install primitive recommendation:** One `goose plugin install <office-town-git-url>` for skills/hooks + one `goose://extension?type=streamable_http&...` deeplink per MCP suite.

Everything else (recipes, slash commands, MOIM) is opt-in / per-user.

---

## 26. Open questions for follow-up research

1. **Schema annotations for `smart_approve`** — how does Goose decide a tool is read-only? Tool description? Annotation in the MCP tool spec? Need to check MCP tool definition guide.
2. **MCP server auth** — how does the streamable_http transport handle bearer tokens? Are they passed in deeplink params? Stored in secrets? Need MCP custom-extensions guide.
3. **`GOOSE_RECIPE_GITHUB_REPO` format** — owner/repo? Branch? Subdir? Not documented in fetched content.
4. **Plugin auto-update cadence** — `--auto-update` flag exists but unclear when checks happen (session start? `goose update`?).
5. **Conflict between `CONTEXT_FILE_NAMES` default** — env-var page says `[".goosehints"]`, goosehints page says `["AGENTS.md", ".goosehints"]`. Need to verify against source.
6. **Code Mode** — sounds important for tool discovery but no detail page fetched.
7. **Extension Allowlist** — `GOOSE_ALLOWLIST` env var hints at central allowlist; format and enforcement unclear.
8. **`acp` server mode** — Goose can run as an Agent Client Protocol server. What's exposed? How does this interact with our MCPs?
9. **Memory MCP** — listed under context-engineering category, separate from Memory built-in extension. Office Town integration potential.

---

## Sources fetched

| URL | Status |
|---|---|
| /docs/category/getting-started/ | ✓ |
| /docs/getting-started/installation | ✓ |
| /docs/getting-started/providers | ✓ |
| /docs/getting-started/using-extensions | ✓ |
| /docs/guides/sessions/session-management | ✓ |
| /docs/guides/sessions/in-session-actions | ✓ |
| /docs/guides/sessions/smart-context-management | ✓ |
| /docs/guides/context-engineering/ | ✓ (sub-page list) |
| /docs/guides/context-engineering/using-goosehints | ✓ |
| /docs/guides/context-engineering/creating-plans | ✓ |
| /docs/guides/context-engineering/subagents | ✓ |
| /docs/guides/context-engineering/using-skills | ✓ |
| /docs/guides/context-engineering/slash-commands | ✓ |
| /docs/guides/context-engineering/hooks | ✓ |
| /docs/guides/context-engineering/plugins | ✓ |
| /docs/guides/context-engineering/prompt-templates | ✓ |
| /docs/guides/context-engineering/using-persistent-instructions | ✓ |
| /docs/guides/context-engineering/using-gooseignore | ✓ |
| /docs/guides/recipes/ | ✓ (sub-page list) |
| /docs/guides/recipes/recipe-reference | ✓ |
| /docs/guides/goose-cli-commands | ✓ |
| /docs/guides/config-files | ✓ |
| /docs/guides/environment-variables | ✓ |
| /docs/guides/mcp-roots | ✓ |
| /docs/guides/mcp-elicitation | ✓ |
| /docs/guides/mcp-sampling | ✓ |
| /docs/guides/managing-tools/ | ✓ (sub-page list) |

**404s during research (URL pattern surprises):**
- `/docs/guides/managing-sessions` → actual: `/docs/guides/sessions/session-management`
- `/docs/guides/session-management` → actual: `/docs/guides/sessions/session-management`
- `/docs/guides/in-session-actions` → actual: `/docs/guides/sessions/in-session-actions`
- `/docs/guides/smart-context-management` → actual: `/docs/guides/sessions/smart-context-management`
- `/docs/guides/goose-hints` → actual: `/docs/guides/context-engineering/using-goosehints`
- `/docs/guides/creating-plans` → actual: `/docs/guides/context-engineering/creating-plans`
- `/docs/guides/subagents` → actual: `/docs/guides/context-engineering/subagents`
- `/docs/guides/agent-skills` → actual: `/docs/guides/context-engineering/using-skills`

The actual Goose docs nest these under category sub-paths (`sessions/`, `context-engineering/`, `recipes/`) — useful to bookmark.
