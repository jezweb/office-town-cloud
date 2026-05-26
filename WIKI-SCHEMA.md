# Wiki Schema

The Office Town wiki collections, their conventions, and how the schema evolves over time.

## Default collections (v1)

When a deployment first installs Office Town, the wiki ships with 10 collections. The librarian owns `wiki/AGENTS.md` which documents what each collection holds. Agents read this on every session start.

| Collection | Purpose | Shape | Lifecycle |
|---|---|---|---|
| `contacts/` | External people the team interacts with | `<slug>/contact.md` per person | Persistent + superseded |
| `orgs/` | External organizations | `<slug>/entity.md` per org | Persistent + superseded |
| `projects/` | Work in flight or recently delivered | `<slug>/project.md` (+ optional plans/, sessions/, research/) | Active → archived |
| `knowledge/` | Portable patterns and concepts | `<topic>/concept.md` per pattern | Persistent (graduated from findings/) |
| `decisions/` | ADRs (Architecture Decision Records) | `<NNNN-slug>/decision.md` with numbered prefix | Persistent + status (active/superseded/deprecated) |
| `team/` | Humans + agent roster | Mixed: `humans/<slug>.md` + `agents/<slug>.md` | Persistent |
| `owner/` | The principal user — voice, preferences, history | Flat files: `voice.md`, `rhythm.md`, `expertise.md`, etc. | Stable reference |
| `templates/` | Page-shape templates for the above | One file per entity type | Stable reference |
| `signals/` | Scout's outward observations | Dated stream: `YYYY-MM-DD-<topic>.md` | Append-only |
| `strategy/` | Boss's strategic direction notes | Dated + tagged: `YYYY-MM-DD-<topic>.md` | Persistent + status |

## Universal conventions

### File-level conventions

- **All files have YAML frontmatter** with at minimum:
  ```yaml
  ---
  slug: kebab-case-identifier
  last_updated: 2026-05-26
  last_edited_by: librarian | boss | worker | scout | user
  last_change_summary: "brief description of what changed"
  ---
  ```
- **Filenames use kebab-case** (lowercase, hyphens)
- **Date-stamped files** use `YYYY-MM-DD-<topic>.md` format
- **Entity-as-folder collections** have one canonical filename per entity:
  - `contacts/<slug>/contact.md`
  - `orgs/<slug>/entity.md`
  - `knowledge/<slug>/concept.md`
  - `projects/<slug>/project.md`
  - `decisions/<NNNN-slug>/decision.md`

### Index conventions

- `INDEX.md` per collection — worker-managed, regenerates every 15 minutes
- `_intro.md` per collection (optional) — human-written purpose statement
- `wiki/AGENTS.md` — the schema document (this file's content goes here)

### Cross-reference conventions

- Frontmatter `org_slug:` on contacts to link to orgs
- Frontmatter `team[]:` on projects to list contact slugs
- Frontmatter `affects[]:` on decisions to list project slugs
- Frontmatter `derived_from:` on knowledge entries to cite source findings
- Body links use `[slug](../<collection>/<slug>/)` or `@slug` shorthand

## Per-collection schemas

### `contacts/<slug>/contact.md`

```yaml
---
slug: jane-doe
name: Jane Doe
email: jane@example.com
phone: +61 412 345 678
org_slug: example-corp
role: CTO
last_contacted: 2026-05-20
tags: [client, technical]
last_updated: 2026-05-26
last_edited_by: librarian
last_change_summary: "Added LinkedIn URL"
---

# Jane Doe

Brief one-paragraph context. What we know. Recent interactions.

## Background
...
## Connections
- See @example-corp
- Met via @robert-smith
## Recent thread
- 2026-05-20 — Discussed migration timeline
```

### `orgs/<slug>/entity.md`

```yaml
---
slug: example-corp
name: Example Corp
type: client | partner | competitor | vendor | other
primary_domain: example.com
secondary_domains: [example.net, example.io]
locality: Sydney, Australia
business_type: SME
services_offered: [hosting, consulting]
relationship: active | prospect | former
last_updated: 2026-05-26
last_edited_by: librarian
last_change_summary: "Updated business type"
---

# Example Corp

What they do. Why they matter. Key people.

## Key people
- @jane-doe (CTO)
- @robert-smith (CEO)

## Active projects
- @example-redesign-2026
```

### `projects/<slug>/project.md`

```yaml
---
slug: example-redesign-2026
type: project
status: active | paused | done | archived
opened: 2026-04-01
closed: null
owner: librarian | worker | external
client: example-corp
team: [jane-doe, worker]
budget: ...
last_updated: 2026-05-26
last_edited_by: boss
last_change_summary: "Phase 2 started"
---

# Example Redesign 2026

One-paragraph description.

## Plan
See plans/2026-05-01-design-plan.md

## Status
Phase 1 done. Phase 2 in progress.
```

Optional sub-folders inside a project folder:

- `plans/` — design docs, RFCs
- `sessions/` — multi-session narrative logs
- `research/` — investigations
- `findings/` — surfaced patterns (graduate to wiki/knowledge if portable)
- `notes/` — ad-hoc working notes

### `knowledge/<slug>/concept.md`

```yaml
---
slug: cloudflare-vectorize-metadata-order
type: knowledge
status: active | superseded | deprecated
domain: technical | business | both
derived_from: [agents/worker/findings/2026-05-10-vectorize-bug.md]
tags: [cloudflare, vectorize, gotcha]
last_updated: 2026-05-26
last_edited_by: librarian
last_change_summary: "Promoted from findings/"
---

# Cloudflare Vectorize metadata index ordering

## The gotcha
Vectorize metadata indexes must be created BEFORE inserting any vectors. Existing vectors are NOT retroactively indexed.

## Fix
[detailed explanation]
```

### `decisions/<NNNN-slug>/decision.md`

```yaml
---
slug: 0001-adopt-agents-md
date: 2026-05-26
domain: technical
decided_by: jez
status: accepted | superseded | deprecated
source: discussion-with-claude-2026-05-26
last_updated: 2026-05-26
last_edited_by: librarian
last_change_summary: "Initial decision"
---

# 0001. Adopt AGENTS.md as the file convention

## Context
We need a single file convention for per-place agent context.

## Decision
Use AGENTS.md as primary (cross-tool standard at agents.md).

## Alternatives considered
- CLAUDE.md (Claude-specific)
- .goosehints (Goose's legacy)

## Consequences
- Cross-tool compatibility with Cursor, Aider
- One-line CLAUDE.md pointer maintains Claude Code support
```

### `team/humans/<slug>.md`

```yaml
---
slug: jez
type: human
role: principal-user | team-member | client
last_updated: 2026-05-26
last_edited_by: librarian
---

# Jez (Jeremy Dawes)
CEO of Jezweb. Primary user of this town.
See wiki/owner/ for deep context.
```

### `team/agents/<slug>.md`

```yaml
---
slug: librarian
type: agent
role: librarian
building: library
status: active
last_updated: 2026-05-26
last_edited_by: librarian
---

# Librarian (agent)
Configured at: ~/.agents/agents/librarian.md
Building: buildings/library
```

### `owner/<aspect>.md`

```yaml
---
about: jez
aspect: voice
slug: voice
last_updated: 2026-05-26
last_edited_by: librarian
---

# Jez's voice
Australian English. Warm and direct. No em dashes. Concise.
```

Aspects: `voice.md`, `rhythm.md`, `expertise.md`, `goals.md`, `values.md`, `opinions.md`, etc.

### `signals/<date>-<topic>.md`

```yaml
---
slug: 2026-05-26-ai-search-launched
date: 2026-05-26
type: signal
source: scout
url: https://blog.cloudflare.com/ai-search-agent-primitive/
tags: [cloudflare, search, ai]
status: open | flagged | promoted
last_updated: 2026-05-26
last_edited_by: scout
---

# Cloudflare launched AI Search

[scout's observation + so-what analysis]
```

### `strategy/<date>-<topic>.md`

```yaml
---
slug: 2026-05-26-office-town-architecture
date: 2026-05-26
type: strategy
domain: product | business | technical
status: active | superseded
last_updated: 2026-05-26
last_edited_by: boss
---

# Office Town product architecture

[strategic finding with rationale]
```

## Lifecycle by collection

| Collection | When to update | When to archive |
|---|---|---|
| `contacts/`, `orgs/` | In place; supersession via frontmatter | Archive folder when relationship ends |
| `knowledge/` | In place; supersession + status field | `status: superseded` with `superseded_by:` pointer |
| `decisions/` | Append `superseded` status; new decision references old | Never delete — decisions are audit trail |
| `projects/` | Move to `projects/archive/` when status=archived | When `closed` date is past + status=archived |
| `team/` | In place — humans/agents change over time | Mark `status: inactive` for departed |
| `owner/` | In place — single-owner, evolves with the user | Never archived |
| `templates/` | In place — schema evolution | Versioned via frontmatter |
| `signals/` | Append-only — dated entries | Trim oldest entries >12 months for performance if needed |
| `strategy/` | Append + status changes | Same as signals |

## How collections grow

Three growth paths:

1. **Librarian-driven extraction** — librarian reaches into email/CRM/scrape/files → normalises → files in the right collection. Highest volume.
2. **Agent-finding promotion** — agents drop findings in their building's `findings/` folder → librarian reads across siblings → promotes patterns to `wiki/knowledge/`. Medium volume.
3. **User-direct edits** — user (or any agent) edits a wiki file directly. Lowest volume; for `owner/voice` changes, manual corrections.

## Adding a new collection

A deployment-specific need may justify a new collection (e.g., `properties/` for businesses that manage many websites). Process:

1. Confirm it doesn't fit an existing collection (the librarian advises)
2. Call `wiki.register_collection(name, description, convention, purpose)` via the MCP
3. The tool:
   - Creates the folder under R2
   - Updates `wiki/AGENTS.md` with the schema entry
   - Creates an `INDEX.md` placeholder
   - Logs the addition to the activity log
4. Document the per-collection schema (frontmatter, body shape) in the schema doc

## Vocabulary discipline

- Use canonical tags from `wiki/_tags.md` (if present); create new tags sparingly
- Use canonical entity slugs — don't create `jane-doe` and `j-doe` for the same person
- Cross-link liberally — every entity should reference at least one other

## Audit trail

Every wiki write produces an entry in the activity log (D1 `activity_log` table):
- Timestamp
- Actor (agent name or 'user')
- Action (create / update / delete / archive / supersede)
- Resource (collection + slug)
- Change summary (from frontmatter)

This lets the librarian (and the user) review what changed when.
