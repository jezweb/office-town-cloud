// MCP server — Office Town visual surfaces (the "cortex UI kit").
//
// ONE gateway tool `cortex_ui` returns `ui://` rawHtml resources Goose Desktop
// renders inline (via @mcp-ui/client). Buttons emit `prompt` actions. Views:
//   • workflows — the roster + pending approvals
//   • cortex    — overview → collection → rendered markdown entry
//   • kit       — interactive-controls playground
// A new surface = a new `view`, NOT a new tool (keeps the agent's context lean).
// Each view builds HTML via the shared shell (ui-kit.ts).
//
// Mounted at /mcp/workflows. Bearer-gated (the global authMiddleware gates
// /mcp/* and we re-check here). See .jez/CLOUD-RUNTIME-plan-2026-05-30.md.

import { Hono } from 'hono';
import yaml from 'js-yaml';
import type { AppContext, Env } from '../types';
import { getEffectiveBearer } from '../auth/bearer';
import { signUiToken } from '../auth/ui-token';
import { WikiService } from '../wiki/service';
import { renderMarkdownBody } from '../publish/service';
import { renderWorkflowsApp, type WorkflowSummary, type PendingDraft } from './workflows-ui';
import { renderOverview, renderCollection, renderEntry } from './cortex-browser-ui';
import { renderKitGallery } from './cortex-kit-gallery-ui';

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

// ONE gateway tool, many views — keeps the agent's tool list to a single entry
// no matter how many panels we add (Jezweb mcp-gateway-pattern). A new surface
// is a new `view` value, never a new tool.
const VIEWS = ['workflows', 'cortex', 'kit', 'tasks'] as const;
type View = (typeof VIEWS)[number];

const TOOLS = {
	cortex_ui: {
		description: [
			'Open an Office Town visual panel inline in Goose Desktop. ONE tool, many views — pass {view}.',
			'',
			'Views:',
			'  workflows — the standing jobs the cortex owns + a "Needs you" tray of pending approvals.',
			'              For "show my workflows", "what is my cortex doing", reviewing/approving work.',
			'  cortex    — browse everything the cortex knows. No extra args = collections + recent entries;',
			'              {collection} = list that collection; {collection, slug} = render that entry as markdown.',
			'  kit       — a playground demoing the interactive controls (drag-reorder, form). For exploring.',
			'  tasks     — a live kanban board (drag cards between To do / Doing / Done; it saves itself).',
			'              For "show my tasks", "my task board", "what am I working on".',
			'',
			'Panel buttons send you a plain instruction (run / approve / open) — when one arrives, do it.',
			'The tasks board persists on its own — you do not need to save it.',
		].join('\n'),
		inputSchema: {
			type: 'object',
			properties: {
				view: { type: 'string', enum: VIEWS, description: 'Which panel to render' },
				collection: { type: 'string', description: 'view=cortex: collection to list (orgs, contacts, projects, …)' },
				slug: { type: 'string', description: 'view=cortex: entry slug to open (requires collection)' },
			},
			required: ['view'],
		},
	},
} as const;

function clip(s: string, n: number): string {
	const t = s.replace(/^---[\s\S]*?---/, '').replace(/[#>*`_]/g, '').replace(/\s+/g, ' ').trim();
	return t.length > n ? t.slice(0, n).trimEnd() + '…' : t;
}

async function handleBrowse(env: Env, args: { collection?: string; slug?: string }): Promise<string> {
	const svc = new WikiService(env);
	if (args.collection && args.slug) {
		const entry = await svc.read(args.collection, args.slug);
		return renderEntry(args.collection, args.slug, entry.frontmatter, renderMarkdownBody(entry.body));
	}
	if (args.collection) {
		const { results } = await svc.list({ collection: args.collection, limit: 100, sort: 'alpha' });
		return renderCollection(
			args.collection,
			results.map((r) => ({ slug: r.slug, excerpt: clip(r.excerpt, 90) })),
		);
	}
	const defs = await svc.listCollections();
	const counts = await Promise.all(
		defs.map(async (d) => ({ name: d.name, count: (await svc.list({ collection: d.name, limit: 1 })).total })),
	);
	const recent = await svc.recent({ limit: 8 });
	return renderOverview(
		counts,
		recent.map((r) => ({ collection: r.collection, slug: r.slug, excerpt: clip(r.excerpt, 90) })),
	);
}

function loadYaml(text: string): Record<string, unknown> {
	try {
		return (yaml.load(text) as Record<string, unknown>) ?? {};
	} catch {
		return {};
	}
}

async function loadWorkflows(env: Env): Promise<{ workflows: WorkflowSummary[]; pending: PendingDraft[] }> {
	const listing = await env.FILES.list({ prefix: 'workflows/', limit: 1000 });
	const workflows: WorkflowSummary[] = [];
	const pending: PendingDraft[] = [];
	const nameBySlug = new Map<string, string>();

	for (const obj of listing.objects) {
		if (!obj.key.endsWith('/recipe.yaml')) continue;
		const slug = obj.key.slice('workflows/'.length, -'/recipe.yaml'.length);
		const recipeObj = await env.FILES.get(obj.key);
		if (!recipeObj) continue;
		const recipe = loadYaml(await recipeObj.text());
		const trigObj = await env.FILES.get(`workflows/${slug}/trigger.yaml`);
		const trig = trigObj ? loadYaml(await trigObj.text()) : {};
		const log = await env.FILES.get(`workflows/${slug}/log.md`);
		let lastReceipt: string | null = null;
		if (log) {
			const lines = (await log.text()).trim().split('\n').filter(Boolean);
			lastReceipt = lines[lines.length - 1] ?? null;
		}
		const name = (recipe.title as string) ?? slug;
		nameBySlug.set(slug, name);
		workflows.push({
			slug,
			name,
			description: (recipe.description as string) ?? '',
			on: (trig.on as string) ?? 'demand',
			trust: (trig.trust as string) ?? 'review',
			runtime: (trig.runtime as string) ?? 'local',
			status: (trig.status as string) ?? 'active',
			last_receipt: lastReceipt,
		});
	}

	// Pending drafts: workflows/<slug>/pending/<file>. First non-empty line is the summary.
	for (const obj of listing.objects) {
		const m = /^workflows\/([^/]+)\/pending\/(.+)$/.exec(obj.key);
		if (!m) continue;
		const [, slug, file] = m;
		const draft = await env.FILES.get(obj.key);
		const body = draft ? (await draft.text()).trim() : '';
		const summary = body.split('\n').find((l) => l.trim()) ?? '';
		pending.push({
			slug,
			workflowName: nameBySlug.get(slug) ?? slug,
			title: file.replace(/\.[^.]+$/, ''),
			summary: summary.slice(0, 180),
		});
	}

	workflows.sort((a, b) => a.name.localeCompare(b.name));
	return { workflows, pending };
}

async function handleRpc(env: Env, req: JsonRpcRequest, origin: string): Promise<JsonRpcResult> {
	try {
		switch (req.method) {
			case 'initialize':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						protocolVersion: '2025-03-26',
						capabilities: { tools: {} },
						serverInfo: { name: 'office-town-workflows', version: '1.0.0' },
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
				if (params.name !== 'cortex_ui') {
					return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: `Unknown tool: ${params.name}` } };
				}
				const a = (params.arguments ?? {}) as { view?: View; collection?: string; slug?: string };
				const view = a.view ?? 'workflows';
				let uri: string;
				let mimeType: string;
				let text: string;
				if (view === 'workflows') {
					const { workflows, pending } = await loadWorkflows(env);
					uri = 'ui://office-town/workflows';
					mimeType = 'text/html';
					text = renderWorkflowsApp(workflows, pending);
				} else if (view === 'cortex') {
					uri = 'ui://office-town/cortex';
					mimeType = 'text/html';
					text = await handleBrowse(env, a);
				} else if (view === 'kit') {
					uri = 'ui://office-town/kit';
					mimeType = 'text/html';
					text = renderKitGallery();
				} else if (view === 'tasks') {
					// externalUrl panel — a live page that fetches + saves directly. mcp-ui
					// identifies externalUrl by mimeType text/uri-list (text = the URL). A
					// short-lived scoped token rides in the URL; the page injects it into
					// its API calls. No full bearer ever enters the iframe.
					const token = await signUiToken('tasks', 7200, await getEffectiveBearer(env), Date.now());
					uri = 'ui://office-town/tasks';
					mimeType = 'text/uri-list';
					text = `${origin}/app/tasks?t=${encodeURIComponent(token)}`;
				} else {
					return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: `Unknown view: ${a.view}. Use one of: ${VIEWS.join(', ')}` } };
				}
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: { content: [{ type: 'resource', resource: { uri, mimeType, text } }] },
				};
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
	const result = await handleRpc(c.env, req, new URL(c.req.url).origin);
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
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/workflows\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-workflows-mcp', tools: Object.keys(TOOLS).length }));

export const workflowsMcpRoutes = app;
