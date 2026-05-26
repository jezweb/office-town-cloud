// office-town-mcp-wiki — streamable-HTTP MCP server exposing wiki tools.
//
// Goose (and any MCP-compatible host) connects to /sse for SSE transport
// or /mcp for the streamable HTTP transport. We translate JSON-RPC tool
// calls into HTTP calls against office-town-core's /api/wiki/* routes.

import { Hono } from 'hono';

interface Env {
	CORE_BASE_URL: string;
	MCP_BEARER_TOKEN: string;
	CORE: Fetcher; // Service binding to office-town-core
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
	error?: { code: number; message: string; data?: unknown };
}

const TOOL_SCHEMA = {
	'wiki.create': {
		description:
			'Create a new wiki entry. Frontmatter must include slug (or one will be derived from input.slug). Universal sextet (slug, kind, created, last_updated, last_edited_by, last_change_summary) auto-filled if missing.',
		inputSchema: {
			type: 'object',
			properties: {
				collection: { type: 'string', description: 'Target collection (knowledge, contacts, orgs, etc.). Defaults to knowledge.' },
				slug: { type: 'string', description: 'Kebab-case slug. Optional if frontmatter.slug is present.' },
				frontmatter: { type: 'object', description: 'YAML frontmatter as an object. Sextet fields auto-filled.' },
				body: { type: 'string', description: 'Markdown body.' },
			},
			required: ['frontmatter', 'body'],
		},
	},
	'wiki.read': {
		description: 'Read a wiki entry by collection + slug. Returns full frontmatter + body.',
		inputSchema: {
			type: 'object',
			properties: {
				collection: { type: 'string' },
				slug: { type: 'string' },
			},
			required: ['collection', 'slug'],
		},
	},
	'wiki.update': {
		description: 'Update a wiki entry. Merge frontmatter_patch into existing frontmatter; replace body if given. last_change_summary is required.',
		inputSchema: {
			type: 'object',
			properties: {
				collection: { type: 'string' },
				slug: { type: 'string' },
				frontmatter_patch: { type: 'object' },
				body: { type: 'string' },
				last_change_summary: { type: 'string' },
			},
			required: ['collection', 'slug', 'last_change_summary'],
		},
	},
	'wiki.delete': {
		description: 'Delete a wiki entry. Archives the R2 object before removal.',
		inputSchema: {
			type: 'object',
			properties: {
				collection: { type: 'string' },
				slug: { type: 'string' },
			},
			required: ['collection', 'slug'],
		},
	},
	'wiki.search': {
		description:
			'Hybrid FTS + vector search. Returns triage shape (frontmatter + 300-char excerpt + signed URL) by default. Set expanded=true to fold in full bodies.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string' },
				collections: { type: 'array', items: { type: 'string' } },
				limit: { type: 'number', description: 'Max hits (default 10, max 50)' },
				expanded: { type: 'boolean', description: 'Include full body in results' },
			},
			required: ['query'],
		},
	},
	'wiki.list_collections': {
		description: 'List all registered wiki collections with their shapes and required fields.',
		inputSchema: { type: 'object', properties: {} },
	},
	'wiki.register_collection': {
		description: 'Register a new collection. Default collections (business, contacts, orgs, etc.) are pre-registered.',
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				shape: { type: 'string', enum: ['entity-as-folder', 'dated-stream', 'flat-topic'] },
				canonical_filename: { type: 'string' },
				required_fields: { type: 'array', items: { type: 'string' } },
				description: { type: 'string' },
			},
			required: ['name', 'shape', 'canonical_filename', 'required_fields', 'description'],
		},
	},
} as const;

async function callCore(env: Env, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${env.MCP_BEARER_TOKEN}`,
	};
	if (body !== undefined) headers['Content-Type'] = 'application/json';

	// Use service binding (env.CORE) when available — avoids cross-zone fetch overhead
	// and CF "1042 origin connection error" on Worker-to-Worker public URLs.
	const fetchImpl = env.CORE?.fetch?.bind(env.CORE) ?? fetch;
	const url = env.CORE ? `https://core.internal${path}` : `${env.CORE_BASE_URL}${path}`;

	const resp = await fetchImpl(url, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
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
		case 'wiki.create': {
			const collection = (args.collection as string) ?? 'knowledge';
			const result = await callCore(env, 'POST', `/api/wiki/${collection}`, {
				slug: args.slug,
				frontmatter: args.frontmatter,
				body: args.body,
			});
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return result.body;
		}
		case 'wiki.read': {
			const result = await callCore(env, 'GET', `/api/wiki/${args.collection}/${args.slug}`);
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return result.body;
		}
		case 'wiki.update': {
			const result = await callCore(env, 'PATCH', `/api/wiki/${args.collection}/${args.slug}`, {
				frontmatter_patch: args.frontmatter_patch,
				body: args.body,
				last_change_summary: args.last_change_summary,
			});
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return result.body;
		}
		case 'wiki.delete': {
			const result = await callCore(env, 'DELETE', `/api/wiki/${args.collection}/${args.slug}`);
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return { ok: true };
		}
		case 'wiki.search': {
			const result = await callCore(env, 'POST', '/api/wiki/search', args);
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return result.body;
		}
		case 'wiki.list_collections': {
			const result = await callCore(env, 'GET', '/api/wiki/collections');
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return result.body;
		}
		case 'wiki.register_collection': {
			const result = await callCore(env, 'POST', '/api/wiki/collections', args);
			if (result.status >= 400) throw new Error(JSON.stringify(result.body));
			return { ok: true };
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
						serverInfo: { name: 'office-town-mcp-wiki', version: '0.1.0' },
					},
				};
			case 'tools/list':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						tools: Object.entries(TOOL_SCHEMA).map(([name, def]) => ({
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
				return {
					jsonrpc: '2.0',
					id: req.id,
					error: { code: -32601, message: `Method not found: ${req.method}` },
				};
		}
	} catch (err) {
		return {
			jsonrpc: '2.0',
			id: req.id,
			error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
		};
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

app.get('/sse', async (c) => {
	// SSE transport — open connection, send initial server-hello, then await
	// POSTs to /sse/message. Minimal implementation for Goose compatibility.
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp\n\n'));
		},
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-mcp-wiki' }));

export default app;
