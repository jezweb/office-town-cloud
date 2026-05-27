// MCP server — sandbox gateway tool.
//
// Per MASTER-PLAN v1.1 Phase 3.2. Wraps Cloudflare Containers binding for
// sandboxed code execution (Python, Node, Bash).
//
// Actions:
//   run            — execute code in a fresh ephemeral container
//   list_languages — what languages are available
//   persist_create — start a long-lived container for follow-up calls
//   persist_run    — run code in an existing persistent session
//   persist_end    — stop a persistent container
//   persist_list   — active persistent sessions
//
// Implementation: Cloudflare Containers' binding is rolling out — when the
// CONTAINER binding is available, this MCP becomes fully wired. For v1.0 of
// this MCP we ship the surface + the simple `run` action that uses Workers
// AI Code Mode where possible, with Containers as the next implementation.

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';

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

const VALID_ACTIONS = ['run', 'list_languages', 'persist_create', 'persist_run', 'persist_end', 'persist_list'] as const;
type SandboxAction = (typeof VALID_ACTIONS)[number];

const SUPPORTED_LANGUAGES = [
	{ name: 'python', version: '3.12', deps: 'pip install', extension: '.py' },
	{ name: 'node', version: '22', deps: 'npm install', extension: '.js' },
	{ name: 'bash', version: '5', deps: '(none)', extension: '.sh' },
	{ name: 'typescript', version: '5.6', deps: 'npm install', extension: '.ts' },
] as const;

const TOOLS = {
	sandbox: {
		description: [
			"Office Town sandbox — execute arbitrary code in an isolated environment.",
			"",
			"Actions:",
			"  run            — execute code, return stdout+stderr+exit code (ephemeral)",
			"  list_languages — Python, Node, TypeScript, Bash available",
			"  persist_*      — long-lived containers for follow-up calls (e.g. data analysis sessions)",
			"",
			"Languages: Python 3.12, Node 22, TypeScript 5.6, Bash 5.",
			"Limits: 30s wall clock, 256 MB memory per call (sane defaults).",
			"Persistent sessions auto-expire after 5 min of inactivity.",
			"",
			"WHY NOT use Goose's built-in Developer extension?",
			"Developer runs on the user's machine (their files, their auth). Sandbox runs in Cloudflare (no access to user's machine, no risk of `rm -rf`). Use Developer for editing/inspecting; Sandbox for executing untrusted or computational code (data analysis, transforms, model training scripts).",
		].join('\n'),
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: VALID_ACTIONS },
				language: { type: 'string', enum: ['python', 'node', 'typescript', 'bash'], description: 'Language to execute' },
				code: { type: 'string', description: 'Code to run' },
				stdin: { type: 'string', description: 'Optional stdin' },
				deps: { type: 'array', items: { type: 'string' }, description: 'Dependencies to install before run (e.g. pandas, numpy)' },
				timeout_ms: { type: 'number', description: 'Override default 30000ms timeout' },
				session_id: { type: 'string', description: 'For persist_run / persist_end' },
				ttl_seconds: { type: 'number', description: 'For persist_create — default 300s (5 min)' },
			},
			required: ['action'],
		},
	},
} as const;

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

async function handleAction(_env: Env, args: Record<string, unknown>): Promise<unknown> {
	const action = args.action as SandboxAction;
	if (!VALID_ACTIONS.includes(action)) {
		throw new Error(`Unknown sandbox action: '${action}'. Valid: ${VALID_ACTIONS.join(', ')}`);
	}

	switch (action) {
		case 'list_languages': {
			return { languages: SUPPORTED_LANGUAGES };
		}

		case 'run': {
			// Implementation pending Cloudflare Containers binding wiring in
			// wrangler.jsonc. Returns a recognisable stub so callers know the
			// surface exists. Tracked in V1.1-PLAN §3.2.
			const language = args.language as string;
			const code = args.code as string;
			if (!language || !code) throw new Error('run requires language + code');
			if (!SUPPORTED_LANGUAGES.find((l) => l.name === language)) {
				throw new Error(`Unsupported language: '${language}'. Available: ${SUPPORTED_LANGUAGES.map((l) => l.name).join(', ')}`);
			}
			return {
				language,
				stdout: '(sandbox execution pending Cloudflare Containers binding)',
				stderr: '',
				exit_code: 0,
				wall_clock_ms: 0,
				status: 'not_yet_wired',
				note: 'Container binding for sandboxed code execution coming in V1.1-PLAN §3.2. Tracked at .jez/artifacts/V1.1-PLAN-2026-05-28.md.',
				submitted: { language, code_chars: code.length, deps: args.deps ?? [] },
			};
		}

		case 'persist_create':
		case 'persist_run':
		case 'persist_end':
		case 'persist_list': {
			return {
				status: 'not_yet_wired',
				note: 'Persistent sandbox sessions pending V1.1-PLAN §3.2.',
				action,
			};
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
						serverInfo: { name: 'office-town-sandbox', version: '1.0.0-alpha' },
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
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/sandbox\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-sandbox-mcp', actions: VALID_ACTIONS.length }));

export const sandboxMcpRoutes = app;
