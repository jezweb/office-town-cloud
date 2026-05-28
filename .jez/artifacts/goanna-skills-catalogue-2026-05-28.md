# Goanna skills catalogue — what to absorb for Office Town

Date: 2026-05-28
Source: Goanna fleet `skills/` folder (66 files, 60 distinct skills)

## § Catalogue summary

Goanna's `skills/` is a flat folder of `<slug>/SKILL.md` files (one nested skill, `mine-entity`, has 6 sub-briefs). Total: **60 distinct skills, 66 markdown files.**

Categorised by function (with a portability tag in brackets — **FP** = framework-portable, **BS** = business-specific, **GI** = goanna-internal framework-maintenance):

### Session bookends — kickoff/glance/handover/reflect (5 skills)
- `kickoff` (FP), `glance` (FP), `handover` (FP), `reflect` (FP), `build-reflect` (FP)
- The session-start / cycle-start / cycle-end / session-end loop. Load-bearing.

### Cycle-orchestration "job" skills (5 skills)
- `boss-job` (GI), `worker-job` (GI), `librarian-job` (GI), `scout-job` (GI), `night-job` (GI), `day-job` (GI)
- Per-baseline-role hourly entry points. Tied to Goanna's 4-agent baseline; not directly portable but the *shape* (named cycles → SKILL.md per cycle) is.

### Curation & promotion (5 skills)
- `curate` (FP), `team-health` (FP), `review-fleet` (GI — creator-side), `vacancy-scan` (FP), `reflect` (overlap)
- The pattern that turns individual findings into shared knowledge.

### Skill-system meta (4 skills)
- `propose-skill` (FP), `skill-gap-scan` (FP), `skill-research` (FP), `mint-specialist` (FP), `onboard-agent` (FP)
- How the fleet self-extends. The crown jewels for any cortex.

### Memory / continuity (2 skills)
- `surface-memory` (FP), `trace-append` (FP)
- Bridge from session-scoped auto-memory into team-visible substrate; engagement-trace primitive.

### Anti-thrashing & quality (3 skills)
- `escalate` (FP), `pair-pipeline` (FP), `brains-trust` (FP)
- Worker discipline: stop, plan-then-execute, cross-validate.

### Setup / framework maintenance (4 skills)
- `setup-goanna` (BS — references jezweb.net), `env-scan` (FP), `rules-sweep` (FP), `fetch-jezweb-system-snapshot` (BS)
- Onboard a new install; refresh tool-inventory; lift universal patterns.

### Entity mining / CRM (12 skills — mostly BS-shape, FP-pattern)
- `mine-entity` (+ 5 layer briefs + orchestrator), `mine-chat-room`, `mine-gmail-thread`, `deep-mine-chat-space`, `query-entities`, `render-entity`, `comparative-portfolio-sweep`, `reconcile-cohort-audit`, `reconcile-substrate-probe`, `reconciler-delta-apply`, `mint-taxonomy`
- Goanna's "build a CRM out of chat history + email" engine. Specific to client-relationship work but the **shape** (layered multi-source extraction → entity records with engagement traces) is portable to any domain where you accumulate knowledge about external entities.

### Communication / output (10 skills — all BS)
- `editor-article-writing`, `editor-escalation`, `editor-inbox-triage`, `editor-publishing`, `editor-research-sources`, `editor-sponsored-content`, `jezmail-cycle`, `jezmail-newsletter-ideas`, `jezmail-preflight`, `jezmail-social-posts`, `produce-podcast-video`, `secretary-draft`, `secretary-flag`, `secretary-triage`, `send-form`
- Goanna's content-production specialists. Voice-tied to the owner; not directly portable, but the **patterns** (triage → draft → preflight → send → trace) are.

### Media / external (4 skills)
- `extract-media`, `generate-image`, `fileshare`, `source-discovery` (FP)
- Mostly BS (MediaBox, Jezweb fileshare); `source-discovery` is FP (refresh a watch-table).

### Schema / structural (1 skill)
- `schema-bump` (GI — Goanna's own schema)

### Per-category totals
| Category | Count | FP | BS | GI |
|---|---:|---:|---:|---:|
| Session bookends | 5 | 5 | 0 | 0 |
| Cycle-orchestration | 6 | 0 | 0 | 6 |
| Curation & promotion | 4 | 3 | 0 | 1 |
| Skill-system meta | 5 | 5 | 0 | 0 |
| Memory / continuity | 2 | 2 | 0 | 0 |
| Anti-thrashing & quality | 3 | 3 | 0 | 0 |
| Setup / maintenance | 4 | 2 | 2 | 0 |
| Entity mining / CRM | 12 | 0 (pattern-portable) | 12 | 0 |
| Communication / output | 15 | 0 (pattern-portable) | 15 | 0 |
| Media / external | 4 | 1 | 3 | 0 |
| Schema | 1 | 0 | 0 | 1 |
| **Total** | **60** | **21 directly portable** | **32 business-specific** | **8 framework-internal** |

## § Top framework-portable skills (detailed read)

### 1. `kickoff` — session warm-up
- **Purpose**: read role context, owner voice, status breadcrumb, recent memory, comms inbox BEFORE responding.
- **Frontmatter**: *"Warm-up procedure that fires at session start. Reads role context, owner voice, status breadcrumb, scratch, recent memory, comms inbox, and optional indexes BEFORE responding. Triggered by the canonical word 'kickoff' OR automatically on the first user message of a session."*
- **Procedure shape**: 11 numbered steps, each a concrete read action. Step 11 is anti-pattern guard ("don't ask the user what they want — do your job").
- **Non-obvious disciplines**: auto-memory bridge (promote machine-local Claude Code memory to fleet substrate); cron re-registration each session because CronCreate is session-only; explicit "what NOT to do" — never finish kickoff with "what would you like to do?".
- **Composes with**: `glance` (per-cycle catch-up), `handover` (the bookend pair), `reflect` (cycle end).
- **Invoked by**: agents on every session start. Sometimes user-triggered.

### 2. `reflect` — end-of-cycle consolidation (two-tier)
- **Purpose**: per-cycle journal append + skill-candidate check + facts/ review + findings promotion + tidy.
- **Frontmatter**: *"End-of-cycle consolidation. Two tiers — light (per-cycle, ~15 min) and full (hourly). Light closes the loop on what just happened. Full adds self-improvement: skill-candidate check, facts/ review, findings promotion, tidy."*
- **Procedure shape**: 7 steps total. Light tier runs 1-2 + 7; full tier runs all 7. Coding-agents run `build-reflect` before step 1.
- **Non-obvious disciplines**: the skill-candidate check (*"did I do this manually 2+ times?"*) is the engine of self-improvement. Don't manufacture lessons but look hard before declaring quiet. Tidy is conservative — when unsure, leave it.
- **Composes with**: `kickoff`, `glance`, `build-reflect`, `propose-skill`.
- **Invoked by**: agents at end of every cycle (cron-fired or session-end).

### 3. `glance` — per-cycle catch-up
- **Purpose**: lightweight re-read of CLAUDE.md cascade + facts + broadcasts + recent fleet activity at the start of every cron-fired cycle. Without it, long-running sessions drift from their own files.
- **Procedure shape**: 7 steps, all reads except step 7 (one-line journal note IF something changed). Silent glances leave no trace.
- **Non-obvious discipline**: this exists because Claude Code's CLAUDE.md cascade only auto-loads at session start; mid-session edits to identity/voice never propagate. Glance is the per-cycle stitching layer.
- **Composes with**: `kickoff` (heavy, session-start), `reflect` (cycle-end), every cycle job.
- **Invoked by**: agents, automatically at start of every cycle.

### 4. `handover` — session-closing bookend
- **Purpose**: land in-flight context to tasks + journal + kanban; commit with adoption-guidance message; optionally brief siblings.
- **Procedure shape**: 5 steps. Land context → stamp frontmatter on shared edits → optional narrative commit → inbox cleanup with graduation check → sibling briefs.
- **Non-obvious disciplines**: "chat is ephemeral, files are durable." Phone-call traces must carry full substance because there's no back-pointer. The graduation check (*"is anything in this brief evergreen?"*) is the promotion hook.
- **Composes with**: `kickoff` (pair), `reflect` (per-cycle), `propose-skill`.
- **Invoked by**: agents on user signal ("wrap up" / "I'm done") or natural session end.

### 5. `propose-skill` — capture a pattern as a skill
- **Purpose**: turn a just-demonstrated pattern (5+ tool calls / error-recovery / user-correction / novel workflow) into a reusable SKILL.md.
- **Procedure shape**: 4 steps (detect → draft in journal → write file → mention to user). Install-local skill capture is bias-to-action (no approval gate); framework-tier promotion uses a separate `feedback/` flow.
- **Non-obvious disciplines**: most tasks aren't candidates — the *trigger filter* is the discipline, not the approval gate. Drafts go in today's journal first; durable file second. Four-section template (When-to-use / Procedure / Pitfalls / Verification) is mandatory.
- **Composes with**: `reflect` (skill-candidate check fires this), `skill-research` (upstream), `skill-gap-scan` (upstream).
- **Invoked by**: agents after substantive work.

### 6. `curate` — weekly cross-cutting pattern promotion
- **Purpose**: walk each agent's recent findings; surface cross-cutting patterns; promote stable patterns to `wiki/knowledge/` or `skills/`.
- **Procedure shape**: 8 steps. Read findings → look for cross-cutting → identify coaching targets → promote → optional sibling messages → surface to user.
- **Non-obvious disciplines**: surfacing-shaped not acting-shaped. Aggressive promotion fills shared knowledge with noise. Default to "not yet" unless ≥2 agents independently hit the same shape.
- **Composes with**: `team-health` (observes graduation flow), `propose-skill` (target of promotion).
- **Invoked by**: librarian (or team parent in nested teams), weekly.

### 7. `brains-trust` — cross-validated review across frontier models
- **Purpose**: run 3-4 frontier reviewers (different providers, mixed tiers) on a diff/codebase; cross-validate findings; verify-pass after fixes.
- **Procedure shape**: 8 steps. Scope → prompt construction → parallel fire → convergence table aggregation → apply fixes → verify-pass → save audit trail → brief boss.
- **Non-obvious disciplines**: convergence is the signal — anything called by ≥2 reviewers is almost certainly real. Verify-pass is the cheapest safety check (<$0.30). Use sub-agents under your own subscription where possible; OpenRouter for the others. Specific reviewer identity rotates; the cross-validation discipline stays.
- **Composes with**: `escalate` (one of escalation's response modes), `team-health` (cites brains-trust runs as evidence of craft).
- **Invoked by**: agents before commit on non-trivial work; user on demand.

### 8. `escalate` — anti-thrashing trigger
- **Purpose**: when 3 same-shape iterations have failed, stop. Name the failure class; take the matching response.
- **Procedure shape**: 5 steps. Write failure log → classify (5 classes) → take matching response → write a finding → update memory.
- **Non-obvious disciplines**: "more attempts" is rarely the answer; don't escalate at iteration 1 (that's giving up); classify before responding; always write a finding (otherwise teaches nothing).
- **Composes with**: `pair-pipeline` (brief-first reduces escalation count), `brains-trust` (alternative for capability-ceiling/hallucination cases), `reflect`.
- **Invoked by**: agents mid-task.

### 9. `team-health` — manager-mode sweep
- **Purpose**: walk each agent's file family; check inventory, activity, bloat, graduation flow, standards compliance, cross-agent coordination, runtime location. File ONE finding per cycle.
- **Procedure shape**: 8 steps, surfacing-shaped not acting-shaped. The manager observes; agents act.
- **Non-obvious disciplines**: surface, don't act. Empty cycles still produce a finding ("no issues this week"). Every suggested brief names an owner.
- **Composes with**: `curate`, `vacancy-scan`.
- **Invoked by**: boss (or parent agent), weekly cron.

### 10. `trace-append` — engagement trace primitive
- **Purpose**: after any substantive external-entity interaction, append a one-line trace to the entity's `## Recent` section. Multi-actor format names who did it; multi-channel format names where.
- **Procedure shape**: 8-step procedure with 3 size-shapes (short trace / rich trace / touchpoint atomic file).
- **Non-obvious disciplines**: the trace IS the canonical record — back-pointers exist for verification only. Phone calls have no fallback, so traces must carry full substance. Actor field is non-negotiable (multi-writer accumulating store, not per-user log).
- **Composes with**: `render-entity`, `secretary-draft`, `handover`, `reflect`, `curate`.
- **Invoked by**: agents after any substantive interaction.

### 11. `surface-memory` — promote auto-memory to wiki
- **Purpose**: bridge from session-scoped Claude Code memory (`~/.claude/projects/<slug>/memory/`) to team-visible substrate when an entry crosses "useful for me" to "useful for the team".
- **Procedure shape**: 7 steps. Identify source → decide target → check existing → write wiki content → update memory frontmatter with `surfaced_to:` → cross-reference → optionally broadcast.
- **Non-obvious disciplines**: classification matters (most memories stay personal); never delete the memory after surfacing; rewrite for team-audience (drop curator-internal phrasing); fold related memories in same commit.
- **Composes with**: `propose-skill`, `curate`.
- **Invoked by**: user trigger ("surface that") or agent periodic self-audit.

### 12. `mint-specialist` — onboard a child agent
- **Purpose**: full mint flow for a new specialist child agent — scope, signal sources, single output target, cadence per stream, kickoff brief, cron wiring from day 1.
- **Procedure shape**: 10 steps. Confirm prereqs → settle shape via 12-question dialogue → pre-check framework → decide output target → invoke `onboard-agent` for scaffolding → write CLAUDE.md → kickoff brief → wire cadence per stream → optional rotation → surface to user.
- **Non-obvious disciplines**: streams categorise differently (mining/monitoring/reactive); wire cron from day 1 (don't defer); record wiring in agent's own CLAUDE.md (single source of truth).
- **Composes with**: `onboard-agent` (invoked in step 5).
- **Invoked by**: parent agents + users.

## § Gaps Goanna doesn't fill (or fills outside skills/)

Patterns Goanna handles in non-skill artefacts (CLAUDE.md inline, scripts, prose docs) that Office Town would arguably benefit from having as proper skills:

1. **Cron-cycle wiring** — Goanna's cycle declaration lives in CLAUDE.md `cycles:` frontmatter; the actual CronCreate happens inline in `kickoff` step 10. A dedicated `wire-cycles` skill (with verification + drift detection) would close this gap.
2. **Skill versioning / deprecation** — Goanna's `Last updated` log inside each skill is convention-only. No skill for "deprecate this skill cleanly" or "fork a skill for a different domain". Office Town will hit this within months.
3. **Decisions log** — `wiki/decisions/<date>-<topic>.md` is referenced everywhere but there's no `record-decision` skill. Current path is "write the file by hand"; a skill would standardise.
4. **Cross-install / cross-cortex propagation** — Goanna handles fleet propagation via the `goannad` daemon + R2 substrate. Office Town as a Goose extension may need a `sync-changes` or `pull-upstream` skill that doesn't currently exist in Goanna.
5. **Sub-agent dispatch with budgeted context** — `review-fleet` does this inline; no general `dispatch-subagent` skill capturing the budgeted-prompt + distilled-return pattern.
6. **Rule + skill hygiene** — `rules-sweep` exists for `~/.claude/rules/`. No equivalent for *the cortex's own rules and skills* (audit own surface for staleness, duplicate scope, dead pointers).
7. **Proof-of-done framing** — referenced in user's `~/.claude/CLAUDE.md` ("write down the literal yes/no test before any non-trivial build") but no skill that walks an agent through producing one.
8. **Verify-by-inspection** — referenced as discipline but no skill that prompts an agent to sample actual outputs rather than aggregate stats.
9. **Open-ended chat-on-substrate** — `mine-chat-room` exists but it's mining-shaped (extraction). No skill for "have an exploratory conversation against the substrate to surface what the user actually wants" — Goanna's `ask` tool covers this on the read side, but the agent-side discipline is implicit.
10. **Domain-specific equivalents to entity-mining** — Office Town will have its own "primary objects" (could be users, projects, documents, builds, conversations). Goanna's `mine-entity` shape is portable but needs a domain-specific rewrite per cortex.

## § Recommended starter set for Office Town

A starter set of **22 skills** for Office Town's `wiki/skills/` folder, drawing from Goanna's framework-portable set + filling the gaps above. Names are kebab-case; descriptions kept owner-neutral.

### Session-loop bookends (5)
1. **`kickoff`** — Adopt-verbatim (with cortex-rename). Session-start warm-up: read role context, owner files, recent state, inbox, before responding. *Load-bearing.*
2. **`glance`** — Adopt-verbatim. Per-cycle catch-up read at start of every cron fire — keeps long-running sessions current.
3. **`reflect`** — Adopt-verbatim. End-of-cycle consolidation, two-tier (light per-cycle + full hourly with skill-candidate check + findings promotion + tidy).
4. **`handover`** — Adopt-verbatim. Session-closing bookend: land in-flight context to durable substrate; commit with adoption guidance; brief siblings.
5. **`build-reflect`** — Adapt. End-of-session discipline for coding agents — update as-built architecture doc for each project touched.

### Skill-system meta (4)
6. **`propose-skill`** — Adopt-verbatim. Capture a just-demonstrated pattern as a reusable skill. Four-section template enforced.
7. **`skill-gap-scan`** — Adopt-verbatim. Walk recent fleet activity; surface capability shapes the team keeps doing manually; rank by frequency × severity × adaptability.
8. **`skill-research`** — Adapt. Research prior art across skill marketplaces + general web; produce synthesis brief ready for `propose-skill` to compose.
9. **`mint-specialist`** — Adapt. Full flow for adding a child agent: scope discipline, signal sources, single output target, cadence per stream, kickoff brief, cron wiring from day 1.

### Curation & quality (4)
10. **`curate`** — Adopt-verbatim. Weekly cross-agent finding promotion: cross-cutting patterns → shared knowledge or skills.
11. **`team-health`** — Adopt-verbatim. Weekly inventory + activity + bloat + graduation-flow + standards sweep across the team. Surface, don't act.
12. **`brains-trust`** — Adopt-verbatim. Cross-validated review across 3-4 frontier models (mixed provider, mixed tier). Convergence at ≥2 = real.
13. **`vacancy-scan`** — Adapt. Periodic capacity-gap detection: where is the team losing time the same way every week?

### Anti-thrashing (2)
14. **`escalate`** — Adopt-verbatim. After 3 same-shape failed iterations, stop. Classify the failure; take the matching response; always write a finding.
15. **`pair-pipeline`** — Adopt-verbatim. Plan-then-execute pattern with an explicit brief artefact between phases. Same agent, same session, different mindsets.

### Memory & continuity (2)
16. **`surface-memory`** — Adopt-verbatim. Promote a team-relevant entry from session-scoped auto-memory to durable team-visible substrate.
17. **`trace-append`** — Adapt. Append one-line traces to entity records after substantive interactions. Multi-actor, multi-channel. Adapt to Office Town's primary objects (whatever those become).

### Setup & framework maintenance (2)
18. **`env-scan`** — Adopt-verbatim. First-run environment inventory: walk MCPs, runtime tools, deferred tools, connected accounts. Long-lived reference + delta on re-scan.
19. **`rules-sweep`** — Adopt-verbatim. Quarterly walk of personal rules accumulated across machines/identities; surface lift-candidates as universal patterns.

### Gap-fillers (new-write) (3)
20. **`record-decision`** — New-write. Walk the agent through writing a decision-log entry: context, options weighed, choice, rationale, who decided, when to revisit. File at `wiki/decisions/<date>-<topic>.md`.
21. **`wire-cycles`** — New-write. Read agent's CLAUDE.md `cycles:` declaration, list current cron registrations, diff, register missing ones, log drift. Pulls inline logic from `kickoff` step 10 into its own discipline.
22. **`proof-of-done`** — New-write. Before any non-trivial build: walk the agent through writing the literal yes/no test that proves each slice ships — real services, real data, end-to-end. Save alongside the build spec.

Skills 1-19 = adopted from Goanna (15 adopt-verbatim, 4 adapt). Skills 20-22 = new-writes addressing Goanna's own gaps. Total starter footprint: **22 skills**, ~3,500-5,000 lines of markdown, readable end-to-end in a single sitting — the right size for a cortex that's earning its primitives rather than codifying speculation.

## Notes on classification calls

- **`render-entity`** could go either way — the script is Goanna-specific but the *pattern* (markdown is substrate, HTML is generated view) is universal. Left out of starter set because Office Town's primary objects aren't yet defined.
- **`onboard-agent`** is subsumed by `mint-specialist` for the nested case; if Office Town doesn't have a 4-agent baseline analogue, the top-level case may not earn its place yet.
- **`fetch-jezweb-system-snapshot`** and **`setup-goanna`** are install-specific; Office Town will need its own onboarding skill but shouldn't fork these directly.
- **Editor skills (article-writing, publishing, etc.)** are voice-tied to one owner. Pattern-portable when Office Town has its own content-production specialist, but not adoptable directly.
- **Mining skills (mine-entity, mine-chat-room, mine-gmail-thread)** are powerful but Goanna-shaped. Office Town will likely want analogues for its own primary-object types — these are reference material, not adoption candidates.

Last updated: 2026-05-28
