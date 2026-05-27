# Goose Knowledge Base — Recipes, Subrecipes, Tools, Config, CLI, Slash Commands, Hooks, Plugins, Prompt Templates

**Source:** https://goose-docs.ai/docs/ — captured 2026-05-28
**Domain:** Recipes + Subrecipes + Tool management + Config + CLI + Slash commands + Hooks + Plugins + Prompt Templates
**Purpose:** Build Office Town as a proper Goose plugin. Verify our `commands/*.yaml`, `skills/*/SKILL.md`, `agents/`, `hooks/` shapes conform.

---

## 0. Critical URL Map (Goose docs site)

Real URLs (note nested under category folders, NOT flat under `/docs/guides/`):

| Topic | URL |
|-------|-----|
| Custom Slash Commands | `/docs/guides/context-engineering/slash-commands` |
| Hooks | `/docs/guides/context-engineering/hooks` |
| Plugins | `/docs/guides/context-engineering/plugins` |
| Prompt Templates | `/docs/guides/context-engineering/prompt-templates` |
| Persistent Instructions | `/docs/guides/context-engineering/using-persistent-instructions` |
| gooseignore | `/docs/guides/context-engineering/using-gooseignore` |
| goosehints | `/docs/guides/context-engineering/using-goosehints` |
| Agent Skills | `/docs/guides/context-engineering/using-skills` |
| Subagents | `/docs/guides/context-engineering/subagents` |
| Memory Extension (MCP) | `/docs/mcp/memory-mcp` |
| Research→Plan→Implement | `/docs/tutorials/rpi` |
| Reusable Recipes | `/docs/guides/recipes/session-recipes` |
| Recipe Reference | `/docs/guides/recipes/recipe-reference` |
| Saving Recipes | `/docs/guides/recipes/storing-recipes` |
| Subrecipes | `/docs/guides/recipes/subrecipes` |
| Tool Permissions | `/docs/guides/managing-tools/tool-permissions` |
| Adjust Tool Output | `/docs/guides/managing-tools/adjust-tool-output` |
| Code Mode | `/docs/guides/managing-tools/code-mode` |
| Goose Permissions | `/docs/guides/managing-tools/goose-permissions` |
| Managing Projects | `/docs/guides/managing-projects` |
| Updating Goose | `/docs/guides/updating-goose` |
| CLI Commands | `/docs/guides/goose-cli-commands` |
| CLI Providers | `/docs/guides/cli-providers` |
| ACP Providers | `/docs/guides/acp-providers` |
| Configuration Files | `/docs/guides/config-files` |
| Environment Variables | `/docs/guides/environment-variables` |
| Quick Tips | `/docs/guides/tips` |
| Security | `/docs/guides/security/prompt-injection-detection` |

The Goose project relocated from `block.github.io/goose` to `goose-docs.ai`. URL slugs Jez listed (`/guides/recipes` etc.) were page TITLES, not paths.

---

## 1. CUSTOM SLASH COMMANDS

### File path
Configured in `~/.config/goose/config.yaml` under the `slash_commands:` key.

### Exact schema (verbatim)

```yaml
slash_commands:
  - command: "run-tests"
    recipe_path: "/path/to/recipe.yaml"
  - command: "daily-report"
    recipe_path: "/Users/me/.local/share/goose/recipes/report.yaml"
```

### Fields
| Field | Type | Notes |
|---|---|---|
| `command` | string | Invocation name **without** leading `/` |
| `recipe_path` | string | Absolute filesystem path to the recipe YAML |

### Invocation
- Trigger: type `/run-tests` at start of message
- One optional parameter: `/translator where is the library` — extra parameters require defaults set in the recipe
- Names must be unique, no spaces, case-insensitive (`/Bug == /bug`)
- Cannot conflict with built-ins: `/recipe`, `/compact`, `/help`, `/builtin`, `/clear`, `/exit`, `/quit`, `/extension`, `/mode`, `/plan`, `/skills`, `/t`, `/?`

### Execution behaviour
> "The recipe's instructions and prompt fields are sent to your model and loaded into the conversation, but not displayed in chat."

### Office Town impact
- Office Town's `commands/<name>.yaml` files must be REGISTERED in user's `~/.config/goose/config.yaml` under `slash_commands:` to become `/name` invocations.
- The plugin install flow (or INSTALL.md) needs to either:
  1. Have user manually paste the slash_commands block, or
  2. Use a `goose plugin install` flow that auto-registers commands (verify if Open Plugins does this — docs don't make this explicit).
- The recipe files themselves go to `~/.config/goose/recipes/` (global) or `<project>/.goose/recipes/` (project).

---

## 2. HOOKS

### Event types (the full list)

- `SessionStart` — session begins
- `SessionEnd` — session concludes
- `Stop` — goose receives stop event
- `UserPromptSubmit` — user submits a prompt
- `PreToolUse` — before goose executes a tool
- `PostToolUse` — after a tool succeeds
- `PostToolUseFailure` — after a tool fails
- `BeforeReadFile` — before goose reads a file
- `AfterFileEdit` — after goose successfully edits a file
- `BeforeShellExecution` — before goose runs a shell command
- `AfterShellExecution` — after goose successfully runs a shell command

### File paths (CRITICAL — `.agents/` not `.goose/`)

| Scope | Path |
|---|---|
| User | `~/.agents/plugins/<plugin-name>/` |
| Project | `<project>/.agents/plugins/<plugin-name>/` |

### Required structure (verbatim)

```
plugin-name/
├── plugin.json
├── hooks/
│   └── hooks.json
└── scripts/
    └── [your scripts]
```

### `hooks.json` schema (verbatim)

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "regex_pattern",
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

### Fields
| Field | Notes |
|---|---|
| `matcher` | Optional regex against event's matcher target (e.g. `developer__shell`) |
| `hooks` | Required array of actions |
| `type` | Defaults to `command` |
| `command` | Shell command (run via `sh -c`) |
| `timeout` | Seconds, default 30 |

### Payload via stdin (JSON)

```json
{
  "event": "PostToolUse",
  "session_id": "abc-123",
  "matcher_context": "developer__shell",
  "tool_name": "developer__shell",
  "tool_input": { "command": "rg TODO" },
  "working_dir": "/Users/you/project"
}
```

### Environment variables passed to hook
- `PLUGIN_ROOT` — points to the plugin directory; scripts use `${PLUGIN_ROOT}/scripts/foo.sh`

### Failure behaviour
> "Hook failures are logged but do not crash goose or the tool that triggered the hook."

### Office Town impact
- Our hooks directory should be `office-town-plugin/hooks/hooks.json`, NOT a folder of separate hook files.
- Hook scripts go in `office-town-plugin/scripts/`, referenced via `${PLUGIN_ROOT}/scripts/<file>`.
- Verify our current `office-town-plugin/hooks/` directory structure — most likely needs flattening to a single `hooks.json` + scripts/ siblings.

---

## 3. PLUGINS (Open Plugin Spec)

### Plugin manifest — `plugin.json` (verbatim)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Reusable skills and hooks for my team"
}
```

Alt locations supported (manifest can live at any of):
- `<plugin-root>/plugin.json`
- `<plugin-root>/.plugin/plugin.json`
- `<plugin-root>/.goose-plugin/plugin.json`

### Directory structure (verbatim)

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

### Plugin contains
- `skills/<skill-name>/SKILL.md` — Agent skills (frontmatter described in section 5)
- `hooks/hooks.json` — Lifecycle hook bindings
- `scripts/` — Referenced via `${PLUGIN_ROOT}` from hooks

### Skill namespacing in plugins
- `plugin-name:skill-name` (e.g. `office-town:wordpress`)

### Install / update / disable

| Operation | Command |
|---|---|
| Install | `goose plugin install https://github.com/example/my-goose-plugin.git` |
| Auto-update | `goose plugin install --auto-update <url>` |
| Manual update | `goose plugin update <plugin-name>` |
| Disable | Add name to `disabledPlugins` array in `~/.config/goose/settings.json` |

### Plugin install locations
- User scope: `~/.agents/plugins/<plugin-name>/`
- Project scope: `<project>/.agents/plugins/<plugin-name>/`

### Supported plugin formats
1. **Open Plugins** — full skills + hooks support
2. **Gemini extensions** — skills only (via `gemini-extension.json`)

### Office Town impact (CRITICAL)
- **Office Town is missing `plugin.json` at the root** — we MUST add one.
- Our directory should match: `plugin.json` + `skills/<name>/SKILL.md` + `hooks/hooks.json` + `scripts/`.
- Currently we have a `commands/` folder — this is NOT part of Open Plugin Spec. Commands are user-config-only (section 1). So `commands/` files are recipes the user copies/registers manually, not auto-installed via plugin.
- **The INSTALL.md flow needs to handle both**: `goose plugin install <url>` (installs skills + hooks under `~/.agents/plugins/office-town/`) AND a separate step to register slash commands in `~/.config/goose/config.yaml`.
- Naming with namespace: `office-town:wordpress`, `office-town:business` etc.

---

## 4. PROMPT TEMPLATES

### Storage location
- macOS/Linux: `~/.config/goose/prompts/`
- Windows: `%APPDATA%\Block\goose\config\prompts\`

### Templates

| Template | Purpose | Platform |
|---|---|---|
| `system.md` | Core role and response format | Desktop, CLI |
| `plan.md` | Plan creation with clarifying questions | CLI only |
| `compaction.md` | Conversation history summarization | Desktop, CLI |
| `permission_judge.md` | Tool operation analysis | Desktop, CLI |
| `recipe.md` | Recipe file generation | Desktop, CLI |
| `subagent_system.md` | Subagent system instructions | Desktop, CLI |
| `apps_create.md` | New app generation | Desktop only |
| `apps_iterate.md` | Existing app updates | Desktop only |

### Syntax (Jinja2)

- `{{ variable }}` — substitution
- `{% if condition %}...{% endif %}` — conditionals
- `{% for item in list %}...{% endfor %}` — loops
- Escape literals: `{{'{{variable}}'}}` (wrapped in single quotes)

### Behaviour
- Custom templates persist across updates
- Changes take effect in new sessions
- Desktop manages via Settings > Prompts; CLI edit files directly

### Office Town impact
- Prompt templates are user-customisations of Goose's system prompts. NOT directly relevant to plugin distribution, but Office Town could SHIP recommended templates the user could copy in.
- Don't include in plugin auto-install — these are personal preferences.

---

## 5. AGENT SKILLS

### Directory structure
```
~/.agents/skills/
└── code-review/
    └── SKILL.md
```

With supporting resources:
```
~/.agents/skills/
└── api-setup/
    ├── SKILL.md
    ├── setup.sh
    └── templates/
        └── config.template.json
```

### File path discovery order (CRITICAL)
1. `~/.agents/skills/` — Global
2. `.agents/skills/` — Project-scoped (current working directory)
3. `~/.agents/plugins/<plugin-name>/skills/` — Skills bundled with plugins
4. Legacy paths still supported: `.goose/skills/`, `.claude/skills/`, `~/.claude/skills/`

### `SKILL.md` frontmatter (verbatim)

```yaml
---
name: code-review
description: Comprehensive code review checklist for pull requests
---
```

Required fields: `name`, `description`. Body is markdown.

### Discovery
- Auto-loaded contextually when request matches description
- Explicit user reference: "Use the code-review skill"
- CLI `/skills` lists and loads them

### Plugin namespacing
- `plugin-name:skill-name` e.g. `office-town:wordpress`
- Use the full name when explicitly loading plugin-provided skills

### Office Town impact
- Confirm every `office-town-plugin/skills/<name>/SKILL.md` has correct frontmatter (just `name` + `description`).
- The discovery path when installed via plugin is `~/.agents/plugins/office-town/skills/<name>/SKILL.md` and skills auto-load with namespace `office-town:<name>`.

---

## 6. PERSISTENT INSTRUCTIONS (MOIM)

### Configuration — env vars only

| Variable | Purpose |
|---|---|
| `GOOSE_MOIM_MESSAGE_TEXT` | Literal text injected into working memory each turn |
| `GOOSE_MOIM_MESSAGE_FILE` | Path to file whose contents are injected each turn (supports `~/`) |

Both can be set simultaneously; concatenated.

### Behaviour
- Injected into MOIM (Model-Observed Internal Memory) every turn
- Cannot be "forgotten" as conversation grows (unlike `.goosehints`)
- Size limit: 64 KB with UTF-8 safe truncation
- Re-read fresh every turn from environment
- More effective than system prompts for critical guardrails
- Changes take immediate effect, no restart needed

### File format
Markdown supported. Example path: `~/.goose/guardrails.md`.

### Office Town impact
- Not a plugin concern, but Office Town's INSTALL.md could RECOMMEND setting `GOOSE_MOIM_MESSAGE_FILE` to point at a `~/.config/goose/office-town-guardrails.md` we ship.

---

## 7. GOOSEIGNORE

### File locations
- Global: `~/.config/goose/.gooseignore`
- Project: project root `.gooseignore`

### Syntax: gitignore-style

```
settings.json
*.pdf
backup/
**/credentials.json
!.env.example
```

### Defaults (when no .gooseignore exists)
- `**/.env`
- `**/.env.*`
- `**/secrets.*`

**Important:** these defaults DISAPPEAR once any `.gooseignore` file is created — must be manually re-added.

### Scope
- Currently only affects Developer extension tools
- Blocks: reading, modifying, deleting, shell-executing matched files

### Priority
1. Global patterns applied first
2. Local patterns applied second (can negate global)
3. Top-to-bottom, later overrides earlier

### Office Town impact
- Not directly relevant to plugin distribution. Could be a recommended INSTALL.md addition for sensitive projects.

---

## 8. MEMORY EXTENSION (MCP)

### Storage locations
| Scope | Path |
|---|---|
| Local (project) | `.goose/memory/` in CWD |
| Global (user) | `~/.config/goose/memory/` |

### Tools exposed (MCP tools)

1. `remember_memory(category, data, tags, is_global)` — Store with category, optional tags, scope flag
2. `retrieve_memories(category, is_global)` — Retrieve by category. Use `"*"` to retrieve all
3. `remove_memory_category(category, is_global)` — Remove all in category. Use `"*"` to clear all
4. `remove_specific_memory(category, memory_content, is_global)` — Remove single entry matching content

### Categorisation
- `category` — primary org unit (e.g. `development_standards`)
- `tags` — optional metadata prefixed with `#` (e.g. `#api`, `#typescript`, `#security`)
- `scope` — `is_global` boolean

### Trigger words
remember, forget, memory, save, remove memory, clear memory, search memory, find memory

### File format
**NOT documented in source material.** The Goose docs do not publish the on-disk schema for memory files. To replace Memory Extension, Office Town will need to either reverse-engineer the format from Goose source OR define our own and re-implement all 4 MCP tools with matching signatures.

### Office Town impact
- We are REPLACING this with our own R2-backed implementation.
- Must expose the same 4 tool names (`remember_memory`, `retrieve_memories`, `remove_memory_category`, `remove_specific_memory`) with matching parameter signatures so Goose's existing trigger-word UX works.
- Can keep `category`+`tags`+`is_global` as logical model.
- File format on R2 is our choice (docs don't constrain us).

---

## 9. RESEARCH → PLAN → IMPLEMENT (RPI)

### Workflow
Three+ phases, each in its own session:

1. **Research** — `/research_codebase "topic"` — spawns 3 parallel subagents (`find_files`, `analyze_code`, `find_patterns`). Output: `thoughts/research/YYYY-MM-DD-HHmm-topic.md`
2. **Plan** — `/create_plan "feature"` — reads research, asks clarifying questions, multiple options. Output: `thoughts/plans/YYYY-MM-DD-HHmm-description.md`
3. **Implement** — `/implement_plan "plan-path"` — executes phases sequentially, runs verification, updates checkboxes in plan file
4. **Iterate** (optional) — `/iterate_plan "plan-path" + feedback` — surgical updates only

### Install
```bash
mkdir -p ~/.config/goose/recipes/subrecipes
curl -sL .../rpi-research.yaml -o ~/.config/goose/recipes/rpi-research.yaml
curl -sL .../rpi-plan.yaml -o ~/.config/goose/recipes/rpi-plan.yaml
curl -sL .../rpi-implement.yaml -o ~/.config/goose/recipes/rpi-implement.yaml
curl -sL .../rpi-iterate.yaml -o ~/.config/goose/recipes/rpi-iterate.yaml
```

Then register slash commands: `research_codebase`, `create_plan`, `implement_plan`, `iterate_plan`.

### Office Town impact
- RPI is a published recipe pattern. Office Town could ship similar multi-recipe workflows (research/plan/implement-style) for business operations.
- The pattern of "subrecipes that run as parallel subagents" is exactly the model Office Town could use for e.g. parallel WordPress site audits.

---

## 10. REUSABLE RECIPES (`recipes/session-recipes`)

### File formats
`.yaml`, `.yml`, `.json` — CLI saves as `.yaml` only (despite reading JSON). Avoid `.yml` for cross-platform.

### Basic template (verbatim)

```yaml
# Required fields
version: 1.0.0
title: $title
description: $description
instructions: $instructions

# Optional fields
prompt: $prompt
extensions:
  - $extensions
activities:
  - $activities
settings:
  goose_provider: $provider
  goose_model: $model
  temperature: $temperature
retry:
  max_retries: $max_retries
  checks:
    - type: shell
      command: $validation_command
  on_failure: $cleanup_command
```

### Worked example (verbatim from docs)

```yaml
version: 1.0.0
title: "{{ project_name }} Code Review"
description: Automated code review for {{ project_name }} with {{ language }} focus
instructions: You are a code reviewer specialized in {{ language }} development.
prompt: |
  Apply the following standards:
  - Complexity threshold: {{ complexity_threshold }}
  - Required test coverage: {{ test_coverage }}%
  - Style guide: {{ style_guide }}
activities:
  - "Review {{ language }} code for complexity"
  - "Check test coverage against {{ test_coverage }}% requirement"
  - "Verify {{ style_guide }} compliance"
settings:
  goose_provider: "anthropic"
  goose_model: "claude-3-7-sonnet-latest"
  temperature: 0.7
parameters:
  - key: project_name
    input_type: string
    requirement: required
    description: name of the project
  - key: language
    input_type: string
    requirement: required
    description: language of the code
  - key: complexity_threshold
    input_type: number
    requirement: optional
    default: 20
    description: maximum allowed complexity
  - key: test_coverage
    input_type: number
    requirement: optional
    default: 80
    description: minimum test coverage threshold in percentage
  - key: style_guide
    input_type: string
    description: style guide name
    requirement: user_prompt
```

### Excluded from recipes (security)
- Global and local memory
- API keys and personal credentials
- System-level goose settings

---

## 11. RECIPE REFERENCE — FULL SCHEMA

### Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | string | No | Defaults to `"1.0.0"` |
| `title` | string | ✅ | Short name |
| `description` | string | ✅ | Detailed explanation |
| `instructions` | string | ✅* | Template (parameter substitution) |
| `prompt` | string | ✅* | Template (required for headless mode) |
| `extensions` | array | No | MCP servers and tools |
| `settings` | object | No | Model provider config |
| `parameters` | array | No | Dynamic inputs |
| `activities` | array | No | Desktop UI buttons / starter messages |
| `sub_recipes` | array | No | Subrecipe declarations |
| `response` | object | No | Structured output schema |
| `retry` | object | No | Automated retry config |

*At least one of `instructions` or `prompt` required.

### Extensions (verbatim)

```yaml
extensions:
  - type: stdio
    name: github-mcp
    cmd: github-mcp-server
    args: []
    env_keys:
      - GITHUB_PERSONAL_ACCESS_TOKEN
    timeout: 60
    bundled: true
    description: "GitHub MCP extension for repository operations"
    available_tools:
      - tool_name
```

**Extension types:** `stdio`, `builtin`, `platform`, `streamable_http`, `frontend`, `inline_python`

### Settings (verbatim)

```yaml
settings:
  goose_provider: "anthropic"
  goose_model: "claude-sonnet-4-20250514"
  temperature: 0.7
  max_turns: 50
```

### Parameters (verbatim)

```yaml
parameters:
  - key: language
    input_type: string
    requirement: required
    description: "Programming language to review"

  - key: max_files
    input_type: number
    requirement: optional
    default: "10"
    description: "Maximum files to process"

  - key: output_format
    input_type: select
    requirement: required
    description: "Output format"
    options:
      - json
      - markdown
      - csv

  - key: source_code
    input_type: file
    requirement: required
    description: "Path to source file"
```

- **input_type:** `string`, `number`, `boolean`, `date`, `file`, `select`
- **requirement:** `required`, `optional`, `user_prompt`

### Activities (verbatim)

```yaml
activities:
  - "message: **Welcome!** Here's what I can help with:"
  - "Review the current file for {{ focus }}"
  - "Generate unit tests"
```

Desktop-only. Supports parameter substitution.

### Response (structured output schema, verbatim)

```yaml
response:
  json_schema:
    type: object
    properties:
      summary:
        type: string
        description: "Brief summary"
      tasks_completed:
        type: number
        description: "Number of tasks finished"
      next_steps:
        type: array
        items:
          type: string
    required:
      - summary
      - tasks_completed
```

### Retry (verbatim)

```yaml
retry:
  max_retries: 3
  timeout_seconds: 30
  on_failure_timeout_seconds: 60
  checks:
    - type: shell
      command: "curl -f http://localhost:8080/health"
  on_failure: "systemctl stop web-service || killall web-service"
```

### Sub_recipes (verbatim)

```yaml
sub_recipes:
  - name: "security_scan"
    path: "./subrecipes/security-analysis.yaml"
    values:
      scan_level: "comprehensive"
      include_dependencies: "true"
    sequential_when_repeated: false
    description: "Performs security analysis"
```

### Templating
- Jinja-style: `{{ parameter_name }}`
- Escape literal: `{{'{{example}}'}}`
- Template inheritance:
  ```yaml
  {% extends "parent.yaml" %}
  {% block prompt %}Modified text{% endblock %}
  ```
- Built-in: `{{ recipe_dir }}` — references recipe directory

### Validation rules
- At least one of `instructions` or `prompt` required
- All template variables must have parameter definitions
- Optional parameters must have `default` values
- `file` parameters cannot have defaults
- `select` parameters must define `options`

### Office Town impact — CRITICAL
- Every `commands/<name>.yaml` Office Town ships MUST conform to this schema.
- We need `version`, `title`, `description`, AND (`instructions` OR `prompt`) at minimum.
- Verify all our commands have a top-level `version: 1.0.0` field.
- Verify any `{{ var }}` templates have matching `parameters[].key` entries.
- Verify any select-type params have `options:` arrays.
- Verify file-type params don't have `default:`.

---

## 12. SAVING / DISCOVERY OF RECIPES

### Storage locations
| Scope | Path |
|---|---|
| Global | `~/.config/goose/recipes/` |
| Project | `<working-dir>/.goose/recipes/` |

CLI default save: `./recipe.yaml`. Custom: `/recipe /path/to/my-recipe.yaml`.

### Format constraint
> "The CLI saves recipes as `.yaml` files. While the CLI can run recipes in `.json` format, it does not provide an option to save recipes as JSON."

Avoid `.yml` for cross-platform.

### Discovery order (CRITICAL)
`goose recipe list` searches in sequence:
1. Current directory (`.`)
2. Custom paths via `GOOSE_RECIPE_PATH` env var
3. Global library `~/.config/goose/recipes/`
4. Local project recipes `./.goose/recipes/`
5. GitHub repository if `GOOSE_RECIPE_GITHUB_REPO` set

### Management
- `goose recipe list` — list recipes
- `goose recipe list --verbose` — detailed
- `goose recipe list --format json` — automation
- `goose recipe deeplink <name>` — shareable URL
- `goose recipe open <name>` — open in editor
- `goose recipe validate <name>` — schema check

### Office Town impact
- For Office Town's commands to be discoverable via `goose recipe list`, they need to be in one of those 5 locations.
- **Best fit:** copy/symlink Office Town's `commands/*.yaml` into `~/.config/goose/recipes/office-town/` at install time.
- Alternative: tell users to set `GOOSE_RECIPE_PATH=~/Documents/office-town-plugin/commands` — simpler but doesn't transparently integrate.
- Alternative: publish recipes to a GitHub repo and have users set `GOOSE_RECIPE_GITHUB_REPO=jezweb/office-town-recipes`.

---

## 13. SUBRECIPES

### Sub_recipes schema (verbatim, expanded)

```yaml
sub_recipes:
  - name: "security_scan"
    path: "./subrecipes/security-analysis.yaml"
    values:
      scan_level: "comprehensive"
  - name: "quality_check"
    path: "./subrecipes/quality-analysis.yaml"
```

### Fields per entry
- `name` — unique identifier; used to generate the tool name
- `path` — relative/absolute path to the subrecipe file
- `values` (optional) — pre-set parameter values, ALWAYS passed
- `sequential_when_repeated` — boolean controlling parallel-vs-sequential when same subrecipe is invoked multiple times
- `description` — optional human-readable

### Parameter rules
- **Pre-set values** (in `values:`) — fixed, cannot be overridden at runtime
- **Context-based** — AI extracts from conversation context, including outputs from previous subrecipes
- Pre-set values take precedence

### Execution model
- Each subrecipe runs in **isolation** with its own session
- No conversation history or state shared between parent and subrecipe, or between subrecipes

### Office Town impact
- Office Town can compose complex workflows: e.g. a `commands/full-business-audit.yaml` that invokes `wordpress-audit`, `dns-audit`, `email-audit` as subrecipes in parallel.
- Subrecipe paths in our shipped commands should use the `{{ recipe_dir }}` built-in to remain portable.

---

## 14. TOOL PERMISSIONS

### Three permission levels
- **Always Allow** — safe, read-only ops (file reading, directory listing)
- **Ask Before** — state-changing ops (file writing, system commands)
- **Never Allow** — sensitive ops (credentials, deletions)

### Configure
- Desktop: Mode Toggle button → per-extension → per-tool dropdowns; OR Settings → Chat → Mode button
- CLI: `goose configure` → goose settings → Tool Permission → select extension → individual tools

### Key principle (verbatim)
> "Tool permissions work alongside goose permission modes. The mode sets the default behavior, while tool permissions let you override the behavior of specific tools."

### Performance guidance
> "Keep fewer than 25 total tools enabled across all extensions" for optimal performance.

### Office Town impact
- Office Town exposes many MCP tools. **Hit the 25-tool ceiling fast** if all packs are loaded simultaneously.
- This validates the existing "single Worker collapse" architecture decision — fewer extensions, fewer registered tools per session.
- Document recommended Always-Allow / Ask-Before tool classification per Office Town pack in INSTALL.md.

---

## 15. ADJUST TOOL OUTPUT

### Desktop
Settings > Chat > Response Styles:
- **Concise (default)** — tool calls collapsed by default
- **Detailed** — tool calls expanded

### CLI — `goose configure` → Adjust Tool Output
Three verbosity levels:
- **High Importance** — only critical output
- **Medium Importance** — medium + high (e.g. file-write results)
- **All** — full verbosity, including shell command output

### In-session toggle
- `/r` slash command — toggles parameter truncation (full file paths, URLs, commands)

### Office Town impact
- No direct impact on plugin architecture. Output verbosity is a user UX preference.

---

## 16. CODE MODE

### What it is
Alternative interaction model where Goose generates JavaScript (executed by pctx, a Deno runtime) instead of issuing direct tool calls.

### Mechanics
Three meta-tools provided by Code Mode extension:
- `list_functions`
- `get_function_details`
- `execute_typescript`

LLM uses these to discover, learn, and invoke tools on demand.

### Benefits
- Context-efficient: only meta-tool definitions + previously discovered tools loaded
- Multiple tool calls batched per execution
- Intermediate results chain naturally

### Best use cases
- 5+ extensions
- Complex multi-step workflows

### Limitation
> "Code Mode only supports text content from tool results. Images, binary data, and other content types are ignored."

### Office Town impact
- Important: Code Mode bypasses Goose's usual tool-discovery model. **All Office Town MCP tools must return text content** if we want to be Code-Mode-compatible. Binary outputs (images, files) will be silently dropped.
- This argues for keeping our MCP tools text-first; if we need to return artefacts, return URLs/links.

---

## 17. GOOSE PERMISSION MODES (AUTONOMY)

### Four modes
- **Autonomous (default)** — full automation, no approval
- **Manual Approval** — confirmation per tool/extension; supports granular tool permissions
- **Smart Approval** — risk-based; auto low-risk, flag others
- **Chat Only** — conversational, no file mods, no extensions

### Configure
- Desktop in-session: mode button bottom menu, or Settings > Chat > Mode
- CLI mid-session: `/mode auto`, `/mode smart_approve`, `/mode approve`, `/mode chat`
- CLI config: `goose configure` → goose settings → goose mode

### Detail
> "In approval modes, goose will only ask for permission for tools deemed 'write' tools" (text editor writes, bash rm/cp/mv).

### Office Town impact
- Office Town's MCP tools that mutate state (create site, delete domain, send email) should be flagged as write tools so they integrate properly with Smart Approval mode.
- The MCP spec for tool annotation governs this; check our tool schemas for `readOnlyHint` annotations.

---

## 18. MANAGING PROJECTS

### Definition
> "A record of a working directory where you've used goose."

### Storage
`~/.local/share/goose/projects.json`

### Tracked per project
- Absolute directory path
- Last accessed timestamp
- Most recent command
- Associated session ID

### Commands
- `goose project` (alias `goose p`) — resume most recent
- `goose projects` (alias `goose ps`) — browse all tracked

### Availability
> "Projects are currently available only through the goose CLI. Desktop support is planned for future releases."

### Office Town impact
- Project-scoped Office Town behaviour: per-project `.goose/recipes/`, `.gooseignore`, `.goosehints`, `.agents/skills/`, `.agents/plugins/` all work.
- A team can check Office Town-flavoured configs into their repo for shared workflow.

---

## 19. UPDATING GOOSE

### Commands
- `goose update` — latest stable
- `goose update --canary` — latest dev
- `goose update --reconfigure` — update + reconfigure
- `goose --version`

### Install script (verbatim)
```bash
curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash
```

### Pinning for CI/CD
`GOOSE_VERSION` env var

### Desktop
Sidebar → Settings → App → Updates → Check for Updates → Install & Restart

### Office Town impact
- Office Town INSTALL.md should mention minimum Goose version required (whichever version introduced `.agents/plugins/` — check).

---

## 20. CLI COMMANDS — FULL REFERENCE

### Core
- `goose --help`
- `goose configure` — providers, extensions, settings
- `goose info [-v]` — version, config location, session storage, logs
- `goose --version`
- `goose update [--canary|-c] [--reconfigure|-r]`
- `goose completion <SHELL>` — bash, zsh, fish, nu, powershell, elvish

### Session
- `goose session [-n NAME] [--session-id ID] [--resume] [--fork] [--debug] [--with-extension COMMAND] [--with-builtin ID]`
- `goose session list [-f FORMAT] [--ascending] [-w PATH] [-l NUMBER]`
- `goose session remove [--session-id ID] [-n NAME] [-r REGEX] [--path PATH]`
- `goose session export [-n NAME] [-o FILE] [--format FORMAT]`
- `goose session diagnostics [--session-id ID] [-n NAME] [-o FILE]`

### Task execution
- `goose run [-i FILE] [-t TEXT] [--system TEXT] [--recipe FILE] [--params KEY=VALUE] [-s] [-n NAME] [--no-session] [--debug] [--max-turns NUMBER] [-q] [--output-format FORMAT]`
- `goose recipe {deeplink|list|open|validate} [RECIPE_NAME]`
- `goose plugin {install|update} [OPTIONS] [URL]`
- `goose schedule {add|list|remove|sessions|run-now|cron-help} [--schedule-id NAME] [--cron EXPRESSION] [--recipe-source PATH]`
- `goose mcp <name>` — run MCP server by name (Goose itself can host MCP servers)
- `goose acp` — run as Agent Client Protocol server

### Project
- `goose project` / `goose p`
- `goose projects` / `goose ps`

### Shell
- `@goose <question>` / `@g <question>` — terminal alias

### Slash commands (in-session)
- `/?` / `/help`
- `/builtin <names>`
- `/clear`
- `/exit` / `/quit`
- `/extension <command>`
- `/mode <name>` (auto, approve, chat, smart_approve)
- `/plan <text>`
- `/recipe [filepath]`
- `/skills`
- `/t` / `/t <name>` (light, dark, ansi)
- `/r` — toggle param truncation

### Keyboard
- Ctrl+C — clear line / interrupt / exit
- Ctrl+J — newline
- Ctrl+R — interactive history search

### Office Town impact
- Office Town's INSTALL.md should reference `goose plugin install <url>` as the primary install path once we have a `plugin.json`.
- `goose recipe validate <name>` is the key CI step — every Office Town shipped recipe should pass `goose recipe validate`.
- `goose mcp <name>` means Goose can SPAWN an MCP server. Our Cloudflare-hosted servers connect via `streamable_http` not stdio.

---

## 21. CLI PROVIDERS (deprecated, kept for compat)

| Provider | Description |
|---|---|
| Claude Code | Anthropic's Claude CLI |
| OpenAI Codex | OpenAI's Codex CLI |
| Cursor Agent | Cursor's CLI agent |
| Gemini CLI | Google's Gemini CLI |

> "These providers are deprecated in favor of ACP providers."

### Core env vars
| Var | Example |
|---|---|
| `GOOSE_PROVIDER` | `claude-code`, `codex`, `cursor-agent`, `gemini-cli` |
| `GOOSE_MODEL` | provider-specific |
| `GOOSE_PLANNER_PROVIDER` | `openai` |
| `GOOSE_PLANNER_MODEL` | `gpt-4o` |

### Provider-specific
- Claude Code: `CLAUDE_CODE_COMMAND`, `GOOSE_MODE`
- Codex: `CODEX_COMMAND`, `CODEX_REASONING_EFFORT` (low/medium/high/xhigh), `CODEX_ENABLE_SKILLS` (default true), `CODEX_SKIP_GIT_CHECK`
- Cursor: `CURSOR_AGENT_COMMAND`
- Gemini: `GEMINI_CLI_COMMAND`

### Known models
- Claude Code: `default` (opus), `sonnet`, `haiku`
- Codex: `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`

---

## 22. ACP PROVIDERS (current, preferred)

### Available providers
1. **Amp ACP** — wraps amp-acp adapter
2. **Claude ACP** — wraps claude-agent-acp
3. **Codex ACP** — wraps codex-acp
4. **Pi ACP** — wraps pi-acp

### Config via env vars
- `GOOSE_PROVIDER=claude-acp` (etc.)
- `GOOSE_MODEL=<model>`
- `GOOSE_MODE=<auto|smart-approve|approve|chat>`

### Key features
- "ACP providers let you use goose with your existing Claude Code or ChatGPT Plus/Pro subscriptions — no per-token API costs."
- "Extensions are passed through to the ACP agent as MCP servers, so the agent can call your extensions directly."

### Limitations
- No session fork or resume (yet)

### Models
- Claude ACP: default (opus), sonnet, haiku
- Codex ACP: gpt-5.2-codex, gpt-5.2, gpt-5.1-codex-max, gpt-5.1-codex-mini

### CRITICAL note on declarative providers
The docs do NOT document a JSON-based declarative provider config (like our `alibaba.json` upstream PR pattern). The Goose docs site only describes env-var-based configuration. If alibaba.json was merged upstream, the docs are behind.

### Office Town impact
- Office Town's MCP servers will be reached as MCP extensions via the ACP agent — works transparently.
- For users on a Claude subscription, they configure `GOOSE_PROVIDER=claude-acp` and Office Town's Cloudflare-hosted MCP servers become available through the ACP layer.

---

## 23. CONFIGURATION FILES

### Locations
- macOS/Linux: `~/.config/goose/config.yaml`
- Windows: `%APPDATA%\Block\goose\config\config.yaml`

### Files in `~/.config/goose/`

| File | Purpose |
|---|---|
| `config.yaml` | Provider, model, extensions, general settings |
| `permission.yaml` | Tool permission levels |
| `secrets.yaml` | API keys (file-based fallback only) |
| `permissions/tool_permissions.json` | Runtime permission decisions |
| `prompts/` | Custom prompt templates |
| `recipes/` | Saved recipes |
| `memory/` | Memory extension data |
| `skills/` *(legacy)* | Old skill location, `~/.agents/skills/` preferred |
| `.gooseignore` | Global ignore file |
| `.goosehints` | Global hints |
| `settings.json` | Plugin enable/disable (`disabledPlugins`) |

### Global settings keys (top-level in `config.yaml`)

| Key | Type / Values | Default |
|---|---|---|
| `GOOSE_PROVIDER` | string | required |
| `GOOSE_MODEL` | string | required |
| `GOOSE_TEMPERATURE` | 0.0-1.0 | model-specific |
| `GOOSE_MAX_TOKENS` | int | model-specific |
| `GOOSE_MODE` | `auto`/`approve`/`chat`/`smart_approve` | smart_approve |
| `GOOSE_MAX_TURNS` | int | 1000 |
| `GOOSE_PLANNER_PROVIDER` | string | falls back to GOOSE_PROVIDER |
| `GOOSE_PLANNER_MODEL` | string | falls back to GOOSE_MODEL |
| `GOOSE_TOOLSHIM` | bool | false |
| `GOOSE_TOOLSHIM_OLLAMA_MODEL` | string | system default |
| `GOOSE_INPUT_LIMIT` | int | falls back to GOOSE_CONTEXT_LIMIT |
| `GOOSE_CLI_MIN_PRIORITY` | 0.0-1.0 | 0.0 |
| `GOOSE_CLI_THEME` | `light`/`dark`/`ansi` | dark |
| `GOOSE_CLI_LIGHT_THEME` | bat theme name | GitHub |
| `GOOSE_CLI_DARK_THEME` | bat theme name | zenburn |
| `GOOSE_CLI_SHOW_COST` | bool | false |
| `GOOSE_ALLOWLIST` | URL | unset |
| `GOOSE_RECIPE_GITHUB_REPO` | `owner/repo` | unset |
| `GOOSE_AUTO_COMPACT_THRESHOLD` | 0.0-1.0 | 0.8 |
| `SECURITY_PROMPT_ENABLED` | bool | false |
| `SECURITY_PROMPT_THRESHOLD` | 0.01-1.0 | 0.8 |
| `SECURITY_PROMPT_CLASSIFIER_ENABLED` | bool | false |
| `SECURITY_PROMPT_CLASSIFIER_ENDPOINT` | URL | unset |
| `SECURITY_PROMPT_CLASSIFIER_TOKEN` | string | unset |
| `GOOSE_TELEMETRY_ENABLED` | bool | false |
| `GOOSE_SEARCH_PATHS` | list of paths | unset |

### Extensions config block (verbatim)

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
    cmd: "command"           # stdio only
    args: ["arg1", "arg2"]   # stdio only
    description: "text"
    env_keys: []
    envs: {}
```

### Search paths (verbatim)
```yaml
GOOSE_SEARCH_PATHS:
  - "/usr/local/bin"
  - "~/custom/tools"
  - "/opt/homebrew/bin"
```

### Observability (verbatim)
```yaml
otel_exporter_otlp_endpoint: "http://localhost:4318"
otel_exporter_otlp_timeout: 20000
```

### Slash commands (verbatim, recap)
```yaml
slash_commands:
  - command: "run-tests"
    recipe_path: "/path/to/recipe.yaml"
  - command: "daily-standup"
    recipe_path: "/Users/me/.local/share/goose/recipes/standup.yaml"
```

### Priority order
1. Env vars (highest)
2. Config file
3. Defaults (lowest)

### Security note
> "Avoid storing sensitive information (API keys, tokens) in the config file." Prefer system keyrings; `secrets.yaml` file-based storage only when keyring unavailable.

### Office Town impact
- Office Town adds entries under `extensions:` in the user's `config.yaml` (type `streamable_http` if pointing at Cloudflare-hosted MCP).
- Office Town adds entries under `slash_commands:` to register `/wp-site-audit` etc.
- INSTALL.md should generate both blocks for the user to paste.

---

## 24. ENVIRONMENT VARIABLES — COMPLETE TABLE

(See section 23 for top-level config equivalents — env vars override.)

### Model configuration
| Var | Default |
|---|---|
| `GOOSE_PROVIDER` | required |
| `GOOSE_MODEL` | required |
| `GOOSE_FAST_MODEL` | provider-specific |
| `GOOSE_TEMPERATURE` | model-specific |
| `GOOSE_MAX_TOKENS` | model-specific |
| `GOOSE_PROVIDER__TYPE` | derived |
| `GOOSE_PROVIDER__HOST` | provider-specific |
| `GOOSE_PROVIDER__API_KEY` | none |
| `GOOSE_PREDEFINED_MODELS` | JSON array of model objects |
| `GEMINI3_THINKING_LEVEL` | `low` |
| `CLAUDE_THINKING_TYPE` | varies (`adaptive`/`enabled`/`disabled`) |
| `CLAUDE_THINKING_BUDGET` | 16000 (min 1024) |
| `GOOSE_PLANNER_PROVIDER` | falls back |
| `GOOSE_PLANNER_MODEL` | falls back |

### Bedrock / Databricks retry
- `BEDROCK_MAX_RETRIES` (6), `BEDROCK_INITIAL_RETRY_INTERVAL_MS` (2000), `BEDROCK_BACKOFF_MULTIPLIER` (2), `BEDROCK_MAX_RETRY_INTERVAL_MS` (120000)
- `DATABRICKS_MAX_RETRIES` (3), `DATABRICKS_INITIAL_RETRY_INTERVAL_MS` (1000), `DATABRICKS_BACKOFF_MULTIPLIER` (2), `DATABRICKS_MAX_RETRY_INTERVAL_MS` (30000)

### Session management
| Var | Default |
|---|---|
| `GOOSE_CONTEXT_STRATEGY` | `prompt` (interactive) / `summarize` (headless) — `summarize`/`truncate`/`clear`/`prompt` |
| `GOOSE_MAX_TURNS` | 1000 |
| `GOOSE_GATEWAY_MAX_TURNS` | falls back to MAX_TURNS, then 5 |
| `GOOSE_SUBAGENT_MAX_TURNS` | 25 |
| `GOOSE_MAX_BACKGROUND_TASKS` | 5 |
| `CONTEXT_FILE_NAMES` | `[".goosehints"]` |
| `GOOSE_DISABLE_SESSION_NAMING` | false |
| `GOOSE_DISABLE_TOOL_CALL_SUMMARY` | false |
| `GOOSE_PROMPT_EDITOR` | unset |
| `GOOSE_CLI_NEWLINE_KEY` | `j` |
| `GOOSE_CLI_SHOW_THINKING` | unset |
| `GOOSE_RANDOM_THINKING_MESSAGES` | true |
| `GOOSE_MAX_CODE_BLOCK_LINES` | 50 |
| `GOOSE_TRUNCATED_SHOW_LINES` | 20 |
| `GOOSE_NO_CODE_TRUNCATION` | false |
| `GOOSE_AUTO_COMPACT_THRESHOLD` | 0.8 |
| `GOOSE_TOOL_CALL_CUTOFF` | 10 |
| `GOOSE_MOIM_MESSAGE_TEXT` | unset |
| `GOOSE_MOIM_MESSAGE_FILE` | unset |
| `GOOSE_CONTEXT_LIMIT` | 128k or model default |
| `GOOSE_PLANNER_CONTEXT_LIMIT` | falls back |

### Tool configuration
| Var | Default |
|---|---|
| `GOOSE_MODE` | `smart_approve` |
| `GOOSE_TOOLSHIM` | false |
| `GOOSE_TOOLSHIM_OLLAMA_MODEL` | system default |
| `GOOSE_CLI_MIN_PRIORITY` | 0.0 |
| `GOOSE_CLI_TOOL_PARAMS_TRUNCATION_MAX_LENGTH` | 40 |
| `GOOSE_DEBUG` | false |
| `GOOSE_SEARCH_PATHS` | system PATH |
| `GOOSE_SHELL` | `/bin/bash` (Unix), `cmd` (Win) |
| `GOOSE_EDITOR_API_KEY`, `GOOSE_EDITOR_HOST`, `GOOSE_EDITOR_MODEL` | unset |

### Security & privacy
| Var | Default |
|---|---|
| `GOOSE_ALLOWLIST` | unset |
| `GOOSE_DISABLE_KEYRING` | unset (keyring enabled) |
| `SECURITY_PROMPT_*` | see section 28 |
| `GOOSE_TELEMETRY_ENABLED` | false |
| `GOOSE_SANDBOX` | false (macOS Desktop only) |

### Network
- `GOOSE_OAUTH_CALLBACK_PORT`
- `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`

### Observability
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_{SIGNAL}_ENDPOINT`
- `OTEL_{SIGNAL}_EXPORTER` (`otlp`/`console`/`none`)
- `OTEL_SDK_DISABLED`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_URL`
- `LANGFUSE_INIT_PROJECT_PUBLIC_KEY`, `LANGFUSE_INIT_PROJECT_SECRET_KEY`

### Goose server
| Var | Default |
|---|---|
| `GOOSE_HOST` | `127.0.0.1` |
| `GOOSE_PORT` | `3000` |
| `GOOSE_TLS` | `true` |
| `GOOSE_SERVER__SECRET_KEY` | auto-generated |

### Recipe configuration
| Var | Default |
|---|---|
| `GOOSE_RECIPE_PATH` | unset — colon-separated paths (Unix), semicolon (Windows) |
| `GOOSE_RECIPE_GITHUB_REPO` | unset — `owner/repo` |
| `GOOSE_RECIPE_RETRY_TIMEOUT_SECONDS` | recipe default |
| `GOOSE_RECIPE_ON_FAILURE_TIMEOUT_SECONDS` | recipe default |

### Dev/testing
- `GOOSE_PATH_ROOT` — override root data dir

### Set BY Goose (for downstream tools / hooks)
| Var | Notes |
|---|---|
| `GOOSE_TERMINAL` | `1` when running |
| `AGENT` | `goose` |
| `AGENT_SESSION_ID` | current session ID (extension contexts) |

### Office Town impact
- Office Town can ship recipes that reference `${AGENT_SESSION_ID}` if it needs to scope operations per-session.
- `GOOSE_RECIPE_PATH` is the cleanest way to add Office Town's `commands/` directory to discovery without copying files.

---

## 25. QUICK TIPS (summary)

- Keep sessions short (context limits)
- Disable unused extensions (tool slot pressure)
- Use Code Mode for 5+ extensions
- Adjust permission levels for autonomy
- `.goosehints`, skills, Memory for preferences
- `.gooseignore` for sensitive files
- Commit code changes frequently
- Use allowlists for production setups
- Write recipes that check current state before acting (re-runnable)
- Include logging in recipes
- Use dedicated planner models for complex reasoning
- Quick Launcher: `Cmd+Option+Shift+G` (macOS) / `Ctrl+Alt+Shift+G` (Win/Linux)

### Office Town impact
- Office Town's recipes MUST be re-runnable safely. Each shipped command in `commands/*.yaml` should idempotently check state first.

---

## 26. SECURITY (Prompt Injection Detection)

### Multi-layer pipeline
1. Tool call extracted + pattern-matched
2. Optional ML semantic scan (configured endpoint)
3. Confidence scoring
4. Pause for user approval on high-confidence threats

### Enable (config.yaml)

```yaml
SECURITY_PROMPT_ENABLED: true
SECURITY_PROMPT_THRESHOLD: 0.8
SECURITY_PROMPT_CLASSIFIER_ENABLED: true
SECURITY_PROMPT_CLASSIFIER_ENDPOINT: "https://..."
SECURITY_PROMPT_CLASSIFIER_TOKEN: "YOUR_TOKEN"
```

### Threshold guide (0.01-1.0, default 0.8)
- 0.01-0.50 — very lenient
- 0.50-0.70 — balanced
- 0.70-0.90 — strict
- 0.90-1.00 — maximum

### ML detection
Optional. Requires endpoint (e.g. Hugging Face). Self-hosting possible per Classification API Specification. Tool content + recent messages sent to endpoint — privacy implication.

### Office Town impact
- Office Town's MCP tools that issue shell commands or process user-pasted content should be wary of triggering prompt-injection alerts. Mark tools clearly with safe descriptions.

---

## 27. OFFICE TOWN ALIGNMENT CHECKLIST

Based on this knowledge base, things to verify/fix in `office-town-plugin/`:

| Item | Required by Goose | Current state | Fix |
|---|---|---|---|
| `plugin.json` at root | ✅ — Open Plugin Spec requires manifest | **MISSING** | Create with `{name, version, description}` |
| `skills/<name>/SKILL.md` | ✅ — frontmatter `name`, `description` | Verify all skills | Audit frontmatter |
| `hooks/hooks.json` (single file) | ✅ — single hooks.json schema | Verify shape | Consolidate |
| `scripts/` for hook commands | ✅ — referenced via `${PLUGIN_ROOT}` | Verify | Confirm scripts dir |
| `commands/<name>.yaml` (recipes) | ⚠️ — NOT part of plugin spec; user-installed only | Have these | Document install flow separately |
| Recipe `version` field | ✅ — top-level | Verify each | Add if missing |
| Recipe `title` + `description` | ✅ — required | Verify each | Add if missing |
| Recipe `instructions` OR `prompt` | ✅ — at least one | Verify each | Add if missing |
| Parameter `key` matches all `{{ var }}` | ✅ — validation rule | Audit | Fix mismatches |
| `select` params have `options` | ✅ — validation rule | Audit | Fix |
| `file` params have NO `default` | ✅ — validation rule | Audit | Remove defaults |
| Recipes pass `goose recipe validate` | ✅ — CI gate | Untested | Add CI step |
| Tool-count ≤25 across packs | ⚠️ — perf guidance | Already designed for | Confirm via single-worker collapse |
| Code Mode compat: text-only tool outputs | ⚠️ — best practice | Verify | Confirm tools return text |
| Recipes are re-runnable | ⚠️ — best practice | Verify | Audit each command |

### Install flow for Office Town
- **Plugin part**: `goose plugin install https://github.com/jezweb/office-town-plugin.git` → installs to `~/.agents/plugins/office-town/`. Brings skills + hooks.
- **Recipe registration**: separate step — `cp -r office-town-plugin/commands/* ~/.config/goose/recipes/office-town/` OR set `GOOSE_RECIPE_PATH=~/.agents/plugins/office-town/commands` OR publish via `GOOSE_RECIPE_GITHUB_REPO=jezweb/office-town-recipes`.
- **Slash command registration**: append to `~/.config/goose/config.yaml` under `slash_commands:`.
- **MCP server registration**: append to `~/.config/goose/config.yaml` under `extensions:` (type `streamable_http`, point at Cloudflare URLs).

The current INSTALL.md should cover all four steps.

---

## 28. OPEN QUESTIONS / NOT IN DOCS

1. **Memory Extension on-disk format** — not documented. Need to inspect Goose source or use trial+error to define our compatible format.
2. **Declarative ACP provider config (JSON)** — alibaba.json upstream PR was merged but docs don't reflect this pattern. Verify shape from the source PR.
3. **Plugin auto-registration of slash commands** — docs imply slash commands are user-config only; unclear if `goose plugin install` ever auto-appends to `slash_commands:`. Probably not — INSTALL.md needs manual step.
4. **Plugin auto-registration of recipes** — same question. Probably docs imply user manually copies recipes to `~/.config/goose/recipes/`.
5. **`gemini-extension.json` schema** — alternative plugin format, supports skills only. Not detailed in fetched docs.
6. **Subrecipe parallel execution semantics** — `sequential_when_repeated` flag controls multi-invocation behaviour but exact concurrency model not fully spec'd.

These should be answered by reading Goose source (`crates/goose/`) — see `goose/AGENTS.md` from project root.

---

**End of knowledge base.**
