// /api/media — shared owner capabilities for apps: upload, speak-to-dictate
// (Whisper), and generate-an-image (FLUX). Self-authed: bearer OR any validly-
// signed UI token (these are owner capabilities any of their apps may use).
// Mounted at /api/media (not in MCP_PATH_PREFIXES).

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { getEffectiveBearer } from '../auth/bearer';
import { verifyAnyUiToken } from '../auth/ui-token';

const app = new Hono<AppContext>();

async function authed(env: Env, authHeader: string | undefined): Promise<boolean> {
	const token = /^Bearer\s+(.+)$/i.exec(authHeader ?? '')?.[1]?.trim() ?? '';
	if (!token) return false;
	const bearer = await getEffectiveBearer(env);
	return token === bearer || (await verifyAnyUiToken(token, bearer, Date.now()));
}

function b64ToBytes(b64: string): Uint8Array {
	return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

// Upload a file (base64) → R2 uploads/.
app.post('/upload', async (c) => {
	if (!(await authed(c.env, c.req.header('authorization')))) return c.json({ error: 'Unauthorised' }, 401);
	const b = (await c.req.json().catch(() => ({}))) as { filename?: string; content_base64?: string; content_type?: string };
	if (!b.content_base64) return c.json({ error: 'content_base64 required' }, 400);
	const bytes = b64ToBytes(b.content_base64);
	if (bytes.length > 8 * 1024 * 1024) return c.json({ error: 'too large (8MB max)' }, 413);
	const safe = (b.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
	const key = `uploads/${new Date().toISOString().replace(/[:.]/g, '-')}-${safe}`;
	await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: b.content_type || 'application/octet-stream' } });
	return c.json({ ok: true, key });
});

// Read an uploaded file. Token in query (?t=) so <img src> works.
app.get('/file', async (c) => {
	const key = c.req.query('key') ?? '';
	const t = c.req.query('t') ?? '';
	const bearer = await getEffectiveBearer(c.env);
	if (!(t === bearer || (await verifyAnyUiToken(t, bearer, Date.now())))) return c.text('Unauthorised', 401);
	if (!key.startsWith('uploads/')) return c.text('bad key', 400);
	const obj = await c.env.FILES.get(key);
	if (!obj) return c.text('not found', 404);
	return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
});

// Speak-to-dictate: audio (base64) → Whisper transcript.
app.post('/transcribe', async (c) => {
	if (!(await authed(c.env, c.req.header('authorization')))) return c.json({ error: 'Unauthorised' }, 401);
	const b = (await c.req.json().catch(() => ({}))) as { audio_base64?: string };
	if (!b.audio_base64) return c.json({ error: 'audio_base64 required' }, 400);
	const bytes = b64ToBytes(b.audio_base64);
	const res = (await c.env.AI.run('@cf/openai/whisper', { audio: [...bytes] })) as { text?: string };
	return c.json({ text: res.text ?? '' });
});

// Generate an image via FLUX (returns base64 PNG).
app.post('/generate', async (c) => {
	if (!(await authed(c.env, c.req.header('authorization')))) return c.json({ error: 'Unauthorised' }, 401);
	const b = (await c.req.json().catch(() => ({}))) as { prompt?: string };
	if (!b.prompt || !b.prompt.trim()) return c.json({ error: 'prompt required' }, 400);
	const res = (await c.env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt: b.prompt.slice(0, 1500) })) as { image?: string };
	return c.json({ image_base64: res.image ?? '' });
});

export const mediaRoutes = app;
