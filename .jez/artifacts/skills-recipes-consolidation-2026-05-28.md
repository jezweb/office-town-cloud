# Skills + Recipes Already Named in Our Planning Docs

**Date**: 2026-05-28
**Status**: Consolidation pass before synthesising with Goanna-research findings. Pulls every skill or recipe mentioned across the design docs into one starter list with rationale + priority.

The three Goanna research agents (catalogue, curator/librarian, universal-shape) are running in parallel against the Goanna substrate. When their findings return I'll merge into a final candidate set.

---

## Already-named skills (from our docs)

### Tier 1 — MVP (Session 1-2)

Per `goose-self-improvement-survey-2026-05-28.md`: **start with skill files alone.** If we can reliably write one skill per useful session and have it discovered next session, the loop is real.

| Skill slug | One-liner | Source doc | Justification |
|---|---|---|---|
| `office-town:curate-inbox` | Pull recent items from connected sources via user's Goose MCPs → stage to Inbox → call `/api/ingest` | curator-pattern + session-1-build-spec | The MVP curator skill — closes the first ingestion loop |
| `office-town:curator` | Session-end synthesis: reviews this session and writes the right artefacts (skill / recipe / memory / tom append / typed entry) | goose-self-improvement-survey | The session-end "living memory" curator — closes the self-improvement loop |
| `office-town:cite-source` | Append `derived_from:` provenance to any auto-generated entry | curator-pattern | Used by other skills; non-optional |
| `office-town:kickoff` | Universal session-start — read facts, owner cascade, status, journal, inbox, recent findings; wire crons; then act | framework + cortex-shape Part 1.5 | Universal — every persona invokes |

### Tier 2 — Curator-shape skills (Session 2-3)

Curator + Librarian both are curator-shape (different scopes); some shared, some specialised.

| Skill slug | One-liner | Source doc | Scope |
|---|---|---|---|
| `office-town:extract-decision` | Convert a thread/doc into a structured decision entry with wiki_links to people + projects + orgs | curator-pattern | Curator (inbound) |
| `office-town:reconcile-org` | Merge duplicates across sources — ABR-verify-first, peer-vs-umbrella judgment, auto-merge ≥0.85 confidence + signal, queue ambiguous | cortex-shape Q9 + curator-pattern + agent-autonomy-default | Curator (inbound) |
| `office-town:promote-from-inbox` | Graduate an Inbox chunk into a typed entry when relevance_score crosses promotion threshold | curator-pattern + cortex-shape Part 6 | Curator (inbound) |
| `office-town:weekly-digest` | Generate global digest entry from past week's wiki_audit + Inbox + reactive findings | curator-pattern + cortex-shape Part 7 | Librarian (organisational) |
| `office-town:link-graph` | Suggest + write wiki_links between newly-ingested entries and existing entities | curator-pattern | Curator (inbound) |
| `office-town:resolve-conflict` | Attempts auto-resolution of `.conflict-<ts>` files first; surfaces only the ambiguous tail with a recommended resolution | curator-pattern + cortex-shape Q6 + agent-autonomy-default | Curator (both scopes) |
| `office-town:graduate-finding` | Promote watching-brief at n≥3 confirmed instances to `wiki/knowledge/<topic>/concept.md` | cortex-shape Part 6 | Librarian (organisational) |

### Tier 3 — Quality / hygiene skills (Session 3-5)

| Skill slug | One-liner | Source doc |
|---|---|---|
| `office-town:lint-pass` | Orphan-link detection, broken-link sweep, schema-version drift check, status-field accuracy audit | cortex-shape Part 8 + research-wiki-for-agents (Karpathy's "wiki rots in days without lint") |
| `office-town:cascade-refresh` | When a collection's `schema_version` bumps, walk old-schema entries and enrich each to new schema | cortex-shape Q5 + Part 7 |
| `office-town:enrich-stub` | When an entry has `status: stub`, run Vectorize search + web research + cross-source MCP lookups to fill missing required fields | cortex-shape Q4 + agent-autonomy-default |
| `office-town:audit-stale` | Walk entries with `last_updated > 90d ago`; mark stale or archive with reasoning | cortex-shape Part 8 (no-archive-folders rule) + Goanna's librarian quiet-cycle-hygiene mode |
| `office-town:reconcile-conflict-queue` | Process the dashboard's reconciliation queue; auto-resolve the auto-resolvable; surface the rest with recommended actions | agent-autonomy-default |

### Tier 4 — Search + retrieval skills (depends on Session 3's MCP grep/filter/walk shipping)

| Skill slug | One-liner | Source doc |
|---|---|---|
| `office-town:answer-from-cortex` | The librarian's primary skill: take a question, run grep+filter+walk+semantic, return the answer with sources | agent-search-capability + cortex-shape Part 1 |
| `office-town:trace-decision` | "Who decided X, when, and why?" — wiki_audit replay + decision walk | agent-search-capability §5 + framework §13 (epistemics) |
| `office-town:client-snapshot` | "Show me everything about client X" — structured + search + graph + temporal combined | agent-search-capability §1 (the worked example) |

### Tier 5 — Living-memory write surfaces (Session 1.5 — depends on Office Town MCP having the four write actions)

These aren't skills the user invokes — they're MCP actions the curator skill calls.

| MCP action | Per `goose-self-improvement-survey` Section J |
|---|---|
| `wiki(action: skill_write, name, description, body)` | Writes new skill to `~/.agents/skills/office-town-<name>/SKILL.md` via cortex sync |
| `wiki(action: recipe_write, name, yaml)` | Writes new recipe to `~/.config/goose/recipes/office-town/<name>.yaml` |
| `wiki(action: remember_memory, category, data, tags, is_global)` | Goose Memory MCP-compatible signature; backed by cortex |
| `wiki(action: tom_append, text)` | Appends to `~/.config/office-town/tom.md` for re-injected-every-turn rules |

---

## Already-named recipes (from our docs)

Recipes are parameterised multi-step workflows. We've named fewer of these because the framework prioritises skills, but several are worth shipping.

| Recipe | What it does | Source doc |
|---|---|---|
| `office-town:onboard-contact-from-email` | Inputs: email body. Steps: classify → extract Contact + Org candidates → reconcile against existing → write typed entries → link | curator-pattern + structure-shaped-ingestion |
| `office-town:save-email-to-cortex` | Inputs: email message ID. Steps: read raw → store in `wiki/raw/gmail/` → classify → extract → link | living-memory section of framework + structure-shaped-ingestion |
| `office-town:summarise-pdf` | Inputs: PDF URL/path. Steps: download → text-extract → classify (knowledge/decision/research) → write structured entry | curator-pattern (mentioned in passing) |
| `office-town:extract-action-items` | Inputs: thread/transcript. Steps: identify decisions + commitments + tasks → write each as own entry → link | curator-pattern recipes section |
| `office-town:weekly-digest-generator` | Inputs: date range (default last 7 days). Steps: query wiki_audit + Inbox → summarise per collection → write global digest | curator-pattern + cortex-shape Part 7 |
| `office-town:client-brief` | Inputs: org slug. Steps: pull entity + contacts + projects + recent traces + decisions → compose pre-meeting brief | (implied across multiple docs; not explicitly named) |

---

## Universal-skill inheritance from Goanna

Per `goanna-doctrine-extracted-2026-05-28.md`, four universal skills exist in Goanna that Office Town should adopt or adapt:

| Goanna skill | Office Town equivalent | Treatment |
|---|---|---|
| `skills/kickoff/SKILL.md` | `office-town:kickoff` | **Adapt** to Goose model (cascade is auto-loaded; persona reads working substrate + locates working dir as homing beacon) |
| `skills/handover/SKILL.md` | `office-town:handover` | **Adopt verbatim** (session-end status + journal landing pattern is universal) |
| `skills/curate/SKILL.md` | `office-town:curator` (session-end synthesis) | **Adapt** — the universal curate operation re-purposed as session-end living-memory pass |
| `skills/reflect/SKILL.md` (if exists) | `office-town:reflect` | **Read first** — Goanna agents have reflection cycles for self-tuning. Worth adopting if it exists |

The Goanna-universal-shape research agent will return the actual SKILL.md bodies for these so we can clone their voice + granularity.

---

## What's NOT yet named — gaps we know exist

Categories where we haven't yet named specific skills but should:

### Worker-shape skills (doer)
The Worker persona executes external actions — sends emails, ships code, posts updates. None of its skills are named yet. Likely candidates:

- `office-town:send-email` (with `agent-autonomy-default` discipline: present recommended draft + sources + ask for approval)
- `office-town:publish-decision` (post a decision to a Slack channel or a designated client briefing)
- `office-town:scaffold-project` (mint a new `wiki/projects/<slug>/` from a template + brief)

### Scout-shape skills (watcher)
Scout finds external information. Candidates:

- `office-town:scrape-and-summarise` (URL → web fetch → summary → optionally write to `wiki/raw/scrapes/`)
- `office-town:competitor-watch` (recurring; given a competitor list, look for material changes)
- `office-town:market-update` (broader landscape watch)

### Boss-shape skills (router)
Boss delegates to other personas. Skills here are thin:

- `office-town:triage` (decide which persona to dispatch + write the comms brief)
- `office-town:status-report` (compose the daily/weekly user-facing status)

### Owner-cascade maintenance
- `office-town:learn-voice` (read recent conversation transcripts → suggest additions to `wiki/owner/voice.md`)
- `office-town:learn-vocabulary` (same shape for `wiki/owner/vocabulary.md`)

These all benefit from the Goanna catalogue research agent's findings — many will likely have a Goanna parallel already.

---

## Sizing — what's reasonable for the starter set

Per the Goose self-improvement survey: ~15-25 starter skills is healthy. More than that and the LLM has too many skills to choose from cleanly. Per Goanna's pattern of authoring at n=3 instances: we should *seed* the catalogue with the obvious shapes but let later skills emerge from observed need.

Starter (ships with Office Town v1.0):
- **4 universal**: kickoff, handover, curator (session-end), cite-source
- **6 curator-inbound** (Tier 2): curate-inbox, extract-decision, reconcile-org, promote-from-inbox, link-graph, resolve-conflict
- **3 librarian-organisational**: weekly-digest, graduate-finding, lint-pass
- **3 quality/hygiene** (Tier 3): cascade-refresh, enrich-stub, audit-stale
- **3 retrieval** (Tier 4 — ships when search MCP lands): answer-from-cortex, client-snapshot, trace-decision

Total: **19 starter skills**. Each authored against the Goanna skill-body template. Recipes ship as 4-6 of the obvious ones.

This is a starting catalogue — the system is designed for skills to be *earned* (3-instance threshold), so the count grows over time as patterns prove themselves. We're seeding the catalogue, not closing it.

---

## What the research will add

Three things I expect from the parallel agents that aren't in this consolidation yet:

1. **From the catalogue agent** — Goanna-specific skills we hadn't thought of that have framework-portable shape (probably ~5-10 surprises)
2. **From the curator/librarian agent** — sub-specialist hints (does Goanna split out a "reconciler" or "secretary"? where? worth replicating in Office Town?)
3. **From the universal-shape agent** — a reference SKILL.md in Goanna's voice for `office-town:curate-inbox` we can clone for everything else, plus confirmation of the 4 universal skills' content

When all three return I'll merge into a final candidate set + ship the starter SKILL.mds for Session 1.5 / Session 2.

---

## Related docs

- `office-town-framework-2026-05-28.md` — the framework, Section 14 (Living Memory) names the four write surfaces
- `cortex-shape-2026-05-28.md` — design contract for collections, with skill-body template at Part 8
- `curator-pattern-2026-05-28.md` — curator agent + skills inventory
- `goose-self-improvement-survey-2026-05-28.md` — what Goose supports for runtime artefact writing
- `goanna-doctrine-extracted-2026-05-28.md` — Goanna patterns we're absorbing
- (pending) `goanna-skills-catalogue-2026-05-28.md`
- (pending) `goanna-curator-librarian-skills-2026-05-28.md`
- (pending) `goanna-skill-body-shapes-2026-05-28.md`
