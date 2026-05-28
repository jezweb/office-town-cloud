# Wiki Structure for Agent-Readable Knowledge — Research Synthesis

**Date:** 2026-05-28
**For:** Office Town Cloud — knowledge base design (Cloudflare-hosted agent cortex)
**Author:** Claude (research pass)

---

## The headline finding

The single most important insight from 2025-2026 practitioner work is this: **Karpathy's wiki pattern (published April 2026) is the right shape for *research-style* knowledge, but it is the *wrong* shape for *business operations* knowledge — and Office Town is the latter**. The fork point matters more than any folder-layout decision you'll make. Get this wrong and you build a 100,000-word summary that can't tell you who promised what to whom and when it shifted.

I'll explain Karpathy's pattern first because it's the substrate everything else builds on, then where it breaks for your use case, then what the practitioner consensus is on the harder questions.

## Karpathy's LLM Wiki — the pattern, accurately

Karpathy's April 2026 gist (the one that hit ~16M views) proposes a deliberately minimal structure: a `raw/` directory of immutable source material (PDFs converted to markdown, web clips, transcripts, datasets), a `wiki/` directory of LLM-authored articles, and a schema file (CLAUDE.md or equivalent) defining the rules of engagement. Two system files sit at the root: `index.md` is "a catalog of everything in the wiki — each page listed with a link, a one-line summary, and optionally metadata like date or source count" — and `log.md` is "append-only record of what happened and when — ingests, queries, lint passes." Entries in log.md use parseable prefixes like `## [2026-04-02] ingest | Article Title`.

The architecture has three properties that matter:

1. **raw/ is append-only and immutable.** It's the single source of truth. The LLM reads it but never edits it. This is non-negotiable — it's what lets you re-derive the wiki when the schema changes.
2. **wiki/ is entirely the LLM's territory.** Articles are encyclopedia-style. The LLM writes, links, categorises, and runs periodic "health checks" — what Karpathy calls linting — to detect contradictions, fill gaps via web search, and suggest new article connections.
3. **The schema lives in a markdown file the agent reads on every session.** Karpathy is explicit: "Everything mentioned above is optional and modular — pick what's useful, ignore what isn't... The right way to use this is to share it with your LLM agent and work together to instantiate a version that fits your needs."

What's quietly revolutionary about this is the rejection of RAG. Karpathy's bet — and it works at his scale (one topic grew to ~100 articles / 400,000 words without him writing directly) — is that long-context flagship models can hold the whole compiled wiki, so vector stores are unnecessary overhead. The aimaker.substack walkthrough confirms the implementation: `sources/` (with topic subfolders like `ai/`, `books/`, `podcasts/`), `wiki/`, `inbox/` for fleeting thoughts, and a `CLAUDE.md` that "turns Claude from a generic chatbot into a disciplined wiki maintainer."

## Where it breaks for Office Town

The sharpest critique I found is from dailydoseofds.com ("The Next Step After Karpathy's Wiki Idea"). The argument is that Karpathy's pattern "works well for research because concepts and their relationships are relatively stable" — but it **fails for real work where "context evolves across conversations constantly, like deadlines, plans, meetings, etc."** A compiled wiki summary page about a project "wouldn't track ground truth effectively" when circumstances change dynamically.

The proposed fix is exactly what Office Town needs: rather than encyclopaedia articles, extract **"each decision, commitment, and deadline as its own MD file with backlinks to the people and projects involved"** — enabling tracking of "who made it, what was promised, when it was promised, and whether anything has shifted since." This is a **knowledge graph of typed entities** (people, decisions, commitments, deadlines as separate nodes) rather than a wiki of narrative summaries.

This maps almost perfectly onto your goanna-substrate-conventions rule, which already prescribes entity-as-folder for orgs/contacts/projects/decisions. The substrate already smelled right; the dailydoseofds piece confirms why: business knowledge is fundamentally relational, not encyclopaedic. So **keep Karpathy's raw/wiki/schema spine, but make wiki/ a typed-entity graph, not a wiki of articles.**

## Frontmatter vs body — the practitioner consensus

The clearest writing I found on this is from blog.trysteakhouse.com on "Markdown-First Semantics." The rule that survives every chunking and re-indexing operation:

- **Frontmatter holds the spine:** entity identity (`id`, `type`, `slug`), disambiguation, primary relationships (`related_ids`, `parent_topic_id`), and a `summary` or `tldr` field. The author quotes: *"40% of RAG failures are not generation errors, but retrieval errors"* — because chunks lack context. Frontmatter persists no matter how the body is sliced.
- **Body holds the narrative,** but with "invisible header" comments (`<!-- CONTEXT: ... -->`) at section starts so each chunk can stand alone if extracted.

For Office Town specifically: put hard relationships (`org`, `contact_of`, `project`, `decided_by`, `derived_from`) in frontmatter as ID arrays. Put rationale, narrative, conversation transcripts in the body. This split also matches how the goanna substrate already works.

The harder question — **frontmatter `related: [...]` versus a separate links table** — has a definite answer in the agent context. Keep the **authoritative** relationships in frontmatter, because that's what travels with the file when an agent reads it cold. Build a links/index table as a **derived** artifact, regenerated from frontmatter on each ingest pass (this is what `index.md` and `log.md` do for Karpathy). Don't put authoritative state in a database — the markdown is the source of truth and the index is replayable. The dev.to "scaling agent knowledge bases" piece reinforces this: *"akm handles operations that require invariants an agent can't reliably enforce across sessions"* — meaning indexes, link integrity, and orphan detection are deterministic operations done by tooling, not the agent.

## Zettelkasten for agents — works, with caveats

Andy Matuschak's evergreen-notes principle ("notes should be atomic, focused on a single idea") translates well to agent retrieval — atomic notes survive chunking and are easier for an LLM to reason about in isolation. But the A-MEM paper (arxiv:2502.12110) and the Alpha's Manifesto critique surface a real failure mode: **error propagation**. "The LLM makes organization decisions at every step (during note construction, link evaluation, and memory evolution), creating three opportunities per memory for hallucination... a bad link today means a bad update tomorrow." The mitigation isn't to abandon atomicity — it's to add invariants the agent can't violate: link validity is checked by tooling (not the agent), entity IDs are immutable once assigned, frontmatter conforms to a schema enforced at write-time.

Nick Milo (Linking Your Thinking) goes further and *advises against letting AI create links at all*: "the value lies in the self-curated nature of the connections." I think he's right for personal-thinking vaults and wrong for operational substrates. For Office Town the answer is asymmetric: let the agent create *factual* links (this email mentions this contact who works at this org), but require human review for *interpretive* links (this decision was caused by that meeting). Encode this in your schema.md.

## The wiki / vector store line

The honest answer: it depends on context window economics. Karpathy's bet is that flagship models can hold ~100 articles in context, no RAG needed. For Office Town, where you'll have thousands of emails, hundreds of contacts, dozens of active projects — *the entity layer fits in context, the source layer does not*. Practical split:

- **wiki/ entries (entities, decisions, summarised projects)** → loaded into context directly. Tens of thousands of tokens, manageable.
- **raw/ archive (full emails, transcripts, scraped pages)** → vector-indexed, retrieved on demand. The wiki entry links back via `derived_from: [raw/2026-05-12-email-xyz.md]`.

This is what guillermodean.com calls a "tiered loading strategy" and themenonlab.blog implements as lifecycle hooks: `SessionStart` loads "excerpts and filenames, not full note contents," then the agent queries semantically before reading specific files.

## Provenance and the same-entity-from-multiple-sources problem

This is the part most blogs hand-wave and where Office Town will live or die. Practitioner consensus:

- **Assign each entity a stable ID** the moment it's first observed (`org:jezweb`, `contact:jeremy-dawes`). Slug-based, not random UUIDs — agents read slugs.
- **Each ingested source becomes a row in `raw/`** with its own ID (`raw:gmail-msg-18f3a1b`). The wiki entry has `derived_from: [raw:gmail-msg-18f3a1b, raw:xero-invoice-4421]`.
- **When the same entity shows up in a new source, the agent appends to `derived_from` and may update fields** — but the canonical entity file's ID never changes. Field changes go into a `history:` block in body, not silent overwrites. The Rowboat-style decision/commitment files are the exemplar: they're written-once and never edited; new information becomes a *new* file linked back to the original.

## Schema evolution

Karpathy's pattern handles this gracefully because of immutable raw/: if you change the wiki schema, you delete and regenerate the wiki layer. The dev.to scaling piece nails it: *"You're not starting from a blank directory — you're starting from a structural contract."* Schema lives in `schema.md` (or `CLAUDE.md`) in each wiki, defines page kinds, voice, contradiction policy, allowed frontmatter fields. When the schema changes, the agent can be asked to migrate existing entries (and the immutable raw/ means a rebuild is always possible if migration goes wrong). **Version the schema** — frontmatter `schema_version: 3` on each file lets the agent know which migrations to run.

---

## What would you do differently — lessons from people who've maintained these for years

Patterns that consistently come up in retrospectives:

1. **"A note without links is a bug."** (themenonlab) Enforce this at write-time via a `PostToolUse` hook or equivalent — orphan notes are how vaults rot.
2. **Stop letting the agent create canonical IDs late.** Assign them at first observation and never change. ID churn destroys backlinks; once you have 200 files linking to `contact:jdawes` you can't rename it cheaply.
3. **Be ruthlessly stingy with tags.** Multiple practitioners warn that over-tagging makes search useless. Use *types* (frontmatter `type: contact`) and *relationships* (frontmatter `org: jezweb`) instead of free-form tags. Reserve tags for genuinely cross-cutting attributes (`#urgent`, `#legal`).
4. **Stub pages are worse than no page.** The "wiki of one-line stubs" failure mode is real — if the agent creates `contact:bob-smith.md` with just a name and no useful context, it dilutes search results. Require a minimum frontmatter completeness check before a page is committed.
5. **Append, don't edit, for facts with provenance.** Decisions, commitments, status changes get *new* dated files (or new entries in a `history:` block). Editing in place destroys the audit trail that makes business knowledge useful.
6. **The schema is the most important file in the system.** Karpathy is unusually clear: you spend an hour iterating with the LLM on schema.md and that hour determines everything else.
7. **Run lint passes regularly.** Karpathy's "health checks" — orphan detection, broken link detection, schema-compliance, contradiction-spotting — should run on every ingest, not just nightly. The wiki rots in days, not months, without them.
8. **Don't ask the agent to do invariant-enforcement.** Use deterministic tooling (a Worker, a script) to maintain `index.md`, validate frontmatter, check link targets exist. The agent is for judgment, the script is for precision. (This matches your existing `trust-skills-not-elaborate-code.md` rule — same shape.)
9. **Public links rot. Internal IDs don't.** Don't link by URL or filename; link by entity ID. Filenames change, URLs 404, IDs are forever.

---

## Sources

- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an
- https://howaiworks.ai/blog/andrej-karpathy-llm-knowledge-bases
- https://www.mindstudio.ai/blog/andrej-karpathy-llm-wiki-knowledge-base-claude-code
- https://aimaker.substack.com/p/llm-wiki-obsidian-knowledge-base-andrej-karphaty
- https://blog.dailydoseofds.com/p/the-next-step-after-karpathys-wiki
- https://blog.trysteakhouse.com/blog/markdown-first-semantics-frontmatter-rag-retrieval
- https://themenonlab.blog/blog/obsidian-mind-persistent-memory-ai-coding-agents/
- https://dev.to/itlackey/building-agent-knowledge-bases-that-actually-scale-23pb
- https://notes.andymatuschak.org/Evergreen_notes_should_be_atomic
- https://www.linkingyourthinking.com/linking-your-ai
- https://blog.alphasmanifesto.com/2026/04/11/a-mem-zettelkasten-for-agents/
- https://arxiv.org/pdf/2502.12110
- https://agentwiki.org/common_agent_failure_modes
- https://github.com/SamurAIGPT/llm-wiki-agent
