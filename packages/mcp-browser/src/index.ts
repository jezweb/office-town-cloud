// office-town-mcp-browser — MCP server wrapping Cloudflare Browser Rendering
// via @cloudflare/puppeteer. The BROWSER binding exposes a Puppeteer-compatible
// instance, NOT a REST endpoint — earlier version using bare fetch was wrong.

import { Hono } from 'hono';
import puppeteer from '@cloudflare/puppeteer';

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
		description: 'Fetch the rendered HTML of a URL using headless Chrome.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				wait_for_selector: { type: 'string' },
				wait_ms: { type: 'number' },
				viewport_width: { type: 'number' },
				viewport_height: { type: 'number' },
			},
			required: ['url'],
		},
	},
	'browser.screenshot': {
		description: 'Take a screenshot of a URL. Returns base64 PNG, or saves to FILES bucket if save_to_files is set.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				full_page: { type: 'boolean' },
				viewport_width: { type: 'number' },
				viewport_height: { type: 'number' },
				save_to_files: { type: 'string' },
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
				selectors: { type: 'object' },
			},
			required: ['url', 'selectors'],
		},
	},
} as const;

async function withBrowser<T>(env: Env, fn: (page: import('@cloudflare/puppeteer').Page) => Promise<T>): Promise<T> {
	const browser = await puppeteer.launch(env.BROWSER as never);
	try {
		const page = await browser.newPage();
		return await fn(page);
	} finally {
		await browser.close();
	}
}

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

async function handleToolCall(env: Env, tool: string, args: Record<string, unknown>): Promise<unknown> {
	switch (tool) {
		case 'browser.fetch': {
			return withBrowser(env, async (page) => {
				if (args.viewport_width || args.viewport_height) {
					await page.setViewport({
						width: (args.viewport_width as number) ?? 1280,
						height: (args.viewport_height as number) ?? 800,
					});
				}
				await page.goto(args.url as string, { waitUntil: 'domcontentloaded', timeout: 30_000 });
				if (args.wait_for_selector) {
					await page.waitForSelector(args.wait_for_selector as string, { timeout: 8_000 });
				}
				if (args.wait_ms) {
					await new Promise((r) => setTimeout(r, args.wait_ms as number));
				}
				const html = await page.content();
				const title = await page.title();
				const finalUrl = page.url();
				return { url: finalUrl, title, html, length: html.length };
			});
		}

		case 'browser.screenshot': {
			return withBrowser(env, async (page) => {
				await page.setViewport({
					width: (args.viewport_width as number) ?? 1280,
					height: (args.viewport_height as number) ?? 800,
				});
				await page.goto(args.url as string, { waitUntil: 'domcontentloaded', timeout: 30_000 });
				const buffer = (await page.screenshot({
					fullPage: (args.full_page as boolean) ?? false,
					type: 'png',
				})) as Uint8Array;

				if (args.save_to_files) {
					const path = args.save_to_files as string;
					const base64 = toBase64(buffer);
					const resp = await env.CORE.fetch('https://core.internal/api/files/upload', {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${env.MCP_BEARER_TOKEN}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							path,
							content_base64: base64,
							content_type: 'image/png',
						}),
					});
					const json = await resp.json();
					return { saved_to: path, size_bytes: buffer.byteLength, file_meta: json };
				}

				return {
					url: args.url,
					size_bytes: buffer.byteLength,
					screenshot_base64: toBase64(buffer),
				};
			});
		}

		case 'browser.extract': {
			return withBrowser(env, async (page) => {
				await page.goto(args.url as string, { waitUntil: 'domcontentloaded', timeout: 30_000 });
				const selectors = args.selectors as Record<string, string>;
				const result: Record<string, string | null> = {};
				for (const [field, selector] of Object.entries(selectors)) {
					try {
						const elementHandle = await page.$(selector);
						if (elementHandle) {
							const text = await elementHandle.evaluate((el: Element) => el.textContent?.trim() ?? '');
							result[field] = text;
							await elementHandle.dispose();
						} else {
							result[field] = null;
						}
					} catch {
						result[field] = null;
					}
				}
				return { url: page.url(), extracted: result };
			});
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
						serverInfo: { name: 'office-town-mcp-browser', version: '0.2.0' },
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

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-mcp-browser', version: '0.2.0' }));

export default app;
