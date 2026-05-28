// MCP server — wiki gateway tool.
//
// Per MASTER-PLAN-2026-05-28.md §4.1 and ~/.claude/rules/mcp-gateway-pattern.md
// (Jezweb standard): ONE gateway tool `wiki` with 17 actions, not 17 separate
// tools. Keeps the LLM's tool list short, ergonomic, and consistent with
// every other Jezweb MCP (basalt-cortex, smtp2go, gmail, jim2, etc.).
//
// Actions:
//   write           — Create new entry
//   get             — Fetch full entry by collection+slug
//   read            — Alias for get (for older skills/recipes)
//   search          — Hybrid FTS5+Vectorize, optional synthesis via MCP Sampling
//   update          — Merge frontmatter patch + optional body
//   supersede       — Atomic replace with audit
//   archive         — Soft delete (status='archived')
//   delete          — Hard delete (rare — audit row records prev_hash)
//   history         — Audit log for an entry
//   link            — Cross-reference two entries
//   related         — Inverse — what links to/from this entry
//   list            — Browse a collection with optional frontmatter filter
//   tree            — Directory-style overview of all collections + slugs
//   recent          — Last-modified entries (since_days, collection?, kind?)
//   glob            — Pattern match collection/slug (find -name-like)
//   head            — First N lines of an entry body
//   head_many       — Bulk first-N-lines across multiple entries
//   collections     — List all collection definitions
//   register        — Register a new collection (e.g. via a pack plugin)
//   attach          — Add a non-markdown file to an entry's folder (logo, pdf, etc.)
//   list_attachments — List attachments for an entry
//   detach          — Remove an attachment

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { WikiService } from '../wiki/service';
import { searchWiki } from '../wiki/search';
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
	error?: { code: number; message: string; data?: unknown };
}

const VALID_ACTIONS = [
	'write', 'get', 'read', 'search', 'update', 'supersede', 'archive', 'delete',
	'history', 'link', 'related', 'list', 'tree', 'recent', 'glob', 'head', 'head_many',
	'collections', 'register', 'attach', 'list_attachments', 'detach',
] as const;
type WikiAction = (typeof VALID_ACTIONS)[number];

const TOOL_SCHEMA = {
	wiki: {
		description: [
			"Office Town wiki — team-shaped shared knowledge backed by R2 + D1 (FTS5) + Vectorize.",
			"Replaces Goose's built-in Memory extension with a richer, auditable, multi-machine substrate.",
			"",
			"Single gateway tool with multiple actions. Always pass {action: '...', ...args}.",
			"",
			"Reading actions: get, read, search, list, tree, recent, glob, head, head_many, history, related, collections, list_attachments",
			"Writing actions (require why:): write, update, supersede, archive, delete, link, register, attach, detach",
			"",
			"Triage-shape: list and search return frontmatter + 300-char excerpt + signed URL, not full bodies. Use get/read for full content.",
			"Active-only by default: archived/deleted entries are filtered out unless includeArchived:true.",
			"Audit: every write/update/supersede/archive/delete/link/attach/detach records a row in wiki_audit with required why:.",
		].join('\n'),
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: VALID_ACTIONS, description: 'The wiki operation to perform' },
				// write/update/supersede
				collection: { type: 'string', description: 'Collection name (e.g. contacts, orgs, projects, knowledge)' },
				slug: { type: 'string', description: 'Kebab-case slug (omit on write to auto-derive from frontmatter.slug)' },
				frontmatter: { type: 'object', description: 'YAML frontmatter as object (write/supersede)' },
				frontmatter_patch: { type: 'object', description: 'Partial frontmatter merge (update only)' },
				body: { type: 'string', description: 'Markdown body (write/update/supersede)' },
				new_frontmatter: { type: 'object', description: 'Replacement frontmatter (supersede)' },
				new_body: { type: 'string', description: 'Replacement body (supersede)' },
				last_change_summary: { type: 'string', description: 'Short reason for update (also acceptable as why:)' },
				why: { type: 'string', description: 'Required for every mutation: reason for the change' },
				// search
				query: { type: 'string', description: 'Search query (FTS5 + vector)' },
				collections: { type: 'array', items: { type: 'string' }, description: 'Restrict search to these collections' },
				limit: { type: 'number', description: 'Max hits (default varies per action; capped at 200-500)' },
				expanded: { type: 'boolean', description: 'Fold full bodies into search results (default false → triage-shape only)' },
				synthesize: { type: 'boolean', description: 'Use MCP Sampling to synthesize an answer from top hits' },
				// list / recent
				filter: { type: 'object', description: 'Frontmatter equality filter (list)' },
				offset: { type: 'number', description: 'Pagination offset (list)' },
				sort: { type: 'string', enum: ['recent', 'oldest', 'alpha'], description: 'Sort order (list)' },
				includeArchived: { type: 'boolean', description: 'Include archived entries (default false)' },
				since_days: { type: 'number', description: 'How far back to look (recent)' },
				kind: { type: 'string', description: 'Filter by frontmatter.kind (recent)' },
				// glob / head
				pattern: { type: 'string', description: 'Glob pattern matching collection/slug (e.g. contacts/acme-*)' },
				lines: { type: 'number', description: 'Number of lines to preview (head / head_many)' },
				items: { type: 'array', description: 'List of {collection, slug} to head_many' },
				// related / link
				depth: { type: 'number', description: 'Graph traversal depth (related)' },
				from: { type: 'object', description: '{collection, slug} for link source' },
				to: { type: 'object', description: '{collection, slug} for link target' },
				// register
				name: { type: 'string', description: 'New collection name (register)' },
				shape: { type: 'string', enum: ['entity-as-folder', 'dated-stream', 'flat-topic'], description: 'Collection layout (register)' },
				canonical_filename: { type: 'string', description: 'Canonical .md filename per entry (register)' },
				required_fields: { type: 'array', items: { type: 'string' }, description: 'Required frontmatter fields (register)' },
				description: { type: 'string', description: 'Collection description (register)' },
				// attachments
				filename: { type: 'string', description: 'Attachment filename (attach/detach)' },
				content_base64: { type: 'string', description: 'Base64 content (attach)' },
				content_type: { type: 'string', description: 'MIME type (attach)' },
			},
			required: ['action'],
		},
	},
} as const;

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

function getEditor(args: Record<string, unknown>): string {
	return (args.agent_slug as string) ?? (args.editor as string) ?? 'mcp-agent';
}

function getWhy(args: Record<string, unknown>, fallback?: string): string {
	const candidate = (args.why as string) ?? (args.last_change_summary as string) ?? fallback;
	if (!candidate) {
		throw new Error("Action requires 'why:' — every wiki mutation must record a rationale (per MEMORY-COMPARISON.md design contract)");
	}
	return candidate;
}

async function handleAction(env: Env, args: Record<string, unknown>): Promise<unknown> {
	const action = args.action as WikiAction;
	if (!VALID_ACTIONS.includes(action)) {
		throw new Error(`Unknown action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}`);
	}
	const svc = new WikiService(env);

	switch (action) {
		case 'write': {
			return await svc.create(
				{
					collection: (args.collection as string) ?? 'knowledge',
					slug: args.slug as string | undefined,
					frontmatter: (args.frontmatter as Record<string, unknown>) ?? {},
					body: (args.body as string) ?? '',
				},
				getEditor(args),
				getWhy(args, 'initial entry'),
				args.session_id as string | undefined,
			);
		}
		case 'get':
		case 'read': {
			if (!args.collection || !args.slug) throw new Error('get/read require collection + slug');
			return await svc.read(args.collection as string, args.slug as string);
		}
		case 'update': {
			return await svc.update(
				{
					collection: args.collection as string,
					slug: args.slug as string,
					frontmatter_patch: args.frontmatter_patch as Record<string, unknown> | undefined,
					body: args.body as string | undefined,
					last_change_summary: getWhy(args),
				},
				getEditor(args),
				args.session_id as string | undefined,
			);
		}
		case 'supersede': {
			return await svc.supersede(
				{
					collection: args.collection as string,
					slug: args.slug as string,
					new_frontmatter: args.new_frontmatter as Record<string, unknown> | undefined,
					new_body: args.new_body as string | undefined,
				},
				getWhy(args),
				getEditor(args),
				args.session_id as string | undefined,
			);
		}
		case 'archive': {
			await svc.archive(args.collection as string, args.slug as string, getWhy(args), getEditor(args), args.session_id as string | undefined);
			return { ok: true };
		}
		case 'delete': {
			await svc.delete(args.collection as string, args.slug as string, getWhy(args), getEditor(args), args.session_id as string | undefined);
			return { ok: true };
		}
		case 'search': {
			const input = {
				query: args.query as string,
				collections: args.collections as string[] | undefined,
				limit: args.limit as number | undefined,
				expanded: args.expanded as boolean | undefined,
			};
			if (!input.query) throw new Error('search requires query');
			const hits = await searchWiki(env, input);
			const expandedHits = input.expanded
				? await Promise.all(
						hits.map(async (h) => {
							const read = await svc.read(h.collection, h.slug).catch(() => null);
							return { ...h, body: read?.body ?? '' };
						}),
					)
				: hits;

			// Optional synthesis — uses Workers AI directly (user pays via their CF
			// account for the gpt-oss-20b call). When MCP Sampling support lands in
			// our streamable-HTTP transport (v1.2), this could be switched to use
			// the host LLM via sampling/createMessage at zero cost.
			let synthesized: string | null = null;
			if (args.synthesize && hits.length > 0) {
				const context = hits.slice(0, 5).map((h, i) => {
					const fm = (h as { frontmatter?: Record<string, unknown> }).frontmatter ?? {};
					const excerpt = (h as { excerpt?: string }).excerpt ?? '';
					const title = fm.title ?? fm.name ?? (h as { slug?: string }).slug ?? '?';
					return `[${i + 1}] ${title} (${h.collection}/${(h as { slug?: string }).slug})\n${excerpt}`;
				}).join('\n\n');
				const prompt = `Given these top search results from the wiki, provide a concise synthesised answer to the query "${input.query}". Cite sources by [N] number. If the results don't actually answer the question, say so honestly.\n\nResults:\n${context}\n\nSynthesised answer:`;
				try {
					const result = await env.AI.run('@cf/openai/gpt-oss-20b' as never, {
						messages: [
							{ role: 'system', content: 'You are a concise synthesis assistant. Cite sources by [N]. Be brief.' },
							{ role: 'user', content: prompt },
						],
						max_tokens: 600,
						temperature: 0.3,
					} as never);
					const r = result as { response?: string; choices?: Array<{ message?: { content?: string } }> };
					synthesized = r.response ?? r.choices?.[0]?.message?.content ?? null;
				} catch (err) {
					synthesized = null;
					console.error(JSON.stringify({ event: 'wiki_search_synthesize_failed', error: String(err) }));
				}
			}

			return {
				hits: expandedHits,
				...(args.synthesize ? { synthesized } : {}),
			};
		}
		case 'history': {
			const limit = (args.limit as number | undefined) ?? 50;
			return await svc.getHistory(args.collection as string, args.slug as string, limit);
		}
		case 'link': {
			return await svc.link(
				{
					from: args.from as { collection: string; slug: string },
					to: args.to as { collection: string; slug: string },
					kind: args.kind as string | undefined,
					why: getWhy(args),
				},
				getEditor(args),
				args.session_id as string | undefined,
			);
		}
		case 'related': {
			return await svc.related(args.collection as string, args.slug as string, args.depth as number | undefined);
		}
		case 'list': {
			return await svc.list({
				collection: args.collection as string,
				filter: args.filter as Record<string, unknown> | undefined,
				limit: args.limit as number | undefined,
				offset: args.offset as number | undefined,
				sort: args.sort as 'recent' | 'oldest' | 'alpha' | undefined,
				includeArchived: args.includeArchived as boolean | undefined,
			});
		}
		case 'tree': {
			return await svc.tree(args.depth as number | undefined);
		}
		case 'recent': {
			return await svc.recent({
				since_days: args.since_days as number | undefined,
				collection: args.collection as string | undefined,
				kind: args.kind as string | undefined,
				limit: args.limit as number | undefined,
			});
		}
		case 'glob': {
			return await svc.glob(args.pattern as string, args.limit as number | undefined);
		}
		case 'head': {
			return await svc.head(args.collection as string, args.slug as string, args.lines as number | undefined);
		}
		case 'head_many': {
			return await svc.headMany(args.items as Array<{ collection: string; slug: string }>, args.lines as number | undefined);
		}
		case 'collections': {
			return { collections: await svc.listCollections() };
		}
		case 'register': {
			await svc.registerCollection({
				name: args.name as string,
				shape: args.shape as 'entity-as-folder' | 'dated-stream' | 'flat-topic',
				canonical_filename: args.canonical_filename as string,
				required_fields: args.required_fields as string[],
				description: args.description as string,
			});
			return { ok: true };
		}
		case 'attach': {
			const bytes = args.content_base64
				? Uint8Array.from(atob(args.content_base64 as string), (c) => c.charCodeAt(0))
				: new Uint8Array(0);
			return await svc.addAttachment(
				{
					collection: args.collection as string,
					slug: args.slug as string,
					filename: args.filename as string,
					content_bytes: bytes,
					content_type: args.content_type as string | undefined,
				},
				getEditor(args),
				getWhy(args),
				args.session_id as string | undefined,
			);
		}
		case 'list_attachments': {
			return { attachments: await svc.listAttachments(args.collection as string, args.slug as string) };
		}
		case 'detach': {
			await svc.removeAttachment(
				args.collection as string,
				args.slug as string,
				args.filename as string,
				getWhy(args),
				getEditor(args),
				args.session_id as string | undefined,
			);
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
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/wiki\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-wiki-mcp', actions: VALID_ACTIONS.length }));

export const wikiMcpRoutes = app;
