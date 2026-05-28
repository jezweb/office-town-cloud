# Skills vs Recipes vs Hooks — V1 Decomposition

**Date**: 2026-05-28
**Status**: Re-classification pass following Jez's correction. Goanna's 60-skill catalogue was authored under Claude Code (which has no recipes), so several Goanna "skills" are recipe-shaped. Goose has all three primitives — skills, recipes, hooks — and we should use the right shape for each piece of behaviour.

**Supersedes** the v1.0 starter set categorisation in `skills-recipes-v1-starter-2026-05-28.md` (which lumped everything as skills). Skill names + ownership are unchanged; what changes is which artefact type each lands as.

---

## The three primitives in Goose

| Primitive | Shape | Lives at | When to choose |
|---|---|---|---|
| **Skill** | Judgment-shaped procedure; markdown body with When-to-invoke + Procedure + Verification | `~/.agents/skills/<name>/SKILL.md` | The agent has to *decide* something mid-flow; work is highly variable per invocation; composition with other behaviour via natural-language reasoning |
| **Recipe** | Deterministic YAML workflow with typed parameters, tool sequences, sub-recipes | `~/.config/goose/recipes/<name>.yaml` | Procedure is repeatable given the same inputs; can run headlessly (cron-scheduled); inputs map cleanly to params; composable via sub-recipes |
| **Hook** | Lifecycle-event trigger; JSON config in `hooks.json` referencing scripts | `~/.agents/plugins/office-town/hooks/hooks.json` + `scripts/` | An action should fire on a system event (session start/end, tool call, user prompt) without user invocation; side-effect, not user-driven |

The three compose: a SessionEnd **hook** fires the `office-town-curate` **skill**, which calls the `office-town-promote-to-knowledge` **recipe** for the mechanical write step. Each primitive does what it's best at.

---

## Decision rules — which to pick for a given piece of behaviour

Three questions, in order:

### Q1: Does this fire on a system event, without the user invoking it?

If YES → **hook**. Lifecycle triggers are hook-shaped (not skill-shaped). 11 events available: `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `BeforeReadFile`, `AfterFileEdit`, `BeforeShellExecution`, `AfterShellExecution`.

### Q2: Given the same inputs, would the procedure produce the same output?

If YES → **recipe**. Recipes are for *deterministic* work — given (entity_slug, source_path), do the same N steps, write the same files, return the same result. Recipes accept typed parameters, can run headlessly via `goose run --recipe <path>`, can be cron-scheduled, can call sub-recipes.

### Q3: Otherwise, it's a skill.

If the agent has to *think* — classify content, choose an action from competing options, navigate ambiguity, decide whether to escalate — it's a **skill**. Skills are markdown procedures the agent reads + interprets; they encode judgment.

The litmus: **could a CRON job run this unattended?** If yes → recipe. If no (the agent will need to make a call mid-procedure) → skill.

---

## Re-classification of the 25 v1.0 starter items

Each gets a primary type + a note where it composes with another primitive.

### Originally Tier 1 — Universal session machinery (9)

| # | Item | New type | Why | Composition |
|---|---|---|---|---|
| 1 | `office-town-kickoff` | **Skill** (fired by hook) | The 9 steps require judgment (which substrate files matter? what's the working-dir focus?). But should be auto-fired by a `SessionStart` hook so the user doesn't have to ask. | Hook `SessionStart` → invokes skill |
| 2 | `office-town-glance` | **Skill** (fired by hook) | Lighter judgment-heavy procedure; per-cron-fire warm-up. Hook fires it at start of every cron cycle. | Hook (custom, per cron-fire) → invokes skill |
| 3 | `office-town-handover` | **Skill** (fired by hook) | Judgment-heavy: what was mid-stream? what needs to land before close? Auto-fired by `SessionEnd` hook. | Hook `SessionEnd` → invokes skill |
| 4 | `office-town-reflect` | **Skill** | Heavy judgment: did I do something manually 2+ times? worth a skill candidate? what to retire? Pure judgment, no recipe-shape. | Standalone skill, user or cron invokes |
| 5 | `office-town-propose-skill` | **Skill** | Pure judgment: capture the just-demonstrated pattern. Voice + framing + four-section template; LLM authors. | Standalone skill |
| 6 | `office-town-file-finding` | **Recipe** | Given `(slug, pattern_description, instance_count, source, status)`, write `wiki/agents/<persona>/findings/<date>-<slug>.md` with the standard schema. Mechanical. | Called by reflect, mine-mail-thread, others |
| 7 | `office-town-trace-append` | **Recipe** | Given `(entity_slug, date, actor, channel, verb, ref_id)`, append a one-line trace to the entity's `entity.md § Recent`. Pure deterministic. | Called by every skill that touches an entity |
| 8 | `office-town-update-frontmatter` | **Recipe** | Given `(entry_slug, fields_to_update)`, update frontmatter + stamp sextet. Pure deterministic. | Called by anything that modifies an entry |
| 9 | `office-town-brief-sibling` | **Recipe** | Given `(recipient_persona, subject, body, routing)`, write a brief to `wiki/agents/<recipient>/inbox/<date>-<sender>-<topic>.md`. Mechanical. | Called by skills that need to route to siblings |

**Tier 1 split: 5 skills, 4 recipes.**

### Originally Tier 2 — Anti-failure + quality (4)

| # | Item | New type | Why |
|---|---|---|---|
| 10 | `office-town-escalate` | **Skill** | Judgment: after 3 same-shape failed iterations, decide whether to retry differently, stop entirely, or surface. |
| 11 | `office-town-inbox-triage` | **Skill** | Each brief needs classification. Composes recipe `file-finding` + recipe `brief-sibling` per disposition. |
| 12 | `office-town-broadcast-scan` | **Skill** | Light judgment: scan broadcasts, decide which matter, decide what to absorb. |
| 13 | `office-town-detect-injection` | **Skill** (often fired by hook) | Pure judgment: is this trying to inject? Should fire on `UserPromptSubmit` for every user input. | Hook `UserPromptSubmit` → invokes skill |

**Tier 2 split: 4 skills.**

### Originally Tier 3 — Self-improvement loop (4)

| # | Item | New type | Why |
|---|---|---|---|
| 14 | `office-town-curate` | **Skill** (fired by hook) | Heavy judgment: which findings promote, which archive, which file as task. Fires from `SessionEnd` hook for living-memory synthesis. | Hook `SessionEnd` → invokes skill |
| 15 | `office-town-promote-to-knowledge` | **Recipe + Skill split** | Mechanics of writing `wiki/knowledge/<topic>/concept.md` = recipe. Decision about whether to promote = skill. Skill calls recipe for the write step. | Skill calls recipe |
| 16 | `office-town-maintain-watch-table` | **Recipe + Skill split** | Updating the table mechanics = recipe. Deciding when to promote/retire watches = skill. | Skill calls recipe |
| 17 | `office-town-surface-memory` | **Skill** | Judgment: which session-scoped memory entries are worth promoting to substrate. |

**Tier 3 split: 4 skills (+ 2 sub-recipes).**

### Originally Tier 4 — Office Town MVP (5)

| # | Item | New type | Why |
|---|---|---|---|
| 18 | `office-town-mine-mail-thread` | **Recipe + Skill split** | Most of the 8 steps are deterministic (fetch, archive, collision-check, write, trace, cite, journal). The "which collection?" step + "enrich if confidence < 0.7" step are skill-shaped judgment. **Recipe orchestrates; calls skills for the judgment moments.** | Recipe (orchestrator) calls skills (judgment) calls recipes (writes) |
| 19 | `office-town-pre-flight-collision-check` | **Recipe** | Given `(candidate_orgs, candidate_contacts, candidate_decisions)`, run the 4-layer index check + return existing/new lists. Pure deterministic. | Called by every mine-* recipe |
| 20 | `office-town-reconcile-org` | **Skill** | Heavy judgment: peer-vs-umbrella, ABR-verify, auto-merge vs queue, confidence threshold. Composes with several recipes for the actual writes. |
| 21 | `office-town-cite-source` | **Recipe** | Given `(entry_slug)`, determine source from caller context, write `derived_from:` array, verify resolution. Pure deterministic. **The sample SKILL.md I drafted earlier should be re-shaped as a recipe.** | Called by every mine-* and ingest-* recipe |
| 22 | `office-town-answer-from-cortex` | **Skill** | Compose `grep + filter + walk + semantic` queries based on the question's shape. Heavy judgment. |

**Tier 4 split: 3 skills, 2 recipes (+ shared recipes called by both).**

### Originally Tier 5 — Gap-fillers (3)

| # | Item | New type | Why |
|---|---|---|---|
| 23 | `office-town-record-decision` | **Recipe + Skill split** | Mechanics of writing `wiki/decisions/<slug>/decision.md` with the Context→Decision→Consequences→Alternatives shape = recipe. Decision about whether THIS conversation warrants a decision record = skill. | Skill calls recipe |
| 24 | `office-town-proof-of-done` | **Skill** | Pure judgment: write the literal yes/no test that proves done. Composition happens via the agent's reasoning, not via tool sequence. |
| 25 | `office-town-wire-cycles` | **Recipe** | Given `(persona_slug)`, read its AGENTS.md `cycles:`, CronList current, diff, CronCreate missing, log drift. Pure deterministic. | Called by kickoff |

**Tier 5 split: 1 skill, 2 recipes.**

---

## Summary of decomposition

Of the 25 starter items:

- **15 land as primary skills** (judgment-shaped)
- **8 land as primary recipes** (deterministic)
- **5 are skill+recipe hybrids** (skill orchestrates, recipe handles a mechanical step OR vice versa)
- **5 should be auto-fired by hooks** (SessionStart/End, UserPromptSubmit, per-cron-fire)

So the v1.0 catalogue becomes:

| Artefact type | Count | Examples |
|---|---|---|
| Skills | ~15 | kickoff, handover, reflect, propose-skill, escalate, inbox-triage, broadcast-scan, detect-injection, curate, surface-memory, reconcile-org, answer-from-cortex, proof-of-done + hybrids' skill side |
| Recipes | ~8 + 5 sub-recipes | file-finding, trace-append, update-frontmatter, brief-sibling, pre-flight-collision-check, cite-source, wire-cycles + hybrids' recipe side |
| Hooks | 4-5 hook events with 7-8 hook actions | SessionStart→kickoff; SessionEnd→handover+curate; UserPromptSubmit→detect-injection; PostToolUse→trace-append (selective); custom cron-fire→glance |

Plus the new recipes the original list missed — see next section.

---

## New recipes the original list missed

Jez's insight: *"Goose readily does subtasks on a schedule. Where we have had something that looks like a skill — 'check my email and summarise' — that can just be a task that runs a new session each time."*

This expands the v1.0 surface. Several recurring behaviours we hadn't named because they were "implicit in a persona's job" should be explicit **cron-scheduled recipes**:

### Persona-cycle recipes (one per persona; declared in AGENTS.md `cycles:`)

| Recipe | Persona | Schedule | What it does |
|---|---|---|---|
| `office-town-curator-cycle` | Curator | Every 30 min during active mining; every 60 min during quiet | New headless session: kickoff → glance → check stub-backlog → mine next N items → reflect → handover |
| `office-town-librarian-cycle` | Librarian | Every 30 min always-on (Goanna pattern) | New headless session: kickoff → glance → sweep-sibling-findings → maintain-watch-table → graduate-ready → handover |
| `office-town-secretary-cycle` | Secretary | Every 15 min during business hours | New headless session: kickoff → glance → inbox-triage on user's mail → draft any reply candidates → handover |

Each cycle recipe is short — maybe 15-25 lines of YAML — orchestrating the existing skills + recipes for that persona.

### Scheduled hygiene recipes

| Recipe | Schedule | What it does |
|---|---|---|
| `office-town-nightly-lint` | 02:00 daily | Orphan-link detection, broken-link sweep, schema-version drift check, status-field accuracy audit; file findings for any issues |
| `office-town-weekly-digest` | Thursday 14:00 | Generate `wiki/global/<year>-W<week>.md` digest of last week's wiki_audit + Inbox highlights |
| `office-town-monthly-contacts-audit` | 1st of month 15:00 | Walk contacts: stale records >90d, missing canonical fields, orphan contacts |
| `office-town-monthly-stale-audit` | 1st of month 16:00 | Walk all collections: status field accuracy, dormant detection, archive proposals |

These are recipes (deterministic, parameterised, schedulable) — not skills. They were missing from the original 25.

### Source-mining recipes (curator's bread and butter)

| Recipe | Inputs | Schedule | What it does |
|---|---|---|---|
| `office-town-mine-mail-thread` | thread_id | User-invoked OR called by sweep | Full mine of one Gmail thread |
| `office-town-mine-recent-mail` | since (default: 30 min) | Cron, every 30 min | Pull every Gmail message since `since`; classify; sweep into appropriate mine-mail-thread invocations |
| `office-town-mine-chat-room` | channel + window | User-invoked | Slack channel walk |
| `office-town-mine-doc` | doc_id | User-invoked | Google Doc / Word import |
| `office-town-mine-jim2-cardfile` | cardfile_id | Cron | Pull Jim2 cardfile snapshot into raw archive + extract Org entry |

`mine-recent-mail` is the scheduled wrapper around `mine-mail-thread` — it's the unattended periodic mining the user doesn't have to invoke. The user invokes `mine-mail-thread` directly for ad-hoc captures.

### Total revised v1.0 catalogue

Adding these scheduled + missing recipes:

- **Skills**: ~15 (judgment-heavy procedures)
- **Recipes**: ~16 (8 original + 3 persona-cycle + 4 hygiene + 1 mine-recent-mail; some hybrids' recipe side)
- **Sub-recipes**: ~5 (the mechanical write steps inside hybrid items)
- **Hooks**: 5 events with ~7 actions wired

About **40 artefacts total** — but they're three different *types*, mostly small (recipes are 15-50 lines of YAML; hooks are 5-10 lines of JSON), and they distribute the work in shape-appropriate ways.

---

## Hooks to wire at install (5 events, 7 actions)

The install-time wiring (`~/.agents/plugins/office-town/hooks/hooks.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "skill", "name": "office-town-kickoff" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "skill", "name": "office-town-handover" },
          { "type": "skill", "name": "office-town-curate" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "skill", "name": "office-town-detect-injection" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "wiki:write|wiki:update",
        "hooks": [
          { "type": "recipe", "name": "office-town-trace-append-if-entity" }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "skill", "name": "office-town-reflect" }
        ]
      }
    ]
  }
}
```

(JSON shape is illustrative — actual `hooks.json` syntax follows the Goose spec; check current docs before authoring.)

Five events wired: SessionStart, SessionEnd, Stop, UserPromptSubmit, PostToolUse. Seven actions referenced across them.

The benefit: **the agent doesn't have to remember any of this.** Kickoff fires automatically when the session starts. Handover + curate fire when it ends. Trace-append fires after every entity write. Detect-injection fires on every user input. The autonomy-default doctrine becomes invisible plumbing — agents act; the system handles the lifecycle.

---

## Composition example — a curator session in this architecture

User opens Goose at `~/Documents/my-town/wiki/orgs/acme-corp/` and selects the curator persona.

1. **`SessionStart` hook** fires → invokes `office-town-kickoff` skill → agent reads working substrate, owner cascade, current entity (acme-corp's entity.md), recent journal, inbox
2. User: *"any news on Acme this week?"*
3. **`UserPromptSubmit` hook** fires → `office-town-detect-injection` skill → passes (not injection)
4. Curator runs `office-town-answer-from-cortex` skill → composes grep+filter+walk+semantic → returns: 3 emails this week, 1 new project mentioned, 1 invoice paid
5. User: *"capture the new project mention"*
6. Curator runs `office-town-mine-mail-thread` recipe with `thread_id = <id>` → 8 steps execute deterministically with skill-judgment moments embedded (which collection? → projects)
7. Mid-recipe: `office-town-pre-flight-collision-check` recipe runs → returns "new project entity"
8. Mid-recipe: `/api/ingest` runs → typed entry written with confidence 0.82
9. Mid-recipe: `office-town-cite-source` recipe runs → derived_from added
10. Mid-recipe: `office-town-trace-append` recipe runs → engagement trace on acme-corp's entity.md
11. **`PostToolUse` hook** fires → `office-town-trace-append-if-entity` recipe → also stamps audit
12. Curator surfaces to user: *"Created `projects/acme-2026-renewal-v2`. Confidence 0.82. Linked to acme-corp + 2 contacts. Stub on budget — need to verify."*
13. User closes session
14. **`SessionEnd` hook** fires → `office-town-handover` skill → today's journal landed → then `office-town-curate` skill → session-end synthesis (any patterns worth a skill? any rules worth tom-appending?)

Every step happens. Most of them happen automatically (hooks). The user gets to focus on the actual decision points (steps 2, 5, 12). The system handles the plumbing.

---

## What changes from the v1.0 starter doc

| Before | After |
|---|---|
| 25 starter "skills" | ~15 skills + ~16 recipes + 5 sub-recipes + 5 hooks ≈ 40 artefacts |
| All authored as SKILL.md | Skills as SKILL.md, recipes as YAML, hooks as JSON |
| Cron-scheduled work was implicit in persona definitions | Cron-scheduled recipes are explicit: 3 persona-cycle + 4 hygiene + 1 mine-recent-mail |
| Autonomy-default doctrine relied on agent's discipline | Autonomy-default doctrine is enforced by hooks (auto-kickoff, auto-handover, auto-curate) |

The 3 sample SKILL.mds I drafted earlier:
- `office-town-kickoff` — **stays a skill** (judgment-heavy); but should be invoked from SessionStart hook
- `office-town-mine-mail-thread` — **should be re-written as a recipe** (deterministic 8-step orchestration with skill-judgment moments embedded)
- `office-town-cite-source` — **should be re-written as a recipe** (pure deterministic write)

Two of three are mis-shaped. Not surprising — Goanna's catalogue had the same drift. The fix is straightforward; we just author the right shape going forward.

---

## What to do next

1. **Accept this decomposition** (or push back on specific calls before they harden)
2. **Author the 3 most-foundational artefacts in their correct shape**:
   - `office-town-kickoff` SKILL.md (stays as drafted; add note about hook-firing)
   - `office-town-trace-append` recipe.yaml (was a sample-skill candidate; now a recipe)
   - `office-town-cite-source` recipe.yaml (re-shape the sample-skill draft)
3. **Author the first persona-cycle recipe** — `office-town-curator-cycle.yaml` — to prove the cron-scheduled-headless-session pattern works
4. **Author the install hooks.json** — wire the 5 events at install time
5. **Update the framework doc** Section 8 (skills) to add recipe + hook coverage; rename to "skills + recipes + hooks"

---

## Related docs

- `office-town-framework-2026-05-28.md` — framework Section 8 (skills) needs broadening to skills + recipes + hooks
- `skills-recipes-v1-starter-2026-05-28.md` — the original starter set (this doc supersedes its categorisation)
- `goose-self-improvement-survey-2026-05-28.md` — Goose's primitive-by-primitive support analysis (skills + recipes + memory + tom + hooks all named)
- `goanna-skills-catalogue-2026-05-28.md` — Goanna's 60-skill catalogue (several of which are recipe-shaped retroactively)
- `goanna-skill-body-shapes-2026-05-28.md` — voice + structure for SKILL.md (the format itself is unchanged; just narrower in scope to judgment-shaped work)
- `sample-skills/office-town-mine-mail-thread/SKILL.md` — needs re-shape to recipe.yaml
- `sample-skills/office-town-cite-source/SKILL.md` — needs re-shape to recipe.yaml
