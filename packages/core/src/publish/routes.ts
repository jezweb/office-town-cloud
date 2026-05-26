import { Hono } from 'hono';
import { PublishService, renderMarkdownToHtml } from './service';
import type { AppContext } from '../types';

// MCP-shaped routes (auth-gated) — under /api/publish/
export const publishRoutes = new Hono<AppContext>();

publishRoutes.post('/', async (c) => {
	try {
		const body = await c.req.json<{ slug: string; title?: string; markdown: string; visibility?: 'public' | 'unlisted' }>();
		if (!body.slug || !body.markdown) {
			return c.json({ error: 'slug and markdown required' }, 400);
		}
		const svc = new PublishService(c.env);
		const page = await svc.publish(body);
		return c.json(page, 201);
	} catch (err) {
		return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
	}
});

publishRoutes.get('/list', async (c) => {
	const svc = new PublishService(c.env);
	const pages = await svc.list();
	return c.json({ pages });
});

publishRoutes.delete('/:slug', async (c) => {
	const slug = c.req.param('slug');
	const svc = new PublishService(c.env);
	await svc.unpublish(slug);
	return c.body(null, 204);
});

// Public reader — under /p/<slug>; NOT auth-gated. Registered separately.
export const publicReaderRoutes = new Hono<AppContext>();

publicReaderRoutes.get('/p/:slug', async (c) => {
	const slug = c.req.param('slug');
	const svc = new PublishService(c.env);
	const result = await svc.readPublic(slug);
	if (!result) {
		return c.html('<!DOCTYPE html><html><body><h1>Not found</h1><p>This page is no longer published.</p></body></html>', 404);
	}
	const html = renderMarkdownToHtml(result.markdown, result.meta.title);
	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'public, max-age=300',
		},
	});
});
