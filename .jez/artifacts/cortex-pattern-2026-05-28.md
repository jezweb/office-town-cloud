# Cortex Pattern — Office Town as a 20-Year Business Cortex

**Date**: 2026-05-28
**Status**: Strategic design note. Captures the bigger picture that the curator + structured-ingestion + graph + audit + provenance pieces all serve.

## The problem

Imagine you've run a business for 20 years. The knowledge is real but it's everywhere:

- ~500,000 emails across multiple Gmail mailboxes
- 12,000 Slack messages with the team
- 8,000 invoices in Xero
- 4,000 cardfiles in Jim2
- 1,200 Google Docs (proposals, meeting notes, SOPs)
- 600 GitHub repos (client work, internal tooling, abandoned experiments)
- 300 client websites hosted on Rocket.net + Cloudflare
- 200 domains in Synergy Wholesale
- Hundreds of conversations that only exist in someone's head
- Thousands of decisions made in meetings with no formal record

You want to be able to ask, of either a human or an agent:

- "What do we know about Acme Corp?" — and get a coherent answer pulling from email, invoices, project work, and decisions
- "Who decided we'd switch from MailChimp to SMTP2Go, and why?" — and get the thread + the rationale + the date
- "Show me all unresolved support issues for clients we've billed >$50K this year" — joining CRM + finance + email + ticketing
- "We did a project like this 4 years ago — what did we learn?" — fuzzy lookup that returns a structured project entry with relevant decisions
- "What's the current relationship with Sarah at Acme?" — a contact entry with role + history + last interaction + linked projects

The off-the-shelf answer is "embed it all and RAG it." That answer is wrong. Here's why, and what the right answer looks like.

## Why RAG-only fails the 20-year-cortex test

RAG (chunk → embed → vector-search → LLM-summarise) is the dominant pattern in the PKM / "second brain" space. OpenHuman is a sophisticated implementation. It does ~3 things well:

1. **Recall**: "find me content related to X" — semantic search returns relevant chunks
2. **Summarise**: "what does the recent batch of stuff say about Y" — LLM rolls up chunks into prose
3. **Connect**: "items that mention both A and B" — co-occurrence in chunks suggests relationships

But RAG-only fails at four jobs the 20-year cortex requires:

### 1. Entities have identity beyond text

"Acme Corp" appears in 800 emails, 12 invoices, 4 Jim2 cardfiles, 6 Google Docs, and 3 expired Slack channels. RAG returns 47 chunks across these. None of them are *the* Acme Corp record. The agent has to re-derive that Acme is one organisation from 47 fragments every time.

A structured cortex stores **Acme Corp once**, with `wiki_links` to its contacts, projects, invoices, conversations, sites. The 47 fragments become *evidence* for the Acme record, not substitutes for it.

### 2. Facts have temporal validity

"Sarah is the primary billing contact at Acme" was true in 2019. By 2022 it was Tom. By 2024, Acme had been acquired and the contact is now Marcus at NewCo. RAG returns whichever chunk it ranks highest — which might be the 2019 email if it was longer and matched the query better.

A structured cortex stores Sarah, Tom, and Marcus as separate Contact entries, with `valid_from` / `valid_until` fields and a `current_billing_contact` link on the Org that gets updated. The audit log shows when it changed. The query "who's the current billing contact" returns the right one because the data model knows what "current" means.

### 3. Provenance is non-optional

The agent says "I see you're invoicing Acme $X this month, which is consistent with the 2024 renewal terms." The human asks "where did you get that?" If the answer is "vibes from the chunks I retrieved", the human can't verify, can't correct, can't trust.

A structured cortex stores `derived_from: [invoice-acme-2024-07.md, decision-acme-renewal-2024.md, contract-acme-2024.pdf]` on every auto-generated claim. The human clicks the citations. They confirm or correct. The cortex learns.

### 4. The graph is the value

"Who are all the contacts at orgs we worked with in 2023 where the project ended badly?" That's a graph traversal: orgs → projects → outcomes → contacts. RAG doesn't traverse graphs; it ranks vectors. You can sometimes get the right answer by luck of chunking, but you can't reliably query relationship shape.

A structured cortex with explicit `wiki_links` (typed edges: works_at, owns_project, decided_by, billed_to, last_contacted_at) answers graph questions by graph traversal. Cypher-shaped or SQL-shaped, doesn't matter — what matters is that the edges are first-class data, not implied by text co-occurrence.

## The four lookup shapes the cortex must answer

A cortex that handles 20 years of business knowledge needs all four:

| Shape | Example | Implementation |
|---|---|---|
| **Structured lookup** | "Show me Acme's current primary billing contact" | D1 query over `wiki_entries` joined with `wiki_links` filtered by edge type + tag |
| **Search lookup** | "Anything mentioning the May 2024 outage with FastMail" | Vectorize semantic search + FTS5 over `wiki_entries.body` + Inbox |
| **Temporal lookup** | "What did we know about Acme as of March 2023?" | `wiki_audit` filtered by date; replay state via revision_at-date semantics |
| **Graph lookup** | "All decisions involving Acme + the database team in 2024" | `wiki_links` traversal across multiple edge types |

Office Town's existing primitives cover three of these directly:
- `wiki_entries` + `wiki_collections` → structured lookup
- `wiki_audit` → temporal lookup
- `wiki_links` → graph lookup

What's added for the fourth (search lookup): Vectorize embedding the body text + frontmatter, and FTS5 on top for keyword. Both are already in the architecture.

So the foundation exists. What's *not* yet built is the **ingestion pipeline** that takes scattered external content and lands it into this structured form.

## The four-tier ingestion model

Not all incoming content deserves the same treatment. Different tiers, different cost.

### Tier 1 — Structured-known: deterministic ETL from external systems

Data from systems where we already know the shape. The curator pulls and maps deterministically, no LLM in the hot path:

| Source | Maps to |
|---|---|
| Xero contacts | `orgs/<slug>/entity.md` (with derived_from to Xero contact ID) |
| Xero invoices | `finance/invoices/<n>.md` |
| Jim2 cardfiles | `orgs/<slug>/entity.md` (merged with Xero via reconciliation) |
| Jim2 jobs | `projects/<slug>/project.md` |
| GitHub repos | `projects/<slug>/project.md` (with derived_from to GitHub repo URL) |
| Synergy domains | `properties/domains/<domain>.md` |
| Rocket.net sites | `properties/sites/<domain>.md` |
| Google Contacts | `contacts/<slug>/contact.md` (deduplicated against Xero/Jim2) |

These extractors are written once per source. They're not LLM-driven — they're code that knows the source schema. **Cheap, deterministic, high-confidence.**

### Tier 2 — Structured-extractable: LLM-driven parse from semi-structured content

Content that has shape if you look closely. Email threads, Google Docs, Slack channels.

Pipeline:
1. **Stage** in Inbox with content-hash ID
2. **Classify** with Workers AI (gpt-oss-20b) — "what collection does this belong to?" (decision / project / contact / conversation / inbox-keep)
3. **Extract** per-collection — call the right extractor with the source content + the collection's `required_fields_json` schema. Workers AI returns typed JSON. Worker writes the entry.
4. **Link** — populate `wiki_links` to mentioned entities (the email mentions Sarah at Acme → link to existing contact-sarah-acme + org-acme)

This is the heart of `structure-shaped-ingestion`. Per-collection extractor prompts are versioned in the wiki itself (`wiki/skills/extractors/...`) so they can evolve.

### Tier 3 — Unstructured-but-indexed: keep, embed, surface lazily

Content where the value is "I might want to find this later" but the structure is too fuzzy or the volume too high:
- The 47 random PDFs in a shared Drive folder
- The 12-year-old email thread that touches on a process we abandoned
- A long forum discussion someone bookmarked
- A 100-message Slack thread about a meme

These go into Inbox + get embedded into Vectorize. They're searchable but not structured. **Hotness gating** (per OpenHuman pattern) decides when to promote:
- An Inbox entry referenced by ≥3 wiki_links graduates to structured
- An Inbox entry queried via vector search ≥5 times in 30 days graduates
- Otherwise it sits in Inbox; not free but not expensive

### Tier 4 — Explicitly-not-ingested: PII, legal, financial-above-tier

Content that the curator **must not pull**, or pull only under explicit scope.

- Personal data outside the business scope (employees' personal email folders)
- Legal documents that need human-only access
- Financial data above a tier (Xero P&L, board minutes)
- Whatever the user/admin marks "do not crawl"

The curator's tool whitelist + per-skill scope flags enforce this. Audit logs every refusal with the reason ("source labelled 'personal-inbox', curator skipped").

## Reconciliation — the hardest part

The 20-year cortex's hardest problem isn't the volume. It's that the same entity exists multiple times across sources, and they don't always agree.

**Example**: "Acme Corp"
- Xero: "Acme Corp Pty Ltd" (ABN 11 222 333 444, billing address X)
- Jim2: "Acme Corporation" (legacy entry from 2015, address Y)
- Google Contacts: "Acme" (contact Sarah, phone Z)
- Email mentions: "acme.com.au" (250 threads), "acmecorp.com.au" (40 threads, old domain)
- A 2018 contract: "Acme (subsidiary of Globex)" — Globex is the parent we hadn't recorded

The cortex needs:
1. **Entity resolution** — match these as one org (Vectorize + name normalisation + ABN match + domain match)
2. **Conflict surfacing** — billing address X vs Y? Newer wins or user decides
3. **Provenance per fact** — every claim about Acme cites which source it came from
4. **Versioning** — old domain `acmecorp.com.au` stays in the record as `previous_domain: [acmecorp.com.au from 2015-2018]`
5. **Parent/child relationships** — the Globex linkage discovered in 2018

Reconciliation lives in two places:

- **At ingest** — when extracting a new Contact/Org, run a similarity check against existing entries. If high confidence (≥0.92), append `derived_from` to the existing entry. If medium (0.7-0.92), surface to user. If low, create new.
- **As a recurring skill** — `office-town:reconcile-orgs` scans for likely duplicates monthly. Surfaces candidates.

This is the part where LLM judgement actually pulls weight. Embedding-based name match catches most easy cases ("Acme Corp" vs "Acme Corporation"). LLM-driven match handles the harder ones ("Acme" + ABN match + domain match → confident merge).

## Temporal validity — the second-hardest part

In a 20-year cortex, *most facts have a time stamp on them whether you record it or not*. The cortex should store the timestamp explicitly.

Schema-level changes that support this:

- Every `wiki_links` row has `valid_from` and `valid_until` (nullable, `null` = current)
- `wiki_audit` already captures when entries change — replay state with `SELECT * WHERE audit_date <= '2023-03-01'`
- Collections that contain facts about people (contacts, employment, billing-contacts) carry an `effective_period` field in frontmatter
- The dashboard's "as of date" toggle lets a user view the cortex's state at any past date

This is what makes "what did we know in March 2023?" answerable. It's also what makes "Sarah was the contact in 2019, Tom from 2020-2023, Marcus current" possible without throwing away history.

## The cost economics

A 20-year ingest has real money in it. Workers AI tokens, Vectorize storage, R2 storage, D1 row count. Rough estimate for a 500K-email + 12K-Slack + everything else cortex:

| Step | Items | Per-item cost | Total |
|---|---|---|---|
| Classify (Inbox → collection) | 800K | ~150 input tokens via gpt-oss-20b | ~$30-60 in Workers AI |
| Extract (Tier 2 structured) | 100K (only 12% of inbox materialised) | ~500 input + 200 output tokens | ~$80-120 |
| Embed (Vectorize) | 800K | ~200 tokens via bge-base-en-v1.5 | ~$40 |
| R2 storage | 800K markdown files (~5KB avg) | $0.015/GB-month | ~$0.06/month |
| D1 rows | 800K wiki_entries + ~200K wiki_links | $0 below 5M rows | $0 |
| Vectorize | 800K × 768-dim vectors | $0.10/100M dims-month | ~$6/month |

**Total one-time ingest: ~$150-220 in Workers AI**. Ongoing: ~$6-8/month storage. Affordable for a personal/business cortex.

This is where the OpenHuman "hotness-driven materialisation" pattern matters — we DON'T extract Tier 2 for every Inbox entry. We extract for the ~12% that get referenced or queried. The other 88% live in Inbox with embeddings only. Costs scale by demand, not volume.

## What this unlocks — the cortex multiplier

When all of this is in place, every agent interaction with Office Town carries **inherited context** the agent didn't have before:

- Agent asked about Acme → has the org entry + contacts + projects + invoices + decisions + recent emails, structured and queryable, in the prompt
- Agent drafting an email to a known client → knows their history, last interaction, current project, billing status
- Agent reviewing a proposal → cross-references past similar proposals (graph + vector), past outcomes, lessons learned
- Agent making a quote → references "we usually quote 30% margin for projects of this shape" because past projects + outcomes are queryable

The cortex isn't "data the agent searches." It's *the substrate the agent thinks against*. The agent gets dramatically more capable not because the model is better, but because the context is *real*, structured, current, and provenance-tracked.

**That's the moat.** Generic agents pull from web search + their training data + a chunk store. A cortex-equipped agent pulls from 20 years of structured business reality. The gap between those two experiences is enormous.

## The human side — browsing 800K entries

The cortex isn't only for agents. Humans need to browse it too. UX considerations:

1. **Faceted dashboard** — filter by collection / org / date / tag / hotness
2. **Saved views** — "current open projects", "billing-tier-1 contacts", "decisions this month", "this week's digest"
3. **Top-of-mind** — manually pinned + auto-surfaced (recently changed, recently queried, hotness > threshold)
4. **Inbox browser** — flag-from-inbox UX so the human can manually promote things the auto-classifier missed
5. **Reconciliation queue** — "we found 12 possible duplicates this week, confirm or skip" — the human-in-the-loop maintenance UI
6. **Audit time-travel** — pick a date, see the cortex as it was; useful for "what did we know when we made decision X"
7. **Provenance hover** — hover on any auto-generated claim, see the derived_from sources, click through

Many of these are session-of-work to add to the dashboard. None require new infrastructure beyond what unified-write-path already gives us.

## How this maps to the build plan

The cortex pattern doesn't replace the roadmap — it gives it meaning. Each Tier 1/2 item earns its place by serving the cortex play:

| Roadmap item | Cortex role |
|---|---|
| Structure-shaped ingestion Phase A (`/api/ingest`) | Tier 1 + Tier 2 write path |
| Inbox collection + `derived_from` | Tier 3 staging + provenance |
| Curator role + skills bundle | Tier 1 + Tier 2 + Tier 3 driver |
| Frontmatter form editor | Human correction surface for extracted entries |
| Kanban editor | One projection over the cortex's tasks view |
| Vectorize metadata filters | Search lookup over a specific collection |
| Hotness-driven materialisation | Tier 3 → Tier 2 promotion economics |
| Audit log time-travel UI | Temporal lookup surface |
| Cron execution loop | Drives the recurring curator + digest cycles |
| Skills hooks (why:) | Audit-quality enforcement during ingestion |

Build sequence to get to a working cortex from where we are today:

1. **Foundation**: `/api/ingest` (Phase A) + Inbox collection + curator role + `curate-inbox` skill — ~2 sessions
2. **Reconciliation**: `reconcile-org` skill + Vectorize similarity helpers — ~1 session
3. **Demo**: ingest one source (Gmail) end-to-end + dashboard view — ~1 session
4. **Provenance**: `derived_from` schema + cite-source skill — ~half session
5. **Temporal**: `valid_from`/`valid_until` on links + as-of-date dashboard — ~1 session
6. **Hotness**: reference-count column + decay job + promotion logic — ~1 session
7. **Tier 1 ETLs**: deterministic extractors for Xero, Jim2, GitHub, Rocket, Synergy — ~half session each (~3 sessions total)

Total: ~9-10 sessions to a minimum-viable 20-year cortex. Easily within reach.

## What we explicitly defer

These earn their place but later in the curve:

- **Multi-tenant cortex** (one worker, multiple separate cortexes for different clients/orgs) — Tier 3 on the roadmap; cortex pattern works fine for single-tenant first
- **Real-time push events** (Gmail watch, Slack events) — only useful once curator-on-demand is dialled in
- **Cross-tenant intelligence** (anonymised patterns across multiple cortexes, with permission) — interesting but far future
- **External API surface for the cortex** (other apps querying via REST) — only useful once the data is rich
- **Voice interface to the cortex** — v1.2 voice room work, separate decision

## The honest tradeoffs

Building a structure-shaped cortex isn't free:

| Pro | Con |
|---|---|
| Agent has real context, not just retrieved chunks | More upfront effort than "embed + RAG" |
| Provenance is first-class | Extractors need maintenance as source schemas change |
| Reconciliation produces clean entity records | Reconciliation is genuinely hard; needs LLM judgement |
| Temporal validity preserves history | Schema must be designed for time-travel from day 1 |
| Graph queries become possible | Graph queries need a graph layer (current: D1 + wiki_links; future: maybe a real graph store?) |
| Cost scales by attention, not volume | Hotness gating adds complexity; takes 2-3 cycles to tune |

We bet on these tradeoffs being worth it because the cortex *can't* be built any other way. A pure RAG store gets you to "search my stuff" but never to "the agent knows my business."

## Related docs

- `curator-pattern-2026-05-28.md` — agent-side architecture (which Goose subagent, which skills, which connectors)
- `structure-shaped-ingestion-2026-05-28.md` — worker-side extractor pipeline (the `/api/ingest` endpoint, classifier, per-collection extractors)
- `openhuman-research-2026-05-28.md` — patterns we're adopting (hotness, derived_from, content-hash IDs) and rejecting (Composio, tree-only)
- `unified-write-path-2026-05-28.md` — write architecture this all rides on
- `roadmap-discussion-2026-05-28.md` — tiered candidate additions, now reframed against the cortex play
