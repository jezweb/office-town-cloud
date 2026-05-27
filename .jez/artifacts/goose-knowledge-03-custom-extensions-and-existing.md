# Goose Knowledge Pack 03 — Custom Extensions + Existing MCP Servers

**Source:** https://goose-docs.ai/docs/ (some redirects from block.github.io/goose)
**Date captured:** 2026-05-28
**Purpose:** Knowledge base for Office Town — a Cloudflare-backed MCP server suite + Goose plugin. This pack covers (a) how to build custom Goose extensions, (b) every existing Goose MCP server we either reuse, learn from, or compete with.

---

## Part A — Tutorials

### A.1 Custom Extensions Tutorial

**Source:** https://goose-docs.ai/docs/tutorials/custom-extensions

**What this is.** A how-to for building a new MCP server that Goose can load as an extension. The tutorial uses Python + FastMCP, walks through scaffolding, tool definition, packaging, install, and testing via MCP Inspector. STDIO transport is the only one the tutorial fully demonstrates.

**Languages explicitly mentioned.** Python (primary tutorial). The docs state: "MCP SDKs are also available for other common languages, such as TypeScript and Kotlin." Kotlin and TypeScript SDKs exist but aren't covered in this tutorial.

**Transports covered.** STDIO only in this tutorial. (Streamable HTTP and SSE are configurable elsewhere — see Using Extensions in §A.7.)

#### Scaffolding (Python, FastMCP)

```bash
uv init --lib mcp-wiki
cd mcp-wiki
mkdir -p src/mcp_wiki
touch src/mcp_wiki/server.py
touch src/mcp_wiki/__main__.py
```

Resulting layout:

```
.
├── README.md
├── pyproject.toml
└── src
    └── mcp_wiki
        ├── __init__.py
        ├── __main__.py
        ├── py.typed
        └── server.py
```

#### `pyproject.toml`

```toml
[project]
name = "mcp-wiki"
version = "0.1.0"
description = "MCP Server for Wikipedia"
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
    "beautifulsoup4>=4.14.0",
    "html2text>=2025.4.15",
    "mcp[cli]>=1.25.0",
    "requests>=2.32.3",
]

[project.scripts]
mcp-wiki = "mcp_wiki:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

#### Tool definition with FastMCP (`server.py`)

```python
from mcp.server.fastmcp import FastMCP
from mcp.shared.exceptions import McpError
from mcp.types import ErrorData, INTERNAL_ERROR, INVALID_PARAMS

mcp = FastMCP("wiki")

@mcp.tool()
def read_wikipedia_article(url: str) -> str:
    """
    Fetch a Wikipedia article at the provided URL, parse its main content,
    convert it to Markdown, and return the resulting text.
    """
    # validation, fetch, parse, return markdown
    # raise McpError(ErrorData(code=INVALID_PARAMS, message=...)) on bad input
    # raise McpError(ErrorData(code=INTERNAL_ERROR, message=...)) on infra fail
```

Notes:
- FastMCP infers JSON schema from Python type hints + docstring.
- Errors must be raised as `McpError(ErrorData(...))` — INTERNAL_ERROR, INVALID_PARAMS, etc.
- Docstring becomes the tool description shown to the LLM.

#### Entry points

```python
# __init__.py
import argparse
from .server import mcp

def main():
    """MCP Wiki: Read Wikipedia articles and convert them to Markdown."""
    parser = argparse.ArgumentParser(
        description="Gives you the ability to read Wikipedia articles and convert them to Markdown."
    )
    parser.parse_args()
    mcp.run()

if __name__ == "__main__":
    main()
```

```python
# __main__.py
from mcp_wiki import main
main()
```

#### Build + install (local)

```bash
uv sync
source .venv/bin/activate
uv pip install .
mcp-wiki --help     # CLI verification
```

#### Adding to Goose Desktop

1. Sidebar → Extensions → Add custom extension
2. Type: `STDIO`
3. Name + description
4. Command: `uv run /full/path/to/mcp-wiki/.venv/bin/mcp-wiki`

Example: `uv run /Users/smohammed/Development/mcp/mcp-wiki/.venv/bin/mcp-wiki`

#### Publishing to PyPI alternative install

Once on PyPI, users install with:

```bash
uvx mcp-wiki
```

#### Local testing with MCP Inspector

```bash
uv sync
source .venv/bin/activate
mcp dev src/mcp_wiki/server.py
```

Requires Node.js/npm.

#### Advanced features hinted at

- **MCP Sampling** — server requests AI completions from Goose's LLM via `sampling/createMessage`. "Transforms simple tools into intelligent agents."
- **MCP Apps** — interactive HTML UIs rendered in chat (see §A.2).

#### What the tutorial does NOT cover

- Streamable-HTTP / SSE transport scaffolding (these are runtime config in `using-extensions`)
- Extension registry submission process
- Secrets/env-var schema (env keys appear as configurable in `goose configure`, see §A.7)
- Distribution beyond PyPI + manual paths
- Extension manifest beyond `pyproject.toml`

---

### A.2 Building MCP Apps Tutorial

**Source:** https://goose-docs.ai/docs/tutorials/building-mcp-apps

**What an MCP App is.** "MCP Apps let MCP servers return interactive UIs that render directly inside the goose chat interface, rather than responding with text alone." It's a tool result with a `_meta.ui` block pointing at a `ui://` resource (HTML). The HTML is loaded by Goose Desktop in an iframe-sandboxed surface and talks back to chat via `postMessage` JSON-RPC.

**Difference from regular extension.** Regular extensions return text/JSON; MCP Apps return text + a UI resource URI. The UI can request theme info, send messages to chat, and report its own size.

**Language demoed.** Node.js 18+ / JavaScript ES modules. Other runtimes not mentioned.

**Transport.** STDIO. `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`.

#### Scaffolding

```bash
mkdir mcp-app-demo
cd mcp-app-demo
npm init -y
npm install @modelcontextprotocol/sdk
```

```json
// package.json
{
  "name": "mcp-app-demo",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.0" }
}
```

#### Server (verbatim)

```javascript
#!/usr/bin/env node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_HTML = readFileSync(join(__dirname, "index.html"), "utf-8");

const server = new Server(
  { name: "mcp-app-demo", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "show_demo_app",
    description: "Shows an interactive demo MCP App UI in the chat",
    inputSchema: { type: "object", properties: {}, required: [] },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  if (name === "show_demo_app") {
    return {
      content: [{ type: "text", text: "The demo app is now displayed!" }],
      _meta: { ui: { resourceUri: "ui://mcp-app-demo/main" } },
    };
  }
  throw new Error(`Unknown tool: ${name}`);
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [{
    uri: "ui://mcp-app-demo/main",
    name: "MCP App Demo",
    description: "An interactive demo",
    mimeType: "text/html;profile=mcp-app",
  }],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  if (uri === "ui://mcp-app-demo/main") {
    return {
      contents: [{
        uri: "ui://mcp-app-demo/main",
        mimeType: "text/html;profile=mcp-app",
        text: APP_HTML,
        _meta: {
          ui: {
            csp: {
              connectDomains: [],
              resourceDomains: [],
              frameDomains: [],
              baseUriDomains: [],
            },
            prefersBorder: true,
          },
        },
      }],
    };
  }
  throw new Error(`Resource not found: ${uri}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP App Demo server running on stdio");
}
main().catch(console.error);
```

#### Client-side bridge (JS in the HTML)

```javascript
class McpAppClient {
  constructor() {
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.initialized = false;
    this.hostContext = null;
    window.addEventListener('message', (e) => this.handleMessage(e));
    this.initialize();
  }
  async initialize() {
    const result = await this.request('ui/initialize', {});
    this.hostContext = result.hostContext;
    this.initialized = true;
    if (this.hostContext?.theme) this.applyTheme(this.hostContext.theme);
    this.notify('ui/notifications/initialized', {});
    this.reportSize();
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 30000);
    });
  }
  sendMessageToChat(text) {
    return this.request('ui/message', { content: { type: 'text', text } });
  }
}
```

#### Key MCP App protocol details

- MIME type: `text/html;profile=mcp-app`
- URI scheme: `ui://<app-id>/<resource-path>`
- `_meta.ui` block on the resource:
  - `csp` — content security policy allowlists (`connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`)
  - `permissions` — camera, microphone, geolocation, clipboard
  - `prefersBorder` — visual styling hint
- Tool result has `_meta.ui.resourceUri` to point at the UI resource
- Bridge is JSON-RPC 2.0 over `window.parent.postMessage`
- Methods the app can call on the host:
  - `ui/initialize` → returns `{ hostContext: { theme, ... } }`
  - `ui/message` — send chat message (`{ content: { type: 'text', text } }`)
  - `ui/notifications/initialized` — fired when ready
  - `ui/notifications/size-changed` — report height/width
- 30-second default request timeout in client class

#### Install in Desktop

1. Sidebar → Extensions → Add custom extension
2. Type: Standard IO
3. Command: `node /full/path/to/mcp-app-demo/server.js`

---

### A.3 Headless Goose Tutorial

**Source:** https://goose-docs.ai/docs/tutorials/headless-goose

**What headless is.** Non-interactive execution for servers, CI/CD, batch processing. `goose run` processes a single task or recipe and exits.

#### Core CLI

```bash
goose run -t "your task description"
goose run --with-builtin developer -t "task"
goose run --no-session -t "task"
goose run --debug -t "task"
goose run --recipe automation-recipe.yaml
goose run --recipe automation-recipe.yaml --params target_directory=./backend
```

| Flag | Effect |
|---|---|
| `-t, --text` | One-shot prompt |
| `--no-session` | Don't persist to session history |
| `--with-builtin <names>` | Comma-separated builtins to enable |
| `--with-extension "<cmd>"` | Add a CLI extension for the run |
| `--with-streamable-http-extension <url>` | Add HTTP MCP for the run |
| `--debug` | Verbose output |
| `--recipe <path>` | Run a recipe YAML |
| `--params key=value` | Recipe parameter override (repeatable) |
| `--sub-recipe <path>` | Add a sub-recipe (repeatable) |

#### Required recipe shape for headless

```yaml
title: "Recipe Name"
name: "Recipe Name"
description: "What it does"
author:
  name: "Author Name"
  email: "email@example.com"
prompt: "Initial instruction (REQUIRED for headless)"
instructions: |
  Detailed execution steps
parameters:
  - key: parameter_name
    input_type: string
    requirement: required
    description: "Parameter description"
    default: "default_value"
extensions:
  - type: builtin
    name: developer
    display_name: Developer
    timeout: 300
    bundled: true
```

`prompt` is mandatory for headless. `instructions` alone won't run unattended.

#### Environment overrides

```bash
export GOOSE_CONTEXT_STRATEGY=summarize
export GOOSE_MAX_TURNS=50
export GOOSE_MODE=auto
export GOOSE_DISABLE_SESSION_NAMING=true
export GOOSE_PROVIDER=openai
export GOOSE_MODEL=gpt-4o
export GOOSE_CLI_MIN_PRIORITY=0.2
export GOOSE_PLANNER_PROVIDER=openai
export GOOSE_PLANNER_MODEL=gpt-4o
```

#### Real CI/cron patterns

```yaml
# .github/workflows/ci.yml
- name: AI-Powered Code Review
  run: |
    goose run --with-builtin developer \
      -t "Analyze code changes in this PR, check for security vulnerabilities, ..."
```

```bash
# Cron
0 2 * * * /usr/local/bin/goose run --no-session -t "Run comprehensive security audit, ..."
```

```bash
# Bash error handling
if ! goose run --no-session -t "Run security audit and fix critical issues"; then
    echo "goose automation failed - manual intervention required"
    exit 1
fi
```

#### Sub-recipes in a headless run

```bash
goose run --recipe main-workflow.yaml \
  --sub-recipe security-audit.yaml \
  --sub-recipe performance-analysis.yaml \
  --params environment=production
```

Multiple `--sub-recipe` flags supported. Parallel vs sequential controlled by recipe internals (see §A.5).

---

### A.4 Research → Plan → Implement Pattern (RPI)

**Source:** https://goose-docs.ai/docs/tutorials/rpi/

**What RPI is.** A disciplined three-phase workflow for complex tasks. Trades speed for predictability + correctness by separating *research* (document existing code), *plan* (design + phased steps), *implement* (mechanical execution). Introduced by HumanLayer.

**When to use.** Multi-file refactors, feature migrations, dep upgrades, incident remediation, documentation overhauls. Skip for one-file fixes.

#### Phase 1 — Research

Slash command: `/research_codebase "topic description"`

Spawns three parallel subagents:
1. **find_files** (rpi-codebase-locator) — locate relevant files
2. **analyze_code** (rpi-codebase-analyzer) — read + document how code functions
3. **find_patterns** (rpi-pattern-finder) — find similar features elsewhere

Output: `thoughts/research/YYYY-MM-DD-HHmm-topic.md` with git metadata, file refs with line numbers, flow diagrams, key components, open questions, code references organised by concern.

**Critical constraint.** Research documents existing code only — no changes, no critiques, no planning. The research doc is a shared understanding base for human + agent.

#### Phase 2 — Plan

Slash command: `/create_plan "feature/task description"`

The plan recipe:
1. Reads the research doc
2. Asks clarifying questions where ambiguous
3. Presents design alternatives
4. Produces phased plan with file paths, code snippets, verification, manual testing, rollback

Output: `thoughts/plans/YYYY-MM-DD-HHmm-description.md` with explicit phases, checkboxes for tracking, dependencies between phases.

#### Phase 3 — Implement

Slash command: `/implement_plan "path/to/plan.md"`

The implement recipe:
1. Reads plan completely
2. Executes phases in dependency order
3. Runs verification after each phase
4. Updates checkboxes in the plan file
5. Compacts context by re-reading updated plan state

The checkbox-update mechanism survives context window resets — checkboxes ARE the durable state.

#### Iterate

`/iterate_plan "plan/path.md" "feedback describing what needs change"` — surgical update preserving completed phases.

#### Real-world numbers (Tool Selection Strategy removal, 32 files, 10 phases)

| Phase | Duration |
|---|---|
| Research | 9 min |
| Planning | 4 min |
| Implementation | 39 min |
| **Total** | **52 min** |

Resulting PR passed all builds and code review with zero comments.

#### Setup — install recipes + slash commands

Recipe files in `~/.config/goose/recipes/`:
- `rpi-research.yaml`
- `rpi-plan.yaml`
- `rpi-implement.yaml`
- `rpi-iterate.yaml`

Subrecipes in `~/.config/goose/recipes/subrecipes/`:
- `rpi-codebase-locator.yaml`
- `rpi-codebase-analyzer.yaml`
- `rpi-pattern-finder.yaml`

Custom slash commands map names → recipes.

#### Best practices captured

- One goal per session per phase
- Human review of research before planning
- Human review of plan before implementing
- Use `/iterate_plan` rather than restart
- Checkboxes carry execution state across context resets

---

### A.5 Subrecipes in Parallel

**Source:** https://goose-docs.ai/docs/tutorials/subrecipes-in-parallel/

**What subrecipes are.** Reusable recipe components invoked from a parent recipe. Defined with own parameters. Execute independently or in batch.

**Parallel defaults.**

| Pattern | Default |
|---|---|
| Different subrecipes | Sequential. Add "in parallel" to prompt to override. |
| Same subrecipe, different params | **Parallel by default.** Set `sequential_when_repeated: true` to force serial. |

**Concurrency cap.** Up to 10 concurrent workers. Each runs in an isolated worker process.

#### Verbatim plan_trip.yaml

```yaml
version: 1.0.0
title: Plan Your Trip
description: Get weather forecast and find things to do for your destination
instructions: You are a travel planning assistant that helps users prepare for their trips.
prompt: |
  run the following subrecipes in parallel to plan my trip:
    - use weather subrecipe to get the weather forecast for Sydney
    - use things-to-do subrecipe to find activities and attractions in Sydney
sub_recipes:
  - name: weather
    path: "./subrecipes/weather.yaml"
    values:
      city: Sydney
  - name: things-to-do
    path: "./subrecipes/things-to-do.yaml"
    values:
      city: Sydney
      duration: "3 days"
extensions:
  - type: builtin
    name: developer
    timeout: 300
    bundled: true
```

#### Verbatim multi_city_weather.yaml (same subrecipe, multiple params)

```yaml
version: 1.0.0
title: Multi-City Weather Comparison
description: Compare weather across multiple cities for trip planning
instructions: You are a travel weather specialist helping users compare conditions across cities.
prompt: |
  get the weather forecast for the three biggest cities in Australia 
  to help me decide where to visit
sub_recipes:
  - name: weather
    path: "./subrecipes/weather.yaml"
extensions:
  - type: builtin
    name: developer
    timeout: 300
    bundled: true
```

#### Verbatim subrecipes/weather.yaml

```yaml
version: 1.0.0
title: Find weather
description: Get weather data for a city
instructions: You are a weather expert. You will be given a city and you will need to return the weather data for that city.
prompt: |
  Get the weather forecast for {{ city }} for today and the next few days.
parameters:
  - key: city
    input_type: string
    requirement: required
    description: city name
extensions:
  - type: stdio
    name: weather
    cmd: uvx
    args:
      - mcp_weather@latest
    timeout: 300
```

#### Verbatim subrecipes/things-to-do.yaml

```yaml
version: 1.0.0
title: Things to do in a city
description: Find activities and attractions for travelers
instructions: You are a local travel expert who knows the best activities, attractions, and experiences in cities around the world.
prompt: |
  Suggest the best things to do in {{ city }} for a {{ duration }} trip.
  Include a mix of popular attractions, local experiences, and hidden gems.
  {% if weather_context %}
  Consider the weather conditions: {{ weather_context }}
  {% endif %}
parameters:
  - key: city
    input_type: string
    requirement: required
    description: city name
  - key: duration
    input_type: string
    requirement: required
    description: trip duration (e.g., "2 days", "1 week")
  - key: weather_context
    input_type: string
    requirement: optional
    default: ""
    description: weather conditions to consider for activity recommendations
```

#### Error handling

Failed task counts tracked in real-time progress dashboard. Specific recovery/retry semantics not documented at this level (see Recipe `retry:` field in §A.7).

---

### A.6 Subagents

**Sources:**
- https://goose-docs.ai/docs/guides/subagents/ (primary, partial)
- https://goose-docs.ai/docs/tutorials/subagents/ (tutorial fragment)
- Block blog: "Orchestrating 6 Subagents to Build a Collaborative API Playground" (2025-07-21) — referenced

**What subagents are.** "Independent instances that execute tasks while keeping your main conversation clean and focused." Temporary assistants, process isolation, context preservation by offloading. Each has its own session.

**Three ways to spawn.**

1. **Natural language** — "Use the security-auditor recipe to scan this endpoint" / "Create three HTML templates simultaneously" / "Research X and summarise". Goose decides when to spawn, manages lifecycle.
2. **Recipes** — defined as a recipe with own prompt/extensions/parameters. Invoked by parent via `summon` (Summon extension).
3. **External agents** — Codex or Claude Code can be spawned as subagents.

**Architecture (from search results synthesis).** Goose creates task definitions, stores in a `TasksManager`, spawns separate Goose instances (isolated session, own `ExtensionManager`, own `ToolMonitor`, own context, own communication channels), aggregates results back to parent.

**Sequential vs parallel.** Parent prompt steers it. "Run sequentially" for dependent tasks; "Run in parallel" or "simultaneously" for independent work. Subagents that must not write the same files should be kept isolated — that's the key constraint.

**Tools available to subagents.** Each subagent's recipe declares its own `extensions:` block. By default this is just what the recipe gives them. Headless Goose underneath, so the same extension model applies.

**Headless-Goose pattern for a subagent task.** From the tutorial:

```bash
goose run -t "YOUR_PROMPT_HERE" --quiet --no-session --max-turns 1
```

Parent recipe instructs developer-role subagent to spawn a `goose run` with a one-shot prompt. `--max-turns` controls cost. `--no-session` keeps history clean.

**Cost/context implications.** Each subagent is a fresh context. Parallel subagents = parallel LLM cost. Result aggregation goes back into the parent context (so big subagent outputs can blow parent context — keep returns terse).

---

### A.7 Using Extensions (catch-all)

**Source:** https://goose-docs.ai/docs/getting-started/using-extensions/

#### Six ways to install/enable

1. Extensions Directory at `/extensions`
2. `goose configure` CLI menu
3. Desktop UI sidebar
4. `goose://` deeplinks
5. Direct edit of `~/.config/goose/config.yaml`
6. CLI flags at session start

#### CLI commands

```bash
# Configure menu (add / toggle / remove)
goose configure

# Quick add by name (e.g. from registry)
goose mcp {name}

# Start with builtins
goose session --with-builtin "developer,computercontroller"

# Start with external CLI extension
goose session --with-extension "uvx mcp-server-fetch"

# With env vars baked in
goose session --with-extension "GITHUB_PERSONAL_ACCESS_TOKEN=<TOKEN> npx -y @modelcontextprotocol/server-github"

# Streamable-HTTP extension (remote MCP)
goose session --with-streamable-http-extension "https://example.com/streamable"

# Mid-session
/extension npx -y @modelcontextprotocol/server-memory
/builtin developer
```

#### Deeplink URL format

**StandardIO:**
```
goose://extension?cmd=<command>&arg=<argument>&id=<id>&name=<name>&description=<description>&timeout=<seconds>
```

Multiple `&arg=` allowed (repeated).

Example (GitHub MCP):
```
goose://extension?cmd=npx&arg=-y&arg=%40modelcontextprotocol/server-github&timeout=300&id=<id>&name=<name>&description=<description>
```

**Streamable-HTTP:**
```
goose://extension?url=<remote-url>&type=streamable_http&timeout=<seconds>&id=<id>&name=<name>&description=<description>
```

Example:
```
goose://extension?url=https%3A%2F%2Fexample.com%2Fstreamable&type=streamable_http&timeout=300&id=<id>&name=<n>&description=<description>
```

#### Config file format

Location: `~/.config/goose/config.yaml`

```yaml
extensions:
  github:
    name: GitHub
    cmd: npx
    args: [-y @modelcontextprotocol/server-github]
    enabled: true
    envs: { "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>" }
    type: stdio
    timeout: 300
```

#### Recipe reference — extension `type` values

From recipe reference (https://goose-docs.ai/docs/guides/recipes/recipe-reference):

| `type` | Meaning |
|---|---|
| `stdio` | Command-line MCP server (most common third-party) |
| `builtin` | Bundled-in extension toggled on |
| `platform` | Core Goose platform extension (apps, summon, code_execution, autovisualiser, ...) |
| `streamable_http` | Remote MCP over streamable HTTP |
| `frontend` | Frontend-only (UI hook) |
| `inline_python` | Inline Python code defining an extension |

Each extension block:
```yaml
type: stdio
name: <unique id>
cmd: <command>
args: [...]
env_keys: [<NAME>, ...]
timeout: <seconds>
bundled: <bool>
description: <string>
available_tools: [<tool name>, ...]   # optional whitelist
```

#### Full recipe schema (verbatim from §A.7)

Required: `title` (string), `description` (string), and at least one of `instructions` or `prompt` (string — `prompt` required for headless).

Optional fields:
- `version` (string, default "1.0.0")
- `activities` — desktop-only clickable bubbles
- `extensions` — array (see above)
- `parameters` — array (see below)
- `response` — JSON schema for structured output
- `retry` — retry policy
- `settings` — provider/model/temp/max_turns
- `sub_recipes` — array of sub-recipe invocations

**Parameters block:**
```yaml
parameters:
  - key: <name>
    input_type: string | number | boolean | date | file | select
    requirement: required | optional | user_prompt
    description: <string>
    default: <value>           # required for optional, forbidden for file
    options: [...]             # required for select
```

Template substitution: `{{ parameter_name }}` in `instructions`, `prompt`, `activities`.

Built-in template var: `{{ recipe_dir }}` — path to the recipe's directory.

Escape literal braces: `{{'{{literal_text}}'}}`.

Inheritance: `{% extends "parent.yaml" %}` with block overrides.

Indent filter: `{{ raw_data | indent(2) }}`.

**Response field:**
```yaml
response:
  json_schema:
    type: object
    properties:
      field_name:
        type: string|number|array|object
        description: <string>
    required:
      - field_name
```

**Retry block:**
```yaml
retry:
  max_retries: <n>
  timeout_seconds: <n>
  on_failure_timeout_seconds: <n>
  checks:
    - type: shell
      command: <string>     # exit 0 = pass
  on_failure: <command>     # optional cleanup
```

**Settings block:**
```yaml
settings:
  goose_provider: anthropic | openai | ...
  goose_model: <model id>
  temperature: <0.0-1.0>
  max_turns: <n>            # precedence: tool override > recipe > env
```

**Sub-recipes block:**
```yaml
sub_recipes:
  - name: <unique id>
    path: <relative or absolute>
    values: { key: value, ... }
    sequential_when_repeated: <bool>
    description: <string>
```

**Validation rules:**
- ≥1 of `instructions` / `prompt`
- Optional parameters MUST have defaults
- File parameters CANNOT have defaults
- Select parameters MUST have `options`
- All `{{ template vars }}` must have parameter definitions
- No unused parameter definitions
- `response.json_schema` must be valid JSON Schema

---

## Part B — Existing MCP Server Extensions

For each: what it does, transport, tools, install, builtin flag, overlap with Office Town.

Office Town's planned scope keywords for the overlap column: **wiki, files, browser, email, kanban, cron, voice, sandbox, search, devops**.

### B.1 Memory Extension

**URL:** https://goose-docs.ai/docs/mcp/memory-mcp/
**Builtin:** Yes, toggle on (not enabled by default per the using-extensions listing — Memory listed as available builtin, must be toggled).
**Transport:** Built-in (platform).

**What it does.** Local file storage of categorised facts. "Goose loads all saved memories at the start of a session and includes them in every prompt sent to the LLM."

**Storage:**
| Scope | Path |
|---|---|
| Local (project) | `.goose/memory/` |
| Global (user) | `~/.config/goose/memory/` |

**Tools:**
| Tool | Signature |
|---|---|
| `remember_memory` | `(category, data, tags, is_global)` — store with category + tags + scope |
| `retrieve_memories` | `(category, is_global)` — retrieve by category, `"*"` for all |
| `remove_memory_category` | `(category, is_global)` — delete category or `"*"` for all |
| `remove_specific_memory` | `(category, memory_content, is_global)` — remove by content match |

**Trigger words.** `remember`, `forget`, `memory`, `save`, `remove memory`, `clear memory`, `search/find memory`.

**Install:**
- Desktop: sidebar → Extensions → toggle `Memory` on
- CLI: `goose configure` → Toggle Extensions → enable memory

**Overlap with Office Town:** **WIKI, NOTES, KNOWLEDGE — direct replacement target.** Office Town's wiki + notes capabilities supersede this. The Memory extension is single-machine, flat-file, no graph, no shared store; Office Town runs on Cloudflare R2 + D1 with cross-device sync, audit trail, search.

---

### B.2 Knowledge Graph Memory Extension

**URL:** https://goose-docs.ai/docs/mcp/knowledge-graph-mcp/ (note: aka KGM-MCP)
**Builtin:** No — third-party. `@modelcontextprotocol/server-memory` (the official MCP reference server, despite name).
**Transport:** STDIO (npx-launched Node).

**What it does.** Graph-based memory: entities + relationships + queries. Persistent across sessions. Pattern detection across relationships.

**Tools (inferred from canonical MCP memory server):**
- `create_entities` — store typed entities as nodes
- `create_relations` — connect entities (e.g. SQL Injection → causes → Data Theft)
- `add_observations` — append facts to entities
- `delete_entities` / `delete_relations` / `delete_observations`
- `read_graph` — full graph dump
- `search_nodes` — query
- `open_nodes` — fetch by name

**Install:**
```
npx -y @modelcontextprotocol/server-memory
```
Required: Node.js. Configure via `goose configure` → Command-line Extension → 300s timeout default.

**Setup name/id in Goose UI:**
- Type: Standard IO
- ID: `kgm-mcp`
- Command: `npx -y @modelcontextprotocol/server-memory`

**Differences from Memory ext:** richer (relationships not isolated facts), Node-based not built-in, can detect pattern chains across stored knowledge.

**Overlap with Office Town:** **WIKI, KNOWLEDGE — direct replacement target.** Office Town's wiki has a much richer model (entities-as-folders, decisions, projects with sub-folders, organisations) and runs on hosted storage. KGM lives on local disk in JSON.

---

### B.3 Apps Extension

**URL:** https://goose-docs.ai/docs/mcp/apps-mcp/
**Builtin:** Yes, platform extension, enabled by default for new users.
**Transport:** Built-in (platform).

**What it does.** Lets users create and manage custom HTML applications through chat. Single-file HTML+JS+CSS, no npm. Run in sandboxed standalone windows. Accessible from chat or an Apps page.

**Storage:**
- macOS/Linux: `~/.local/share/goose/apps/`
- Windows: `%APPDATA%\Block\goose\data\apps\`

**Tool surface:** exposes "MCP App resources" — likely create/list/update/delete/run app endpoints. Specific tool names not in docs.

**What it is NOT:** desktop-app launcher. It's the MCP-Apps surface (interactive HTML in chat — see §A.2).

**Install:** sidebar → Extensions → toggle `Apps` on (or `goose configure` → Toggle Extensions → apps).

**Overlap with Office Town:** **WIKI/UI complement.** Office Town can SHIP MCP-Apps surfaces (the JSON-RPC bridge from §A.2 is the contract). Office Town's wiki pages and kanban can render via MCP App resources. Don't replace this; lean on it for any UI we ship through Goose.

---

### B.4 Summon Extension

**URL:** https://goose-docs.ai/docs/mcp/summon-mcp/
**Builtin:** Yes, platform extension, enabled by default for new users. Available since v1.25.0.
**Transport:** Built-in (platform).

**What it does.** "Loads knowledge into goose's context and delegates tasks to subagents." Summons skills + recipes.

**Tools (functional categories):**
- **Load** — ingest a skill or recipe into the current context
- **Delegate** — spawn a subagent for a task

**Replaces:** the deprecated Skills extension (1.16.0-1.24.0).

**Skill format:** Markdown files with YAML frontmatter:
```yaml
---
name: <skill-name>
description: <description>
---
# <content>
```

Stored at:
- `~/.agents/skills/` (global)
- `.agents/skills/` (project)
- `~/.agents/plugins/<plugin-name>/` (plugin-bundled)
- Legacy supported: `.goose/skills/`, `.claude/skills/`, `~/.claude/skills/`

**Install:** sidebar → Extensions → toggle Summon on (or CLI).

**Overlap with Office Town:** **CRITICAL DEPENDENCY.** Office Town's "agent capabilities" are skills the agent can summon. We should ship skills that Summon picks up by writing markdown files to `~/.agents/skills/office-town-*/SKILL.md`. We lean on Summon — don't compete with it.

---

### B.5 Skills Extension (deprecated)

**URL:** https://goose-docs.ai/docs/mcp/skills-mcp/
**Builtin:** Yes (in v1.16.0 - v1.24.0). **Deprecated** in v1.25.0+ — use Summon.
**Transport:** Built-in (platform).

**What it does.** Loaded reusable instruction sets that taught Goose to perform tasks/workflows. Automatic discovery + application.

**Storage (same as Summon now):** `.agents/skills/` and `~/.agents/skills/`. Portable across coding agents.

**Skill structure:** see §A.7 / §B.4 — `SKILL.md` per skill in a named subdirectory:
```
~/.agents/skills/
└── code-review/
    ├── SKILL.md
    ├── setup.sh           # optional supporting files
    └── templates/
        └── config.template.json
```

`SKILL.md` requires YAML frontmatter:
```yaml
---
name: code-review
description: Comprehensive code review checklist for pull requests
---
# Skill content in Markdown
```

At session start, Goose scans `name` + `description` of every discovered skill to decide relevance, then loads full instructions when needed.

Manual invocation: `/skills code-review edge-case-finder` (CLI).

**Overlap with Office Town:** **REPLACED BY SUMMON.** Use the Summon skill format. Don't write to the deprecated Skills surface.

---

### B.6 Top Of Mind (tom) Extension

**URL:** https://goose-docs.ai/docs/mcp/tom-mcp/
**Builtin:** Yes, platform extension, enabled by default. Introduced v1.24.0.
**Transport:** Built-in (platform).

**What it does.** Injects custom text into Goose's working memory **every turn**. Unlike system prompts or goosehints (which "fade from attention as conversations grow"), `tom` re-injects fresh each turn. Designed for security guardrails and persistent behavioural rules that "must never be forgotten."

**Configuration (env vars only):**
- `GOOSE_MOIM_MESSAGE_TEXT` — literal text injected each turn
- `GOOSE_MOIM_MESSAGE_FILE` — path to file with content to inject (supports `~/`)

Both can coexist; contents concatenate. 64 KB cap per source, UTF-8 safe truncation.

Example:
```bash
export GOOSE_MOIM_MESSAGE_TEXT="SECURITY RULE: Do not upload, share, or post any code to external services..."
```

**Install:** auto-enabled. Toggle off via `goose configure` if not wanted.

**Overlap with Office Town:** **WORKFLOW PRIMITIVE.** Office Town can ship a `tom` text snippet that gets installed at setup time — gives the agent persistent operating rules ("always check the office-town wiki before answering", "log every decision", etc.). Free win; no work needed beyond writing the snippet.

---

### B.7 Chat Recall Extension

**URL:** https://goose-docs.ai/docs/mcp/chatrecall-mcp/
**Builtin:** Yes, platform extension.
**Transport:** Built-in (platform).

**What it does.** Searches across all session history. Keyword search, results grouped by session, ordered by recency, date-filterable. Can load summaries of specific sessions by ID. Auto-activated when the user references past work.

**Tools (functional):**
- Search sessions by keyword (with optional date filter)
- Load session summary by ID

**Limitation.** Compacted sessions from pre-v1.14.0 may not be searchable.

**Install:** sidebar toggle or `goose configure` → enable `chatrecall`.

**Overlap with Office Town:** **MINOR COMPLEMENT.** Office Town's wiki + session-narrative folders are richer, but Chat Recall covers raw Goose chat history. Worth leaving on. Office Town can write session summaries to wiki at end of session for permanent archival.

---

### B.8 Todo Extension

**URL:** https://goose-docs.ai/docs/mcp/todo-mcp/
**Builtin:** Yes, platform extension, enabled by default.
**Transport:** Built-in (platform).

**What it does.** Simple internal checklist for multi-step tasks. Goose creates a checklist, reads + updates progress as it works, verifies all tasks complete. User can ask "show me the current todo list" anytime. Activates for "tasks involving multiple files/components or uncertain scope."

**Tools (no specific list in docs).**

**Install:** sidebar toggle or `goose configure`.

**Overlap with Office Town:** **MINIMAL.** This is in-session checklists, not kanban. Office Town's kanban is persistent multi-user task tracking. No real competition.

---

### B.9 Tutorial Extension

**URL:** https://goose-docs.ai/docs/mcp/tutorial-mcp/
**Builtin:** Yes.
**Transport:** Built-in.

**What it does.** Interactive step-by-step tutorials for learning Goose.

**Two tutorials shipped:**
- `build-mcp-extension` — build an MCP extension
- `first-game` — write your first game with Goose

**Install:** sidebar toggle.

**Overlap with Office Town:** **NONE.** Useful for users; ignore for our build.

---

### B.10 Developer Extension

**URL:** https://goose-docs.ai/docs/mcp/developer-mcp/
**Builtin:** Yes, **enabled by default**.
**Transport:** Built-in.

**What it does.** Core developer toolkit. Shell, file edit, code analysis, screenshots, image processing.

**Tools:**
| Tool | Purpose | Risk |
|---|---|---|
| `shell` | Execute shell commands | High |
| `text_editor` | Read, write, edit files | High |
| `analyze` | Read-only code structure analysis | Low |
| `screen_capture` | Take screenshots | Low |
| `image_processor` | Process + resize images | Low |

Permission modes: `auto`, `approve`, `smart_approve`, `chat`. `.gooseignore` for path-level control.

Environment variables inherited from parent process.

**Install:** pre-enabled. Toggle off via Extensions.

**Overlap with Office Town:** **PEER, NOT COMPETE.** Office Town's filesystem (R2-backed cloud filesystem) complements the local shell+editor. Users will use both — Developer for local code; Office Town for cross-device shared state.

---

### B.11 Computer Controller Extension

**URL:** https://goose-docs.ai/docs/mcp/computer-controller-mcp/
**Builtin:** Yes (toggle, not default).
**Transport:** Built-in.

**What it does.** Automates everyday computer tasks: search the web, control system settings, process files, control applications. Launches apps (Safari, Numbers), runs AppleScript/shell, scrapes data, creates CSVs.

**Tools (referenced types):**
- `computer_control` — system / application commands
- `web_search` — search queries
- `automation_script` — shell or AppleScript execution

**User must not touch mouse/keyboard while it runs.**

**Install:** sidebar toggle or `goose configure` → `computercontroller`.

**Overlap with Office Town:** **MINIMAL.** This is local OS control. Office Town's browser/devops scope is cloud-based (Cloudflare Browser Rendering). Different surface.

---

### B.12 Playwright Extension

**URL:** https://goose-docs.ai/docs/mcp/playwright-mcp/
**Builtin:** No. Official `@playwright/mcp` package.
**Transport:** STDIO via `npx`.

**What it does.** Cross-browser testing + web automation. Chromium + Firefox + WebKit. Uses accessibility tree (fast, LLM-friendly, no vision needed).

**Tools (subset shown):**
- `browser_navigate`
- `browser_click`
- `browser_take_screenshot`
- `browser_tab_new`
- `browser_generate_playwright_test`
- (Many more in the actual MCP — typing, fill, hover, snapshot, console, network, etc.)

**Install:**
```
npx -y @playwright/mcp@latest
```
Configure via `goose configure` → Command-line Extension → Name "Playwright" → 300s timeout.

**Overlap with Office Town:** **BROWSER overlap zone.** If Office Town ships a browser tool, decide: do we wrap Playwright, embed Cloudflare Browser Rendering, or just point users at this? Cloudflare-hosted browser has different perf/cost shape. **Recommendation:** ship CF Browser Rendering for cloud workflows; let users keep Playwright for local dev.

---

### B.13 Fetch Extension

**URL:** https://goose-docs.ai/docs/mcp/fetch-mcp/
**Builtin:** No. Official `mcp-server-fetch` Python package.
**Transport:** STDIO via `uvx`.

**What it does.** Fetches web content and converts to text/markdown.

**Tool:** `fetch(url, ...)` (canonical from `modelcontextprotocol/servers` repo).

**Install:**
```
uvx mcp-server-fetch
```
Or deeplink: `goose://extension?cmd=uvx&arg=mcp-server-fetch&id=fetch&name=Fetch&description=Web%20content%20fetching%20and%20processing%20capabilities`

**Known limitation.** Does NOT work with Google models (gemini-2.0-flash etc.) because it uses `format: uri` in its JSON schema and Google rejects.

**Source:** github.com/modelcontextprotocol/servers/tree/main/src/fetch

**Overlap with Office Town:** **SEARCH/BROWSER complement.** Lightweight HTTP fetch is fine to leave to this; Office Town's web fetch is the heavier scraping/extraction path (Cloudflare Browser Rendering + AI structured extraction).

---

### B.14 Firecrawl Extension

**URL:** https://goose-docs.ai/docs/mcp/firecrawl-mcp/
**Builtin:** No. Third-party (`firecrawl-mcp`).
**Transport:** STDIO via `npx`.

**What it does.** Web scraping + crawling at scale. Single-page scrape, batch URLs, depth-limited crawl, search-across-crawled.

**Install:**
```
npx -y firecrawl-mcp
```
Required env: `FIRECRAWL_API_KEY` (sign up at firecrawl.dev).

**Overlap with Office Town:** **SEARCH zone, paid-API competitor.** Office Town can either wrap Cloudflare Browser Rendering + AI extraction for free-tier crawling, or stay out of this niche and let users plug Firecrawl in. Recommended: ship a cheaper CF-based scraper, point users at Firecrawl for industrial-scale.

---

### B.15 PDF Reader Extension

**URL:** https://goose-docs.ai/docs/mcp/pdf-mcp/
**Builtin:** No. `mcp-read-pdf` Python package by Michael Neale.
**Transport:** STDIO via `uvx`.

**What it does.** Read and extract text from protected and unprotected PDFs.

**Tool:** `read_pdf` — extracts text from a PDF file. Supports specific page selection or full document.

**Install:**
```
uvx mcp-read-pdf
```
Deeplink: `goose://extension?cmd=uvx&arg=mcp-read-pdf&id=pdf_read&name=PDF%20Reader&description=Read%20large%20and%20complex%20PDF%20documents`

**Source:** github.com/michaelneale/mcp-read-pdf

**Overlap with Office Town:** **FILES adjacent.** Office Town stores files on R2; PDF extraction is an op we may want to expose. Easy win: wrap a CF-Worker PDF extractor as part of the files tool. Or leave standalone.

---

### B.16 Pieces for Developers Extension

**URL:** https://goose-docs.ai/docs/mcp/pieces-mcp/
**Builtin:** No. Requires PiecesOS installed locally.
**Transport:** STDIO via `uvx`.

**What it does.** Connects Goose to Pieces Long-Term Memory — a third-party persistent knowledge management system. Query activity history, generate status reports.

**Install:**
```
uvx --from pieces-cli pieces --ignore-onboarding mcp start
```
Prerequisites: install PiecesOS, enable Long-Term Memory Context.

**Overlap with Office Town:** **WIKI/MEMORY competitor (3rd party).** Office Town's wiki+memory is the equivalent functionality, cloud-hosted, no PiecesOS install needed. Users pick one.

---

### B.17 Repomix Extension

**URL:** https://goose-docs.ai/docs/mcp/repomix-mcp/
**Builtin:** No.
**Transport:** STDIO via `npx`.

**What it does.** Repository packing: compresses a codebase into AI-friendly format. Used for codebase analysis, architecture summaries, test generation, code exploration — all while staying within token limits.

**Install:**
```
npx -y repomix --mcp
```
Deeplink: `goose://extension?cmd=npx&arg=-y&arg=repomix&arg=--mcp&id=repomix&name=Repomix&description=Pack%20repositories%20into%20AI-friendly%20formats%20for%20goose`

**Overlap with Office Town:** **DEVOPS zone, complementary.** If Office Town ships a "summarise this repo" devops capability, can either wrap this or be additive.

---

### B.18 Council of Mine Extension

**URL:** https://goose-docs.ai/docs/mcp/council-of-mine-mcp/
**Builtin:** No. `mcp_council_of_mine` from github.com/block/mcp-council-of-mine.
**Transport:** STDIO via `uvx`.

**What it does.** Simulates deliberative discussions with 9 named AI personas (Pragmatist, Visionary, Systems Thinker, Optimist, Devil's Advocate, Mediator, User Advocate, Traditionalist, Analyst). They debate, vote, synthesise conclusions.

**Install:**
```
uvx --from git+https://github.com/block/mcp-council-of-mine mcp_council_of_mine
```

**Overlap with Office Town:** **NONE.** Multi-persona deliberation. Office Town can call into it for design reviews if useful; otherwise ignore.

---

### B.19 Cognee Extension

**URL:** https://goose-docs.ai/docs/mcp/cognee-mcp/
**Builtin:** No.
**Transport:** STDIO via `uv --directory ... run python src/server.py`.

**What it does.** Knowledge graph memory with 30+ data source connectors. Stores user preferences, project context, technical info as a graph. Cognee_cognify (store) and cognee_search (retrieve by graph completion).

**Required env:** `LLM_API_KEY` (OpenAI or compatible).
**Linux deps:** `libpq-dev`, `python3-dev`.

**Tools:**
- `cognee_cognify` — store into knowledge graph
- `cognee_search` — retrieve via graph completion

**Overlap with Office Town:** **WIKI/MEMORY competitor.** Office Town's hosted wiki is the cloud counterpart; Cognee is heavier (full graph DB), local-first, needs an LLM key for graph completion. Different audience.

---

### B.20 Code Mode Extension

**URL:** https://goose-docs.ai/docs/mcp/code-mode-mcp/
**Builtin:** Yes, platform extension.
**Transport:** Built-in (platform).

**What it does.** LLM writes JavaScript code that Goose executes (Deno-based runtime, "Port of Context") to discover tools, learn their interfaces, and invoke them programmatically. Reduces context-window cost when many extensions are enabled and many tool calls are needed.

**Tools exposed:** three meta-tools (specific names not in docs).

**Install:** `goose configure` → Toggle Extensions → enable `code_execution`.

**Overlap with Office Town:** **NEUTRAL.** Code Mode is an alternative invocation pattern. Office Town's tools will be callable from Code Mode automatically. Bonus: more tools → more Code Mode benefit.

---

### B.21 Auto Visualiser Extension

**URL:** https://goose-docs.ai/docs/mcp/autovisualiser-mcp/
**Builtin:** Yes, platform extension.
**Transport:** Built-in (platform). Renders inline as MCP Apps.

**What it does.** Automatically generates interactive data visualisations inline in chat. Detects appropriate chart type from data.

**Visualisation types:**
- Sankey diagrams (flow)
- Radar charts (multi-dim compare)
- Pie/donut (categorical)
- Treemaps (hierarchical)
- Chord diagrams (relationships)
- Interactive maps (Leaflet, geographic)
- Mermaid (flowcharts, sequence, Gantt)
- Line/bar/scatter (time series)

Features: inline + fullscreen + picture-in-picture, hover/zoom, multiple visualisations per response, HTML export.

**Install:** sidebar toggle or `goose configure` → enable `autovisualiser`.

**Overlap with Office Town:** **NONE; SYNERGY.** Office Town tool outputs (kanban dashboards, project timelines) can be rendered through Auto Visualiser if we return appropriately structured data. Use as a downstream consumer.

---

### B.22 Excalidraw Extension

**URL:** https://goose-docs.ai/docs/mcp/excalidraw-mcp/
**Builtin:** No. Remote-hosted MCP App.
**Transport:** **Streamable HTTP** — endpoint: `https://excalidraw-mcp-app.vercel.app/mcp`

**What it does.** Hand-sketched Excalidraw diagrams generated in real time. MCP App (renders in chat).

**Install:** `goose configure` → Remote Extension (Streamable HTTP) → URL above.

Deeplink:
```
goose://extension?cmd=http&id=excalidraw&name=Excalidraw&url=https%3A%2F%2Fexcalidraw-mcp-app.vercel.app%2Fmcp&description=Excalidraw%20MCP%20App%20for%20AI-powered%20diagramming
```

**Overlap with Office Town:** **NONE.** Pure diagramming. Reference example of a remote streamable-HTTP MCP App — useful as architecture template for Office Town's wiki tool (we could ship Office Town this same way).

---

### B.23 Container Use Extension

**URL:** https://goose-docs.ai/docs/mcp/container-use-mcp/
**Builtin:** No. Docker + Dagger based.
**Transport:** STDIO (`container-use stdio`) OR remote MCP (`npx -y mcp-remote https://container-use.com/mcp`).

**What it does.** Runs Goose-driven work inside isolated, containerised environments. Feature dev on isolated Git branches, dep installation, test runs (pytest), DB experiments (SQLite shown), file modifications — all sandboxed from main code.

**Install (local):**
```
container-use stdio
```
**Install (remote):**
```
npx -y mcp-remote https://container-use.com/mcp
```
Requires Docker locally (for local mode). Node for remote.

**Overlap with Office Town:** **SANDBOX zone.** This is heavy local container ops. Office Town could ship a cloud sandbox (Cloudflare Workers / Containers) as a counterpart — lighter weight, no local Docker. Different audience.

---

### B.24 Extension Manager Extension

**URL:** https://goose-docs.ai/docs/mcp/extension-manager-mcp/
**Builtin:** Yes, platform extension, enabled by default.
**Transport:** Built-in (platform).

**What it does.** Dynamically discovers, enables, and disables extensions during a session. Goose recognises when it needs an extension and enables it on demand.

**Tools:**
| Tool | Purpose |
|---|---|
| `search_available_extensions` | Discover extensions that can be enabled/disabled |
| `manage_extensions` | Enable or disable an extension by name |
| `list_resources` | List resources from extensions (if supported) |
| `read_resource` | Read specific resource content (if supported) |

**Optimisation guidance from docs:** keep active extensions under 5 and total tools under 50 to avoid context-window overflow.

**Install:** sidebar toggle or `goose configure` → enable `extensionmanager`.

**Overlap with Office Town:** **HOW WE SHIP.** Office Town is itself an extension that Extension Manager will offer to users. Make sure Office Town is in the registry that `search_available_extensions` queries. (Goose's extension registry feeds the Extensions Directory at `/extensions` — submission process not documented here.)

---

### B.25 goose Docs Extension

**URL:** https://goose-docs.ai/docs/mcp/goose-docs-mcp/
**Builtin:** No. GitMCP-based.
**Transport:** STDIO via `npx mcp-remote` against a GitMCP-hosted endpoint.

**What it does.** Lets Goose answer questions about itself by reading the Goose docs repo.

**Install:**
```
npx mcp-remote https://block.gitmcp.io/goose/
```
Deeplink: `goose://extension?cmd=npx&arg=mcp-remote&arg=https%3A%2F%2Fblock.gitmcp.io%2Fgoose%2F`

**Interesting pattern.** GitMCP converts any Git repo into an MCP server. Useful template if we want to expose any Office Town repo content as an MCP.

**Overlap with Office Town:** **NONE.** Reference template only.

---

## Part C — Office Town Strategic Synthesis

### C.1 What Office Town REPLACES

| Goose extension | Why we win |
|---|---|
| **Memory** | Local flat files → cloud R2+D1, cross-device, search, audit, no single-machine constraint |
| **Knowledge Graph Memory (KGM)** | Local JSON graph → hosted wiki with entities-as-folders, decisions, projects, organisations |
| **Pieces** | Local PiecesOS dep → no install needed, cloud-native |
| **Cognee** | Local Python + LLM_API_KEY → hosted, single-prompt install |

### C.2 What Office Town LEANS ON

| Goose extension | How we use it |
|---|---|
| **Summon** | Office Town ships skills as `~/.agents/skills/office-town-*/SKILL.md`. Summon discovers + loads them automatically. |
| **Apps** | Office Town can render wiki pages, kanban boards, dashboards as MCP App resources (HTML + postMessage bridge). |
| **Top Of Mind (tom)** | Ship a default `GOOSE_MOIM_MESSAGE_FILE` snippet at install — "Always check office-town wiki first, always log decisions to office-town, …" |
| **Auto Visualiser** | Office Town outputs structured data → visualiser renders dashboards for free. |
| **Extension Manager** | Office Town listed in registry so Goose can auto-enable. |
| **Code Mode** | Office Town tools are callable from JS code automatically; more tools = more value here. |
| **Chat Recall** | Complementary — Office Town writes session summaries to wiki at session end. |

### C.3 What Office Town COMPETES WITH (different positioning)

| Goose extension | Positioning split |
|---|---|
| **Computer Controller** | Local OS automation → we don't compete. |
| **Playwright** | Local browser dev → we offer cloud-hosted browser (Cloudflare Browser Rendering) for headless cloud workflows. |
| **Fetch** | Lightweight HTTP → we offer heavier scrape+extract via CF Browser Rendering + AI. |
| **Firecrawl** | Industrial scraping at $X/mo → we offer "good enough" CF-based scraper for free tier. |
| **Container Use** | Local Docker sandbox → we offer cloud sandbox (CF Workers / Containers) — no local Docker needed. |
| **PDF Reader** | Standalone PDF text extraction → we wrap inside our files tool as one of many ops. |

### C.4 What Office Town can SKIP

Tutorial, Council of Mine, Excalidraw, goose Docs, Skills (deprecated), Repomix, Todo (in-session checklists, our kanban is different).

### C.5 Distribution model

Office Town can ship as either or both:
1. **Single STDIO MCP** — `npx office-town-mcp` or `uvx office-town`. Install via `goose configure` → Command-line Extension. Easy install via deeplink.
2. **Streamable-HTTP remote MCP** — `https://officetown.au/mcp`. Install via `goose configure` → Remote Extension (Streamable HTTP). One-click via deeplink:
   ```
   goose://extension?url=https%3A%2F%2Fofficetown.au%2Fmcp&type=streamable_http&timeout=300&id=officetown&name=Office%20Town&description=...
   ```

Given Cloudflare backing → **streamable-HTTP remote MCP is the natural fit** (no local install, no Node/Python prereq, instant deeplink). Maps directly to Excalidraw's distribution model.

### C.6 Tool surface design — follow gateway pattern

From `~/.claude/rules/mcp-gateway-pattern.md`: prefer 7-10 gateway tools with `action` parameter over many small tools. The Goose docs' "≤50 total tools across active extensions" guidance from Extension Manager confirms this.

Office Town gateways (proposed, matching the planned scope):
- `wiki` (actions: get, search, write, list, history) — replaces Memory + KGM
- `files` (actions: get, put, list, delete, share, extract_pdf) — replaces PDF Reader
- `browser` (actions: navigate, screenshot, extract, scrape) — competes with Playwright/Fetch/Firecrawl on cloud-native side
- `email` (actions: send, draft, list, read) — new capability
- `kanban` (actions: list, create_card, move, comment) — new capability
- `cron` (actions: schedule, list, cancel, run_now) — new capability
- `voice` (actions: speak, transcribe) — new capability
- `sandbox` (actions: run, fetch_output, snapshot) — competes with Container Use
- `search` (actions: web, internal_wiki) — composes wiki+web

That's 9 gateways, well under the 10 sweet spot.

### C.7 Skills to ship with Office Town

Drop these in `~/.agents/skills/` so Summon picks them up:

- `office-town-wiki-workflow` — how to use wiki
- `office-town-files-workflow` — file ops patterns
- `office-town-decisions` — capture decisions to wiki at session end
- `office-town-kanban` — kanban best practice
- `office-town-cron-setup` — scheduling patterns

Each is `<dir>/SKILL.md` with YAML frontmatter (`name`, `description`).

### C.8 Top-of-mind snippet

Install a `~/.config/office-town/tom.md` and instruct user to set:
```bash
export GOOSE_MOIM_MESSAGE_FILE=~/.config/office-town/tom.md
```

Contents:
```
OFFICE TOWN ACTIVE:
- Check wiki before researching from scratch
- Log decisions, plans, session narratives to wiki
- Use kanban for multi-step work, not in-session todos for anything that crosses sessions
- Files go to office-town files tool, not local /tmp
- Save credentials lookups to office-town secrets, not env files
```

### C.9 Recipe templates worth shipping

Bundle a few starter recipes that lean on Office Town:

```yaml
# ~/.config/goose/recipes/office-town-research.yaml
title: Office Town Research
description: Research a topic, store findings in wiki
prompt: |
  Research the following topic. First check our wiki for existing notes.
  If new info is needed, fetch from web. Write findings as a wiki page.
parameters:
  - key: topic
    input_type: string
    requirement: required
    description: research topic
extensions:
  - type: streamable_http
    name: office-town
    url: https://officetown.au/mcp
    timeout: 300
  - type: builtin
    name: developer
    timeout: 300
    bundled: true
```

Plus an RPI-style trio that uses Office Town's wiki for `thoughts/research/` and `thoughts/plans/` paths.

### C.10 Hard constraints we now know

- Extension Manager wants <5 active + <50 tools — design gateway tools accordingly.
- MCP App MIME: `text/html;profile=mcp-app`, URI: `ui://office-town/<resource-path>`, `_meta.ui` block required.
- Recipe parameters with `requirement: optional` MUST have `default:`. File-typed parameters cannot have defaults.
- `prompt:` (not just `instructions:`) is required for headless execution — ship recipes with both.
- Sub-recipe `path:` is relative to the parent recipe file.
- Same sub-recipe with different params is parallel-by-default (up to 10 workers). Set `sequential_when_repeated: true` for serial.
- Subagents run as fresh Goose sessions; output gets returned to parent context — return terse.
- Goose docs use `block.github.io/goose` historically and `goose-docs.ai` currently — old links may redirect.
- The Skills extension is deprecated since v1.25.0 → write skills for Summon.
- Streamable-HTTP MCPs install via `goose://extension?url=...&type=streamable_http` deeplinks — the cleanest one-click install path.

---

## Part D — Reference URLs (verified)

### Tutorials
- Custom Extensions: https://goose-docs.ai/docs/tutorials/custom-extensions
- Building MCP Apps: https://goose-docs.ai/docs/tutorials/building-mcp-apps
- Headless Goose: https://goose-docs.ai/docs/tutorials/headless-goose
- RPI Pattern: https://goose-docs.ai/docs/tutorials/rpi/
- Subrecipes in Parallel: https://goose-docs.ai/docs/tutorials/subrecipes-in-parallel/
- Subagents tutorial fragment: https://goose-docs.ai/docs/tutorials/subagents/

### Guides
- Subagents guide: https://goose-docs.ai/docs/guides/subagents/
- Using Skills: https://goose-docs.ai/docs/guides/context-engineering/using-skills/
- Recipe Reference: https://goose-docs.ai/docs/guides/recipes/recipe-reference
- Using Extensions: https://goose-docs.ai/docs/getting-started/using-extensions/

### MCP Extensions
- Memory: https://goose-docs.ai/docs/mcp/memory-mcp/
- Knowledge Graph Memory: https://goose-docs.ai/docs/mcp/knowledge-graph-mcp/
- Apps: https://goose-docs.ai/docs/mcp/apps-mcp/
- Summon: https://goose-docs.ai/docs/mcp/summon-mcp/
- Skills (deprecated): https://goose-docs.ai/docs/mcp/skills-mcp/
- Top Of Mind (tom): https://goose-docs.ai/docs/mcp/tom-mcp/
- Chat Recall: https://goose-docs.ai/docs/mcp/chatrecall-mcp/
- Todo: https://goose-docs.ai/docs/mcp/todo-mcp/
- Tutorial: https://goose-docs.ai/docs/mcp/tutorial-mcp/
- Developer: https://goose-docs.ai/docs/mcp/developer-mcp/
- Computer Controller: https://goose-docs.ai/docs/mcp/computer-controller-mcp/
- Playwright: https://goose-docs.ai/docs/mcp/playwright-mcp/
- Fetch: https://goose-docs.ai/docs/mcp/fetch-mcp/
- Firecrawl: https://goose-docs.ai/docs/mcp/firecrawl-mcp/
- PDF Reader: https://goose-docs.ai/docs/mcp/pdf-mcp/
- Pieces: https://goose-docs.ai/docs/mcp/pieces-mcp/
- Repomix: https://goose-docs.ai/docs/mcp/repomix-mcp/
- Council of Mine: https://goose-docs.ai/docs/mcp/council-of-mine-mcp/
- Cognee: https://goose-docs.ai/docs/mcp/cognee-mcp/
- Code Mode: https://goose-docs.ai/docs/mcp/code-mode-mcp/
- Auto Visualiser: https://goose-docs.ai/docs/mcp/autovisualiser-mcp/
- Excalidraw: https://goose-docs.ai/docs/mcp/excalidraw-mcp/
- Container Use: https://goose-docs.ai/docs/mcp/container-use-mcp/
- Extension Manager: https://goose-docs.ai/docs/mcp/extension-manager-mcp/
- goose Docs: https://goose-docs.ai/docs/mcp/goose-docs-mcp/
