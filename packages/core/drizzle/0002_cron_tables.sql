-- Cron jobs + run history.

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
