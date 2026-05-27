# Memory comparison: Goose built-in vs Office Town wiki

Detailed comparison establishing why Office Town builds its own wiki MCP rather than relying on Goose's built-in Memory extension. Based on a full source-code audit of `crates/goose-mcp/src/memory/mod.rs` (668 lines).

## Why this document exists

Three reasons to build our own memory layer:

1. **Goose Memory has confirmed structural weaknesses** that we cannot work around from the outside
2. **Our wiki integrates with Cloudflare-native primitives** (R2, D1, Vectorize) for properties Goose Memory cannot provide
3. **Our wiki integrates with Goose's emerging `Source` system** (PRs #8739, #9084) for proper context injection

## Confirmed weaknesses in Goose's built-in Memory

From source audit:

### Critical issues

| Issue | Evidence | Impact |
|---|---|---|
| **All globals baked into system prompt at server start** | `MemoryServer::new()` line 90-145 concatenates every global memory into `instructions` | Context bloat scales linearly with memory count; 1000 memories = ~50K tokens of system prompt forever |
| **Cannot refresh mid-session** | `instructions` are read once at MCP handshake (`extension_manager.rs:1077`) | LLM is told "if user removes a memory, please mentally purge it" — the static system prompt cannot update |
| **Tag-string-as-HashMap-key** | `retrieve` line 232-270 uses tag set as HashMap key | Re-using tags with different order produces different keys; entries with identical tags merge into one value list |
| **Substring-match deletion** | `remove_specific_memory` uses `entry.contains(memory_content)` | `remove("the")` wipes most entries; no exact match, no ID-based deletion |
| **No path traversal protection** | `format!("{}.txt", category)` pasted onto filesystem | `category: "../../etc/passwd"` resolves outside the memory directory |
| **Race-prone writes** | Append-mode + read-modify-rewrite for deletes, no locks | Concurrent edits clobber each other |

### Missing capabilities

| Missing | What's there instead |
|---|---|
| Semantic search | Filesystem category lookup only |
| Supersession | Append-only writes (old + new coexist) |
| Audit trail | None — destructive rewrites lose history |
| Versioning | None — file mutations are non-recoverable |
| Structured frontmatter | Plain text with `# tag1 tag2` header line |
| Cross-machine sync | Per-machine only (`~/.config/goose/memory/`) |
| Cross-user shared pool | Single process, single user |
| Synthesis on recall | Returns Rust debug format (`{key: [val1, val2]}`) |
| Stable IDs | Substring matching only |
| Multi-classification | Tags exist but retrieval flattens them |
| Concurrency safety | No locks, no transactions |

### What it does well (to keep/mirror)

- **Local vs global scope** is a real and useful distinction
- **Working-dir auto-detection** via `agent-working-dir` meta header is clean
- **Lazy directory creation** (only on first write)
- **Self-describing via instructions** — LLM gets storage paths inline (just not the content dump it does)
- **"Save proactively, confirm with user"** instruction shape is a good frame; just needs better text

## Side-by-side feature comparison

| Concern | Goose Memory (built-in) | `office-town-wiki` |
|---|---|---|
| Tools | 4 separate (remember, retrieve, remove_category, remove_specific) | 1 gateway `wiki` with 8 actions |
| Storage | Plain `.txt` per category | R2 markdown (canonical) + D1 (index + FTS5 + audit) + Vectorize (semantic) |
| Identity | Filename + substring match | Stable UUID + slug returned on write |
| Schema | None (`\n\n`-separated text) | YAML frontmatter + markdown body |
| Search | Category lookup only | FTS5 + Vectorize hybrid + Reciprocal Rank Fusion |
| Auto-load to system prompt | All globals concatenated, every session | ≤2KB static: town name + counts + pinned slugs only |
| Updates | Append-only; manual delete | `supersede(old, new)` atomic in D1 |
| Audit | None | `wiki_audit` table: who, when, what, prev_hash, new_hash, **why** (required field) |
| Versioning | None | R2 object versioning + audit log = full history |
| Concurrency | Race-prone | D1 ACID + R2 conditional writes |
| Cross-machine | No (per-machine files) | Yes (R2 canonical) |
| Cross-user (within team) | No | Yes (via allowlist + `agent_slug` audit) |
| Path safety | None | Slug sanitisation + tenant prefix |
| Synthesis on recall | No | `search(synthesize: true)` via MCP Sampling |
| Triage shapes | No control | List endpoints return `{slug, title, snippet, byte_count}` only |
| Trigger-word behaviour | Pure prompt instructions | Pure prompt instructions (we keep this) |
| Per-session awareness | None | `session_id` + `agent_slug` per audit row |
| Sizes designed for | 10-50 memories per machine | 10,000+ entries per deployment |

## Architectural integrations

### Goose `Source` system (PRs #8739 + #9084)

Goose is consolidating around `SourceType::{Project, Agent, Skill, Recipe, ...}`. Office Town integrates:

- Each **building** registers as `SourceType::Project` (markdown file in `Paths::data_dir()/projects/`)
- Each **role** registers as `SourceType::Agent` (markdown file in `Paths::data_dir()/agents/`)
- The **wiki** complements: Sources are the spec, wiki is the dynamic state

This means Goose desktop's project switcher, agent picker, sidebar icons (PR #8896) all light up for Office Town automatically.

### Cost optimization via MCP Sampling

Per ARCHITECTURE.md, all our classification + synthesis goes through MCP Sampling (Goose's host LLM, paid by user). Eliminates the $10.50/month gpt-oss-20b cost line. Positioning: "$0 per-user LLM cost added by Office Town."

### Smart Context Management compliance

Goose auto-summarises at 80% of token capacity. Our wiki MUST return triage shapes (snippets, not bodies) so search results survive compaction. The `wiki.search` default response is small enough to survive.

### Memory + wiki — disable one

If both Goose's built-in `memory` extension and the Office Town wiki MCP are enabled, agents get conflicting "save proactively" instructions in the system prompt. Choose one source of truth. The Office Town `INSTALL.md` prompt instructs the agent to disable Goose's `memory` extension during setup — the wiki MCP replaces it.

## Migration path (for users coming from Goose Memory)

For users moving from a Goose Memory setup to Office Town:

1. Each `.txt` file in `~/.config/goose/memory/` becomes one or more wiki entries
2. Category becomes `kind` in frontmatter
3. Tag lines become `tags: []` in frontmatter
4. Entry text becomes the markdown body
5. A short migration script (TBD in M5) walks the directory and produces wiki writes via the MCP

We can optionally keep Goose Memory enabled during migration for a transition period; once content is in the wiki, disable.

## Open questions

1. **Should we contribute our wiki as a future Goose builtin extension?** It's measurably better than Memory. Once stable, propose to Block as an alternative or replacement. (Not before v1.1 — stabilise first.)
2. **Cloudflare AI Search (announced April 2026) overlaps with our search backend.** Evaluate at 90 days post-v1; if it wins on quality + cost, swap our backend behind the wiki MCP abstraction.
3. **Should we expose a `SourceType::WikiEntry`** if Block opens the Source registry to extensions? Would let the desktop UI render wiki entries natively (sidebar, search bar, etc.). Track upstream.

## Conclusion

Building our own wiki MCP is justified by the audit. Goose Memory works for personal preferences at small scale; it fails at team knowledge at scale. Office Town's wiki is designed from the start for team-scale shared knowledge with proper indexing, supersession, audit, and Cloudflare-native scale.

The audit also surfaced two non-obvious wins: (1) integration with Goose's `Source` system means we get future Goose UI improvements for free; (2) MCP Sampling means we add zero ongoing LLM cost.
