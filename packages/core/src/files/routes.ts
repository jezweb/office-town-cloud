import { Hono } from 'hono';
import { FilesService } from './service';
import type { AppContext } from '../types';

export const filesRoutes = new Hono<AppContext>();

filesRoutes.post('/upload', async (c) => {
	try {
		const body = await c.req.json<{
			path: string;
			content_text?: string;
			content_base64?: string;
			content_type?: string;
		}>();
		if (!body.path || (!body.content_text && !body.content_base64)) {
			return c.json({ error: 'path and one of content_text/content_base64 required' }, 400);
		}
		const svc = new FilesService(c.env);
		const result = await svc.upload(body);
		return c.json(result, 201);
	} catch (err) {
		return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
	}
});

filesRoutes.get('/list', async (c) => {
	const prefix = c.req.query('prefix') ?? '';
	const svc = new FilesService(c.env);
	const files = await svc.list(prefix);
	return c.json({ files });
});

filesRoutes.post('/share', async (c) => {
	try {
		const body = await c.req.json<{ path: string; expires_in_hours?: number }>();
		const svc = new FilesService(c.env);
		const link = await svc.createShare(body.path, body.expires_in_hours);
		return c.json(link, 201);
	} catch (err) {
		return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
	}
});

filesRoutes.get('/download/*', async (c) => {
	const url = new URL(c.req.url);
	const path = url.pathname.replace(/^\/api\/files\/download\//, '').replace(/^\/mcp\/files\/download\//, '');
	const svc = new FilesService(c.env);
	const file = await svc.download(path);
	if (!file) return c.json({ error: 'File not found' }, 404);
	return new Response(file.body, {
		headers: {
			'Content-Type': file.meta.content_type,
			'Content-Length': String(file.meta.size),
			ETag: file.meta.etag,
		},
	});
});

filesRoutes.delete('/file/*', async (c) => {
	const url = new URL(c.req.url);
	const path = url.pathname.replace(/^\/api\/files\/file\//, '').replace(/^\/mcp\/files\/file\//, '');
	const svc = new FilesService(c.env);
	await svc.delete(path);
	return c.body(null, 204);
});
