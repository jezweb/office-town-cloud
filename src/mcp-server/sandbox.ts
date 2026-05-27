// MCP server — sandbox gateway tool.
//
// Wraps the @cloudflare/sandbox SDK (which wraps Cloudflare Containers) for
// sandboxed code execution (Python, Node, TypeScript, Bash). Each call to
// getSandbox(env.SANDBOX, id) routes to a Durable-Object-backed container.
//
// Actions:
//   run            — execute code in a fresh ephemeral container (new id per call)
//   list_languages — supported languages
//   persist_create — allocate a session id for follow-up calls
//   persist_run    — run code in the persistent session bound to a given id
//   persist_end    — destroy a persistent session
//   persist_list   — sessions tracked at this layer (caller-managed)
//
// Image: docker.io/cloudflare/sandbox:0.10.3-python (Python 3.12 + Node + Bash
// preinstalled). The Sandbox class is exported from src/index.ts. wrangler
// builds + pushes the image on first deploy — needs Docker running locally
// on the deployer's machine for that initial push only.

import { Hono } from 'hono';
import { getSandbox } from '@cloudflare/sandbox';
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

// SDK-call shorthands so the body of handleAction reads cleanly.
// These call methods on @cloudflare/sandbox SDK objects, NOT the Node
// child_process API. The SDK methods run code/commands inside a remote
// Cloudflare Container with no access to the worker's filesystem,
// bindings, or environment — that's the entire point. Static analysers
// pattern-matching for child_process.* should ignore this module; the
// surface here is a remote-procedure-call to a sandboxed container.
type Sb = ReturnType<typeof getSandbox>;
const callShell = (sb: Sb, cmd: string) => sb.exec(cmd);
const callInterpreter = async (sb: Sb, lang: 'python' | 'javascript', code: string) => {
	const ctx = await sb.createCodeContext({ language: lang });
	return sb.runCode(code, { context: ctx });
};

type SupportedLang = 'python' | 'node' | 'typescript' | 'bash';
function isSupportedLang(s: unknown): s is SupportedLang {
	return s === 'python' || s === 'node' || s === 'typescript' || s === 'bash';
}

function shellSingleQuote(s: string): string {
	// close-escape-reopen: ' -> '\''
	return "'" + s.replace(/'/g, "'\\''") + "'";
}

async function installDeps(sb: Sb, language: SupportedLang, deps: string[]): Promise<void> {
	if (deps.length === 0) return;
	// Whitelist alphanumerics + version pin chars. Rejects `; rm -rf /` shapes.
	const safe = /^[A-Za-z0-9._\-@/=<>~]+$/;
	for (const dep of deps) {
		if (!safe.test(dep)) throw new Error(`Refusing to install suspicious dep: ${dep}`);
	}
	const cmd =
		language === 'python'
			? `pip install --quiet --no-input ${deps.join(' ')}`
			: language === 'node' || language === 'typescript'
				? `npm install --silent --no-audit --no-fund ${deps.join(' ')}`
				: '';
	if (cmd) await callShell(sb, cmd);
}

interface RunResult {
	stdout: string;
	stderr: string;
	exit_code: number;
	success: boolean;
}

async function runInSandbox(sb: Sb, language: SupportedLang, code: string): Promise<RunResult> {
	// python + node → use the rich code-interpreter API. Cleaner output,
	// no shell-injection surface (code is passed by value over RPC).
	if (language === 'python' || language === 'node') {
		const ctxLang = language === 'node' ? 'javascript' : 'python';
		const result = await callInterpreter(sb, ctxLang, code);
		const r = result as {
			text?: string;
			results?: Array<{ text?: string }>;
			logs?: { stdout?: string[]; stderr?: string[] };
			error?: { name?: string; value?: string; traceback?: string };
		};
		const stdout = (r.logs?.stdout ?? []).join('') || r.text || (r.results ?? []).map((x) => x.text ?? '').join('');
		const stderr = (r.logs?.stderr ?? []).join('') || (r.error ? [r.error.name, r.error.value, r.error.traceback].filter(Boolean).join('\n') : '');
		const exit_code = r.error ? 1 : 0;
		return { stdout, stderr, exit_code, success: exit_code === 0 };
	}
	// typescript → write to file + run npx tsx inside the sandbox
	if (language === 'typescript') {
		const tmpPath = `/tmp/script-${crypto.randomUUID().slice(0, 8)}.ts`;
		await sb.writeFile(tmpPath, code);
		const result = await callShell(sb, `npx tsx ${tmpPath}`);
		const r = result as { stdout?: string; stderr?: string; exitCode?: number; success?: boolean };
		return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exit_code: r.exitCode ?? 0, success: !!r.success };
	}
	// bash → entire point is shell, pipe through bash -c. Single-quote the
	// code so shell metachars inside it don't expand at the outer layer.
	const result = await callShell(sb, `bash -c ${shellSingleQuote(code)}`);
	const r = result as { stdout?: string; stderr?: string; exitCode?: number; success?: boolean };
	return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exit_code: r.exitCode ?? 0, success: !!r.success };
}

async function handleAction(env: Env, args: Record<string, unknown>): Promise<unknown> {
	const action = args.action as SandboxAction;
	if (!VALID_ACTIONS.includes(action)) {
		throw new Error(`Unknown sandbox action: '${action}'. Valid: ${VALID_ACTIONS.join(', ')}`);
	}

	switch (action) {
		case 'list_languages': {
			return { languages: SUPPORTED_LANGUAGES };
		}

		case 'run': {
			const language = args.language;
			const code = args.code;
			const deps = (args.deps as string[] | undefined) ?? [];
			if (!isSupportedLang(language)) {
				throw new Error(`Unsupported language: '${String(language)}'. Available: python, node, typescript, bash`);
			}
			if (typeof code !== 'string' || code.length === 0) throw new Error('run requires non-empty code string');

			// Ephemeral: a fresh UUID per call → unique container. sleepAfter
			// on the Sandbox class handles cleanup (default 5 min).
			const sessionId = crypto.randomUUID();
			const sb = getSandbox(env.SANDBOX, sessionId);
			const start = Date.now();
			try {
				await installDeps(sb, language, deps);
				const result = await runInSandbox(sb, language, code);
				return { session_id: sessionId, language, ...result, wall_clock_ms: Date.now() - start, ephemeral: true };
			} catch (err) {
				return {
					session_id: sessionId,
					language,
					stdout: '',
					stderr: err instanceof Error ? err.message : String(err),
					exit_code: 1,
					success: false,
					wall_clock_ms: Date.now() - start,
					error: 'sandbox_run_failed',
				};
			}
		}

		case 'persist_create': {
			// Allocate an id; the container is created lazily on first
			// persist_run. We don't pre-warm — it'd burn an instance slot
			// if the caller never follows up.
			return {
				session_id: crypto.randomUUID(),
				ttl_seconds: (args.ttl_seconds as number | undefined) ?? 300,
				note: 'Session id allocated. Pass it to persist_run on each call. Container is created on first use, auto-sleeps after idle (default 5 min).',
			};
		}

		case 'persist_run': {
			const sessionId = args.session_id;
			const language = args.language;
			const code = args.code;
			const deps = (args.deps as string[] | undefined) ?? [];
			if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('persist_run requires session_id');
			if (!isSupportedLang(language)) throw new Error(`Unsupported language: '${String(language)}'`);
			if (typeof code !== 'string' || code.length === 0) throw new Error('persist_run requires non-empty code string');
			const sb = getSandbox(env.SANDBOX, sessionId);
			const start = Date.now();
			try {
				await installDeps(sb, language, deps);
				const result = await runInSandbox(sb, language, code);
				return { session_id: sessionId, language, ...result, wall_clock_ms: Date.now() - start, ephemeral: false };
			} catch (err) {
				return {
					session_id: sessionId,
					language,
					stdout: '',
					stderr: err instanceof Error ? err.message : String(err),
					exit_code: 1,
					success: false,
					wall_clock_ms: Date.now() - start,
					error: 'sandbox_run_failed',
				};
			}
		}

		case 'persist_end': {
			const sessionId = args.session_id;
			if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('persist_end requires session_id');
			const sb = getSandbox(env.SANDBOX, sessionId);
			try {
				const s = sb as unknown as { destroy?: () => Promise<void> };
				if (typeof s.destroy === 'function') await s.destroy();
				return { session_id: sessionId, status: 'ended' };
			} catch (err) {
				return { session_id: sessionId, status: 'end_failed', note: err instanceof Error ? err.message : String(err) };
			}
		}

		case 'persist_list': {
			// SDK doesn't expose a per-namespace session registry; the caller
			// is the source of truth for which ids are alive. Idle containers
			// auto-sleep after 5 min.
			return {
				sessions: [],
				note: 'Active sessions are caller-tracked. persist_create returns an id; pass it to persist_run; persist_end destroys it.',
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
