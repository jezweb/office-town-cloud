// Auth middleware — supports two auth modes:
//
//   1. better-auth session cookie (for the dashboard + browser flows)
//   2. MCP bearer token (for streamable-HTTP MCP servers calling from agents)

import type { Context, MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { getEffectiveBearer } from './bearer';

const MCP_PATH_PREFIXES = ['/mcp/', '/api/wiki/', '/api/files/', '/api/publish/', '/api/cron/', '/api/sync/'];

function isMcpRequest(c: Context<AppContext>): boolean {
	const path = c.req.path;
	return MCP_PATH_PREFIXES.some((p) => path.startsWith(p));
}

function extractBearer(authHeader: string | null): string | null {
	if (!authHeader) return null;
	const match = /^Bearer\s+(.+)$/i.exec(authHeader);
	return match ? match[1].trim() : null;
}

function constantTimeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

export const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
	const isMcp = isMcpRequest(c);

	if (isMcp) {
		// getEffectiveBearer always returns a token — either the explicit
		// wrangler secret, the D1-cached auto-generated one, or a freshly
		// minted + persisted one. The 503 path is gone — there's no way
		// to be unconfigured on first request anymore.
		const required = await getEffectiveBearer(c.env);
		const provided = extractBearer(c.req.header('authorization') ?? null);
		if (!provided || !constantTimeEquals(provided, required)) {
			return c.json({ error: 'Unauthorised', code: 'unauthorised' }, 401);
		}
		c.set('mcp_authed', true);
		return next();
	}

	// Browser-session path — better-auth verifies the cookie internally on its routes.
	return next();
};

export const requireMcpAuth: MiddlewareHandler<AppContext> = async (c, next) => {
	if (!c.var.mcp_authed) {
		return c.json({ error: 'MCP authentication required', code: 'unauthorised' }, 401);
	}
	return next();
};
