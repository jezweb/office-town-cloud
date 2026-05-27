// MCP server — wiki tools.
//
// Mounted on the office-town worker at /mcp/wiki. Speaks streamable-HTTP MCP
// (POST /mcp/wiki for JSON-RPC, GET /mcp/wiki/sse for SSE transport endpoint
// advertising). Translates JSON-RPC tool calls into direct in-process calls
// against the WikiService and searchWiki — no cross-worker fetches, no
// service bindings.

import { Hono } from 'hono';
import type { Env, AppContext } from '../types';
import { WikiService } from '../wiki/service';
import { searchWiki } from '../wiki/search';
import type { WikiSearchInput } from '../lib/shared';

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

async function handleToolCall(env: Env, tool: string, args: Record<string, unknown>): Promise<unknown> {
	const svc = new WikiService(env);
	const editor = 'mcp-agent'; // MCP calls don't carry session identity; use a stable agent slug

	switch (tool) {
		case 'wiki.create': {
			const collection = (args.collection as string) ?? 'knowledge';
			return await svc.create(
				{
					collection,
					slug: args.slug as string | undefined,
					frontmatter: (args.frontmatter as Record<string, unknown>) ?? {},
					body: (args.body as string) ?? '',
				},
				editor,
			);
		}
		case 'wiki.read': {
			return await svc.read(args.collection as string, args.slug as string);
		}
		case 'wiki.update': {
			return await svc.update(
				{
					collection: args.collection as string,
					slug: args.slug as string,
					frontmatter_patch: args.frontmatter_patch as Record<string, unknown> | undefined,
					body: args.body as string | undefined,
					last_change_summary: args.last_change_summary as string,
				},
				editor,
			);
		}
		case 'wiki.delete': {
			await svc.delete(args.collection as string, args.slug as string);
			return { ok: true };
		}
		case 'wiki.search': {
			const input = args as unknown as WikiSearchInput;
			const hits = await searchWiki(env, input);
			if (input.expanded) {
				const expanded = await Promise.all(
					hits.map(async (h) => {
						const read = await svc.read(h.collection, h.slug).catch(() => null);
						return { ...h, body: read?.body ?? '' };
					}),
				);
				return { hits: expanded };
			}
			return { hits };
		}
		case 'wiki.list_collections': {
			const collections = await svc.listCollections();
			return { collections };
		}
		case 'wiki.register_collection': {
			await svc.registerCollection(args as unknown as Parameters<typeof svc.registerCollection>[0]);
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
						serverInfo: { name: 'office-town-wiki', version: '1.0.0' },
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

// POST / — main JSON-RPC endpoint (mounted at /mcp/wiki by the root app)
app.post('/', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const req = await c.req.json<JsonRpcRequest>();
	const result = await handleRpc(c.env, req);
	return c.json(result);
});

// GET /sse — SSE transport endpoint advertising for legacy MCP clients
app.get('/sse', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/wiki\n\n'));
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

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-wiki-mcp' }));

export const wikiMcpRoutes = app;
