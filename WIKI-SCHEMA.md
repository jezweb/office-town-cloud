# Wiki Schema

The Office Town wiki collections, their conventions, and how the schema evolves over time.

## Design principles

1. **Lean defaults, opt-in extras.** Ship 10 active collections, not 20 empty ones. Empty collections look professional and feel hollow within a week.
2. **Frontmatter discrimination over folder proliferation.** An org is an org — whether it's a client, vendor, or competitor is metadata, not folder structure.
3. **Graduation pipeline is first-class.** Raw observation → finding → wiki entry. This is the librarian's growth loop, not a chore.
4. **Worker-managed indexes scale better than human-curated ones.** Once a collection passes ~50 entries, the INDEX.md should be auto-generated.
5. **Conventions earn their place.** New collections require deliberation (3+ instances justify a folder); new frontmatter fields are promoted to canonical when 3+ agents use them independently.

## v1 default collections — every town ships with these

| # | Collection | Purpose | Shape | Lifecycle |
|---|---|---|---|---|
| 1 | `business/` | The install's own business — identity, taxonomies, strategy, finances pointer | Flat-topic, deep folder | Persistent + supersedable |
| 2 | `owner/` | The principal user — voice, rhythm, expertise, opinions, tooling | Flat-topic (`voice.md`, `rhythm.md`, etc.) | Stable reference |
| 3 | `contacts/` | External people | Entity-as-folder (`<slug>/contact.md`) | Persistent + supersedable |
| 4 | `orgs/` | External organisations (clients, prospects, vendors, partners, competitors) | Entity-as-folder (`<slug>/entity.md`) | Persistent + supersedable |
| 5 | `projects/` | Bounded work with outcomes | Entity-as-folder + earned sub-folders (`plans/`, `sessions/`, `research/`, `notes/`) | Active → done → archived |
| 6 | `knowledge/` | Portable patterns graduated from findings | Entity-as-folder (`<topic>/concept.md`) | Persistent + status (active/superseded/deprecated) |
| 7 | `decisions/` | ADRs — choices made with rationale | `<NNNN-slug>/decision.md` (numbered) | Append-only |
| 8 | ~~`broadcasts/`~~ — **dropped** | ~~Fleet-wide announcements~~ — replaced by per-recipient inbox routing | — | — |
| 9 | `team/` | Internal staff + agent roster | Mixed (`humans/<slug>.md`, `agents/<slug>.md`) | Persistent |
| 10 | `templates/` | Page-shape templates for each collection | Flat (one file per entity type) | Stable reference |

Plus root-level meta:
- `INDEX.md` — worker-managed manifest across all collections
- `AGENTS.md` — schema doc (this file's content); agents read on session start

## Add-on packs — install when the deployment needs them

Each pack is an `office-town-pack-<name>` plugin. Installing adds the collection folder + its schema + templates + relevant skills.

| Pack | Collection(s) | Install when |
|---|---|---|
| `office-town-pack-properties` | `properties/` (with `websites/`, `apps/`, `hosting/` sub-kinds) | Business manages digital artifacts (agencies, hosting providers, ops teams) |
| `office-town-pack-sales` | `quotes/` | Service business doing scoped work (proposals, estimates, statements of work) |
| `office-town-pack-repos` | `repos/` (worker-managed) | Tech business with GitHub repos to track |
| `office-town-pack-comms` | `comms/` (with `chat/`, `gmail/`, `slack/`, etc. sub-channels) | When systematic communications mining begins |
| `office-town-pack-secrets` | `secrets/` (tier-policed credential pointers) | When the team needs an indexed credential map |
| `office-town-pack-fleet` | `fleet/` (worker-managed health) | For larger fleets that need operational dashboards |
| `office-town-pack-content` | `content-calendar/`, `briefs/`, `assets/`, `swipes/` | Marketing-heavy or content publication businesses |
| `office-town-pack-hr` | `candidates/`, `interviews/`, `onboarding-checklists/`, `policies/` | Active hiring or HR operations |
| `office-town-pack-support` | `tickets/`, `faqs/`, `escalations/` | High-volume support businesses |
| `office-town-pack-finance` | `invoices-index/`, `expenses/`, `forecasts/` | Where external accounting (Xero, etc.) isn't enough |

## What deliberately doesn't get its own collection

These concepts live inside their natural parent rather than at wiki root. Folder discipline.

| Concept | Lives where instead |
|---|---|
| meetings | `projects/<slug>/sessions/` or `contacts/<slug>/meetings/` |
| SOPs / standard operating procedures | `business/sops/` or per-agent `instructions/` |
| goals / OKRs | `business/goals/` (a sub-collection of business/) |
| ideas / backlog | Per-agent `findings/` (graduates to knowledge when it earns it) |
| competitors | `orgs/` with `relationship_type: competitor` frontmatter |
| vendors / suppliers | `orgs/` with `relationship_type: supplier` |
| leads / prospects | `orgs/` with `relationship_type: prospect` until a quote graduates them |
| invoices / billing | External system (Xero / accounting MCP); not mirrored to wiki |
| events / calendar | External calendar (Google Calendar MCP); not mirrored to wiki |
| products / services | `business/products.md` taxonomy + per-product app records in `properties/apps/` |

The rule: **if a "thing" is a variant of an existing entity type (an org is an org regardless of relationship), use frontmatter; if it's a fundamentally different shape, use a folder.**

## Fleet comms — per-recipient inbox routing, not broadcasts

Office Town's primary fleet-comms pattern is **tailored messages dropped in each recipient's inbox**, not generic broadcasts. When the boss needs to tell the team something, she drops different messages in each role's inbox tailored to that role's responsibilities — worker gets "you'll be doing X next", scout gets "scan for Y next week", librarian gets "file these contacts from yesterday's meeting".

Why: a tailored message is actionable. A broadcast everyone has to interpret is overhead disguised as efficiency. Goanna's fleet already does this; codifying it for Office Town.

Inbox files use the existing dated-stream convention: `<recipient-building>/inbox/YYYY-MM-DD-<from>-<topic>.md`. Frontmatter: `from`, `to`, `priority`, `subject`, `relates_to`. The recipient role processes inbox at session start (via the SessionStart hook — see `docs/HOOKS.md`).

For genuinely fleet-wide announcements (rare): drop the same message in every role's inbox. The repetition is the point — it costs negligible storage, and every role sees it on next session start. A `broadcasts/` collection would just be a dated archive of these, which we can recover from inbox archives if needed.

## Universal conventions

### File-level conventions

- **All files have YAML frontmatter** with at minimum (the universal sextet):
  ```yaml
  ---
  slug: kebab-case-identifier
  kind: contact | org | project | knowledge | decision | inbox-message | finding | ...
  created: 2026-04-01           # when entity first existed
  last_updated: 2026-05-26      # when entry was last touched
  last_edited_by: librarian | boss | worker | scout | user
  last_change_summary: "brief description of what changed"
  ---
  ```

- **Optional but commonly useful:**
  ```yaml
  tags: [client, technical, urgent]   # array, free-text
  visibility: town                     # town (default) | agent:<slug> | private
  status: active                       # canonical values per collection
  confidence: 1.0                      # 0.0-1.0 for findings/knowledge
  sources: [url1, path1, ...]          # provenance
  relates_to: [slug1, slug2, ...]      # typed cross-refs
  ```

- **Embedding metadata** (added automatically by the wiki MCP when content is indexed):
  ```yaml
  embed_text: "..."                    # the text sent to the embedding model
  embed_model: bge-large-en-v1.5       # which model produced the current vector
  ```
  When the embedding model changes, the wiki Workflow re-indexes only entries where `embed_model` doesn't match the current default. Avoids re-embedding the entire substrate on every model bump.

### Field naming — canonical conventions

| Concept | Field | Notes |
|---|---|---|
| Entity type | `kind:` | NOT `type:` (collides with TS/JSON keywords). Pick one and stick to it. |
| Creation date | `created:` | Date or full timestamp. When entity first existed. |
| Last touch | `last_updated:` | Date or timestamp. Updated on every write. |
| Audit who/why (latest) | `last_edited_by:` + `last_change_summary:` | Frontmatter snapshot of latest change |
| Full audit history | NOT in frontmatter — in D1 `wiki_audit` table | Queryable via `wiki.history(slug)` |
| Entity relationship | `relates_to:`, `org_slug:`, `team[]:`, `affects[]:`, `derived_from:` | Per-collection cross-ref fields |
| Sources / provenance | `sources:` (array of URLs/paths) | For findings + knowledge; supports cite-every-fact rule |

### Audit trail — frontmatter snapshot + D1 log

We deliberately keep TWO audit surfaces:

| Where | What it captures | When to use |
|---|---|---|
| **Frontmatter** (`last_edited_by`, `last_change_summary`, `last_updated`) | Latest change only — who, what, when | When the next reader opens the file. Immediate context. |
| **D1 `wiki_audit` table** | Every change ever — full history with prev_hash, new_hash | When auditing the history. Queryable via `wiki.history(slug)`. |

Frontmatter answers "what just happened?" D1 answers "what has ever happened?" They complement each other; both are populated on every write by the wiki MCP automatically.


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
- `AGENTS.md` at wiki root — the schema document

### Cross-reference conventions

- Frontmatter `org_slug:` on contacts to link to orgs
- Frontmatter `team[]:` on projects to list contact slugs
- Frontmatter `affects[]:` on decisions to list project slugs
- Frontmatter `derived_from:` on knowledge entries to cite source findings
- Frontmatter `client:` + `property:` on projects to double-link to org + artifact (e.g., projects link to both the org *and* the website)
- Body links use `[slug](../<collection>/<slug>/)` or `@slug` shorthand

### Open-vocabulary taxonomies

Frontmatter values aren't enums — they're open vocabulary, with canonical lists in `business/<taxonomy>.md` files. Examples:

- `business/services.md` — services the business offers (referenced by `orgs/<slug>/entity.md` as `services[]:` and by `projects/<slug>/project.md` as `service_type:`)
- `business/groups.md` — group categorisation
- `business/verticals.md` — industry verticals
- `business/hosting-platforms.md`, `business/cms-platforms.md`, etc. — tech stack vocabularies

The librarian promotes new values to canonical lists when 3+ entries use them independently. New canonical values may trigger schema updates in agent role files.

## Per-collection schemas

### `business/<topic>.md` — the install's own business

Day-one required file: `<your-business-slug>.md` (the entity record). Other files added as the business evolves.

```yaml
---
slug: example-pty-ltd
type: business
legal_name: Example Pty Ltd
abn: 12 345 678 901
last_updated: 2026-05-26
last_edited_by: librarian
last_change_summary: "Initial entity record"
---

# Example Pty Ltd
What we do. Who we serve. How we operate.
```

Common files within `business/`:
- `<slug>.md` — entity record (mandatory)
- `strategy.md` — strategic direction
- `cadence.md` — operational rhythms
- `delivery-model.md` — how work gets done
- `values.md`, `vocabulary.md`, `voice.md` — brand
- `metrics.md`, `finances.md` — financial pointers (often "see Xero")
- `software.md` — operating stack
- `services.md`, `products.md` — what you sell (taxonomy files)
- `goals/<topic>.md` — strategic objectives (a sub-collection)

### `owner/<aspect>.md` — the principal user

Mirrors `business/` but for the steering human(s):

- `voice.md` — load-bearing, every agent reads this for tone overlay
- `rhythm.md` — daily/weekly cadence
- `expertise.md` — what they know deeply
- `opinions.md` — strong takes
- `goals.md` — personal objectives
- `tooling.md` — what they use
- `family.md`, `values.md`, `bio.md` — context

### `contacts/<slug>/contact.md`

```yaml
---
slug: jane-doe
name: Jane Doe
email: jane@example.com
phone: +61 412 345 678
affiliations: [example-corp, second-org-slug]   # multi-org allowed
relationship_type: client-contact | prospect | supplier-rep | partner | external-developer | agency-coordinator | referral-partner | bni-network | friend
role: CTO
last_contacted: 2026-05-20
tags: [client, technical]
last_updated: 2026-05-26
last_edited_by: librarian
last_change_summary: "Added LinkedIn URL"
---

# Jane Doe
Brief one-paragraph context.

## Background
## Connections
## Recent thread
```

Optional sub-folders: `meetings/<YYYY-MM-DD>.md` for meeting notes.

### `orgs/<slug>/entity.md`

```yaml
---
slug: example-corp
name: Example Corp
type: client | prospect | supplier | partner | competitor | other
primary_domain: example.com
secondary_domains: [example.net]
locality: Sydney, Australia
business_type: SME
services_offered: [hosting, consulting]   # from canonical business/services.md
groups: [tech, consultancy]               # from canonical business/groups.md
verticals: [retail, education]            # from canonical business/verticals.md
relationship_type: active | prospect | former
status: active | dormant | retired
lifecycle: mature | growing | transition
last_updated: 2026-05-26
---

# Example Corp
What they do. Why they matter. Key people.

## Key people
- @jane-doe (CTO)

## Active projects
- @example-redesign-2026

## Related properties
- @properties/websites/example-com  (if properties/ pack installed)
```

### `projects/<slug>/project.md`

```yaml
---
slug: example-redesign-2026
type: project
status: active | paused | done | abandoned
opened: 2026-04-01
closed: null
owner: librarian | worker | external
client: example-corp                 # links to orgs/<slug>/
property_kind: website               # if properties/ pack installed
property: example-com                # links to properties/<kind>/<slug>/
team: [jane-doe, worker]
service_type: web-design             # from canonical business/services.md
budget: $5000-10000
last_updated: 2026-05-26
---

# Example Redesign 2026

Brief description.

## Plan
See plans/2026-05-01-design-plan.md

## Status
Phase 1 done. Phase 2 in progress.
```

Optional sub-folders inside a project folder:
- `plans/` — design docs, RFCs
- `sessions/` — multi-session narrative logs + meeting notes
- `research/` — investigations
- `findings/` — surfaced patterns (graduate to wiki/knowledge if portable)
- `notes/` — ad-hoc working notes
- `open-questions.md` — running list of open items

### `knowledge/<slug>/concept.md`

```yaml
---
slug: cloudflare-vectorize-metadata-order
type: knowledge
status: active | superseded | deprecated
domain: technical | business | both
derived_from: [agents/worker/findings/2026-05-10-vectorize-bug.md]
tags: [cloudflare, vectorize, gotcha]
sources:
  - https://developers.cloudflare.com/vectorize/...
  - findings/2026-05-10-vectorize-bug.md
last_updated: 2026-05-26
last_edited_by: librarian
last_change_summary: "Promoted from findings/"
---

# Cloudflare Vectorize metadata index ordering

## The gotcha
[detailed explanation with citations]
```

### `decisions/<NNNN-slug>/decision.md`

```yaml
---
slug: 0001-adopt-agents-md
date: 2026-05-26
domain: technical | business | both
decided_by: jez
status: accepted | superseded | deprecated
source: discussion-with-claude-2026-05-26
affects: [office-town, office-town-cloud]
supersedes: null
superseded_by: null
last_updated: 2026-05-26
---

# 0001. Adopt AGENTS.md as the file convention

## Context
## Decision
## Alternatives considered
## Consequences
```

### Inbox message — `<role-building>/inbox/<date>-<from>-<topic>.md`

The fleet-comms primitive — replacing broadcasts. Tailored messages dropped in each recipient's inbox by the sender. Frontmatter shape:

```yaml
---
slug: 2026-05-26-from-boss-q3-planning
date: 2026-05-26
type: inbox-message
from: boss
to: librarian                          # the recipient role
subject: "Q3 planning — please prep contact list"
priority: normal | high | urgent
relates_to: [projects/q3-planning, contacts/jane-doe]  # cross-refs
status: pending | handled | archived
handled_at: null                       # filled when recipient acts on it
last_updated: 2026-05-26
last_edited_by: boss
---

# Q3 planning — please prep contact list

Body of the message tailored to this recipient.
```

The recipient's role processes the inbox at session start (via the SessionStart hook). After action: set `status: handled` + `handled_at: <timestamp>` and move to `inbox/archive/` (per existing convention).

### `team/humans/<slug>.md` and `team/agents/<slug>.md`

Lightweight roster entries:

```yaml
---
slug: jez
type: human
role: principal-user | team-member | external | client
contact: jez@example.com
last_updated: 2026-05-26
---

# Jez (Jeremy Dawes)
Principal user. See wiki/owner/ for deep context.
```

```yaml
---
slug: librarian
type: agent
role: librarian
building: library
configured_at: ~/.agents/agents/librarian.md
status: active
last_updated: 2026-05-26
---

# Librarian (agent)
Extracts from external systems + curates the wiki.
```

### `templates/<type>.md` — page-shape templates

One file per entity type. Used by the librarian as starting points.

## Per-pack schemas (when installed)

### properties/ pack

```
properties/
├── AGENTS.md
├── INDEX.md (worker-managed)
├── websites/<slug>/site.md
├── apps/<slug>/app.md
├── hosting/<slug>/account.md
└── (other kinds as earned)
```

Site frontmatter includes: `domain`, `client` (org slug), `status` (active/dormant/retired/migrated), `lifecycle` (mature/staging/in-flight), `cms`, `page_builder`, `hosting`, `cloudflare_zone_id`, `email_platform`, etc. ~25 fields based on goanna's evidence.

### quotes/ pack

```
quotes/
├── AGENTS.md
├── INDEX.md
└── <YYYY-MM-DD>-<client>-<topic>/
    ├── quote.md (canonical)
    ├── proposal.md (earned)
    ├── executive-summary.md (earned)
    ├── questions-for-client.md (earned)
    └── build-brief.md (earned after acceptance)
```

Quote frontmatter: `status` (drafting | sent | accepted | rejected | superseded | expired), `client`, `value`, `currency`, `valid_until`, `pricing_tier`.

### repos/ pack

```
repos/
├── AGENTS.md (notes that this is worker-managed)
├── INDEX.md (auto-generated)
├── open-issues.md (cross-repo dashboard)
└── <slug>/repo.md
```

Repo frontmatter (worker-managed): `github_url`, `language`, `default_branch`, `last_push`, `open_prs`, `open_issues`, `ci_status`, `ci_run_url`, `last_synced`.

### comms/ pack

```
comms/
├── AGENTS.md
├── chat/<space-slug>/index.md
├── gmail/<account>/<YYYY-MM>/<YYYY-MM-DD>-<subject>-<id>/
└── (other channels: slack, teams, etc.)
```

### secrets/ pack (sensitive!)

```
secrets/
├── AGENTS.md (notes the tier policy explicitly)
└── <service>.md
```

Each `<service>.md` is a POINTER to where the credential lives (e.g., "in Bitwarden vault X" or "in Cloudflare secret Y"), NEVER the credential itself. Frontmatter: `tier: 2`, `agent-access: yes | no`.

## Lifecycle by collection

| Collection | When to update | When to archive |
|---|---|---|
| `business/`, `owner/` | In place; supersession via frontmatter | Never archived (just superseded) |
| `contacts/`, `orgs/` | In place; supersession + status field | Mark `status: dormant` for inactive |
| `knowledge/` | In place; supersession + `superseded_by:` pointer | Never deleted |
| `decisions/` | Append `superseded` status; new decision references old | Never deleted — decisions are audit trail |
| `projects/` | Move to `projects/archive/` when status=archived | When closed + status=archived |
| `team/` | In place — humans/agents change over time | Mark `status: inactive` |
| `templates/` | In place | Versioned via git |
| `inbox/` (per-building, not a wiki collection) | Handled → archived | Archive after action (`inbox/archive/`); never delete (audit trail) |
| `properties/` | In place + status changes | When property is retired |
| `quotes/` | Lifecycle: drafting → sent → accepted/rejected/superseded/expired | Never archived (sales history) |

## How collections grow

Three growth paths:

1. **Librarian-driven extraction** — librarian reaches into email/CRM/scrape/files → normalises → files in the right collection. Highest volume.
2. **Agent-finding promotion** — agents drop findings in their building's `findings/` folder → librarian reads across siblings → promotes patterns to `wiki/knowledge/`. Medium volume.
3. **User-direct edits** — user (or any agent) edits a wiki file directly. Lowest volume; for `owner/voice` changes, manual corrections.

## Adding a new collection

A deployment-specific need may justify a new collection (e.g., `inventory/` for an ecommerce business). Process:

1. Confirm it doesn't fit an existing collection or pack (the librarian advises)
2. Confirm 3+ instances already exist that would belong in this folder (don't pre-create)
3. Call `wiki.register_collection(name, description, convention, purpose)` via the MCP
4. The tool:
   - Creates the folder under R2
   - Updates `wiki/AGENTS.md` with the schema entry
   - Creates an `INDEX.md` placeholder
   - Logs the addition to the activity log
5. Document the per-collection schema (frontmatter, body shape) in the schema doc

## Audit trail

Every wiki write produces an entry in the activity log (D1 `activity_log` table):
- Timestamp
- Actor (agent name or 'user')
- Action (create / update / delete / archive / supersede)
- Resource (collection + slug)
- Change summary (from frontmatter)

This lets the librarian (and the user) review what changed when.

## Anti-patterns to avoid

1. **Don't pre-create the long tail.** 20 empty collections look professional and feel hollow within a week.
2. **Don't enforce schema before it earns its place.** Start with markdown + minimal frontmatter. Add typed fields per collection only when a real recurring pattern shows up.
3. **Don't separate the wiki from the journal.** Agents writing findings and updating wiki pages IS the work; not a separate "wiki maintenance" task.
4. **Don't proliferate folders for variants of the same entity.** Vendor, supplier, prospect, competitor — all orgs. Use frontmatter, not folders.
5. **Don't replicate external systems.** If Xero / Google Calendar is the source of truth, point at it; don't mirror it.

## Research basis

This schema was derived from:

- Audit of goanna's wiki at `/Users/Shared/goanna/wiki/` — 18 collections in real production use across 6+ months
- Karpathy's LLM wiki gist — three-layer architecture, index + log, ingest/query/lint operations
- 20 Notion business templates — convergent collections analysis
- PARA method (Tiago Forte), CODE method, Linking Your Thinking (Nick Milo), Tana supertags, LogSeq journal-first
- 12 PKM mistakes literature — for the anti-patterns

The 10 default collections + 10 pack-installable add-ons represents the convergent shape across all of these, with goanna's lived experience as the empirical evidence base.
