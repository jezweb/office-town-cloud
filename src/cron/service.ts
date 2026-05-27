// Cron / routines service — schedule, list, run-now, history.
//
// Stored in D1 (table created in migration 0002). Goose Desktop polls
// /api/cron/due to pick up jobs whose next_run_at has passed; the desktop
// executes them locally and reports completion via /api/cron/history.

import type { Env } from '../types';

export interface CronJob {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	command: string;
	cron_expression: string | null;
	frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'cron' | 'once';
	timezone: string;
	enabled: boolean;
	last_run_at: string | null;
	next_run_at: string | null;
	last_status: 'success' | 'error' | 'running' | null;
	created_at: string;
	updated_at: string;
}

export interface CronRunRecord {
	id: string;
	job_id: string;
	started_at: string;
	finished_at: string | null;
	status: 'success' | 'error' | 'running';
	output: string | null;
	error: string | null;
}

function generateId(prefix: string): string {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
	return `${prefix}_${hex}`;
}

/**
 * Compute next_run_at given frequency + last_run_at. Very minimal — production
 * should use a real cron parser. For v1, frequency presets are sufficient.
 */
export function computeNextRunAt(
	frequency: CronJob['frequency'],
	lastRunAt: Date | null,
	_cronExpression: string | null
): Date | null {
	if (frequency === 'once') return null;
	if (frequency === 'cron') {
		// TODO: real cron parser. For now, treat as hourly fallback.
		return new Date((lastRunAt ?? new Date()).getTime() + 60 * 60 * 1000);
	}
	const base = lastRunAt ?? new Date();
	switch (frequency) {
		case 'hourly':
			return new Date(base.getTime() + 60 * 60 * 1000);
		case 'daily':
			return new Date(base.getTime() + 24 * 60 * 60 * 1000);
		case 'weekly':
			return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
		case 'monthly': {
			const d = new Date(base);
			d.setMonth(d.getMonth() + 1);
			return d;
		}
		default:
			return null;
	}
}

export class CronService {
	constructor(private readonly env: Env) {}

	async schedule(input: {
		slug: string;
		title: string;
		description?: string;
		command: string;
		frequency: CronJob['frequency'];
		cron_expression?: string;
		timezone?: string;
	}): Promise<CronJob> {
		const id = generateId('cron');
		const now = new Date();
		const nextRun = computeNextRunAt(input.frequency, null, input.cron_expression ?? null);

		await this.env.DB.prepare(
			`INSERT INTO cron_jobs (id, slug, title, description, command, cron_expression, frequency, timezone, enabled, next_run_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
		)
			.bind(
				id,
				input.slug,
				input.title,
				input.description ?? null,
				input.command,
				input.cron_expression ?? null,
				input.frequency,
				input.timezone ?? 'Australia/Sydney',
				nextRun?.toISOString() ?? null,
				now.toISOString(),
				now.toISOString()
			)
			.run();

		return (await this.get(id))!;
	}

	async get(id: string): Promise<CronJob | null> {
		const row = await this.env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?')
			.bind(id)
			.first<Record<string, unknown>>();
		if (!row) return null;
		return rowToCronJob(row);
	}

	async list(): Promise<CronJob[]> {
		const rows = await this.env.DB.prepare('SELECT * FROM cron_jobs ORDER BY next_run_at ASC')
			.all<Record<string, unknown>>();
		return (rows.results ?? []).map(rowToCronJob);
	}

	async due(now: Date = new Date()): Promise<CronJob[]> {
		const rows = await this.env.DB.prepare(
			'SELECT * FROM cron_jobs WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC'
		)
			.bind(now.toISOString())
			.all<Record<string, unknown>>();
		return (rows.results ?? []).map(rowToCronJob);
	}

	async markStarted(jobId: string): Promise<string> {
		const runId = generateId('run');
		const now = new Date().toISOString();
		await this.env.DB.prepare(
			`INSERT INTO cron_runs (id, job_id, started_at, status) VALUES (?, ?, ?, 'running')`
		)
			.bind(runId, jobId, now)
			.run();
		await this.env.DB.prepare(
			'UPDATE cron_jobs SET last_status = ?, last_run_at = ?, updated_at = ? WHERE id = ?'
		)
			.bind('running', now, now, jobId)
			.run();
		return runId;
	}

	async markFinished(runId: string, jobId: string, status: 'success' | 'error', output: string | null, error: string | null): Promise<void> {
		const now = new Date().toISOString();
		await this.env.DB.prepare(
			`UPDATE cron_runs SET status = ?, finished_at = ?, output = ?, error = ? WHERE id = ?`
		)
			.bind(status, now, output, error, runId)
			.run();

		const job = await this.get(jobId);
		if (!job) return;
		const nextRun = computeNextRunAt(job.frequency, new Date(now), job.cron_expression);
		await this.env.DB.prepare(
			'UPDATE cron_jobs SET last_status = ?, next_run_at = ?, updated_at = ? WHERE id = ?'
		)
			.bind(status, nextRun?.toISOString() ?? null, now, jobId)
			.run();
	}

	async history(jobId: string, limit = 20): Promise<CronRunRecord[]> {
		const rows = await this.env.DB.prepare(
			'SELECT * FROM cron_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?'
		)
			.bind(jobId, limit)
			.all<Record<string, unknown>>();
		return (rows.results ?? []).map((r) => ({
			id: r.id as string,
			job_id: r.job_id as string,
			started_at: r.started_at as string,
			finished_at: (r.finished_at as string | null) ?? null,
			status: r.status as CronRunRecord['status'],
			output: (r.output as string | null) ?? null,
			error: (r.error as string | null) ?? null,
		}));
	}

	async delete(id: string): Promise<void> {
		await this.env.DB.prepare('DELETE FROM cron_jobs WHERE id = ?').bind(id).run();
		await this.env.DB.prepare('DELETE FROM cron_runs WHERE job_id = ?').bind(id).run();
	}
}

function rowToCronJob(row: Record<string, unknown>): CronJob {
	return {
		id: row.id as string,
		slug: row.slug as string,
		title: row.title as string,
		description: (row.description as string | null) ?? null,
		command: row.command as string,
		cron_expression: (row.cron_expression as string | null) ?? null,
		frequency: row.frequency as CronJob['frequency'],
		timezone: row.timezone as string,
		enabled: Boolean(row.enabled),
		last_run_at: (row.last_run_at as string | null) ?? null,
		next_run_at: (row.next_run_at as string | null) ?? null,
		last_status: (row.last_status as CronJob['last_status']) ?? null,
		created_at: row.created_at as string,
		updated_at: row.updated_at as string,
	};
}
