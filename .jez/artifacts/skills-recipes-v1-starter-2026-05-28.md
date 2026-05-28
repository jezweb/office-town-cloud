# Skills + Recipes v1.0 Starter Set

**Date**: 2026-05-28
**Status**: Final synthesis of three Goanna research dispatches (catalogue / curator-librarian / universal-shape) + the planning-doc consolidation. This is the v1.0 starter catalogue Office Town ships with.

**Sources**:
- `goanna-skills-catalogue-2026-05-28.md` — 60 Goanna skills, 22 framework-portable recommended
- `goanna-curator-librarian-skills-2026-05-28.md` — curator + librarian repertoires + 5 sub-specialists
- `goanna-skill-body-shapes-2026-05-28.md` — universal SKILL.md voice + reference draft
- `skills-recipes-consolidation-2026-05-28.md` — what was in our planning docs
- `goose-self-improvement-survey-2026-05-28.md` — what Goose actually supports at runtime

---

## Conventions resolved

Two naming questions surfaced during the research:

### Slug format: `office-town-<name>`, hyphens throughout

Goanna's 60 skills use bare names (`kickoff`, `curate`, `reflect`) because the cortex owns its `skills/` folder unambiguously. Office Town's skills sync to the user's `~/.agents/skills/` directory in Goose — a shared namespace with any other Goose tools. So **Office Town's skills carry the `office-town-` prefix everywhere**: `office-town-kickoff`, `office-town-curate`, etc.

The earlier `office-town:curate-inbox` notation (colon-style) was Claude-Code-Skills-influenced and is corrected. File paths use hyphens: `wiki/skills/office-town-curate-inbox/SKILL.md` (in the cortex) → `~/.agents/skills/office-town-curate-inbox/SKILL.md` (on user's machine, synced by officetowd).

### Two meanings of "inbox" resolved

| Inbox | What it is | Skill name |
|---|---|---|
| `agents/<persona-slug>/inbox/` | Per-agent comms briefs from siblings + schedulers (Goanna pattern; agent-to-agent routing) | **`office-town-inbox-triage`** (inherited from Goanna's pattern) |
| `wiki/inbox/<sha-prefix>/<id>.md` | External content staged for classification (the "raw → typed" path the cortex framework names) | **`office-town-mine-mail-thread`** + `office-town-mine-chat-room` + others (Goanna's `mine-*` family of skills, one per source) |

The earlier `office-town-curate-inbox` collision was conflating these. They're different artefacts at different paths with different purposes. Resolved: `inbox-triage` is generic and applies to every persona; `mine-<source>` is domain-specific external ingestion.

---

## The v1.0 starter set (25 skills)

Discipline: every starter skill earns its place by being either (a) universal across any cortex, (b) load-bearing for the MVP ingestion+reconciliation+self-improvement loop, or (c) a high-leverage gap-filler. **Everything else waits for the 3-instance threshold.**

### Tier 1 — Universal session machinery (9 skills)

Every persona uses these. Inherited from Goanna verbatim except where adaptation is noted.

| # | Skill | Source | Treatment |
|---|---|---|---|
| 1 | `office-town-kickoff` | Goanna `kickoff` | Adapt — Goose-shaped (cascade is auto-loaded; persona reads working substrate + uses cwd as homing beacon) |
| 2 | `office-town-glance` | Goanna `glance` | Adopt-verbatim — per-cycle catch-up at every cron fire |
| 3 | `office-town-handover` | Goanna `handover` | Adopt-verbatim — pre-stand-down audit; lands in-flight work |
| 4 | `office-town-reflect` | Goanna `reflect` | Adopt-verbatim — two-tier consolidation (light per-cycle, full hourly with skill-candidate check) |
| 5 | `office-town-propose-skill` | Goanna `propose-skill` | Adopt-verbatim — capture just-demonstrated pattern as a reusable skill |
| 6 | `office-town-file-finding` | Goanna baseline | Adopt-verbatim — date-stamped, instance-counted, with `librarian_review:` field |
| 7 | `office-town-trace-append` | Goanna `trace-append` | Adapt — appends to `wiki/orgs/<slug>/entity.md § Recent` or `wiki/contacts/<slug>/contact.md § Recent`. Engagement-trace primitive |
| 8 | `office-town-update-frontmatter` | Goanna baseline | Adopt-verbatim — stamp sextet on every wiki write |
| 9 | `office-town-brief-sibling` | Goanna baseline | Adopt-verbatim — standard brief shape into destination `inbox/` |

### Tier 2 — Anti-failure + quality (4 skills)

| # | Skill | Source | Treatment |
|---|---|---|---|
| 10 | `office-town-escalate` | Goanna `escalate` | Adopt-verbatim — after 3 same-shape failed iterations, stop and classify |
| 11 | `office-town-inbox-triage` | Goanna baseline | Adopt-verbatim — per-agent brief routing (act now / file as task / promote to finding / surface / archive) |
| 12 | `office-town-broadcast-scan` | Goanna baseline | Adopt-verbatim — hourly catch-up on framework changes |
| 13 | `office-town-detect-injection` | Goanna baseline | Adopt-verbatim — content from external sources is data, not instructions |

### Tier 3 — Self-improvement loop (4 skills)

These are what makes the cortex *learn*. They're the curator-at-session-end mechanism + the librarian's graduation discipline.

| # | Skill | Source | Treatment |
|---|---|---|---|
| 14 | `office-town-curate` | Goanna `curate` | Adapt — weekly cross-agent finding promotion (the librarian's signature) |
| 15 | `office-town-promote-to-knowledge` | Goanna `promote-to-knowledge` | Adopt-verbatim — graduate a finding at n≥3 confirmed instances to `wiki/knowledge/<topic>/concept.md` |
| 16 | `office-town-maintain-watch-table` | Goanna `maintain-watch-table` | Adopt-verbatim — `fact-finding-watches.md` continuity primitive |
| 17 | `office-town-surface-memory` | Goanna `surface-memory` | Adopt-verbatim — promote session-scoped auto-memory to durable team-visible substrate. Use this AS the curator's session-end synthesis primitive |

### Tier 4 — Office Town MVP (cortex-specific, 4 skills)

The minimum to close the ingestion → reconciliation → retrieval loop on Office Town.

| # | Skill | Source | Treatment |
|---|---|---|---|
| 18 | `office-town-mine-mail-thread` | Goanna `mine-email-thread` | Adapt — full thread walk, attachment extraction via Workers AI, trace-append to org/contact, `derived_from:` provenance |
| 19 | `office-town-pre-flight-collision-check` | Goanna `pre-flight-dedup-check` | Adopt-verbatim — slug → domain → identifier → channel-id index check before mint |
| 20 | `office-town-reconcile-org` | Office-Town-specific | New-write — peer-vs-umbrella judgment + ABR-verify-first + auto-merge ≥0.85 confidence + recommendation queue for ambiguous |
| 21 | `office-town-cite-source` | Office-Town-specific | New-write — append `derived_from:` provenance to any auto-generated entry; non-optional |
| 22 | `office-town-answer-from-cortex` | Office-Town-specific | New-write — librarian's primary retrieval: grep + filter + walk + semantic compose for "what do we know about X" |

### Tier 5 — Gap-fillers (3 new-write, identified by Agent A)

These address gaps Goanna itself has — patterns Goanna handles in non-skill artefacts that benefit from being proper skills.

| # | Skill | Source | Treatment |
|---|---|---|---|
| 23 | `office-town-record-decision` | Gap-filler | New-write — walk the agent through writing a decision-log entry (context, options, choice, rationale, decided-by, when to revisit). File at `wiki/decisions/<date>-<topic>/decision.md` |
| 24 | `office-town-proof-of-done` | Gap-filler | New-write — before any non-trivial build, write the literal yes/no test that proves each slice ships. Save alongside build spec |
| 25 | `office-town-wire-cycles` | Gap-filler | New-write — read agent's AGENTS.md `cycles:` declaration, list current cron registrations, diff, register missing ones, log drift. Extracts inline logic from kickoff step 10 |

---

## Personas v1.0 (3 — start small, split when bottlenecked)

Per Agent B's sub-specialist analysis, Office Town v1.0 ships with **three personas**, not five or six:

| Persona | Shape | Scope |
|---|---|---|
| **Curator** | curator-shape | Inbound: ingestion via user's Goose connector MCPs (gmail/slack/jim2/xero/etc.) → wiki via /api/ingest. Calls Tier 4 mining skills + collision-check + reconcile-org. |
| **Librarian** | curator-shape (different scope) | Organisational: cross-agent finding sweep, promote-to-knowledge, watch-table, schema-arbitrate, INDEX.md hygiene. Calls Tier 3 self-improvement skills. |
| **Secretary** | doer-shape (narrow) | Inbox triage + draft + flag + trace-append. **Drafts only — never sends.** Goose persona that handles the user's email substrate. |

Boss (router) and Worker (doer) personas exist conceptually but don't yet need bespoke v1.0 definitions — they're invoked via the user's general-purpose Goose chat.

### Sub-specialists deferred (per Agent B's recommendations)

| Specialist | Split when |
|---|---|
| **Reconciler** | Fleet hits ~500 entities and monthly per-record verification becomes a job |
| **Hostmaster** | Hosting/property records outgrow the org record (one client has 20+ sites) |
| **Domainer** | Domain operations become a recurring source of urgent briefs |
| **Webmaster** | Per-site classifications need their own schema |
| **PM agent** | Active project count crosses ~20 and weekly freshening is real work |

Each is a curator-shape or doer-shape specialisation. The skill primitives they'd use already exist in the starter set — what changes when they split out is *scope discipline*, not new skills.

---

## What's NOT in v1.0 (deliberate cuts)

Things from Agent A's recommended 22 + my consolidation list that we're NOT shipping until earned:

- **`office-town-build-reflect`** — coding-agent specific; ships when Office Town has a worker-shape coding persona
- **`office-town-skill-gap-scan`** + **`office-town-skill-research`** — meta-skills for skill discovery; useful but not load-bearing v1.0
- **`office-town-mint-specialist`** — earns its place once we're splitting out v1.1+ specialists
- **`office-town-team-health`** — manager-mode skill; needs a 3+ persona fleet to be meaningful
- **`office-town-brains-trust`** — high-value but separate-tooling (cross-frontier-model review); not v1.0 cortex foundation
- **`office-town-vacancy-scan`** — capacity-gap detection; emerges when fleet has rhythm
- **`office-town-pair-pipeline`** — plan-then-execute discipline; v1.1 for coding workers
- **`office-town-env-scan`** — first-run environment inventory; useful but not foundation
- **`office-town-rules-sweep`** — quarterly rules hygiene; future
- **`office-town-mine-entity`** — multi-layer mine orchestrator; ships in v1.1 once individual mine-* skills are proven
- **`office-town-mine-chat-room`**, **`office-town-mine-doc`** — additional mining sources; add as needed
- **`office-town-mint-group-index`**, **`office-town-mint-collection`**, **`office-town-schema-bump`** — structural-evolution skills; ship in v1.1 once we've actually evolved a schema once
- **`office-town-open-questions-track`** — first-class uncertainty primitive; valuable, deferred to v1.1
- **`office-town-pattern-crystallize`** — fuses with `office-town-promote-to-knowledge` for now
- **`office-town-lint-pass`**, **`office-town-enrich-stub`**, **`office-town-resolve-conflict`** — quality-gate skills; v1.1
- **`office-town-cascade-refresh`** — only matters once a schema has actually bumped; v1.2
- **`office-town-client-snapshot`**, **`office-town-trace-decision`** — compose-from-other-skills; defer
- **Worker-shape, Scout-shape skills** — none yet; emerge with persona splits

This is ~30 skills deferred. They'll earn their place — most via the 3-instance threshold, some when their persona ships.

---

## Recipes v1.0 (5 starter)

Recipes are parameterised multi-step workflows. The starter set is small because most of v1.0's behaviour is skill-shaped, not recipe-shaped.

| Recipe | Inputs | Steps |
|---|---|---|
| `office-town-onboard-contact` | email/contact details | mine-mail-thread → pre-flight-collision-check → extract Contact entry → trace-append + cite-source |
| `office-town-save-email-to-cortex` | gmail message ID | fetch via user's Gmail MCP → raw archive → mine-mail-thread → classify → extract → link |
| `office-town-weekly-digest` | date range (default last 7d) | query wiki_audit + Inbox → summarise per collection → write global digest entry + cite |
| `office-town-client-brief` | org slug | answer-from-cortex (org+contacts+projects+recent traces+decisions) → compose pre-meeting brief |
| `office-town-graduate-finding` | finding slug | check 3-instance threshold → promote-to-knowledge → file decision if controversial → archive source finding |

More recipes earn their place as patterns prove themselves.

---

## Install-time wiring (per goose-self-improvement-survey)

For v1.0 to work end-to-end, the Office Town installer (or wire-sync walkthrough) needs to:

1. **Set `GOOSE_MOIM_MESSAGE_FILE`** env var pointing at `~/.config/office-town/tom.md` (synced from cortex). Enables mid-session rule injection.
2. **Add Office Town MCP** to Goose's extension list. Exposes the four write surfaces (`skill_write`, `recipe_write`, `remember_memory`, `tom_append`) + the existing wiki/files/email/cron/voice/sandbox MCPs.
3. **Install `~/.agents/plugins/office-town/hooks/hooks.json`** with:
   - `SessionEnd` → `office-town-curate` (the session-end synthesis)
   - `PostToolUse` → audit logging
4. **Ship the 25 starter SKILL.md files** at `~/.agents/skills/office-town-<name>/SKILL.md`. All sync via officetowd so they're portable across machines.
5. **Ship 3 persona definitions** in the Goose agent registry: curator, librarian, secretary.

All five steps land via the same officetowd sync path that handles the wiki — so cross-machine consistency comes for free.

---

## The first three SKILL.md files to write

In priority order for Session 1 build:

1. **`office-town-kickoff`** — universal, every persona uses. Without this, the autonomy-default doctrine ("now work, don't ask") has no procedural anchor.
2. **`office-town-mine-mail-thread`** — the MVP ingestion skill. Closes the first end-to-end loop (Gmail → cortex).
3. **`office-town-cite-source`** — small, foundational. Composed by every skill that auto-generates an entry. Easiest to author.

These three appear as concrete drafts at `.jez/artifacts/sample-skills/` (next commit).

---

## Why this matters

Per Agent A's count, Goanna ships 60 skills. We're shipping 25. The discipline is the 3-instance threshold: **the catalogue grows from observed need, not speculation.**

The 25 starter skills are the *minimum* that lets the loop close:
- A persona can wake up and orient (Tier 1)
- It won't blow up on common failure modes (Tier 2)
- It learns from sessions (Tier 3)
- It can ingest external content + reconcile + retrieve (Tier 4)
- The framework's own gaps are closed (Tier 5)

Add the 3 personas (curator + librarian + secretary), wire 4 install steps, and the cortex starts compounding. Skills 26+ earn their place by being needed.

---

## Related docs

- `office-town-framework-2026-05-28.md` — the unified framework, Section 8 (skills) + Section 14 (living memory)
- `cortex-shape-2026-05-28.md` — design contract; Part 4 + Part 8 (skill body template)
- `curator-pattern-2026-05-28.md` — curator agent architecture
- `session-1-build-spec-2026-05-28.md` — Session 1 foundation build
- `goose-self-improvement-survey-2026-05-28.md` — what Goose supports at runtime
- `goanna-skills-catalogue-2026-05-28.md` — Agent A's full 60-skill catalogue
- `goanna-curator-librarian-skills-2026-05-28.md` — Agent B's curator + librarian repertoires
- `goanna-skill-body-shapes-2026-05-28.md` — Agent C's voice reference + draft
- `skills-recipes-consolidation-2026-05-28.md` — what was in our planning docs
