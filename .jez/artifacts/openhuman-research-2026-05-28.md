# OpenHuman (TinyHumansAI) — Research Note

**Researched**: 2026-05-28
**Source**: General-purpose research agent dispatch by Jez

## Which project

[OpenHuman by TinyHumansAI](https://github.com/tinyhumansai/openhuman) — open-source (GPL-3), Rust core + TypeScript desktop, ~daily releases (v0.53.43 as of mid-May 2026). Marketing at `tinyhumans.ai`, docs at `tinyhumans.gitbook.io/openhuman`. Local-first personal-knowledge agent with external-source ingestion.

Disambiguated from: Open Humans (citizen-science data donation, wrong domain), the openhuman.ai marketing domain (same project), older Stanford/PKM forks (inactive).

## Architecture

**Ingestion**: ~118 OAuth connectors via [Composio](https://composio.dev) (Gmail, Slack, Notion, GitHub, Drive, Calendar, Linear, Jira, Stripe, etc.). Each active connector auto-fetches every ~20 minutes into a background pipeline:

```
canonicalize → chunk → fast-score → persist → enqueue follow-up
```

Hot path is **deterministic and LLM-free**. Heavy work (embeddings, entity extraction, deep-score) runs async in workers with lease tracking for crash recovery.

**Storage**: Local SQLite file (`chunks.db`) holding chunks, scores, summaries, entity index, jobs, hotness, leases. Plus a `wiki/` markdown folder browsable in Obsidian.

**Memory shape**: Not a property graph and not RDF — **tree-based hierarchy with three independent scopes**:
- **Source trees** — rolling buffer per Gmail label / Slack channel / doc set
- **Topic trees** — per-entity, built lazily based on "hotness" (how often the entity gets referenced)
- **Global tree** — one digest per day

Entities (people, projects, repos, etc.) extracted during the `extract_chunk` async job. Files use `[[wiki-link]]` syntax. Every summary's frontmatter carries provenance (source IDs, time range, scope) so claims trace back to source chunks.

## 5 patterns Office Town could adopt

### 1. Two-tier write path: deterministic hot path, async LLM workers

**Their pattern**: write to disk synchronously, enqueue LLM work for later.

**Where we are today**: our `/api/sync/object/<key>` PUT calls Workers AI inline for frontmatter repair, and only enqueues vectorisation. The repair step adds 500-2000ms latency to every PUT on broken-frontmatter writes.

**What we could change**: move frontmatter repair into the indexing queue. PUT becomes synchronous (D1 + R2 only). The queue consumer parses YAML, repairs via gpt-oss-20b if needed, and writes a follow-up PUT with the repaired version. Daemon sees the repaired version on next sync cycle. Faster, more resilient.

**Effort**: ~50 lines, ~half a session.

### 2. Three independent tree scopes (source / topic / global)

**Their pattern**: three views over the same chunks — source-rooted, entity-rooted, time-rooted.

**Where we are today**: we have entity-as-folder (matches their topic-tree roughly). No source-tree or global-tree yet.

**What we could add**: 
- **Source trees**: per-collection daily/weekly rollup of changes (e.g. `wiki/projects/<slug>/sessions/2026-05-28.md` already vaguely matches this — formalise it)
- **Global tree**: a daily digest entry at `wiki/global/2026-W22.md` summarising the week's changes across all collections. Cheap if generated from `wiki_audit` already

**Effort**: ~1-2 sessions for both. Would need a cron job + a workers-AI summariser using gpt-oss-20b.

### 3. Hotness-driven lazy materialisation

**Their pattern**: don't build the per-entity summary until that entity is referenced often enough.

**Where we are today**: we vectorise + index every entry on every change. Wasteful when 95% of entries are rarely touched.

**What we could add**: a "reference count" column on `wiki_entries` (number of `wiki_links` pointing at it + number of MCP `wiki(action:get)` calls). Run expensive operations (entity-extraction-from-body, related-entity-suggestion) only for entries above a threshold.

**Effort**: small. ~30 lines + a tiny scheduled job that decays counts.

**Why this matters most**: it's the lever that makes "ingest your whole inbox" tractable without a Workers AI bill that gets out of hand.

### 4. Provenance in frontmatter via `derived_from:` arrays

**Their pattern**: every auto-generated/summary document has `source_ids: [...]` and `time_range: ...` in frontmatter. Agents can cite cleanly.

**Where we are today**: we have `wiki_audit` (mutation history) and `wiki_links` (human-curated cross-references). No first-class "this entry was derived from these other entries" relationship.

**What we could add**: a `derived_from:` frontmatter array on auto-generated rollups (e.g. weekly digests, project summaries). Mirrored in a `wiki_derived_from` table so MCPs can query "what was used to make this".

**Effort**: small. ~1 frontmatter convention + a table.

### 5. Content-addressed chunk IDs (~3k tokens)

**Their pattern**: ingested external content gets hashed-content IDs separate from human-curated entity slugs. Lifecycle state machine: `pending → admitted → buffered → sealed → dropped`.

**Where we are today**: human-curated wiki entries have slug-based IDs. No separate ingest layer yet.

**Why we'd want it**: future feature where Office Town can pull from Gmail / GitHub / etc., the daemon could write ingested raw chunks to `wiki/inbox/<sha-prefix>/<short-id>.md` with content-hash IDs. An async agent merges these into entity entries by hotness.

**Effort**: medium. New table, new collection, new MCP actions. Probably v1.3+ work.

## 2 anti-patterns to avoid

### Don't depend on Composio (or any managed connector backend)

OpenHuman has [open issues](https://github.com/tinyhumansai/openhuman/issues/1793) about Composio URL mis-resolution, [budget exhaustion on the backend proxy](https://github.com/tinyhumansai/openhuman/issues/2140), and self-hosters getting stuck because webhooks only work in self-hosted mode.

Office Town's Cloudflare-native architecture already has a clean ingestion story (Email Routing inbound, Browser Rendering for scraping, MCP tools for any external API). Adding a third-party proxy in front of Gmail/Slack/etc. would be a regression.

### Don't ship a tree-only model with no real graph

Their summary trees compress beautifully but the relation structure between entities is implicit — there's a force-directed viz over the entity index, but no first-class edges in their schema. They lose the ability to say "give me all decisions that reference this project", because the link is buried in the body markdown.

Office Town already has `wiki_links` as **explicit, queryable edges**. Keep that. The tree pattern is a *view*, not a replacement for the graph. Adopt their trees as one MORE projection over our existing graph, not the canonical store.

## Recommended next steps for Office Town

If we want to absorb the best of OpenHuman without losing our shape:

1. **Now (cheap, today)**: Move frontmatter repair to the queue. Add `derived_from:` frontmatter convention for auto-generated entries.

2. **v1.2 (1-2 sessions)**: Add hotness counter on `wiki_entries`. Gate expensive operations on it. Add a weekly-digest cron job that writes a `wiki/global/<year>-W<week>.md` entry summarising changes.

3. **v1.3+ (real ingestion story)**: Add a `wiki/inbox/` collection with content-hash IDs for ingested external content. Build connectors (Email Routing already gives us this for inbound mail; Gmail/GitHub/etc. via MCP). Hotness-driven materialisation merges inbox chunks into entity entries when an entity earns the compute.

## Source links

- [OpenHuman GitHub](https://github.com/tinyhumansai/openhuman)
- [Memory Trees docs](https://tinyhumans.gitbook.io/openhuman/features/obsidian-wiki/memory-tree)
- [Obsidian-style Memory layout](https://tinyhumans.gitbook.io/openhuman/features/obsidian-wiki)
- [Integrations (Composio)](https://tinyhumans.gitbook.io/openhuman/features/integrations)
- [Issue #1793 — Composio bypass request](https://github.com/tinyhumansai/openhuman/issues/1793)
- [Issue #2140 — custom-provider budget bug](https://github.com/tinyhumansai/openhuman/issues/2140)
- [How OpenHuman Works (AlphaSignal Substack)](https://alphasignalai.substack.com/p/how-openhuman-works-and-how-to-set)
- [DEV.to writeup](https://dev.to/wonderlab/one-open-source-project-a-day-no-65-openhuman-a-local-first-personal-ai-super-intelligence-4mkn)
