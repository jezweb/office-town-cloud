---
title: Goanna skill body shapes — ground truth for Office Town's skill voice
date: 2026-05-28
purpose: Extract the shape and voice of mature Goanna skills so Office Town's own skill library is authored consistently from day one.
sources:
  - skills/kickoff/SKILL.md (goanna fleet)
  - skills/handover/SKILL.md
  - skills/curate/SKILL.md
  - skills/reflect/SKILL.md
  - templates/skill/SKILL.md
---

# Goanna skill body shapes

Office Town inherits Goanna's skill format. Before authoring our own, this document captures the shape verbatim — the description line, the trigger language, the procedure cadence, the verification discipline — so that anything we write next reads like a sibling of `kickoff` and `handover`, not a guess.

Every quote below is pulled directly from the live R2-backed fleet on 2026-05-28.

---

## § Universal skill bodies

### 1. `skills/kickoff/SKILL.md`

**Length:** ~58 lines.

**Frontmatter description (verbatim):**
> "Warm-up procedure that fires at session start. Reads role context, owner voice, status breadcrumb, scratch, recent memory, comms inbox, and optional indexes BEFORE responding to the user. Triggered by the canonical word \"kickoff\" OR automatically on the first user message of a session (regardless of phrasing)."

**When to invoke (verbatim bullets):**
> "First user message of every session — even if it's just *\"hi\"* or *\"you there?\"*"
> "Explicit *\"kickoff\"* trigger from the user"
> "After compaction (the runtime summarises a long session; warm-up re-runs against fresh state)"

**Procedure — first five steps verbatim:**

> "1. **Confirm your local files are current**. Fleet state is auto-synced via the `goannad` sync daemon (~30s observed latency, see `SUBSTRATE.md`). No pull/rebase step. Optional sanity check…"
>
> "2. **Soak up the framework**: read every `.md` in `/Users/Shared/goanna/docs/`. A one-time warm-up cost prevents mid-cycle re-fetching and gives you the full conceptual model upfront. Universal across all agents."
>
> "3. **Read your facts/**: `agents/<your-slug>/facts/*.md` — all fact files. These are the supersede-in-place keyed facts about Jez, his environment, stack, and preferences. The folder is small by design; read the lot…"
>
> "4. **Read the owner context**: `wiki/owner/CLAUDE.md` auto-loads if present (cascading). Plus `wiki/owner/voice.md` if it exists — overlays your CLAUDE.md Voice section with the user's specific preferences…"
>
> "5. **Pick up open tasks**: read `agents/<your-slug>/tasks/*.md` filtered on `surface: true`. Present in priority order (urgent → high → normal). Tasks with `assignee: jez` + `blocked: true` are decisions pending Jez — surface these explicitly."

**Verification:** No checklist block; instead a `## Self-check` section that names the failure mode directly: *"If you find yourself replying to a \"hi\" or \"kickoff\" with \"What would you like to do?\" — you skipped warm-up OR you ignored step 11. Both are wrong. Restart…"*

**Composition table:** None — kickoff stands alone. Pairing with handover is mentioned in handover's table, not here.

**Non-obvious disciplines:** Embedded in the final step (`Now work` — *"Asking is never the right move after kickoff"*) and the `Self-check` block. No standalone section.

---

### 2. `skills/handover/SKILL.md`

**Length:** ~95 lines.

**Frontmatter description (verbatim):**
> "Session-closing bookend (pairs with kickoff). Land in-flight context to status + journal + kanban, commit your own workstream with adoption-guidance commit message, optionally brief siblings about work that crosses their scope. Without it, sessions end abruptly — context lost in the dying conversation, uncommitted work sits in the working tree, siblings orient cold next session. Run on user signal (\"wind up\" / \"handover\" / \"wrap up\" / \"I'm done\") or at natural session end."

**When to invoke (verbatim):**
> "**User signal** — *\"wind up\" / \"handover\" / \"wrap up\" / \"that's it for now\" / \"I'm done\"*"
> "**Natural session end** — about to close the laptop, run out of attention, hit context limits"
> "**After a self-contained unit** of cross-cutting work even mid-session, if you want the work durable before continuing"

**Procedure — first five step headers verbatim:**

> "### 1. Land in-flight context" — followed by a four-row table mapping each artefact (`tasks/`, `journal/`, `kanban/`, `facts/`) to its update-if condition.
>
> "### 2. Save your files; stamp frontmatter on shared edits" — explains R2 sync replaces git push, lists what still needs discipline (shared files in `wiki/`).
>
> "### 3. Optional: record a narrative commit" — shows the `goanna commit -m "..."` shape.
>
> "### 4. Inbox cleanup — graduation check + archive" — names the four promotion paths (finding / concept / skill / decision) and the archival rule.
>
> "### 5. Sibling briefs (optional)" — when to drop a brief into another agent's inbox.

**Verification (verbatim):**
> "- [ ] `tasks/` updated (open items accurate; surface:true set for anything Jez needs to see)"
> "- [ ] `journal/<today>.md` has at least one entry for this session (terse)"
> "- [ ] Frontmatter stamped on any shared-file edits (`last_edited_by`, `last_edited_at`, `last_change_summary`)"
> "- [ ] (Optional) `goanna commit -m \"...\"` recorded if the session had a milestone worth marking"
> "- [ ] Sibling brief(s) filed if this session crossed agent scopes"
> "- [ ] User told you wound down (one-line summary of what landed)"

**Composition table:** Three-row table pairing handover with `kickoff` (bookend), `reflect` (different cadence), and `propose-skill` (run before handover if a procedure emerged).

**Non-obvious disciplines:** Four bullets — most striking is *"Handover isn't reflect"* (preventing scope creep into the daily synthesis) and *"Memory entries are permanent. When appending to `journal/<today>.md`, write something a future session can actually use, not a stream-of-consciousness log. Terse beats verbose."*

---

### 3. `skills/curate/SKILL.md`

**Length:** ~106 lines.

**Frontmatter description (verbatim):**
> "Weekly curation pass. Read each agent's recent findings, surface cross-cutting patterns, promote stable patterns to shared knowledge, identify coaching targets (nested teams only). Run by librarian in the 4-agent baseline; by the team's parent agent in nested teams. Weekly, Friday afternoon or Sunday evening."

**When to invoke (verbatim):**
> "Weekly. Friday afternoon (after the week's work) or Sunday evening (before next week starts), quiet times where reflection won't compete with active work."

**Procedure — first five step headers verbatim:**

> "### 1. List the agents to review" — `ls -d` one-liner for baseline and nested.
> "### 2. Read each agent's recent findings" — shell loop walking `findings/` folders; instruction to look at the last 7-14 days + status field updates + volume.
> "### 3. Look for cross-cutting patterns" — four-row signal/action table (same gotcha across 2+ agents → promote to `skills/` or `wiki/knowledge/`; etc.).
> "### 4. Identify coaching / growth targets per agent" — three diagnostic questions, then a one-line note per agent.
> "### 5. Promote stable patterns" — destination paths spelled out (`wiki/knowledge/<topic>/concept.md`, `skills/<name>/SKILL.md`, parent's `CLAUDE.md`), plus the source-finding update discipline.

**Verification:** No checklist; instead `## Output` section listing what should exist *"By the end of curate"* — one coaching message per child (or note none warranted), zero or more promotions, source findings updated, optional surface-to-user.

**Composition table:** None — curate references hygiene rules and the promotion targets inline rather than via a table.

**Non-obvious disciplines:** Section is titled `## Failure modes` instead. Four named anti-patterns: *"Coaching as fault-finding. Continuous monitoring. Vague coaching. Aggressive promotion."* Each gets one sentence — terse, no embroidery.

**Time budget stated explicitly:** *"30-60 minutes per week for a team with 3-5 children. Don't expand to fill more time."*

---

### 4. `skills/reflect/SKILL.md`

**Length:** ~118 lines.

**Frontmatter description (verbatim):**
> "End-of-cycle consolidation. Two tiers — light (per-cycle, ~15 min) and full (hourly). Light closes the loop on what just happened. Full adds self-improvement: skill-candidate check, facts/ review, findings promotion, tidy."

**When to invoke:** A 4-row tier table inside the body — *"Light: end of every short cycle (main, ~15 min). Full: end of every hourly cycle."*

**Procedure — first five steps verbatim:**

> "### 1. Append cycle narrative to today's journal"
> "One short entry per cycle. What happened, what landed, what's open. If the cycle was quiet, a single sentence is fine — don't manufacture noise."
>
> "### 2. Note observations not yet filed"
> "Anything noticed this cycle that doesn't belong in the journal narrative — a pattern, a friction point, a gap — write it as a one-liner here. Promote to a finding if it recurs."
>
> "### 7. Update tasks/" *(numbered 7 because the light tier runs only 1, 2, 7)*
> "Open items: ensure `task-<slug>.md` exists and `status` is accurate. Completed: delete the task file…"
>
> "### 3. Skill-candidate check" *(full tier)*
> "Look at what you did this cycle and this session. Ask: \"Did I do something manually that I've now done 2 or more times?\" If yes — file a finding tagged `skill-candidate`…"
>
> "### 4. Facts/ review"
> "Scan `agents/<my-slug>/facts/`. For each fact file, ask: Is this still accurate? If not, update it in place…"

**Verification:** None as a checklist; lives in the `## Non-obvious disciplines` block: *"The skill-candidate check and promotion review are where the fleet self-improves. These steps are where procedures stop being individual hacks and become team knowledge. Don't skip them on full reflect."*

**Composition table:** Four-row table at the end mapping `kickoff`, `glance`, `reflect (light)`, `reflect (full)` to their cycle position and read/write weight.

**Non-obvious disciplines (verbatim):**
> "**Reflection distils YOUR work, not external content.** No tech-news summaries."
> "**Don't manufacture lessons you didn't earn — but look hard before declaring quiet.** Check journal, inbox, and recent findings before calling it a quiet cycle."

---

## § Skill-body voice + granularity analysis

### Voice

- **Imperative second-person**, addressed to the agent doing the work. *"Read your facts/"*, *"Pick up open tasks"*, *"Land in-flight context"*. No *"the agent should…"* — direct commands only.
- **Strong verbs in step headers.** Land, Pick up, Soak up, Glance, Wire, Promote, Stamp. Never *"perform"* or *"undertake"*.
- **Punchy bold-led bullets, not paragraphs.** Pattern is `**Verb phrase**: explanation`. Reads as a checklist that happens to have prose.
- **Names the failure mode directly.** Kickoff: *"Asking is never the right move after kickoff."* Curate: *"Coaching as fault-finding."* Reflect: *"Don't manufacture lessons you didn't earn."* No softening.
- **Embeds context inline.** When a step needs a shell command, code block sits inline with the step, not a separate "Code examples" section. Same for YAML frontmatter shapes.
- **Tables for branching choices**, prose for sequential procedure. Curate's signal/action mapping is a table; kickoff's load-files sequence is numbered prose. The rule isn't bullet-heavy vs prose — it's *"is the agent choosing between alternatives, or executing in order?"*
- **Tone is warm-but-terse.** Same register as Jez writing himself: direct, opinionated, never apologetic. *"Don't gold-plate it. The finding is a flag, not a spec."*

### Procedure step granularity

Granularity is **per-template, one observable action each** — but mature skills don't punish themselves for it. Steps cluster naturally:

- A *"step"* in kickoff (e.g. step 3, *Read your facts/*) is one named action with a clear file/glob target. The agent finishes the step when the named files have been read.
- Steps occasionally bundle a primary action with one inline branch (kickoff step 3 names the optional auto-memory bridge). The branch is one sentence, not a sub-procedure.
- When a step has genuine internal structure (handover step 1: four-file landing table), the structure is a table — not nested steps.
- Step count: kickoff has 11, handover 5 (plus an unnumbered final check), curate 8, reflect 7. The number isn't dogmatic; the rule is *"each step is something the agent can finish and tick"*.

The template (`templates/skill/SKILL.md`) is explicit: *"Each step is one observable action — \"run X command\", \"read Y file\", \"ask the user Z\". Not \"consider whether to...\" — decisions belong in the When-to-invoke or Non-obvious-disciplines section."*

### What proves these are mature, not draft

- **Trigger language is concrete.** Kickoff names the exact words (*"hi"*, *"you there?"*, *"kickoff"*); handover names five user-signal phrases verbatim. A draft would say *"when the user wants to wrap up"*.
- **Hooks call out the wrong move by name.** Kickoff's `Self-check` block predicts the exact failure (*"replying to a \"hi\" with \"What would you like to do?\"*) and tells the agent what to do instead. That's experience, not theory.
- **References to siblings, not theory.** Handover's composition table cites three other skills with one-line rationale each. Curate names promotion destinations as file paths (`wiki/knowledge/<topic>/concept.md`). No abstract architecture diagrams.
- **A `## Last updated` line with a one-line reason.** Handover: *"re-authored after audit found it heavily referenced (10+ files) but missing from the skills/ folder."* That's a paper trail — the skill earned its place.
- **Time budgets where ambiguous.** Curate: *"30-60 minutes per week. Don't expand to fill more time."* A draft skill never bounds itself.
- **Failure modes named, not implied.** Every mature skill has either a `## Non-obvious disciplines`, `## Failure modes`, or `## Self-check` block. They don't all use the same header but they all answer *"what would a confident-but-wrong agent get wrong here?"*

---

## § Top-level skill catalogue

60 skills under `skills/*/SKILL.md`. Slugs:

```
boss-job, brains-trust, build-reflect, comparative-portfolio-sweep, curate,
day-job, deep-mine-chat-space, editor-article-writing, editor-escalation,
editor-inbox-triage, editor-publishing, editor-research-sources,
editor-sponsored-content, env-scan, escalate, extract-media,
fetch-jezweb-system-snapshot, fileshare, generate-image, glance, handover,
jezmail-cycle, jezmail-newsletter-ideas, jezmail-preflight, jezmail-social-posts,
kickoff, librarian-job, mine-chat-room, mine-entity, mine-gmail-thread,
mint-specialist, mint-taxonomy, night-job, onboard-agent, pair-pipeline,
produce-podcast-video, propose-skill, query-entities, reconcile-cohort-audit,
reconcile-substrate-probe, reconciler-delta-apply, reflect, render-entity,
review-fleet, rules-sweep, schema-bump, scout-job, secretary-draft,
secretary-flag, secretary-triage, send-form, setup-goanna, skill-gap-scan,
skill-research, source-discovery, surface-memory, team-health, trace-append,
vacancy-scan, worker-job
```

Patterns visible from the catalogue alone:

- **Single verb or verb-noun slugs.** `curate`, `reflect`, `glance`, `escalate`, `render-entity`, `mine-gmail-thread`. No `do-curation` or `curation-workflow`.
- **Role-job pairs.** `boss-job`, `worker-job`, `librarian-job`, `scout-job`, `day-job`, `night-job` — the cycles agents run.
- **Domain prefixes for cluster work.** `editor-*` (six skills), `jezmail-*` (four), `mine-*` (three), `reconcile-*` (three). Office Town can follow the same prefix-for-cluster shape.
- **Lifecycle skills:** `kickoff`, `glance`, `reflect`, `handover` form the universal session bookends. Office Town needs equivalents.

---

## § Reference SKILL.md for `office-town:curate-inbox`

Written in Goanna's voice. This is the canonical shape Office Town's first authored skill should follow.

```markdown
---
name: office-town-curate-inbox
description: End-of-session inbox curation. Read everything that landed in inbox/<agent>/ since last curate, classify each item (act now / file as finding / archive / surface to Jez), and leave the inbox at zero. Run by every Office Town agent at session end, after handover lands files but before the conversation closes. Without it, inboxes accrete and signal drowns in noise within a week.
---

# Office Town: Curate Inbox

Last step of every working session. Pairs with `office-town:handover` — handover lands your own work to files; curate-inbox processes what arrived from siblings, schedulers, and ingest.

## When to invoke

- **End of every session** where inbox/ has items dated since last curate (run `ls -t inbox/ | head` to check).
- **User signal** — *"curate the inbox"*, *"sweep your inbox"*, *"clear inbox"*.
- **After a noisy ingest run** that dropped ≥10 items into inbox/ — process immediately so the next session starts clean.

Don't run if inbox/ is empty. Don't run mid-task — let the current piece of work finish first, then curate.

## Procedure

### 1. List inbox items, newest first

```bash
ls -t /agents/<my-slug>/inbox/*.md 2>/dev/null
```

Read each filename; note the count. If >20 items, you've waited too long between curates — flag this as a finding after step 5.

### 2. Read every item

One pass, no skipping. Each item is a short brief — frontmatter + a paragraph. You're looking for the action, the source, and whether it's still relevant given everything you've done this session.

### 3. Classify each item

For each brief, pick exactly one disposition:

| Disposition | When | What to do |
|---|---|---|
| **Act now** | The brief names a task you can finish in <5 min | Do it; archive the brief |
| **File as task** | Action that needs scheduling | Create `tasks/task-<slug>.md`; archive the brief |
| **Promote to finding** | Pattern named worth keeping across sessions | Write `findings/<slug>.md` with `tag` + `status: open`; archive the brief |
| **Surface to Jez** | Decision only Jez can make | Set `tasks/task-<slug>.md` with `surface: true`, `assignee: jez`, `blocked: true`; archive the brief |
| **Archive** | No action, captured elsewhere, or stale | Move to `inbox/archive/` directly |

### 4. Move archived items

```bash
mv /agents/<my-slug>/inbox/<id>.md /agents/<my-slug>/inbox/archive/
```

Inbox/ must reach zero unprocessed items. If something can't be classified, that's a finding — file it under `findings/needs-routing-<date>.md` rather than leaving it in inbox/.

### 5. Stamp the curate event in your journal

Append to `journal/<YYYY-MM-DD>.md`:

```
## Curate inbox — HH:MM
Processed N items: <count> acted, <count> tasked, <count> promoted, <count> archived.
<one-line note if anything notable surfaced>
```

## Non-obvious disciplines

- **Inbox/ at zero is the goal, not "low".** A two-item inbox carries the same audit weight as a twenty-item one — agents trying to differentiate signal from leftover.
- **Don't promote on first sight.** If a brief looks finding-worthy but you've never seen the pattern before, file as a task instead. Findings need a recurrence count of two before they earn their place.
- **Curate-inbox isn't reflect.** Reflect distils your own cycle; curate-inbox processes inbound briefs from others. Different cadence, different inputs.

## Composition with other skills

| Skill | Composition |
|---|---|
| `office-town:handover` | Run handover first (land your own work), then curate-inbox (process inbound). |
| `office-town:reflect` | Reflect is per-cycle synthesis; curate-inbox is per-session inbox sweep. No overlap. |
| `office-town:promote-finding` | Step 3's "promote to finding" disposition calls into promote-finding for the writing shape. |

## Verification

- [ ] `inbox/<my-slug>/` lists zero unprocessed `.md` files
- [ ] Every classified item has either a paired task file, finding file, or archive move
- [ ] Today's journal has a curate-inbox entry with the count breakdown
- [ ] If >20 items processed, a `findings/inbox-overflow-<date>.md` flag was filed

## See also

- `office-town:handover` — the session-end pair that runs immediately before this skill
- `office-town:reflect` — per-cycle consolidation, different cadence
- `docs/HYGIENE.md` — motion rules for archiving processed content (Goanna doctrine, inherited)

## Last updated

2026-05-28 — initial author, modelled on `goanna:curate` for the inbox-sweep shape and `goanna:handover` for the session-end placement.
```

---

## Summary of intent

Every Office Town skill should be reachable cold by a fresh agent and finishable on first read. The voice is imperative, the steps are tickable, the failure modes are named, and the file paths are concrete. When a section would be filler, omit it — kickoff has no composition table, curate has no checklist, and that's fine. The earned-place test applies inside skills too: would removing this line leave the agent unable to act correctly? If no, cut it.
