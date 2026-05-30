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
	{
		slug: 'office-town-capture',
		name: 'Office Town Capture',
		description: 'Jot a note or paste a link — it lands in your cortex inbox and gets filed',
		scope: 'cortex',
		pagePath: '/app/capture',
		width: 480,
		height: 560,
	},
	{
		slug: 'office-town-showcase',
		name: 'Office Town Capabilities',
		description: 'A demo of the ceiling — Tailwind theming, tabs, charts, tables, attachments',
		scope: 'app:office-town-showcase',
		pagePath: '/app/showcase',
		width: 820,
		height: 720,
	},
	{
		slug: 'office-town-quote-to-cash',
		name: 'Quote to Cash',
		description: 'Quote → job → invoice → paid, all in one window. Each deal is a real entry in your jobs collection (visible to the agent + wiki).',
		scope: 'cortex:jobs',
		pagePath: '/app/quote-to-cash',
		width: 920,
		height: 760,
	},
	{
		slug: 'office-town-mini-crm',
		name: 'Mini CRM',
		description: 'Pipeline, contacts, follow-ups and Today — a CRM view over your real contacts collection (agent + wiki see every contact).',
		scope: 'cortex:contacts',
		pagePath: '/app/mini-crm',
		width: 920,
		height: 760,
	},
	{
		slug: 'office-town-run-sheet',
		name: 'Run Sheet (trade)',
		description: "Today's jobs for a tradie — customer, address, tap-to-call, status that cycles To do → On site → Done.",
		scope: 'app:office-town-run-sheet',
		pagePath: '/app/run-sheet',
		width: 560,
		height: 720,
	},
	{
		slug: 'office-town-onsite-quote',
		name: 'On-site Quote (trade)',
		description: 'Build a quote on the van — line items, live GST total, copy as text to SMS, save for later.',
		scope: 'app:office-town-onsite-quote',
		pagePath: '/app/onsite-quote',
		width: 560,
		height: 760,
	},
	{
		slug: 'office-town-compliance',
		name: 'Compliance Deadlines (pro)',
		description: 'BAS, tax, super and ASIC lodgements counted down; each is a real entry in your deadlines collection. Mark lodged → rolls to next period.',
		scope: 'cortex:deadlines',
		pagePath: '/app/compliance',
		width: 620,
		height: 720,
	},
	{
		slug: 'office-town-bookings',
		name: 'Bookings',
		description: 'A month calendar of bookings — click a day to see and add appointments (time, who, what).',
		scope: 'app:office-town-bookings',
		pagePath: '/app/bookings',
		width: 700,
		height: 760,
	},
	{
		slug: 'office-town-deliverables',
		name: 'Deliverables',
		description: 'A table of work products moving Draft → In review → Approved → Delivered, with owner, due date and link.',
		scope: 'app:office-town-deliverables',
		pagePath: '/app/deliverables',
		width: 820,
		height: 700,
	},
	{
		slug: 'office-town-asset-register',
		name: 'Asset Register',
		description: 'Domains, hosting, licences, equipment — renewals counted down with urgency chips, soonest first.',
		scope: 'app:office-town-asset-register',
		pagePath: '/app/asset-register',
		width: 820,
		height: 700,
	},
	{
		slug: 'office-town-support-tickets',
		name: 'Tickets',
		description: 'A request tracker — subject, requester, priority and status; open work sorts to the top.',
		scope: 'app:office-town-support-tickets',
		pagePath: '/app/support-tickets',
		width: 680,
		height: 720,
	},
	{
		slug: 'office-town-decision-log',
		name: 'Decision Log',
		description: 'A timeline of decisions and the reasoning behind them — the lightweight ADR you reach for later.',
		scope: 'app:office-town-decision-log',
		pagePath: '/app/decision-log',
		width: 680,
		height: 740,
	},
];

// Which apps the owner wants installed (worker_config). Default: all catalog.
export async function getInstalledSet(env: Env): Promise<Set<string>> {
	const row = await env.DB.prepare(`SELECT value FROM worker_config WHERE key = 'installed_apps'`).first<{ value: string }>();
	if (!row) return new Set(CATALOG.map((a) => a.slug));
	try {
		return new Set(JSON.parse(row.value) as string[]);
	} catch {
		return new Set(CATALOG.map((a) => a.slug));
	}
}

export async function setInstalledSet(env: Env, slugs: string[]): Promise<void> {
	await env.DB.prepare(`INSERT OR REPLACE INTO worker_config (key, value) VALUES ('installed_apps', ?)`)
		.bind(JSON.stringify([...new Set(slugs)]))
		.run();
}

// --- Agent-built (custom) apps ----------------------------------------------
// Stored in R2 as apps/custom/<appId>.json = {appId, name, description, html,
// width, height}. They flow through the SAME catalogue → bundle → daemon path
// as built-ins, so an agent creating one installs it with no new worker code.

interface CustomApp {
	appId: string;
	name: string;
	description: string;
	html: string;
	width: number;
	height: number;
}

export async function getCustomApps(env: Env): Promise<CustomApp[]> {
	const listing = await env.FILES.list({ prefix: 'apps/custom/', limit: 200 });
	const apps: CustomApp[] = [];
	for (const obj of listing.objects) {
		if (!obj.key.endsWith('.json')) continue;
		const f = await env.FILES.get(obj.key);
		if (!f) continue;
		try {
			apps.push(JSON.parse(await f.text()) as CustomApp);
		} catch {
			/* skip malformed */
		}
	}
	return apps;
}

function customToDef(a: CustomApp): AppDef {
	return {
		slug: a.appId,
		name: a.name,
		description: a.description,
		scope: `app:${a.appId}`, // token can only touch THIS app's data store
		pagePath: `/app/custom/${a.appId}`,
		width: a.width,
		height: a.height,
	};
}

// Built-ins + agent-built, as one list. Everything downstream uses this.
export async function getFullCatalog(env: Env): Promise<AppDef[]> {
	return [...CATALOG, ...(await getCustomApps(env)).map(customToDef)];
}

export async function getCustomAppHtml(env: Env, appId: string): Promise<CustomApp | null> {
	const f = await env.FILES.get(`apps/custom/${appId}.json`);
	if (!f) return null;
	try {
		return JSON.parse(await f.text()) as CustomApp;
	} catch {
		return null;
	}
}

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app';
}

// Create (or replace) an agent-built app + auto-add it to the installed-set.
export async function createCustomApp(
	env: Env,
	input: { name: string; description: string; html: string; width?: number; height?: number },
): Promise<AppDef> {
	const appId = `custom-${slugify(input.name)}-${crypto.randomUUID().slice(0, 4)}`;
	const app: CustomApp = {
		appId,
		name: input.name,
		description: input.description,
		html: input.html,
		width: input.width ?? 720,
		height: input.height ?? 640,
	};
	await env.FILES.put(`apps/custom/${appId}.json`, JSON.stringify(app), { httpMetadata: { contentType: 'application/json' } });
	const set = await getInstalledSet(env);
	set.add(appId);
	await setInstalledSet(env, [...set]);
	return customToDef(app);
}

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
	// 7-day TTL: the daemon re-mints these on every sync (reconcileApps rewrites
	// the cache files), so a week comfortably survives a sync gap without leaving
	// a near-permanent capability token sitting in the app's iframe URL.
	const token = await signUiToken(def.scope, 60 * 60 * 24 * 7, await getEffectiveBearer(env), Date.now());
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

app.get('/catalog', async (c) => {
	const cat = await getFullCatalog(c.env);
	return c.json({ apps: cat.map(({ slug, name, description }) => ({ slug, name, description })) });
});

// Reconcile bundle: what to WRITE (installed apps, fresh tokens) + what to
// REMOVE (catalog apps not installed). The daemon + connect.sh apply both, so
// toggling an app off in the dashboard uninstalls it on the next sync.
app.get('/cache-bundle', async (c) => {
	const origin = new URL(c.req.url).origin;
	const installed = await getInstalledSet(c.env);
	const install: Array<{ filename: string; content: Record<string, unknown> }> = [];
	const remove: string[] = [];
	for (const def of await getFullCatalog(c.env)) {
		const file = await buildCacheFile(c.env, origin, def);
		if (installed.has(def.slug)) install.push(file);
		else remove.push(file.filename);
	}
	return c.json({ dir: '~/.config/goose/mcp-apps-cache', install, remove });
});

export const appsApiRoutes = app;
