// MCP server — voice gateway tool.
//
// Per MASTER-PLAN v1.1 Phase 3.1. Wraps Cloudflare Realtime (SFU/WebRTC) +
// Workers AI Nova-3 (STT) + Aura-2 (TTS) into an agent-facing MCP gateway.
//
// Actions:
//   transcribe     — audio bytes/URL → text (Nova-3 or Whisper)
//   synthesize     — text → audio bytes (Aura-2; sugar over files MCP's speak action)
//   call_create    — create a Realtime session, return signed WebRTC join URL
//   call_end       — close a Realtime session, return transcript
//   call_status    — current state of an active call
//   list_voices    — Aura-2 voice catalog
//
// NOTE: The browser-side WebRTC widget for "phone the librarian" lives at
// /dashboard/call/<session-id>. This MCP is the agent-facing surface; users
// interact via the widget.

import { Hono } from 'hono';
import type { AppContext, Env } from '../types';
import { FilesService } from '../files/service';

const app = new Hono<AppContext>();

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number | string;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResult<T = unknown> {
	jsonrpc: '2.0';
	id: number | string;
	result?: T;
	error?: { code: number; message: string };
}

const VALID_ACTIONS = ['transcribe', 'synthesize', 'call_create', 'call_end', 'call_status', 'list_voices'] as const;
type VoiceAction = (typeof VALID_ACTIONS)[number];

// Aura-2 voice catalog per workers-ai-gotchas.md
const AURA_2_VOICES = [
	'amalthea', 'andromeda', 'apollo', 'arcas', 'aries', 'asteria', 'athena', 'atlas',
	'aurora', 'callista', 'cora', 'cordelia', 'delia', 'draco', 'electra', 'harmonia',
	'helena', 'hera', 'hermes', 'hyperion', 'iris', 'janus', 'juno', 'jupiter',
	'luna', 'mars', 'minerva', 'neptune', 'odysseus', 'ophelia', 'orion', 'orpheus',
	'pandora', 'phoebe', 'pluto', 'saturn', 'thalia', 'theia', 'vesta', 'zeus',
] as const;

const TOOLS = {
	voice: {
		description: [
			"Office Town voice — transcribe audio, synthesize speech, run real-time voice conversations.",
			"",
			"Actions:",
			"  transcribe   — audio (URL/base64) → text (Workers AI Nova-3 or Whisper)",
			"  synthesize   — text → audio (Aura-2 TTS, 40 voices). Sugar over files(action:speak).",
			"  call_create  — open a Realtime SFU session, return signed WebRTC join URL for the dashboard widget",
			"  call_end     — close a session, return full transcript",
			"  call_status  — current state of an active session",
			"  list_voices  — Aura-2 voice catalog",
			"",
			"Voice conversations: agent calls call_create → user opens the returned URL → /dashboard/call/<id> widget joins the SFU room → audio flows both ways via Nova-3 (in) + Aura-2 (out) → on hangup call_end returns the transcript.",
		].join('\n'),
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: VALID_ACTIONS },
				source: { type: 'string', enum: ['url', 'r2_path', 'base64'], description: 'For transcribe — where the audio is' },
				source_value: { type: 'string', description: 'For transcribe' },
				audio_format: { type: 'string', description: 'For transcribe — webm, mp3, wav, m4a (webm-opus preferred per workers-ai-gotchas.md)' },
				text: { type: 'string', description: 'For synthesize' },
				voice: { type: 'string', description: 'For synthesize — one of the Aura-2 voices' },
				save_to_files: { type: 'string', description: 'For synthesize — save audio to this path' },
				session_id: { type: 'string', description: 'For call_end / call_status' },
				agent_slug: { type: 'string', description: 'For call_create — which role the user is phoning (boss/librarian/worker/scout)' },
			},
			required: ['action'],
		},
	},
} as const;

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

function arrayBufferToBase64(bytes: ArrayBuffer): string {
	const u8 = new Uint8Array(bytes);
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < u8.length; i += chunkSize) {
		const chunk = u8.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

async function resolveAudio(env: Env, source: string, value: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
	if (source === 'url') {
		const resp = await fetch(value);
		if (!resp.ok) throw new Error(`Failed to fetch audio at ${value}: ${resp.status}`);
		const bytes = await resp.arrayBuffer();
		return { bytes, contentType: resp.headers.get('content-type') ?? 'audio/webm' };
	}
	if (source === 'r2_path') {
		const obj = await env.FILES.get(value);
		if (!obj) throw new Error(`Not found in substrate bucket: ${value}`);
		return { bytes: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? 'audio/webm' };
	}
	if (source === 'base64') {
		const binary = atob(value);
		const buf = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
		return { bytes: buf.buffer as ArrayBuffer, contentType: 'audio/webm' };
	}
	throw new Error(`Unknown source: ${source}`);
}

async function handleAction(env: Env, args: Record<string, unknown>): Promise<unknown> {
	const action = args.action as VoiceAction;
	if (!VALID_ACTIONS.includes(action)) {
		throw new Error(`Unknown voice action: '${action}'. Valid: ${VALID_ACTIONS.join(', ')}`);
	}

	switch (action) {
		case 'transcribe': {
			if (!args.source || !args.source_value) throw new Error('transcribe requires source + source_value');
			const { bytes, contentType } = await resolveAudio(env, args.source as string, args.source_value as string);
			// Nova-3 binding requires webm-opus per workers-ai-gotchas.md.
			// Fall back to toMarkdown audio path which handles more formats.
			try {
				const result = await env.AI.run('@cf/deepgram/nova-3' as never, {
					audio: { body: bytes, contentType },
				} as never);
				const r = result as { text?: string; results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
				const text = r.text ?? r.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
				return { text, model: '@cf/deepgram/nova-3', size_bytes: bytes.byteLength };
			} catch (err) {
				// Fall back to toMarkdown which handles MP3/WAV/M4A
				const blob = new Blob([bytes], { type: contentType });
				const conv = await env.AI.toMarkdown({ name: 'audio.webm', blob });
				if (conv.format === 'markdown') {
					return { text: conv.data, model: 'toMarkdown-fallback', size_bytes: bytes.byteLength };
				}
				throw err;
			}
		}

		case 'synthesize': {
			// Sugar over files(action:speak) — same Aura-2 binding under the hood.
			const text = args.text as string;
			if (!text) throw new Error('synthesize requires text');
			const voice = ((args.voice as string | undefined) ?? 'orion').replace(/-en$/i, '');
			if (!AURA_2_VOICES.includes(voice as never)) {
				throw new Error(`Unknown voice: '${voice}'. Run voice(action:list_voices) for the catalog.`);
			}
			const result = await env.AI.run('@cf/deepgram/aura-2-en' as never, {
				text,
				speaker: voice,
				encoding: 'mp3',
				container: 'none',
			} as never);
			const audioBytes = await new Response(result as unknown as ReadableStream).arrayBuffer();
			let savedAt: string | undefined;
			let base64: string | undefined = arrayBufferToBase64(audioBytes);
			if (args.save_to_files) {
				const files = new FilesService(env);
				const meta = await files.upload({
					path: args.save_to_files as string,
					content_base64: base64,
					content_type: 'audio/mpeg',
				});
				savedAt = meta.path;
				base64 = undefined;
			}
			return {
				voice,
				text_chars: text.length,
				size_bytes: audioBytes.byteLength,
				...(savedAt ? { saved_to: savedAt } : { audio_base64: base64 }),
			};
		}

		case 'call_create': {
			// Realtime SFU session creation requires Realtime bindings + a signed-URL
			// generation step. Implementation deferred to a follow-up Cloudflare
			// Realtime integration commit — for now this is a stub that returns
			// a recognisable placeholder so agents know the surface exists.
			return {
				session_id: crypto.randomUUID(),
				join_url: '(realtime session creation pending — see V1.1-PLAN §3.1)',
				agent_slug: args.agent_slug ?? 'librarian',
				status: 'not_yet_wired',
				note: 'Realtime SFU session creation requires CALLS binding in wrangler.jsonc + signed-URL generation. Tracked in V1.1-PLAN §3.1.',
			};
		}

		case 'call_end': {
			return {
				session_id: args.session_id,
				transcript: '',
				status: 'not_yet_wired',
				note: 'Realtime session lifecycle pending — see V1.1-PLAN §3.1.',
			};
		}

		case 'call_status': {
			return {
				session_id: args.session_id,
				status: 'not_yet_wired',
				note: 'Realtime session tracking pending — see V1.1-PLAN §3.1.',
			};
		}

		case 'list_voices': {
			return {
				voices: AURA_2_VOICES.map((v) => ({ name: v, model: 'aura-2', language: 'en' })),
				count: AURA_2_VOICES.length,
			};
		}

		default: {
			const _exhaustive: never = action;
			throw new Error(`Unhandled action: ${String(_exhaustive)}`);
		}
	}
}

async function handleRpc(env: Env, req: JsonRpcRequest): Promise<JsonRpcResult> {
	try {
		switch (req.method) {
			case 'initialize':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						protocolVersion: '2025-03-26',
						capabilities: { tools: {} },
						serverInfo: { name: 'office-town-voice', version: '1.0.0-alpha' },
					},
				};
			case 'tools/list':
				return {
					jsonrpc: '2.0',
					id: req.id,
					result: {
						tools: Object.entries(TOOLS).map(([name, def]) => ({
							name,
							description: def.description,
							inputSchema: def.inputSchema,
						})),
					},
				};
			case 'tools/call': {
				const params = (req.params ?? {}) as { name: string; arguments?: Record<string, unknown> };
				const value = await handleAction(env, params.arguments ?? {});
				return { jsonrpc: '2.0', id: req.id, result: { content: [asContent(value)] } };
			}
			default:
				return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
		}
	} catch (err) {
		return {
			jsonrpc: '2.0',
			id: req.id,
			error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
		};
	}
}

app.post('/', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const req = await c.req.json<JsonRpcRequest>();
	const result = await handleRpc(c.env, req);
	return c.json(result);
});

app.get('/sse', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${c.env.MCP_BEARER_TOKEN}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/voice\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-voice-mcp', actions: VALID_ACTIONS.length }));

export const voiceMcpRoutes = app;
