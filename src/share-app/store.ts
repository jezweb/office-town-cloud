// Shared (customer-facing) apps — agent-built, served behind a public magic
// link, write-only into the owner's cortex. Stored in R2 as
// apps/shared/<shareId>.json. The shareId is the unguessable magic-link secret.

import type { Env } from '../types';

export interface SharedApp {
	shareId: string;
	name: string;
	html: string;
	createdAt: string;
}

export async function createSharedApp(env: Env, input: { name: string; html: string }): Promise<SharedApp> {
	const shareId = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 24);
	const appName = input.name.trim() || 'Form';
	const app: SharedApp = { shareId, name: appName, html: input.html, createdAt: new Date().toISOString() };
	await env.FILES.put(`apps/shared/${shareId}.json`, JSON.stringify(app), { httpMetadata: { contentType: 'application/json' } });
	return app;
}

export async function getSharedApp(env: Env, shareId: string): Promise<SharedApp | null> {
	const f = await env.FILES.get(`apps/shared/${shareId}.json`);
	if (!f) return null;
	try {
		return JSON.parse(await f.text()) as SharedApp;
	} catch {
		return null;
	}
}
