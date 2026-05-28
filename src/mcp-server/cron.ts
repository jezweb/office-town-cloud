// MCP server — cron gateway tool.
//
// Per MASTER-PLAN v1.1 Phase 1.3 and Jezweb mcp-gateway-pattern:
// ONE gateway tool `cron` with 7 actions wrapping the existing CronService.
//
// Actions: schedule, list, get, due, history, run_now, delete

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { CronService } from '../cron/service';
import { getEffectiveBearer } from '../auth/bearer';

const app = new Hono<AppContext>();

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number | string;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResult<T = unknown> {
	jsonrpc: '2.0';
	id: number | string;
	result?: T;
	error?: { code: number; message: string };
}

const VALID_ACTIONS = ['schedule', 'list', 'get', 'due', 'history', 'run_now', 'delete'] as const;
type CronAction = (typeof VALID_ACTIONS)[number];

const TOOLS = {
	cron: {
		description: [
			"Office Town cron — schedule recurring agent work (cron syntax) or one-off future jobs.",
			"",
			"Actions:",
			"  schedule  — create a new cron job with cron-expression + recipe to run",
			"  list      — list all scheduled jobs",
			"  get       — get one job by id",
			"  due       — list jobs whose next_run_at is in the past (caller of this is the polling job)",
			"  history   — recent runs of a job",
			"  run_now   — trigger a job's recipe immediately (returns run_id)",
			"  delete    — remove a scheduled job",
			"",
			"Recipes follow Goose's recipe format — yaml or markdown with frontmatter. Stored in cron_jobs.recipe column.",
			"Worker has a triggers.crons in wrangler.jsonc that fires every N minutes and runs due jobs.",
		].join('\n'),
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: VALID_ACTIONS },
				id: { type: 'string', description: 'Job id (get/delete/history/run_now)' },
				name: { type: 'string', description: 'Job name (schedule)' },
				cron_expression: { type: 'string', description: 'Cron expression like "0 9 * * 1" (Mon 9am UTC) — schedule' },
				recipe: { type: 'string', description: 'Goose recipe YAML/markdown to run (schedule)' },
				description: { type: 'string', description: 'Job description (schedule)' },
				limit: { type: 'number', description: 'Max history rows (default 20)' },
			},
			required: ['action'],
		},
	},
} as const;

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

async function handleAction(env: Env, args: Record<string, unknown>): Promise<unknown> {
	const action = args.action as CronAction;
	if (!VALID_ACTIONS.includes(action)) {
		throw new Error(`Unknown cron action: '${action}'. Valid: ${VALID_ACTIONS.join(', ')}`);
	}
	const svc = new CronService(env);

	switch (action) {
		case 'schedule': {
			if (!args.name || !args.cron_expression || !args.recipe) {
				throw new Error('schedule requires name, cron_expression, recipe');
			}
			const name = args.name as string;
			return await svc.schedule({
				slug: name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60),
				title: name,
				description: (args.description as string) ?? '',
				command: args.recipe as string,
				frequency: 'cron',
				cron_expression: args.cron_expression as string,
			});
		}
		case 'list': {
			return { jobs: await svc.list() };
		}
		case 'get': {
			if (!args.id) throw new Error('get requires id');
			const job = await svc.get(args.id as string);
			if (!job) throw new Error(`Job not found: ${args.id}`);
			return job;
		}
		case 'due': {
			return { due: await svc.due() };
		}
		case 'history': {
			if (!args.id) throw new Error('history requires id');
			return { runs: await svc.history(args.id as string, (args.limit as number) ?? 20) };
		}
		case 'run_now': {
			if (!args.id) throw new Error('run_now requires id');
			const job = await svc.get(args.id as string);
			if (!job) throw new Error(`Job not found: ${args.id}`);
			const runId = await svc.markStarted(args.id as string);
			return { run_id: runId, job_id: args.id, status: 'started', note: 'Recipe execution requires Headless Goose — this just marks the run. Use Goose to actually execute the recipe.' };
		}
		case 'delete': {
			if (!args.id) throw new Error('delete requires id');
			await svc.delete(args.id as string);
			return { ok: true };
		}
		default: {
			const _exhaustive: never = action;
			throw new Error(`Unhandled action: ${String(_exhaustive)}`);
		}
	}
}

async function handleRpc(env: Env, req: JsonRpcRequest): Promise<JsonRpcResult> {
	try {
		switch (req.method) {
			case 'initialize':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						protocolVersion: '2025-03-26',
						capabilities: { tools: {} },
						serverInfo: { name: 'office-town-cron', version: '1.0.0' },
					},
				};
			case 'tools/list':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						tools: Object.entries(TOOLS).map(([name, def]) => ({
							name,
							description: def.description,
							inputSchema: def.inputSchema,
						})),
					},
				};
			case 'tools/call': {
				const params = (req.params ?? {}) as { name: string; arguments?: Record<string, unknown> };
				const value = await handleAction(env, params.arguments ?? {});
				return { jsonrpc: '2.0', id: req.id, result: { content: [asContent(value)] } };
			}
			default:
				return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
		}
	} catch (err) {
		return {
			jsonrpc: '2.0',
			id: req.id,
			error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
		};
	}
}

app.post('/', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${await getEffectiveBearer(c.env)}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const req = await c.req.json<JsonRpcRequest>();
	const result = await handleRpc(c.env, req);
	return c.json(result);
});

app.get('/sse', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${await getEffectiveBearer(c.env)}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/cron\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-cron-mcp', actions: VALID_ACTIONS.length }));

export const cronMcpRoutes = app;
