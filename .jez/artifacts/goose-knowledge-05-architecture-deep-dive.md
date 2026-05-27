# Goose Architecture Deep Dive — Knowledge Base for Office Town

**Sources**: https://goose-docs.ai/docs/ (fetched 2026-05-28)
**Scope**: Architecture · Extensions Design · Error Handling · Experimental · Troubleshooting · Security · Recipes · Source System (Projects/Skills/Recipes/Plugins) · Memory · Open Plugin Spec · Custom Distributions · Permissions/Sandboxing
**Purpose**: Authoritative reference for Office Town's integration model with Goose. Deepest agent — work informs all downstream KB synthesis.

---

## 0. Documentation URL pattern (important corrections)

The task brief uses URLs like `/docs/architecture/goose-architecture` but the live docs use `/docs/goose-architecture/...` (no `architecture/` prefix). The verified working URL patterns from the sitemap:

| Topic | Verified URL |
|---|---|
| Architecture overview | `/docs/category/architecture-overview` |
| goose Architecture | `/docs/goose-architecture/` |
| Extensions Design | `/docs/goose-architecture/extensions-design` |
| Error Handling | `/docs/goose-architecture/error-handling` |
| Experimental landing | `/docs/experimental/` |
| Ollama Tool Shim | `/docs/experimental/ollama` (NOT `ollama-tool-shim`) |
| Troubleshooting landing | `/docs/troubleshooting/` |
| Desktop startup debug | `/docs/troubleshooting/desktop-startup-debugging` (NOT `debug-desktop-startup-failures`) |
| Diagnostics | `/docs/troubleshooting/diagnostics-and-reporting` |
| Known issues | `/docs/troubleshooting/known-issues` |
| Security landing | `/docs/guides/security/` |
| Recipes landing | NO `/docs/category/recipes` — use `/docs/guides/recipes/` |
| MCP server listings | `/docs/mcp/<name>-mcp` (one canonical "Memory" page = `/docs/mcp/memory-mcp`) |

**SourceType / Sources in code sense**: The docs site does NOT use the term "SourceType::Project / Agent / Skill / Recipe" anywhere. That terminology appears to come from Goose's internal Rust source code, not the user-facing docs. The user-facing concepts are: **Projects** (working directories), **Sessions**, **Skills**, **Recipes**, **Plugins**, **Extensions**, **Hooks**. There is no published "Source system" API in the docs — the term is internal.

---

## 1. The three-part architecture (verbatim core)

From `/docs/goose-architecture/`:

> "goose operates through three integrated parts: the **interface** (desktop app or CLI), the **agent** (core logic manager), and **extensions** (tool providers). The interface spins up an instance of the agent, which then connects to one or more extensions simultaneously."

Diagrammatically:

```
┌─────────────────┐
│   Interface     │  Desktop · CLI · ACP-client (Zed/JetBrains)
│  (UI / shell)   │  · Remote Goose server · TUI (ui/text)
└────────┬────────┘
         │ spawns
         ▼
┌─────────────────┐
│     Agent       │  Provider chat · Context revision · Tool dispatch
│  (core logic)   │  · Error handling · Compaction
└────────┬────────┘
         │ MCP protocol (stdio / streamable_http / SSE / builtin)
         ▼
┌─────────────────┐
│   Extensions    │  Developer · Memory · Summon · ExtMgr · TopOfMind
│  (MCP servers)  │  · Custom MCP servers (any language)
└─────────────────┘
```

### 1.1 Interactive loop — the six-stage cycle

The agent's request-response cycle:

1. **Human Request** initiates the flow
2. **Provider Chat** sends the request with available tools to the configured LLM
3. **Model Extension Call** — LLM emits tool calls as JSON
4. **Response to Model** — tool execution results returned to the model
5. **Context Revision** — removes irrelevant information for token efficiency
6. **Model Response** — final completion to user

### 1.2 ACP (Agent Client Protocol) — dual mode

> "Goose operates in dual ACP modes:
> - **As Server**: `goose acp` runs over stdio, enabling editor integration (JetBrains, Zed)
> - **As Client**: Delegates to external ACP agents like Claude Code, passing configured extensions as MCP servers"

Implications for Office Town: any ACP-aware editor (Zed, JetBrains) can use Goose-with-Office-Town-extensions, so Office Town inherits ACP support "for free" by being a normal MCP extension.

### 1.3 Error/recovery as a first-class architectural concern

> "goose captures errors (invalid JSON, missing tools) and returns them as tool responses, allowing the LLM to resolve issues."

Two error categories (from `/docs/goose-architecture/error-handling`):

> **Traditional Errors** — network issues, model availability. "Raised as errors in the agent API to the caller, who can decide how to handle that." Uses `anyhow::Error`.
>
> **Agent Errors** — "everything is working correctly, but the model generations themselves are somehow causing errors." Examples: unknown tool names, incorrect parameters, tool calls that produce errors. Uses `thiserror::Error`. Crucially: **"error messages are in some ways prompting — they give instructions to the LLM on how it might go about recovering."**

Both `ToolUse` and `ToolResult` are typically "passed through the API as part of a `Result<T, AgentError>`." An error in `ToolUse` becomes a `ToolResult` error passed back to the LLM. Valid `ToolUse` calls may still result in error `ToolResult` objects returned to the model. Providers translate agent errors into appropriate API specifications as valid messages.

**Office Town design contract**: error messages from our MCP tools should READ LIKE INSTRUCTIONS to the LLM, not like generic API errors. e.g. "No site found at this URL. Available sites: [...]. Use list_sites to discover URLs." NOT "404 Not Found."

---

## 2. Extensions design — the trait contract (verbatim)

From `/docs/goose-architecture/extensions-design`:

> "The Extensions Design document outlines how AI agents interact with components through a unified interface. The system centers on the **Extension trait**, which requires implementations of:
>
> - `name()`, `description()`, `instructions()`
> - `tools()` — returns available Tool objects
> - `status()` — provides operational state information
> - `call_tool()` — executes tool functionality"

### 2.1 Tools — the surface area

> "Tools serve as 'the primary way Extensions expose functionality to agents.' Each tool requires:
>
> - A name and description
> - Parameter definitions
> - Async implementation returning `AgentResult<Value>`"

### 2.2 Error handling within Extensions

> The design employs two error types:
> - `ErrorData` for tool-specific execution failures
> - `anyhow::Error` for general extension operations
>
> This separation enables "precise error handling for tool execution while maintaining flexibility."

### 2.3 Best practices (verbatim guidelines)

**Tool Design**:
- Use action-oriented naming (e.g., "create_user")
- Provide clear parameter descriptions
- Return specific errors that function as "prompts"
- Manage state explicitly

**Extension Implementation**:
- Encapsulate state privately
- Use the `?` operator with `ErrorData`
- Deliver clear status information
- Document all tools thoroughly

### 2.4 What the docs DO NOT cover (important gaps to verify in source)

The Extensions Design page is silent on:
- Lifecycle (load/register/handshake/unload) detail
- Streamable-HTTP MCP handshake semantics
- Sandboxing inside the extension process
- Permissions model integration
- Custom distributions (covered elsewhere)
- "Open Plugin Spec" alignment (covered elsewhere)

**Office Town implication**: the extension TRAIT itself is in-process Rust. We are not implementing the trait — we run as an **out-of-process MCP server**, connecting via stdio or streamable_http. Goose's "Extensions" framework is what loads/connects to our MCP server. We design to the MCP spec, NOT the Extension trait.

---

## 3. Extension installation surface (verbatim from `/docs/getting-started/using-extensions`)

### 3.1 Built-in extensions (shipped with Goose)

- **Developer** — general development tools, enabled by default
- **Computer Controller** — web scraping, automation
- **Memory** — preference retention across sessions
- **Tutorial** — interactive learning
- **Auto Visualiser** — data viz graphics

### 3.2 Built-in PLATFORM extensions (global features)

- **Apps** — create/manage custom HTML applications
- **Chat Recall** — search conversation history
- **Code Mode** — execute JavaScript for tool discovery
- **Extension Manager** — discover and enable extensions dynamically (default enabled)
- **Summon** — load skills and delegate to subagents (default enabled)
- **Todo** — manage task lists (default enabled)
- **Top of Mind** — inject persistent instructions into working memory

### 3.3 Installation methods

**CLI** — `goose configure` → "Add Extension" → choose:
- Built-in Extensions
- Command-line Extensions (stdio)
- Remote Extensions (Streamable HTTP)

**Deeplinks** (URL-based install):

```
StandardIO:    goose://extension?cmd=<command>&arg=<argument>&id=<id>&name=<name>&description=<description>
Streamable HTTP: goose://extension?url=<url>&type=streamable_http&id=<id>&name=<name>&description=<description>
```

All parameters URL-encoded.

**Slash commands** (mid-session):
- `/extension npx -y @modelcontextprotocol/server-memory`
- `/builtin developer`

**Session-launch flags**:
```bash
goose session --with-builtin "developer,computercontroller"
goose session --with-extension "uvx mcp-server-fetch"
goose session --with-streamable-http-extension "https://example.com/streamable"
goose session --with-extension "GITHUB_PERSONAL_ACCESS_TOKEN=<TOKEN> npx -y @modelcontextprotocol/server-github"
```

### 3.4 Direct config (`~/.config/goose/config.yaml`)

```yaml
extensions:
  extension_name:
    bundled: true/false
    enabled: true/false
    name: "extension_name"
    timeout: 300
    type: "builtin" | "stdio" | "streamable_http"
    available_tools: []   # empty = all; or list to whitelist
```

The `available_tools` field is **important** for Office Town — we can ship one Worker exposing many tools and let users whitelist a subset per-install.

### 3.5 Smart Extension Recommendation

> "When a task requires capabilities beyond currently enabled extensions, Goose suggests or enables additional extensions as needed."

Driven by the **Extension Manager** platform extension (see §6.1).

### 3.6 Security — automatic malware detection

> "The platform implements automatic malware detection, blocking 'malicious packages' with clear error messaging."

False positives can be handled by:
- Choosing alternative extensions from official directories
- Verifying sources
- Checking OSV database

---

## 4. The "Source System" — what actually exists (Projects, Sessions, Skills, Recipes, Plugins)

Office Town's brief asked for `SourceType::Project / Agent / Skill / Recipe` — that's an internal Rust enum, not public docs vocabulary. Here's what's actually documented as the "sources" of context/instructions that Goose can load:

### 4.1 Projects (`/docs/guides/managing-projects`)

> "A project in goose is 'a record of a working directory where you've used goose.'"

**Storage**: `~/.local/share/goose/projects.json`

**Per-project metadata**:
- `path` — absolute path to directory
- `last_accessed` — timestamp
- `last_instruction` — most recent prompt
- `session_id` — last session

**Commands**:
- `goose project` (alias `goose p`) — resume most recent
- `goose projects` (alias `goose ps`) — choose from list

**Important**: "Projects are currently available only through the goose CLI. Desktop support is planned for future releases."

### 4.2 Sessions (`/docs/guides/sessions/session-management`)

> "A session represents 'a single, continuous interaction between you and goose, providing a space to ask questions and prompt action.'"

**Storage** (1.10.0+):
- macOS/Linux: `~/.local/share/goose/sessions/sessions.db` (SQLite)
- Windows: `%APPDATA%\Block\goose\data\sessions\sessions.db`

Pre-1.10.0 stored individual `.jsonl` files (auto-imported on upgrade).

**Session IDs**: `YYYYMMDD_<COUNT>` (e.g. `20260213_9`).

**Commands**:
```bash
goose session list -l 1
goose session -r                          # resume latest
goose session -r --name <name>            # resume by name
goose session --name react-migration      # new named
goose session export                      # export to markdown/json/yaml
goose session remove                      # interactive
goose session remove --session-id 20251108_3
goose session remove -r "project-.*"      # regex
```

**AI-generated naming**: enabled by default; disable with `GOOSE_DISABLE_SESSION_NAMING=1`.

### 4.3 Skills (`/docs/guides/context-engineering/using-skills`) — **portable across agents**

> "Skills are reusable sets of instructions and resources that teach goose how to perform specific tasks."

**File format** — each skill is a directory containing `SKILL.md` with YAML frontmatter:

```markdown
---
name: code-review
description: Review code for bugs and style issues
---
[Markdown content with instructions]
```

**Storage locations** (three tiers):

| Scope | Path |
|---|---|
| Global | `~/.agents/skills/<skill-name>/SKILL.md` |
| Project | `.agents/skills/<skill-name>/SKILL.md` |
| Plugin-provided | `~/.agents/plugins/<plugin-name>/skills/<skill-name>/SKILL.md` (loaded as `<plugin>:<skill>`) |

**Backward-compat paths**: `.goose/skills/`, `.claude/skills/`, `~/.claude/skills/` — Goose reads from these too (note the **deliberate Claude-skill interop**).

**Loading triggers**:
- Request matches skill description
- User explicitly references (e.g. "use the code-review skill")
- CLI `/skills` command lists/loads them

**Supporting files**: scripts, templates, etc. live alongside `SKILL.md`. Goose's Developer extension can access them via file tools.

**For Office Town**: Office Town can ship as a plugin containing skills like `office-town:install`, `office-town:audit`, `office-town:rebuild-css` — these become first-class invokable skills in any Goose session.

### 4.4 Recipes (`/docs/guides/recipes/`, `/docs/guides/recipes/recipe-reference`)

> "Recipes are reusable workflows that package extensions, prompts, and settings together. Share proven workflows with your team and reproduce successful results consistently."

**Format**: `.yaml`, `.yml`, or `.json`. CLI saves only `.yaml`. Loadable from filesystem OR GitHub repos.

**Required fields**:
- `title` — short title
- `description` — detailed description
- One of `instructions` or `prompt` (for headless, `prompt` is required)

**Key field categories**:

| Field | Purpose |
|---|---|
| `activities` | Desktop-only clickable bubbles; supports `{{ parameter_name }}` |
| `extensions` | MCP servers — types: `stdio`, `builtin`, `platform`, `streamable_http`, `frontend`, `inline_python`. Each needs `type`, `name`, `cmd`, `args`, `timeout` |
| `parameters` | Schema: `key`, `input_type` (string/number/boolean/date/file/select), `requirement` (required/optional/user_prompt), `description` |
| `settings` | `goose_provider`, `goose_model`, `temperature`, `max_turns` |
| `response` | `json_schema` for structured output (final_output tool) |
| `retry` | `max_retries`, success `checks`, optional `on_failure` |
| `sub_recipes` | References other recipe files; `name`, `path`, `values`, config options |

**Validation rules** (verbatim):
- "Optional parameters must have default values"
- "File parameters cannot have defaults"
- "All template variables must have corresponding parameter definitions with no unused parameters"

**Storage locations**:
- Global: `~/.config/goose/recipes/`
- Local: `<project>/.goose/recipes/`

**Discovery order** (`goose recipe list`):
1. Current directory
2. `GOOSE_RECIPE_PATH` env var directories
3. Global library
4. Local project recipes
5. (Optional) `GOOSE_RECIPE_GITHUB_REPO` GitHub repo

**Sharing**: `goose recipe deeplink <FILE>` generates shareable links.

**Privacy**: "Recipes exclude global and local memory, API keys, personal credentials, and system-level goose settings."

### 4.5 Subrecipes (`/docs/guides/recipes/subrecipes`)

> "Subrecipes are recipes that are used by another recipe to perform specific tasks."

```yaml
sub_recipes:
  - name: "security_scan"
    path: "./subrecipes/security-analysis.yaml"
    values:
      scan_level: "comprehensive"
  - name: "quality_check"
    path: "./subrecipes/quality-analysis.yaml"
```

**Critical constraints**:
- "Sub-recipe sessions run in isolation — they don't share conversation history, memory, or state with the main recipe or other subrecipes"
- Subrecipes cannot define their own subrecipes (no nesting)
- Recipes with `sub_recipes` automatically receive the `summon` platform extension

**Parameter handling**: `{{ parameter_name }}` syntax. Use `indent()` filter for multi-line YAML safety. `values` takes precedence over context-extracted params.

### 4.6 Plugins — Open Plugin format (`/docs/guides/context-engineering/plugins`)

> "Plugins are packages that extend goose with reusable components. A plugin can provide skills, hooks, or both."

**Plugin structure** (Open Plugin format):

```
plugin-name/
├── plugin.json                  # manifest
├── skills/<skill-name>/SKILL.md # optional skills
├── hooks/hooks.json             # optional hooks
└── scripts/                     # supporting commands
```

**Manifest example**:
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "..."
}
```

**Skill namespacing**: "goose namespaces imported skill names with the plugin name. The `review` skill in `my-plugin` is loaded as `my-plugin:review`."

**Hooks** use `${PLUGIN_ROOT}` to reference plugin dir; receive event payload as JSON on stdin.

**Plugin locations**:
- User: `~/.agents/plugins/<plugin-name>/`
- Project: `<project>/.agents/plugins/<plugin-name>/`

**Commands**:
```bash
goose plugin install <git-url>
goose plugin install --auto-update <git-url>
goose plugin update <plugin-name>
```

**Disable**: add plugin name to `disabledPlugins` array in `~/.config/goose/settings.json` (note: separate from `config.yaml`).

**Supported plugin formats**:
1. **Open Plugins** (canonical): `plugin.json` + skills + hooks
2. **Gemini extensions**: skills from Gemini-style repos (skills NOT namespaced)

**Security note** (verbatim): "Install trusted plugins only. Plugins can include instructions that goose may load and hooks that execute local commands."

### 4.7 Hooks (`/docs/guides/context-engineering/hooks`)

> "Hooks let you run your own scripts when key events happen during a goose session."

**`hooks/hooks.json` structure**:

| Field | Required | Purpose |
|---|---|---|
| `matcher` | No | Regex pattern filter |
| `hooks` | Yes | Actions array |
| `type` | No | Action type (`command` is currently only one) |
| `command` | Yes | Shell command (via `sh -c`) |
| `timeout` | No | Seconds (default 30) |

**Supported lifecycle events**:

| Event | Trigger |
|---|---|
| `SessionStart` | Session initialization |
| `SessionEnd` | Session termination |
| `Stop` | Stop event |
| `UserPromptSubmit` | User submits a prompt |
| `PreToolUse` | Before any tool execution |
| `PostToolUse` | After successful tool exec |
| `PostToolUseFailure` | After failed tool exec |
| `BeforeReadFile` | Pre-file-read |
| `AfterFileEdit` | Post-successful file edit |
| `BeforeShellExecution` | Pre-shell command |
| `AfterShellExecution` | Post-successful shell command |

**Hook payload (JSON on stdin)**:
- `event` — event name
- `session_id`
- `matcher_context` — matched string (tool name / file path / command)
- Tool-specific fields

**Example — auto-format on file edit**:
```json
{
  "hooks": {
    "AfterFileEdit": [{
      "matcher": "\\.(ts|tsx|js|jsx)$",
      "hooks": [{
        "type": "command",
        "command": "${PLUGIN_ROOT}/scripts/prettier.sh"
      }]
    }]
  }
}
```

**Office Town integration angle**: A `goose-office-town` plugin could ship a `PostToolUse` hook that auto-syncs wiki pages whenever Goose edits an `index.md` under `wiki/`.

### 4.8 Slash commands (`/docs/guides/context-engineering/slash-commands`)

CLI-side custom shortcuts that invoke recipes. Defined in `~/.config/goose/config.yaml`:

```yaml
slash_commands:
  - command: "run-tests"
    recipe_path: "/path/to/recipe.yaml"
```

Limitations: one optional parameter only, case-insensitive, cannot conflict with built-ins (`/recipe`, `/compact`, `/help`).

### 4.9 .goosehints (`/docs/guides/context-engineering/using-goosehints`)

Loaded ONCE at session start, hierarchically from working dir up to repo root.

- Global: `~/.config/goose/.goosehints`
- Local: any directory in hierarchy (project root downward)

`@filename.md` auto-includes file contents. **Goose also reads `AGENTS.md`** per the context-engineering landing page ("Use AGENTS.md, .goosehints, and other files to provide project context").

`CONTEXT_FILE_NAMES` env var (JSON array) overrides default `[".goosehints"]`.

### 4.10 .gooseignore (`/docs/guides/context-engineering/using-gooseignore`)

`.gitignore`-style syntax. Currently applies **only to the Developer extension**.

**Default protection** when no file exists: `**/.env`, `**/.env.*`, `**/secrets.*`. Once a file is created, defaults are gone unless re-added.

Both global (`~/.config/goose/.gooseignore`) and local files can coexist; local can override global with negation patterns (`!file.txt`).

### 4.11 Persistent instructions / Top of Mind (`/docs/guides/context-engineering/using-persistent-instructions`)

Injected into **every turn** (unlike `.goosehints` which loads once).

- `GOOSE_MOIM_MESSAGE_TEXT` — literal text
- `GOOSE_MOIM_MESSAGE_FILE` — path (supports `~/`)

Max **64 KB**, UTF-8 safe truncation. Both concat if both set. Read fresh each turn → mid-session updates work without restart.

**Rationale** (verbatim): "More effective than system prompt instructions for critical guardrails" — "can't be 'forgotten' as the conversation grows."

### 4.12 Prompt templates (`/docs/guides/context-engineering/prompt-templates`)

Eight customizable templates. Storage:
- macOS/Linux: `~/.config/goose/prompts/`
- Windows: `%APPDATA%\Block\goose\config\prompts\`

| Template | Where used |
|---|---|
| `system.md` | General system prompt (Desktop+CLI) |
| `apps_create.md` | New standalone apps (Desktop only) |
| `apps_iterate.md` | Update existing apps (Desktop only) |
| `compaction.md` | Conversation summarization |
| `permission_judge.md` | Read-only detection for tool ops |
| `plan.md` | Plan generation (CLI only) |
| `recipe.md` | Recipe-from-conversation generation |
| `subagent_system.md` | Subagent system prompt |

**Templating**: Jinja2 (`{{ variable }}`, `{% if %}`, `{% for %}`). Literal escape: wrap in single quotes `{{'{{variable}}'}}`.

Customizations persist across Goose updates.

---

## 5. Memory architecture (`/docs/mcp/memory-mcp`) — **for MEMORY-COMPARISON.md audit**

### 5.1 Storage locations (verbatim)

| Scope | Path | Use case |
|---|---|---|
| Local | `.goose/memory/` | Project-specific preferences |
| Global | `~/.config/goose/memory/` | User-wide preferences |

### 5.2 Tools provided

- `remember_memory()` — store categorized information with optional tags
- `retrieve_memories()` — fetch by category, or all via `"*"`
- `remove_memory_category()` — delete entire categories
- `remove_specific_memory()` — remove individual entries

### 5.3 Trigger words (auto-detection)

> "remember, forget, memory, save, remove memory, clear memory, search memory, find memory"

### 5.4 Loading behavior

> "goose loads all saved memories at the start of a session and includes them in every prompt sent to the LLM."

This means: **memories live in the system prompt context for the entire session** — large memory stores will eat tokens. They're not RAG-retrieved on demand; they're statically injected.

### 5.5 What this means for Office Town's MEMORY-COMPARISON.md audit

**No structural changes since the audit.** Goose's Memory extension remains:
- File-system based (not vector-DB)
- Static-load at session start (not retrieval-on-demand)
- Categorized + tagged
- Two-tier (local + global)

The page does not mention any new vector indexing, embedding store, or semantic search. The docs page on Cognee (`/docs/tutorials/advanced-cognee-usage`) — a separate vector-memory extension — is a third-party extension, not the built-in Memory. Confirmation: **MEMORY-COMPARISON.md's premises about Goose's Memory model are still valid.**

---

## 6. Summon — subagents architecture (`/docs/mcp/summon-mcp`, `/docs/guides/context-engineering/subagents`)

### 6.1 What Summon is

> "The Summon extension is a built-in platform extension for goose that enables context loading and task delegation. It 'lets you load knowledge into goose's context and delegate tasks to subagents.'"

**Two resource types loaded**:
1. **Skills** — reusable instruction sets
2. **Recipes** — automated task definitions with prompts + parameters

Available v1.25.0+; enabled by default for new users. Tools provided: `delegate`, `load`.

### 6.2 Subagent semantics

> "Subagents function as 'independent instances that execute tasks while keeping your main conversation clean and focused.'"

**Default configuration**:

| Parameter | Default | How to customize |
|---|---|---|
| Max Turns | 25 | Natural-language, `GOOSE_SUBAGENT_MAX_TURNS`, or recipe |
| Timeout | 5 min | Per-prompt request |
| Extensions | Inherited from parent | Specified in prompt or recipe |
| Return Mode | Full information | Customizable per prompt |

Max concurrent: `GOOSE_MAX_BACKGROUND_TASKS=5`.

**Disabled in**: manual approval, smart approval, chat-only modes. Only auto-spawned in autonomous mode.

**Sequential vs parallel** — triggered by keywords:
- Sequential: "first…then", "after"
- Parallel: "parallel", "simultaneously", "concurrently"

### 6.3 Security constraints

**Allowed**: extension discovery, resource access from enabled extensions, using extension-specified tools.

**Restricted**: subagent spawning (no infinite recursion), extension management (parent session protection), schedule management.

> "Subagents can browse extensions for suggestions but cannot enable them to avoid modifying the parent session."

### 6.4 Lifecycle

> "Subagents are 'temporary instances that exist only for task execution.' Upon completion, 'no manual intervention is needed for cleanup.'"

Failed/timed-out subagents return **no output**. For parallel execution, you only get results from the successful ones.

### 6.5 External subagents

> "External subagents 'let you bring in AI agents from other providers and platforms, enabling goose to coordinate and integrate your workflow with the broader ecosystem.'"

Configured via `~/.config/goose/config.yaml` MCP server stanzas alongside external tool configs.

### 6.6 Office Town implication

A "rebuild this site" command in Office Town could naturally spawn parallel subagents: one per page being rebuilt, each with only the Office Town extension enabled. With `extensions` restricted and `max_turns: 10`, each subagent is sandboxed to a defined task without polluting main context.

---

## 7. The Extension Manager (`/docs/mcp/extension-manager-mcp`)

> "The Extension Manager is a built-in platform extension that 'enables goose to dynamically discover, enable, and disable extensions during active sessions.'"

**Three principles**:
1. **Dynamic Discovery** — identify available extensions
2. **Smart Activation** — enable only when needed
3. **Automatic Cleanup** — suggest disabling unused

**Available tools**:

| Tool | Function |
|---|---|
| `search_available_extensions` | Discover installable extensions |
| `manage_extensions` | Enable/disable by name |
| `list_resources` | Enumerate extension resources |
| `read_resource` | Read specific resource content |

**Performance target** (verbatim): "Aim for **5 or fewer active extensions** with a total of **50 or fewer tools**."

**Office Town design implication**: We should expose **resources** via MCP (e.g. wiki pages as resources) so Extension Manager can list and read them. This gives the LLM a way to "browse" Office Town content without us pre-loading everything into prompt context.

---

## 8. Code Mode — programmatic tool invocation (`/docs/guides/managing-tools/code-mode`)

> "Code Mode is 'a method of interacting with MCP tools programmatically instead of calling them directly.'"

**How it works**: Code Mode extension exposes 3 meta-tools. The LLM writes JavaScript that Goose executes using **pctx (Port of Context)**, a custom Deno-based runtime, which discovers tools and calls them programmatically.

**Context efficiency**: Traditional calling includes ALL tool definitions every LLM call. Code Mode includes only the 3 meta-tools + tools previously discovered in the session.

**When to use**: 5+ extensions, well-defined multi-step workflows.
**When NOT**: 1-3 extensions, simple 1-2 tool tasks.

**Critical limitation** (verbatim): "Code Mode only supports text content from tool results. Images, binary data, and other content types are ignored."

**Office Town implication**: If Office Town tools return non-text (e.g. screenshot binaries), make sure to also return a URL or text descriptor — Code Mode users won't see binaries.

---

## 9. Permissions architecture (`/docs/guides/managing-tools/goose-permissions`, `tool-permissions`)

### 9.1 Permission modes (session-level)

| Mode | Description |
|---|---|
| **Autonomous (default)** | Modifies files, uses extensions, deletes without approval |
| **Manual Approval** | Asks confirmation for every tool/extension |
| **Smart Approval** | Risk-based: auto-approves low-risk, flags others |
| **Chat Only** | No extension use, no file modifications |

**Change mid-session**: `/mode auto`, `/mode smart_approve`, `/mode approve`, `/mode chat`.

### 9.2 Tool-level permissions (within extension)

Three granular levels per tool:

1. **Always Allow** — no confirmation. Safe read-only ops.
2. **Ask Before** — user approval required. State-changing ops.
3. **Never Allow** — blocked entirely. Sensitive ops.

Stored in `~/.config/goose/permission.yaml` (declared via `goose configure`). Runtime decisions logged in `~/.config/goose/permissions/tool_permissions.json` (auto-managed).

**Performance guidance** (verbatim): "goose performs best with fewer than 25 total tools enabled across all extensions."

### 9.3 Tool-write detection (which tools require approval)

> "goose will only ask for permission for tools that it deems are 'write' tools, e.g. any 'text editor write', 'text editor edit', 'bash - rm, cp, mv' commands."

Read-only detection is governed by the `permission_judge.md` prompt template — **customizable**.

### 9.4 CLI provider integration

> "For CLI providers like Claude Code, goose integrates with the provider's native permission system. Permission requests flow through goose's unified interface while maintaining compatibility with Claude Agent SDKs."

### 9.5 Office Town implication

We should mark our tools clearly write-vs-read. The naming convention `create_*`, `update_*`, `delete_*` will trigger approval prompts naturally in Smart Approval mode. Read tools should be `get_*`, `list_*`, `search_*`.

---

## 10. Security stack — sandbox, allowlist, adversary mode, prompt-injection

### 10.1 Allowlist (`/docs/guides/allowlist`)

YAML file fetched from `GOOSE_ALLOWLIST` URL (refetched every restart, cached in-session).

```yaml
extensions:
  - id: slack
    command: uvx mcp_slack
  - id: github
    command: uvx mcp_github
```

If env var unset, **no allowlist restrictions apply**. Best practices: exact commands, full paths, HTTPS URLs, audit regularly.

### 10.2 macOS Sandbox (`/docs/guides/sandbox`)

Two-layer protection:
1. **File access**: Apple's `sandbox-exec` (seatbelt)
2. **Network**: local egress proxy

**Blocked file writes** (default):
- `~/.ssh/`
- Shell configs: `.bashrc`, `.zshrc`, `.bash_profile`, `.zprofile`
- `~/.config/goose/sandbox/`, `~/.config/goose/config.yaml`

(Controlled by `GOOSE_SANDBOX_PROTECT_FILES=true` default.)

**Network filtering order**:
1. Loopback detection
2. Raw IP blocking (`GOOSE_SANDBOX_ALLOW_IP`)
3. Domain blocklist from `~/.config/goose/sandbox/blocked.txt`
4. SSH/Git host restrictions

**Blocked tools**: `nc`, `ncat`, `netcat`, `socat`, `telnet`. **Blocked**: `SOCK_RAW` sockets, kernel ext loading.

**Activation**: `export GOOSE_SANDBOX=true; open -a Goose`

**Enterprise hook**: LaunchDarkly integration for dynamic egress control.

### 10.3 Adversary Mode (`/docs/guides/security/adversary-mode`)

> "Adversary mode functions as 'a silent, independent agent reviewer that watches tool calls before they execute.'"

**How**:
1. Pre-execution review of each tool call against `adversary.md`
2. Binary ALLOW/BLOCK
3. **Fail-open** — if reviewer malfunctions, calls proceed

**Activation**: existence of `~/.config/goose/adversary.md` enables it; deletion disables.

**Default coverage** — `shell`, `computercontroller__automation_script`. Extend via `tools:` line.

**Rule-writing principles**:
- Specificity prevents false positives
- Bias toward permitting normal ops
- Threat-model your use case

### 10.4 Prompt Injection Detection (`/docs/guides/security/prompt-injection-detection`)

**Config (config.yaml format)**:
```yaml
SECURITY_PROMPT_ENABLED: true
SECURITY_PROMPT_THRESHOLD: 0.8       # 0.01-1.0, default 0.8
SECURITY_PROMPT_CLASSIFIER_ENABLED: true
SECURITY_PROMPT_CLASSIFIER_ENDPOINT: <URL>
SECURITY_PROMPT_CLASSIFIER_TOKEN: <token>
```

**Threshold guide**:
- 0.01-0.50: Very lenient
- 0.50-0.70: Balanced (general dev)
- 0.70-0.90: Strict (sensitive data)
- 0.90-1.00: Maximum (high-security)

**Detected attack patterns**:
- File deletion attempts
- Remote script execution
- SSH key access/exfil
- Security-compromising system mods

### 10.5 Classification API Spec (`/docs/guides/security/classification-api-spec`)

**Request**:
```json
POST /classify
{ "inputs": "string", "parameters": {} }
```

**Response**:
```json
[[
  { "label": "INJECTION", "score": 0.95 },
  { "label": "SAFE", "score": 0.05 }
]]
```

Labels: `INJECTION`/`LABEL_1` or `SAFE`/`LABEL_0`. Scores 0.0-1.0.

**Warning** (verbatim): "all tool call content and user messages sent for classification will be transmitted to the configured endpoint." Sensitive data risk.

---

## 11. Custom Distributions (`/docs/guides/custom-distributions`)

> "Goose is expressly designed for forking and customization."

**Complexity tiers** (verbatim):

| Customization | Complexity |
|---|---|
| Preconfigure a model/provider | Low |
| Add custom AI providers (declarative JSON, no code) | Low |
| Bundle custom MCP extensions | Medium |
| Modify system prompts | Low |
| Customize desktop branding (icons, names, colors) | Medium |
| Build a new UI via REST API or ACP | High |
| Create guided workflows with recipes | Low |

**Authoritative reference**: `CUSTOM_DISTROS.md` in the repo (NOT a docs site page — must read from the source repo).

**Minimal customization**:
```bash
export GOOSE_PROVIDER=ollama
export GOOSE_MODEL=qwen3-coder:latest
```

Or `init-config.yaml` for first-run setup.

**Office Town implication — verify the "parked" state**: Custom distributions remain viable, well-documented, Apache-2.0. **Nothing has changed that would un-park the custom distro work** — but ALSO nothing has changed that would make it harder if we choose to revisit. The framing in the docs is still "fork it" which suggests it's stable but not the recommended path for most extension authors.

---

## 12. Experimental features (`/docs/experimental/`)

Listed verbatim:

### 12.1 Ollama Tool Shim (`/docs/experimental/ollama`)

> "Enables tool calling capabilities for language models that don't natively support tool calling (like DeepSeek) using an experimental local interpreter model setup."

**Mechanism** (verbatim):
> "The primary model to output json for intended tool usage, the interpretive model uses ollama structured outputs to translate the primary model's message into valid json, and then that json is translated into valid tool calls to be invoked."

**Setup**:
1. Install/run Ollama
2. Pull `ollama pull mistral-nemo` (default interpreter)
3. Override: `GOOSE_TOOLSHIM_OLLAMA_MODEL=llama3.2`
4. Increase context: `OLLAMA_CONTEXT_LENGTH=32768 ollama serve`
5. Enable shim: `GOOSE_TOOLSHIM=1`

**Launch**:
```bash
GOOSE_TOOLSHIM=1 GOOSE_TOOLSHIM_OLLAMA_MODEL=llama3.2 cargo run --bin goose session
```

Status: experimental, "behavior and configuration may change in future releases."

### 12.2 Remote Access

Two channels:
- Mobile app
- Telegram gateway

URLs:
- `/docs/experimental/remote-access/mobile-access`
- `/docs/experimental/remote-access/telegram-gateway`

### 12.3 VS Code Extension (`/docs/experimental/vs-code-extension`)

> "Interact with goose directly from VS Code via ACP."

ACP-based — same architectural path as Zed/JetBrains.

### 12.4 Using goose in ACP Clients (`/docs/guides/acp-clients`)

Not experimental per se (listed under guides), but mentioned in the experimental landing. Native integration with Zed:

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

ACP client manages multiple conversations, isolated state, mid-session model/mode switching, file read/write coordination.

> "MCP servers configured in the ACP client's `context_servers` are automatically available to goose."

Office Town extension installed once → available in Goose-via-Zed, Goose-via-JetBrains, Goose-via-VSCode, and standalone Goose.

---

## 13. Troubleshooting (`/docs/troubleshooting/`)

### 13.1 Desktop startup debugging (`/docs/troubleshooting/desktop-startup-debugging`)

**Startup diagnostics location** (per launch):
- macOS: `~/Library/Application Support/Goose/logs/startup/`
- Windows: `%APPDATA%\Goose\logs\startup\`
- Linux: `~/.config/Goose/logs/startup/`

Filename: `goosed-startup-YYYY-MM-DDTHH-MM-SS.sssZ-PID.json`

**Bug-report payload**:
- Newest startup file
- Goose version
- OS + version
- (Windows) `Report.wer` for `goosed.exe`

**Key fields**:
- `childExitCode` / `childExitSignal` — backend exit
- `certFingerprintSeen` — TLS stage reached
- `healthCheckSucceeded` — backend ready
- `stderrTail` — recent backend output
- `events` — chronological steps

**Windows crash locations**:
- Event Viewer → Windows Logs → Application
- Reliability Monitor → View technical details
- `%LOCALAPPDATA%\Microsoft\Windows\WER\ReportArchive\`
- `%LOCALAPPDATA%\Microsoft\Windows\WER\ReportQueue\`

### 13.2 Diagnostics + Reporting (`/docs/troubleshooting/diagnostics-and-reporting`)

**Generate diagnostics bundle**:
```bash
goose session list                                            # find session ID
goose session diagnostics --session-id <id>                   # basic
goose session diagnostics                                     # interactive
goose session diagnostics --session-id <id> -o path/file.zip  # custom path
```

**Bundle contents** (`diagnostics_{session_id}.zip`):
- `logs/` — application JSONL logs
- `session.json` — conversation history
- `config.yaml` — user config
- `system.txt` — OS + app version

**Bug-report URL**: `https://github.com/aaif-goose/goose/issues/new?template=bug_report.md`

Goose Desktop's `Ask goose` button (visible on certain errors) sends error details back to the assistant for diagnostic suggestions.

### 13.3 Known issues (`/docs/troubleshooting/known-issues`) — top recurring categories

| Issue | Fix |
|---|---|
| Goose modifies files | Use version control; stage personal edits; keep Goose changes unstaged |
| Loop / unresponsive | Hold Ctrl+C; start new session; break tasks smaller |
| Long-running commands (npm run dev) hang | Customize shell via `GOOSE_TERMINAL` |
| Context length exceeded | Smaller chunks, `.goosehints`, message queue |
| Ollama provider | Install Ollama first; DeepSeek lacks tool calling (use qwen2.5 with extensions) |
| Rate limit 429 | Use provider with built-in rate limiting |
| Hermit errors (macOS) | `sudo rm -rf ~/Library/Caches/hermit` |
| API errors | Check credits; re-run `goose configure` |
| GitHub Copilot config (containers) | `GOOSE_DISABLE_KEYRING=1` |
| Keyring fails | File-based fallback auto-engaged; force with `GOOSE_DISABLE_KEYRING` |
| Node on Windows | Create symlink from `C:\Program Files\nodejs\` |
| Malicious package detection FP | Verify via OSV DB |
| macOS perms | `chmod u+rw ~/.config` |
| Ollama on WSL | Use WSL IP (from `ip route show`), not localhost |
| Corporate proxy | `HTTPS_PROXY` env var |
| Airgapped | Symlink custom command names (`runuv`, `runnpx`) to bypass Hermit shims |

### 13.4 Logs (`/docs/guides/logs`)

**Storage**:

| What | macOS/Linux | Windows |
|---|---|---|
| Command history | `~/.config/goose/history.txt` | `%APPDATA%\Block\goose\data\history.txt` |
| Session DB | `~/.local/share/goose/sessions/sessions.db` | `%APPDATA%\Block\goose\data\sessions\sessions.db` |
| System logs | `~/.local/state/goose/logs/` | `%APPDATA%\Block\goose\data\logs\` |
| Desktop logs | `~/Library/Application Support/Goose/logs/main.log` | `%APPDATA%\Block\goose\logs\main.log` |

CLI logs in `cli/YYYY-MM-DD/` subdirs, **auto-deleted after 2 weeks**.
Server logs in `server/` subdirs, **auto-deleted after 2 weeks**.
LLM request logs: rotating `llm_request.0.jsonl` to `llm_request.9.jsonl` (10 most recent).

**Privacy** (verbatim): "all goose log files are stored locally" — "these logs are never sent to external servers or third parties."

---

## 14. MCP-spec touchpoints (Elicitation, Roots, Sampling, MCP UI / MCP Apps)

### 14.1 Elicitation (`/docs/guides/mcp-elicitation`)

> "MCP Elicitation allows goose to pause and ask you for specific information when an extension needs it."

Auto-enabled. Extensions request form-mode input via MCP spec. Desktop renders forms inline; CLI renders terminal prompts.

**Timeout**: 5 minutes. If unanswered, "the request is cancelled and goose will continue without the information."

### 14.2 Roots (`/docs/guides/mcp-roots`)

> "MCP Roots lets goose share your session working directory with roots-aware MCP extensions."

Single root per session = current working dir. Goose notifies extensions on change.

Desktop: change via clicking the current-directory display at chat bottom.
CLI: session root = launch directory. Resuming may prompt user to return to original dir.

**Office Town implication**: An MCP server can read the root to scope file operations. We don't need to ask Goose "where are we" — we ask the MCP roots API.

### 14.3 Sampling (`/docs/guides/mcp-sampling`)

> "MCP Sampling is a Model Context Protocol feature that enables extensions to request AI assistance directly."

> "Any MCP server extension that supports sampling will automatically have access to the LLM that goose is using."

**No setup required**. Your MCP server doesn't need its own API key — it asks Goose's host LLM. Use cases: smart documentation, intelligent search ranking, database analyzers with optimization recommendations.

**Office Town design opportunity**: When a user asks "rewrite this page in a friendlier tone", Office Town's MCP server could fire a `sampling/createMessage` to Goose's LLM with the current content + tone instruction, get a rewrite, and return it — without us shipping our own LLM connection.

### 14.4 MCP UI vs MCP Apps (`/docs/guides/interactive-chat/mcp-ui`, `/docs/tutorials/building-mcp-apps`)

**MCP UI** (legacy): "an earlier specification for interactive UIs that renders content embedded in your chat."

**MCP Apps** (current, experimental but recommended for new work):
> "Let MCP servers return interactive UIs that render directly inside the goose chat interface, rather than responding with text alone."

Apps are sandboxed iframes. Communication = JSON-RPC 2.0 over `postMessage`.

**Metadata structure**:
```javascript
_meta: {
  ui: {
    resourceUri: "ui://mcp-app-demo/main"
  }
}
```

**Resource MIME type**: `text/html;profile=mcp-app`

**Key methods**:
- `ui/initialize`
- `ui/message` — send text to chat
- `ui/notifications/host-context-changed`
- `ui/notifications/size-changed`
- `ui/notifications/initialized`

**CSP control**:
```javascript
csp: {
  connectDomains: [],    // fetch/XHR
  resourceDomains: [],   // scripts/styles/images
  frameDomains: [],      // nested iframes
  baseUriDomains: []
}
```

**Permissions API**:
```javascript
permissions: {
  camera: true,
  microphone: true,
  geolocation: true,
  clipboardWrite: true
}
```

User retains final consent control.

**Office Town implication**: A "view wiki page" tool could return an MCP App that renders the page with edit affordances inline in Goose's chat. Goose users see the page; clicking "edit" sends a `ui/message` back to chat to trigger the edit tool.

---

## 15. Smart context management (`/docs/guides/sessions/smart-context-management`)

### 15.1 Core terms

- **Context length** — conversation history the LLM can consider
- **Context limit** — max tokens the model processes
- **Turn** — one prompt-response cycle

### 15.2 Auto-compaction

- Triggers at **80% capacity by default**
- Customize: `GOOSE_AUTO_COMPACT_THRESHOLD=0.8`
- Tool-output handling: summarizes older outputs in background when >10 tool calls; keeps recent ones full-detail. Configure with `GOOSE_TOOL_CALL_CUTOFF=10`.

### 15.3 Manual compaction

- CLI: `/summarize`
- Desktop: click "Compact now" in token indicator

### 15.4 Strategies (CLI)

`GOOSE_CONTEXT_STRATEGY`:
- `summarize` — condense while preserving key points
- `truncate` — remove oldest messages
- `clear` — start fresh
- `prompt` — let user choose per instance

Desktop = summarization only.

### 15.5 Max turns

`GOOSE_MAX_TURNS` — default 1000. "Prevents infinite loops and controls agent autonomy."

### 15.6 Context limit overrides

- `GOOSE_CONTEXT_LIMIT` — main model
- `GOOSE_PLANNER_CONTEXT_LIMIT` — planner model
- `GOOSE_INPUT_LIMIT` — ollama input prompt cap

---

## 16. Recipe storage & sharing (`/docs/guides/recipes/storing-recipes`, `session-recipes`)

### 16.1 File formats

| Where | Formats |
|---|---|
| CLI loads | `.yaml`, `.yml`, `.json` |
| CLI saves | `.yaml` only |
| Desktop loads | `.yaml`, `.yml`, `.json` |
| Desktop saves | `.yaml` |

### 16.2 Discovery order (`goose recipe list`)

1. Current directory (`./`)
2. `GOOSE_RECIPE_PATH` directories (colon-separated on Unix, semicolon on Windows)
3. Global library `~/.config/goose/recipes/`
4. Local project recipes `.goose/recipes/`
5. (Optional) `GOOSE_RECIPE_GITHUB_REPO` (`owner/repo`)

### 16.3 Sharing mechanisms

- **Recipe Library deeplinks** (Desktop button)
- **CLI**: `goose recipe deeplink <FILE>` — optionally with `-p key=value` to pre-fill params
- **File export**: copy `.yaml` file directly

### 16.4 Headless mode requirement

> "For headless (non-interactive) mode, the `prompt` field is required."

Example headless recipe:
```yaml
title: "Automated Code Quality Check"
prompt: "Perform a comprehensive code quality analysis..."
```

### 16.5 Structured output for automation

`response: json_schema:` forces the agent to call a `final_output` tool with JSON matching the schema. Validated against schema before return.

### 16.6 Automated retry logic

```yaml
retry:
  max_retries: 3
  checks:
    - command: "test -f output.json"
  on_failure:
    - command: "cleanup.sh"
```

If validation fails AND retries remain → cleanup runs → recipe restarts.

---

## 17. Headless mode (`/docs/tutorials/headless-goose`, `/docs/guides/running-tasks`)

### 17.1 Three input modes

```bash
goose run -t "your instructions"           # inline text
goose run -i instructions.md               # from file
echo "What is 2+2?" | goose run -i -        # stdin
```

### 17.2 Key flags

| Flag | Purpose |
|---|---|
| `-t, --text` | Inline instructions |
| `-i, --instructions` | From file (`-` for stdin) |
| `-s, --interactive` | Stay interactive after initial commands |
| `-n, --name` | Named session |
| `-r, --resume` | Resume existing session |
| `--no-session` | Don't persist (temp null path) |
| `--debug` | Full tool responses, params, paths |
| `--output-format json` | Structured complete output |
| `--output-format stream-json` | Real-time streaming JSON |
| `--with-builtin "x,y"` | Enable builtins |
| `--with-extension "ENV=v cmd args"` | stdio extension |
| `--with-streamable-http-extension URL` | HTTP MCP |
| `--provider <name> --model <id>` | Override defaults |
| `--recipe <path>` | Run recipe |
| `--params key=value` | Recipe params |

### 17.3 Headless-friendly env vars

```bash
export GOOSE_CONTEXT_STRATEGY=summarize
export GOOSE_MAX_TURNS=50
export GOOSE_MODE=auto
export GOOSE_DISABLE_SESSION_NAMING=true
```

### 17.4 Critical headless limitations (verbatim)

1. **No interactive clarification** — system cannot request approval or additional input
2. **Recipe prompt required** — missing prompts cause failure
3. **Tool permission constraints** — cannot prompt for risky ops; relies on defaults
4. **Auto context management** — applies configured strategy without user input
5. **Limited error recovery** — complex edge cases requiring human insight cannot be resolved

### 17.5 Cron pattern

```cron
0 2 * * * /usr/local/bin/goose run --no-session -t "Run comprehensive security audit, ..."
```

---

## 18. Remote Goose server (`/docs/guides/remote-goose-server`)

### 18.1 Server-side launch

```bash
export GOOSE_HOST=0.0.0.0
export GOOSE_PORT=3000
export GOOSE_TLS=true
export GOOSE_SERVER__SECRET_KEY=<shared-secret>
goosed
```

### 18.2 Security model

**TLS mandatory**: "goose Desktop will refuse to connect to a remote `goosed` server over plain HTTP."

**Certificate pinning**: Server generates self-signed cert; logs SHA-256 fingerprint as `GOOSED_CERT_FINGERPRINT=AA:BB:CC:DD:...`. Clients must configure exact fingerprint.

### 18.3 Desktop client config

Settings → goose Server:
- External URL (hostname:port)
- Shared secret (must match server)
- Certificate fingerprint (from server logs)

### 18.4 Office Town implication

If Office Town ever wants a fleet model — a single Goose instance running on a server with all org extensions enabled, many desktop clients connecting — this is the mechanism. We get TLS + cert pinning + secret auth for free.

---

## 19. Multi-model setup (`/docs/guides/multi-model/`, `/docs/guides/context-engineering/creating-plans`)

### 19.1 Planner + execution split

Different models for planning vs implementation:

```bash
export GOOSE_PLANNER_PROVIDER=openai
export GOOSE_PLANNER_MODEL=gpt-4o
export GOOSE_PROVIDER=anthropic
export GOOSE_MODEL=claude-sonnet-4-20250514
```

**Guidance** (verbatim): "GPT-4.1 tends to excel at strategic planning and breaking down complex tasks into clear, logical steps. On the other hand, Claude Sonnet 3.5 is particularly strong at writing clean, efficient code."

(Note: model names here from the docs may already be dated — verify against `models.flared.au` or live API per `rules/llm-patterns.md`.)

### 19.2 Plan mode (CLI only)

```
/plan Build a four-bedroom house
... clarifying Q&A ...
/endplan
```

`plan.md` prompt template controls the planner's behavior.

### 19.3 Fast model

`GOOSE_FAST_MODEL` — overrides provider's default fast model for auxiliary calls (e.g. session naming, compaction).

---

## 20. Environment variable reference (the canonical list)

Comprehensive list extracted from `/docs/guides/environment-variables`.

### 20.1 Model & provider

| Var | Purpose |
|---|---|
| `GOOSE_PROVIDER` | LLM provider (anthropic, openai, ollama, ...) |
| `GOOSE_MODEL` | Model ID |
| `GOOSE_FAST_MODEL` | Override provider's fast model for auxiliary calls |
| `GOOSE_TEMPERATURE` | 0.0-1.0 |
| `GOOSE_MAX_TOKENS` | Positive int |
| `GOOSE_PROVIDER__TYPE` | Provider implementation type |
| `GOOSE_PROVIDER__HOST` | Custom API endpoint |
| `GOOSE_PROVIDER__API_KEY` | Auth credentials |
| `GEMINI3_THINKING_LEVEL` | "low" or "high" |
| `CLAUDE_THINKING_TYPE` | "adaptive" / "enabled" / "disabled" |
| `CLAUDE_THINKING_BUDGET` | Tokens for reasoning (min 1024) |
| `GOOSE_PREDEFINED_MODELS` | JSON array of custom model configs |
| `GOOSE_PLANNER_PROVIDER` | Planner provider |
| `GOOSE_PLANNER_MODEL` | Planner model |
| `BEDROCK_MAX_RETRIES` | (6) |
| `BEDROCK_INITIAL_RETRY_INTERVAL_MS` | (2000) |
| `BEDROCK_BACKOFF_MULTIPLIER` | (2) |
| `BEDROCK_MAX_RETRY_INTERVAL_MS` | (120000) |
| `DATABRICKS_MAX_RETRIES` | (3) |
| `DATABRICKS_INITIAL_RETRY_INTERVAL_MS` | (1000) |
| `DATABRICKS_BACKOFF_MULTIPLIER` | (2) |
| `DATABRICKS_MAX_RETRY_INTERVAL_MS` | (30000) |

### 20.2 Session

| Var | Purpose |
|---|---|
| `GOOSE_CONTEXT_STRATEGY` | summarize/truncate/clear/prompt |
| `GOOSE_MAX_TURNS` | Max consecutive turns without user input |
| `GOOSE_GATEWAY_MAX_TURNS` | Override for gateway sessions |
| `GOOSE_SUBAGENT_MAX_TURNS` | (25) |
| `GOOSE_MAX_BACKGROUND_TASKS` | (5) |
| `CONTEXT_FILE_NAMES` | JSON array (default `[".goosehints"]`) |
| `GOOSE_DISABLE_SESSION_NAMING` | "1"/"true" |
| `GOOSE_DISABLE_TOOL_CALL_SUMMARY` | "1"/"true" |
| `GOOSE_PROMPT_EDITOR` | "vim", "code --wait", etc. |
| `GOOSE_CLI_THEME` | "light"/"dark"/"ansi" |
| `GOOSE_CLI_LIGHT_THEME` | bat theme (default "GitHub") |
| `GOOSE_CLI_DARK_THEME` | bat theme (default "zenburn") |
| `GOOSE_CLI_NEWLINE_KEY` | (default "j" for Ctrl+J) |
| `GOOSE_CLI_SHOW_THINKING` | Reasoning display |
| `GOOSE_RANDOM_THINKING_MESSAGES` | true/false |
| `GOOSE_CLI_SHOW_COST` | Display cost estimates |
| `GOOSE_MAX_CODE_BLOCK_LINES` | (50) |
| `GOOSE_TRUNCATED_SHOW_LINES` | (20) |
| `GOOSE_NO_CODE_TRUNCATION` | Disable truncation |
| `GOOSE_AUTO_COMPACT_THRESHOLD` | (0.8) |
| `GOOSE_TOOL_CALL_CUTOFF` | Tool calls full-detail (10) |
| `GOOSE_MOIM_MESSAGE_TEXT` | Persistent text every turn |
| `GOOSE_MOIM_MESSAGE_FILE` | File path for persistent (64KB max) |
| `GOOSE_CONTEXT_LIMIT` | Override main model context |
| `GOOSE_INPUT_LIMIT` | Override ollama input |
| `GOOSE_PLANNER_CONTEXT_LIMIT` | Override planner |

### 20.3 Tools

| Var | Purpose |
|---|---|
| `GOOSE_MODE` | auto/approve/chat/smart_approve |
| `GOOSE_TOOLSHIM` | Enable tool-call interpretation |
| `GOOSE_TOOLSHIM_OLLAMA_MODEL` | Tool interpreter model |
| `GOOSE_CLI_MIN_PRIORITY` | Tool output verbosity (0.0-1.0) |
| `GOOSE_CLI_TOOL_PARAMS_TRUNCATION_MAX_LENGTH` | Param display chars (40) |
| `GOOSE_DEBUG` | Full param display |
| `GOOSE_SEARCH_PATHS` | JSON array of PATH dirs |
| `GOOSE_SHELL` | Shell executable |
| `GOOSE_EDITOR_API_KEY` | Enhanced code editing |
| `GOOSE_EDITOR_HOST` | Enhanced code editing |
| `GOOSE_EDITOR_MODEL` | Enhanced code editing |

### 20.4 Security / privacy

| Var | Purpose |
|---|---|
| `GOOSE_ALLOWLIST` | URL of YAML allowlist |
| `GOOSE_DISABLE_KEYRING` | Force file-based secrets |
| `SECURITY_PROMPT_ENABLED` | Prompt-injection detection |
| `SECURITY_PROMPT_THRESHOLD` | (0.8) |
| `SECURITY_PROMPT_CLASSIFIER_ENABLED` | ML detection |
| `SECURITY_PROMPT_CLASSIFIER_ENDPOINT` | Classifier URL |
| `SECURITY_PROMPT_CLASSIFIER_TOKEN` | Classifier auth |
| `GOOSE_TELEMETRY_ENABLED` | Usage data |
| `GOOSE_SANDBOX` | macOS sandbox |
| `GOOSE_SANDBOX_PROTECT_FILES` | (true) |
| `GOOSE_SANDBOX_ALLOW_IP` | IP allowlist |
| `GOOSE_SANDBOX_BLOCK_LOOPBACK` | Loopback policy |
| `GOOSE_SANDBOX_ALLOW_SSH` | SSH policy |
| `GOOSE_SANDBOX_GIT_HOSTS` | Git host allowlist |
| `GOOSE_SANDBOX_SSH_ALL_HOSTS` | SSH any-host toggle |
| `GOOSE_SANDBOX_BLOCK_RAW_SOCKETS` | SOCK_RAW policy |
| `GOOSE_SANDBOX_BLOCK_TUNNELING` | Tunneling tools block |

### 20.5 Network

| Var | Purpose |
|---|---|
| `GOOSE_OAUTH_CALLBACK_PORT` | Fixed callback port |
| `HTTP_PROXY` | HTTP proxy URL |
| `HTTPS_PROXY` | HTTPS proxy URL (takes precedence) |
| `NO_PROXY` | Bypass list |

### 20.6 Observability

| Var | Purpose |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector |
| `OTEL_EXPORTER_OTLP_{SIGNAL}_ENDPOINT` | Per-signal override |
| `OTEL_{SIGNAL}_EXPORTER` | otlp/console/none |
| `OTEL_SDK_DISABLED` | Disable OTel |
| `OTEL_SERVICE_NAME` | Service name |
| `OTEL_RESOURCE_ATTRIBUTES` | Resource attrs |
| `LANGFUSE_PUBLIC_KEY` | Langfuse |
| `LANGFUSE_SECRET_KEY` | Langfuse |
| `LANGFUSE_URL` | Langfuse |
| `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` | Langfuse alt |
| `LANGFUSE_INIT_PROJECT_SECRET_KEY` | Langfuse alt |

### 20.7 Server

| Var | Purpose |
|---|---|
| `GOOSE_HOST` | Bind interface (127.0.0.1) |
| `GOOSE_PORT` | (3000) |
| `GOOSE_TLS` | (true) |
| `GOOSE_SERVER__SECRET_KEY` | Shared secret |

### 20.8 Recipes

| Var | Purpose |
|---|---|
| `GOOSE_RECIPE_PATH` | Colon/semicolon-separated recipe dirs |
| `GOOSE_RECIPE_GITHUB_REPO` | "owner/repo" |
| `GOOSE_RECIPE_RETRY_TIMEOUT_SECONDS` | Global retry timeout |
| `GOOSE_RECIPE_ON_FAILURE_TIMEOUT_SECONDS` | On-failure timeout |

### 20.9 Dev/test

| Var | Purpose |
|---|---|
| `GOOSE_PATH_ROOT` | Override root for all data/config (absolute) |

### 20.10 Variables Goose SETS (for extensions to read)

| Var | Purpose |
|---|---|
| `GOOSE_TERMINAL` | "1" when goose runs a command |
| `AGENT` | "goose" — cross-tool compat |
| `AGENT_SESSION_ID` | Current session ID — readable by extensions/shell |

**Office Town implication**: Our shell-out hooks/scripts can read `AGENT_SESSION_ID` to correlate logs back to the Goose session. `AGENT=goose` lets shared scripts know they're being run by Goose vs Claude Code.

---

## 21. CLI command reference (canonical)

### 21.1 Top-level commands

```bash
goose --help
goose --version
goose configure              # interactive setup
goose info [-v]              # version, paths, settings
goose update [--canary] [--reconfigure]
goose completion [bash|zsh|fish|nu|powershell|elvish]
```

### 21.2 Sessions

```bash
goose session -n my-project                  # new
goose session --resume -n my-project         # resume by name
goose session --resume --session-id 20251108_2
goose session --resume --fork --name x       # fork
goose session --with-extension "cmd"
goose session --with-builtin developer
goose session --debug --max-turns 25

goose session list [--format json|--ascending|-w <dir>|--limit N]
goose session remove [--session-id ID | -n name | -r regex]
goose session export [-n name --format markdown|json|yaml -o file]
goose session diagnostics [--session-id ID | -n name -o file.zip]
```

### 21.3 Tasks

```bash
goose run --instructions plan.md
goose run --recipe recipe.yaml [--interactive] [--params k=v]
goose run --no-session -i instructions.txt
goose run --provider X --model Y -t "prompt"
```

### 21.4 Recipes

```bash
goose recipe deeplink my-recipe.yaml [-p k=v]
goose recipe list [--verbose]
goose recipe open my-recipe
goose recipe validate my-recipe.yaml
```

### 21.5 Plugins

```bash
goose plugin install <git-url> [--auto-update]
goose plugin update <plugin-name>
```

### 21.6 Schedule (cron-style recipe automation)

```bash
goose schedule add --schedule-id daily-report \
                   --cron "0 0 9 * * *" \
                   --recipe-source ./recipes/daily-report.yaml
goose schedule list
goose schedule sessions --schedule-id daily-report -l 10
goose schedule run-now --schedule-id daily-report
goose schedule remove --schedule-id daily-report
```

### 21.7 MCP / ACP

```bash
goose mcp "Google Drive"   # run named MCP server
goose acp                   # run as ACP server (stdio JSON-RPC)
```

### 21.8 Projects

```bash
goose project / goose p       # last project
goose projects / goose ps     # choose
```

### 21.9 Shell integration

```bash
@goose create a python script to process these files
@g how do I fix these permission denied errors?
```

### 21.10 Slash commands (in-session)

| Cmd | Purpose |
|---|---|
| `/?` `/help` | Help |
| `/builtin <names>` | Add builtins (CSV) |
| `/clear` | Clear chat history |
| `/endplan` | Exit plan mode |
| `/exit` `/quit` | End session |
| `/extension <cmd>` | Add stdio extension |
| `/mode <name>` | auto/approve/chat/smart_approve |
| `/plan <message>` | Plan + approval |
| `/prompt <n>` | Execute prompts |
| `/prompts [--extension <name>]` | List prompts |
| `/recipe [filepath]` | Generate recipe |
| `/compact` `/summarize` | Manual compaction |
| `/r` | Toggle full tool output |
| `/skills` | List skills |
| `/t` | Toggle theme; `/t <name>` to set |

### 21.11 Keyboard shortcuts

- **Ctrl+C** — clear line / interrupt / exit
- **Ctrl+J** — newline (customizable via `GOOSE_CLI_NEWLINE_KEY`)
- **Cmd+↑/↓** — command history
- **Ctrl+R** — reverse history search

---

## 22. Office Town integration vectors — synthesis

Combining everything above, here's how Office Town can integrate with Goose at multiple layers:

### 22.1 Primary path: MCP extension

Office Town is an MCP server (stdio or streamable_http). Goose loads it via:
- `goose configure` → Add Extension → Remote (Streamable HTTP) → enter URL
- Deeplink: `goose://extension?url=https://officetown.au/mcp&type=streamable_http&...`
- Config file: `~/.config/goose/config.yaml` `extensions.office_town.type: streamable_http`

This makes Office Town's tools available everywhere Goose runs: Desktop, CLI, Zed-via-ACP, headless, scheduled, remote-goosed.

### 22.2 Plugin path: ship skills + hooks as Open Plugin

A `goose-office-town-plugin` git repo:

```
goose-office-town-plugin/
├── plugin.json
├── skills/
│   ├── install-office-town/SKILL.md
│   ├── audit-site/SKILL.md
│   └── rebuild-css/SKILL.md
└── hooks/
    └── hooks.json     # auto-sync wiki on file edits
```

Install: `goose plugin install https://github.com/jezweb/goose-office-town-plugin.git`

Skills become invokable as `office-town:install`, `office-town:audit`, etc.

### 22.3 Recipe distribution

A `~/.config/goose/recipes/` library with Office Town workflows:

- `office-town/new-site.yaml` — guided setup
- `office-town/seo-audit.yaml` — analysis recipe with sub_recipes
- `office-town/migrate-from-wordpress.yaml` — long-form recipe

Share via `goose recipe deeplink` URLs in our marketing assets.

### 22.4 MCP Apps surface for visual editing

Office Town's "edit page" tool returns an MCP App (inline HTML editor with CSP-allowed list of our domains). User edits in chat, clicks save, app sends `ui/message` back to invoke the actual update tool.

### 22.5 Memory + persistent instructions

We document a recommended `GOOSE_MOIM_MESSAGE_FILE=~/office-town/style-guide.md` so the user's brand voice/standards inject every turn — this is more reliable than skills/hints for "always do X".

### 22.6 Allowlist-compatible

Org admins using `GOOSE_ALLOWLIST` to control extensions can add Office Town with a one-line YAML:

```yaml
extensions:
  - id: office-town
    command: streamable_http https://officetown.au/mcp
```

(Note: allowlist matching is by `command`; verify in practice with streamable_http extensions — may need `id`-only matching.)

### 22.7 Adversary-mode-friendly tool naming

Tools like `delete_page` clearly state intent, naturally trigger Adversary review with rules like "BLOCK if deleting more than one page at a time without explicit confirmation."

### 22.8 No custom-distro needed

Office Town does NOT need to be a Goose fork. The standard MCP+plugin+recipe surface covers every UX we'd want. **Confirms the "parked" decision on custom distros remains correct.**

---

## 23. Open questions / things to verify in source

Topics where the docs are thin and we should read Goose's Rust source:

1. **Streamable-HTTP MCP handshake details** — how Goose initiates the session, what headers, retry on disconnect, auth surface (Bearer? mTLS? cookie?). The docs don't spell this out. **Action**: read `crates/goose/src/extensions/streamable_http.rs` or equivalent.

2. **Extension trait full signature** — the trait fields (`name`, `description`, etc.) are listed but exact Rust signatures aren't. **Action**: read `crates/goose/src/extensions/mod.rs`.

3. **SourceType enum** — Office Town brief mentioned `SourceType::Project / Agent / Skill / Recipe`. This term doesn't appear in docs. Likely internal — **action**: grep the Goose source.

4. **Plugin auto-update mechanism** — `goose plugin install --auto-update` is documented but the actual cadence/git-pull behavior isn't. **Action**: read plugin manager source.

5. **Open Plugin Spec status** — docs treat it as the canonical format (`plugin.json` + skills/hooks) but don't explicitly call out a "spec version" or breaking-change policy. **Action**: check the Goose repo for an `OPEN_PLUGIN_SPEC.md` or similar.

6. **MCP sampling token budget / cost attribution** — when an extension uses `sampling/createMessage`, who pays for the tokens? Likely the user (it's their provider). **Action**: verify; matters for Office Town if we frequently sample.

7. **Subagent extension isolation** — docs say subagents inherit extensions but can restrict. Mechanism for restricting from a recipe vs prompt? **Action**: check recipe schema for `subagent.extensions: [...]`.

---

## 24. TL;DR — what every Office Town agent should know

1. **Goose is MCP-native**. Our MCP server IS the integration. No Rust trait to implement.
2. **Three install paths**: stdio command, streamable_http URL, deeplink. We support streamable_http via Worker.
3. **Tools should read like prompts** — error messages instruct the LLM how to recover.
4. **Skills + recipes + hooks are the user-facing contract surface**. Plugins bundle them.
5. **Naming conventions matter for permissions**: `get_/list_/search_` (read), `create_/update_/delete_` (write triggers approval prompts).
6. **Single root per session** — we read working dir from MCP roots, not configuration.
7. **Sampling is free** — extensions can use Goose's host LLM via `sampling/createMessage`.
8. **Memory is statically-injected**, not retrieved — keep our memory writes lean.
9. **Persistent instructions** (MOIM, 64KB cap) are stronger than `.goosehints` for "always do X" guardrails.
10. **Custom distros remain a viable but unnecessary path** for us — MCP + plugin + recipe covers our needs.
11. **Subagents are sequential by default, parallel on keyword trigger**, sandboxed by max_turns+timeout, no recursive spawning.
12. **Code Mode users won't see binary tool results** — always include a text equivalent.
13. **Allowlist is by command string** — keep our install command stable so org allowlists don't break.
14. **Adversary mode is opt-in** (existence of `adversary.md`) — design tool names so a sensible default policy reads naturally.
15. **Headless mode requires `prompt` field on recipes** — always include one for automation use.

---

**End of architecture deep dive.**

Last updated: 2026-05-28 — built from full sitemap crawl of goose-docs.ai/docs/ (≈30 pages fetched). Re-verify URLs in §0 before quoting paths in client-facing material.
