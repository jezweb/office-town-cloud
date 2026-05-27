// MCP server — email tools.
//
// Mounted on the office-town worker at /mcp/email. Outbound via SMTP2Go
// (recommended; reply-to via custom_headers per the smtp2go rule). Logs sends
// to wiki/research/ via in-process WikiService. Drafts saved to FILES bucket
// via in-process FilesService.
//
// Inbound email landing (Cloudflare Email Routing → Worker email handler) is
// wired at the worker level, not exposed via MCP.

import { Hono } from 'hono';
import type { Env, AppContext } from '../types';
import { WikiService } from '../wiki/service';
import { FilesService } from '../files/service';

const app = new Hono<AppContext>();

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number | string;
	method: string;
	params?: Record<string, unknown>;
}

const TOOLS = {
	'email.send': {
		description: 'Send an outbound email via SMTP2Go. Logs the send to wiki/research/ with kind:outbound-email.',
		inputSchema: {
			type: 'object',
			properties: {
				to: { type: 'array', items: { type: 'string' }, description: 'Recipient email(s)' },
				cc: { type: 'array', items: { type: 'string' } },
				bcc: { type: 'array', items: { type: 'string' } },
				subject: { type: 'string' },
				html: { type: 'string', description: 'HTML body (preferred for rich content)' },
				text: { type: 'string', description: 'Plain text body (fallback when no html)' },
				reply_to: { type: 'string', description: 'Reply-To address (set via custom_headers)' },
				from_email: { type: 'string', description: 'Override default sender' },
				from_name: { type: 'string' },
			},
			required: ['to', 'subject'],
		},
	},
	'email.draft': {
		description: 'Draft an email and save to FILES bucket for review without sending. Returns the draft path.',
		inputSchema: {
			type: 'object',
			properties: {
				to: { type: 'array', items: { type: 'string' } },
				subject: { type: 'string' },
				html: { type: 'string' },
				text: { type: 'string' },
				slug: { type: 'string', description: 'Optional draft slug; auto-derived if absent' },
			},
			required: ['to', 'subject'],
		},
	},
} as const;

async function sendViaSmtp2go(env: Env, args: Record<string, unknown>): Promise<unknown> {
	const customHeaders: { header: string; value: string }[] = [];
	if (args.reply_to) {
		customHeaders.push({ header: 'Reply-To', value: args.reply_to as string });
	}
	const payload: Record<string, unknown> = {
		api_key: env.SMTP2GO_API_KEY,
		sender: args.from_email
			? `${args.from_name ?? env.DEFAULT_FROM_NAME ?? ''} <${args.from_email}>`.trim()
			: `${env.DEFAULT_FROM_NAME ?? ''} <${env.DEFAULT_FROM_EMAIL ?? ''}>`.trim(),
		to: args.to,
		subject: args.subject,
		html_body: args.html,
		text_body: args.text,
	};
	if (args.cc) payload.cc = args.cc;
	if (args.bcc) payload.bcc = args.bcc;
	if (customHeaders.length > 0) payload.custom_headers = customHeaders;

	const resp = await fetch('https://api.smtp2go.com/v3/email/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	const json = (await resp.json()) as { data?: unknown };
	if (resp.status >= 400) {
		throw new Error(`SMTP2Go send failed: ${JSON.stringify(json)}`);
	}
	return json.data;
}

async function logSend(env: Env, args: Record<string, unknown>, providerResult: unknown): Promise<void> {
	const slug = `${new Date().toISOString().slice(0, 10)}-${(args.subject as string)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 60)}`;
	const frontmatter = {
		kind: 'outbound-email',
		subject: args.subject,
		to: args.to,
		from: args.from_email ?? env.DEFAULT_FROM_EMAIL,
		sent_at: new Date().toISOString(),
		provider: 'smtp2go',
	};
	const body = `## Subject\n${args.subject}\n\n## Body\n\n${args.html ?? args.text ?? ''}\n\n## Provider response\n\`\`\`\n${JSON.stringify(providerResult, null, 2)}\n\`\`\``;

	try {
		const svc = new WikiService(env);
		await svc.create({ collection: 'research', slug, frontmatter, body }, 'mcp-email');
	} catch (err) {
		console.error(JSON.stringify({ event: 'log_send_failed', error: String(err) }));
	}
}

async function handleToolCall(env: Env, tool: string, args: Record<string, unknown>): Promise<unknown> {
	switch (tool) {
		case 'email.send': {
			if (!env.SMTP2GO_API_KEY) {
				throw new Error('Email send not configured — set SMTP2GO_API_KEY secret on this worker, then redeploy');
			}
			const result = await sendViaSmtp2go(env, args);
			await logSend(env, args, result);
			return { sent: true, provider: 'smtp2go', provider_result: result };
		}
		case 'email.draft': {
			const slug =
				(args.slug as string) ??
				`${new Date().toISOString().slice(0, 10)}-${(args.subject as string)
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.slice(0, 60)}`;
			const draftBody = `## Subject\n${args.subject}\n\n## To\n${(args.to as string[]).join(', ')}\n\n## Body\n\n${args.html ?? args.text ?? ''}`;
			const filesService = new FilesService(env);
			const meta = await filesService.upload({
				path: `email-drafts/${slug}.md`,
				content_text: draftBody,
				content_type: 'text/markdown',
			});
			return { draft_saved_to: meta.path, file_meta: meta };
		}
		default:
			throw new Error(`Unknown tool: ${tool}`);
	}
}

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

async function handleRpc(env: Env, req: JsonRpcRequest): Promise<unknown> {
	try {
		switch (req.method) {
			case 'initialize':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'office-town-email', version: '1.0.0' } },
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
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/email\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-email-mcp' }));

export const emailMcpRoutes = app;
