# Cortex Shape — Roles, Naming, Structure

**Date**: 2026-05-28
**Status**: Design proposal. Companion to `cortex-pattern-2026-05-28.md` (the why) and `curator-pattern-2026-05-28.md` (the how). This doc covers the *what shape* — agent roles, the right word for "hotness", the structural conventions (folders, frontmatter, links, schema evolution), and the inherited doctrine from Goanna's CURATION.md (gravity wells).

Updated 2026-05-28 with research from two streams:
- General-purpose agent research → `research-wiki-for-agents-2026-05-28.md` (Karpathy's LLM Wiki spine + Obsidian-AI practitioner consensus)
- Goanna substrate reads → `agents/librarian/facts/*` + `docs/CURATION.md` + `agents/librarian/CLAUDE.md`

These two streams converged on the same answers more often than not. Where they diverged, Goanna's hard-won doctrine wins — it has years of operational use behind it, whereas Karpathy's pattern is months old.

---

## Part 1 — Roles, redefined (now reconciled with the four-shapes finding)

**Updated 2026-05-28** after Goanna-doctrine extraction surfaced the claim that there are only four agent shapes: **router / doer / curator / watcher**. After a month of running fleets, no fifth shape has emerged. Office Town adopts this — the five roles I sketched earlier are *not* five primitives; they're four shapes, with Curator and Librarian being two specialisations of the same curator-shape.

### The four shapes

| Shape | Verb | Direction | Office Town role(s) |
|---|---|---|---|
| **Router** | Directs | User ↔ subordinates | Boss |
| **Doer** | Executes | Intent → world | Worker (+ domain specialists: Editor, Bookkeeper, Project Manager, etc.) |
| **Curator** | Curates | External ↔ substrate | Curator (inbound from connectors) AND Librarian (organises the wiki) |
| **Watcher** | Finds | External (no auth) → findings | Scout |

The four shapes are *capability surfaces*, not job descriptions. Domain ≠ shape. A newsletter editor is a doer-shape specialisation; a contact-records minter is a curator-shape specialisation; an uptime monitor is a watcher-shape specialisation. They differ in scope and material, not in primitive.

### Curator-shape, two scopes

Curator and Librarian are both curator-shape — they curate the substrate. They differ in scope:

| | Curator (inbound scope) | Librarian (organisational scope) |
|---|---|---|
| **What they curate** | External content flowing INTO the substrate | Existing entries within the substrate |
| **Tools used** | User's Goose-side connector MCPs (gmail/slack/github/xero/...) + Office Town wiki MCP + `/api/ingest` | Office Town wiki MCP + Vectorize + audit log |
| **Primary verb** | Ingest, classify, extract, link | Organise, promote, lint, deepen, reconcile |
| **Cadence** | User-triggered or per-event | Scheduled (reactive/bootstrap/quiet-cycle/cascade-refresh) |
| **Typical output** | New typed entries with `derived_from` provenance | Updated existing entries; new `wiki/knowledge/` promotions; INDEX.md maintenance |

They share the curator-shape file family + the curator-shape disciplines. They differ in *which substrate they reach for* and *which side of the inbound/internal boundary they live on*.

### Each role's job, in one line

| Role | Shape | Verb | Reads | Writes |
|---|---|---|---|---|
| **Boss** | router | Directs | User intent + delegate responses | Nothing structural; user-facing replies |
| **Curator** | curator-shape (inbound scope) | Ingests | External MCPs + raw archive | wiki entries via `/api/ingest` + Inbox + derived_from |
| **Librarian** | curator-shape (organisational scope) | Organises | wiki + audit log + Vectorize | Updated entries; knowledge promotions; INDEX.md |
| **Scout** | watcher | Finds | Web (no auth) | Findings entries (optional) |
| **Worker** | doer | Executes | Context from Librarian/Curator | External state (with user approval) |

### Why this matters

The four-shapes claim narrows what we have to design. We don't need to invent custom architectures for "secretary" or "bookkeeper" or "client-research-agent" — they're all doer-shape or curator-shape specialisations. The file family, kickoff procedure, cadence shape, and discipline package are shared.

This also means **library and curator share most of their AGENTS.md content** — the differences are scope (which collections they curate) and tool whitelist (Curator gets external connectors; Librarian doesn't). The shared structure is the *curator-shape baseline*.

### The agent file family (universal to all four shapes)

From Goanna's doctrine, every agent — regardless of shape — has the same file family:

| File | Purpose |
|---|---|
| `AGENTS.md` | Identity, role, boundaries, modes, cadence, voice, routing. The agent's own contract. |
| `facts/` | Atomic fact files — feedback the agent has accumulated. One topic per file. |
| `status.md` | One-line current state. NOW, not history. |
| `journal/<date>.md` | Daily narrative of what was done + why. |
| `findings/<date>-<slug>.md` | Surfaced patterns the agent noticed (not yet promoted to wiki/knowledge). |
| `inbox/` | Comms briefs from siblings + user-routed asks awaiting pickup. |
| `jobs/<cycle>/SKILL.md` (optional) | Per-cycle runnable skill the agent's cadence invokes. |

Plus a **domain workshop** for content-heavy specialists: a per-agent working folder for drafts, references, assets. Earned-place — mint folders only when 3+ items of the same shape accumulate.

### The clarifying principle

**Each role faces a different direction with a different primary verb.**

---

## Part 1.5 — The kickoff procedure (universal to all agents)

Every Office Town agent — boss, curator, librarian, scout, worker, future specialists — runs the same session-start ritual. Inherited from Goanna's `skills/kickoff/SKILL.md`. 11 steps:

1. **Confirm local files are current** — sync layer handles this; optional sanity check on substrate freshness
2. **Soak up the framework** — read every `.md` in `wiki/` schema docs (collection AGENTS.mds, root AGENTS.md)
3. **Read your facts/** — keyed atomic facts the agent has accumulated; reload feedback
4. **Read the owner context** — `wiki/owner/AGENTS.md` cascade + `wiki/owner/voice.md` (load-bearing — every agent reads voice.md before producing styled output)
5. **Pick up open tasks** — your `tasks/*.md` filtered on `surface: true`
6. **Check in-flight** — today's `journal/<date>.md` for what's mid-stream
7. **Glance recent journal** — last 3-5 days for ambient context
8. **Check inbox** — `agents/<slug>/inbox/` and `wiki/broadcasts/`
9. **Glance own findings + skills** — what you noticed recently; what skills you have available
10. **Wire your cron cycles** — read the `cycles:` YAML map in your AGENTS.md; CronCreate any missing
11. **Now work.** Don't end kickoff and ask *"what would you like to do?"* — that's the wrong default. You know your job. Do it.

Step 11 is the autonomy-default doctrine encoded as ritual. The agent's job is its file; kickoff loads context; then it acts. The "what should I do" question is the failure mode the procedure prevents.

### The brand-new-Mac test

The acid test for whether the cortex is working:

> A fresh Goose install on a new Mac, with the user's Office Town worker URL + bearer, should be able to do useful work on any of the user's projects immediately — without prior conversational context. The substrate IS the brief.

If the agent has to ask the user "what's the situation with Acme?" or "what was decided about X?" then the cortex doesn't contain enough structured context — that's a substrate gap, not an agent gap.

This is the operational definition of "cortex works":
- Fresh agent + clean install → asks for the worker URL + bearer
- Reads the cortex during kickoff (steps 2-9 above)
- Does useful work

When this test fails, the cortex is missing wells (the right files aren't there) or the wells are sink-shaped (files are there but unfindable). Both are fixable; neither is a runtime problem.

```
                 ┌──────────────── Boss ────────────────┐
                 │  Orchestrates. Talks to the user.    │
                 │  Delegates. Verb: directs.           │
                 └──────────────────────────────────────┘
                       │              │              │
       ┌───────────────┼──────────────┼──────────────┼───────────────┐
       ▼               ▼              ▼              ▼               ▼
  ┌─────────┐    ┌───────────┐  ┌───────────┐  ┌──────────┐    ┌─────────┐
  │ Curator │    │ Librarian │  │  Scout    │  │  Worker  │    │ (others)│
  ├─────────┤    ├───────────┤  ├───────────┤  ├──────────┤    │         │
  │INBOUND  │    │ OUTBOUND  │  │ EXTERNAL  │  │  ACTION  │    │  ...    │
  │ingest   │    │  query    │  │ discovery │  │   in     │    │         │
  │         │    │           │  │           │  │  world   │    │         │
  │ Verb:   │    │ Verb:     │  │ Verb:     │  │ Verb:    │    │         │
  │ ingests │    │ answers   │  │ finds     │  │ executes │    │         │
  └─────────┘    └───────────┘  └───────────┘  └──────────┘    └─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
   user's          office-town-*    web,           gmail send,
   Goose-side     wiki MCPs        public APIs    code, slack
   MCPs (gmail,    + Vectorize     (no auth        post, deploy
   slack, xero,    + FTS5          needed)        (with user
   github,                                          approval)
   composio...)
```

### Each role's job, in one line

| Role | Direction | Verb | Reads | Writes |
|---|---|---|---|---|
| **Boss** | User-facing | Directs | User intent + delegate responses | Nothing structural; user-facing replies |
| **Curator** | External → cortex | Ingests | User's Goose connector MCPs | wiki entries via `/api/ingest` + Inbox |
| **Librarian** | Cortex → answer | Answers | wiki + Vectorize + audit | Surfaced context (returned to caller) |
| **Scout** | Web → answer | Finds | Web (no auth) | Findings entries (optional) |
| **Worker** | Intent → world | Executes | Context from Librarian | External state (with user approval) |

### Why the Curator/Librarian split is clean

Their tool whitelists are **inverse**:

- Curator has WRITE on office-town wiki + READ on user's external MCPs
- Librarian has READ on office-town wiki + NO external MCPs at all

A curator never answers a question to the user; a librarian never reaches outside the cortex. They can't accidentally do each other's job because they don't have the tools.

This is the same shape Goanna eventually settled on (after some early overlap):
> *Scout is for unowned external discovery; Librarian is for owned-substrate retrieval; they're not the same direction even though both involve "looking things up".*

Office Town adds the third inward-facing role (Curator) to complete the set:
**external discovery (Scout)** + **external ingestion (Curator)** + **internal retrieval (Librarian)**.

### Boss's job under the new shape

Boss becomes thinner and clearer. It receives a user request, decides which subagent should handle it, hands off, and presents results. It rarely does work itself. Pattern:

| User asks Boss | Boss delegates to |
|---|---|
| "Catch me up on this week" | Librarian (summarise audit + recent entries) |
| "Pull anything important from this morning's emails" | Curator (curate-inbox skill, gmail scope) |
| "Look up best practices for X" | Scout (web research) |
| "Draft a reply to Sarah" | Librarian (fetch context) → Worker (compose draft) |
| "Update the project status for Acme" | Librarian (fetch current) → Worker (apply change via wiki MCP) |

Boss never invokes wiki write tools directly. Writes go through Curator (for ingest) or Worker (for deliberate user-initiated edits).

### The Voice role (future, v1.2+)

When voice-rooms ship, Voice becomes a 6th role — same Boss-like orchestration, just over a different transport. No new responsibility. Mentioned here so the architecture doesn't get surprised when it lands.

---

## Part 2 — Replacing "hotness"

The OpenHuman pattern uses "hotness" for the multi-factor signal that drives lazy materialisation. The concept is sound; the word is wrong for a business cortex. "Hotness" suggests virality, transience, social-media flavour — none of those describe what the score actually means.

The score is: **how much computational attention does this entry deserve?** It's calculated from:
- `references_in` — inbound `wiki_links` count
- `query_hits` — MCP `wiki(action:get)` + dashboard reads + vector hits in window
- `recency` — decay function over `last_referenced_at`
- `pinned` — manual user override (1.0)

A name should describe what the score means in *business* terms, not how it's computed.

### Candidate names

| Name | Sense | Fit | Notes |
|---|---|---|---|
| **relevance** | What's relevant to current work | Strong | Most accessible. Tiny risk of "relevant to what?" but the cortex frames it as "relevant in the ongoing business context." |
| **prominence** | What stands out in the cortex | Strong | Captures "this entity is central to our worldview." Slightly less natural. |
| **salience** | What's noticeable, important | Medium | Academic. Cognitive-psych vocabulary. Precise but reads as jargon. |
| **importance** | What matters | Soft | Too vague. Every entry's owner thinks it's important. |
| **traction** | What's gaining attention | Medium | Active flavour. Implies trend; less for steady-state importance. |
| **signal** | This vs noise | Engineering | Honest about the gating purpose. Reads as technical, not business. |
| **reference_score** | What it's literally counting | Technical | Descriptive in DB. Bad for UI. |
| **engagement** | Web/social flavour | No | Wrong field. |
| **heat** | Same problem as hotness | No | Same problem as hotness. |

### Recommendation

**`relevance`** as the surface name. It maps to how a business user would naturally describe it: "Show me the most relevant entries about Acme this week." Internally the column can be `relevance_score` (a 0-1 float), computed from the sub-signals listed above.

Sub-signals stay as their own columns so they're inspectable and tunable:
```sql
wiki_entries (
  ...
  references_in INTEGER DEFAULT 0,        -- inbound wiki_links count
  query_hits INTEGER DEFAULT 0,           -- last 30 days
  last_referenced_at TEXT,                -- timestamp for decay
  pinned INTEGER DEFAULT 0,               -- 0 or 1
  relevance_score REAL DEFAULT 0          -- computed roll-up
)
```

Promotion-from-Inbox checks `relevance_score >= 0.4`. Hotness decay job becomes the "relevance decay job."

Fallback option if "relevance" feels too soft: **`prominence`**. Has more standalone weight (a "prominent entry" feels structural; a "relevant entry" feels query-bound).

---

## Part 3 — Doctrine inherited from Goanna: gravity wells

Goanna's `docs/CURATION.md` ships the most coherent treatment of markdown-knowledge placement I've encountered. Office Town inherits it as foundational doctrine. The full text lives in Goanna; the operational summary is:

> **In a markdown-first knowledge layout, the location and naming of content shapes how often, how reliably, and by whom it gets read. Location is an active force on retrieval. Predictive routing is the success metric; deliberation is the warning sign.**

### The five forces (a well attracts content only when all five are true)

1. **Path predictability** — well lives at a documented fixed location; agents at warm-up don't *discover* it, they're told it exists
2. **Name-content match** — filename is the search query; a reader who'd never seen the file should guess its content from the name alone
3. **Size matched to read frequency** — frequently-read files must be small; the soft cap creates the gravity by forcing curation
4. **Cross-link reinforcement** — every file mentioning a concept links to the canonical file for that concept
5. **Warm-up makes it load-bearing** — for highest-traffic files (boss/curator/librarian session start), declared as required reading in the warm-up procedure

Remove any one of these five and the well weakens to a sink.

### The failure modes (named so curators spot them earlier)

| Failure | Detection signal | Treatment |
|---|---|---|
| **Sink** | File >200 lines holding multiple unrelated H2 sections | Sink is structural, not a curator failure. Split the file or mint a new well. |
| **Black hole** | Content everyone agrees is misplaced, but no one can name the right place | Framework needs a new well. File feedback, don't keep forcing the existing ones. |
| **Galactic dust** | Updating a fact requires touching 3+ files | No single well exerts enough gravity. Mint a well; move all instances; leave pointer-stubs. |
| **Empty well** | Schema declares a likely-file that nobody mints, while the matching content lands elsewhere | Tighten the well's name and purpose, or remove from likely-files list. |
| **Wells too close together** | Two adjacent wells; curators routinely struggle to choose between | Write a sharp split criterion (mnemonic or decision tree). If you can't, merge them. |

### Curatorial operating procedure (3 questions in order)

When new content arrives at the curator/librarian:

1. **Is there an existing well whose name and purpose match this?** → if yes, route there. Don't create a new file because the existing one feels under-used.
2. **If no, does the content earn a new well?** → apply the three-tier scaling rule (see Part 5, Q1): section first → file when substantial → subfolder when 5+ items.
3. **Is there a sink forming?** → if you're routing content to a file whose name doesn't match, that's the structural signal. Rename, split, or file feedback.

These three questions are useful for any agent making routing decisions, not just librarian.

### Detection rule

> **Route to the well, not the bucket.** Before placing content, ask: *"If a future agent searched for this concept by name, would they find it here?"* If no, the content is in a sink — even if the file is small.

### Propagation rule

Curation generates structural change as a side-effect. The shipping commit propagates the change in the same fire, not "I'll catch it on the next quiet cycle":

- **Mint into collection** → write the entity file AND add the `INDEX.md` row in the same commit
- **Slug rename** → update every reference AND move/rename the file in the same commit
- **Cohort promotion** → cohort-index lands with per-member tags + schema bumps in the same commit

Index without members or members without index is half-shipped.

---

## Part 4 — The raw/ + wiki/ spine (from Karpathy)

Karpathy's April 2026 LLM Wiki gist proposed a deliberately minimal architecture that's now the dominant pattern in the agent-knowledge space. Office Town adopts the *spine* but rejects the *article shape*.

### What we keep

```
office-town/                            ← the cortex root
├── raw/                                ← immutable source-of-truth archive
│   ├── gmail/                          ← raw emails (saved by curator)
│   ├── slack/                          ← raw slack archives
│   ├── docs/                           ← imported google docs
│   ├── jim2/                           ← cardfile snapshots, job snapshots
│   ├── xero/                           ← invoice/payment snapshots
│   ├── github/                         ← repo state snapshots
│   └── scrapes/                        ← Browser Rendering scrape archives
│
├── wiki/                               ← LLM-territory: typed entities + concepts
│   ├── orgs/                           ← entity-as-folder
│   ├── contacts/                       ← entity-as-folder
│   ├── projects/                       ← entity-as-folder
│   ├── decisions/                      ← entity-as-folder
│   ├── knowledge/                      ← concept-as-folder
│   ├── inbox/                          ← short-lived staging (content-hash IDs)
│   ├── business/                       ← the business's identity (from Goanna)
│   ├── owner/                          ← Jez's voice / rhythm / expertise
│   ├── team/                           ← team member profiles
│   ├── skills/                         ← skill markdown
│   └── templates/                      ← canonical file shapes
│
├── CLAUDE.md                           ← the schema doc the agent reads every session
├── INDEX.md                            ← derived: catalog of everything in wiki/
└── LOG.md                              ← derived: append-only ingest/query/lint log
```

**Properties that matter:**

1. **`raw/` is append-only and immutable.** Curator writes; nobody edits. Wiki entries reference raw files via `derived_from:`. If the wiki schema changes, we delete + regenerate `wiki/` from `raw/` — the source of truth is preserved.
2. **`wiki/` is LLM territory** but as a *typed-entity graph*, not encyclopaedia articles. This is where dailydoseofds.com's critique of Karpathy bites: encyclopaedia summaries don't track business state (deadlines, decisions, commitments shift constantly). Typed entities with explicit relationships do.
3. **`CLAUDE.md` is the schema** the agent reads on every session — defines page kinds, frontmatter contracts, voice, contradiction policy. *"You spend an hour iterating with the LLM on schema.md and that hour determines everything else."*
4. **`INDEX.md` and `LOG.md` are derived artefacts** maintained by deterministic tooling (worker-side cron + `wiki_audit` query), NOT by the agent. Practitioner consensus: *"akm handles operations that require invariants an agent can't reliably enforce across sessions."*

### What we reject

Karpathy's encyclopaedia-article shape works for *research* knowledge (concepts and their relationships are stable). It breaks for *business operations* knowledge (deadlines, plans, decisions, commitments evolve constantly).

For Office Town, wiki entries are typed entities with explicit relationships — closer to the Rowboat-style decision/commitment pattern from the dailydoseofds critique:
- Each decision is its own MD file
- Each commitment is its own MD file
- Backlinks via `wiki_links` to people + projects + orgs
- Written-once + never-edited; new information becomes a *new* file linked back to the original

### Tiered loading economics

The wiki/raw split is also the answer to the wiki-vs-vector-store line:

| Layer | Size | Loading strategy |
|---|---|---|
| `wiki/` typed entries | ~thousands of small files, tens of thousands of tokens | Loaded into agent context directly; agents reason over the full graph |
| `raw/` source archive | hundreds of thousands of large files | Vector-indexed (Vectorize); retrieved on demand via `derived_from:` backlinks from wiki entries |

This matches `themenonlab.blog`'s lifecycle hooks: `SessionStart` loads excerpts and filenames, then the agent queries semantically before reading specific files.

---

## Part 5 — Structural conventions (research-backed answers)

The questions opened in the previous version of this doc now have research-backed answers. Where Goanna and Karpathy/practitioner consensus disagreed, I've noted both and named the winner.

### Q1: Folder layout per collection

**Answer**: Three shapes, with Goanna's "folders are earned" discipline overlaid.

| Shape | Used for | Promotion threshold |
|---|---|---|
| **Entity-as-folder** | orgs, contacts, projects, decisions, knowledge concepts | Always — entities deserve a folder day one |
| **Dated stream** | sessions, research notes, audit-driven digests | `wiki/<col>/YYYY-MM-DD-<topic>.md` |
| **Flat topic** | owner-only, secrets, business-config, templates | Single file per topic |

Within entity folders, **folders are earned** — start with one file per topic; promote to a subfolder when 5+ items each warrant their own page (Goanna's `fact-install-patterns` rule).

**Inbox shape**: `wiki/inbox/<sha-prefix>/<id>.md` (content-hash, not dated) because Inbox is deduped by content, not chronology. Two emails about the same thread land at the same SHA path.

**Standard subfolders inside entity folders** (codify in `wiki_collections.config_json`):
- `<canonical>.md` (e.g. `project.md`, `contact.md`, `entity.md`) — always
- `notes/` — ad-hoc working notes, dated
- `sessions/` — multi-session narrative
- `research/` — investigations
- `findings/` — audit summary digests
- `attachments/` — binary attachments

No `.generated/` or `_derived/` folder — derived content lives inline with `derived_from:` frontmatter. Fewer paths; audit log gives history.

---

### Q2: Relationships in frontmatter vs `wiki_links` table

**Answer (reversed from earlier lean)**: **Frontmatter is the source of truth.** `wiki_links` is a derived index, regenerated from frontmatter on every write.

Research is unambiguous: practitioner consensus puts authoritative relationships in frontmatter as ID arrays because *they travel with the file when an agent reads it cold*. Goanna's INDEX.md discipline confirms — indexes are derived artefacts, not authoritative state. From the Steakhouse blog: *"40% of RAG failures are not generation errors, but retrieval errors"* because chunks lack context. Frontmatter persists no matter how the body is sliced.

```yaml
---
slug: org-acme-corp
kind: org
# ... sextet fields ...

# Relationships — frontmatter is the source of truth
contacts: [contact-sarah-acme, contact-tom-acme]
projects: [project-acme-renewal-2024]
related_orgs: [org-globex-parent]   # parent corp
derived_from: [raw/jim2/cardfile-acme-2015.md, raw/xero/contact-acme.md]
---
```

On every write, the worker re-derives the `wiki_links` rows from frontmatter. Manual edits to frontmatter (via daemon sync) flow through the same path. `wiki_links` is for query performance only — never for canonical fact storage.

This also matches Karpathy's `INDEX.md`/`LOG.md` derived-from-content pattern: source files are the truth; indexes regenerate.

---

### Q3: Where does `derived_from` live?

**Answer**: In frontmatter as an array of source-archive IDs.

```yaml
derived_from:
  - raw/gmail/msg-18f3a1b
  - raw/xero/invoice-4421
  - raw/jim2/job-7892
```

Mirrored to `wiki_links` (kind: `derived_from`) for queryability, but frontmatter is authoritative. This means the file alone tells the provenance story — no DB join needed.

The format follows Karpathy's pattern: every wiki entry has provenance back to immutable raw/ archives. When the entry needs to be regenerated (schema change, extractor improvement), the agent re-reads the cited raw files.

---

### Q4: Frontmatter — what beyond the sextet?

**Answer (research-backed)**: The sextet stays as universal. Beyond it, frontmatter divides into three layers.

**Universal (every entry)**:
- `slug` — stable ID assigned at first observation, never changed
- `kind` — entry type (matches collection)
- `created`, `last_updated` — timestamps
- `last_edited_by` — agent or user slug
- `last_change_summary` — one-line why
- `schema_version` — integer; bumps when collection's required_fields_json changes

**Provenance + relationships (every typed entry)**:
- `derived_from: [...]` — source archive IDs (Q3)
- Collection-specific relationship fields (e.g. `org`, `contacts`, `projects`) per the collection schema (Q2)

**Status + lifecycle (Goanna-inherited)**:
- `status` — `active | stale | dormant | archived | stub` (drop a record from results when stale/archived; surface stubs as needing completion)
- `superseded_by` — slug of newer version (when a decision/commitment gets revised, OLD entry gets this + status:archived; NEW entry is the canonical one)
- `valid_from`, `valid_until` — temporal validity for fact-bearing entries (contact roles, billing arrangements)
- `pinned: bool` — manual relevance override
- `confidence: 0.0-1.0` — auto-generated extractor's confidence (review-required below threshold)
- `review_status` — `pending | approved | rejected` for entries flagged for human review

**Worth NOT adding**:
- Free-form `tags:` — Goanna and practitioners agree: *"be ruthlessly stingy with tags"*. Use frontmatter typed fields (`org:`, `vertical:`, `groups:`) instead. Tags reserved for genuinely cross-cutting attributes (`#urgent`, `#legal`).

### Engagement-trace primitive (entity records)

For entities that accumulate interactions (orgs, contacts, projects), the canonical client-memory shape is **the engagement trace**: one line per substantive interaction, four fields:

```
2026-05-28 / Sarah Smith (email) / agreed renewal terms 2024-2025 / msg-18f3a1b
```

| Field | Required | Note |
|---|---|---|
| **date** | yes | ISO date (or full timestamp if precision matters) |
| **actor (channel)** | yes — non-negotiable | Who did it, in parens which channel. *"The 'I did X' pattern collapses when several writers contribute."* |
| **verb-phrase with outcome** | yes | What happened + what changed |
| **reference ID** | yes | Link back to the raw archive (gmail msg ID, slack ts, doc URL) |

Lives in the entity's canonical file under `## Recent` (or in dated subfiles when there are too many). Multi-writer accumulating store — append, don't rewrite. Curator writes new traces; never edits old ones.

Three sizes of interaction record by complexity:
- **Trace** — one-liner, the default. Most interactions.
- **Touchpoint** — companion file (`notes/2026-05-28-sarah-quote-call.md`) when the interaction warrants a paragraph or two.
- **Deep narrative** — `sessions/<date>.md` for multi-hour multi-topic sessions worth full notes.

The agent picks the size based on the interaction. Default to traces; promote upward when the content earns it.

### Service-state, not single-status

For orgs (and any entity with multiple ongoing service relationships), don't collapse to a single `status:` field. A client relationship is a *bundle of services*, each with its own state:

```yaml
services:
  hosting: { state: active, since: 2024-03-15 }
  email: { state: managed, since: 2024-03-15 }
  domain: { state: managed, since: 2018-09-01 }
  seo: { state: dormant, last_active: 2023-11-01 }
  development: { state: project-driven }
```

Entity-level summary (e.g. *"active client"*) derives from the bundle, not the other way around. The dashboard shows the bundle when you click into an org; the org's `status:` field is the rollup.

This matters for the autonomy-default doctrine: when an agent decides "is this client active?", it queries the bundle. Single-status fields lose detail and force the agent to guess.

---

### Q5: Schema evolution

**Answer**: `schema_version` per entry + Goanna's cascade-refresh mode + immutable `raw/` as the safety net.

When a collection's `required_fields_json` changes:

1. Bump `wiki_collections.schema_version` (the collection-wide pointer)
2. Existing entries keep their old `schema_version` until touched
3. Librarian (or worker cron) runs **cascade-refresh** — walks old-schema entries, enriches each to new schema. This is one of Goanna's four librarian modes.
4. If a migration goes wrong, the immutable `raw/` archive lets the curator delete + regenerate `wiki/` entries from sources.

The dashboard surfaces "this entry is at schema_version 2; current is 4" rather than refusing to load. Soft-typed wiki, hard-typed migrations.

From the dev.to scaling piece: *"You're not starting from a blank directory — you're starting from a structural contract."* The schema lives in the collection's CLAUDE.md (path: `wiki/<collection>/CLAUDE.md`), defines page kinds, voice, contradiction policy, allowed frontmatter fields.

---

### Q6: Conflict file handling

**Answer (agent tries first; surfaces only the genuinely ambiguous)**: Per `agent-autonomy-default-2026-05-28.md`, the curator (or whichever agent is writing) attempts auto-resolution before surfacing.

**Auto-resolve when** any of these are true:
- The diff is formatting-only (whitespace, case, punctuation)
- One source is clearly authoritative AND newer (e.g. ABR > invoice body)
- The newer source has higher-tier provenance per the source-tier hierarchy
- Vectorize similarity confirms it's the same content with cosmetic edits

**Surface only when** the conflict survives auto-resolution AND the signals genuinely contradict. The surface is a *recommended resolution with sources*, not the raw disagreement.

The librarian principle "don't smooth over contradictions" still holds — but it's about how the resolved entry is written, not about who resolves. The resolved entry includes a `discrepancy:` block in the body noting the disagreement and how it was resolved. Trail stays in the wiki for forensics.

Operationally:
- `.conflict-<ts>` files persist (cheap, valuable for forensics)
- Curator's `resolve-conflict` skill runs auto-resolution first; queues for review only when auto-fail
- Dashboard's reconciliation queue shows the agent's *recommended action* + supporting signals; user approves or overrides
- Status field on the canonical entry transitions: `status: stale` while in the queue, `status: active` once resolved (auto or by user)

This connects to Karpathy's lint passes — orphan detection, broken-link detection, contradiction-spotting should run on every ingest, not just nightly. Most of what lint catches, the agent should be able to resolve without user input.

---

### Q7: Attachments vs companion files

**Answer (Goanna's thin-record + deep-folder symmetry)**: The canonical file is thin; the deep folder holds rich content.

| File | Role |
|---|---|
| `<canonical>.md` (e.g. `project.md`) | CRM-shape record — frontmatter + summary + key fields. ~30-80 lines. Indexed in `wiki_entries`. |
| `notes/<date>.md` | Companion files — dated working notes. Not indexed as separate entries; tracked in audit only. |
| `sessions/<date>.md` | Session narratives. Same treatment. |
| `attachments/<file>.pdf` | Binary attachments. Tracked in `wiki_attachments` (collection, slug, filename). |
| `images/<file>.png` | Visual companions. Tracked in `wiki_attachments`. |

The canonical file's body references its companions via relative links: `See [the May 2024 session notes](sessions/2024-05-12.md)`.

**Companion files are NOT indexed as separate wiki_entries.** This keeps the entries table tight. Vectorize embeds raw companion content (it's archival material). Wiki queries return the canonical file with companion references; agents can pull companions on demand.

---

### Q8: Vectorize granularity

**Answer (research-backed)**: Per-entry for `wiki/`; chunked for `raw/`.

The structured-shaped bet:
- `wiki/` entries are typed entities. Each entry IS the semantic unit. One vector per entry, embedded on the body + frontmatter summary.
- `raw/` entries are arbitrary-length source documents (full emails, doc imports, transcripts). Section-split with overflow; each chunk vectorised separately. Chunk metadata carries the parent raw-file ID.

Wiki search returns a typed entry. If the agent wants context, it follows `derived_from:` into raw and retrieves the cited chunks. Two queries, not one — but the first one is the "what's relevant" question; the second is the "show me the original" question.

This matches the tiered loading from Part 4. Karpathy + the agentwiki.org common-failure-modes piece both endorse this split.

---

### Q9: Reconciliation surface (the hardest piece)

**Answer (multi-part, Goanna-informed)**: 

The pieces — D1 queue, dashboard panel, MCP merge action — are right. What was missing from my earlier sketch is the **judgment discipline** Goanna codified:

#### 9a. Peer-record vs umbrella rule (agent investigates first)

When a "duplicate" is detected, the first question isn't "merge or not" — it's "are these the same entity or two related entities?"

- **Peer record** (separate folder) when the cortex owner's service relationship is **independent** — separate domain, separate hosting account, separate support history
- **Umbrella section** (section inside parent record) when legally distinct but **operationally unified** — shared domain, shared hosting, shared support footprint

**The agent investigates the signals before asking** (per `agent-autonomy-default-2026-05-28.md`):
- Are there separate domains? (DNS lookup, Rocket sites query, Synergy domain query via MCP)
- Are there separate billing contacts in the accounting system? (Xero contacts MCP)
- Are there separate cardfiles in the ERP? (Jim2 cardfiles MCP)
- Is there separate support history? (D1 query: projects/tasks per slug)

If signals consistently indicate **separate** service relationships → peer records. If they consistently indicate **operationally unified** → umbrella section. Only when signals **conflict** does the agent surface — with a recommended call (e.g. "Recommend peer records; 3 of 4 signals support separate relationships; the shared Xero contact is the only counter-signal").

Cross-link shape: each peer record carries a `related_entities:` field naming the relationship (`"sister Pty Ltd, same primary contact, shared accounting account"`).

#### 9b. ABN-first aggregation (Australian context — adapt for non-AU)

When counting "how many distinct businesses do we work with", count by **ABN, not domain**. Multi-trading-name umbrellas + dormant-ABN-domain patterns + sister-Pty-Ltd structures inflate domain counts.

In reports + dashboards, report both:
- `distinct_domains:` — raw technical-surface count (for hosting/DNS scope)
- `distinct_businesses:` — ABN-verified unique entity count (for fleet-size + vertical analysis)

#### 9c. ABR-verify-first discipline

From Goanna's `feedback-abr-verify-first.md`: **never propagate a cluster hypothesis or write a `vertical:` / `groups:` tag without ABR-verification first**. Portfolio listing or invoice body text is a *lead*, not ground truth.

Implementation: curator's extraction pipeline includes an ABR-lookup step for new Org entries (via the `australia_business` MCP tool). Without ABR confirmation, the entry stays at `status: stub` and the `vertical:` field stays empty.

#### 9d. Merge action

When peer-vs-umbrella + ABR confirm a real duplicate (e.g. `orgs/acme-corp` and `orgs/acme-corporation` are the same ABN, same trading name, same domain ownership), the merge:
1. Moves `wiki_links` from duplicate to primary
2. Appends duplicate's slug to primary's `aliases: []`
3. Appends duplicate's `derived_from` to primary's
4. Sets duplicate's `superseded_by: <primary>` and `status: archived`
5. Audits the merge with `why:` field

Duplicate entry persists (soft-delete). Future queries for either slug return the primary. Old slug stays in `aliases:` so external references don't break.

**Threshold for auto-merge** (per `agent-autonomy-default-2026-05-28.md`):
- Confidence ≥0.85 AND any of: (ABR-verified match) OR (shared canonical domain) OR (shared accounting-system contact ID) → auto-merge
- Confidence 0.6-0.85 → queue with **recommended action** ("merge as duplicate" / "keep separate as sisters" / "keep separate as unrelated") + supporting signals. User approves a recommendation; they don't solve from scratch.
- Confidence <0.6 → queue with the recommendation flagged as "low confidence" so the user investigates more closely

The reconciliation queue is where the agent surfaces its own work for review — not where it asks the user to do the reconciliation. Most merges go through automatically; only the genuinely-ambiguous tail gets queued.

---

## Part 6 — Schema-as-emergence with 1/2/3/4+ thresholds (universal)

Goanna applies the same instance-threshold rule **identically** across multiple kinds of schema. This is the *schema-as-emergence* doctrine — pre-designed schemas drift; schemas earned from 3+ instances of the same shape stick.

| Domain | n=1 | n=2 | n=3 | n=4+ |
|---|---|---|---|---|
| **Entity field** | Capture inline as prose in body | Extract to frontmatter | Promote to required field in collection schema | Schema-fundamental; cascade-refresh older entries |
| **Watching brief → wiki/knowledge/** | Capture as finding or in entity body | Still watching; second confirmation | Promote to `wiki/knowledge/<topic>/concept.md` | Concept earns its place; cite in related concepts |
| **Skill** | Note in journal | Note + light SOP in journal | Author `skills/<name>/SKILL.md` before iteration 4 | Skill is canonical; sibling agents reference it |
| **Group-index file** | n/a | n/a | n/a | At 4+ instances mint `_<topic>-group.md`; at 15+ milestone; at 20+ consolidation |

**The rule across all four**: don't pre-author for hypothetical patterns. Wait for the third instance, then promote. *"Pre-designed schemas drift. Schemas earned from 3+ instances of the same shape stick."*

Exception: **upstream-confirmed at n=1.** When a single instance is architectural reality verified against an authoritative source (vendor docs, ABR, regulatory standard), promote immediately. Don't wait for false confirmations.

This is curator + librarian judgment, not pure auto-counting. The `relevance_score` from Part 2 is a *machine* hint that helps prioritise *agent* judgment — not a replacement for it.

The combined model for Office Town:

| Signal | Where it lives | Drives |
|---|---|---|
| `relevance_score` | `wiki_entries` column, auto-computed from references_in + query_hits + recency + pinned | Worker-side gating: which Inbox entries get Tier-2 LLM extraction; which raw chunks get re-embedded |
| Watching brief | A `findings/` markdown note in the relevant agent or collection | Curator + librarian judgment: which 1-instance observations get captured + escalated |
| Promotion to `wiki/knowledge/` | Librarian's deliberate write at n≥3 (or n=1 upstream-confirmed) | Canonical doctrine; reads by all agents on warm-up |

The auto-score makes the system *efficient*. The watching brief discipline keeps it *thoughtful*. They're not the same mechanism; they complement.

---

## Part 7 — Librarian's four modes (inherited from Goanna)

Office Town's librarian should operate in the same four modes Goanna's does (`agents/librarian/CLAUDE.md`):

| Mode | When | What librarian does |
|---|---|---|
| **Reactive (1B)** | Inbox has briefs, curator filed findings, user surfaced something | Process inbox, promote findings, write the record |
| **Bootstrap (1A)** | Inbox empty, but thin records exist in `wiki/contacts/` or `wiki/orgs/` | Deepen the next under-developed record from existing context |
| **Quiet-cycle hygiene (1C)** | Nothing in bootstrap | Stale audit (records >90d unchanged), broken-link sweep, archive resolved findings, lint passes |
| **Cascade-refresh (1D)** | `schema_version` bumped on a collection | Walk old-schema records, enrich each to new schema |

The cadence shape (also inherited): main cycle every 30 min always-on, weekly curate cycle (Thursday 14:00), monthly contacts audit. Curator-load coupling: when curator is heavy, fire main cycle more tightly (every 10-15 min) until curator quiets.

When we implement the cron execution loop on Office Town's worker, these modes are the recipes the librarian invokes.

---

## Part 8 — Discipline rules inherited from Goanna

Five rules that have proven load-bearing in Goanna's substrate:

### 1. "A note without links is a bug"

Enforce at write-time via a `PostToolUse` hook or worker-side validation. Orphan notes are how vaults rot. Every wiki entry must either declare relationships in frontmatter OR be a deliberate hub entry (which is itself linked-to from elsewhere).

### 2. Stable slug IDs assigned at first observation, never changed

Once `contact:jeremy-dawes` is observed, that slug is permanent. Rename has 200 backlinks to fix. From research: *"Public links rot. Internal IDs don't. Don't link by URL or filename; link by entity ID."*

### 3. Append, don't edit, for facts with provenance

Decisions, commitments, status changes get *new* dated files OR new entries in a `history:` block — not silent overwrites. Editing in place destroys the audit trail that makes business knowledge useful.

Concretely: a contact's role changes from "primary billing" to "former billing"? Don't overwrite. Add to history with `valid_from`/`valid_until`. Set new entry as current.

### 4. The schema is the most important file in the system

Karpathy: *"You spend an hour iterating with the LLM on schema.md and that hour determines everything else."* Goanna concurs — librarian owns the collection schemas.

For Office Town: each collection has a `wiki/<collection>/CLAUDE.md` declaring its shape. Worker reads it; curator reads it; librarian owns it. When the schema changes, cascade-refresh kicks in.

### 5. Don't ask the agent to do invariant-enforcement

Indexes, link integrity, orphan detection, schema-compliance checks — all deterministic operations done by tooling (the worker, a Workflow), not the agent. The agent is for judgment; the script is for precision. Matches the existing `trust-skills-not-elaborate-code.md` rule.

In Office Town this means:
- `INDEX.md` and `LOG.md` regenerated by worker cron from D1
- `wiki_links` derived from frontmatter on every write
- Orphan + broken-link detection runs nightly (worker scheduled handler)
- Schema-compliance checked at PUT time, surfaced in dashboard

### 6. No archive folders, ever

Goanna's `docs/HYGIENE.md` rule: the activity log is the audit trail. Ephemeral content is **deleted** when terminal, **never moved to an archive folder**. Before deleting, the "graduation check":

> Is anything in this ephemeral file evergreen?
> - If yes — promote to reference (knowledge, decision, finding, skill)
> - If no — delete clean

Why no archive folders: they become sinks (Part 3's gravity-wells failure mode). Content lands there because "we might need it" and never comes back out. `wiki_audit` already holds the trail of every write; the body of an entry with `status: archived` already holds historical state. Archive folders add a third location that's neither current nor audited — and the agent can't tell when to read it.

This is also why Office Town's `.conflict-<ts>` files persist forever — they're *forensic*, not *archived*. Different role.

### 7. The skill body template (universal)

When an Office Town skill (or recipe) is authored, it follows a fixed body shape inherited from Goanna's `templates/skill/SKILL.md`:

```markdown
---
description: "<load-bearing description — leads with the trigger>"
---

## When to invoke
<concrete triggers as bullets/table, including negative cases>

## Procedure
<numbered steps; each is one observable action>

## Non-obvious disciplines
<ONLY when there's a genuine non-obvious trap — skip the section otherwise>

## Composition with other skills
<table of what this replaces / pairs with>

## Verification
<checklist; concrete signals you can check>

## See also
<related skills + concepts>

## Last updated
<date + change summary>
```

The 3-instance threshold from Part 6 applies: don't author a skill for hypothetical patterns. After three instances of the same procedural shape, write the SKILL.md before iteration four.

### 8. Manufactured work is the recurring meta-failure

Goanna names this explicitly across multiple docs (FRAMEWORK, SPECIALIST, RHYTHMS, HYGIENE):

> If you catch yourself making work — posting low-signal status, drafting unprompted, inventing tasks to look busy — end the cycle.

Operationally: every cycle must produce one of:
- A new file (entry, finding, brief, skill, decision)
- An update (existing entry, status, INDEX.md)
- A "nothing to act on, X stable, because..." memo with reasoning

The verbal signature of plateau: *"still monitoring X"*, *"watching for further developments"*, *"continuing to track"*. If the cycle's output is empty, exit cleanly — don't pad. Plateau ≠ silence.

This is the autonomy-default doctrine paired with anti-coasting: agents act when there's signal, exit when there isn't. They don't pad to look productive.

---

## Part 9 — Updated build sequence

With research-backed answers in hand, the build sequence sharpens:

### Foundation (Session 1)

1. Establish `wiki_collections` schemas for the starter set: `inbox`, `orgs`, `contacts`, `projects`, `decisions`, `knowledge`
2. Each collection's `CLAUDE.md` declares its schema (kind, required fields, voice, contradiction policy, allowed subfolders)
3. Build `/api/ingest` (Phase A): accepts `{content, target_collection, target_slug}`, runs Workers AI extractor against the collection's schema, writes via unified write path
4. Add `wiki/raw/` collection (Karpathy spine) — immutable append-only archive

### Curator + first source (Session 2)

5. Define Curator subagent in `office-town-plugin/recipes/curator.yaml` — system prompt + tool whitelist + default skills
6. Ship `office-town:curate-inbox` skill (the minimum viable: pulls from one source, stages to Inbox, calls /api/ingest)
7. Demo: user installs Gmail MCP in their Goose; says "curator, pull this morning's emails"; sees Inbox entries appear with `derived_from:` pointing into `raw/gmail/`

### Provenance + relevance (Session 3)

8. Add `relevance_score` column + sub-signal columns to `wiki_entries`
9. Add `schema_version`, `status`, `superseded_by`, `valid_from`/`valid_until` to the universal frontmatter
10. Implement worker-side derivation of `wiki_links` from frontmatter
11. Ship `office-town:cite-source` skill (adds derived_from to any auto-generated entry)

### Reconciliation (Session 4 — the hard one)

12. Ship `office-town:reconcile-org` skill — Vectorize similarity check + ABN-lookup via `australia_business` MCP + dashboard prompt for peer-vs-umbrella judgment
13. Build the dashboard reconciliation queue (D1 table + UI panel)
14. Implement `wiki(action:merge_entries)` MCP action

### Lint + librarian modes (Session 5)

15. Cron execution loop on worker
16. Lint pass cron job (orphan detection, broken links, schema compliance) running on every ingest cycle
17. Librarian's 4 modes wired as cron-callable skills
18. INDEX.md + LOG.md auto-regen from D1

### Cascade + temporal (Session 6)

19. `schema_version` cascade-refresh skill
20. As-of-date dashboard toggle (temporal lookup via `wiki_audit`)

After Session 6, we have a working minimum-viable cortex with structured ingestion + reconciliation + temporal validity + provenance.

### Sessions 7+

Tier 1 ETL extractors (Xero, Jim2, GitHub, Rocket, Synergy) follow naturally — each is half a session of curator skill + worker-side extractor. Skills bundle expands. Watching-brief patterns start to accumulate.

---

## Related docs

- `cortex-pattern-2026-05-28.md` — the why (strategic framing, the moat)
- `curator-pattern-2026-05-28.md` — the agent-side architecture
- `structure-shaped-ingestion-2026-05-28.md` — the worker-side write pipeline
- `openhuman-research-2026-05-28.md` — patterns we're adopting (relevance, derived_from, content-hash IDs)
- `unified-write-path-2026-05-28.md` — write architecture foundation
- `research-wiki-for-agents-2026-05-28.md` — Karpathy + Obsidian-AI community findings
- Goanna substrate (read 2026-05-28): `docs/CURATION.md`, `agents/librarian/CLAUDE.md`, `agents/librarian/facts/*.md`
