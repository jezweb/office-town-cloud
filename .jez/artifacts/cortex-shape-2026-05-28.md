# Cortex Shape — Roles, Naming, Structure

**Date**: 2026-05-28
**Status**: Design proposal. Companion to `cortex-pattern-2026-05-28.md` (the why) and `curator-pattern-2026-05-28.md` (the how). This doc covers the *what shape* — agent roles, the right word for "hotness", and the open structural questions about folders, frontmatter, links, schema evolution.

Some parts of this doc await synthesis from two research dispatches (running 2026-05-28): one to Goanna's librarian for hard-won lessons, one to a general-purpose agent for Karpathy + Obsidian-AI community patterns. Findings will be folded in once they return.

---

## Part 1 — Roles, redefined

The Curator joins the existing lineup. With it, the role boundaries need to be clean so the agents don't drift into doing each other's jobs. The clarifying principle: **each role faces a different direction, with a different primary verb.**

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

## Part 3 — Open structural questions

The cortex's shape isn't yet fully designed. Here's the open question list — research findings will inform the answers. Where I have a current lean, I've named it.

### Q1: Folder layout per collection

Three shapes appeared in the substrate-conventions rule:

- **Entity-as-folder** — `wiki/<collection>/<slug>/<canonical>.md` plus subfolders. For things with companion files (orgs, contacts, projects, decisions).
- **Dated stream** — `wiki/<collection>/YYYY-MM-DD-<topic>.md`. For broadcasts, research notes, sessions.
- **Flat topic** — `wiki/<collection>/<topic>.md`. For owner-only, secrets, business-config.

Open questions:
- Should the Inbox collection use content-hash IDs (`wiki/inbox/<sha-prefix>/<id>.md`) or dated (`wiki/inbox/YYYY-MM-DD/<id>.md`)? **My lean**: sha-prefix because Inbox is deduped by content, not chronology.
- Subfolders inside an entity-as-folder (notes/, sessions/, research/, attachments/) — do we standardise the set per collection (in `wiki_collections.config_json`)? **My lean**: yes, list allowed subfolders per collection.
- Is there a "generated" folder convention (`.generated/`, `_derived/`) for auto-summaries, or should derived content live inline with provenance? **My lean**: inline with `derived_from:` frontmatter — fewer paths to navigate, audit log gives history.

### Q2: Relationships in frontmatter vs `wiki_links` table

Three viable representations:

| Approach | Pro | Con |
|---|---|---|
| Only frontmatter (`related_to: [proj-acme, contact-sarah]`) | Human-readable, portable, git-diffable | DB queries require parsing markdown |
| Only `wiki_links` table | Query-efficient | Wiki entry file alone doesn't show relationships |
| Both, frontmatter as source of truth | Best of both | Sync burden, drift risk |
| Both, `wiki_links` as source of truth | Best of both | Frontmatter can lie; readers can be misled |

**My lean**: both, with **`wiki_links` as source of truth and frontmatter as a generated view**. Worker derives frontmatter `links:` block from `wiki_links` on every write. Users edit frontmatter; daemon round-trips through worker; worker updates `wiki_links` to match. Conflicts (manual frontmatter edit vs DB) resolve by re-deriving from DB.

This makes a single-line write to `wiki_links` (e.g. by Curator) immediately visible in the frontmatter on next read, without requiring frontmatter manipulation. Cleaner than two write paths.

Waiting on research for what others do here — Obsidian's `[[wiki-link]]` body syntax is one answer, dedicated databases (Dendron, Foam) are another.

### Q3: Where does `derived_from` live?

Two clean options:
- In frontmatter: `derived_from: [inbox/abc123, gmail/thread-456]`
- In a `wiki_derived_from` table

Frontmatter has the advantage that the file alone tells the provenance story (no DB join needed to know "where did this entry come from"). It's also human-readable.

**My lean**: frontmatter as primary, mirrored to `wiki_links` with edge kind `derived_from` for queryability. Same dual-representation pattern as Q2.

### Q4: Frontmatter — what beyond the sextet?

Current sextet: `slug, kind, created, last_updated, last_edited_by, last_change_summary`.

Candidates worth standardising:
- `tags: [...]` — free-form tags (curator may add, user may edit)
- `links: {...}` — auto-derived from `wiki_links` (Q2 decision)
- `derived_from: [...]` — provenance (Q3 decision)
- `valid_from`, `valid_until` — temporal validity for fact-bearing entries
- `pinned: bool` — manual relevance override
- `confidence: 0.0-1.0` — for auto-generated entries, how confident is the extractor
- `review_status: pending|approved|rejected` — for entries needing human review

Waiting on research for which of these prove load-bearing vs which add noise.

### Q5: Schema evolution

`wiki_collections.required_fields_json` defines the expected shape for each collection. When the schema changes (we add a field, rename one, change a required → optional), existing entries don't auto-update.

Options:
1. **Migration scripts per change** — invasive but explicit
2. **Lazy migration on next write** — entry updates when touched
3. **Versioned schemas** — each collection has a schema_version; entries declare which version they're compliant with
4. **Sentinel-based extension** — add new fields freely; only break entries that violate hard constraints; surface "incomplete entry" in dashboard

**My lean**: option 4 (sentinel-based extension) for the dashboard UX, with option 2 (lazy migration on next write) as the cleanup mechanism. Treat the wiki as soft-typed; let the dashboard surface "this entry doesn't have field X yet" rather than refusing to load it.

### Q6: Conflict file handling

Today `.conflict-<ts>.md` files sit beside the canonical entry. They're real files in R2 + a row in the manifest. They're invisible to `wiki_entries` (the indexer skips non-canonical files).

Questions:
- Should conflicts surface in the dashboard (a "needs reconciliation" panel)?
- Should curator have a `resolve-conflict` skill that picks one + writes the merge?
- Lifecycle: do conflict files auto-expire after N days, or stay forever?

**My lean**: dashboard surfaces them (it's the surface where humans can compare side-by-side), curator gets a skill to assist, conflict files persist forever (cheap, valuable for forensics).

### Q7: Attachments vs companion files

Inside `wiki/projects/<slug>/`, what's the rule for:
- `project.md` (canonical) — always
- `notes/<date>.md` — companion files
- `attachments/contract.pdf` — binary attachments
- `images/diagram.png` — visual companions

Currently `wiki_attachments` table tracks binaries per (collection, slug). Do we expand it to track non-canonical markdown companions too? Or do we keep companions purely in R2 + audit, and only index the canonical?

**My lean**: index only canonical in `wiki_entries`. Companions are in R2 + audit but not query-targeted. The canonical file's body or links can reference its companions. Keeps the entries table tight.

### Q8: Vectorize granularity

For semantic search, do we embed:
- Per-entry whole body (one vector per entry)
- Per-section (split on headings)
- Per-paragraph
- Some mix (whole-body for short entries, sectioned for long)

**My lean**: per-entry for canonical files (the entry IS the semantic unit). For Inbox entries (which may be raw long emails), section-split with overflow. The structured-shaped bet says we don't need fine-grained chunking because the structure IS the index — vector search is the "search lookup" projection, not the primary recall path.

### Q9: Reconciliation surface

When the curator detects two entries that might be the same entity (e.g. `orgs/acme-corp` and `orgs/acme-corporation`), how does that get resolved?

Pieces needed:
- A `reconcile-candidates` queue (D1 table)
- A dashboard panel showing pairs with similarity score + key fields side-by-side
- A `wiki(action:merge_entries, primary, duplicate)` MCP action that:
  - Moves wiki_links from duplicate to primary
  - Adds duplicate's slug to primary's `aliases: []`
  - Adds duplicate's `derived_from` to primary's
  - Marks duplicate as `merged_into: <primary>` (soft-delete; entry stays but redirects)
  - Audits the merge

This is genuinely the hardest piece of the cortex. Worth its own design pass once we hit it.

---

## Part 4 — What to land first

Given the research is still arriving and structural decisions are pending, here's the safest first build:

1. **Land the Curator role definition + curate-inbox skill** in office-town-plugin. This is concrete and unblocks everything else. (`curator-pattern-2026-05-28.md` Phase A.)
2. **Build `/api/ingest`** with a fixed schema for one collection (start: `inbox`). Single-collection extract, no router yet.
3. **Rename hotness → relevance** in the design notes (this doc + cortex-pattern). When the relevance_score column gets added to wiki_entries, use the new name from day one.
4. **Defer Q1-Q9 decisions** to a separate design session once research synthesis is in. We can build with sensible defaults (my leans above) and refine.

The roles are stable enough to build against today. The structural fine-tuning happens once Karpathy/Obsidian-AI research and Goanna's hard-won lessons land.

---

## Related docs

- `cortex-pattern-2026-05-28.md` — the why (strategic framing, the moat)
- `curator-pattern-2026-05-28.md` — the agent-side architecture
- `structure-shaped-ingestion-2026-05-28.md` — the worker-side write pipeline
- `openhuman-research-2026-05-28.md` — patterns we're adopting (hotness/relevance, derived_from, content-hash IDs)
- `unified-write-path-2026-05-28.md` — write architecture foundation
- (pending) `research-wiki-for-agents-2026-05-28.md` — Karpathy + Obsidian-AI community findings
- (pending) Goanna librarian's brief on hard-won lessons
