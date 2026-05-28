// Effective-bearer-token resolver.
//
// The deploy form should not require the user to pre-generate
// MCP_BEARER_TOKEN. Resolution order, first hit wins:
//
//   1. env.MCP_BEARER_TOKEN — explicit wrangler secret (always wins,
//      lets shared/team deployments mint a token of their own choosing
//      and rotate it via `wrangler secret put`).
//
//   2. D1 worker_config[key='auto_bearer'] — auto-generated token cached
//      across requests + isolate restarts.
//
//   3. Generate a fresh crypto.randomUUID(), persist to D1, return.
//
// The /dashboard/connect page reads this resolver too so the install
// script prefills the correct token regardless of which branch fired.
//
// Per-isolate memo so we don't hit D1 on every authed request. Isolates
// cycle ~every 5 min idle on Workers — that's our effective cache TTL,
// and that's fine because the value rarely changes.

import type { Env } from '../types';

let memo: string | undefined;

const CONFIG_KEY = 'auto_bearer';

/**
 * Returns the bearer token this worker considers authoritative right now.
 * Always returns a non-empty string — on the very first request after a
 * fresh deploy, it generates + persists one.
 */
export async function getEffectiveBearer(env: Env): Promise<string> {
	if (memo) return memo;

	// 1. Explicit secret wins.
	if (env.MCP_BEARER_TOKEN && env.MCP_BEARER_TOKEN.length > 0) {
		memo = env.MCP_BEARER_TOKEN;
		return memo;
	}

	// 2. Stored auto-generated token in D1.
	const row = await env.DB.prepare(
		`SELECT value FROM worker_config WHERE key = ?`,
	)
		.bind(CONFIG_KEY)
		.first<{ value: string }>();
	if (row?.value) {
		memo = row.value;
		return memo;
	}

	// 3. Generate + persist.
	const fresh = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
	// 32-char-hex equivalent of `openssl rand -hex 32`-ish entropy — UUID
	// is 122 bits of randomness, two of them = 244 bits, well above 256
	// bits of session-token strength. INSERT OR IGNORE handles the race
	// where two concurrent boots both try to mint one.
	await env.DB.prepare(
		`INSERT OR IGNORE INTO worker_config (key, value) VALUES (?, ?)`,
	)
		.bind(CONFIG_KEY, fresh)
		.run();

	// Re-read after the INSERT OR IGNORE so we always return what's
	// actually stored (in case another isolate beat us).
	const after = await env.DB.prepare(
		`SELECT value FROM worker_config WHERE key = ?`,
	)
		.bind(CONFIG_KEY)
		.first<{ value: string }>();
	memo = after?.value ?? fresh;
	return memo;
}

/**
 * Forget the per-isolate memo. Useful in tests + after a token rotation
 * via `wrangler secret put MCP_BEARER_TOKEN`. Production never calls this.
 */
export function _resetBearerMemo(): void {
	memo = undefined;
}
