// Office Town Cloud — core Worker.
//
// Hosts the wiki, files, publish, cron, and dashboard endpoints. Each MCP
// adapter (packages/mcp-*) is a thin streamable-HTTP shim over these
// routes, but the routes themselves are the source of truth.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, requireMcpAuth } from './auth/middleware';
import { handleIndexMessage } from './queue/index-consumer';
import type { Env, IndexMessage } from './types';
import type { AppContext } from './types';
import { wikiRoutes } from './wiki/routes';

const app = new Hono<AppContext>();

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

app.route('/api/wiki', wikiRoutes);

app.use('/mcp/wiki/*', requireMcpAuth);
app.route('/mcp/wiki', wikiRoutes); // MCP gets the same shape, just gated on bearer.

app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

app.onError((err, c) => {
	console.error(JSON.stringify({ event: 'worker_unhandled_error', error: String(err), stack: err.stack }));
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
