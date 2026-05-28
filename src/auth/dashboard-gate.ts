// Dashboard gate — keeps the dashboard private by default.
//
// Threat model:
//
//   The worker URL is public. Anyone who learns it (a screenshot,
//   shared link, scan) can hit /dashboard/* and read wiki content
//   unless we gate it. The MCP endpoints are already bearer-protected;
//   this module extends the same gating to the HTML dashboard.
//
// Flow:
//
//   FRESH DEPLOY (no claim yet, no cookie):
//     • / and /dashboard/anything redirect to /dashboard/connect
//     • /dashboard/connect shows the auto-generated bearer in
//       cleartext + a "Claim this install" button. This is the only
//       brief window where the bearer is visible without auth.
//     • Clicking Claim POSTs to /dashboard/claim → server sets
//       worker_config[dashboard_claimed]=true + httpOnly cookie
//       ot_session=<bearer> + redirects to /
//
//   CLAIMED, NO COOKIE (random visitor, or different browser):
//     • /dashboard/connect renders a sign-in form: "paste bearer to
//       continue". Doesn't reveal the stored bearer.
//     • Other /dashboard/* paths redirect to /dashboard/connect.
//
//   CLAIMED, COOKIE PRESENT:
//     • Cookie value compared against effective bearer.
//     • Match → proceed. Mismatch → clear cookie + redirect to
//       /dashboard/connect (treat as not-signed-in).
//
//   ROTATION:
//     • `wrangler secret put MCP_BEARER_TOKEN` sets the explicit
//       secret, which overrides the auto-generated one in
//       getEffectiveBearer. After rotation, existing cookies stop
//       matching and users have to re-sign-in with the new bearer.

import type { Context, MiddlewareHandler } from 'hono';
import type { AppContext, Env } from '../types';
import { getEffectiveBearer } from './bearer';

const COOKIE_NAME = 'ot_session';
const CLAIMED_KEY = 'dashboard_claimed';

const DASHBOARD_PATHS = ['/dashboard/'];
// Home '/' is a special case — also gated, but only when authenticated
// flow is in play. /dashboard/connect is gated by self-handling inside
// the route (not by this middleware) because it adapts its rendering
// to all three states.
const HOME_PATH = '/';
const PUBLIC_EXCEPTIONS = ['/dashboard/connect', '/dashboard/claim', '/dashboard/sign-out'];

function isDashboardPath(path: string): boolean {
	if (path === HOME_PATH) return true;
	if (PUBLIC_EXCEPTIONS.includes(path)) return false;
	return DASHBOARD_PATHS.some((p) => path.startsWith(p));
}

function getCookieValue(c: Context<AppContext>, name: string): string | null {
	const header = c.req.header('cookie');
	if (!header) return null;
	for (const part of header.split(';')) {
		const [k, ...rest] = part.trim().split('=');
		if (k === name) return decodeURIComponent(rest.join('=').trim());
	}
	return null;
}

export async function isClaimed(env: Env): Promise<boolean> {
	const row = await env.DB.prepare(
		`SELECT value FROM worker_config WHERE key = ?`,
	)
		.bind(CLAIMED_KEY)
		.first<{ value: string }>();
	return row?.value === 'true';
}

export async function markClaimed(env: Env): Promise<void> {
	await env.DB.prepare(
		`INSERT OR REPLACE INTO worker_config (key, value) VALUES (?, 'true')`,
	)
		.bind(CLAIMED_KEY)
		.run();
}

export function buildSessionCookie(bearer: string, maxAgeSeconds = 60 * 60 * 24 * 30): string {
	// Path=/ so it applies to all dashboard routes. Secure attribute
	// matters on workers.dev (HTTPS-only). SameSite=Lax allows same-site
	// nav + GETs but blocks cross-site POSTs — CSRF defence.
	return `${COOKIE_NAME}=${encodeURIComponent(bearer)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Hono middleware that protects /dashboard/* (and /) by requiring a
 * valid session cookie. Public exceptions: /dashboard/connect (handles
 * its own state machine), /dashboard/claim (POST handler), /dashboard/sign-out.
 */
export const dashboardGate: MiddlewareHandler<AppContext> = async (c, next) => {
	const path = c.req.path;
	if (!isDashboardPath(path)) {
		return next();
	}

	const cookie = getCookieValue(c, COOKIE_NAME);
	if (!cookie) {
		return c.redirect('/dashboard/connect', 302);
	}

	const effectiveBearer = await getEffectiveBearer(c.env);
	if (cookie !== effectiveBearer) {
		// Stale cookie (e.g. user rotated the bearer via wrangler secret put).
		// Treat as signed-out — clear the cookie + send to sign-in.
		c.header('Set-Cookie', clearSessionCookie());
		return c.redirect('/dashboard/connect', 302);
	}

	return next();
};
