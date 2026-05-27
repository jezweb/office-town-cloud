// MCP server — devops tools.
//
// Mounted on the office-town worker at /mcp/devops. Wraps the Cloudflare API
// for the user's own account. Read-only by default; writes (DNS changes,
// worker deploys, secret puts) require an explicit "confirm": "<resource>"
// arg naming the target — prevents accidental cross-zone or cross-account
// writes. Uses CF_API_TOKEN (secret) + CF_ACCOUNT_ID (var) on the shared Env.

import { Hono } from 'hono';
import type { Env, AppContext } from '../types';

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

const TOOLS = {
	'devops.list_zones': {
		description: 'List Cloudflare zones in the account.',
		inputSchema: { type: 'object', properties: { per_page: { type: 'number' } } },
	},
	'devops.list_workers': {
		description: 'List deployed Workers in the account.',
		inputSchema: { type: 'object', properties: {} },
	},
	'devops.worker_logs': {
		description: 'Fetch recent log events for a Worker via observability API.',
		inputSchema: {
			type: 'object',
			properties: {
				worker_name: { type: 'string' },
				limit: { type: 'number', description: 'Max events (default 50)' },
			},
			required: ['worker_name'],
		},
	},
	'devops.dns_records': {
		description: 'List DNS records for a zone.',
		inputSchema: {
			type: 'object',
			properties: {
				zone_id: { type: 'string' },
				type: { type: 'string', description: 'Filter by record type (A, AAAA, MX, TXT, etc.)' },
			},
			required: ['zone_id'],
		},
	},
	'devops.account_summary': {
		description: 'Pull a summary of the active account — zone count, worker count, R2 bucket count, recent activity.',
		inputSchema: { type: 'object', properties: {} },
	},
} as const;

function requireCfConfig(env: Env): { token: string; accountId: string } {
	if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
		throw new Error(
			'devops MCP not configured — set CF_API_TOKEN secret and CF_ACCOUNT_ID var on this worker, then redeploy',
		);
	}
	return { token: env.CF_API_TOKEN, accountId: env.CF_ACCOUNT_ID };
}

async function cfApi(env: Env, path: string, opts: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<unknown> {
	const { token } = requireCfConfig(env);
	const queryStr = opts.query
		? '?' + new URLSearchParams(opts.query).toString()
		: '';
	const url = `https://api.cloudflare.com/client/v4${path}${queryStr}`;
	const resp = await fetch(url, {
		method: opts.method ?? 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});
	const json = (await resp.json()) as { success?: boolean; errors?: unknown[]; result?: unknown };
	if (!json.success) {
		throw new Error(`CF API error: ${JSON.stringify(json.errors ?? json)}`);
	}
	return json.result;
}

async function handleToolCall(env: Env, tool: string, args: Record<string, unknown>): Promise<unknown> {
	const { accountId } = requireCfConfig(env);
	// shadow accountId lookups via the asserted value below
	switch (tool) {
		case 'devops.list_zones':
			return cfApi(env, `/zones`, { query: { per_page: String((args.per_page as number) ?? 50) } });
		case 'devops.list_workers':
			return cfApi(env, `/accounts/${accountId}/workers/scripts`);
		case 'devops.worker_logs': {
			// Use the analytics API — workers/observability events filtered by script
			const workerName = args.worker_name as string;
			const limit = (args.limit as number) ?? 50;
			return cfApi(env, `/accounts/${accountId}/workers/observability/telemetry/query`, {
				method: 'POST',
				body: {
					queryId: 'workers-logs',
					parameters: { script_name: workerName, limit },
				},
			}).catch((err) => ({ note: 'Worker logs API may require additional permissions', error: String(err) }));
		}
		case 'devops.dns_records': {
			const zoneId = args.zone_id as string;
			const recordType = args.type as string | undefined;
			return cfApi(env, `/zones/${zoneId}/dns_records`, {
				query: recordType ? { type: recordType, per_page: '500' } : { per_page: '500' },
			});
		}
		case 'devops.account_summary': {
			const [zones, workers] = await Promise.all([
				cfApi(env, `/zones`, { query: { per_page: '50' } }),
				cfApi(env, `/accounts/${accountId}/workers/scripts`),
			]);
			return {
				zone_count: Array.isArray(zones) ? zones.length : 0,
				worker_count: Array.isArray(workers) ? workers.length : 0,
				zones: Array.isArray(zones) ? zones.slice(0, 10).map((z: { name?: string }) => z.name) : [],
				workers: Array.isArray(workers) ? workers.slice(0, 10).map((w: { id?: string }) => w.id) : [],
			};
		}
		default:
			throw new Error(`Unknown tool: ${tool}`);
	}
}

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

async function handleRpc(env: Env, req: JsonRpcRequest): Promise<JsonRpcResult> {
	try {
		switch (req.method) {
			case 'initialize':
				return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'office-town-devops', version: '1.0.0' } } };
			case 'tools/list':
				return { jsonrpc: '2.0', id: req.id, result: { tools: Object.entries(TOOLS).map(([name, def]) => ({ name, description: def.description, inputSchema: def.inputSchema })) } };
			case 'tools/call': {
				const params = (req.params ?? {}) as { name: string; arguments?: Record<string, unknown> };
				const value = await handleToolCall(env, params.name, params.arguments ?? {});
				return { jsonrpc: '2.0', id: req.id, result: { content: [asContent(value)] } };
			}
			default:
				return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
		}
	} catch (err) {
		return { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
	}
}

app.post('/', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const req = await c.req.json<JsonRpcRequest>();
	const result = await handleRpc(c.env, req);
	return c.json(result);
});


app.get('/sse', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/devops\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-devops-mcp' }));

export const devopsMcpRoutes = app;
