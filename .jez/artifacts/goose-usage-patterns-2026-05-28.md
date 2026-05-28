# Goose usage patterns — how humans + fleets actually use it day-to-day

**Date:** 2026-05-28
**Source basis:** Re-read of the five local goose-knowledge files (`goose-knowledge-01..05` in this `.jez/artifacts/` folder). No web fetches. Where a question can't be answered from the local material, that is called out explicitly rather than inferred.
**Companion to:** `goose-self-improvement-survey-2026-05-28.md` (what can be written at runtime), `office-town-framework-2026-05-28.md` (persona/context split), `skills-recipes-hooks-decomposition-2026-05-28.md` (which primitive does what).

This pass is a **USAGE** synthesis. Capability is well covered elsewhere. The question here is: when a real human sits down with Goose on a Monday morning, what does the daily rhythm actually look like — and how does Office Town slot into it?

---

## 1. Multi-window / multi-session — what's documented locally

The knowledge files document Goose's session model carefully but **are notably silent on a "windowing" abstraction**. The vocabulary the docs commit to is **sessions**, **projects**, and **working directories** — not "tabs" or "windows". Anything we infer about window-shape is reading between the lines.

What is clearly documented:

- **One process, many sessions.** `goose-knowledge-01-getting-started-guides.md:324` records: *"Desktop: open app, type in input. `Cmd+N` / `Ctrl+N` for new session."* New sessions are first-class — keyboard-shortcut accessible.
- **Sessions are persistent, named, and discoverable.** `goose-knowledge-01:351-388` documents the SQLite store (`~/.local/share/goose/sessions/sessions.db`), listing by working-dir filter (`goose session list -w <path>`), and resume by name, ID, or path. Sessions outlive the window they were created in.
- **Cross-surface sync** (`goose-knowledge-01:399`): *"All sessions sync between Desktop and CLI instances."* CLI and Desktop see the same store; you can start a session in one and resume in the other.
- **Concurrent sessions with isolated state are explicitly claimed.** `goose-knowledge-04-advanced-mcp-features.md:1165`: *"goose supports running multiple concurrent sessions with isolated state."* This is the only verbatim quote in the local files that addresses concurrency directly.
- **Mid-session changes have hard limits** (`goose-knowledge-01:444-448`). Working directory, extensions, model selection, and Goose Mode are *"new sessions only"* for at least some axes. Practical consequence: switching tasks in the *same* session means accepting the cwd it was launched in.

What is **not** in the local knowledge files:

- No mention of "tabs" or "tab management" inside Goose Desktop (the only `Tab` reference in file 04 is for *browser* automation tools, line 1093).
- No mention of multi-window persistence (layout restored on relaunch).
- No mention of per-window persona switching.
- No discussion of what "isolated state" means in practice for two sessions running in the same `goosed` process at the same time. The line at 04:1165 is a one-sentence claim; the surrounding context is about CI parallelism, not Desktop window juggling.
- No mention of Agent-per-session vs Agent-shared-across-sessions architecture in goosed.

**Working directory as homing beacon.** This holds locally. `goose-knowledge-02-recipes-tools-config.md:160` shows `working_dir` is passed in the hook payload to every event. `goose-knowledge-01:387` shows `goose session list -w <path>` is the documented way to list sessions for a project. The Projects feature (`goose-knowledge-02:881-904`) is literally a registry of *working directories*: *"A record of a working directory where you've used goose."* The cwd is the most-canonical identity a session has.

**Net usage pattern locally documented:** one session = one named conversation, anchored to a launch working directory, persisted in SQLite, resumable from anywhere. A user keeps multiple sessions; they choose between them by name or by working dir. Whether those sessions live in one window or many is not addressed by the local docs. **The prior `goose-usage-patterns-2026-05-28.md` synthesis (now superseded by this re-read) added a lot of windowing detail from web sources — when stripping back to local-only, much of that turns out to be from blog posts and GitHub discussions, not from the official knowledge captured here.**

---

## 2. Interactive + scheduled co-existence

The scheduler is documented (`goose-knowledge-05-architecture-deep-dive.md:1521-1531`) but the question of *interaction between scheduled runs and live interactive sessions* is **not addressed** in the local knowledge files. What the local files do say:

- Scheduled runs are **headless `goose run`** invocations under the hood (`goose-knowledge-05:1233`: `0 2 * * * /usr/local/bin/goose run --no-session -t "..."`). They are subject to the same headless constraints listed at `05:1225-1231`: no interactive clarification, recipe prompt required, no risky-tool approval prompt.
- Scheduled runs **produce inspectable sessions**: `goose schedule sessions --schedule-id <name>` lists past runs (`goose-knowledge-05:1528`).
- Subagents and subrecipes get isolation in *Agent* terms — `goose-knowledge-03-custom-extensions-and-existing.md:681`: *"separate Goose instances (isolated session, own ExtensionManager, own ToolMonitor, own context, own communication channels)"*. The local files extend this isolation claim to subagents, not to interactive-vs-scheduled coexistence.
- **No lock primitive documented.** The local files do not describe file-system locks, session-DB locks, or any mechanism preventing a scheduled recipe from writing the same file an interactive session is editing.

**MOIM across concurrent sessions** (`goose-knowledge-02:330-353`, `goose-knowledge-03:1066-1076`): MOIM is set via env vars (`GOOSE_MOIM_MESSAGE_TEXT` / `GOOSE_MOIM_MESSAGE_FILE`). Env vars are **process-scoped** — local docs don't say "per session". The `tom` content is *"injected into MOIM every turn"* and *"cannot be 'forgotten'"*. The implication, not stated but reasonable: a single `goosed` process has one MOIM, read fresh each turn — so updating the file affects every session under that process on the next turn each one takes. **The local files do not confirm this directly.**

**Honest verdict for question 2:** the knowledge files leave most of this unspecified. They confirm scheduled recipes exist, run headless, produce inspectable sessions; they do not confirm or deny what happens when an interactive session and a scheduled run touch the same file at the same time. **Office Town should treat "no lock" as the working assumption** and design recipes to write to date-stamped artefacts (`<date>-cycle-digest.md`) the interactive session then *reads*.

---

## 3. Blending skills + recipes + hooks in practice

The local files describe each primitive thoroughly and offer a few documented compositions — though the documentation is more "here are the primitives, here are the seams" than "here is a worked end-to-end blended workflow".

**The seams (verbatim from the files):**

- *"A plugin can provide skills, hooks, or both."* (`goose-knowledge-01:758`)
- *"Goose automatically loads skills when your request clearly matches a skill's purpose."* (`goose-knowledge-01:731`)
- *"Each subrecipe runs in isolation with its own session. No conversation history or state shared between parent and subrecipe, or between subrecipes."* (`goose-knowledge-02:773-775`)
- Hooks pass `{event, session_id, matcher_context, tool_name, tool_input, working_dir}` on stdin (`goose-knowledge-02:151-162`). Hooks can therefore *route on working_dir* — a hook script can branch by which folder the session lives in.

**Worked example A — RPI (Research → Plan → Implement)** is the strongest documented composition (`goose-knowledge-03:459-545`). Three custom slash commands (`/research_codebase`, `/create_plan`, `/implement_plan`) each map to a recipe. The research recipe **spawns three parallel subagents** (find-files / analyse-code / find-patterns) whose output becomes `thoughts/research/YYYY-MM-DD-HHmm-topic.md`. The plan recipe consumes that document. The implement recipe consumes the plan. Checkboxes in the plan file ARE the durable state — they survive context-window resets. Real numbers cited: 32-file refactor across 10 phases ran research 9min / plan 4min / implement 39min, total 52min, PR landed with zero review comments. **This is exactly the curate-then-promote shape Office Town wants for its mining → curation → wiki loop, generalised: the per-phase markdown file is the contract between subagents and humans, not in-memory state.**

**Worked example B — slash commands as the user-facing surface for recipes** (`goose-knowledge-02:79-83`): user-side `commands/*.yaml` are recipes registered as slash commands in `~/.config/goose/config.yaml`. Typed in chat as `/<name>`, parameters bind from natural language. This is how Block ships things like `/weekly-status` (referenced indirectly throughout — not detailed locally).

**Worked example C — hook fires recipe via the script layer.** The hooks.json shape (`goose-knowledge-02:121-140`) only supports `"type": "command"`. The command is a shell command, run via `sh -c`. Composition with a recipe therefore happens **inside the script**: the hook script calls `goose run --recipe ...` or `goose run -t "..."` as a sub-process. The local files don't show this pattern in a worked example, but it's the only way to chain a hook to a recipe given the documented hooks schema.

**Worked example D — Ralph Loop** (`goose-knowledge-04:1247-1313`). Two-role iterative dev pattern: worker model writes code, reviewer model returns `SHIP` or `REVISE`. State persists in `.goose/ralph/` flat files (`task.md`, `iteration.txt`, `work-summary.txt`, etc.). Fresh context every iteration, file-state is the durable layer. Office Town's curator-cycle has the same shape — discrete cycles, fresh context, files are the memory. Worth borrowing this pattern verbatim.

**Composition rules the files state explicitly:**

- Subagents cannot create more subagents (`goose-knowledge-01:695` — Blocked: *"Creating additional subagents, modifying extensions, managing schedules"*). No recursion.
- Max 5 concurrent subagents by default (`goose-knowledge-01:681`: `GOOSE_MAX_BACKGROUND_TASKS`). File 03:558 says 10 — there is an internal inconsistency in the local docs; the safer assumption is 5 unless we set the env var.
- Skills auto-load on relevance; explicit invocation via `/skills <name>`. Skills can call recipes (via shell-out from skill scripts) but the local files frame this as the skill "deciding" and the recipe "executing".
- 25-tool ceiling for performance (`goose-knowledge-02:798`). Office Town's MCP exposes many tools; this is the headline constraint to design around.

**The "natural progression" pattern the files endorse implicitly:** start with a one-off natural-language subagent invocation. If the pattern repeats, promote it to a recipe. If the recipe earns its place, wrap it in a slash command. If user-invocation becomes routine, fire it from a hook. Skill upstream of recipe upstream of hook is the maturity ladder: judgment → procedure → automation.

---

## 4. Office Town UX recommendation

Pulling the above against the Jez insight — *"open up probably one goose window to be the email manager, for example, and it would be where you go to for all of the email agent conversations"* — produces a concrete UX shape. The local docs do not name the "one window per agent" pattern explicitly, but every primitive aligns with it.

### One window per persona-context pair, named explicitly

The atomic Office Town unit is **(persona × launch cwd)**. Open Goose in `wiki/agents/curator/`; that window IS the curator. Open Goose in `wiki/projects/acme-rebuild/`; that window IS the worker on Acme. Don't fight Goose's "working directory is sticky for the session" architecture — embrace it. The cwd is the cortex's homing beacon (`office-town-framework-2026-05-28.md:38`); Goose's session-cwd binding (`goose-knowledge-01:444-445`) is the same idea expressed at the runtime layer.

**Name the sessions:** `goose session --name curator-daily`, `goose session --name worker-acme`. Auto-named `YYYYMMDD_<N>` sessions get lost. Named ones survive past any sidebar truncation and are resumable across machines via the shared SQLite store.

### Recommended daily layout for a typical Office Town user

| Window | Persona | Launch cwd | Documented support |
|---|---|---|---|
| 1 | Curator | `~/Documents/.jez/` (or wiki root) | Working through inbox, promoting concepts. Backed by `office-town-curate` skill (judgment-heavy). |
| 2 | Worker | active project dir (e.g. `wiki/projects/<client>/`) | Building / deploying. Backed by per-project `.goosehints` + `.agents/skills/` (`goose-knowledge-01:560-589`, `02:903`). |
| 3 | Librarian | `~/Documents/.jez/` (read-mostly) | Research, KB lookups. Backed by skills + `office-town__search` MCP tools. |
| 4 | Boss (occasional) | wherever scheduled cron output lands | Triage of scheduled-recipe output. Backed by the `goose schedule sessions` inspection surface (`goose-knowledge-05:1528`). |

Three windows steady-state, four when something demands attention. This maps Jez's intuition ("one window for the email agent") to a generalisable rule: **one window per long-running agent thread, not one window per ad-hoc task**.

### How interactive curator + scheduled curator-cycle relate

The scheduled curator-cycle runs as a headless `goose run --recipe office-town-curator-cycle.yaml` from cron. Per `goose-knowledge-05:1233-1236`, this is the documented cron pattern. The cycle writes a **date-stamped digest** to `wiki/agents/curator/findings/<date>-cycle-digest.md`. The interactive curator window (#1 above) opens that file via the curator's `SessionStart` hook, reads it, decides what to act on. **No write-write contention because they touch different files**: scheduled writes the digest, interactive reads-then-writes downstream files.

This mirrors the RPI pattern (Worked Example A) at the substrate layer: discrete-cycle producers leave durable markdown artefacts; consumers read on next session start. Fresh context per cycle; files are the memory.

### Hooks: global wiring, persona-conditional logic inside the script

The hooks.json schema only fires by event + matcher — there is no "persona" or "window" filter (`goose-knowledge-02:121-149`). The right shape is therefore:

- Wire **global hooks** in `~/.agents/plugins/office-town/hooks/hooks.json`: `SessionStart` (load persona context), `SessionEnd` (write handover/journal), `AfterFileEdit` matching `wiki/**` (route to indexer/lint), `UserPromptSubmit` (detect-injection skill).
- Branch on **`working_dir` and the active persona file** *inside* the hook script (which is just bash invoking the persona's `office-town-kickoff` skill via `goose run -t`). The cortex's `~/Documents/.jez/.persona` file (or equivalent — pick a convention) tells the script which persona's kickoff to fire.

This matches the skills-recipes-hooks decomposition document's Tier-1 mapping (`skills-recipes-hooks-decomposition-2026-05-28.md:50-59`): hook-fires-skill is the dominant composition pattern Office Town has already chosen, and the local Goose docs support exactly that shape.

### Don't assume per-window extension isolation

The local files claim concurrent sessions have *"isolated state"* (`04:1165`) but never spell out whether ExtensionManager is per-session or per-process. The conservative assumption: **extensions enabled in one window are visible to every concurrent session in the same `goosed` process**. Design Office Town's MCP tools to be **idempotent and context-addressable** — `office_town__log_note { entity_slug, body, ... }` not "log a note on the active client" (because there's no shared notion of an "active client" across windows). Every call carries enough context to be safe regardless of which window made it.

### Goose Projects + Office Town personas

The Projects feature (`goose-knowledge-02:881-904`) is the right backbone for window-launch. It registers working dirs and remembers the most recent command. `goose project` resumes the most recent. **An Office Town install should call `goose project` once per persona-context** during onboarding so every window the user later opens is one keystroke away. CLI-only today (Desktop support is "planned"), so the launcher script is bash-flavoured for now.

### Fleet dashboard pattern

Goose's local files don't ship a fleet dashboard. The closest documented surface is `goose schedule sessions --schedule-id X -l 10` (`goose-knowledge-05:1528`), which lists recent runs of a scheduled recipe. **Office Town's curator window is the fleet dashboard** — opens the daily digest, lists what's pending, surfaces which scheduled cycles last ran successfully. The MCP-UI rendering Goose supports (cards, action buttons — referenced throughout file 04) is what lets the dashboard be visual rather than raw markdown. **Build this as Office Town's curator-window default — not a separate window.**

### Use deeplinks for invitation

`goose://extension?type=streamable_http&url=...` (`goose-knowledge-03:752-760`) is the one-click install primitive. An Office Town onboarding page should be exactly five deeplinks: the plugin (skills + hooks), then one recipe per default window (curator-kickoff, worker-kickoff, librarian-kickoff, boss-kickoff). Five clicks → user has the four-window setup live.

### The 25-tool ceiling

Office Town has many tools across many packs (`goose-knowledge-02:798-803`). Per-persona extensions selection is the right discipline: the curator window enables the curator-relevant MCP packs only; the worker window enables the build/deploy packs. The plugin install ships skills universally (cheap, just markdown), but the MCP extension subset per window is the budget that matters. Document a default per-persona pack list in INSTALL.md.

---

## Sources (all local)

- `/Users/jez/Documents/office-town-cloud/.jez/artifacts/goose-knowledge-01-getting-started-guides.md`
- `/Users/jez/Documents/office-town-cloud/.jez/artifacts/goose-knowledge-02-recipes-tools-config.md`
- `/Users/jez/Documents/office-town-cloud/.jez/artifacts/goose-knowledge-03-custom-extensions-and-existing.md`
- `/Users/jez/Documents/office-town-cloud/.jez/artifacts/goose-knowledge-04-advanced-mcp-features.md`
- `/Users/jez/Documents/office-town-cloud/.jez/artifacts/goose-knowledge-05-architecture-deep-dive.md`
- `/Users/jez/Documents/office-town-cloud/.jez/artifacts/office-town-framework-2026-05-28.md` (companion)
- `/Users/jez/Documents/office-town-cloud/.jez/artifacts/skills-recipes-hooks-decomposition-2026-05-28.md` (companion)

**Web sources from the prior pass were intentionally not re-consulted** — that's the point of this re-run. Where the local files don't answer a question, this document says so rather than reaching for web context.
