// Seed example entries written once on cold install.
//
// Two roles:
//  1. Queryable doctrine — concept entries about gravity-wells +
//     engagement-trace + agent-autonomy-default that the cortex's
//     curator + librarian agents can read when designing placement,
//     writing traces, or deciding when to escalate.
//  2. Worked example — orgs/acme-corp → contacts/sarah-smith →
//     projects/acme-renewal-2024 → decisions/2026-05-28-adopt-cortex-
//     framework. Four linked entries showing how the graph composes.
//
// Each entry carries `seed: true` in frontmatter so they're identifiable
// + removable. Bootstrap writes them via direct R2 + D1 inserts
// (skipping the unified write path's AI repair + Vectorize indexing —
// seeds are hand-curated, don't need either).
//
// Schema_version 1 + status active + confidence 1.0 + review_status
// approved. Each cites the seed installation in last_change_summary +
// audit row.

export interface SeedEntry {
	collection: string;
	slug: string;
	canonical_filename: string; // matches wiki_collections.canonical_filename
	title: string;
	body: string; // full markdown including frontmatter
}

const SEXTET_PRELUDE = (slug: string, kind: string, title: string, lastChangeSummary: string) =>
	`---
slug: ${JSON.stringify(slug)}
kind: ${JSON.stringify(kind)}
title: ${JSON.stringify(title)}
seed: true
schema_version: 1
status: active
confidence: 1.0
review_status: approved
derived_from: []
created: "2026-05-28T09:00:00Z"
last_updated: "2026-05-28T09:00:00Z"
last_edited_by: bootstrap
last_change_summary: ${JSON.stringify(lastChangeSummary)}`;

const GRAVITY_WELLS_CONCEPT = `${SEXTET_PRELUDE(
	'gravity-wells',
	'knowledge',
	'Gravity Wells — the placement principle',
	'seed: gravity-wells doctrine'
)}
type: concept
evidence_count: 1
promoted_at: 2026-05-28
applies_to: [substrate, curation, librarian-shape]
related_concepts: [engagement-trace, agent-autonomy-default]
---

In a markdown-first knowledge layout, **the location and naming of content shapes how often, how reliably, and by whom it gets read.** Location isn't passive storage — it's an active force on retrieval. The acid test: predictive routing. When new content arrives, can you predict where it ends up without thinking?

## When to use

Read this concept when:

- Designing where a new collection lives in the substrate
- Deciding whether to mint a new file or extend an existing one
- Reviewing a sub-page that "feels wrong" — likely the well has weakened to a sink
- Coaching agents on placement decisions during reactive curation

## The five forces

A file (or folder) attracts content only when all five are simultaneously true:

1. **Path predictability** — the well lives at a documented fixed location; agents at warm-up don't *discover* it, they're told where it is
2. **Name-content match** — the filename predicts contents; a reader who's never seen the file should guess what's inside from the name alone
3. **Size matched to read frequency** — frequently-read files must be small; the soft cap creates the gravity by forcing curation
4. **Cross-link reinforcement** — every file mentioning a concept links to its canonical home
5. **Warm-up makes it load-bearing** — highest-traffic files declared as required reading in the kickoff procedure

Remove any one and the well weakens to a sink.

## Failure modes (named so curators spot them earlier)

| Failure | Detection | Treatment |
|---|---|---|
| **Sink** | File >200 lines holding multiple unrelated H2 sections | Split or mint a new well |
| **Black hole** | Content everyone agrees is misplaced, but no one can name the right place | Framework needs a new well |
| **Galactic dust** | Updating a fact requires touching 3+ files | Mint a well; move all instances; leave pointer-stubs |
| **Empty well** | Schema declares a likely-file that nobody mints | Tighten name + purpose, or remove from likely-files |
| **Wells too close** | Curators routinely struggle to choose between two adjacent wells | Sharpen split criterion, or merge |

## Curatorial operating procedure

When new content arrives, three questions in order:

1. Is there an existing well whose name and purpose match this?
2. If no, does the content earn a new well? (Section → file → subfolder at 5+ items)
3. Is there a sink forming?

## See also

- [[engagement-trace]] — the canonical interaction primitive that lands in entity wells
- [[agent-autonomy-default]] — why agents act on placement without asking

## Sources

Inherited from Goanna's \`docs/CURATION.md\` (2026-05-08, the original seven-sinks-evacuated-into-nine-wells reshape). Reference: \`.jez/artifacts/goanna-doctrine-extracted-2026-05-28.md\`.
`;

const ENGAGEMENT_TRACE_CONCEPT = `${SEXTET_PRELUDE(
	'engagement-trace',
	'knowledge',
	'Engagement Trace — the canonical interaction primitive',
	'seed: engagement-trace doctrine'
)}
type: concept
evidence_count: 1
promoted_at: 2026-05-28
applies_to: [orgs, contacts, projects]
related_concepts: [gravity-wells]
---

For entities that accumulate interactions (orgs, contacts, projects), the canonical client-memory shape is the **engagement trace**: one line per substantive interaction, four fields.

## The format

\`\`\`
2026-05-28 / Sarah Smith (email) / agreed renewal terms 2024-2025 / msg-18f3a1b
\`\`\`

| Field | Required | Note |
|---|---|---|
| date | yes | ISO date (or full timestamp if precision matters) |
| actor (channel) | yes — non-negotiable | Who did it, in parens which channel. The "I did X" pattern collapses when several writers contribute. |
| verb-phrase with outcome | yes | What happened + what changed |
| reference ID | yes | Link back to the raw archive |

## When to use

- After any substantive interaction with an entity (email exchange, call, meeting, decision)
- After a sibling agent surfaces a passing signal about an entity
- After a scheduled scan finds new activity in a connected system (Xero invoice, GitHub commit, Slack mention)

Don't trace routine notifications, marketing emails, or low-content interactions. Manufactured-work anti-pattern.

## Three sizes by complexity

| Size | When | Where |
|---|---|---|
| **Trace** (one-liner) | Default — most interactions | \`<canonical>.md § Recent\` |
| **Touchpoint** (companion file) | Interaction warrants a paragraph or two | \`notes/<date>-<topic>.md\` |
| **Deep narrative** (session) | Multi-hour multi-topic full notes | \`sessions/<date>.md\` |

The agent picks the size based on the interaction. Default to traces; promote upward when content earns it.

## See also

- [[gravity-wells]] — entity files are wells; traces land at \`§ Recent\`
- [[agent-autonomy-default]] — agent appends traces autonomously without asking

## Sources

Inherited from Goanna's CRM doctrine. Multi-writer accumulating store; actor field non-negotiable because the "I did X" pattern collapses when several writers contribute.
`;

const AGENT_AUTONOMY_CONCEPT = `${SEXTET_PRELUDE(
	'agent-autonomy-default',
	'knowledge',
	'Agent Autonomy Default — research before asking',
	'seed: autonomy-default principle'
)}
type: concept
evidence_count: 1
promoted_at: 2026-05-28
applies_to: [all-agents]
related_concepts: [gravity-wells, engagement-trace]
---

Asking the user is the **last resort, not the first move.** Agents exhaust internal research (cortex query, MCP lookups, semantic search, web search, raw-archive citation chase) before escalating. When they do escalate, they present a recommended action with confidence and sources — not an open question.

## When to use

Read this concept when:

- An agent encounters ambiguity (two candidate orgs for a name match; two valid placements for new content)
- A skill is tempted to surface every question to the user
- Designing a hook or recipe that might block on user input
- Reviewing whether a dashboard prompt should be a *question* or a *recommended action*

## Six operating rules

1. **Try research before asking** — the agent has tools the user doesn't (semantic search, MCP lookups, the graph)
2. **Confidence-scored auto-write beats blocking** — entries land with confidence + status: stub if uncertain; the dashboard surfaces low-confidence items for optional review
3. **When escalation IS needed, present a recommendation** — not "are these the same entity?" but "I recommend merging X and Y because [signals]. Approve?"
4. **Provenance > permission** — every action is auditable via wiki_audit with required \`why:\`. Audit makes autonomy safe.
5. **User-pinned facts override agent inference** — \`pinned: true\` is ground truth
6. **Don't pad escalations** — one question, multiple-choice over open-ended

## When the agent SHOULD still ask

- Destructive actions on user-pinned content
- Money or billing-affecting actions
- Communications sent on behalf of the user (drafts only, never send)
- Schema migrations that would delete data

For everything else: research-first, decide-second, write-with-confidence, surface-via-dashboard.

## See also

- [[gravity-wells]] — autonomy applies to placement decisions
- [[engagement-trace]] — autonomy applies to trace-append (don't ask permission to log)
- The dashboard's review queue is the surface where agent-decided items get human eyes when wanted

## Sources

Office Town design note \`agent-autonomy-default-2026-05-28.md\`. Discovered when designing the curator + librarian operating loop — the surface-to-user default was killing the autonomy promise.
`;

const ACME_CORP_ENTITY = `${SEXTET_PRELUDE(
	'acme-corp',
	'orgs',
	'Acme Corp Pty Ltd',
	'seed: example org for shape reference'
)}
name: Acme Corp Pty Ltd
entity_type: client
abn: 11 222 333 444
domains: [acme-corp.example.com]
vertical: hosting-services
primary_contact: sarah-smith
contacts: [sarah-smith]
projects: [acme-renewal-2024]
related_orgs: []
aliases: [acme-corporation, acme]
groups: [active-client]
---

Acme Corp Pty Ltd is an example client showing the canonical org-entity shape. Their hosting renewal is the worked-example project for the v1.0 demo cortex.

This is a **seed entry** marked \`seed: true\` — when you're ready for a real Acme replacement, archive this entry or supersede it via the curator.

## Recent

\`\`\`
2026-05-28 / Sarah Smith (email) / agreed renewal terms 2024-2025 / msg-acme-001
2026-04-15 / Sarah Smith (email) / requested hosting renewal quote / msg-acme-002
2026-03-01 / Jez (call) / annual check-in, all systems healthy / sessions/2026-03-01.md
\`\`\`

## See also

- [[contacts/sarah-smith]] — primary contact
- [[projects/acme-renewal-2024]] — active project
- [[knowledge/engagement-trace]] — what those § Recent lines are
`;

const SARAH_SMITH_CONTACT = `${SEXTET_PRELUDE(
	'sarah-smith',
	'contacts',
	'Sarah Smith',
	'seed: example contact for shape reference'
)}
name: Sarah Smith
email: sarah@acme-corp.example.com
phone: +61 412 345 678
role: Operations Manager
orgs: [acme-corp]
primary_org: acme-corp
projects: [acme-renewal-2024]
last_contacted_at: 2026-05-28T13:00:00Z
---

Operations Manager at Acme Corp Pty Ltd. Primary point of contact for the 2024 renewal project.

This is a **seed entry** marked \`seed: true\` — example contact showing the canonical shape.

## Recent

\`\`\`
2026-05-28 / Sarah Smith (email) / confirmed renewal go-ahead / msg-acme-001
2026-04-15 / Sarah Smith (email) / requested hosting renewal quote / msg-acme-002
\`\`\`

## See also

- [[orgs/acme-corp]] — works at
- [[projects/acme-renewal-2024]] — decision-maker
`;

const ACME_RENEWAL_PROJECT = `${SEXTET_PRELUDE(
	'acme-renewal-2024',
	'projects',
	'Acme Renewal 2024',
	'seed: example project for shape reference'
)}
name: Acme Renewal 2024
org: acme-corp
contacts: [sarah-smith]
stage: active
started_at: 2026-04-15
ended_at: null
related_projects: []
decisions: [2026-05-28-adopt-cortex-framework]
tags: [hosting, renewal]
---

Annual hosting renewal for Acme Corp Pty Ltd. Includes adding a new staging environment per the May 2026 conversation.

This is a **seed entry** marked \`seed: true\` — example project showing the canonical shape with org + contact + decision links.

## Scope

- Renew existing hosting subscription (annual, AUD 2,000)
- Add staging environment (subdomain: staging.acme-corp.example.com)
- Migrate database backup automation to new schedule

## Status

\`stage: active\` — quote sent, awaiting client confirmation.

## See also

- [[orgs/acme-corp]] — client
- [[contacts/sarah-smith]] — decision-maker
- [[decisions/2026-05-28-adopt-cortex-framework]] — the related decision
`;

const ADOPT_CORTEX_DECISION = `${SEXTET_PRELUDE(
	'2026-05-28-adopt-cortex-framework',
	'decisions',
	'Adopt the cortex framework for Office Town v1.0',
	'seed: example decision for shape reference'
)}
decided_on: "2026-05-28"
decided_by: [jez]
orgs: [acme-corp]
projects: [acme-renewal-2024]
related_decisions: []
superseded_by: null
---

This is a **seed entry** marked \`seed: true\` — example decision showing the canonical Context → Decision → Consequences → Alternatives shape.

## 1. Context

Office Town's v1.0 design needed a substrate model. Three candidates surfaced through May 2026:

- A RAG-only knowledge layer (OpenHuman-style: chunks + vectors, no typed entities)
- A pure CRM model (fixed schemas, no flexibility, no doctrine)
- The cortex framework (typed entities + explicit graph + audit + provenance + curator/librarian agents)

The brand-new-Mac test was the discriminator: a fresh agent should do useful work on a real project immediately from the substrate alone.

## 2. Decision

**Adopt the cortex framework as Office Town's v1.0 substrate model.** Typed entities live in collection folders; relationships in wiki_links; audit in wiki_audit; provenance in derived_from frontmatter; curation discipline via gravity-wells; agent behaviour governed by agent-autonomy-default.

## 3. Consequences

- Office Town inherits Goanna's hard-won doctrine — gravity-wells, schema-as-emergence, the four shapes, the specialist disciplines
- Adds Goose-specific structure: persona-context split, recipe + hook primitives, scheduled cycles
- Acme Corp + Sarah Smith + this renewal project + this decision are the worked example showing the graph in action
- Future projects use this shape verbatim; we don't re-derive on each new client

## 4. Alternatives considered

| Alternative | Why not |
|---|---|
| RAG-only chunks + vectors | Fails the brand-new-Mac test — agent has no entity identity to reason against |
| Pure CRM (fixed schemas) | Schemas drift in real use; pre-designed schemas plateau |
| Build from scratch | Goanna's month of operation has already discovered the failure modes; re-discovering them costs months |

## See also

- [[knowledge/gravity-wells]] — placement doctrine the framework relies on
- [[knowledge/agent-autonomy-default]] — agent behaviour the framework relies on
- [[orgs/acme-corp]] — primary client the worked example serves
- [[projects/acme-renewal-2024]] — the project this decision is within
`;

export const SEED_ENTRIES: SeedEntry[] = [
	{
		collection: 'knowledge',
		slug: 'gravity-wells',
		canonical_filename: 'concept.md',
		title: 'Gravity Wells — the placement principle',
		body: GRAVITY_WELLS_CONCEPT,
	},
	{
		collection: 'knowledge',
		slug: 'engagement-trace',
		canonical_filename: 'concept.md',
		title: 'Engagement Trace — the canonical interaction primitive',
		body: ENGAGEMENT_TRACE_CONCEPT,
	},
	{
		collection: 'knowledge',
		slug: 'agent-autonomy-default',
		canonical_filename: 'concept.md',
		title: 'Agent Autonomy Default — research before asking',
		body: AGENT_AUTONOMY_CONCEPT,
	},
	{
		collection: 'orgs',
		slug: 'acme-corp',
		canonical_filename: 'entity.md',
		title: 'Acme Corp Pty Ltd',
		body: ACME_CORP_ENTITY,
	},
	{
		collection: 'contacts',
		slug: 'sarah-smith',
		canonical_filename: 'contact.md',
		title: 'Sarah Smith',
		body: SARAH_SMITH_CONTACT,
	},
	{
		collection: 'projects',
		slug: 'acme-renewal-2024',
		canonical_filename: 'project.md',
		title: 'Acme Renewal 2024',
		body: ACME_RENEWAL_PROJECT,
	},
	{
		collection: 'decisions',
		slug: '2026-05-28-adopt-cortex-framework',
		canonical_filename: 'decision.md',
		title: 'Adopt the cortex framework for Office Town v1.0',
		body: ADOPT_CORTEX_DECISION,
	},
];
