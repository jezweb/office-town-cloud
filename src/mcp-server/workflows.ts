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
import { createCustomApp } from '../apps-api/routes';
import { createSharedApp } from '../share-app/store';
// cortex-entity-ui.ts (rawHtml read-only card) is kept for a future inline-mention
// path; the entity view now serves the editable externalUrl page (app/entity-page).

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
const VIEWS = ['workflows', 'cortex', 'entity', 'kit', 'tasks'] as const;
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
			'  entity    — an editable panel for ONE entity (needs {collection, slug}): click-to-edit fields,',
			'              relationships, append-a-note. The owner edits directly (no need to ask you).',
			'              OPTIONAL {actions: [{label, prompt}]} — look at THIS entity and suggest up to ~6 useful',
			'              next moves as buttons. label = short (e.g. "Draft welcome email"); prompt = the exact',
			'              instruction sent back to you when tapped. For internal/safe moves (create a task, set a',
			'              reminder, file a note) write a prompt that just does it; for outward/irreversible ones',
			'              (send email, publish) write a prompt that DRAFTS to pending for the owner to approve.',
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
	create_app: {
		description: [
			'Create a NEW standalone app for the owner and install it to their Goose Apps page (it appears',
			'within ~1 min, daemon-installed). You author a self-contained HTML document; it runs in its own',
			'Goose window. PERSISTENCE: the app has window.ot.load() (returns saved JSON, {} if none) and',
			'window.ot.save(data) (persists any JSON) — use these for all state, NOT localStorage or external',
			'servers. The HTML MUST be fully self-contained: inline CSS + JS, NO external CDN/script/font URLs',
			'(the sandbox blocks them). Prefer the warm Office Town look (cream #f7f3e8 / terracotta #c25e4f, or',
			'a dark espresso variant). Use when the owner asks for a custom tool, tracker, board, or widget.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'Short app name (shown on the card + window title)' },
				description: { type: 'string', description: 'One line describing what it does' },
				html: { type: 'string', description: 'Complete self-contained HTML doc. Use window.ot.load()/save(data) for persistence.' },
				width: { type: 'number', description: 'Window width px (default 720)' },
				height: { type: 'number', description: 'Window height px (default 640)' },
			},
			required: ['name', 'html'],
		},
	},
	create_share_app: {
		description: [
			'Create a CUSTOMER-FACING app behind a public magic link and return the URL to send them.',
			'For ONE external person/moment: a feedback form, intake form, quote approval, booking page,',
			'status page. You author self-contained HTML; the customer opens the link (NO login) and submits.',
			'SUBMIT: call window.ot.submit(data) with a JSON object of the form fields — it writes a response',
			'into the cortex inbox (only the owner sees responses). The app is WRITE-ONLY for the customer: it',
			'CANNOT read the cortex or anything else. Self-contained HTML only (inline CSS/JS, NO external URLs).',
			'After creating, give the owner the returned link to send to their customer; responses hit the inbox.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'What the form is (shown to the owner; titles the responses)' },
				html: { type: 'string', description: 'Complete self-contained HTML doc. Use window.ot.submit(data) to send the response.' },
			},
			required: ['name', 'html'],
		},
	},
	launch_app: {
		description: [
			'Open (or refresh/close) an INSTALLED app window in Goose Desktop for the owner — the popup.',
			'Use to surface an app proactively (then say you have opened their task board). The app must',
			'already be installed (catalogue + installed-set; built-ins like office-town-tasks always are);',
			'a just-created app needs ~1 min to install first. slug = the app id. mode: launch (default) |',
			'refresh | close.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				slug: { type: 'string', description: 'App id, e.g. office-town-tasks, office-town-capture' },
				mode: { type: 'string', enum: ['launch', 'refresh', 'close'], description: 'Default launch' },
			},
			required: ['slug'],
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
						capabilities: { tools: {}, resources: {} },
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
				if (params.name === 'create_app') {
					const ca = (params.arguments ?? {}) as { name?: string; description?: string; html?: string; width?: number; height?: number };
					if (!ca.name || !ca.html) {
						return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'create_app needs {name, html}' } };
					}
					const def = await createCustomApp(env, {
						name: ca.name,
						description: ca.description ?? '',
						html: ca.html,
						width: ca.width,
						height: ca.height,
					});
					return {
						jsonrpc: '2.0',
						id: req.id,
						result: {
							content: [
								{
									type: 'text',
									text: `Created app "${def.name}" (${def.slug}). It installs to the owner's Goose Apps page within ~1 minute (the sync daemon writes it). Tell them to open the Apps tab and Launch it.`,
								},
							],
						},
					};
				}
				if (params.name === 'create_share_app') {
					const sa = (params.arguments ?? {}) as { name?: string; html?: string };
					if (!sa.name || !sa.html) {
						return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'create_share_app needs {name, html}' } };
					}
					const shared = await createSharedApp(env, { name: sa.name, html: sa.html });
					const url = `${origin}/c/${shared.shareId}`;
					return {
						jsonrpc: '2.0',
						id: req.id,
						result: {
							content: [
								{
									type: 'text',
									text: `Created a shareable app "${shared.name}". Send your customer this magic link:\n${url}\n\nThey open it (no login), fill it in, and the response lands in your cortex inbox. The link is write-only — they can't see your cortex or anything else.`,
								},
							],
						},
					};
				}
				if (params.name === 'launch_app') {
					const la = (params.arguments ?? {}) as { slug?: string; mode?: string };
					if (!la.slug) return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'launch_app needs {slug}' } };
					const evt = la.mode === 'close' ? 'app_deleted' : la.mode === 'refresh' ? 'app_updated' : 'app_created';
					const verb = la.mode === 'close' ? 'Closed' : la.mode === 'refresh' ? 'Refreshed' : 'Opened';
					return {
						jsonrpc: '2.0',
						id: req.id,
						result: {
							content: [{ type: 'text', text: `${verb} "${la.slug}" in Goose Desktop.` }],
							_meta: { platform_notification: { method: 'platform_event', params: { extension: 'apps', event_type: evt, app_name: la.slug } } },
						},
					};
				}
				if (params.name !== 'cortex_ui') {
					return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: `Unknown tool: ${params.name}` } };
				}
				const a = (params.arguments ?? {}) as {
					view?: View;
					collection?: string;
					slug?: string;
					actions?: Array<{ label: string; prompt: string }>;
				};
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
				} else if (view === 'entity') {
					if (!a.collection || !a.slug) {
						return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'entity view needs {collection, slug}' } };
					}
					// Editable externalUrl page — click a field to edit, saves to the wiki.
					const token = await signUiToken('cortex', 7200, await getEffectiveBearer(env), Date.now());
					uri = 'ui://office-town/entity';
					mimeType = 'text/uri-list';
					let url = `${origin}/app/entity?c=${encodeURIComponent(a.collection)}&s=${encodeURIComponent(a.slug)}&t=${encodeURIComponent(token)}`;
					if (Array.isArray(a.actions) && a.actions.length) {
						url += `&a=${encodeURIComponent(JSON.stringify(a.actions.slice(0, 8)))}`;
					}
					text = url;
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
			// Apps page: Goose lists ui:// resources as launchable apps (mime
			// text/html;profile=mcp-app, window props from _meta.window) and calls
			// resources/read to get the HTML. We build it fresh on read.
			case 'resources/list':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						resources: [
							{ uri: 'ui://office-town/workflows', name: 'Workflows', description: 'Your standing jobs + anything awaiting approval', mimeType: 'text/html;profile=mcp-app', _meta: { window: { width: 480, height: 720, resizable: true } } },
							{ uri: 'ui://office-town/cortex', name: 'Cortex', description: 'Browse everything your cortex knows', mimeType: 'text/html;profile=mcp-app', _meta: { window: { width: 540, height: 820, resizable: true } } },
							{ uri: 'ui://office-town/tasks', name: 'Tasks', description: 'Your task board — drag, add, it saves itself', mimeType: 'text/html;profile=mcp-app', _meta: { window: { width: 1000, height: 700, resizable: true } } },
						],
					},
				};
			case 'resources/read': {
				const uri = ((req.params ?? {}) as { uri?: string }).uri ?? '';
				let html: string;
				if (uri === 'ui://office-town/workflows') {
					const { workflows, pending } = await loadWorkflows(env);
					html = renderWorkflowsApp(workflows, pending);
				} else if (uri === 'ui://office-town/cortex') {
					html = await handleBrowse(env, {});
				} else if (uri === 'ui://office-town/tasks') {
					// Live board needs its own origin + token → thin iframe wrapper.
					const token = await signUiToken('tasks', 7200, await getEffectiveBearer(env), Date.now());
					const src = `${origin}/app/tasks?t=${encodeURIComponent(token)}`;
					html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh;display:block}</style></head><body><iframe src="${src}"></iframe></body></html>`;
				} else {
					return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: `Unknown resource: ${uri}` } };
				}
				return { jsonrpc: '2.0', id: req.id, result: { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: html }] } };
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
