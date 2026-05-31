// Shared self-authentication for routes that aren't behind the global MCP
// bearer gate (they accept a scoped UI token OR the full bearer in the request).
// One place so the bearer comparison is always constant-time and the policy
// (which scopes are accepted) is consistent. Used by /api/{collection,media,
// appdata,cortex,tasks} and the /app/* + /c/* page handlers.

import type { Env } from '../types';
import { getEffectiveBearer } from './bearer';
import { verifyUiToken, verifyAnyUiToken, constantTimeEquals, scopeOf } from './ui-token';

export function bearerFromHeader(authHeader: string | undefined): string {
	return /^Bearer\s+(.+)$/i.exec(authHeader ?? '')?.[1]?.trim() ?? '';
}

// True if the raw token is the bearer (constant-time) or a valid token for `scope`.
export async function tokenAllows(env: Env, token: string, scope: string): Promise<boolean> {
	if (!token) return false;
	const bearer = await getEffectiveBearer(env);
	return constantTimeEquals(token, bearer) || (await verifyUiToken(token, scope, bearer, Date.now()));
}

// True if the raw token is the bearer or a valid token of ANY scope, except any
// scope whose prefix is in `denyScopePrefixes` (e.g. block write-only `submit:`
// tokens from reaching shared media endpoints).
export async function tokenAllowsAny(env: Env, token: string, denyScopePrefixes: string[] = []): Promise<boolean> {
	if (!token) return false;
	const bearer = await getEffectiveBearer(env);
	if (constantTimeEquals(token, bearer)) return true;
	if (denyScopePrefixes.some((p) => scopeOf(token).startsWith(p))) return false;
	return verifyAnyUiToken(token, bearer, Date.now());
}

// Header-based convenience wrappers.
export function selfAuth(env: Env, authHeader: string | undefined, scope: string): Promise<boolean> {
	return tokenAllows(env, bearerFromHeader(authHeader), scope);
}
export function selfAuthAny(env: Env, authHeader: string | undefined, denyScopePrefixes: string[] = []): Promise<boolean> {
	return tokenAllowsAny(env, bearerFromHeader(authHeader), denyScopePrefixes);
}
