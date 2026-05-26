# Office Town Plugin Manifest

How Office Town is packaged for distribution via [Open Plugin Spec v1.0.0](https://github.com/vercel-labs/open-plugin-spec). This is the spec Goose committed to adopting in their May 2026 roadmap (https://github.com/aaif-goose/goose/discussions/9173).

## Directory layout

```
office-town-plugin/                            ← the repo
├── .plugin/
│   └── plugin.json                            ← manifest
├── agents/                                    ← role definitions
│   ├── boss.md
│   ├── librarian.md
│   ├── worker.md
│   └── scout.md
├── skills/                                    ← per-role techniques
│   ├── curate/SKILL.md
│   ├── extract/SKILL.md
│   ├── build/SKILL.md
│   ├── scan/SKILL.md
│   └── dispatch/SKILL.md
├── commands/                                  ← slash-command recipes
│   ├── weekly-news-sweep.yaml
│   ├── knowledge-graduation.yaml
│   ├── project-onboarding.yaml
│   ├── client-quote-draft.yaml
│   └── status-report.yaml
├── hooks/
│   └── hooks.json                             ← lifecycle hooks
├── rules/                                     ← town-wide standing orders
│   └── office-town-rules.md
├── README.md
└── LICENSE                                    ← MIT
```

## Manifest (`.plugin/plugin.json`)

```json
{
  "$schema": "https://raw.githubusercontent.com/vercel-labs/open-plugin-spec/main/schemas/plugin.json",
  "name": "office-town",
  "version": "0.1.0",
  "description": "Business-shaped AI agent fleet on Goose. Roles, skills, recipes, hooks bundled together. Pairs with Office Town Cloud (https://github.com/jezweb/office-town-cloud) for the backend.",
  "author": "Jezweb Pty Ltd",
  "license": "MIT",
  "homepage": "https://office-town.au",
  "repository": "https://github.com/jezweb/office-town-plugin",
  "keywords": ["office-town", "agent-fleet", "business", "knowledge-management"],
  "skills": ["skills"],
  "agents": ["agents"],
  "commands": ["commands"],
  "rules": ["rules"],
  "hooks": "hooks/hooks.json",
  "mcpServers": {
    "office-town-wiki": {
      "type": "streamable-http",
      "url": "${OFFICE_TOWN_CLOUD_URL}/api/mcp/wiki",
      "headers": {
        "Authorization": "Bearer ${OFFICE_TOWN_CLOUD_TOKEN}"
      }
    },
    "office-town-share": {
      "type": "streamable-http",
      "url": "${OFFICE_TOWN_CLOUD_URL}/api/mcp/share",
      "headers": {
        "Authorization": "Bearer ${OFFICE_TOWN_CLOUD_TOKEN}"
      }
    },
    "office-town-cron": {
      "type": "streamable-http",
      "url": "${OFFICE_TOWN_CLOUD_URL}/api/mcp/cron",
      "headers": {
        "Authorization": "Bearer ${OFFICE_TOWN_CLOUD_TOKEN}"
      }
    },
    "office-town-search": {
      "type": "streamable-http",
      "url": "${OFFICE_TOWN_CLOUD_URL}/api/mcp/search",
      "headers": {
        "Authorization": "Bearer ${OFFICE_TOWN_CLOUD_TOKEN}"
      }
    }
  },
  "config": {
    "envVars": [
      {
        "name": "OFFICE_TOWN_CLOUD_URL",
        "description": "URL of your deployed Office Town Cloud (e.g., https://office-town.your-account.workers.dev)",
        "required": true
      },
      {
        "name": "OFFICE_TOWN_CLOUD_TOKEN",
        "description": "Bearer token from your Office Town Cloud deployment (output of deploy script)",
        "required": true,
        "secret": true
      }
    ]
  }
}
```

## Namespacing

Per the Open Plugin Spec, components are namespaced by plugin name:

| Component | Namespaced form |
|---|---|
| Skill `curate` | `office-town:curate` |
| Agent `librarian` | `office-town:librarian` |
| Slash command `weekly-news-sweep` | `office-town:weekly-news-sweep` |
| Wiki MCP tool `search` | `mcp__plugin_office-town_wiki__search` |
| Share MCP tool `share` | `mcp__plugin_office-town_share__share` |

No conflicts with other plugins users might install.

## Installation flow

```bash
# User runs:
goose plugin install jezweb/office-town

# Goose:
# 1. Clones the repo to ~/.agents/plugins/office-town/
# 2. Reads .plugin/plugin.json
# 3. Discovers agents in ./agents, skills in ./skills, commands in ./commands
# 4. Asks user to set OFFICE_TOWN_CLOUD_URL + OFFICE_TOWN_CLOUD_TOKEN (env vars)
# 5. Registers MCP servers with namespaced tool names
# 6. Installs hooks (SessionStart, SessionEnd)
# 7. Restart Goose extension manager → ready
```

After install:
- `@-mention` autocomplete shows `@boss`, `@librarian`, `@worker`, `@scout` (or `@office-town:boss` if user prefers explicit namespacing)
- Slash command autocomplete shows `/weekly-news-sweep`, `/knowledge-graduation`, etc.
- Skills are loadable on demand via the Summon extension
- Wiki / share / cron / search MCPs are reachable via tool calls

## Cross-host portability

The Open Plugin Spec is intentionally vendor-neutral. If Claude Code, Cursor, or another agent host adopts the spec (per the Open Plugin Spec roadmap), `office-town-plugin` installs and runs there too — same `.plugin/plugin.json`, same components, same behaviour. No host-specific forks.

## Component file formats

### Agent file (`agents/<name>.md`)

```markdown
---
name: librarian
description: Extracts and curates wiki knowledge — the wiki's growth engine
---

# Librarian

[role body — identity, voice, wake-up routine, what I do, what I don't do, etc.]
```

Same shape as our existing role files. Open Plugin Spec defers to Agent Skills spec for the body conventions.

### Skill file (`skills/<name>/SKILL.md`)

```markdown
---
name: curate
description: How to graduate findings into the wiki/knowledge collection
---

# Curate skill

[step-by-step procedure: review findings, identify portable patterns, write concept.md, log audit row]
```

Skills can be loaded on demand via Summon (`load <name>`).

### Command file (`commands/<name>.yaml`)

```yaml
name: weekly-news-sweep
description: Scout sweeps for AI news, librarian files findings
parameters:
  week:
    type: string
    description: Week (YYYY-WW) to sweep for
    required: true
instructions: |
  Run a weekly AI news sweep. The scout reviews the past week's
  AI/agent industry news, identifies 3-5 patterns, writes findings
  to scout/findings/. The librarian then reviews and graduates
  portable patterns to wiki/knowledge/.
extensions: [office-town-wiki, web-search]
```

### Hook file (`hooks/hooks.json`)

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "command": "${PLUGIN_ROOT}/hooks/scripts/session-start.sh",
      "timeout": 5000
    },
    {
      "event": "SessionEnd",
      "command": "${PLUGIN_ROOT}/hooks/scripts/session-end.sh",
      "timeout": 5000
    }
  ]
}
```

`${PLUGIN_ROOT}` is substituted with the plugin's absolute path on the user's machine.

### Rule file (`rules/<name>.md`)

Town-wide standing orders, injected as MOIM / persistent instructions:

```markdown
# Office Town standing orders

Always cite sources when writing to the wiki. Every fact has a URL,
file path, or finding reference. Drop notes in findings/ for the
librarian to graduate when patterns surface.
```

## How packs extend the plugin

Role packs (`office-town-pack-business`, etc.) are separate plugins with the same shape:

```
office-town-pack-business/
├── .plugin/plugin.json
├── agents/
│   ├── estimator.md
│   ├── project-manager.md
│   ├── product-manager.md
│   ├── marketer.md
│   └── writer.md
├── skills/
│   ├── estimate/SKILL.md
│   ├── outreach/SKILL.md
│   └── ...
└── commands/
    ├── new-client-proposal.yaml
    └── ...
```

Manifest declares `name: office-town-pack-business`, plus the core dependency:

```json
{
  "name": "office-town-pack-business",
  "dependencies": {
    "office-town": ">=0.1.0"
  }
}
```

(Open Plugin Spec v1.0 doesn't mandate dependencies; this is an extension for our use.)

## Validation

Per spec, hosts MUST:
- Parse `.plugin/plugin.json`
- Respect manifest-declared paths
- Support at least one core component type (skills or MCP servers)
- Expand `${PLUGIN_ROOT}` in runtime configs

Hosts MAY ignore extended components (commands, agents, rules, hooks, LSP, output styles). Goose's roadmap confirms support for skills + MCP at minimum, with hooks gated behind an alpha flag.

## Open question

**Should we publish to a marketplace index?** Open Plugin Spec Appendix B defines marketplace indexing but it's not required for v1 conformance. For now: GitHub repo URL is the install method. Marketplace is a v2 consideration.
