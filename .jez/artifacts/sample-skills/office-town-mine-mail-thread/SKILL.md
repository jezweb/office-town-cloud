---
name: office-town-mine-mail-thread
description: Pull a Gmail thread into the cortex as structured typed entries with full provenance. Fetches the thread via the user's Goose-installed Gmail MCP, archives the raw messages to wiki/raw/gmail/, runs Workers AI extraction against the matching collection schema (orgs/contacts/projects/decisions), writes the typed entries via /api/ingest, runs pre-flight collision check before mint, appends engagement traces to mentioned entities, sets confidence + status appropriately. The curator's primary inbound skill. Without it, email knowledge stays trapped in Gmail.
---

# Office Town: Mine Mail Thread

The first end-to-end loop closing skill. Email comes in via Gmail; cortex gets typed entities + provenance. Curator's bread and butter.

## When to invoke

- **User signal** — *"pull this email"*, *"add this thread to the cortex"*, *"save this conversation"*, *"capture this exchange"*, *"mine the Sarah thread"*.
- **Curator session auto-trigger** — when a Gmail thread is referenced by URL/ID in conversation and the agent decides it warrants cortex capture (high-confidence signal: thread mentions an org/contact/project that already has a cortex entry, OR mentions a decision worth recording).
- **Inbox sweep follow-on** — when `office-town-sweep-inbox` (the agent-routing one) surfaces a comms brief that references a Gmail thread worth deep capture.

Don't run on every email — that's manufactured work. Run when the thread contains substantive new information: decisions made, commitments given, new contacts surfacing, projects discussed. Marketing emails, notifications, and low-content threads aren't worth the Workers AI cost.

## Procedure

### 1. Fetch the thread via Gmail MCP

```
gmail_threads(action: get, threadId: <thread-id>)
```

Returns the full thread JSON with messages, headers, attachments. Note the thread ID, message IDs, sender + recipient list, subject, message count.

If the user gave you a URL not an ID, parse the ID from the URL pattern `mail.google.com/mail/.../<thread-id>` — the trailing fragment is the thread ID.

### 2. Archive raw to `wiki/raw/gmail/`

```
wiki(action: write, key: "wiki/raw/gmail/thread-<thread-id>.md", body: <raw-thread-as-markdown>)
```

Each thread becomes one markdown file. Frontmatter:

```yaml
---
source_system: gmail
source_id: thread-<thread-id>
fetched_at: <ISO timestamp>
participants: [<email-address-list>]
message_count: <N>
subject: <subject-line>
---
```

Body: each message as a `## YYYY-MM-DD HH:MM | <sender-name> <sender-email>` section with the message body.

This is immutable — never edit raw files. If the thread is updated upstream (new reply), the next mine writes a NEW raw file with the same thread-id but a later `fetched_at`. The cortex carries both for forensics.

### 3. Pre-flight collision check

Before extracting + minting, check whether the entities mentioned in the thread already exist in the cortex:

```
office-town-pre-flight-collision-check (
  candidate_orgs: <list-of-domain-stems-mentioned>,
  candidate_contacts: <list-of-email-addresses>,
  candidate_decisions: <list-of-decision-titles-detected>
)
```

Returns a list of existing slugs to LINK to vs new slugs to MINT. If everything is existing, skip to step 5. If everything is new and the thread has only 1 message, file as a watching brief instead of minting (see step 4 negative case).

### 4. Run Workers AI extraction against the right collection

Pick the collection based on the thread's primary content:

| Content shape | Collection | Extractor focus |
|---|---|---|
| New org/contact introduction, biz development chat | `orgs` + `contacts` | Extract Org + Contact entries; link them |
| Project update, status, milestone, kickoff | `projects` | Extract Project entry; link to existing org/contacts |
| Decision made, choice rationalised | `decisions` | Extract Decision entry; link to involved orgs/contacts/projects |
| Concept emerging, learning, methodology | `knowledge` (after 3-instance threshold) | Extract candidate; file as finding first if n<3 |
| Routine comms with existing org | (no mint; trace-append only) | Skip to step 6 |

Call `/api/ingest`:

```
POST /api/ingest
{
  content: <thread body as markdown>,
  target_collection: <chosen above>,
  source_ref: {
    raw_path: "wiki/raw/gmail/thread-<thread-id>.md",
    source_system: "gmail",
    source_id: "thread-<thread-id>",
    fetched_at: "<ISO timestamp>"
  },
  agent_slug: "curator",
  why: "mined Gmail thread <thread-id>"
}
```

The endpoint runs the per-collection extractor + writes the typed entry. Returns the new entry's slug + confidence.

### 5. If confidence < 0.7, attempt enrichment before accepting `status: stub`

Per `agent-autonomy-default-2026-05-28.md`: don't surface a stub to the user without trying to enrich it. For low-confidence entries:

- Run `wiki(action: semantic, query: <entity-name>)` to see if Vectorize finds a near-match worth merging
- If the entity is an org with a domain, run the ABR MCP (or other entity-registry MCP) to verify legal name + entity type
- Run web search for one-line context if domain + name don't anchor enough

If enrichment lifts confidence above 0.7, write back the enriched fields. If not, accept `status: stub` and let the dashboard surface it.

### 6. Append engagement traces to mentioned entities

For every existing entity the thread mentioned (orgs + contacts), append a one-line trace:

```
office-town-trace-append (
  entity_slug: <slug>,
  trace: "<ISO date> / <sender-name> (gmail) / <verb-phrase with outcome> / thread-<thread-id>"
)
```

Engagement-trace primitive: `date / actor (channel) / verb / ref-id`. Actor field non-negotiable.

### 7. Cite the source

For every typed entry just written, call `office-town-cite-source` to ensure `derived_from:` includes the raw archive path. The /api/ingest endpoint sets this automatically, but verify — provenance is non-optional.

### 8. Stamp the mine event in your journal

Append to today's journal:

```
## Mine mail thread — HH:MM
Thread <thread-id> ("<subject>")
  Existing entities linked: <count> (<slugs>)
  New entries minted: <count> (<slugs> with confidence)
  Stubs surfaced: <count>
  Traces appended: <count>
```

## Non-obvious disciplines

- **Don't mint a new Org if the thread mentions a known domain.** Pre-flight collision check (step 3) catches the obvious cases. The harder case is when the same Org has aliases — the org's `aliases:` frontmatter array is the canonical list. Search it before minting.
- **One thread, multiple typed entries — file each separately, link them.** A thread that contains an org introduction AND a decision should produce two entries (the org, the decision), linked via wiki_links. Don't conflate them into one.
- **The thread might be partially relevant.** Three messages of routine chat + one message announcing a decision = mine only the decision. Body extraction should focus, not summarise the whole thread.
- **Don't auto-extract from threads the user hasn't yet read themselves.** If the thread is unread in the user's Gmail, prefer filing a comms brief than minting silently. Surface to the user first.
- **The raw archive grows fast.** A typical user has ~50 substantive threads/month. Plan for ~600/year per active user — that's the volume Vectorize indexes against.

## Composition with other skills

| Skill | Composition |
|---|---|
| `office-town-pre-flight-collision-check` | Called as step 3; this skill cannot mint without it |
| `office-town-cite-source` | Called as step 7; ensures provenance on every new entry |
| `office-town-trace-append` | Called as step 6 for each existing entity mentioned |
| `office-town-reconcile-org` | If step 3 surfaces "maybe duplicate" candidates, call reconcile-org to judge |
| `office-town-mine-chat-room` | Sibling skill for Slack/chat — same shape, different source |
| `office-town-mine-doc` | Sibling skill for Google Docs / Word — same shape, different parser |

## Verification

- [ ] `wiki/raw/gmail/thread-<id>.md` exists with full thread body
- [ ] One or more typed entries in `wiki/<collection>/<slug>/` with `derived_from:` pointing to the raw path
- [ ] Pre-flight collision check ran (no duplicate orgs minted)
- [ ] For every existing entity mentioned, an engagement trace exists in their `entity.md § Recent`
- [ ] If any entry has `confidence < 0.7`, enrichment was attempted before `status: stub` was accepted
- [ ] Today's journal has a mine event entry with the count breakdown

## See also

- `office-town-mine-chat-room` — Slack/chat parallel
- `office-town-mine-doc` — Google Docs / Word parallel
- `office-town-pre-flight-collision-check` — required pre-step
- `office-town-cite-source` — required post-step
- `office-town-reconcile-org` — when collision check surfaces ambiguity
- `office-town-trace-append` — appending engagement traces
- Framework doc § 14 (Living Memory) — the broader synthesis loop this skill participates in
- `/api/ingest` endpoint spec — `session-1-build-spec-2026-05-28.md` Phase 1.3

## Last updated

2026-05-28 — initial author, adapted from Goanna's `mine-email-thread` for Office Town's `/api/ingest` write path + Goose Gmail MCP. Composes with the pre-flight + cite-source + trace-append baseline.
