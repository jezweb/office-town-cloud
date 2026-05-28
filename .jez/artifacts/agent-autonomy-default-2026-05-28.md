# Agent Autonomy Default

**Date**: 2026-05-28
**Status**: Design principle. Threads through every skill, every endpoint, every dashboard behaviour. Should be considered foundational alongside the gravity-wells doctrine.

## The principle

> **Asking the user is the last resort, not the first move.** Agents exhaust internal research (cortex query, ABR/MCP lookup, Vectorize semantic search, web search, raw-archive citation chase) before escalating to the user. When they do escalate, they present a recommended action with confidence and sources — not an open question. The user steers; the user doesn't solve.

This applies to every situation where an agent encounters ambiguity, missing data, or conflict. The default mode is: **try to resolve it yourself, then act with confidence + audit trail.**

## Why this matters

The cortex is asymmetric in two important ways:

1. **The agent has tools the user doesn't.** Workers AI for judgment, ABR/Xero/Jim2 MCP lookups, Vectorize semantic search, the raw archive, web search, the whole graph. The user has memory and intuition. Routing every ambiguity to the user wastes the agent's research capability and burns the user's attention.

2. **The user's attention is the scarce resource.** Every "please confirm" is a context switch. A cortex that asks 10 questions per ingestion isn't a cortex — it's a survey. The whole point of the moat (cortex-pattern.md) is that the agent acts independently because it knows the business backstory. Stopping to ask defeats the purpose.

## Operating rules

### Rule 1: Try research before asking

When the agent hits an ambiguity, it must first:
- Query the cortex for prior context (`wiki(action: get|search|related)`)
- Check derived_from raw sources cited by related entries
- Run a Vectorize semantic search for similar past situations
- Use MCP tools for external verification (ABR for ABNs, Xero for billing, Jim2 for cardfiles, etc.)
- If still uncertain, web search for ground truth

Only after these are exhausted does the question become user-facing.

### Rule 2: Confidence-scored auto-write beats blocking

When the agent decides to act with imperfect information, it writes the entry with:
- `confidence: 0.0-1.0` reflecting its certainty
- `review_status: pending | approved | rejected` (default approved at confidence ≥0.5)
- `status: stub` if required fields couldn't be determined
- `last_change_summary: "auto-extracted with confidence 0.65; primary contact inferred from email signature"`

The entry exists. The dashboard surfaces low-confidence entries in a "review queue" panel. The user reviews when they want to, not when the agent demands it.

### Rule 3: When escalation IS needed, present a recommendation

When the agent genuinely cannot resolve (e.g. two entries both look canonical, both ABR-confirmed, with conflicting fields), the escalation is:

> "I've found two possible Org records for 'Acme Corp'. Based on ABN match + shared domain, I recommend merging them with `acme-corp-pty-ltd` as the primary. The alternative is to keep them separate as sister entities. **Recommended action: merge.** Sources: [list]. Approve?"

Not: "Are these the same entity?"

The user is approving a decision, not solving the problem.

### Rule 4: Provenance > permission

Every action the agent takes is auditable. `wiki_audit` carries the `why:` field, the `agent_slug`, the timestamp, the prev_hash/new_hash. If the agent made the wrong call, the user can see exactly what happened and undo (via `wiki(action: archive)` or `wiki(action: supersede)`).

Audit makes autonomy safe. The agent doesn't need permission for every action because the record of every action is inspectable.

### Rule 5: User-pinned facts override agent inference

When a fact has `pinned: true` in frontmatter (set explicitly by the user), the agent treats it as ground truth. New auto-extracted content that conflicts with a pinned fact gets `status: stub` and `review_status: pending` — surfaced to the user.

Without `pinned`, the agent's normal resolution flow applies.

### Rule 6: Don't pad escalations

If the agent does need to ask, ONE question per escalation. Multiple-choice over open-ended. No leading "well actually you could think of it this way" preamble. Direct.

## Where this principle changes earlier design

Several places in the cortex docs defaulted to "surface to user" or "ask the user". Each needs updating. The patches:

### `cortex-shape-2026-05-28.md` Part 5 Q6 — Conflict handling

**Old default**: "Smoothed-over contradictions are a smell. Surface the disagreement, let the user resolve."

**Updated default**:
> The agent tries to resolve first. Auto-resolve when:
> - One source is clearly newer AND tagged as authoritative (e.g. ABR > invoice body)
> - The diff is formatting-only (whitespace, case, punctuation)
> - The newer source has higher-tier provenance
>
> Only when the conflict survives auto-resolution does the agent surface it — and then it surfaces a *recommended resolution* with sources, not the raw disagreement.

The librarian principle "don't smooth over contradictions" remains: if the resolution is genuinely ambiguous, the resolved entry includes a `discrepancy:` block in the body noting the disagreement and how it was resolved. The trail stays in the wiki for forensics.

### `cortex-shape-2026-05-28.md` Part 5 Q9.a — Peer-vs-umbrella

**Old default**: "Diagnostic question for the user: *Does the cortex owner have two separate service relationships, or one?*"

**Updated default**:
> The agent investigates the signals:
> - Are there separate domains? (DNS lookup, Rocket sites query, Synergy domain query)
> - Are there separate Xero contacts? (`xero_contacts` MCP)
> - Are there separate Jim2 cardfiles? (`jim2_cardfiles` MCP)
> - Is there separate support history? (D1 query: `wiki/projects/?` joined by org slug)
>
> If signals consistently indicate separate service relationships → peer records. If they consistently indicate operationally unified → umbrella section. Only when signals conflict does the agent surface — with a recommended call.

### `cortex-shape-2026-05-28.md` Part 5 Q9.d — Merge action

**Old default**: "auto-merge only on high-confidence + ABR-verified matches"

**Updated default**:
> Auto-merge at confidence ≥0.85 AND (ABR-verified OR shared canonical domain OR shared Xero contact id). Below that threshold, queue for review with a recommended action ("merge" / "keep separate as sisters" / "keep separate as unrelated") and the supporting signals. The user approves a recommendation; they don't solve from scratch.

### `curator-pattern-2026-05-28.md` — Curator's daily loop step 5

**Old default**: "Reconcile — when the new entry references an entity that already exists (Acme Corp in Xero matches Acme Corp in Jim2), curator surfaces the duplicate and either auto-merges (high confidence) or asks the user (ambiguous)."

**Updated default**:
> 5. **Reconcile** — when the new entry references an entity that already exists, curator first attempts auto-merge via the signals in Q9.d. If signals are insufficient, curator runs additional MCP lookups (ABR, Xero, Jim2) to gather more evidence. Only if multiple signals remain conflicting does curator surface to the dashboard's reconciliation queue — with a recommended action.

### `session-1-build-spec-2026-05-28.md` — review_status defaults

**Old default**: `review_status: confidence < 0.5 ? 'pending' : 'approved'`

**Updated default**: same threshold, but with an explicit pre-write enrichment step. If the extractor returns confidence < 0.5, the worker runs a secondary enrichment pass:
- Vectorize search for similar entries (might raise confidence by finding the canonical entry)
- Web search for ground truth on entity names
- ABR lookup if entity_type and name are present

If enrichment raises confidence above 0.5, the entry writes with `review_status: approved`. If still below, then `pending` and the dashboard surfaces it.

## Where this principle reinforces earlier design

These earlier decisions stand and become stronger under autonomy-default:

- **The status field lifecycle** (`active | stale | dormant | archived | stub`) lets the agent express degrees of certainty *in the data itself*. A stub entry is the agent saying "I created this, I'm unsure of some fields, please review when convenient."
- **`derived_from:` provenance** means every auto-action is traceable to its source content. The user can audit any decision by following the trail.
- **`wiki_audit.why`** is non-optional. Every write explains its reason. Bad agent decisions are visible and correctable.
- **Watching-brief promotion thresholds** are agent judgment, not user gates. The agent decides when n=1 observation graduates to n≥3 promotion.
- **The librarian's modes** (reactive/bootstrap/quiet-cycle/cascade-refresh) all proceed without user prompting. Librarian works in the background; user reviews changes via the dashboard if interested.

## The dashboard's role

The dashboard becomes the **review surface**, not the **input surface**. Panels to add:

| Panel | What it shows |
|---|---|
| Review queue | Entries with `review_status: pending` — agent's "I need a check" pile |
| Reconciliation queue | Peer-vs-umbrella + merge candidates with recommended actions |
| Stubs | Entries with `status: stub` (agent wanted to write but couldn't fill required fields) |
| Recent activity | Last 24h of `wiki_audit` rows — what the agent has been doing |
| Lint failures | Orphan notes, broken links, schema-version drift — auto-detected, awaiting cleanup |
| Watching briefs | Single-instance observations the curator has captured but not yet promoted (n=1 patterns) |

The user opens the dashboard when they want to. They aren't summoned by an interruption.

## The two-mode operation

Office Town agents operate in two modes:

**Active mode** — user is in the conversation. Agent can ask short, recommended-action questions if genuinely stuck. But still bias toward research-first.

**Autonomous mode** — agent is running on schedule (curator's cron, librarian's quiet-cycle, cascade-refresh after schema bump). User isn't watching. Every "I'd like to ask" must become "I've decided X with confidence Y; surfaced in review queue if you want to verify."

The same skill works in both modes. What changes is the escalation behaviour:
- Active: maybe ask, with a recommended-action framing
- Autonomous: write with confidence + `review_status`, never block

## What this is NOT

- **Not "do whatever you want without checking"**. The agent's confidence + provenance + audit are real. Low-confidence decisions land in the review queue. High-confidence decisions ship.
- **Not "ignore the user"**. The user can pin, archive, supersede, correct at any time. The cortex respects user pins as ground truth.
- **Not "skip verification"**. Verification by inspection (look at the actual output) is still the discipline. Autonomy-default is about *who initiates* the verification — the agent surfaces what needs checking; the user inspects when they choose.
- **Not "blame the audit log"**. If the agent makes systematic errors, that's a prompt or skill failure, not "the user should've checked." Fix the upstream cause.

## Worked example

**Situation**: Curator ingests an email mentioning "Sarah at Acme Corp". The cortex already has a `contacts/sarah-smith` from Xero and an `orgs/acme-corp-pty-ltd`. The email signature says "Sarah Smith — Acme Corporation".

**Naive flow (old default)**:
1. Curator detects ambiguity (Sarah Smith vs Sarah at Acme — same person?)
2. Surfaces to user: "Is this the same Sarah?"
3. User: "Yes."
4. Curator writes the link.

**Autonomy-default flow**:
1. Curator detects ambiguity
2. Queries `wiki(action: get, slug: contact-sarah-smith)` → finds existing record with org=acme-corp-pty-ltd
3. Vectorize search confirms the email signature matches the existing contact's stored signature pattern
4. Confidence: 0.93. Auto-link.
5. Audit: `why: "linked email mention to existing contact-sarah-smith based on org match + signature similarity"`
6. User sees the link in the audit if they look; otherwise it just works.

The user got back ~30 seconds and a context switch they didn't need.

## Where the agent SHOULD still ask

There are situations where autonomy-default doesn't apply:

- **Destructive actions on user-pinned content** — if the agent wants to archive or supersede an entry the user has pinned, that requires explicit approval.
- **Cross-tenant decisions** (when multi-tenant ships) — agent never silently writes to a different tenant's cortex.
- **Money/billing-affecting actions** — invoice changes, payment recording, etc. (Not relevant to Office Town cortex but matters for the wider Goose tools.)
- **Communications on behalf of the user** — agent doesn't send emails/messages without explicit approval. (This is already in curator's role definition.)
- **Schema migrations that delete data** — bump schema versions freely, but if migration would delete entries, queue for review.

For everything else: research-first, decide-second, write-with-confidence, surface-via-dashboard.

## Implementation checklist

- [ ] Patch `cortex-shape-2026-05-28.md` Q6 conflict handling
- [ ] Patch `cortex-shape-2026-05-28.md` Q9.a peer-vs-umbrella
- [ ] Patch `cortex-shape-2026-05-28.md` Q9.d merge action thresholds
- [ ] Patch `curator-pattern-2026-05-28.md` curator-loop step 5
- [ ] Patch `session-1-build-spec-2026-05-28.md` to add the pre-write enrichment step
- [ ] Add "review queue" + "stubs" + "reconciliation queue" + "lint failures" + "watching briefs" panels to the dashboard backlog
- [ ] Update each starter collection's `AGENTS.md` (the seed schema docs) to include autonomy-default-compatible language: "the agent writes with confidence + status; user reviews via dashboard"
- [ ] Add the two-mode operation note (active vs autonomous) to the curator subagent definition when it's written

## Related docs

- `cortex-pattern-2026-05-28.md` — strategic framing (this principle is what makes "agent does the work" real)
- `cortex-shape-2026-05-28.md` — Q1-Q9 conventions (several get patched per this doc)
- `curator-pattern-2026-05-28.md` — curator architecture (step 5 gets patched per this doc)
- `session-1-build-spec-2026-05-28.md` — build spec (review_status defaults get the enrichment step added)
