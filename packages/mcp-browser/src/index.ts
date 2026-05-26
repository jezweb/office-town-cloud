// office-town-mcp-browser — MCP server wrapping Cloudflare Browser Rendering.

import { Hono } from 'hono';

interface Env {
	BROWSER: Fetcher;
	MCP_BEARER_TOKEN: string;
	CORE: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

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
	'browser.fetch': {
		description: 'Fetch the rendered HTML of a URL using Cloudflare Browser Rendering. Returns the final DOM after JS execution.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				wait_for_selector: { type: 'string', description: 'Optional CSS selector to wait for before returning' },
				wait_ms: { type: 'number', description: 'Optional fixed wait in ms after page load' },
			},
			required: ['url'],
		},
	},
	'browser.screenshot': {
		description: 'Take a screenshot of a URL. Returns base64 PNG. Files via Core MCP for sharing.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				full_page: { type: 'boolean', description: 'Capture full scrollable page (default false)' },
				viewport_width: { type: 'number', description: 'Viewport width (default 1280)' },
				viewport_height: { type: 'number', description: 'Viewport height (default 800)' },
				save_to_files: { type: 'string', description: 'If set, saves screenshot to FILES bucket at this path (instead of returning base64)' },
			},
			required: ['url'],
		},
	},
	'browser.extract': {
		description: 'Extract structured data from a URL using a CSS selector map.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				selectors: { type: 'object', description: 'Map of field name -> CSS selector' },
			},
			required: ['url', 'selectors'],
		},
	},
} as const;

interface BrowserFetchOptions {
	url: string;
	html?: boolean;
	screenshot?: boolean;
	gotoOptions?: { waitUntil?: 'load' | 'networkidle0' | 'networkidle2'; timeout?: number };
	viewport?: { width: number; height: number };
	waitForSelector?: { selector: string; timeout?: number };
}

async function callBrowser(env: Env, path: string, body: BrowserFetchOptions): Promise<{ status: number; body: unknown }> {
	const resp = await env.BROWSER.fetch(`https://browser.internal${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const text = await resp.text();
	try {
		return { status: resp.status, body: text ? JSON.parse(text) : null };
	} catch {
		return { status: resp.status, body: text };
	}
}

async function handleToolCall(env: Env, tool: string, args: Record<string, unknown>): Promise<unknown> {
	switch (tool) {
		case 'browser.fetch': {
			const opts: BrowserFetchOptions = { url: args.url as string, html: true };
			if (args.wait_for_selector) {
				opts.waitForSelector = { selector: args.wait_for_selector as string, timeout: 8000 };
			}
			if (args.wait_ms) {
				opts.gotoOptions = { waitUntil: 'networkidle2', timeout: 30000 };
			}
			const result = await callBrowser(env, '/content', opts);
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return result.body;
		}
		case 'browser.screenshot': {
			const opts: BrowserFetchOptions = {
				url: args.url as string,
				screenshot: true,
				viewport: {
					width: (args.viewport_width as number) ?? 1280,
					height: (args.viewport_height as number) ?? 800,
				},
			};
			const result = await callBrowser(env, '/screenshot', opts);
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			// If save_to_files is set, POST the result to the core files endpoint
			if (args.save_to_files) {
				const path = args.save_to_files as string;
				const screenshotData = (result.body as { screenshot?: string }).screenshot;
				if (screenshotData) {
					await env.CORE.fetch('https://core.internal/api/files/upload', {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${env.MCP_BEARER_TOKEN}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							path,
							content_base64: screenshotData,
							content_type: 'image/png',
						}),
					});
					return { saved_to: path, size_bytes: Math.floor((screenshotData.length * 3) / 4) };
				}
			}
			return result.body;
		}
		case 'browser.extract': {
			// Browser Rendering supports /scrape with selector map; otherwise fetch HTML + parse server-side.
			const opts = {
				url: args.url as string,
				elements: Object.entries(args.selectors as Record<string, string>).map(([name, selector]) => ({
					name,
					selector,
				})),
			};
			const resp = await env.BROWSER.fetch('https://browser.internal/scrape', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(opts),
			});
			const text = await resp.text();
			if (resp.status >= 400) throw new Error(text);
			return text ? JSON.parse(text) : null;
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
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						protocolVersion: '2025-03-26',
						capabilities: { tools: {} },
						serverInfo: { name: 'office-town-mcp-browser', version: '0.1.0' },
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

app.post('/mcp', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const req = await c.req.json<JsonRpcRequest>();
	const result = await handleRpc(c.env, req);
	return c.json(result);
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-mcp-browser' }));

export default app;
