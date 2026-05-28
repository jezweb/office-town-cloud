# Goose Self-Improvement Survey

**Date:** 2026-05-28
**Source material:** `goose-knowledge-02-recipes-tools-config.md`, `goose-knowledge-03-custom-extensions-and-existing.md`, live docs at `goose-docs.ai`, source code at `~/Documents/goose/crates/goose/`.
**Question:** What durable artefacts can a Goose agent create AT RUNTIME that affect future sessions, and how do they get picked up?

The headline: Goose has more self-improvement surface than Claude Code does, but the auto-loading paths almost all require a **session restart** to take effect. The exception is Summon-loaded skills (re-scanned on every `load` call) and the Memory MCP's `retrieve_memories` tool (re-reads disk every call). For "the agent writes a thing; the next user session benefits" the picture is good. For "the agent writes a thing and uses it before the session ends" the picture is narrower than the docs suggest.

---

## A. Recipes (YAML workflows)

**Status: WORKS.**

- Can an agent write a recipe at runtime? **YES** — recipes are just YAML files on disk. An agent with `developer:text_editor` or shell access can `write` to `~/.config/goose/recipes/<name>.yaml` or `<project>/.goose/recipes/<name>.yaml`. ([knowledge-02 §12](goose-knowledge-02-recipes-tools-config.md))
- Where do recipes live: global `~/.config/goose/recipes/`, project `<cwd>/.goose/recipes/`, or any path on `GOOSE_RECIPE_PATH`, or a GitHub repo via `GOOSE_RECIPE_GITHUB_REPO`. ([§12](goose-knowledge-02-recipes-tools-config.md))
- Discovery: `goose recipe list` searches CWD → `GOOSE_RECIPE_PATH` → global → project → GitHub, in that order. ([§12](goose-knowledge-02-recipes-tools-config.md))
- Recursion: a recipe can declare `sub_recipes:` with `path:` (relative to the parent's directory via `{{ recipe_dir }}`). Yes, a recipe can call itself or others. ([§13](goose-knowledge-02-recipes-tools-config.md))
- Hot-reload behaviour: **the recipe file itself is re-read every time the recipe is invoked** — recipes aren't cached at session start. So an agent writing a new recipe mid-session can immediately invoke it via `goose run --recipe <path>` from the shell, OR — more usefully — a future session picks it up automatically. The Goose CLI subcommand `goose recipe list` re-scans disk every call.
- YAML schema (top-level): `version` (string, default "1.0.0"), `title` ✅, `description` ✅, `instructions` ✅* OR `prompt` ✅* (at least one required, `prompt` mandatory for headless), `extensions[]`, `settings`, `parameters[]`, `activities[]`, `sub_recipes[]`, `response`, `retry`. ([§11](goose-knowledge-02-recipes-tools-config.md))

**Practical implication for Office Town**: a curator/librarian writing a `recipes/<name>.yaml` for a known repeatable workflow is the highest-confidence self-improvement primitive. Trivially safe; no restart needed for ad-hoc invocation; auto-discovered next session.

---

## B. Skills

**Status: PARTIAL — first-class Goose primitive, with a hot-load path.**

- Skills are **native Goose** as of v1.16.0, replaced by **Summon** in v1.25.0+ (deprecated Skills extension still works but new code targets Summon). Same on-disk format. ([knowledge-03 §B.4-B.5](goose-knowledge-03-custom-extensions-and-existing.md))
- Where they live: `~/.agents/skills/`, `<project>/.agents/skills/`, `~/.agents/plugins/<plugin>/skills/`. Legacy `.goose/skills/` etc. still scanned. ([§A.7, §5 in knowledge-02](goose-knowledge-02-recipes-tools-config.md))
- Format: `<skill-name>/SKILL.md` with YAML frontmatter `name:` + `description:`, body in markdown. Can include supporting files (templates, scripts, etc.). ([§5](goose-knowledge-02-recipes-tools-config.md))
- Discovery at session start: Goose scans all skill dirs, injects the `name + description` of each skill into the system instructions so the LLM knows what's available. Full body only loaded when the skill is invoked. ([live docs verified](https://goose-docs.ai/docs/guides/context-engineering/using-skills))
- **Mid-session hot-load**: Source inspection (`crates/goose/src/skills/client.rs` line 111) confirms `discover_skills()` is called **fresh on every Summon `load` invocation** — so a skill file written mid-session is loadable mid-session via Summon's `load` tool or via `/skills <name>`. The skill won't be auto-suggested by the LLM (that needs the session-start scan), but it will be found if explicitly named or loaded.
- Live docs note: "If you update a hint file and want goose to pick up the new content reliably, restart the session" — that applies to `.goosehints`, NOT skills.

**Practical implication for Office Town**: skills are the closest match to Claude Code Skills. We can write `~/.agents/skills/office-town-<name>/SKILL.md` files at runtime via the curator agent. Future sessions auto-discover and inject descriptions; current session can load explicitly via `/skills`. We don't need to invent our own primitive.

---

## C. Custom extensions / MCP servers

**Status: PARTIAL — adding existing servers is configurable at runtime; creating new ones requires a deploy.**

- Add an existing MCP server from a known URL/command: **YES, at runtime via config write**. An agent can append to `~/.config/goose/config.yaml` under `extensions:` (with `type: stdio | streamable_http | builtin | platform | frontend | inline_python`). ([§23](goose-knowledge-02-recipes-tools-config.md))
- Hot-load mid-session: **partial.** The session-start `ExtensionManager` snapshot doesn't auto-pick-up new entries. BUT Goose exposes `/extension <command>` and `/builtin <name>` slash commands to add extensions mid-session, AND there's an **Extension Manager** MCP extension (built-in, enabled by default) with `manage_extensions` and `search_available_extensions` tools that an agent can call to enable/disable extensions during a session. ([§B.24 in knowledge-03](goose-knowledge-03-custom-extensions-and-existing.md))
- Create a brand-new MCP server (write code + spin up): **NO** for any non-trivial case. STDIO MCP requires installing a Python/Node package; streamable-HTTP MCP requires deploying a server. An agent CAN write the code, but bringing it online needs `wrangler deploy` (Office Town's CF case) or `uvx`/`uv pip install` (local). Not a mid-session move.
- Add a tool to an existing MCP server: **depends.** If the server is hosted by Office Town itself (Cloudflare Worker), the agent can hot-deploy. If it's a third-party server, the agent has to extend the server code and redeploy — same constraints as creating one.
- `inline_python` extension type is interesting: a recipe declares Python code inline that becomes an extension. An agent writing a recipe with `type: inline_python` could effectively add tools without a deploy — but it's recipe-scoped, not session-scoped. ([§A.7](goose-knowledge-03-custom-extensions-and-existing.md))

**Practical implication for Office Town**: pivot point. We do NOT need to make agents "create new MCP servers" — they should USE the existing Office Town MCP suite, write skills/recipes that *use* the tools, and let the Office Town team add new tools when warranted. The `manage_extensions` tool from Extension Manager is a genuine mid-session hot-enable surface; worth wiring into the curator's repertoire.

---

## D. Memory / context persistence

**Status: WORKS for write-and-retrieve; PARTIAL for auto-inject.**

- Goose ships a **Memory MCP extension** (built-in, toggleable). Storage: `.goose/memory/` (project) and `~/.config/goose/memory/` (global). Files on disk; categorised; supports `is_global` flag and tags. ([§B.1 knowledge-03](goose-knowledge-03-custom-extensions-and-existing.md))
- Four tools: `remember_memory(category, data, tags, is_global)`, `retrieve_memories(category, is_global)` (use `"*"` for all), `remove_memory_category`, `remove_specific_memory`. ([§8 knowledge-02](goose-knowledge-02-recipes-tools-config.md))
- Auto-inject behaviour (source inspection, `crates/goose-mcp/src/memory/mod.rs` lines 105-145): On `MemoryServer::new()`, the extension reads all global memories and **bakes them into its `instructions` string** which is the MCP `instructions` block surfaced to the LLM. This happens **once when the extension starts** — typically at session start. New memories written mid-session via `remember_memory` are persisted to disk but are NOT auto-injected into the system instructions until next session.
- Mid-session retrieval: source confirms `retrieve` reads the file from disk fresh on every call. So `retrieve_memories` mid-session DOES see freshly-written entries. The LLM just doesn't see them automatically; it has to explicitly call the tool. ([memory/mod.rs line 245](file:///Users/jez/Documents/goose/crates/goose-mcp/src/memory/mod.rs))
- Trigger words ("remember", "forget", "memory", "save", etc.) prompt the LLM to invoke the tools. ([§B.1 knowledge-03](goose-knowledge-03-custom-extensions-and-existing.md))
- Relationship to `.goosehints` / `AGENTS.md`: orthogonal. `.goosehints` is loaded at session start as static context. Memory is dynamic per-call. `tom` / `GOOSE_MOIM_MESSAGE_FILE` is re-injected every turn (the only "really live" channel). ([§6, §B.6](goose-knowledge-02-recipes-tools-config.md))

**Practical implication for Office Town**: the Memory MCP's tool signature is the de-facto interface for "agents write durable facts". Office Town's wiki/curator should expose `remember_memory`-compatible signatures (matching the Goose MCP) so the existing trigger-word UX works. Crucially, for any memory we want the LLM to SEE automatically next turn, we need to surface it via Office Town's MCP `instructions` block or via `tom`/MOIM — `remember_memory` alone defers the awareness until next session.

---

## E. Hooks

**Status: PARTIAL — first-class, plenty of events, but loaded once per session.**

- 11 event types: `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `BeforeReadFile`, `AfterFileEdit`, `BeforeShellExecution`, `AfterShellExecution`. ([§2 knowledge-02](goose-knowledge-02-recipes-tools-config.md))
- File format: `hooks.json` inside `<plugin>/hooks/` with `{ hooks: { EventName: [{ matcher, hooks: [{ type, command, timeout }] }] } }`. Scripts in `<plugin>/scripts/`, referenced via `${PLUGIN_ROOT}`.
- Locations: `~/.agents/plugins/<plugin>/hooks/hooks.json` (user) or `<project>/.agents/plugins/<plugin>/hooks/hooks.json` (project).
- Runtime modification: **source inspection confirms hooks are loaded once at Agent construction** (`agents/agent.rs` line 333: `HookManager::load(...)` in `Agent::new`). New hooks added mid-session are NOT picked up. Restart required.
- Failure behaviour: "Hook failures are logged but do not crash goose or the tool that triggered the hook" — safe to add experimental hooks.
- Payload: JSON via stdin with `event`, `session_id`, `tool_name`, `tool_input`, `working_dir`, etc.

**Practical implication for Office Town**: hooks are a powerful way to make the agent more reliable across sessions (e.g. `SessionEnd` hook that runs the curator). An agent writing a hook file mid-session needs the user to restart. Reasonable to ask the curator to write `~/.agents/plugins/office-town/hooks/hooks.json` so the next session has the hook live — that's a real self-improvement.

---

## F. Persona / agent configuration

**Status: PARTIAL — recipes carry the closest thing to a "persona"; runtime self-modification limited.**

- Goose doesn't have a "personas" concept distinct from recipes. A recipe with `title`, `description`, `instructions`, `prompt`, `extensions`, and `settings` IS effectively a persona definition. The recipe's `instructions` field sets the system prompt for the session run by that recipe.
- Can an agent at runtime create a NEW recipe/persona (write the YAML)? **YES** — covered in §A.
- Can an agent at runtime modify its own system prompt / tool whitelist mid-session? **NO** — once the session is running, the system prompt is fixed and the extension list (with its tools) is locked. The closest mid-session moves are `tom`/MOIM injecting persistent text every turn, and the Extension Manager extension enabling/disabling extensions on the fly.
- Per-project agent overrides: **YES via `<project>/.goose/`, `<project>/.agents/`, `<project>/.goosehints`** — project scoping works.
- Per-project `config.yaml`: NOT documented. Config is global only. So an agent can't ship a different model/provider per project via config — only via per-recipe `settings:`.

**Practical implication for Office Town**: "personas" should be implemented as recipes. The curator can write new recipes — but cannot reach into the currently-running session's system prompt. For mid-session steering, the only knob is the MCP `instructions` blocks we control (via Office Town's own MCP) and `tom`/MOIM if the user has it configured.

---

## G. Configuration files

**Status: WORKS — but be cautious.**

- Goose's main config: `~/.config/goose/config.yaml`. Plus `permission.yaml`, `secrets.yaml`, `permissions/tool_permissions.json`, `prompts/`, `recipes/`, `memory/`, `.gooseignore`, `.goosehints`, `settings.json`. ([§23 knowledge-02](goose-knowledge-02-recipes-tools-config.md))
- The `Config` struct (in source) does support hot reload of values, but **not every consumer re-reads the config every call**. Things wired at `Agent::new` (extensions list, hooks) require restart even if the file is updated.
- An agent CAN modify `config.yaml` (it's just YAML). Should it? Cautiously yes — registering a slash command, enabling an extension, adding a `GOOSE_*` setting are all valid self-improvement moves. Sensitive territory: do not let the agent edit `secrets.yaml` or anything related to provider credentials.
- What lives where:
  - **Config:** provider/model defaults, extensions registered, slash commands, security settings.
  - **Agent definitions / personas:** recipes (in `recipes/`).
  - **Extensions:** MCP servers/tools (running processes or HTTP endpoints; declared in config or per-recipe).

**Practical implication for Office Town**: writing recipes (§A), skills (§B), and `tom` files (§D) is safe and useful. Writing to `config.yaml` to register slash commands or enable extensions is technically possible but requires a restart to fully take effect, and risks corrupting the user's config — pre-flight check needed before any edit.

---

## H. The composite "self-improving agent" loop

**Status: WORKS at session-boundary granularity; PARTIAL within a single session.**

Given the above, the minimum-viable self-improvement loop in Goose **today**:

1. **Mid-session:** agent does some work, observes a useful pattern.
2. **Mid-session:** agent calls a curator tool (could be Office Town's own MCP) that synthesises the pattern into a **skill** (`SKILL.md`) and/or a **recipe** (`recipe.yaml`) and/or a **memory entry** (`remember_memory`) and/or appends to `tom`/MOIM file.
3. **Mid-session (limited):** if the skill is named explicitly via `/skills <name>` or loaded via Summon's `load` tool, it's available in the current session.
4. **Next session:** new skills are auto-discovered and their descriptions injected into the system prompt. New recipes appear in `goose recipe list`. New memories are baked into the Memory MCP's instructions block on extension startup. New hooks fire on lifecycle events. `tom` content is re-read every turn (no restart needed, even in current session — but the user has to have set `GOOSE_MOIM_MESSAGE_FILE` once).

What hot-reloads: `tom`/MOIM (every turn), Memory MCP `retrieve_memories` (per call), Summon `load` (per call, re-scans disk), recipes loaded via `goose run --recipe` (per invocation), `Config` values (per `get_param`, but most consumers only call at startup).

What requires restart: skill auto-discovery, hook loading, extension list, `.goosehints` injection, Memory MCP's session-start auto-inject.

What's blocked entirely until a code deploy: creating new MCP server tools, modifying the MCP server's exposed surface, changing the agent's core loop.

---

## I. Comparison to Claude Code's self-modification

| Capability | Claude Code | Goose | Winner |
|---|---|---|---|
| Auto-loaded context file (CLAUDE.md / .goosehints) | YES, walks directory tree | YES (`.goosehints`), walks directories | Tie |
| Re-injected-every-turn override (no fade) | NO (CLAUDE.md fades) | YES (`tom`/MOIM) | **Goose** |
| Hot-loadable skills mid-session | YES (skills load on use) | YES via Summon (re-scans every call) | Tie |
| Skills auto-discovered at session start | YES (description injected) | YES (description injected) | Tie |
| Hooks system | YES (PreToolUse, PostToolUse, etc.) | YES (11 event types) | **Goose** (more events) |
| Hot-add hooks mid-session | YES (re-read from settings.json) | NO (loaded once at Agent::new) | **Claude Code** |
| Custom slash commands | YES (markdown files in `.claude/commands/`) | YES (recipes registered in config.yaml) | Tie |
| Mid-session new slash command | YES (hot-discovered) | NO (config snapshot at start) | **Claude Code** |
| Recipe-driven workflows with parameters | NO (slash commands have arg passing but no parameter schema) | YES (full Jinja templating, typed params) | **Goose** |
| Subagent / subrecipe orchestration | YES (Task tool) | YES (subrecipes, up to 10 parallel) | Tie |
| Built-in persistent memory tool | NO (have to roll your own via files) | YES (Memory MCP, 4 tools) | **Goose** |
| Plugin distribution model | YES (plugins via marketplace) | YES (Open Plugin Spec + plugin install) | Tie |

Net: **Goose has more self-improvement surface area** (memory, MOIM, 11 hook events, parameterised recipes, sub-recipes, Summon hot-load) but **Claude Code is more aggressive about hot-reloading user-facing artefacts** (hooks, slash commands).

---

## J. Concrete recommendations for Office Town

**Ship these as runtime-writable artefacts (the curator and librarian both write them):**

1. **Skills** at `~/.agents/skills/office-town-<topic>/SKILL.md` — auto-discovered next session, hot-loadable this session via `/skills`. This is the closest match to Claude Code Skills and the highest-value artefact for "I learned a thing; future me uses it". **Earned-place test passes.**

2. **Recipes** at `~/.config/goose/recipes/office-town/<name>.yaml` (global) or `<project>/.goose/recipes/<name>.yaml` (project). Use them for repeatable multi-step workflows where parameters matter. Auto-discovered next session via `goose recipe list`. Runnable this session via `goose run --recipe <path>` from the shell. **Top priority for codifying multi-step office work.**

3. **Memory entries** via `remember_memory` (matching the Goose MCP signature) — backed by Office Town's R2/D1 cloud store rather than local files. The trigger-word UX ("remember this", "save this") flows naturally. **Caveat:** auto-injection at session start works only if Office Town's MCP follows the same instruction-block pattern Goose's Memory MCP does. If Office Town wants memories to be visible at session start, surface them in its MCP's `instructions` field. Otherwise rely on explicit `retrieve_memories` calls + tool descriptions.

4. **`tom`/MOIM persistent rules file** at `~/.config/office-town/tom.md`. Document during INSTALL.md that the user should set `GOOSE_MOIM_MESSAGE_FILE=~/.config/office-town/tom.md`. The librarian can append directives that re-inject every turn — true mid-session steering. **Best surface for "rules that must not be forgotten".**

5. **Hook scripts** at `~/.agents/plugins/office-town/hooks/hooks.json` (and `scripts/`). Worth shipping: `SessionEnd` that runs the curator, `PostToolUse` hooks for audit logging. **One-restart-delayed self-improvement.**

**Blocked / deferred — don't waste cycles trying:**

- **Creating new MCP servers at runtime** — agents can write the code (TypeScript/Python) but bringing it online needs a deploy. Solve by: the agent files an issue/PR in `office-town-cloud` rather than self-deploying.
- **Modifying the agent's own system prompt mid-session** — not possible. Replace with: writing skills + recipes + tom updates that future sessions pick up.
- **Adding tools to an existing MCP server at runtime** — depends on the server. For Office Town's own Workers, it's a deploy. For third-party servers, it's a fork+deploy. Out of scope for the living-memory loop.
- **Hot-registering slash commands mid-session** — Goose loads them at config-snapshot time. Agent can write the recipe AND the config-entry, but next session is when `/foo` becomes invokable. (You can still invoke the recipe directly via `goose run`.)

**Simplest viable self-improvement loop — V1, in priority order:**

```
1. Office Town MCP exposes:
   - skill_write(name, description, body) — writes ~/.agents/skills/office-town-<name>/SKILL.md
   - recipe_write(name, yaml) — writes ~/.config/goose/recipes/office-town/<name>.yaml
   - remember_memory(category, data, tags) — writes to R2-backed wiki
   - tom_append(text) — appends to ~/.config/office-town/tom.md
2. Office Town ships a "curator" skill that the LLM invokes at session end
   (manually via /skills curator, or automatically via a SessionEnd hook).
3. Curator reviews the session, decides what's worth saving, and writes
   the appropriate artefact(s).
4. Office Town ships a SessionStart-friendly INSTALL.md that wires:
   - GOOSE_MOIM_MESSAGE_FILE pointing at tom.md
   - office-town MCP added to extensions
   - hooks.json with SessionEnd → curator
5. Next session: skills auto-discovered, recipes listed, memory loaded,
   tom rules re-injected every turn. The agent is durably wiser.
```

This loop closes WITHOUT touching anything Goose forbids, exploits every hot-reload path Goose offers, and degrades gracefully (if the user doesn't set `GOOSE_MOIM_MESSAGE_FILE` they just don't get the per-turn rules — skills and recipes still work).

**The minimum viable artefact**: skill files. Start there. If we can reliably write one skill per useful session and have it available next session, we have a self-improving agent. Everything else is gravy.

---

**Verification status:**
- §A Recipes: confirmed via knowledge-02 + recipe schema docs.
- §B Skills: confirmed via knowledge-02 + live docs at `goose-docs.ai/docs/guides/context-engineering/using-skills` + source inspection `crates/goose/src/skills/{mod,client}.rs`.
- §C Extensions: confirmed via knowledge-02 §23, knowledge-03 §B.24 (Extension Manager).
- §D Memory: confirmed via knowledge-02 §8, knowledge-03 §B.1, **source inspection `crates/goose-mcp/src/memory/mod.rs` lines 105-145, 245** — definitive on session-start instruction bake.
- §E Hooks: confirmed via knowledge-02 §2, **source inspection `crates/goose/src/agents/agent.rs` line 333** — definitive on once-per-session load.
- §F-§H: synthesised from above.
- §I: cross-reference to Claude Code knowledge from working memory; not separately verified.

Three things that remain UNCLEAR and would benefit from a smoke test:
1. Whether `Config::global().set_param("slash_commands", ...)` mid-session causes the next user keypress to find the new command (the Config struct's hot-reload claim isn't tested for slash commands specifically).
2. Whether the Memory MCP's `instructions` re-update happens if you toggle the extension off and on mid-session (could be a cheap mid-session refresh path).
3. Whether `inline_python` extension type can be declared in a freshly-written recipe and invoked via `goose run --recipe` to effectively give the agent a new tool mid-session without a deploy.

These three are worth 30 minutes of live testing on a Goose CLI install before we commit to architecture.
