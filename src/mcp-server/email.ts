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
// EmailMessage from the cloudflare:email module is the wire shape for the
// send_email binding. Used by sendViaCloudflare below.
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

/**
 * Build a RFC 5322 message string from agent-friendly args. Hand-rolled because
 * we want zero deps and our requirements are simple (one HTML or text body,
 * optional Reply-To, no attachments via this path — use email.draft + share if
 * attachments are needed).
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
		// multipart/alternative
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
			'Cloudflare Email send: no sender. Set DEFAULT_FROM_EMAIL var or pass from_email arg',
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
			results.push({ to: recipient, ok: false, error: err instanceof Error ? err.message : String(err) });
		}
	}
	const failed = results.filter((r) => !r.ok);
	if (failed.length === recipients.length) {
		// every recipient failed — bubble the first error so the caller knows
		throw new Error(
			`Cloudflare Email Routing failed for all recipients. First error: ${failed[0]?.error}. ` +
				`Hint: verify your domain has Email Routing set up and each recipient is registered as a verified destination, ` +
				`or set SMTP2GO_API_KEY secret on this worker to fall back to SMTP2Go.`,
		);
	}
	return { recipients: results };
}

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

async function logSend(
	env: Env,
	args: Record<string, unknown>,
	providerResult: unknown,
	provider: 'cloudflare-email' | 'smtp2go',
): Promise<void> {
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
		provider,
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
			// Prefer the Cloudflare Email Routing binding (no API key, free up
			// to 100/day, sends from a domain you own). Fall back to SMTP2Go
			// if the user has set SMTP2GO_API_KEY. If neither is usable, fail
			// with a clear message naming both options.
			const cfAvailable = env.SEND_EMAIL && typeof env.SEND_EMAIL.send === 'function';
			const smtpAvailable = !!env.SMTP2GO_API_KEY;

			if (!cfAvailable && !smtpAvailable) {
				throw new Error(
					'Email send not configured. Two options:\n' +
						'  (a) Set up Cloudflare Email Routing on your domain + add destination addresses ' +
						'(zero secrets, free up to 100 sends/day).\n' +
						"  (b) Set SMTP2GO_API_KEY secret on this worker (`wrangler secret put SMTP2GO_API_KEY`) " +
						'for unlimited sends via SMTP2Go.',
				);
			}

			let result: unknown;
			let provider: 'cloudflare-email' | 'smtp2go';
			if (cfAvailable) {
				try {
					result = await sendViaCloudflare(env, args);
					provider = 'cloudflare-email';
				} catch (err) {
					if (smtpAvailable) {
						console.warn(
							JSON.stringify({
								event: 'cf_email_failed_falling_back_to_smtp2go',
								error: err instanceof Error ? err.message : String(err),
							}),
						);
						result = await sendViaSmtp2go(env, args);
						provider = 'smtp2go';
					} else {
						throw err;
					}
				}
			} else {
				result = await sendViaSmtp2go(env, args);
				provider = 'smtp2go';
			}
			await logSend(env, args, result, provider);
			return { sent: true, provider, provider_result: result };
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
