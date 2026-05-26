// Office Town Cloud — core Worker.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, requireMcpAuth } from './auth/middleware';
import { cronRoutes } from './cron/routes';
import { dashboardRoutes } from './dashboard/routes';
import { filesRoutes } from './files/routes';
import { handleIndexMessage } from './queue/index-consumer';
import { publicReaderRoutes, publishRoutes } from './publish/routes';
import type { AppContext, Env, IndexMessage } from './types';
import { wikiRoutes } from './wiki/routes';

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
app.use('*', authMiddleware);

app.get('/health', (c) =>
	c.json({
		status: 'ok',
		service: 'office-town-core',
		environment: c.env.ENVIRONMENT,
		timestamp: new Date().toISOString(),
	})
);

// MCP-style API endpoints, gated by bearer token.
app.route('/api/wiki', wikiRoutes);
app.route('/api/files', filesRoutes);
app.route('/api/publish', publishRoutes);
app.route('/api/cron', cronRoutes);

// MCP-prefixed routes (same endpoints, explicit /mcp prefix for clarity)
app.use('/mcp/wiki/*', requireMcpAuth);
app.route('/mcp/wiki', wikiRoutes);
app.use('/mcp/files/*', requireMcpAuth);
app.route('/mcp/files', filesRoutes);
app.use('/mcp/publish/*', requireMcpAuth);
app.route('/mcp/publish', publishRoutes);
app.use('/mcp/cron/*', requireMcpAuth);
app.route('/mcp/cron', cronRoutes);

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
} satisfies ExportedHandler<Env, IndexMessage>;
