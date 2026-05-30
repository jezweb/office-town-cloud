// /api/apps — the Office Town app catalog + Goose install bundle.
//
// An "app" is a launchable panel for Goose's Apps page. Installing one = writing
// a GooseApp cache JSON to ~/.config/goose/mcp-apps-cache/{cache_key}.json,
// tagged mcpServers:["apps"] (the tag Goose's Apps page filters on). This
// endpoint produces those files ready-to-write, with freshly-minted scoped
// tokens — consumed by connect.sh at setup and (later) by the daemon on sync.
//
//   GET /api/apps/catalog        — the installable apps (metadata only)
//   GET /api/apps/cache-bundle   — [{ filename, content }] ready to drop in the cache dir

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { signUiToken } from '../auth/ui-token';
import { getEffectiveBearer } from '../auth/bearer';

const app = new Hono<AppContext>();

export interface AppDef {
	slug: string;
	name: string;
	description: string;
	scope: string; // UI-token scope the app's page needs
	pagePath: string; // the live externalUrl page to iframe
	width: number;
	height: number;
}

// The catalog. A "good" standalone app saves directly (no agent round-trip) —
// Tasks is the proven one. Grows as we build more direct-manipulation panels.
export const CATALOG: AppDef[] = [
	{
		slug: 'office-town-tasks',
		name: 'Office Town Tasks',
		description: 'Your task board — drag, add, it saves itself',
		scope: 'tasks',
		pagePath: '/app/tasks',
		width: 1000,
		height: 700,
	},
];

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Replicates Goose's McpAppCache::cache_key — apps_<sha256(apps::uri)>.
async function cacheKey(uri: string): Promise<string> {
	return `apps_${await sha256Hex(`apps::${uri}`)}`;
}

// A self-contained GooseApp HTML: an iframe wrapper around the live page with a
// long-lived scoped token (the page does the real fetch/save).
function wrapperHtml(src: string): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh;display:block}</style></head><body><iframe src="${src}" allow="clipboard-write"></iframe></body></html>`;
}

async function liveSrc(env: Env, origin: string, def: AppDef): Promise<string> {
	const token = await signUiToken(def.scope, 60 * 60 * 24 * 365, await getEffectiveBearer(env), Date.now());
	return `${origin}${def.pagePath}?t=${encodeURIComponent(token)}`;
}

// The importable GooseApp HTML (JSON-LD metadata + the live iframe). The user
// picks this file via Goose's "Import App".
export async function buildGooseAppHtml(env: Env, origin: string, def: AppDef): Promise<{ filename: string; html: string }> {
	const src = await liveSrc(env, origin, def);
	const meta = JSON.stringify({
		'@context': 'urn:goose.ai:schema',
		'@type': 'GooseApp',
		name: def.slug,
		description: def.description,
		width: def.width,
		height: def.height,
		resizable: true,
	});
	const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script type="application/ld+json">${meta}</script>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh;display:block}</style>
</head><body><iframe src="${src}" allow="clipboard-write"></iframe></body></html>`;
	return { filename: `${def.slug}.html`, html };
}

async function buildCacheFile(env: Env, origin: string, def: AppDef): Promise<{ filename: string; content: Record<string, unknown> }> {
	const src = await liveSrc(env, origin, def);
	const uri = `ui://apps/${def.slug}`;
	return {
		filename: `${await cacheKey(uri)}.json`,
		content: {
			uri,
			name: def.slug,
			description: def.description,
			mimeType: 'text/html;profile=mcp-app',
			text: wrapperHtml(src),
			mcpServers: ['apps'],
			width: def.width,
			height: def.height,
			resizable: true,
		},
	};
}

app.get('/catalog', (c) =>
	c.json({ apps: CATALOG.map(({ slug, name, description }) => ({ slug, name, description })) }),
);

app.get('/cache-bundle', async (c) => {
	const origin = new URL(c.req.url).origin;
	const files = await Promise.all(CATALOG.map((def) => buildCacheFile(c.env, origin, def)));
	return c.json({ dir: '~/.config/goose/mcp-apps-cache', files });
});

export const appsApiRoutes = app;
