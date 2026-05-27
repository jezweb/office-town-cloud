// HTTP routes for the wiki module — used by the in-process MCP adapter and
// by the dashboard. All routes require auth via the better-auth session OR
// the MCP bearer token.
//
// Route ordering: static routes MUST come before parameterised routes
// (see ~/.claude/rules/hono-routing.md). Otherwise GET /:collection/:slug
// would steal /collections/business etc.

import { Hono } from 'hono';
import { WikiError } from '../lib/shared';
import type {
	WikiCreateInput,
	WikiSearchInput,
	WikiUpdateInput,
	WikiRegisterCollectionInput,
} from '../lib/shared';
import { searchWiki } from './search';
import { WikiService } from './service';
import type { AppContext } from '../types';

export const wikiRoutes = new Hono<AppContext>();

function editorFromContext(c: { var: AppContext['Variables'] }): string {
	if (c.var.user?.email) return c.var.user.email;
	if (c.var.mcp_authed) return 'mcp-agent';
	return 'unknown';
}

function handleError(err: unknown): {
	status: number;
	body: { error: string; code?: string; details?: unknown };
} {
	if (err instanceof WikiError) {
		const status =
			err.code === 'not_found'
				? 404
				: err.code === 'already_exists'
					? 409
					: err.code === 'unauthorised'
						? 401
						: err.code === 'internal'
							? 500
							: 400;
		return { status, body: { error: err.message, code: err.code, details: err.details } };
	}
	console.error(JSON.stringify({ event: 'wiki_route_error', error: String(err) }));
	return { status: 500, body: { error: 'Internal error', code: 'internal' } };
}

// === Static routes FIRST ===

wikiRoutes.get('/collections', async (c) => {
	const svc = new WikiService(c.env);
	const collections = await svc.listCollections();
	return c.json({ collections });
});

wikiRoutes.post('/collections', async (c) => {
	try {
		const input = await c.req.json<WikiRegisterCollectionInput>();
		const svc = new WikiService(c.env);
		await svc.registerCollection(input);
		return c.body(null, 201);
	} catch (err) {
		const { status, body } = handleError(err);
		return c.json(body, status as 400 | 401 | 404 | 409 | 500);
	}
});

wikiRoutes.post('/search', async (c) => {
	try {
		const input = await c.req.json<WikiSearchInput>();
		if (!input.query || input.query.trim().length === 0) {
			return c.json({ error: 'query is required', code: 'invalid_input' }, 400);
		}
		const hits = await searchWiki(c.env, input);
		if (input.expanded) {
			const svc = new WikiService(c.env);
			const expanded = await Promise.all(
				hits.map(async (h) => {
					const read = await svc.read(h.collection, h.slug).catch(() => null);
					return { ...h, body: read?.body ?? '' };
				})
			);
			return c.json({ hits: expanded });
		}
		return c.json({ hits });
	} catch (err) {
		const { status, body } = handleError(err);
		return c.json(body, status as 400 | 401 | 404 | 409 | 500);
	}
});

// === Parameterised routes AFTER ===

wikiRoutes.post('/:collection', async (c) => {
	try {
		const collection = c.req.param('collection');
		const body = await c.req.json<WikiCreateInput>();
		const svc = new WikiService(c.env);
		const entry = await svc.create({ ...body, collection }, editorFromContext(c));
		return c.json(entry, 201);
	} catch (err) {
		const { status, body } = handleError(err);
		return c.json(body, status as 400 | 401 | 404 | 409 | 500);
	}
});

wikiRoutes.get('/:collection/:slug', async (c) => {
	try {
		const collection = c.req.param('collection');
		const slug = c.req.param('slug');
		const svc = new WikiService(c.env);
		const entry = await svc.read(collection, slug);
		return c.json(entry);
	} catch (err) {
		const { status, body } = handleError(err);
		return c.json(body, status as 400 | 401 | 404 | 409 | 500);
	}
});

wikiRoutes.patch('/:collection/:slug', async (c) => {
	try {
		const collection = c.req.param('collection');
		const slug = c.req.param('slug');
		const body = await c.req.json<Omit<WikiUpdateInput, 'collection' | 'slug'>>();
		const svc = new WikiService(c.env);
		const entry = await svc.update({ ...body, collection, slug }, editorFromContext(c));
		return c.json(entry);
	} catch (err) {
		const { status, body } = handleError(err);
		return c.json(body, status as 400 | 401 | 404 | 409 | 500);
	}
});

wikiRoutes.delete('/:collection/:slug', async (c) => {
	try {
		const collection = c.req.param('collection');
		const slug = c.req.param('slug');
		const svc = new WikiService(c.env);
		await svc.delete(collection, slug);
		return c.body(null, 204);
	} catch (err) {
		const { status, body } = handleError(err);
		return c.json(body, status as 400 | 401 | 404 | 409 | 500);
	}
});
