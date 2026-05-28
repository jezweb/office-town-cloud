# Office Town — A Markdown-First Cortex for Multi-Agent Business Work

**Date**: 2026-05-28
**Status**: First unified framework draft. Pulls together cortex-pattern, cortex-shape, curator-pattern, agent-autonomy-default, agent-search-capability, and the Goanna doctrine into one coherent publishable system. Audience: someone unfamiliar with the project who's interested in building agent-readable business knowledge systems.

**Provenance**: The framework's hard-won doctrine — gravity wells, schema-as-emergence, the four shapes, the specialist disciplines, the agent file family — comes from Goanna, a deployed AI-agent framework that's been operating fleets of agents for over a month. Office Town is the Cloudflare-hosted instantiation of that doctrine, refined with structured ingestion + Goose-extension positioning + the autonomy-default doctrine. Where the framework appears original to Office Town vs inherited from Goanna, both are noted.

---

## 0. The elevator pitch

> A markdown-first cortex where AI agents do productive business work. Projects, clients, decisions, and patterns organise themselves consistently across every surface. Your team — human and AI — converges on substrate instead of fighting tools. Every folder with an `AGENTS.md` is an agent; every entity is its own folder; every event is a flat file; the substrate is the brief.

The category shift the cortex enables, in one comparison:

| Old paradigm | New paradigm |
|---|---|
| Human reads email + asks agent to help draft a reply | Agent already knows client backstory, current project, recent decisions, billing state, last interaction tone — drafts independently with provenance |
| New staff member learns by asking other humans | New staff member (or new agent) queries the cortex and gets the answer with sources |
| "I need to look that up" | "The cortex already has it" |
| Quality depends on what the human remembers to include in the prompt | Quality depends on what the cortex contains, not human recall |
| Onboarding takes weeks of shadowing | Onboarding is reading the cortex |

This is the difference between an agent that types faster than you can and an agent that *does the work*. The gap is the moat.

---

## 1. The fundamental insight: agents are personas; folders are contexts

Most multi-agent systems either tightly couple agents to a working directory (Claude Code's nested-context model) or treat agents as fully independent runtimes with no shared context model. **The cortex framework deliberately separates the two**:

> Agents are **personas** — configured AI roles (boss, curator, librarian, scout, worker) that live in Goose's agent registry. Each persona has a name, system prompt, tool whitelist, voice, and identity.
>
> The cortex is a **hierarchical project context** — folders carry `AGENTS.md` files at sensible boundaries (root, collection, sometimes entity). When you open Goose in any folder, the AGENTS.md cascade from that folder up to the cortex root becomes the working context.

A persona is *who* the agent is. A folder is *where* the agent is working. The two compose: same curator persona, different working folder → different working context, same role identity.

This is the **homing-beacon pattern**: open Goose at `wiki/properties/sites/<client-site>/`, choose the worker persona, and the AGENTS.md cascade loads the cortex-wide conventions + the properties-collection schema + that specific client-site's standing orders + the site's recent engagement traces. The agent knows where it's working without needing to be told. No "wait, which client are we on?" ambiguity.

### Why this beats "every folder is an agent"

Goanna's Claude-Code-hosted model treats every folder with a context file as if it were an agent — the runtime tree-walks and concatenates. That works for Claude Code but creates ambiguity in practice: you have to "pick the agent and then hope you're in the right place". The single tree-walk binds identity to location.

Goose's persona-context split lets the same curator do work in `wiki/orgs/acme-corp/`, then switch to `wiki/orgs/globex/`, then to `wiki/decisions/2026-05-28-cortex-pattern/`, without changing identity. The persona stays curator; the working context shifts with the folder. Cleaner, less confusing, more aligned with how humans actually work across many small tasks for many different clients.

### Where AGENTS.md belongs in the cortex

| Location | Required | What it carries |
|---|---|---|
| `wiki/AGENTS.md` | yes | Cortex-wide conventions, gravity-wells doctrine, status field meanings, frontmatter sextet, voice rules |
| `wiki/<collection>/AGENTS.md` | yes | The collection's schema, required fields, voice rules, lint rules, allowed subfolders |
| `wiki/<collection>/<slug>/AGENTS.md` | **only when earned** | Standing orders specific to that entity ("always quote 30% margin for this client", "this contact prefers email over phone") |
| `wiki/raw/AGENTS.md` | yes | The immutable-archive rule (curator + sync are the only writers) |
| `wiki/owner/AGENTS.md` | yes | Owner-cascade schema; voice.md as load-bearing |

Don't mint per-entity AGENTS.md until the entity earns standing orders that override the collection defaults. Most entities work fine with just the collection AGENTS.md cascading down.

### The substrate is still convention, not code

Even with the persona-context split, the framework is **convention, not code**. The substrate is markdown files in folders. The synced cortex IS the project context. Goose loads AGENTS.md per its `CONTEXT_FILE_NAMES` default. No orchestrator. No workflow engine. No state machine. The substrate is the only piece of running code that's load-bearing — and even that's just R2 + a worker + a sync daemon.

Adding a new persona is registering it in Goose. Adding a new entity is adding a folder. Restructuring a collection is moving folders. The substrate carries the *context*; Goose carries the *personas*.

---

## 2. Architecture: substrate + sync + personas + project context

Four pieces that have to exist:

```
   Personas (Goose agent registry)        Project context (where work happens)
   ────────────────────────────────       ─────────────────────────────────
   ~/.config/goose/agents/                ~/Documents/my-town/<some folder>
   ├── boss.yaml                          ├── AGENTS.md (cascade up to root)
   ├── curator.yaml                       ├── entity.md (if in an entity folder)
   ├── librarian.yaml                     ├── notes/, sessions/, ...
   ├── scout.yaml                         └── attachments/
   └── worker.yaml                              ↑
                                                │ Goose opens here;
                                                │ persona acts with this context
            │                                   │
            ▼                                   │
   User: `goose run --agent curator             │
                    --working-dir <folder>` ────┘
                          │
                          │ HTTPS via MCP
                          ▼
   Local cortex                          Cloudflare worker
   ────────────────                      ────────────────────
   ~/Documents/my-town/             ⇄    R2 (canonical substrate)
   ├── AGENTS.md (cortex root)            D1 (frontmatter + audit + links)
   ├── wiki/                              Vectorize (semantic + raw chunks)
   │   ├── AGENTS.md                      Workers AI (extraction + repair)
   │   ├── orgs/                          Queue (async indexing)
   │   │   ├── AGENTS.md (schema)
   │   │   └── <slug>/
   │   │       ├── AGENTS.md (optional)
   │   │       └── entity.md
   │   ├── contacts/<slug>/contact.md
   │   ├── projects/<slug>/project.md
   │   ├── owner/voice.md
   │   ├── raw/
   │   └── agents/<persona-slug>/      ← persona's working substrate:
   │       ├── facts/                     facts/, findings/, journal/,
   │       ├── findings/                  status.md, inbox/
   │       ├── journal/
   │       ├── status.md
   │       └── inbox/

   Bisync daemon (officetowd)
   - Watches local files via fsnotify
   - Pushes/pulls via worker's /api/sync
   - SQLite manifest for change detection
   - Three-way reconcile (local + remote + manifest)
```

**Substrate** — R2 holds the canonical markdown. D1 holds the structured index (frontmatter, audit log, derived links, attachments). Vectorize holds embeddings (entry-level for typed entries; chunked for the raw archive). Workers AI does extraction + frontmatter repair on the write path.

**Sync** — A bisync daemon (`officetowd`) running on each user's Mac watches the local cortex folder, pushes changes through the worker (no R2 token needed; the worker has bindings), pulls remote changes on a tick. The worker is the chokepoint — every write is audited, frontmatter is repaired, indexing fires, regardless of which Mac initiated.

**Personas** — Goose agents (boss, curator, librarian, scout, worker + future specialists) live in Goose's agent registry. Each is a YAML/config file with system prompt, tool whitelist, extensions. Mint a persona once; use it across many contexts.

**Project context** — when a user runs Goose with a working directory inside the cortex, Goose's `CONTEXT_FILE_NAMES` loads the AGENTS.md cascade from that directory up to the cortex root. The cascade gives the persona its working context. Same persona, different cortex folder → different working context.

**Persona working substrate** — each persona has a folder at `wiki/agents/<slug>/` carrying its facts, findings, journal, status, inbox. This is shared state — when curator-on-mac-A writes a finding, curator-on-mac-B sees it on the next sync. The persona's *identity* lives in Goose; the persona's *memory* lives in the substrate.

This split is the load-bearing decision. The substrate is portable (markdown). The sync is reliable (worker chokepoint + audit). The personas are reusable (Goose configs, not folder-bound). The project context is fluid (open Goose where the work is).

---

## 3. The four shapes (and why there's no fifth)

After a month of operating fleets of agents in Goanna, the doctrine narrows: there are only four shapes of agent. Every agent — regardless of name, domain, scope — is a specialisation of one of these:

| Shape | Verb | Direction | What it owns |
|---|---|---|---|
| **Router** | Directs | User ↔ subordinates | Orchestration; delegation; user-facing reply |
| **Doer** | Executes | Intent → world | External actions; emails sent; code shipped; deployments |
| **Curator** | Curates | External ↔ substrate | Ingestion (inbound) + organisation (internal) of the cortex |
| **Watcher** | Finds | External (no auth) → findings | Web research; public-API discovery; market scanning |

A newsletter editor is a doer-shape with narrow scope. A bookkeeper is a doer-shape with financial-MCP access. A contact-records minter is a curator-shape with inbound focus. An uptime monitor is a watcher-shape with synthetic-check focus. **Domain isn't shape.**

The four shapes are *capability surfaces*. Most "what agents do I need?" debates reduce to "which shape is this and what's its scope?" — not to inventing new primitives.

### Why no fifth shape has appeared

The four cover the directions of interest:
- **Router** owns the conversation seam (user ↔ everything else)
- **Doer** owns the action seam (intent → external state)
- **Curator** owns the substrate seam (external ↔ internal; bidirectional within the substrate)
- **Watcher** owns the discovery seam (unowned external → findings)

A hypothetical fifth shape would need a *different* direction or seam — and the four already cover the directions an agent can face. Domain specialisations add scope and material, not new primitives.

This is a strong opinionated claim. If a fifth shape emerges, the doctrine updates. For now, every minted agent answers: *what shape am I? what scope?*

---

## 4. Persona definition + working substrate (the split)

Inherited from Goanna with one structural change: persona definitions live in Goose, working substrate lives in the cortex.

### Persona definition (in Goose's agent registry)

Each persona is a Goose agent config — name, system prompt, tool whitelist, extensions, voice. Lives at `~/.config/goose/agents/<slug>.yaml` (or wherever Goose stores them on the install).

The system prompt for each persona carries the same structural sextet (inherited from Goanna's `AGENTS.md` shape but now in the persona config instead of a folder file):

1. **Identity** — name, role/creature, vibe, emoji
2. **What I do** — 3-6 bullet capabilities
3. **What I don't do** — bullets, each naming the sibling persona who handles it
4. **Core values** — 3-5 non-negotiable principles
5. **Boundaries** — hard limits (destructive, external, financial)
6. **Routing** — *"User says X → I do Y"* decision table
7. **How I think** — one paragraph on decision style
8. **Voice** — words to USE, words to AVOID, surface-specific tone variants
9. **Cadence** (optional) — declared schedule + cron prompts
10. **Patterns that prove themselves** — initially empty; persona fills in over time via the cortex

The "What I don't do" section is doing real work, not boilerplate. It enforces the anti-morphing rule (Section 13). When the persona encounters work outside its lane, it routes to the sibling — rather than absorbing it.

### Working substrate (in the cortex)

Each persona has a folder in the cortex at `wiki/agents/<persona-slug>/` carrying its accumulated state:

| File / folder | Purpose |
|---|---|
| `facts/` | Atomic fact files — feedback the persona has accumulated. One topic per file. |
| `status.md` | One-line current state. NOW, not history. |
| `journal/<date>.md` | Daily narrative of what was done + why. |
| `findings/<date>-<slug>.md` | Surfaced patterns the persona noticed (not yet promoted to `wiki/knowledge/`). |
| `inbox/` | Comms briefs from siblings + user-routed asks awaiting pickup. |
| `tasks/` (optional) | Open tasks the persona is responsible for. |
| `AGENTS.md` (optional) | Persona-specific cortex working conventions (not persona definition — that's in Goose) |

Plus a **domain workshop** for content-heavy specialists — a per-persona working folder for drafts, references, assets. Earned-place: mint subfolders only when 3+ items of the same shape accumulate.

### Why split

This split solves a real problem with the Goanna model on Goose:

- **Persona identity is portable.** A curator persona configured once works against any cortex you point it at. Goose users on different cortexes share the same persona shape.
- **Working substrate is cortex-specific.** Curator's facts about *this* cortex's owner, this cortex's quirks, this cortex's clients — that lives in the cortex, syncs across Macs, and follows the cortex when it's backed up.
- **Same persona, multiple cortexes.** Eventually multi-tenant: one curator persona in Goose, two cortexes (personal + work). The persona's working substrate is per-cortex; the persona's identity is shared.

The Goanna model conflated these because Claude Code's tree-walk makes the persona definition file *part of* the cortex. Goose's persona-context split lets us separate them — cleaner ownership, cleaner backups, cleaner multi-cortex story.

---

## 5. Page-shape conventions

The substrate has two shapes of file, mapped by intent:

| Shape | Pattern | When |
|---|---|---|
| **Entity** (a thing that exists + accumulates context) | `<collection>/<slug>/<canonical>.md` | Orgs, contacts, projects, decisions, knowledge concepts |
| **Event** (a thing that happens, discrete) | `<collection>/<id>.md` | Sessions, broadcasts, research notes, audit-driven digests |

No "flat-until-earned" promotion event. Entities start as folders day one. Events stay flat forever.

### Universal meta-files in every collection

Three files mean the same thing in every collection:

- `AGENTS.md` — operational conventions, schema, voice rules for that collection
- `_intro.md` — narrative orientation (human/agent)
- `INDEX.md` — worker-managed manifest of entries in the collection (derived)

The underscore prefix on `_intro.md` (and on `_<topic>-group.md` aggregator files) keeps them visually distinct in `ls`.

### Scaling rules: section → file → folder

Content earns its home in three tiers:

- **n=1 instance** — capture as a section in an existing file
- **n=2-3 instances** — mint a dedicated file
- **n=4+ instances** — mint a subfolder; group-index aggregator at n=4-15; consolidation at n=20+

Don't pre-create empty folders. *"Sparse wells gather over time; what looks like under-use today is normal-rate-of-arrival."* This is the gravity-wells doctrine (Section 11) applied to the question of when structure expands.

### Templates

Every entity-shape and event-shape has a canonical template in `templates/`: `entity.md`, `contact.md`, `project.md`, `decision.md`, `concept.md` (knowledge), `investigation.md` (research), `task.md`, `quote.md`, `finding.md`, `journal-daily.md`, `comms-brief.md`, `feedback.md`, `group-index.md`, `collection-index.md`, `skill/SKILL.md`. The discipline: *"Read the template; don't read prose about the template."*

---

## 6. The owner cascade

The cortex owner is a first-class concept, not just "the user". `wiki/owner/` is a deep folder carrying the owner's voice, rhythm, expertise, opinions, vocabulary — cascading into every agent's session via the warm-up procedure.

| File | What it carries |
|---|---|
| `AGENTS.md` | Schema + curatorial rules for the folder |
| `INDEX.md` | Manifest |
| `voice.md` | **Load-bearing.** Voice principles, banned phrases, dialect, per-channel variants. Every agent reads this before producing styled output. |
| `voice-samples.md` | Concrete examples across registers |
| `bio.md` | Background |
| `expertise.md` | Domain knowledge |
| `goals.md` | Direction |
| `opinions.md` | Stances on tools and approaches |
| `rhythm.md` | Working hours, cadence, response expectations |
| `tooling.md` | Day-to-day tools |
| `values.md` | Non-negotiables |
| `vocabulary.md` | Words used / words avoided |

`voice.md` is the highest-gravity file in the entire substrate. Warm-up step 4 names it explicitly: *every agent reads `wiki/owner/voice.md` before producing styled output.* That single line is what gives the file most of its gravity — every agent has been told to land there before producing anything stylistically visible.

This is the framework's strongest lever for elevating a file from *available* to *required reading*. Use it sparingly; every warm-up step adds session-start cost. But for the highest-traffic files, it's how anticipatory gravity gets created.

### Multi-owner installs

Use subfolders per person: `wiki/owner/<slug>/voice.md`. Single-owner installs put files at the top level. The `about:` frontmatter field disambiguates either way.

---

## 7. Schema-as-emergence (with engagement traces)

The framework's stance on schema design is *emerge, don't pre-design*. Applied identically across multiple kinds of schema:

| Domain | n=1 | n=2 | n=3 | n=4+ |
|---|---|---|---|---|
| Entity field | Inline as prose in body | Extract to frontmatter | Required field in collection schema | Cascade-refresh older entries |
| Watching brief → knowledge | Capture as finding | Second confirmation | Promote to `wiki/knowledge/<topic>/concept.md` | Cite in related concepts |
| Skill | Note in journal | Note + light SOP | Author `skills/<name>/SKILL.md` | Sibling agents reference it |
| Group-index file | n/a | n/a | n/a | Mint `_<topic>-group.md`; milestone at 15+; consolidation at 20+ |

**The rule across all four**: don't pre-author for hypothetical patterns. *"Pre-designed schemas drift. Schemas earned from 3+ instances of the same shape stick."*

Exception: **upstream-confirmed at n=1**. When a single instance is architectural reality verified against an authoritative source (vendor docs, regulatory standard, an entity registry), promote immediately. Don't wait for false confirmations.

### The CRM doctrine

Six principles (inherited from Goanna's `docs/CRM.md`):

1. *Markdown is the database.* Frontmatter for structured; body for narrative. Git/activity-log is the audit trail.
2. *Atomic records.* One concept per file. Atoms compose into views.
3. *Schema emerges, doesn't get pre-designed.* (Above.)
4. *Generative views, not pre-built filters.* Agents synthesise views per question; we don't build dashboards.
5. *Substrate for humans + agents both.* Same files, two consumers.
6. *Schema is the contract; tooling is convenience.* Frontmatter conventions ARE the API.

### Engagement traces — the canonical interaction primitive

For entities that accumulate interactions (orgs, contacts, projects), the canonical client-memory shape is **the engagement trace**: one line per substantive interaction, four fields:

```
2026-05-28 / Sarah Smith (email) / agreed renewal terms 2024-2025 / msg-18f3a1b
```

| Field | Required | Note |
|---|---|---|
| date | yes | ISO date |
| actor (channel) | yes — non-negotiable | Who did it, in parens which channel. The "I did X" pattern collapses when several writers contribute. |
| verb-phrase with outcome | yes | What happened + what changed |
| reference ID | yes | Link back to the raw archive |

Lives in the entity's canonical file under `## Recent`. Multi-writer accumulating store. Three sizes by complexity: **trace** (one-liner; default), **touchpoint** (companion file when content warrants a paragraph), **deep narrative** (`sessions/<date>.md` for full notes). The agent picks the size based on the interaction.

### Service-state, not single-status

For entities with multiple ongoing service relationships, don't collapse to one `status:`. A client relationship is a *bundle of services*, each with its own state. Entity-level summary derives from the bundle. Single-status fields lose detail and force the agent to guess.

---

## 8. Skills + recipes

Skills are *Standard Operating Procedures* — runnable shapes with frontmatter describing when to invoke and a body describing what to do.

### The skill body template

Fixed across the framework:

```markdown
---
description: "<load-bearing description — leads with the trigger>"
---

## When to invoke
<concrete triggers as bullets/table, including negative cases>

## Procedure
<numbered steps; each is one observable action>

## Non-obvious disciplines
<only when there's a genuine non-obvious trap>

## Composition with other skills
<table of what this replaces / pairs with>

## Verification
<checklist; concrete signals>

## See also

## Last updated
```

### When to author

The 3-instance threshold applies: *"After 3 instances of the same procedural shape, write the SKILL.md before iteration 4."* Don't pre-author for hypothetical patterns — that produces stale boilerplate.

### Skill vs other shapes — decision rule

| Shape | When | Lives at |
|---|---|---|
| Skill | Runnable procedure with named inputs/outputs; closes a loop | `skills/<topic>/SKILL.md` |
| Knowledge concept | Pattern/fact/reference — not a procedure | `wiki/knowledge/<topic>/concept.md` |
| AGENTS.md content | So specific to one agent no one else would invoke | `<agent>/AGENTS.md` |
| Finding | One-shot trick, doesn't recur | `<agent>/findings/<date>-<slug>.md` |

The test: *"Would I want to invoke this by name, or just remember it happened?"* Invokable → skill. Memorable → finding.

### Skills vs Goose recipes

Office Town adds something Goanna doesn't have yet: **Goose recipes** as the precise tool-sequence primitive that pairs with markdown skills. A SKILL.md describes *when to invoke* and *what shape*; the recipe is the runnable YAML that executes a specific tool sequence. The two compose — the skill provides judgment context; the recipe provides reliable execution.

---

## 9. Cadence + cycles

Each agent owns its own clock. Cadence is declared in the agent's own `AGENTS.md` as a YAML `cycles:` map:

```yaml
cycles:
  main:
    cron_schedule: "7,37 * * * *"        # every 30 min, off-mark
    cron_prompt: "Run jobs/main/SKILL.md"
  weekly_digest:
    cron_schedule: "0 14 * * 4"          # Thursday 14:00
    cron_prompt: "Run skills/weekly-digest/SKILL.md"
```

At session kickoff, the agent reads its own cadence and wires the crons (CronList → diff against declared → CronCreate missing). The crons are session-scoped — they die when the session exits; kickoff re-wires them.

This means **AGENTS.md IS the source of truth for the agent's wiring**. Drift between declared and actual is itself a finding.

### Tuning rules

Cadence isn't static. Each agent tunes from observed signal volume:

> Bump cadence when 3+ consecutive cycles produce substantive new outputs.
> Drop cadence when 2+ consecutive cycles produce only hygiene notes.

The agent owns its own clock; the framework owns the tuning shape.

### Mode hierarchy (universal)

Every cycle picks a mode by what's actually waiting, not by what's most interesting:

| Mode | When |
|---|---|
| **Reactive** | Inbox has briefs; sibling findings landed; user surfaced something |
| **Bootstrap** | Inbox empty, but thin records exist that need deepening |
| **Quiet-cycle hygiene** | Nothing useful in bootstrap; do stale audits, broken-link sweeps, archive resolved findings |
| **Cascade-refresh** | `schema_version` bumped on a collection; walk old-schema records to new schema |

Reactive beats bootstrap. Bootstrap beats hygiene. Hygiene beats cascade-refresh (unless schema actually changed).

---

## 10. The kickoff procedure (Goose-shaped session start)

Goose loads `AGENTS.md` cascades automatically — that's the runtime piece. What the *persona* does after Goose hands it context is the kickoff procedure. Adapted from Goanna's `skills/kickoff/SKILL.md` for the Goose persona-context model:

1. **Cascade is already loaded by Goose** — AGENTS.md from the working directory up to the cortex root has been concatenated into context. The persona doesn't re-read these; they're already in the system prompt.
2. **Read your working substrate** — `wiki/agents/<persona-slug>/facts/*.md` for accumulated feedback; `status.md` for current state.
3. **Read the owner context** — `wiki/owner/voice.md` (load-bearing, every persona reads before producing styled output). Other owner files (rhythm, expertise, vocabulary, opinions) on demand.
4. **Locate yourself** — what folder did the user open Goose in? That's the homing beacon. If you're in `wiki/orgs/acme-corp/`, you're working on Acme. If you're in `wiki/projects/2024-renewal/`, you're working on that project. Don't ask the user where they are; the working directory is the answer.
5. **Read the local entity** — if the working directory is an entity folder, read the `entity.md` / `contact.md` / `project.md` / `decision.md` canonical file. That's the working object.
6. **Pick up open tasks** — your `wiki/agents/<persona-slug>/tasks/*.md` filtered on `surface: true`.
7. **Check in-flight** — today's `journal/<date>.md`.
8. **Glance recent journal** — last 3-5 days for ambient context.
9. **Check inbox** — `wiki/agents/<persona-slug>/inbox/` and `wiki/broadcasts/`.
10. **Glance own findings + skills** — what you noticed; what skills you have available.
11. **Wire cron cycles** (for personas with scheduled work) — diff declared vs actual; CronCreate missing.
12. **Now work.** Don't end kickoff and ask *"what would you like to do?"* — that's the failure mode the procedure prevents.

Step 12 is the autonomy-default doctrine encoded as ritual. The persona's role is defined; the cascade gave it the context; the working directory told it where; the working substrate told it what. Then act. The framework's universal rule: *bias to action* on reversible, internal, low-surprise work. Defer only when destructive, external, or genuinely ambiguous.

### The homing-beacon insight

Step 4 is the difference between the Goose model and the Claude-Code model. Claude Code loads context by walking the tree from `cwd` upward; Goose does the same via `CONTEXT_FILE_NAMES`. Both give cascaded context. But the *working directory itself* is information — it tells the persona which entity / collection / project / decision is the focus of work.

This means **how you launch Goose matters**:

| Launch context | Persona understands the focus is... |
|---|---|
| `goose run --working-dir ~/my-town/` | Whole-cortex work; the persona's responsibility area, not a specific entity |
| `goose run --working-dir ~/my-town/wiki/orgs/` | All orgs (e.g. doing a vertical analysis, or auditing the collection) |
| `goose run --working-dir ~/my-town/wiki/orgs/acme-corp/` | Specifically Acme — read entity.md, work in this context |
| `goose run --working-dir ~/my-town/wiki/projects/2024-renewal/` | Specifically this project; load its decisions, related orgs, recent sessions |

This is what eliminates the "wait, which client are we on?" ambiguity. Pick the folder; the agent knows.

---

## 11. Curation gravity-wells (the most defensible doctrine)

The placement of content shapes how often, how reliably, and by whom it gets read. The location isn't passive storage — it's an active force on retrieval.

**Five forces have to be simultaneously true for a file to attract content**:

1. **Path predictability** — the well lives at a documented fixed location
2. **Name-content match** — the filename predicts contents
3. **Size matched to read frequency** — frequently-read files must be small
4. **Cross-link reinforcement** — every file mentioning a concept links to its canonical home
5. **Warm-up makes it load-bearing** — highest-traffic files declared as required reading

Remove any one and the well weakens to a sink.

**The acid test: predictive routing.**

> When new content arrives, can you predict where it'll end up without thinking?
> - If yes → the wells are working.
> - If you have to deliberate → the wells are weak.
> - If you have to grep → the wells aren't there.

### Failure modes (named so curators spot them earlier)

| Failure | Detection | Treatment |
|---|---|---|
| **Sink** | File >200 lines, multiple unrelated H2 sections | Split or mint a new well |
| **Black hole** | Content everyone agrees is misplaced, but no one can name the right place | Framework needs a new well |
| **Galactic dust** | Updating a fact requires touching 3+ files | Mint a well; move all instances; leave pointer-stubs |
| **Empty well** | Schema declares a likely-file that nobody mints | Tighten the name + purpose, or remove from likely-files |
| **Wells too close together** | Curators routinely struggle to choose between two adjacent wells | Sharpen split criterion (mnemonic), or merge |

### Curatorial operating procedure (3 questions in order)

When new content arrives:

1. **Is there an existing well whose name and purpose match this?** → if yes, route there.
2. **If no, does the content earn a new well?** → apply scaling rules (Section 5).
3. **Is there a sink forming?** → if routing to a file whose name doesn't match, rename / split / file feedback.

### Propagation rule

Curation generates structural change as a side-effect. The shipping commit propagates the change in the same fire:

- **Mint into collection** → write entity file AND add `INDEX.md` row in the same commit
- **Slug rename** → update every reference AND move/rename the file in the same commit
- **Cohort promotion** → cohort-index + member-tags + schema bumps all in the same commit

Index without members or members without index is half-shipped.

---

## 12. Specialist disciplines

The nine disciplines that turn a narrow-scope agent from *busy* into *compounding*. Each with a detection signal:

1. **Single concrete output target** — one artifact shape, one home. If 3+ output shapes, scope too broad → split or narrow.
2. **Phase 1A scope-narrowing** — brief is one paragraph naming what they DO and DON'T. Adjacent work routes elsewhere.
3. **Group-index files at instance thresholds** — 4+ instances → mint `_<topic>-group.md`. 15+ → milestone. 20+ → consolidation.
4. **Wait for stability before crystallising structure — not before acting.** Schema-as-emergence over schema-as-design.
5. **Verification-before-remediation** — re-check classification before applying a fix.
6. **Sibling-discoveries-reading as primary signal source** — read other agents' `findings/` folders at kickoff.
7. **"Maintaining watch" is not acceptable** — every cycle produces a concrete output OR a "nothing to act on, X stable, because..." memo. *"Still monitoring X"* is plateau.
8. **Hook-variety driving signal-source diversity** — 4-8 distinct signal sources rotating.
9. **Propagation when structure changes** — same-commit propagation (see Section 11).

The package is paired with **what's NOT in it**: elaborate custom tooling, pre-built dashboards, complex schema enforcement, multi-step approval workflows, heavy cron schedules, per-domain custom output formats. *"If a specialist's tooling looks elaborate, that's usually a sign Discipline 1 or 2 is missing. Fix is structural narrowing, not more tooling."*

---

## 13. Memory + epistemics

Knowledge in the cortex evolves; it isn't bedrock.

> Wiki records reflect the curator's best-current synthesis of available substrate evidence. Past records can be updated as new context arrives. Mining + reflection cycles continuously refine — that's a feature, not a flaw.

This is paired with the **open-questions pattern**: uncertainty is first-class. Records carry honest *what we don't know* sections; ambiguity isn't paved over.

### Three properties distinguish a foundation from an archive

- **Integration** — entries cross-link; nothing exists alone
- **Sourcing** — every factual claim cites its origin
- **Honest uncertainty** — what's unknown is marked, not invented

### The autonomy-default doctrine

> Asking the user is the last resort, not the first move. Agents exhaust internal research (cortex query, MCP lookup, semantic search, web search, raw-archive citation chase) before escalating. When they do escalate, they present a recommended action with confidence and sources — not an open question. The user steers; the user doesn't solve.

Six operating rules:
- **Try research before asking** — the agent has tools the user doesn't (semantic search, MCP lookups, the graph).
- **Confidence-scored auto-write beats blocking** — entries land with `confidence` + `status: stub` if uncertain; the dashboard surfaces low-confidence items for optional review.
- **When escalation IS needed, present a recommendation** — not "are these the same entity?" but "I recommend merging X and Y because [signals]. Approve?"
- **Provenance > permission** — every action is auditable via `wiki_audit` with required `why:`. Audit makes autonomy safe.
- **User-pinned facts override agent inference** — `pinned: true` is ground truth.
- **Don't pad escalations** — one question, multiple-choice over open-ended.

The dashboard is a **review surface**, not an input surface.

### Schema versioning + audit trail

`schema_version` on every entry; `wiki_audit` with required `why:` on every write; status lifecycle `active | stale | dormant | archived | stub` — together these let the cortex carry uncertainty AND history AND auditability. The agent acts confidently within the system because the system records what it did and why.

---

## 14. Living memory — agents that learn from conversation

The watching-brief promotion model captures patterns curator + librarian observe **in the substrate** (n=1 brief → n=3 promotion to `wiki/knowledge/`). Living memory is the complement: patterns that emerge **from the conversation itself** as it's happening, synthesised into durable substrate artefacts before the session ends.

This is the difference between *recording* knowledge and *learning* it. A static cortex is built by curators writing entries. A living cortex is built by *every conversation* contributing — the persona recognises something worth keeping and creates the artefact mid-session.

### The pattern

During any conversation, the persona watches for moments where:

- The user explains a methodology, preference, or principle that will apply again
- The user corrects a default or surfaces a non-obvious rule
- A worked example clarifies something the cortex didn't capture
- The user names a pattern explicitly (*"this is what I always do for X"*)
- An ambiguity gets resolved with reasoning that will recur
- A standing order for a specific entity emerges (*"for this client, always..."*)

When the persona recognises one of these, it doesn't just nod and continue. It **synthesises the essence** — names the pattern, captures the reasoning, locates the right home in the substrate — and writes a durable artefact. The user can review it later via the dashboard.

### Where the artefacts land

The cortex already has the homes; living memory uses them more actively:

| Pattern recognised | Lands in |
|---|---|
| User's general preference / methodology | `wiki/owner/<aspect>.md` (voice, rhythm, opinions, etc.) — appended to the owner-cascade file |
| Persona-specific feedback ("this curator should always do X") | `wiki/agents/<persona-slug>/facts/<topic>.md` — atomic fact file |
| Standing order for a specific entity | `wiki/<collection>/<slug>/AGENTS.md` (the per-entity standing-orders file) |
| Pattern that crystallises into doctrine | `wiki/knowledge/<topic>/concept.md` (after the 3-instance threshold is hit) |
| One-off observation worth remembering | `wiki/agents/<persona-slug>/findings/<date>-<slug>.md` |
| Methodology that becomes a skill | `wiki/skills/<topic>/SKILL.md` (after 3 instances) |

### The synthesis discipline

Living memory isn't transcription. It's *synthesis* — the persona names what was learned, in essence form, with provenance.

The synthesis pattern:

1. **Name the pattern** — give it a slug. *"User prefers X over Y"* → `prefer-x-over-y`. *"Always include Z when doing W"* → `always-z-when-w`.
2. **Capture the essence** — one paragraph of what the pattern is, why it matters, when it applies.
3. **Cite the conversation** — `derived_from:` includes a reference back to the raw conversation archive (Goose conversation export, dated).
4. **Locate the home** — apply the gravity-wells doctrine: is there an existing well? does this earn a new well?
5. **Set confidence appropriately** — most living-memory artefacts start at `confidence: 0.7-0.85`. They're observations, not bedrock. Promotion to higher confidence happens via the 3-instance threshold.
6. **Surface, don't bury** — write a one-line entry in the persona's `journal/<date>.md` noting what was synthesised. Future kickoffs see this; the persona knows it captured something.

### Why this matters beyond the technical

The user's enthusiasm to work with the system depends on whether the system is learning. *"That has meaning"* — when a person explains something to an agent, the explanation is data. If the agent treats the conversation as ephemeral and forgets the next session, every interaction starts from zero. If the agent synthesises and carries the synthesis forward, the user feels heard, the cortex compounds, and subsequent sessions are dramatically more useful.

This is the *"agent knows the human"* effect. After enough conversations, the cortex carries the user's methodology, preferences, vocabulary, judgment patterns, taste — captured in `wiki/owner/` and refined through synthesis. New personas read this cascade at kickoff and start with the same understanding the prior persona had.

### Reference: Hermes-style self-creating skills

The Hermes agent design surfaced this pattern as *self-creating skills* — agents that recognise a procedure they're doing and write a SKILL.md for it mid-session, so the next instance is easier. Office Town generalises: not just skills, but knowledge concepts, facts, owner-cascade entries, standing orders. The mechanic is the same — agent watches itself for synthesis opportunities and writes durable artefacts.

### The 3-instance threshold still applies

Living memory doesn't bypass schema-as-emergence. A first-time observation lands as a finding or fact (n=1). After 3 observations of the same shape, the pattern earns promotion to `wiki/knowledge/` or to a required field on a collection schema.

What living memory adds: **the n=1 observation gets captured at all**, instead of being lost when the conversation ends. The promotion discipline is unchanged.

### Surfacing what was learned

The dashboard exposes "what was learned this session":

| Panel | Shows |
|---|---|
| **Synthesis from recent sessions** | Last N living-memory artefacts written, with persona + source + confidence |
| **Watching briefs** | n=1 patterns awaiting confirmation |
| **Promotions** | Recent moves from finding → knowledge concept |
| **Owner cascade updates** | Changes to `wiki/owner/*` derived from conversation |

The user reviews when they want to. The cortex keeps learning whether they review or not — provenance + audit means anything questionable can be undone.

---

## 15. Anti-patterns earned the hard way

The recurring meta-failure across multiple framework docs: **manufactured work to look busy.**

> If you catch yourself making work — posting low-signal status, drafting unprompted, inventing tasks to look busy — end the cycle.

Operationally, every cycle must produce one of:
- A new file (entry, finding, brief, skill, decision)
- An update (existing entry, status, INDEX.md)
- A "nothing to act on, X stable, because..." memo with reasoning

The verbal signature of plateau: *"still monitoring X"*, *"watching for further developments"*, *"continuing to track"*. Exit cleanly when no signal. Plateau ≠ silence.

### Other earned anti-patterns

- **Don't morph.** Reading another agent's `AGENTS.md` to "be them" = file a comms brief instead.
- **Describe what IS, not what WAS.** Change history lives in the activity log; don't accumulate "earlier versions did X" prose.
- **Don't apologise in `last_change_summary`.** It's a change log, not a confession.
- **No archive folders, ever.** Activity log is the audit trail. Ephemeral content deletes after a graduation check.
- **Don't treat re-mining as cycle padding.** Re-mining when records show no drift signals is manufactured work.
- **Pre-designed schemas drift.** Wait for n=3 same-shape instances; schemas earned from instances stick.

---

## 16. The brand-new-Mac test

The acid test for whether the cortex is working:

> A fresh Goose install on a new Mac, with the user's worker URL + bearer, should be able to do useful work on any project immediately — without prior conversational context. The substrate IS the brief.

If the agent has to ask the user "what's the situation with X?" or "what was decided about Y?" then the cortex doesn't contain enough structured context. That's a substrate gap, not an agent gap — and it's fixable by adding the missing well.

Operationally:
- Fresh agent + clean install → asks only for the worker URL + bearer
- Reads the cortex during kickoff
- Does useful work

This is the operational definition of "cortex works". Use it ruthlessly on your own install.

---

## 17. Search capability (the substrate needs first-class queries)

Autonomy without search tools forces the agent to ask. Telling an agent "research before asking" is empty if its toolkit is just `wiki(get, slug)` and `wiki(list, collection)`.

The cortex needs first-class search across files AND structured data. Seven action shapes:

| Action | Purpose |
|---|---|
| `wiki(grep, pattern)` | Content search (FTS5 over body + frontmatter; Vectorize for raw chunks) |
| `wiki(filter, where)` | Structured field filter (D1 over wiki_entries + wiki_links) |
| `wiki(walk, start, edges)` | Graph traversal (recursive wiki_links) |
| `wiki(semantic, query, k)` | Vectorize similarity search |
| `wiki(at_date, slug, date)` | Temporal lookup via wiki_audit replay |
| `wiki(pending)` | The agent's own backlog (stubs, low-confidence, review-pending) |
| `wiki(related, slug)` | Graph neighbours (existing) |

Without these, autonomy can't work. They're what make the agent's "research before asking" mandate real.

---

## 18. The creator / mentor / fleet governance pattern

For any single-owner cortex, there are three roles in the governance loop — distinct from the four shapes of *agents within* the cortex:

| Role | Who | What they do |
|---|---|---|
| **Creator** | Human (the cortex owner) | Holds direction, judgment, taste. Steers what's in / out / next. |
| **Mentor** | Creator-side AI (Claude Code, Cursor, etc.) | Drafts framework artefacts, synthesises patterns, names disciplines, drafts skills before the fleet practises them |
| **Fleet** | Deployed agents (Goose-hosted in the substrate) | Practises the framework; writes findings; mints knowledge concepts; surfaces gaps; files comms briefs |

The loop: *creator steers → mentor drafts → creator reviews → ship → fleet adopts → fleet writes back → mentor surfaces via review → creator decides what folds back to canonical*.

This pattern is what makes a single-owner cortex compound over time. The creator's bottleneck is attention; the mentor uses it efficiently. The fleet does the operational work; the creator + mentor refine the framework.

For multi-owner installs (teams, agencies hosting client cortexes), the pattern generalises — one creator per cortex; the mentor + fleet are scoped to that cortex.

---

## 19. What this replaces

The substrate-first pattern replaces a stack of tools each carrying their own friction:

| Tool replaced | Friction removed |
|---|---|
| Notion / Confluence | Wiki rot; UI sluggishness; export friction; AI agents can't actually use them at scale |
| Google Drive | No structure; opaque to search; collaboration via permissions instead of substrate |
| Slack (for institutional memory) | Ephemeral; unsearchable; conversations stay in DMs; nothing accumulates |
| Asana / Trello / GitHub Projects | Decisions and rationale don't co-locate with tasks |
| Bespoke CRM | Locked-in schemas; rigid views; AI agents see API surfaces not data |
| Personal knowledge tools (Obsidian, mem.ai) | Single-user; no agent-readable contract; no audit trail; no shared canonical store |
| OpenHuman / RAG-only PKM | Chunk-shaped recall without entity identity, temporal validity, provenance, or graph |

The cortex doesn't replace *everything* — Drive still holds binaries; Slack still handles real-time chat; the accounting system still does accounting. The cortex sits beside them as the *agent-readable knowledge layer* that integrates with all of them.

### When the cortex is the wrong choice

- Real-time co-editing of documents (use Drive)
- High-volume time-series telemetry (use a TSDB)
- Multi-tenant SaaS where each tenant needs isolation (cortex can support this but isn't optimised for it)
- Content that genuinely doesn't need cross-linking or agent-readability (use whatever's easiest)

---

## 20. Where Office Town instantiates it

Office Town is the Cloudflare-hosted, Goose-extension instantiation of this framework. The specifics:

| Concern | Office Town's choice |
|---|---|
| Substrate storage | R2 (markdown canonical) + D1 (frontmatter index + audit + links) + Vectorize (embeddings) |
| Sync layer | `officetowd` Go daemon — fsnotify + SQLite manifest + HTTP through worker (no R2 token needed) |
| Write path | Unified through `/api/sync/object/<key>` PUT — frontmatter repair + audit + indexing all fire centrally |
| Structured ingestion | `/api/ingest` — Workers AI extractor against per-collection schemas |
| Agent runtime | Goose (primary) — `AGENTS.md` is the Goose context-file convention; other agents that honour the spec work too |
| MCP servers | wiki, files, email, cron, voice, sandbox — exposed to Goose; agents call via MCP |
| Curator connectors | User's own Goose-installed MCPs (gmail, slack, github, xero, jim2, composio, custom) — Office Town worker holds no external credentials |
| Voice rooms (planned) | Cloudflare Realtime SFU + Durable Objects for per-call state |
| Sandbox (planned) | Cloudflare Containers binding for ephemeral compute |
| Dashboard | Hono-rendered HTML, with review queue, reconciliation queue, stubs, lint failures, watching briefs as panels |

The framework is the *what*; Office Town is the *how on Cloudflare*. Other instantiations (self-hosted, multi-cloud, single-user-on-laptop) are possible and the framework doesn't prevent them.

---

## 21. Status + roadmap

**Built**:
- Unified write path with audit + frontmatter repair + index queue (`unified-write-path-2026-05-28.md`)
- Bisync daemon (officetowd v0.2.1) with parallel-apply concurrency
- Six MCP servers + dashboard
- Email Routing inbound + email_send via worker
- Cron tables (jobs + runs)
- Sandbox + voice MCPs stubbed

**Planned, Session 1 (~5 hours)**:
- D1 columns for cortex foundation (schema_version, status extensions, valid_from/until, confidence, review_status, pinned, relevance_score)
- Six starter collections with `AGENTS.md` schema docs (inbox, orgs, contacts, projects, decisions, knowledge)
- `/api/ingest` Phase A with Workers AI extractor
- Frontmatter → wiki_links derivation
- See `session-1-build-spec-2026-05-28.md`

**Planned, Sessions 2-6**:
- Curator subagent + Gmail end-to-end (Session 2)
- Reconciliation surface + `wiki(action: grep|filter|walk|semantic|pending)` search (Session 3)
- Provenance + temporal validity + `valid_from`/`valid_until` on links (Session 4)
- Hotness-driven materialisation + reference-count rollup (Session 5)
- Tier-1 ETL extractors (Xero, Jim2, GitHub, Rocket, Synergy) (Session 6)

After ~6 sessions: a minimum-viable cortex with structured ingestion + reconciliation + temporal validity + provenance. The brand-new-Mac test should pass for any of the cortex owner's projects.

---

## 22. The publishable shape

This document is a candidate first draft of the framework's external presentation. Pieces still to do for publication:

- A short README that's the elevator pitch + "get started in 10 minutes"
- An install guide for the Cloudflare deployment
- A separate framework-only spec (this doc minus the Office Town instantiation specifics) that's portable to other implementations
- Example minted agents (boss / curator / librarian / scout / worker) with the file family populated, voice tuned, cycles declared
- A demo install pre-populated with a fictional business cortex (for the "try the brand-new-Mac test" experience)
- Comparison artefacts (cortex vs Notion AI vs OpenHuman vs personal-Obsidian)

The defensible architectural insight worth defending under critique: **gravity wells**. Other markdown-knowledge systems get one or two of the five forces right; this framework documents all five and uses them deliberately. The acid test (predictive routing) is the operational consequence. The failure modes (sinks, black holes, galactic dust, empty wells, wells too close) are named so curators spot them earlier than they otherwise would.

---

## Provenance + companion docs

**Source**: Goanna substrate, ~1 month deployed. Pulled from 30+ agent `AGENTS.md` files, 22 framework docs, 60 skills, 54 knowledge concepts, and the templates/owner manifests.

**Office Town design notes (this folder)**:
- `cortex-pattern-2026-05-28.md` — strategic framing (why this matters)
- `cortex-shape-2026-05-28.md` — roles, naming, structural conventions (the design contract)
- `curator-pattern-2026-05-28.md` — curator agent architecture
- `agent-autonomy-default-2026-05-28.md` — the autonomy principle
- `agent-search-capability-2026-05-28.md` — what tools agents need to make autonomy real
- `session-1-build-spec-2026-05-28.md` — the foundation build
- `structure-shaped-ingestion-2026-05-28.md` — worker write pipeline
- `unified-write-path-2026-05-28.md` — write architecture
- `goanna-doctrine-extracted-2026-05-28.md` — full Goanna synthesis this framework draws from
- `openhuman-research-2026-05-28.md` — OpenHuman patterns adopted/rejected
- `research-wiki-for-agents-2026-05-28.md` — Karpathy + Obsidian-AI community findings
