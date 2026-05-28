# Goanna Doctrine — Extracted Patterns for Office Town

> Source: Goanna fleet (R2 substrate, ~1 month deployed). Pulled from 30+ agent CLAUDE.mds, 22 framework docs, 60 skills, 54 knowledge concepts, and the templates/owner manifests. Quotes are verbatim from the fleet unless paraphrased for the publishable system; per the brief, the canonical name has been generalised to "the cortex owner" where Goanna's specifics would otherwise leak.

## Headline insights

The thing Goanna actually IS, once you strip the Australian-business-specifics, is **convention, not code**. An install is a folder structure of markdown files; the runtime (Claude Code, Goose, whatever) loads them however it does. The framework defines what an agent looks like, what files they own, how they communicate, how knowledge accretes. That self-description appears verbatim at the top of `docs/SPEC.md` and it is doing more work than it looks: every other primitive in the system — agents, skills, comms, cadence, schema — is just a naming convention layered over a flat tree of markdown. There is no orchestrator, no workflow engine, no state machine. The substrate (R2 + a sync daemon) is the only piece of running code that is load-bearing across the fleet. Everything else is text.

The architectural insight that earns the system a place in publishable form is **"every folder with a CLAUDE.md is an agent."** A leaf agent is a folder with a file family. A team is the same folder with child folders inside. A division is that, recursively. Same primitive at every scale — no special case for "team" or "umbrella". Claude Code (and Goose) walk the tree at session start and accumulate every CLAUDE.md found into context. That tree-walk IS the inheritance model. Routing inside a team, voice inheritance from a parent, owner-voice cascading into every agent's output — all of it is "the runtime walks the tree and concatenates".

The second insight is **the four shapes**. Most multi-agent systems argue about how many agents you need and how to coordinate them; Goanna's answer is that the *capability* surface has four shapes — router (boss), doer (worker), curator (librarian), watcher (scout) — and everything else is a domain specialisation of one of those. After running fleets for a month, the doctrine explicitly says they "haven't found a real fifth shape". Newsletter editor, secretary, publication editor, bookkeeper, project manager, curator-of-orgs — all of them are *workers* or *librarians* with narrower scope. This is a strong opinionated claim and it dramatically reduces the surface area of "what agents should I mint?"

The third insight is **the wiki as substrate, not record-keeping**. Goanna calls this "foundation-building": *"a structured, cross-linked, sourced graph of entities, decisions, patterns, and open questions that grows more valuable the longer it is maintained."* The wiki isn't a place to file things; it is the surface other agents read before acting. The acid test, named the *"brand-new Mac test"*: a fresh agent with no prior context should be able to do useful work on any project after just installing. The substrate IS the brief.

The fourth, perhaps subtlest insight is **schema-as-emergence**. *First instance: capture inline as prose. Second: extract to frontmatter. Third: promote to canonical schema. Fourth+: shapes how new instances get filed.* This is repeated across CRM doctrine, specialist disciplines, skill authoring, and cohort minting. Pre-designed schemas drift. Schemas earned from 3+ instances of the same shape stick — and the rule applies to entity fields, group-indexes, skills, and concepts identically.

## 1. The agent role pattern

Every CLAUDE.md follows the same structural sextet. Reading boss / curator / scout / worker / secretary back to back, the headings appear in close to the same order every time:

| Section | What it carries | Why universal |
|---|---|---|
| **Identity** | Name, creature/role, vibe, emoji, optional avatar | Lets agents introduce themselves consistently across surfaces |
| **What I do** | 3-6 bullet capabilities | The agent's own scope, in the agent's own words |
| **What I don't do** | Bullets, each naming the sibling who handles it | Maintains separation — *"I don't curate; that's librarian"* |
| **Core values** | 3-5 principles | The non-negotiables that shape judgment calls |
| **Boundaries** | What the agent won't do even when asked | Hard limits — destructive, external, financial actions |
| **Routing** | A table: *"User says X → I do Y"* | The decision tree the agent uses when work doesn't match its lane |
| **How I think** | One paragraph on decision style | Voice + judgment shape combined |
| **Voice** | Words to USE, words to AVOID, surface-specific table | Where Goanna's voice doctrine lands per agent |
| **Cadence** | A `cycles:` YAML map + home_machine + runner | Where the agent's scheduled work is declared |
| **Patterns that prove themselves** | Empty by default; agent fills in over time | Earned-place collection of habits |

The interesting bits:

**"What I don't do" is doing real work.** It's not boilerplate — it explicitly hands off to siblings. Boss's: *"Deep code or research — that's worker. Curate into permanent records — that's librarian."* This is anti-morphing discipline: *"if you find yourself reading another agent's CLAUDE.md to 'be them' — write a comms brief instead. Morphing erodes agent separation."*

**Modes are agent-specific, not a framework primitive.** Curator declares Reactive / Bootstrap / Group consolidation / Pattern crystallization / Burst-orchestrator / Quiet-cycle hygiene. Librarian declares Reactive / Bootstrap / Quiet-cycle hygiene / Cascade-refresh. Scout doesn't declare modes at all — it has bars (high/medium/low) instead. The framework's contribution is the *quiet-cycle hierarchy* (advance backlog → hygiene → self-curation → cross-pollination → anchored research → stop) which any agent inherits via `docs/RHYTHMS.md`.

**Cadence is declared in CLAUDE.md as YAML, then re-wired at every session start.** The pattern: `cycles:` map declares cron schedules; kickoff parses it and calls `CronCreate` for each entry; cycle name → `agents/<slug>/jobs/<name>/SKILL.md` by convention. The crons are session-scoped and die when the session exits — kickoff re-wires them. This means CLAUDE.md IS the source of truth for an agent's wiring; drift between declared and actual is itself a finding.

**Curator-load coupling shows up as cadence tuning rules.** *"Bump cadence when 3+ consecutive cycles produce substantive new outputs; drop cadence when 2+ consecutive cycles produce only hygiene notes."* The agent owns its own clock and tunes it from observed signal volume.

## 2. Framework primitives

`docs/FRAMEWORK.md` is the universal substrate that every CLAUDE.md inherits. Three load-bearing pieces:

**The kickoff procedure** (11 steps, lives in `skills/kickoff/SKILL.md`):
1. Confirm local files are current (sync layer handles this; optional sanity check)
2. Soak up the framework — read every `.md` in `docs/`
3. Read your `facts/` — keyed atomic fact files
4. Read the owner context — `wiki/owner/CLAUDE.md` cascade + `voice.md`
5. Pick up open tasks — `tasks/*.md` filtered on `surface: true`
6. Check in-flight — today's `journal/<date>.md`
7. Glance recent journal entries
8. Check inbox — `agents/<slug>/inbox/` and `wiki/broadcasts/`
9. Glance own findings + skills index
10. Wire your cron cycles — CronList → diff against declared → CronCreate missing
11. **Now work.** *"The anti-pattern: finishing kickoff and asking 'What would you like to do?' — that's wrong. You know your job. Do it."*

**Universal rules** every agent inherits (selected new ones not already in cortex-shape):
- *Bias to action.* Default to acting when reversible, internal to filesystem, unlikely to surprise. Defer only when destructive, external, or genuinely ambiguous.
- *Describe what IS, not what WAS.* Change history lives in git/activity-log. Just say the current thing.
- *Save durable artefacts immediately.* When you write a finding, feedback, skill, decision — save the file when you finish, not at session end. *"Anything the user shared that's not yet on disk — route it."*
- *One job per file.* `status.md` = NOW. `journal/` = NARRATIVE. `findings/` = SURFACED. `facts/` = KEYED. Don't mix.
- *Re-check inbox at task boundaries.* Kickoff reads once; long sessions accumulate. Re-check every ~30 min or at natural transitions.
- *Read wiki/ before acting on an entity.* The records carry context conversation history doesn't.
- *Don't morph.* Reading another agent's CLAUDE.md to act as them = file a comms brief instead.

**The shutdown isn't a ceremony.** *"Files written, not just held in chat."* Status current as you go, journal entries land as work happens. The handover skill exists for explicit session-end (and pairs with kickoff), but the framework explicitly rejects the four-step closing ritual. Continuous handover replaces clock-anchored consolidation.

## 3. Page shape conventions

`docs/CONVENTIONS.md` is the canonical page-shape table. The big rule: **every entity is its own folder; events are flat files.**

| Shape | Pattern | Why |
|---|---|---|
| Entity (thing that exists + accumulates context) | `<collection>/<slug>/<type>.md` | Folder lets ancillary content (`history.md`, `pricing.md`, `their-process.md`) land naturally as it earns its place |
| Event (thing that happens, discrete) | `<collection>/<id>.md` | One file = one event |

No "flat until earned" promotion event — entities start as folders. Events stay flat forever.

**Canonical templates exist for every page type.** Twenty templates in `templates/`, including: `entity.md`, `contact.md`, `concept.md` (knowledge), `investigation.md` (research), `project.md`, `task.md`, `decision.md`, `quote.md`, `finding.md`, `journal-daily.md`, `comms-brief.md`, `feedback.md`, `group-index.md` (two flavours: behavioural + structural), `collection-index.md`, `skill/SKILL.md`. The discipline: *"Read the template; don't read prose about the template."*

**Frontmatter is a contract**, but described as such only for shared collections. Per-agent files in `agents/<slug>/` are single-writer territory — no frontmatter discipline needed. Shared files in `wiki/` carry: `last_edited_by`, `last_edited_at`, `last_change_summary` — harvested by the activity-log Worker into D1 on every write.

**Indexes use `_` prefix and live at collection root.** `INDEX.md` = collection manifest. `_<topic>-group.md` = behavioural aggregator (long-tenure clients, agency-mediated portfolios). `_<parent>-group-index.md` = structural aggregator (JEV parent + 9 sub-properties). The underscore prefix keeps them visually distinct in `ls`.

**Scaling rules**: section → file → folder. Single section first; mint a file when content is substantial; mint a folder when 3+ items of the same shape accumulate. Don't pre-create empty folders. *"Sparse wells gather over time; what looks like under-use today is normal-rate-of-arrival."*

**Universal meta-files in every collection**: `INDEX.md` (worker-managed manifest), `_intro.md` (human/agent narrative), `CLAUDE.md` (collection operational conventions). Same three files mean the same thing in every collection.

## 4. Schema and entity model

`docs/CRM.md` is the entity-model bible. Six principles:

1. *Markdown is the database.* Frontmatter for structured; body for narrative. Git/activity-log is the audit trail.
2. *Atomic records.* One concept per file. Atoms compose into views.
3. *Schema emerges, doesn't get pre-designed.* 1 instance = inline prose. 2 = frontmatter. 3 = canonical. 4+ = fundamental.
4. *Generative views, not pre-built filters.* Agents synthesise views per question; we don't build dashboards.
5. *Substrate for humans + agents both.* Same files, two consumers.
6. *Schema is the contract; tooling is convenience.* Frontmatter conventions ARE the API. Pre-built scripts handle common cases; agents write their own Python with `uv run` inline-deps for novel queries.

The **engagement-trace primitive** is the canonical client-memory shape — one line per substantive interaction, four fields: **date / actor (channel) / verb-phrase with outcome / reference ID**. Lives in `entity.md` § Recent. Multi-writer accumulating store; actor field is non-negotiable because the *"I did X"* pattern collapses when several writers contribute. Trace > touchpoint (full file) > deep narrative — three sizes, judged by the interaction's complexity.

**Entity-folder siblings**: when information about an entity is bigger than a trace and isn't an interaction record, file as a sibling file in the entity's folder. `tech-stack.md`, `pricing-history.md`, `their-team.md`, `their-process.md`, `contract-<year>-<topic>.md`. The list isn't closed — new shapes earn their place when content needs a home.

**Recurring obligations vs open commitments vs strategic intent** — three distinct shapes. Obligations are scheduled recurring (annual domain renewal); commitments are one-shot deadlines (follow up by Friday); strategic intent is the "why does this relationship matter" framing. Each has both frontmatter and sibling-file forms; agent picks based on volume.

**Service-state, not single-status.** A client's relationship is a bundle of services, each with its own state (hosting: active/dormant/cancelled; email: managed/partial/external). Entity-level summary derives from the bundle, not the other way around.

**Cross-references via frontmatter** create the graph: `parent:`, `relationship_type:`, `client:` on decisions, `sibling_agent_refs:`, `groups:`. Agents traverse this when synthesising views — no graph database, just frontmatter conventions.

## 5. The skill / recipe pattern

Skills are *Standard Operating Procedures* — runnable shapes with frontmatter describing when to invoke and a body describing what to do. Every skill at `skills/<name>/SKILL.md`, flat folder. Multi-file skills are first-class: companion `.md` references, helper `.sh`/`.py` scripts, fixtures live in the same folder. Scope is encoded in **naming** (bare `<topic>` if general, `<agent>-<topic>` if role-specific like `curator-sent-mail-mining`) and the **description** frontmatter (lead with the trigger).

The body shape is fixed:

```
## When to invoke    (concrete triggers as bullets/table, including negative cases)
## Procedure         (numbered steps; each is one observable action)
## Non-obvious disciplines  (only when there's a genuine non-obvious trap)
## Composition with other skills  (table of what this replaces/pairs with)
## Verification      (checklist; concrete signals)
## See also
## Last updated
```

The kickoff skill is 11 numbered steps ending with the anti-pattern callout. The handover skill is 5 numbered steps with a `## Composition with other skills` table making clear it doesn't duplicate `reflect`. The curate skill is 8 numbered steps including a quoted coaching-message template. The propose-skill skill is a four-section template that all other skills follow — recursive self-definition.

The **3-instance threshold** is the trigger to author. *"After 3 instances of the same procedural shape, write the SKILL.md before iteration 4."* Don't pre-author for hypothetical patterns — that produces stale boilerplate.

**Skill vs other shapes — decision rule**:

| Shape | When | Lives at |
|---|---|---|
| Skill | Runnable procedure with named inputs/outputs; closes a loop | `skills/<topic>/SKILL.md` |
| Knowledge concept | Pattern/fact/reference — not a procedure | `wiki/knowledge/<topic>/concept.md` |
| CLAUDE.md content | So specific to one agent no one else would invoke | `<agent>/CLAUDE.md` |
| Finding | One-shot trick, doesn't recur | `<agent>/findings/<date>-<slug>.md` |

*"Would I want to invoke this by name, or just remember it happened?"* Invokable → skill. Memorable → finding.

## 6. Promoted knowledge concepts

Each `wiki/knowledge/<topic>/concept.md` carries a one-sentence definition, *When to use*, *Approach*, *Gotchas*, *References*. Concept files lean longer than skills (300-800 lines is normal for the senior ones) — they're reference material, not procedures.

A handful of representative concepts and what shape they take:

**`agent-architecture/concept.md`** synthesises three independent practitioner accounts (Anthropic Managed Agents, Notion's 5 rebuilds, Cherepanov's 16-parallel-agents post-mortem) into four cross-cutting principles. Concrete quotes from each: *"Requiring a language model to interface with third party providers seems wasteful for tasks that don't require it."* *"100+ tools broke the model — progressive disclosure as the fix."* The concept itself names *"Statelessness + externalised state — the model is stateless; the harness/repo/lockfile holds state."* Concept ends with named *watch-triggers* for what would prompt a rescan.

**`foundation-building/concept.md`** names the orientation that shapes every curator and librarian cycle: *"a structured, cross-linked, sourced graph of entities, decisions, patterns, and open questions that grows more valuable the longer it is maintained and the more richly each record is integrated."* Three properties distinguish a foundation from an archive: *integration, sourcing, honest uncertainty*. The doctrine quote from the cortex owner is preserved: *"I'd rather we take our time, at greater cost, and gain better knowledge, than race to the end."*

**`knowledge-evolves-not-bedrock/concept.md`** captures the epistemics: *"Wiki records reflect the curator's best-current synthesis of available substrate evidence. Past records can be updated as new context arrives. Mining + reflection cycles continuously refine — that's a feature, not a flaw."* Pairs with `open-questions-pattern` to make uncertainty first-class. Crucial coaching: *"Don't apologise in `last_change_summary`. It's a change log, not a confession."*

**`agent-memory/concept.md`** is a watch-table snapshot of the 2026 state of the art — Cloudflare Agent Memory (private beta → GA), the STALE paper on temporal staleness detection, MemReranker paper, `rohitg00/agentmemory` (16,800 stars in two weeks), ElevenLabs scoped conversation analysis. Each has named watch-triggers. The concept itself names a useful distinction: *app-level memory* (per-end-user facts) vs *agent-coding memory* (per-dev-task code state) — *"don't conflate them when comparing solutions."*

**`projects-as-substrate/concept.md`** describes the pattern that emerged when the team dogfooded the substrate against project management: *"The substrate IS the brief. Without substrate-as-contract, parallel agents either duplicate or collide. With it, they converge."* Names the alternatives this replaces (Google Drive, Slack, Notion, Asana, Trello, GitHub Project Boards, Confluence) with the specific friction each carries. Names when the pattern is the wrong choice (real-time co-editing, time-series telemetry, multi-tenant SaaS).

**`tandem-shipping/concept.md`** documents the cron-agent-plus-local-loop pattern for overnight build work — two agents working the same backlog in parallel via a shared markdown log file, with hard constraints (no force-push, no schema changes, no new deps, max 8 iterations). Concrete pre-flight (ranked findings doc with 30-60 findings, sized quick/medium/larger). Both pre-flight and race-resolution are described as code-level discipline.

**Common shape across all six**: an entry block of one-sentence definition + *when to use* triggers, then *approach* with concrete examples, then *gotchas/anti-patterns*, then *related concepts* with `[[wiki-link]]` cross-references, then *sources* with access dates. The concept is supposed to age — `last_updated:` + amendment log in frontmatter make it queryable when it last earned its rescan.

## 7. The owner-cascade pattern

The `wiki/owner/` folder is the cortex owner's deep record — symmetrical with `wiki/business/` (the install's own business entity) and structurally distinct from `wiki/contacts/` (which holds external people). The convention is that the contact record for the owner stays thin (CRM-shape, ~30 lines) and the depth lives in `wiki/owner/`:

| File | What it carries |
|---|---|
| `CLAUDE.md` | Schema + curatorial rules for the folder |
| `INDEX.md` | Manifest |
| `voice.md` | **Load-bearing — every agent reads at kickoff before producing output.** Voice principles, banned phrases / anti-patterns, dialect, per-channel variants |
| `voice-samples.md` | Concrete examples across 5 registers + closing patterns |
| `bio.md` | Background |
| `expertise.md` | Domain knowledge |
| `family.md` | Relationships, household |
| `goals.md` | Aims, direction |
| `opinions.md` | Stances on tools, approaches |
| `rhythm.md` | Working hours, cadence, when to expect responses |
| `tooling.md` | Tools used day-to-day |
| `values.md` | Non-negotiables |
| `vocabulary.md` | Words used + words avoided |

The cascade is two-layer: `wiki/owner/CLAUDE.md` auto-loads via Claude Code's tree walk for any agent working in subdirectories; `voice.md` is read explicitly at kickoff step 4. Other files load on demand when relevant.

**The voice.md contract is the highest-gravity file in the entire substrate** because warm-up step 2 names it explicitly: *"every agent reads `wiki/owner/voice.md` before producing styled output."* That single line gives it most of its gravity. This is documented in `docs/CURATION.md` § *"Warm-up makes it load-bearing"* — the framework's strongest lever for elevating a file from *available* to *required reading*.

**Multi-owner installs use subfolders per person** — `owner/<slug>/voice.md`. Single-owner installs put files at the top level. The `about:` frontmatter field disambiguates either way.

**Cross-linking is explicit**: `wiki/owner/` files cross-link to the thin contact record at `wiki/contacts/<owner-slug>/contact.md`, the entity record at `wiki/business/<your-business>.md`, and per-agent `agents/<slug>/CLAUDE.md` Voice section. *"Don't duplicate content across these. Each file has one job; cross-links navigate."*

## 8. The specialist discipline package

`docs/SPECIALIST.md` is the doctrine that turns a narrow-scope agent from *busy* into *compounding*. Nine disciplines, each with detection signal:

1. **Single concrete output target** — one artifact shape, one home. If 3+ output shapes, scope too broad → split or narrow.
2. **Phase 1A scope-narrowing** — brief is one paragraph naming what they DO and DON'T. Adjacent work routes elsewhere, not absorbed.
3. **Group-index files at instance thresholds** — 4+ instances → mint `_<topic>-group.md`. 15+ → milestone. 20+ → consolidation pass.
4. **Wait for stability before crystallising STRUCTURE — not before acting.** *"Don't read it as 'wait before doing things'; read it as 'don't lock in structure until the structure is stable.'"* Schema-as-emergence over schema-as-design.
5. **Verification-before-remediation** — re-check classification before applying a fix. Same shape as KB-facts-must-be-sourced.
6. **Sibling-discoveries-reading as primary signal source** — read other agents' `findings/` folders at kickoff. Cross-reference explicitly.
7. **"Maintaining watch" is not acceptable** — every cycle must produce one of (new file, update, finding, brief, skill draft, or *"nothing to act on, X stable, because..."* memo with reasoning). *"Still monitoring X"* is the verbal signature of plateau.
8. **Hook-variety driving signal-source diversity** — 4-8 distinct signal sources rotating. Single-source agents tunnel-vision; rotation is the rate-limiting input for pattern-crystallisation.
9. **Propagation when structure changes** — mint entity AND `INDEX.md` row in same commit. Slug rename = file move + reference updates same commit. Cohort promotion = group-index + member-tags + schema bumps same commit. *"References-only updates are under-shipped changes."*

The package is paired with explicit *what's NOT in it* anti-patterns: elaborate custom tooling, pre-built dashboards, complex schema enforcement, multi-step approval workflows, heavy cron schedules, per-domain custom output formats. *"If a specialist's tooling looks elaborate, that's usually a sign Discipline 1 or 2 is missing. Fix is structural narrowing, not more tooling."*

**Top-level or nested?** Almost always nested. The four shape-baselines (router/doer/curator/watcher) cover universal capabilities. *"After months of running fleets we haven't found a real fifth shape."* Domain ≠ shape. Jezmail (newsletter) has substantial scope and clear domain but the *shape* of work is doer — specialist of `agents/worker/`.

**The agent folder has two layers**: operational state (`CLAUDE.md`, `facts/`, `status.md`, `journal/`, `findings/`, `inbox/`) which every agent has, and a **domain workshop** for role-specific working material (drafts, references, assets, research) which content-heavy specialists earn. Earned-place applies — prefer single named files first; mint folders when 3+ items of the same shape accumulate.

## 9. Anti-patterns / failure modes earned the hard way

Three from `docs/CURATION.md` (gravity-wells):
- **Sinks**: a file accumulates mismatched content because no better well exists. Detection: file >200 lines holding multiple unrelated H2 sections.
- **Black holes**: content lands somewhere but can't migrate out because no destination exists. *"That's the framework needing a new well, not the curator needing more discipline."*
- **Galactic dust**: a fact dispersed across 3+ files because no single well exerts gravity. Detection: updating a fact requires touching three or more files.
- **Empty wells**: declared in the schema but never minted because purpose isn't crisp.
- **Wells too close**: two adjacent wells where curators routinely struggle to choose which one. Either sharpen the criterion or merge.

From `docs/HYGIENE.md` (motion rules):
- **No archive folders.** The activity log is the audit trail. Ephemeral content is *deleted* when terminal — *"never moved to an archive folder."*
- **Graduate before deleting.** Before deleting any ephemeral file: *"Is anything in this evergreen?"* If yes, promote to reference (knowledge, decision, finding, skill). If no, delete clean.

From `docs/FRAMEWORK.md` § Universal conventions:
- *"Don't morph."* (cited above)
- *"Describe what IS, not what WAS."* Change history lives in the activity log; don't accumulate "earlier versions did X" prose.
- *"Goals over recipes."* Capable models age better with goal-shaped instructions, not rigid scripts.
- *"Essence-only."* If the essence is enough for a capable AI to act correctly, anything beyond that introduces fragility.

From `wiki/knowledge/knowledge-evolves-not-bedrock`:
- *"Don't apologise in `last_change_summary`. It's a change log, not a confession."*
- *"Don't treat re-mining as cycle padding. Re-mining when records show no drift signals is manufactured-work."*

The recurring meta-failure: **manufactured work to look busy.** This appears as a named anti-pattern in `docs/FRAMEWORK.md` (anti-coasting), `docs/SPECIALIST.md` (Discipline 7), `docs/RHYTHMS.md` (exit cleanly when no signal). *"If you catch yourself making work — posting low-signal status, drafting unprompted, inventing tasks to look busy — end the cycle."*

## 10. What's publishable as a system

If we wanted to publish this as a coherent system — call it **Office Town**, or the more generic *"markdown-first cortex for multi-agent business work"* — the doc structure would be:

```
0.  One-paragraph elevator pitch
1.  The fundamental insight  (every folder with a CLAUDE.md is an agent)
2.  Architecture            (substrate + sync + runtime split; convention not code)
3.  The four shapes         (router/doer/curator/watcher; why no fifth)
4.  The file family         (agent files; the operational vs workshop split)
5.  Page-shape conventions  (entity-as-folder, event-as-flat-file; templates)
6.  The owner cascade       (voice.md as load-bearing kickoff input)
7.  Schema-as-emergence     (1/2/3/4+ thresholds; CRM entity model)
8.  Skills + recipes        (when to author; the four-section body)
9.  Cadence + cycles        (declared in CLAUDE.md; CronCreate at kickoff)
10. Curation gravity-wells  (sinks, black holes, dust, empty wells)
11. Specialist disciplines  (nine; what compounds vs what plateaus)
12. Memory + agent epistemics (knowledge evolves; honest uncertainty)
13. Anti-patterns earned    (manufactured work, morphing, archive folders)
14. The brand-new-Mac test  (the acid test for whether your install works)
15. Comparison              (what this replaces — Drive/Slack/Notion/Asana)
```

**Elevator pitch**: *"A markdown-first cortex where AI agents do productive business work. Your projects, clients, decisions, and patterns organise themselves consistently across every surface. Your team — human and AI — converges on substrate instead of fighting tools. Every folder with a CLAUDE.md is an agent; every entity is its own folder; every event is a flat file; the substrate is the brief."*

The **unique architectural insight** worth defending: *gravity wells*. The placement of content shapes how often, how reliably, and by whom it gets read. Five forces have to be simultaneously true for a file to attract content: *path predictability, name-content match, size matched to read frequency, cross-link reinforcement, warm-up makes it load-bearing.* Other markdown-knowledge systems get one or two of these right; Goanna's framework documents all five and uses them deliberately. The acid test is predictive routing: *"when new content arrives, can you predict where it'll end up without thinking? If yes — the wells are working. If you have to deliberate — the wells are weak. If you have to grep — the wells aren't there."*

## 11. What Office Town should absorb directly

**Adopt verbatim** (the doctrine is universal, won't drift across the cortex/Goanna split):

- *The four-shape baseline* — router/doer/curator/watcher. Don't invent a fifth.
- *The agent file family* — CLAUDE.md, facts/, status.md, journal/, findings/, inbox/, optional jobs/<cycle>/SKILL.md.
- *The kickoff procedure shape* — 11 steps including "wire your cron cycles" and the "now work, don't ask" anti-pattern.
- *Schema-as-emergence with the 1/2/3/4+ thresholds* — for entity fields, group-indexes, skills, concepts identically.
- *Entity-as-folder, event-as-flat-file.* No promotion event.
- *The skill body template* — frontmatter (with load-bearing `description`), When to invoke, Procedure (numbered, observable steps), Non-obvious disciplines (only when earned), Composition, Verification, See also, Last updated.
- *Engagement traces as the canonical client-memory primitive* — four-field one-liner in `entity.md` § Recent. Actor field non-negotiable.
- *Gravity wells doctrine* — sinks/black-holes/galactic-dust/empty-wells/wells-too-close as named failure modes with detection signals.
- *Specialist nine disciplines* — including the *"maintaining watch is not acceptable"* clause.
- *Owner cascade structure* — `wiki/owner/` as a deep folder, with `voice.md` as the load-bearing kickoff input.
- *No archive folders, ever.* Activity log is the audit trail; ephemeral content deletes after graduation check.
- *Anti-coasting / anti-morphing / describe-what-IS-not-what-WAS* as universal conventions.

**Adapt**:

- *Cadence + CronCreate wiring* — Office Town runs as a Goose extension, not Claude Code with in-session crons. The principle (CLAUDE.md is the source of truth; agent owns its own clock; bump-and-drop from observed signal volume) transfers; the implementation needs Goose-shaped equivalents.
- *Substrate sync* — Goanna uses R2 + a custom Go daemon (`goannad`). Office Town's hosted-on-Cloudflare positioning means R2 + Worker is the right substrate, but the per-machine sync daemon may not be needed if Office Town is single-tenant cloud-resident.
- *Skill discovery* — Goanna's flat `skills/` folder with `description` frontmatter is the path; if Office Town integrates with Goose's recipe system, the recipe-shape may be the published surface and the SKILL.md may be the internal authoring shape that ships as a recipe.
- *Activity log* — Goanna's R2 events → Queue → Worker → D1 pipeline is overbuilt for a single-tenant cortex. The principle (every file write is queryable history) transfers; the implementation can be simpler.

**Skip / defer**:

- *The Australian-business-specific entity model* — `wiki/orgs/`, ABR verification, ERPNext customer fragmentation, AU domain status codes, Synergy Wholesale quirks, Jim2 API quirks, Cloudflare email routing patterns. All earned their place for one business; they're not the publishable system.
- *Specific agent personas* — Curator, Reconciler, Domainer, Secretary, Editor, Jezmail, BNI agent. These are *specialisations* of the four shapes for one cortex owner. Office Town ships the shapes + the specialist discipline package; the specific minted agents come from the owner.
- *The R2-substrate-replaces-git migration history* — interesting context but not load-bearing for new installs. Reference once in the architecture section; don't carry the migration scars.
- *Stewards, framework-pull, update-from-goanna.sh* — retired primitives. Don't ship them.

**One thing Office Town might add that Goanna doesn't have yet**: *explicit support for Goose recipes as the runnable-procedure primitive that pairs with markdown skills.* Goanna's skills are markdown that an agent reads and executes; Goose's recipes are runnable YAML that an agent executes more directly. The two can compose — a SKILL.md describes *when to invoke* and *what shape*; the recipe is the precise tool sequence. Goanna doesn't have this layering because Claude Code doesn't have Goose's recipe primitive; Office Town can.

The other thing worth distinguishing in the publishable system: **the cortex owner is a first-class concept**, not just "the user". `wiki/owner/` cascades into every agent's output via voice.md, but the deeper claim is that *one human steers; the cortex serves their judgment, taste, direction*. Goanna's `MAINTAINING.md` describes this as the *creator / mentor / fleet* pattern: creator (human) holds direction; mentor (creator-side AI) drafts and synthesises; fleet (deployed agents) practises the framework and writes artefacts. That three-role architecture is the publishable governance model for any single-owner cortex.
