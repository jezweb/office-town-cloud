// /api/packs — vertical pack catalogue + installer.
//   GET  /catalog        — packs + which are installed (apps + collections present)
//   POST /install {slug} — register the pack's collections + add its apps to the
//                          installed-set (daemon reconciles them onto the Apps page)
// Bearer-gated by the global authMiddleware (mounted under MCP_PATH_PREFIXES? no —
// /api/packs self-checks like the other /api/apps routes). Dependency order:
// collections first (an app may rely on the folder), then apps.

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { PACKS, getPack, type PackDef } from './registry';
import { getInstalledSet, setInstalledSet } from '../apps-api/routes';
import { WikiService } from '../wiki/service';
import { WikiError } from '../lib/shared';

const app = new Hono<AppContext>();

export interface PackInstallResult {
	pack: string;
	collectionsRegistered: string[];
	collectionsAlreadyPresent: string[];
	appsAdded: string[];
}

export async function installPack(env: Env, slug: string): Promise<PackInstallResult> {
	const pack = getPack(slug);
	if (!pack) throw new Error(`Unknown pack: ${slug}`);
	const svc = new WikiService(env);

	const registered: string[] = [];
	const present: string[] = [];
	for (const col of pack.collections) {
		try {
			await svc.registerCollection(col);
			registered.push(col.name);
		} catch (err) {
			if (err instanceof WikiError && err.code === 'already_exists') present.push(col.name);
			else throw err;
		}
	}

	const set = await getInstalledSet(env);
	const added: string[] = [];
	for (const appSlug of pack.apps) {
		if (!set.has(appSlug)) {
			set.add(appSlug);
			added.push(appSlug);
		}
	}
	if (added.length) await setInstalledSet(env, [...set]);

	return { pack: slug, collectionsRegistered: registered, collectionsAlreadyPresent: present, appsAdded: added };
}

function packStatus(pack: PackDef, installed: Set<string>, collectionNames: Set<string>) {
	const appsInstalled = pack.apps.filter((a) => installed.has(a)).length;
	const colsPresent = pack.collections.filter((c) => collectionNames.has(c.name)).length;
	const fully = appsInstalled === pack.apps.length && colsPresent === pack.collections.length;
	return {
		slug: pack.slug,
		name: pack.name,
		blurb: pack.blurb,
		apps: pack.apps,
		collections: pack.collections.map((c) => c.name),
		installed: fully,
		partial: !fully && (appsInstalled > 0 || colsPresent > 0),
	};
}

app.get('/catalog', async (c) => {
	const installed = await getInstalledSet(c.env);
	const svc = new WikiService(c.env);
	const cols = new Set((await svc.listCollections()).map((x) => x.name));
	const packs = PACKS.map((p) => packStatus(p, installed, cols));
	return c.json({ packs });
});

app.post('/install', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { slug?: string };
	if (!body.slug) return c.json({ error: 'slug required' }, 400);
	try {
		const result = await installPack(c.env, body.slug);
		return c.json({ ok: true, ...result });
	} catch (err) {
		return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
	}
});

export const packsRoutes = app;
