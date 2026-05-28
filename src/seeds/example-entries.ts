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

Inherited from [[goanna-the-inspiration]]. The five-force test surfaced from operating fleets of agents long enough to see what makes content findable vs ignored.
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

Inherited from [[goanna-the-inspiration]]'s CRM doctrine. Multi-writer accumulating store; actor field non-negotiable because the "I did X" pattern collapses when several writers contribute.
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

- Office Town inherits [[goanna-the-inspiration]]'s hard-won doctrine — gravity-wells, schema-as-emergence, the four shapes, the specialist disciplines
- Adds Goose-specific structure: persona-context split, recipe + hook primitives, scheduled cycles
- Acme Corp + Sarah Smith + this renewal project + this decision are the worked example showing the graph in action
- Future projects use this shape verbatim; we don't re-derive on each new client

## 4. Alternatives considered

| Alternative | Why not |
|---|---|
| RAG-only chunks + vectors | Fails the brand-new-Mac test — agent has no entity identity to reason against |
| Pure CRM (fixed schemas) | Schemas drift in real use; pre-designed schemas plateau |
| Build from scratch | [[goanna-the-inspiration]]'s prior operation already discovered the failure modes; re-discovering them costs months |

## See also

- [[knowledge/gravity-wells]] — placement doctrine the framework relies on
- [[knowledge/agent-autonomy-default]] — agent behaviour the framework relies on
- [[orgs/acme-corp]] — primary client the worked example serves
- [[projects/acme-renewal-2024]] — the project this decision is within
`;

// ---------- User + agent guides (the "docs" set) ----------
// Marked doc: true in frontmatter so future filters can split how-to from
// doctrine. Ships in the knowledge collection alongside the doctrine
// concepts because they're concept-shaped and don't yet earn a separate
// collection.

const DOC_GETTING_STARTED = `${SEXTET_PRELUDE(
	'getting-started',
	'knowledge',
	'Getting started with Office Town',
	'seed: getting-started guide'
)}
doc: true
type: guide
audience: humans
applies_to: [first-install]
---

Office Town is a personal cortex. Your business knowledge, the people in your world, your voice, your decisions all live as plain markdown files on Cloudflare. AI agents (via [Goose](https://block.github.io/goose)) read the cortex on every session, so they wake up already knowing the backstory.

## Your first 10 minutes

1. **Log in.** You're already past this if you can see this page.
2. **Bring across context from your existing AI.** Open [[setup → /dashboard/setup]] and follow Step 1: copy a dossier-extraction prompt, paste into your existing Claude/Gemini/ChatGPT, get back a dossier of what they already know about you. Paste that back in Step 2. Your owner cascade + business + key contacts populate in seconds.
3. **Wire your Goose.** Open [[connect → /dashboard/connect]] for the one-line install that wires all 6 MCP servers into your local Goose installation.
4. **Install local sync.** [[install-officetowd]] mirrors your wiki to a local folder so you can edit in any editor and watch changes flow.

## What's already here

Office Town ships with a small set of seed entries showing how the cortex works:

- 3 doctrine concepts: [[gravity-wells]], [[engagement-trace]], [[agent-autonomy-default]] — these explain how the system thinks
- 4 worked example entries: [[orgs/acme-corp]] → [[contacts/sarah-smith]] → [[projects/acme-renewal-2024]] → [[decisions/2026-05-28-adopt-cortex-framework]] — a linked example showing the graph in action

These are marked \`seed: true\` and removable when you don't need them.

## What to read next

- [[dashboard-tour]] — what each building in your town is for
- [[your-cortex-explained]] — owner cascade, engagement traces, the four shapes
- [[goanna-the-inspiration]] — where the framework came from
`;

const DOC_DASHBOARD_TOUR = `${SEXTET_PRELUDE(
	'dashboard-tour',
	'knowledge',
	'Dashboard tour — what each building means',
	'seed: dashboard tour guide'
)}
doc: true
type: guide
audience: humans
applies_to: [dashboard]
---

The dashboard renders your cortex as a **town**. Each building maps to a collection of related entries. Click any building to browse what's inside.

## The buildings

| Building | Collection | What lives there |
|---|---|---|
| Library | knowledge | Doctrine concepts + how-to guides like this one |
| Records Hall | decisions | Append-only decisions with Context → Decision → Consequences → Alternatives |
| Workshop | projects | Active + historical projects |
| Town Square | orgs | External organisations — clients, vendors, partners |
| Coffee House | contacts | External people you work with |
| Guildhall | team | Your team members + AI agents |
| Post Office | feedback | Inbox + feedback streams |
| Archive | research | Research notes, time-stamped investigations |
| Workshop Yard | tasks | Tasks + todos + in-flight work |
| Mayor's House | owner | Your voice / rhythm / expertise / opinions — read by every agent |
| Charter Hall | business | Your business identity |

## The Town Clock

The activity log below the buildings. Shows the last ~10 audit events from \`wiki_audit\` + recent scheduled cycle runs. Auto-refresh on every dashboard load.

When an agent does something — writes an entry, appends a trace, runs a curate cycle — it shows up here. The Town Clock is the proof that the cortex is alive.

## Navigation

- **Town** (the homepage) — the map view
- **Wiki** — full entry browser with collection filter
- **Kanban** — task board for in-flight work
- **Routines** — scheduled cycles + their recent runs
- **Files** — binary attachments
- **Published** — anything you've published to a shareable URL
- **Connect Goose** — wire your local Goose installation

## See also

- [[your-cortex-explained]] — what each collection is conceptually for
- [[wire-goose]] — connecting your local agent
`;

const DOC_WIRE_GOOSE = `${SEXTET_PRELUDE(
	'wire-goose',
	'knowledge',
	'Wire Goose to your cortex',
	'seed: wire goose guide'
)}
doc: true
type: guide
audience: humans
applies_to: [install]
---

Goose is the local agent runtime — the desktop/CLI app that runs your AI personas and gives them access to your cortex via MCP. Office Town exposes 6 MCP servers; wire them all to your Goose and your agents can read, write, and act against the cortex.

## Install Goose

If you haven't already: [block.github.io/goose](https://block.github.io/goose) — download for macOS, Linux, or Windows.

## Wire the 6 MCP servers

The shortest path: visit \`/dashboard/connect\` while logged in. The page generates a single shell snippet that wires all 6 MCPs with your bearer token already filled in. One paste in a terminal does the rest.

The 6 MCPs Office Town exposes:

| MCP | Path | What it does |
|---|---|---|
| wiki | /mcp/wiki | Read, write, search, link, audit the cortex |
| files | /mcp/files | Upload + read binary attachments + scrape web content |
| email | /mcp/email | Send email via the worker's binding |
| cron | /mcp/cron | Schedule recurring agent tasks |
| voice | /mcp/voice | Voice agent endpoints (scaffolded for future use) |
| sandbox | /mcp/sandbox | Ephemeral compute via Cloudflare Containers |

All 6 use the same bearer token (the MCP_BEARER_TOKEN secret on your worker). One credential, six MCPs.

## After wiring

Open Goose. Start a session. Ask the agent to read \`wiki/owner/voice.md\` — if it can fetch the file, the wiki MCP is working. From there, the agent can do anything the cortex supports.

## If something doesn't work

- 401 errors → bearer token wrong or expired. Re-check \`/dashboard/connect\`.
- Empty responses → the MCP server is wired but the cortex is empty. Run [[setup → /dashboard/setup]] first.
- Goose doesn't see the servers → restart Goose; the extension list loads at session start.

## See also

- [[install-officetowd]] — local sync daemon for editing wiki content in your editor
- [[how-agents-read-this]] — what your Goose persona will do once wired
`;

const DOC_INSTALL_OFFICETOWD = `${SEXTET_PRELUDE(
	'install-officetowd',
	'knowledge',
	'Install officetowd — local sync daemon',
	'seed: install officetowd guide'
)}
doc: true
type: guide
audience: humans
applies_to: [install, sync]
---

\`officetowd\` is the local sync daemon. It mirrors your cortex (the markdown files + binary attachments on R2) to a folder on your machine, so you can edit in Obsidian, VSCode, Typora, or any editor you like. Changes sync bidirectionally — local edits go up; agent edits come down.

## Install

The fastest path: visit \`/dashboard/wire-sync\` while logged in. It generates a one-line install command with your worker URL baked in. Copy-paste into a terminal.

Or do it manually:

\`\`\`bash
brew tap jezweb/tap
brew install officetowd
officetowd configure --from-dashboard <your-worker-url>
officetowd start
\`\`\`

The configure step asks for the MCP bearer + local sync folder (default: \`~/Documents/my-town\`). Then \`start\` registers a launchd plist (macOS) or systemd unit (Linux) and runs the daemon.

## What gets synced

The whole \`wiki/\` namespace on R2 → your local folder. Binary attachments (PDFs, images) flow through as raw bytes. Multi-machine setups are fine — install on each machine; all of them sync to the same worker.

## Conflicts

If both sides change the same file between sync ticks, the daemon writes the remote version as \`<filename>.conflict-<timestamp>\` and uploads your local as authoritative. Open both, merge by hand, save the result.

## Verify it's working

\`\`\`bash
officetowd status
\`\`\`

Should show: state running, watching dir, the worker URL, and a recent sync timestamp.

## See also

- [[wire-goose]] — connect Goose so your agents can read + write what the daemon syncs
- [[dashboard-tour]] — verify wiki content via the dashboard after editing locally
`;

const DOC_YOUR_CORTEX_EXPLAINED = `${SEXTET_PRELUDE(
	'your-cortex-explained',
	'knowledge',
	'Your cortex explained — owner cascade, traces, four shapes',
	'seed: cortex framework guide'
)}
doc: true
type: guide
audience: humans
applies_to: [framework]
---

Office Town isn't a CRM, a wiki, or a chat app. It's a **substrate for typed business knowledge** that agents read on every session. Three concepts make it work.

## The owner cascade

Your voice, rhythm, expertise, opinions, values, vocabulary — all in markdown files under \`wiki/owner/\`. The most load-bearing of these is [[voice.md → wiki/owner/voice.md]], which every agent reads before producing any styled output. Depth here pays off: thin voice.md means generic AI-sounding output forever.

The cascade is built during [[setup → /dashboard/setup]] from a dossier extracted from your existing AI. You don't fill it by hand.

## Engagement traces

For entities that accumulate interactions (orgs, contacts, projects), each substantive interaction lands as a one-liner under \`## Recent\` in the entity's canonical file:

\`\`\`
2026-05-28 / Sarah Smith (email) / agreed renewal terms 2024-2025 / msg-18f3a1b
\`\`\`

Date · actor (channel) · verb-phrase with outcome · reference ID. Multi-writer accumulating store. See [[engagement-trace]] for the full primitive.

## The four shapes

Every agent in Office Town is one of four shapes. After running fleets long enough to learn this lesson the hard way: there's no fifth.

| Shape | Verb | Reads | Writes |
|---|---|---|---|
| **Router** (boss) | Directs | User intent + delegate output | User-facing reply |
| **Doer** (worker) | Executes | Cortex context | External actions (with approval) |
| **Curator** | Ingests | External sources + cortex | Typed entries with derived_from |
| **Watcher** (scout) | Finds | Web, public APIs | Findings |

Specialist agents are scope-narrowed versions of one of the four shapes, not a fifth shape.

## Gravity wells

Where content lives in the cortex shapes whether anyone — human or agent — can find it. Five forces govern placement: path predictability, name-content match, size matched to read frequency, cross-link reinforcement, warm-up loadbearing. See [[gravity-wells]] for the full doctrine.

## Agent autonomy default

Agents research before they ask. They reach into the cortex, run MCP lookups, semantic search, web search — they only escalate to you when truly stuck, and even then they present a recommended action with sources, not an open question. See [[agent-autonomy-default]] for the principle.

## See also

- [[getting-started]] — your first 10 minutes
- [[how-agents-read-this]] — the agent side of the same picture
- [[goanna-the-inspiration]] — where these patterns came from
`;

const DOC_HOW_AGENTS_READ_THIS = `${SEXTET_PRELUDE(
	'how-agents-read-this',
	'knowledge',
	'How agents read this cortex',
	'seed: agent kickoff guide'
)}
doc: true
type: guide
audience: agents
applies_to: [kickoff, every-session]
---

If you're an AI agent reading this for the first time, this page is for you. It tells you how to wake up inside Office Town and act usefully from the first turn.

## The kickoff procedure

Every Goose session starts the same way. Inherited from prior framework operation:

1. **Cascade is already loaded.** Goose's CONTEXT_FILE_NAMES has read the \`AGENTS.md\` files up the tree before your first turn. You don't re-read these; they're already in your system prompt.
2. **Read your working substrate.** \`wiki/agents/<your-persona-slug>/facts/*.md\` for accumulated feedback. \`status.md\` for current state.
3. **Read voice.md.** \`wiki/owner/voice.md\` is load-bearing — every styled output you produce is governed by it. Read it before drafting anything human-facing.
4. **Locate yourself.** The working directory you were launched in is the homing beacon. If it's \`wiki/orgs/acme-corp/\`, you're working on Acme. Read the canonical file in that folder.
5. **Check inbox + recent journal.** Process anything queued; understand what was mid-stream.
6. **Now work.** Don't end kickoff and ask "What would you like to do?" — that's the wrong default. You know your role + scope + state. Act.

## The autonomy default

Per [[agent-autonomy-default]]: research before asking. You have tools the user doesn't — semantic search, MCP lookups, the graph, web search. Use them first. When you do escalate, present a recommended action with confidence + sources, not an open question.

When you decide to act with imperfect information, write the entry with appropriate confidence and \`review_status: pending\` if it might need correction. The user reviews when they choose; you don't block.

## Provenance is non-optional

Every auto-generated entry carries \`derived_from:\` pointing back to the source. Without provenance, facts are folklore. With provenance, the audit trail makes autonomous action safe.

## Where to write

- Typed entry → its collection (orgs/contacts/projects/decisions/knowledge)
- Engagement trace → entity's \`§ Recent\` section
- Findings (single-instance patterns) → your agent's \`findings/\` folder
- Promoted knowledge (3+ confirmed instances) → \`wiki/knowledge/<topic>/concept.md\` via the librarian's discretion

## See also

- [[your-cortex-explained]] — the concepts; same picture, human-facing
- [[engagement-trace]] — the canonical interaction primitive
- [[gravity-wells]] — placement doctrine
`;

const DOC_GOANNA_THE_INSPIRATION = `${SEXTET_PRELUDE(
	'goanna-the-inspiration',
	'knowledge',
	'Goanna — the framework that inspired Office Town',
	'seed: goanna provenance guide'
)}
doc: true
type: guide
audience: humans
applies_to: [history]
---

Office Town's framework didn't appear from nowhere. Most of what's load-bearing — gravity-wells, engagement traces, agent-autonomy-default, the four shapes, the specialist disciplines — came from Goanna, an AI-agent framework that ran fleets of autonomous agents in real business operation for over a month before Office Town existed.

## What Goanna was

Goanna was convention, not code. A folder structure of markdown files at \`/Users/Shared/goanna/\` synced to R2, watched by a Go daemon (\`goannad\`), read by agents (Claude Code at the time) on session start. Multiple personas (boss, curator, librarian, scout, worker) worked the same substrate, each with their own facts/, findings/, journal/, status.

The doctrine surfaced through actual use — patterns that earned their place after appearing in three or more situations, failure modes named after the system broke in them. Not a designed framework; a discovered one.

## What Office Town inherited

These concepts come from Goanna verbatim:

- **[[gravity-wells]]** — the placement principle (five forces, five failure modes, predictive routing as success metric)
- **[[engagement-trace]]** — the four-field canonical interaction primitive (date / actor / verb / ref-id), actor field non-negotiable
- **The four shapes** — router / doer / curator / watcher, no fifth shape after a month of operation
- **The kickoff procedure** — 11-step warm-up ending in "Now work, don't ask"
- **Schema-as-emergence** — 1/2/3/4+ thresholds for promoting from inline observation to canonical schema
- **The specialist disciplines** — 9 disciplines that turn a narrow-scope agent from busy into compounding
- **The owner cascade** — voice.md as load-bearing, 13 files for the owner's deep record

## What Office Town added

Office Town is the Cloudflare-hosted, Goose-extension instantiation of the framework. New for this version:

- **Cloudflare-native substrate** — R2 + D1 + Vectorize + Workers AI instead of self-hosted markdown + R2 + custom Go daemon
- **Goose persona-context split** — agents are personas in Goose's registry; folders are project contexts. Cleaner separation than the Claude-Code-hosted Goanna model.
- **Structured ingestion via \`/api/ingest\`** — Workers AI per-collection extractors from external content
- **The town view dashboard** — collections as buildings, audit as Town Clock, real-time activity surfaced visually
- **Onboarding by dossier extraction** — your existing Claude/Gemini/ChatGPT writes a dossier; we route it into your cortex. ~5 minutes instead of an interview.

## Why it matters

The doctrine works because it was *discovered* in operation, not designed in theory. Pre-designed schemas drift. Schemas earned from 3+ instances stick. Pre-designed agent shapes fight reality. Shapes that survived a month of fleet operation describe what actually composes.

Office Town gets the benefit of that month of operation without re-living it. You inherit the doctrine; you can focus on the work the doctrine enables.

## See also

- [[your-cortex-explained]] — the concepts as Office Town uses them
- [[gravity-wells]] · [[engagement-trace]] · [[agent-autonomy-default]] — the doctrine concepts inherited directly
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
	// User + agent guides
	{
		collection: 'knowledge',
		slug: 'getting-started',
		canonical_filename: 'concept.md',
		title: 'Getting started with Office Town',
		body: DOC_GETTING_STARTED,
	},
	{
		collection: 'knowledge',
		slug: 'dashboard-tour',
		canonical_filename: 'concept.md',
		title: 'Dashboard tour — what each building means',
		body: DOC_DASHBOARD_TOUR,
	},
	{
		collection: 'knowledge',
		slug: 'wire-goose',
		canonical_filename: 'concept.md',
		title: 'Wire Goose to your cortex',
		body: DOC_WIRE_GOOSE,
	},
	{
		collection: 'knowledge',
		slug: 'install-officetowd',
		canonical_filename: 'concept.md',
		title: 'Install officetowd — local sync daemon',
		body: DOC_INSTALL_OFFICETOWD,
	},
	{
		collection: 'knowledge',
		slug: 'your-cortex-explained',
		canonical_filename: 'concept.md',
		title: 'Your cortex explained — owner cascade, traces, four shapes',
		body: DOC_YOUR_CORTEX_EXPLAINED,
	},
	{
		collection: 'knowledge',
		slug: 'how-agents-read-this',
		canonical_filename: 'concept.md',
		title: 'How agents read this cortex',
		body: DOC_HOW_AGENTS_READ_THIS,
	},
	{
		collection: 'knowledge',
		slug: 'goanna-the-inspiration',
		canonical_filename: 'concept.md',
		title: 'Goanna — the framework that inspired Office Town',
		body: DOC_GOANNA_THE_INSPIRATION,
	},
];
