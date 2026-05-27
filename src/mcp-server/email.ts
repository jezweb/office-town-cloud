// MCP server — email tools.
//
// Mounted on the office-town worker at /mcp/email. Outbound via Cloudflare
// Email Routing's send_email binding (no API key, free up to 100/day). Logs
// sends to wiki/research/ via in-process WikiService. Drafts saved to FILES
// bucket via in-process FilesService.
//
// Inbound email landing (Cloudflare Email Routing → Worker email handler)
// is wired at the worker level (src/index.ts), not exposed via MCP.
//
// Sending requirements (set up once per domain):
//   1. Enable Email Routing on the user's domain in Cloudflare dashboard.
//   2. Add each recipient address as a verified destination.
// The binding then sends to any verified destination — no per-message API
// key, no external service.

import { Hono } from 'hono';
import { EmailMessage } from 'cloudflare:email';
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
		description:
			'Send an outbound email via Cloudflare Email Routing. Recipients must be verified destinations on your Email Routing setup. Logs the send to wiki/research/ with kind:outbound-email.',
		inputSchema: {
			type: 'object',
			properties: {
				to: { type: 'array', items: { type: 'string' }, description: 'Recipient email(s). Each must be a verified Email Routing destination.' },
				cc: { type: 'array', items: { type: 'string' } },
				bcc: { type: 'array', items: { type: 'string' } },
				subject: { type: 'string' },
				html: { type: 'string', description: 'HTML body (preferred for rich content)' },
				text: { type: 'string', description: 'Plain text body (fallback when no html)' },
				reply_to: { type: 'string', description: 'Reply-To address' },
				from_email: { type: 'string', description: 'Override default sender. Must be on a verified domain.' },
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

/**
 * Build a RFC 5322 message string. Hand-rolled because the send_email binding
 * takes raw MIME and our requirements are simple (one HTML or text body,
 * optional Reply-To, no attachments via this path — use email.draft + share
 * if attachments are needed).
 */
function buildMime(args: Record<string, unknown>, sender: string): string {
	const to = (args.to as string[]).join(', ');
	const subject = args.subject as string;
	const replyTo = args.reply_to as string | undefined;
	const html = args.html as string | undefined;
	const text = args.text as string | undefined;
	const date = new Date().toUTCString();
	const messageId = `<${crypto.randomUUID()}@office-town.local>`;

	const headers: string[] = [
		`From: ${sender}`,
		`To: ${to}`,
		`Subject: ${subject}`,
		`Date: ${date}`,
		`Message-ID: ${messageId}`,
		`MIME-Version: 1.0`,
	];
	if (replyTo) headers.push(`Reply-To: ${replyTo}`);
	if (args.cc) headers.push(`Cc: ${(args.cc as string[]).join(', ')}`);
	// Bcc deliberately omitted from headers — that's how Bcc works

	if (html && text) {
		const boundary = `boundary-${crypto.randomUUID()}`;
		headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
		const body = [
			`--${boundary}`,
			`Content-Type: text/plain; charset="utf-8"`,
			`Content-Transfer-Encoding: 7bit`,
			'',
			text,
			'',
			`--${boundary}`,
			`Content-Type: text/html; charset="utf-8"`,
			`Content-Transfer-Encoding: 7bit`,
			'',
			html,
			'',
			`--${boundary}--`,
		].join('\r\n');
		return `${headers.join('\r\n')}\r\n\r\n${body}`;
	}
	const isHtml = !!html;
	headers.push(`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="utf-8"`);
	headers.push(`Content-Transfer-Encoding: 7bit`);
	return `${headers.join('\r\n')}\r\n\r\n${html ?? text ?? ''}`;
}

async function sendViaCloudflare(env: Env, args: Record<string, unknown>): Promise<unknown> {
	const fromEmail = (args.from_email as string | undefined) ?? env.DEFAULT_FROM_EMAIL;
	const fromName = (args.from_name as string | undefined) ?? env.DEFAULT_FROM_NAME;
	if (!fromEmail) {
		throw new Error(
			'No sender configured. Set DEFAULT_FROM_EMAIL var on this worker (an address on a domain you control with Email Routing enabled), or pass from_email arg.',
		);
	}
	const sender = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
	const mime = buildMime(args, sender);
	const recipients = [
		...((args.to as string[]) ?? []),
		...((args.cc as string[]) ?? []),
		...((args.bcc as string[]) ?? []),
	];
	const results: { to: string; ok: boolean; error?: string }[] = [];
	for (const recipient of recipients) {
		try {
			const message = new EmailMessage(fromEmail, recipient, mime);
			await env.SEND_EMAIL.send(message);
			results.push({ to: recipient, ok: true });
		} catch (err) {
			results.push({
				to: recipient,
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	const failed = results.filter((r) => !r.ok);
	if (failed.length === recipients.length) {
		throw new Error(
			`Cloudflare Email Routing send failed for all recipients. First error: ${failed[0]?.error}. ` +
				`Setup: (1) enable Email Routing on your sender domain in the Cloudflare dashboard, ` +
				`(2) add each recipient address as a verified destination in Email Routing → Destination Addresses.`,
		);
	}
	return { recipients: results };
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
		provider: 'cloudflare-email',
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
			if (!env.SEND_EMAIL || typeof env.SEND_EMAIL.send !== 'function') {
				throw new Error(
					'Email send binding unavailable. The Worker needs the send_email binding (declared in wrangler.jsonc). Setup: enable Email Routing on your sender domain in the Cloudflare dashboard and add destination addresses to verify recipients.',
				);
			}
			const result = await sendViaCloudflare(env, args);
			await logSend(env, args, result);
			return { sent: true, provider: 'cloudflare-email', provider_result: result };
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
