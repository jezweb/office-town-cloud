-- Office Town Cloud — full D1 schema.
--
-- Flattened from migrations 0000..0005 (2026-05-28) since there are no
-- existing deployments to migrate. New deployers run this single file
-- to get a complete schema. The drizzle/schema.ts TS file is the source
-- of truth for the table shapes; this SQL adds the FTS5 virtual table,
-- triggers, indexes, and seed data that drizzle-kit can't generate.
--
-- Schema sections (in dependency order):
--   1. wiki_collections + seed (11 default collections)
--   2. wiki_entries + indexes
--   3. wiki_fts virtual table + sync triggers
--   4. wiki_vector_index
--   5. wiki_audit (every mutation logs `why:`)
--   6. wiki_links (cross-references)
--   7. wiki_attachments (non-markdown files per entry)
--   8. cron_jobs + cron_runs
--   9. session_log
--  10. worker_config (auto-generated MCP bearer + future single-key cache)

-- ============================================================
-- 1. wiki_collections
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_collections (
	name TEXT PRIMARY KEY,
	shape TEXT NOT NULL,
	canonical_filename TEXT NOT NULL,
	required_fields_json TEXT NOT NULL,
	description TEXT NOT NULL,
	created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO wiki_collections (name, shape, canonical_filename, required_fields_json, description, created_at) VALUES
	('business',  'flat-topic',         '',           '["name"]',                  'The business this town serves — identity, ABN, HQ, timezone',                       datetime('now')),
	('owner',     'flat-topic',         '',           '[]',                        'Principal user voice, rhythm, bio',                                                 datetime('now')),
	('team',      'entity-as-folder',   'profile.md', '["name"]',                  'Humans + agents on the team',                                                       datetime('now')),
	('contacts',  'entity-as-folder',   'contact.md', '["name"]',                  'External people we interact with',                                                  datetime('now')),
	('orgs',      'entity-as-folder',   'entity.md',  '["name","entity_type"]',    'External organisations — clients, prospects, vendors, partners, competitors',      datetime('now')),
	('projects',  'entity-as-folder',   'project.md', '["name"]',                  'Active and historical projects',                                                    datetime('now')),
	('decisions', 'entity-as-folder',   'decision.md','["title"]',                 'Decisions made — with rationale and date',                                          datetime('now')),
	('knowledge', 'entity-as-folder',   'concept.md', '["title"]',                 'Curated knowledge concepts — patterns, conventions, references',                    datetime('now')),
	('research',  'dated-stream',       '',           '["title"]',                 'Time-stamped investigations, scout findings worth keeping',                         datetime('now')),
	('feedback',  'dated-stream',       '',           '["title"]',                 'User feedback, escalations, retros',                                                datetime('now')),
	('tasks',     'entity-as-folder',   'task.md',    '["title"]',                 'Tasks, todos, and in-flight work items — surfaced on the kanban dashboard by frontmatter.status', datetime('now'));

-- ============================================================
-- 2. wiki_entries
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_entries (
	id TEXT PRIMARY KEY,
	collection TEXT NOT NULL,
	slug TEXT NOT NULL,
	r2_key TEXT NOT NULL,
	title TEXT,
	frontmatter_json TEXT NOT NULL,
	body TEXT NOT NULL,
	body_hash TEXT NOT NULL,
	last_change_summary TEXT,
	last_edited_by TEXT,
	status TEXT NOT NULL DEFAULT 'active',  -- active | archived | deleted (soft-delete)
	uuid TEXT,                              -- stable UUID for cross-references
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wiki_entries_collection ON wiki_entries(collection);
CREATE INDEX IF NOT EXISTS idx_wiki_entries_updated_at ON wiki_entries(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_entries_unique ON wiki_entries(collection, slug);
CREATE INDEX IF NOT EXISTS wiki_entries_status ON wiki_entries(status, collection, updated_at DESC);

-- ============================================================
-- 3. FTS5 — virtual table + sync triggers
-- ============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
	id UNINDEXED,
	collection,
	slug,
	title,
	body,
	tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS wiki_entries_ai AFTER INSERT ON wiki_entries BEGIN
	INSERT INTO wiki_fts(id, collection, slug, title, body)
	VALUES (new.id, new.collection, new.slug, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS wiki_entries_ad AFTER DELETE ON wiki_entries BEGIN
	DELETE FROM wiki_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS wiki_entries_au AFTER UPDATE ON wiki_entries BEGIN
	DELETE FROM wiki_fts WHERE id = old.id;
	INSERT INTO wiki_fts(id, collection, slug, title, body)
	VALUES (new.id, new.collection, new.slug, new.title, new.body);
END;

-- ============================================================
-- 4. wiki_vector_index
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_vector_index (
	entry_id TEXT PRIMARY KEY,
	vector_id TEXT NOT NULL,
	body_hash TEXT NOT NULL,
	indexed_at TEXT NOT NULL
);

-- ============================================================
-- 5. wiki_audit — append-only log of every mutation, `why:` required
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_audit (
	audit_id     TEXT PRIMARY KEY,
	ts           INTEGER NOT NULL,
	action       TEXT NOT NULL,                -- write|update|supersede|archive|delete|restore|link|attach|detach
	collection   TEXT NOT NULL,
	slug         TEXT NOT NULL,
	entry_uuid   TEXT,                         -- references wiki_entries.uuid
	agent_slug   TEXT,                         -- librarian|boss|worker|scout|mcp-agent|etc.
	session_id   TEXT,                         -- Goose session id (when available)
	prev_hash    TEXT,                         -- SHA256 of prior body (null on first write)
	new_hash     TEXT,                         -- SHA256 of new body (null on archive/delete)
	why          TEXT NOT NULL                 -- REQUIRED reason — non-null enforced at app + DB
);

CREATE INDEX IF NOT EXISTS wiki_audit_by_entry ON wiki_audit(collection, slug, ts DESC);
CREATE INDEX IF NOT EXISTS wiki_audit_by_uuid ON wiki_audit(entry_uuid, ts DESC);
CREATE INDEX IF NOT EXISTS wiki_audit_by_agent ON wiki_audit(agent_slug, ts DESC);
CREATE INDEX IF NOT EXISTS wiki_audit_by_action_ts ON wiki_audit(action, ts DESC);

-- ============================================================
-- 6. wiki_links — explicit cross-references between entries
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_links (
	link_id         TEXT PRIMARY KEY,
	from_collection TEXT NOT NULL,
	from_slug       TEXT NOT NULL,
	to_collection   TEXT NOT NULL,
	to_slug         TEXT NOT NULL,
	kind            TEXT,                         -- references|child-of|parent-of|see-also|etc.
	why             TEXT,                         -- optional rationale
	created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS wiki_links_from ON wiki_links(from_collection, from_slug);
CREATE INDEX IF NOT EXISTS wiki_links_to ON wiki_links(to_collection, to_slug);
CREATE UNIQUE INDEX IF NOT EXISTS wiki_links_unique ON wiki_links(from_collection, from_slug, to_collection, to_slug, kind);

-- ============================================================
-- 7. wiki_attachments — non-markdown files associated with an entry
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_attachments (
	attachment_id   TEXT PRIMARY KEY,
	collection      TEXT NOT NULL,
	slug            TEXT NOT NULL,
	filename        TEXT NOT NULL,                -- e.g. 'logo.png', 'contract.pdf'
	r2_key          TEXT NOT NULL,                -- 'wiki/<col>/<slug>/<filename>'
	content_type    TEXT,
	size_bytes      INTEGER,
	uploaded_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS wiki_attachments_by_entry ON wiki_attachments(collection, slug);
CREATE UNIQUE INDEX IF NOT EXISTS wiki_attachments_unique ON wiki_attachments(collection, slug, filename);

-- ============================================================
-- 8. cron_jobs + cron_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS cron_jobs (
	id TEXT PRIMARY KEY,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	description TEXT,
	command TEXT NOT NULL,
	cron_expression TEXT,
	frequency TEXT NOT NULL,
	timezone TEXT NOT NULL,
	enabled INTEGER NOT NULL DEFAULT 1,
	last_run_at TEXT,
	next_run_at TEXT,
	last_status TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_slug ON cron_jobs(slug);

CREATE TABLE IF NOT EXISTS cron_runs (
	id TEXT PRIMARY KEY,
	job_id TEXT NOT NULL REFERENCES cron_jobs(id),
	started_at TEXT NOT NULL,
	finished_at TEXT,
	status TEXT NOT NULL,
	output TEXT,
	error TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_started ON cron_runs(job_id, started_at DESC);

-- ============================================================
-- 9. session_log — better-auth + agent session tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS session_log (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	action TEXT NOT NULL,
	target TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_log_user ON session_log(user_id, created_at DESC);

-- ============================================================
-- 10. worker_config — worker-managed single-key cache.
--     Currently used only for auto_bearer (the auto-generated
--     MCP bearer token) so users don't have to run
--     `openssl rand -hex 32` themselves at deploy time.
-- ============================================================
CREATE TABLE IF NOT EXISTS worker_config (
	key        TEXT PRIMARY KEY,
	value      TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
