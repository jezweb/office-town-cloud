// Short-lived, scoped tokens for externalUrl UI panels.
//
// An embedded panel (a Goose Desktop MCP-UI iframe) needs to call a worker
// API, but must NOT carry the full cortex bearer. So when the authed MCP tool
// builds the panel URL, it mints a token scoped to one API (e.g. 'tasks') that
// expires in a couple of hours. Stateless: signed with the bearer as the HMAC
// key, so no new secret and no storage — verify recomputes the signature.
//
// Format: `<scope>.<expEpochSec>.<hmacHex>`

async function hmacHex(secret: string, msg: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

export async function signUiToken(scope: string, ttlSeconds: number, secret: string, nowMs: number): Promise<string> {
	const exp = Math.floor(nowMs / 1000) + ttlSeconds;
	const payload = `${scope}.${exp}`;
	return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function verifyUiToken(token: string, scope: string, secret: string, nowMs: number): Promise<boolean> {
	const parts = token.split('.');
	if (parts.length !== 3) return false;
	const [s, expStr, sig] = parts;
	if (s !== scope) return false;
	const exp = Number.parseInt(expStr, 10);
	if (!Number.isFinite(exp) || exp < Math.floor(nowMs / 1000)) return false;
	return constantTimeEquals(sig, await hmacHex(secret, `${s}.${expStr}`));
}
