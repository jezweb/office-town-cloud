// One-shot D1 schema bootstrap.
//
// Why this exists:
//   The "Deploy to Cloudflare" button provisions the D1 database but does
//   NOT run `wrangler d1 migrations apply` against it. So a fresh
//   button-deployed worker has the DB binding but zero tables.
//
// Why we don't use D1.exec(multistatement):
//   D1.exec() splits its input on newlines and treats each line as a
//   separate query. Our schema has multi-line CREATE TRIGGER statements
//   (with BEGIN ... END;) and multi-line INSERT VALUES; running them
//   through exec() chops them into syntactically invalid fragments.
//   wrangler's CLI works because it parses statements client-side first.
//
//   So we keep the statements as an array of single complete statements
//   and run them via prepare().run() in sequence. Idempotent — every
//   CREATE uses IF NOT EXISTS, every INSERT uses OR IGNORE.

import type { Env } from './types';

// One statement per array entry. Multi-line strings here are fine
// because we hand each entry to prepare() which doesn't split on
// newlines — only the .exec() API does that.
const STATEMENTS: string[] = [
	`CREATE TABLE IF NOT EXISTS wiki_collections (
		name TEXT PRIMARY KEY,
		shape TEXT NOT NULL,
		canonical_filename TEXT NOT NULL,
		required_fields_json TEXT NOT NULL,
		description TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,

	`INSERT OR IGNORE INTO wiki_collections (name, shape, canonical_filename, required_fields_json, description, created_at) VALUES
		('business',  'flat-topic',         '',           '["name"]',                  'The business this town serves',           datetime('now')),
		('owner',     'flat-topic',         '',           '[]',                        'Principal user voice, rhythm, bio',       datetime('now')),
		('team',      'entity-as-folder',   'profile.md', '["name"]',                  'Humans + agents on the team',             datetime('now')),
		('contacts',  'entity-as-folder',   'contact.md', '["name"]',                  'External people we interact with',        datetime('now')),
		('orgs',      'entity-as-folder',   'entity.md',  '["name","entity_type"]',    'External organisations',                  datetime('now')),
		('projects',  'entity-as-folder',   'project.md', '["name"]',                  'Active and historical projects',          datetime('now')),
		('decisions', 'entity-as-folder',   'decision.md','["title"]',                 'Decisions made — with rationale',         datetime('now')),
		('knowledge', 'entity-as-folder',   'concept.md', '["title"]',                 'Curated knowledge concepts',              datetime('now')),
		('research',  'dated-stream',       '',           '["title"]',                 'Time-stamped investigations',             datetime('now')),
		('feedback',  'dated-stream',       '',           '["title"]',                 'User feedback, escalations, retros',      datetime('now')),
		('tasks',     'entity-as-folder',   'task.md',    '["title"]',                 'Tasks, todos, and in-flight work items',  datetime('now'))`,

	`CREATE TABLE IF NOT EXISTS wiki_entries (
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
		status TEXT NOT NULL DEFAULT 'active',
		uuid TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`,

	`CREATE INDEX IF NOT EXISTS idx_wiki_entries_collection ON wiki_entries(collection)`,
	`CREATE INDEX IF NOT EXISTS idx_wiki_entries_updated_at ON wiki_entries(updated_at)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_entries_unique ON wiki_entries(collection, slug)`,
	`CREATE INDEX IF NOT EXISTS wiki_entries_status ON wiki_entries(status, collection, updated_at DESC)`,

	`CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
		id UNINDEXED, collection, slug, title, body,
		tokenize='porter unicode61'
	)`,

	`CREATE TRIGGER IF NOT EXISTS wiki_entries_ai AFTER INSERT ON wiki_entries BEGIN
		INSERT INTO wiki_fts(id, collection, slug, title, body)
		VALUES (new.id, new.collection, new.slug, new.title, new.body);
	END`,

	`CREATE TRIGGER IF NOT EXISTS wiki_entries_ad AFTER DELETE ON wiki_entries BEGIN
		DELETE FROM wiki_fts WHERE id = old.id;
	END`,

	`CREATE TRIGGER IF NOT EXISTS wiki_entries_au AFTER UPDATE ON wiki_entries BEGIN
		DELETE FROM wiki_fts WHERE id = old.id;
		INSERT INTO wiki_fts(id, collection, slug, title, body)
		VALUES (new.id, new.collection, new.slug, new.title, new.body);
	END`,

	`CREATE TABLE IF NOT EXISTS wiki_vector_index (
		entry_id TEXT PRIMARY KEY,
		vector_id TEXT NOT NULL,
		body_hash TEXT NOT NULL,
		indexed_at TEXT NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS wiki_audit (
		audit_id     TEXT PRIMARY KEY,
		ts           INTEGER NOT NULL,
		action       TEXT NOT NULL,
		collection   TEXT NOT NULL,
		slug         TEXT NOT NULL,
		entry_uuid   TEXT,
		agent_slug   TEXT,
		session_id   TEXT,
		prev_hash    TEXT,
		new_hash     TEXT,
		why          TEXT NOT NULL
	)`,

	`CREATE INDEX IF NOT EXISTS wiki_audit_by_entry ON wiki_audit(collection, slug, ts DESC)`,
	`CREATE INDEX IF NOT EXISTS wiki_audit_by_uuid ON wiki_audit(entry_uuid, ts DESC)`,
	`CREATE INDEX IF NOT EXISTS wiki_audit_by_agent ON wiki_audit(agent_slug, ts DESC)`,
	`CREATE INDEX IF NOT EXISTS wiki_audit_by_action_ts ON wiki_audit(action, ts DESC)`,

	`CREATE TABLE IF NOT EXISTS wiki_links (
		link_id         TEXT PRIMARY KEY,
		from_collection TEXT NOT NULL,
		from_slug       TEXT NOT NULL,
		to_collection   TEXT NOT NULL,
		to_slug         TEXT NOT NULL,
		kind            TEXT,
		why             TEXT,
		created_at      INTEGER NOT NULL
	)`,

	`CREATE INDEX IF NOT EXISTS wiki_links_from ON wiki_links(from_collection, from_slug)`,
	`CREATE INDEX IF NOT EXISTS wiki_links_to ON wiki_links(to_collection, to_slug)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS wiki_links_unique ON wiki_links(from_collection, from_slug, to_collection, to_slug, kind)`,

	`CREATE TABLE IF NOT EXISTS wiki_attachments (
		attachment_id   TEXT PRIMARY KEY,
		collection      TEXT NOT NULL,
		slug            TEXT NOT NULL,
		filename        TEXT NOT NULL,
		r2_key          TEXT NOT NULL,
		content_type    TEXT,
		size_bytes      INTEGER,
		uploaded_at     INTEGER NOT NULL
	)`,

	`CREATE INDEX IF NOT EXISTS wiki_attachments_by_entry ON wiki_attachments(collection, slug)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS wiki_attachments_unique ON wiki_attachments(collection, slug, filename)`,

	`CREATE TABLE IF NOT EXISTS cron_jobs (
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
	)`,

	`CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at)`,
	`CREATE INDEX IF NOT EXISTS idx_cron_jobs_slug ON cron_jobs(slug)`,

	`CREATE TABLE IF NOT EXISTS cron_runs (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES cron_jobs(id),
		started_at TEXT NOT NULL,
		finished_at TEXT,
		status TEXT NOT NULL,
		output TEXT,
		error TEXT
	)`,

	`CREATE INDEX IF NOT EXISTS idx_cron_runs_job_started ON cron_runs(job_id, started_at DESC)`,

	`CREATE TABLE IF NOT EXISTS session_log (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		action TEXT NOT NULL,
		target TEXT,
		created_at INTEGER NOT NULL
	)`,

	`CREATE INDEX IF NOT EXISTS idx_session_log_user ON session_log(user_id, created_at DESC)`,

	`CREATE TABLE IF NOT EXISTS worker_config (
		key        TEXT PRIMARY KEY,
		value      TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`,
];

// Per-isolate memo. Once schema is confirmed once, no further probes.
let schemaConfirmed = false;

/**
 * Ensures the D1 schema exists. Cheap when present (single sqlite_master
 * probe + memo), thorough when fresh (full schema apply). Idempotent —
 * safe to call repeatedly.
 */
export async function ensureSchema(env: Env): Promise<void> {
	if (schemaConfirmed) return;

	let probeResult: { name?: string } | null = null;
	try {
		probeResult = await env.DB.prepare(
			`SELECT name FROM sqlite_master WHERE type='table' AND name='worker_config'`,
		).first<{ name: string }>();
	} catch (err) {
		// If even the probe throws, log + continue to the apply path; the
		// apply will surface a more specific error if D1 is genuinely
		// unusable.
		console.error(
			JSON.stringify({
				event: 'bootstrap_probe_error',
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}

	if (probeResult?.name === 'worker_config') {
		schemaConfirmed = true;
		return;
	}

	console.log(
		JSON.stringify({
			event: 'bootstrap_apply_schema',
			statement_count: STATEMENTS.length,
			reason: 'worker_config table missing — applying initial schema',
		}),
	);

	// Run each statement separately. D1's prepare() doesn't split on
	// newlines so multi-line CREATE TRIGGER / VIRTUAL TABLE statements
	// work correctly.
	//
	// We don't use db.batch() because batch() wraps everything in a
	// transaction, and D1 transactions don't support DDL on the same
	// table as DML in the same transaction (the INSERT INTO
	// wiki_collections wants the table to already exist as a committed
	// schema object). Sequential prepare().run() works.
	for (let i = 0; i < STATEMENTS.length; i++) {
		try {
			await env.DB.prepare(STATEMENTS[i]).run();
		} catch (err) {
			console.error(
				JSON.stringify({
					event: 'bootstrap_statement_error',
					statement_index: i,
					statement_preview: STATEMENTS[i].slice(0, 100),
					error: err instanceof Error ? err.message : String(err),
				}),
			);
			throw new Error(
				`D1 schema bootstrap failed at statement ${i}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
	}

	// Confirm the apply landed.
	const after = await env.DB.prepare(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='worker_config'`,
	).first<{ name: string }>();
	if (after?.name !== 'worker_config') {
		throw new Error(
			'D1 schema bootstrap failed: worker_config still missing after apply',
		);
	}

	console.log(
		JSON.stringify({
			event: 'bootstrap_complete',
			statement_count: STATEMENTS.length,
		}),
	);

	schemaConfirmed = true;
}

export function _resetSchemaMemo(): void {
	schemaConfirmed = false;
}
