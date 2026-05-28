---
name: office-town-cite-source
description: Append derived_from provenance to any auto-generated cortex entry. Called by every mining/extraction skill that mints a new entry. Reads the entry's frontmatter, ensures derived_from is a non-empty array of raw archive paths or other source IDs, fails the entry's confidence to stub if no source can be cited. Provenance is non-optional. Without this, the cortex has facts without sources — folklore, not knowledge.
---

# Office Town: Cite Source

The trust layer of the cortex. Every auto-generated entry — a new org, a contact, a decision, a knowledge concept — must carry a `derived_from:` array pointing to immutable raw content. When a future agent (or human) asks *"where did this come from?"*, the citation chain answers without ambiguity.

## When to invoke

- **After any auto-extraction step** that wrote a new entry. Mining skills (`office-town-mine-mail-thread`, `office-town-mine-chat-room`, etc.) call this as their final pre-commit step.
- **When updating an existing entry** with new facts pulled from a fresh source. Add the new source to the existing `derived_from:` array (don't replace).
- **User signal** — *"cite this"*, *"add source"*, *"where did this come from?"* — when the user asks the question, run this skill to verify the citation chain is complete + visible.
- **Lint pass** — when `office-town-lint-pass` finds entries missing `derived_from`, call cite-source to attempt back-fill (often impossible without re-mining; flag as stub).

Don't run on manually-written entries unless explicitly asked. A human-written decision record cites itself implicitly via `last_edited_by`.

## Procedure

### 1. Read the entry's current frontmatter

```
wiki(action: get, slug: <entry-slug>, collection: <collection>)
```

Look at the existing `derived_from:` field. Three states:

| Current state | Action |
|---|---|
| Field absent | Set to a new array; go to step 2 |
| Empty array `[]` | Same as absent; go to step 2 |
| Array with entries | Add new sources without duplicating existing; go to step 3 |

### 2. Determine the source IDs

The source IDs depend on what created the entry. Look at the calling context (the skill that's invoking cite-source):

| Calling skill | Source ID shape |
|---|---|
| `office-town-mine-mail-thread` | `wiki/raw/gmail/thread-<id>.md` (the archived thread) |
| `office-town-mine-chat-room` | `wiki/raw/slack/<channel>-<ts>.md` |
| `office-town-mine-doc` | `wiki/raw/docs/<doc-id>.md` |
| `office-town-mine-entity` (multi-layer) | Multiple — one per layer (system snapshot + comms + financial) |
| Manual entry from dashboard paste | `wiki/raw/manual/<sha-prefix>/<short-id>.md` (the staged paste) |
| Tier-1 ETL (Xero, Jim2, etc.) | `<system>:<record-id>` (e.g. `xero:contact-acme-corp`, `jim2:cardfile-12345`) |
| Inbox classification | The Inbox SHA-id path: `wiki/inbox/<sha-prefix>/<id>.md` |

If you don't know what created the entry, you cannot cite it. Set `status: stub` and `review_status: pending` and file a finding for human review.

### 3. Write the updated frontmatter

```
wiki(action: update, slug: <entry-slug>, frontmatter: { derived_from: [<source-ids>] })
```

The format is always an array of strings. One source = one-element array. Multiple sources = multiple entries. Don't use comma-separated strings or nested objects.

Example:

```yaml
derived_from:
  - wiki/raw/gmail/thread-18f3a1b
  - xero:contact-acme-corp
  - wiki/inbox/ab/abc123def456
```

### 4. Verify the citation chain resolves

For each entry in `derived_from:`, confirm the target exists:

```
wiki(action: exists, key: <source-id>)
```

If a cited source returns 404 (file moved, raw archive corrupted, external-system reference broken), the citation is broken. Two options:

- **If the entry is fresh**, re-mine to refresh the source — better to cite a current source than a dangling reference
- **If the entry is old and the source genuinely lost**, leave the citation in place with a `citation_note:` field explaining the gap. Don't silently strip it; the audit trail matters more than the fix

### 5. Update last_change_summary

Append to the entry's `last_change_summary:` field:

```
cite-source: added derived_from with <N> source(s)
```

Worker harvests this into `wiki_audit` automatically via the unified write path. The audit trail records WHO ran cite-source and WHY.

## Non-obvious disciplines

- **`derived_from:` is array-of-strings, not array-of-objects.** Keep it parseable. If a source needs structured metadata (fetched-at, version, confidence), put that in the SOURCE's frontmatter, not in the citing entry's `derived_from:`.
- **Citations point to immutable archive paths, not to URLs that might 404.** Internal cortex paths (`wiki/raw/...`) are forever. External URLs are not. If the source is external, archive a snapshot to `wiki/raw/scrapes/` first and cite the snapshot.
- **Don't cite the entry itself.** A circular `derived_from: [<self-slug>]` is a sign the calling skill didn't pass the actual source.
- **One mine creates many entries; each carries a fragment of the source attribution.** If a thread produces both an Org entry and a Decision entry, both cite the same `wiki/raw/gmail/thread-<id>.md`. Don't try to attribute slices of the source to slices of the output — the audit trail can reconstruct it.
- **Citations are FACTS, not OPINIONS.** Don't add "this is the canonical source" framing — the existence of the citation IS the framing. Future readers infer importance from frequency of citation across entries, not from labelling.

## Composition with other skills

| Skill | Composition |
|---|---|
| `office-town-mine-mail-thread` | Called as final step; sets `derived_from: [<raw-path>]` on every new entry |
| `office-town-mine-chat-room` | Same — sibling for chat sources |
| `office-town-mine-doc` | Same — sibling for doc sources |
| `office-town-mine-entity` | Called per-layer; appends multiple sources to the unified entity entry |
| `office-town-promote-to-knowledge` | When promoting a finding to a knowledge concept, cite-source must capture the underlying findings (not just the latest source) — the concept inherits ALL the n≥3 instance citations |
| `office-town-lint-pass` | Reports entries missing `derived_from:`; cite-source attempts back-fill |

## Verification

- [ ] The entry's `derived_from:` is a non-empty array of strings
- [ ] Each cited path/ID resolves (no 404s) OR has an explanatory `citation_note:`
- [ ] `last_change_summary:` reflects the cite-source operation
- [ ] If the entry had no sources to cite, `status: stub` + `review_status: pending` were set
- [ ] No circular self-reference in `derived_from:`

## See also

- `office-town-mine-mail-thread` — primary caller for email-sourced entries
- `office-town-mine-chat-room`, `office-town-mine-doc` — sibling miners
- `office-town-lint-pass` — finds entries missing citations
- `office-town-promote-to-knowledge` — promotion inherits all instance citations
- Framework doc § 13 — epistemics + provenance discipline
- `cortex-shape-2026-05-28.md` Q3 — where `derived_from:` lives in frontmatter (decision: frontmatter is source of truth)

## Last updated

2026-05-28 — initial author. Office-Town-specific (no direct Goanna analogue). Closes the "facts without sources are folklore" failure mode the framework names as non-negotiable.
