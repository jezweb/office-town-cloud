// Office Town — single Worker hosting:
//   • HTTP API   at /api/{wiki,files,publish,cron}
//   • Dashboard  at /, /dashboard/*
//   • Publish    at /p/<slug>, /s/<token>
//   • 6 MCP servers at /mcp/{wiki,files,email,cron,voice,sandbox}
// All capabilities share one binding surface (see wrangler.jsonc + types.ts).

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './auth/middleware';
import { dashboardGate } from './auth/dashboard-gate';
import { ensureSchema } from './bootstrap';
import { cronRoutes } from './cron/routes';
import { dashboardRoutes } from './dashboard/routes';
import { filesRoutes } from './files/routes';
import { handleIndexMessage } from './queue/index-consumer';
import { publicReaderRoutes, publishRoutes } from './publish/routes';
import type { AppContext, Env, IndexMessage } from './types';
import { wikiRoutes } from './wiki/routes';
import { wikiMcpRoutes } from './mcp-server/wiki';
import { filesMcpRoutes } from './mcp-server/files';
import { emailMcpRoutes } from './mcp-server/email';
import { cronMcpRoutes } from './mcp-server/cron';
import { voiceMcpRoutes } from './mcp-server/voice';
import { sandboxMcpRoutes } from './mcp-server/sandbox';
import { handleInboundEmail } from './email/inbound';
import type { ForwardableEmailMessage } from '@cloudflare/workers-types';

// Required export for the Cloudflare Containers binding declared in
// wrangler.jsonc. @cloudflare/sandbox extends @cloudflare/containers'
// Container class — it provides exec/runCode/createCodeContext/etc over
// the HTTP runner inside the docker.io/cloudflare/sandbox image.
export { Sandbox } from '@cloudflare/sandbox';

const app = new Hono<AppContext>();

// Normalise trailing slashes — Hono's mounted sub-apps are picky about
// /api/publish vs /api/publish/. Rewrite the URL before routing so the
// no-slash form always wins (except for /).
app.use(async (c, next) => {
	const url = new URL(c.req.url);
	if (url.pathname !== '/' && url.pathname.endsWith('/')) {
		url.pathname = url.pathname.replace(/\/+$/, '');
		const newRequest = new Request(url.toString(), c.req.raw);
		return app.fetch(newRequest, c.env, c.executionCtx);
	}
	return next();
});

app.use(
	'*',
	cors({
		origin: (origin) => origin,
		credentials: true,
		allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization', 'X-Office-Town-Editor'],
		maxAge: 86400,
	})
);
// First-request schema bootstrap. The "Deploy to Cloudflare" button
// doesn't run wrangler d1 migrations apply, so fresh deploys have an
// empty database. ensureSchema is memoised per isolate — only the very
// first request after a cold start does any real work; everything else
// is a no-op early return.
app.use('*', async (c, next) => {
	await ensureSchema(c.env);
	return next();
});

app.use('*', authMiddleware);
// Gate dashboard + home behind first-visitor-claim flow. MCP + API routes
// are bearer-protected by authMiddleware above and remain accessible.
app.use('*', dashboardGate);

app.get('/health', (c) =>
	c.json({
		status: 'ok',
		service: 'office-town',
		environment: c.env.ENVIRONMENT,
		timestamp: new Date().toISOString(),
	})
);

// HTTP API — bearer-gated by the worker-level authMiddleware
app.route('/api/wiki', wikiRoutes);
app.route('/api/files', filesRoutes);
app.route('/api/publish', publishRoutes);
app.route('/api/cron', cronRoutes);

// MCP servers (JSON-RPC over streamable-HTTP). Each enforces its own bearer
// auth internally; mounted at /mcp/{name}. Goose connects to each path as a
// separate MCP server.
app.route('/mcp/wiki', wikiMcpRoutes);
app.route('/mcp/files', filesMcpRoutes);
app.route('/mcp/email', emailMcpRoutes);
app.route('/mcp/cron', cronMcpRoutes);
app.route('/mcp/voice', voiceMcpRoutes);
app.route('/mcp/sandbox', sandboxMcpRoutes);

// Public reader for /p/<slug> — must come BEFORE dashboard's '/' route since
// Hono picks the first matching route.
app.route('/', publicReaderRoutes);
// Dashboard at /, /dashboard/* — server-rendered, currently unauthenticated.
app.route('/', dashboardRoutes);

app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

app.onError((err, c) => {
	console.error(
		JSON.stringify({
			event: 'worker_unhandled_error',
			error: String(err),
			stack: err.stack,
		})
	);
	return c.json({ error: 'Internal server error' }, 500);
});

export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<IndexMessage>, env: Env): Promise<void> {
		for (const msg of batch.messages) {
			try {
				await handleIndexMessage(env, msg.body);
				msg.ack();
			} catch (err) {
				console.error(
					JSON.stringify({
						event: 'queue_processing_error',
						message_id: msg.id,
						body: msg.body,
						error: String(err),
					})
				);
				msg.retry({ delaySeconds: Math.min(60, (msg.attempts ?? 1) * 10) });
			}
		}
	},
	// Inbound email — wired by Cloudflare Email Routing when the user adds a
	// catch-all or per-address rule pointing at this worker. Writes the
	// message to wiki/research/ with kind:inbound-email. No API token needed
	// — the email() handler is a binding-based entry point.
	async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
		try {
			await handleInboundEmail(message, env);
		} catch (err) {
			console.error(
				JSON.stringify({
					event: 'inbound_email_error',
					from: message.from,
					to: message.to,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
			// Don't reject — surface the error in logs so the user can find it,
			// but accept the message so we don't bounce mail back to the sender.
		}
	},
} satisfies ExportedHandler<Env, IndexMessage>;
