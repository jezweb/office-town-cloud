-- Wiki audit log + status column for soft-delete (archive) + links table for cross-references.
-- Per MEMORY-COMPARISON.md design contract: every mutation logs an audit row with required `why:`.

-- Status column on wiki_entries — active | archived | deleted (soft-delete pattern)
ALTER TABLE wiki_entries ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- Stable UUID per entry — separate from the slug-based id for cross-references and history
ALTER TABLE wiki_entries ADD COLUMN uuid TEXT;

-- Backfill UUID for existing rows (random; format-of-randomness doesn't matter for existing entries)
UPDATE wiki_entries SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL;

-- Audit table — append-only log of every wiki mutation
CREATE TABLE IF NOT EXISTS wiki_audit (
  audit_id     TEXT PRIMARY KEY,             -- UUID per audit row
  ts           INTEGER NOT NULL,             -- unix ms timestamp
  action       TEXT NOT NULL,                -- write|update|supersede|archive|delete|restore|link|attach|detach
  collection   TEXT NOT NULL,
  slug         TEXT NOT NULL,
  entry_uuid   TEXT,                         -- references wiki_entries.uuid (may be null for orphan log rows)
  agent_slug   TEXT,                         -- librarian|boss|worker|scout|mcp-agent|etc.
  session_id   TEXT,                         -- Goose session id (when available)
  prev_hash    TEXT,                         -- SHA256 of prior body (null on first write)
  new_hash     TEXT,                         -- SHA256 of new body (null on archive/delete)
  why          TEXT NOT NULL                 -- REQUIRED reason — non-null enforced at app layer + here
);

CREATE INDEX IF NOT EXISTS wiki_audit_by_entry ON wiki_audit(collection, slug, ts DESC);
CREATE INDEX IF NOT EXISTS wiki_audit_by_uuid ON wiki_audit(entry_uuid, ts DESC);
CREATE INDEX IF NOT EXISTS wiki_audit_by_agent ON wiki_audit(agent_slug, ts DESC);
CREATE INDEX IF NOT EXISTS wiki_audit_by_action_ts ON wiki_audit(action, ts DESC);

-- Cross-reference table — entry A links to entry B
CREATE TABLE IF NOT EXISTS wiki_links (
  link_id      TEXT PRIMARY KEY,             -- UUID
  from_collection TEXT NOT NULL,
  from_slug    TEXT NOT NULL,
  to_collection TEXT NOT NULL,
  to_slug      TEXT NOT NULL,
  kind         TEXT,                         -- references|child-of|parent-of|see-also|etc.
  why          TEXT,                         -- optional rationale
  created_at   INTEGER NOT NULL              -- unix ms
);

CREATE INDEX IF NOT EXISTS wiki_links_from ON wiki_links(from_collection, from_slug);
CREATE INDEX IF NOT EXISTS wiki_links_to ON wiki_links(to_collection, to_slug);
CREATE UNIQUE INDEX IF NOT EXISTS wiki_links_unique ON wiki_links(from_collection, from_slug, to_collection, to_slug, kind);

-- Attachments table — non-markdown files associated with an entry
-- (the file itself lives in R2 alongside entity.md; this table indexes it)
CREATE TABLE IF NOT EXISTS wiki_attachments (
  attachment_id   TEXT PRIMARY KEY,           -- UUID
  collection      TEXT NOT NULL,
  slug            TEXT NOT NULL,
  filename        TEXT NOT NULL,              -- e.g. 'logo.png', 'contract.pdf'
  r2_key          TEXT NOT NULL,              -- 'wiki/<col>/<slug>/<filename>'
  content_type    TEXT,
  size_bytes      INTEGER,
  uploaded_at     INTEGER NOT NULL            -- unix ms
);

CREATE INDEX IF NOT EXISTS wiki_attachments_by_entry ON wiki_attachments(collection, slug);
CREATE UNIQUE INDEX IF NOT EXISTS wiki_attachments_unique ON wiki_attachments(collection, slug, filename);

-- Status index on wiki_entries for fast 'active' filtering (the default search/list filter)
CREATE INDEX IF NOT EXISTS wiki_entries_status ON wiki_entries(status, collection, updated_at DESC);
