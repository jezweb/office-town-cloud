---
name: office-town-kickoff
description: Universal session-start procedure for every Office Town persona. Read your working substrate (facts + status + journal + inbox + recent findings), read the owner voice cascade, locate where you are in the cortex (the working directory is the homing beacon), then begin. Run on every fresh session. Without it, sessions start cold and waste user attention on "what's going on?".
---

# Office Town: Kickoff

The first move of every session. Goose's `CONTEXT_FILE_NAMES` already loaded the AGENTS.md cascade from your working directory up to the cortex root — that's the system prompt. Kickoff is what you do AFTER Goose hands you the context: pick up the substrate state that the cascade doesn't carry.

## When to invoke

- **Every new Goose session**, before any user prompt is processed. Auto-run by `SessionStart` hook if installed; otherwise run on first user message.
- **User signal** — *"hi"*, *"hey"*, *"kickoff"*, *"morning"*, *"let's go"*. Don't reply with *"What would you like to do?"* — that's the failure mode this skill prevents. Kickoff, then act.
- **Resuming a stale conversation** after a context compact — the cascade may have been refreshed but the substrate state hasn't been re-read.

Don't run mid-task. Don't run twice in a session. If you're mid-flow when "hi" lands, complete the current step + acknowledge briefly, but don't re-kickoff.

## Procedure

### 1. Read your working substrate

```
wiki/agents/<your-persona-slug>/facts/*.md     ← accumulated atomic feedback
wiki/agents/<your-persona-slug>/status.md       ← one-line current state
```

Facts/ tells you what you've learned over prior sessions. Status.md tells you what state the prior session left things in. Both are short — 30 seconds to absorb.

### 2. Read the owner voice cascade

```
wiki/owner/voice.md                             ← load-bearing; how the owner talks + writes
wiki/owner/vocabulary.md (if needed)            ← words to use, words to avoid
wiki/owner/rhythm.md (if planning timing)       ← working hours, response expectations
```

Voice.md is non-optional before producing any styled output (an email, a doc, a message). The others load on demand based on what the session needs.

### 3. Locate yourself — the working directory is the homing beacon

Read the `cwd` you were launched in. If you're in:

| Working dir | The focus is... |
|---|---|
| `~/my-town/` (cortex root) | Whole-cortex work; check your responsibility area, not a specific entity |
| `~/my-town/wiki/orgs/` | All orgs (vertical analysis, collection audit) |
| `~/my-town/wiki/orgs/<slug>/` | Specifically this org — read its `entity.md` next |
| `~/my-town/wiki/projects/<slug>/` | Specifically this project — read `project.md` + recent sessions |
| `~/my-town/wiki/decisions/<slug>/` | Specifically this decision — read context |

If the cwd is a specific entity folder, read the canonical file (`entity.md` / `contact.md` / `project.md` / `decision.md`) in step 4. If the cwd is generic, skip step 4.

### 4. Read the local entity (only if cwd is entity-scoped)

The canonical file IS the focus. Frontmatter + body. ~30 seconds.

### 5. Check today's in-flight + recent journal

```
wiki/agents/<your-persona-slug>/journal/<YYYY-MM-DD>.md     ← today; what's mid-stream
wiki/agents/<your-persona-slug>/journal/<last-3-days>.md    ← ambient context
```

Today's journal tells you if you were in the middle of something. Recent days give ambient continuity.

### 6. Check inbox + broadcasts

```
wiki/agents/<your-persona-slug>/inbox/*.md      ← briefs from siblings + schedulers
wiki/broadcasts/*.md                            ← framework changes to absorb
```

Note count. If >5 items, you'll run `office-town-inbox-triage` after step 8.

### 7. Glance own findings + skills

```
wiki/agents/<your-persona-slug>/findings/*.md   ← patterns you noticed recently
wiki/skills/<your-prefix>-*/SKILL.md            ← skills available to you
```

You don't read them all — you scan the filenames. This is the index check, not the full read.

### 8. Wire your cron cycles (if your AGENTS.md declares any)

```bash
# Read declared cycles from your persona's AGENTS.md
# Run CronList to see actual registrations
# Diff and CronCreate the missing ones
```

If your AGENTS.md doesn't have a `cycles:` map, skip this step.

### 9. Now work.

Don't end kickoff and ask *"What would you like to do?"* — that's the failure mode this procedure prevents. You know your role (in the system prompt). You know your scope (the working directory). You know your state (steps 1-7). You know what's queued (step 6). Act.

If the user said *"hi"*, acknowledge with a one-line orientation: *"In <working area>, last cycle did <X>, inbox has <N> items. What's first?"* — opens the conversation with context, doesn't dump everything you read.

## Non-obvious disciplines

- **Don't echo what you read.** Kickoff loads context into YOUR head, not the user's. The user doesn't need a status report on what's in the journal; they need the agent ready to act.
- **Length-bound: kickoff is ~30 seconds of reading.** Status, voice, today's journal, inbox titles. Anything that takes longer is bootstrap, not kickoff.
- **Bootstrap mode is different.** If facts/, status.md, journal/, inbox/ are all empty (first session ever), kickoff is shorter (no state to absorb) but the persona's AGENTS.md governs day-one orientation. Run `office-town-handover`'s setup branch first.
- **If the user's first message is concrete work**, do kickoff steps 1-7 silently while drafting your response. Don't pause to announce *"running kickoff"*.

## Composition with other skills

| Skill | Composition |
|---|---|
| `office-town-handover` | The bookend. Handover lands state at session end; kickoff picks it up at session start. |
| `office-town-glance` | Per-cycle catch-up (every cron fire); kickoff is per-session warm-up (heavier). Glance reads less. |
| `office-town-inbox-triage` | Run after step 8 if inbox count >5. |
| `office-town-broadcast-scan` | Run if step 6 found new broadcasts since last kickoff. |

## Verification

- [ ] Your facts/ + status + voice + today's journal + inbox have been read
- [ ] You know where you are in the cortex (working directory is named in your head)
- [ ] If cwd is entity-scoped, the canonical file was read
- [ ] You did NOT end kickoff with *"What would you like to do?"*
- [ ] If user said *"hi"*, you responded with one-line orientation + invitation, not a status dump

## See also

- `office-town-handover` — the session-end pair
- `office-town-glance` — per-cycle warm-up (lighter, more frequent)
- `office-town-inbox-triage` — process inbox briefs if backlog is large
- `wiki/owner/voice.md` — the load-bearing read at step 2
- Framework doc § 10 — the canonical kickoff procedure

## Last updated

2026-05-28 — initial author, adapted from `goanna:kickoff` for the Goose persona-context model (cascade auto-loads; persona reads working substrate + uses cwd as homing beacon).
