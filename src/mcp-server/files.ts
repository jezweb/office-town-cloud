// MCP server — files gateway tool.
//
// Per MASTER-PLAN-2026-05-28.md §4.2 and Jezweb mcp-gateway-pattern rule:
// ONE gateway tool `files` with 10 actions covering the unified
// files+publish+share+convert+transform surface.
//
// Actions:
//   upload          — Put a file into the substrate bucket
//   download        — Get bytes (or a signed URL) from the bucket
//   list            — List files in a path prefix
//   delete          — Remove a file
//   share           — Create signed URL (mode: temp = 7d signed | public = permanent at /p/<slug>)
//   revoke          — Invalidate a share / unpublish a public page
//   convert         — File → markdown, routed by type:
//                       images → multimodal description (Gemma 4 / Kimi)
//                       video  → frame sequence + audio transcript
//                       audio  → Whisper transcript
//                       PPTX   → slide-text extraction (fflate unzip + XML)
//                       PDF / DOCX / XLSX / HTML → env.AI.toMarkdown
//   transform_image — Resize/crop/format-convert via Cloudflare Images binding
//   publish         — Render markdown to HTML, expose at /p/<slug> (sugar over share mode=public)
//   unpublish       — Remove a public page (sugar over revoke)

import { Hono } from 'hono';
import { unzipSync, strFromU8 } from 'fflate';
import puppeteer from '@cloudflare/puppeteer';
import type { AppContext, Env } from '../types';
import { FilesService } from '../files/service';
import { PublishService } from '../publish/service';
import { getEffectiveBearer } from '../auth/bearer';

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

const VALID_ACTIONS = [
	'upload', 'download', 'list', 'delete', 'share', 'revoke',
	'convert', 'transform_image', 'generate_image', 'speak',
	'fetch_with_js', 'screenshot',
	'publish', 'unpublish',
] as const;
type FilesAction = (typeof VALID_ACTIONS)[number];

const TOOLS = {
	files: {
		description: [
			"Office Town files — everything-non-markdown for the agent: uploads, downloads, conversions, image transforms, shares, public publishing.",
			"",
			"Single gateway tool. Always pass {action: '...', ...args}.",
			"",
			"Read actions: download, list",
			"Write actions: upload, delete, share, revoke, convert, transform_image, publish, unpublish",
			"",
			"To READ/understand a file's contents (PDF, image, audio, video, PPTX, etc.), use convert — it returns readable text/description. download returns raw bytes (base64) you usually can't read; use it only when you need the bytes themselves.",
			"",
			"Substrate bucket holds wiki entries (markdown) AND files (binaries) AND shares AND published pages.",
			"For binaries that belong to a specific wiki entity, use wiki(action:attach) instead — that puts them in the entity's folder.",
		].join('\n'),
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: VALID_ACTIONS },
				// upload
				path: { type: 'string', description: 'File path in the bucket (upload/download/delete)' },
				content_base64: { type: 'string', description: 'Base64 content (upload, transform_image, convert)' },
				content_text: { type: 'string', description: 'Text content (upload — markdown, html, plain)' },
				content_type: { type: 'string', description: 'MIME type' },
				// list
				prefix: { type: 'string', description: 'Path prefix filter (list — default lists files/ root)' },
				// share
				mode: { type: 'string', enum: ['temp', 'public'], description: 'temp = 7-day signed URL; public = permanent /p/<slug>' },
				ttl_hours: { type: 'number', description: 'TTL for temp shares (default 168 = 7 days)' },
				// publish
				slug: { type: 'string', description: 'Public page slug (publish)' },
				title: { type: 'string', description: 'Public page title (publish)' },
				body: { type: 'string', description: 'Markdown body to publish' },
				share_id: { type: 'string', description: 'Share ID to revoke' },
				// convert — images get a multimodal description (reads text + describes);
				// PDF/Office/HTML/audio get text extraction. Converted markdown is saved
				// as a sidecar next to the original by default (for r2_path sources).
				source: { type: 'string', enum: ['url', 'r2_path', 'base64'], description: 'Where the source file lives. Prefer r2_path — inbox/ and cortex files sync to R2 automatically (~10s); convert by key, e.g. inbox/quote.pdf' },
				source_value: { type: 'string', description: 'R2 key (e.g. inbox/quote.pdf), URL, or base64 bytes' },
				filename: { type: 'string', description: 'Original filename incl. extension. Optional for r2_path/url (derived from the key/URL); required only for base64.' },
				mime_type: { type: 'string', description: 'Optional MIME hint' },
				hint: { type: 'string', description: 'Optional steer for image description, e.g. "focus on invoice numbers and totals"' },
				model: { type: 'string', enum: ['gemma4', 'kimi'], description: 'Image model: gemma4 (fast, default) or kimi (slower, better for dense/complex docs)' },
				save_to_files: { type: 'string', description: 'Explicit path to save the converted markdown (overrides the default sidecar)' },
				save_sidecar: { type: 'boolean', description: 'Default true for r2_path: saves converted markdown as <original>.md beside it. Set false to skip.' },
				// transform_image
				width: { type: 'number' },
				height: { type: 'number' },
				fit: { type: 'string', enum: ['scale-down', 'contain', 'pad', 'cover', 'crop'] },
				format: { type: 'string', enum: ['avif', 'webp', 'jpeg', 'png', 'json'] },
				quality: { type: 'number' },
			},
			required: ['action'],
		},
	},
} as const;

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

function tooBigError(sizeBytes: number, maxBytes: number): Error {
	return new Error(
		`File is ${(sizeBytes / 1048576).toFixed(1)}MB — too large to convert in the cloud (max ${Math.round(maxBytes / 1048576)}MB). The Worker holds the whole file in memory; for very large media, split it or convert locally.`,
	);
}

// maxBytes caps the input to keep the 128MB Worker isolate alive. We check the
// size BEFORE materialising the body where the source lets us (R2 object .size,
// HTTP Content-Length), so an oversized file is rejected without first
// allocating it.
async function resolveBytes(
	env: Env,
	source: string,
	value: string,
	mimeHint?: string,
	maxBytes?: number,
): Promise<{ bytes: ArrayBuffer; contentType: string; stream: ReadableStream<Uint8Array> }> {
	if (source === 'url') {
		const resp = await fetch(value);
		if (!resp.ok) throw new Error(`Failed to fetch ${value}: ${resp.status}`);
		const declared = Number(resp.headers.get('content-length') ?? 0);
		if (maxBytes && declared > maxBytes) throw tooBigError(declared, maxBytes);
		const bytes = await resp.arrayBuffer();
		if (maxBytes && bytes.byteLength > maxBytes) throw tooBigError(bytes.byteLength, maxBytes);
		return { bytes, contentType: mimeHint ?? resp.headers.get('content-type') ?? 'application/octet-stream', stream: new Response(bytes).body! };
	}
	if (source === 'r2_path') {
		const obj = await bucketForKey(env, value).get(value);
		if (!obj) throw new Error(`Not found in substrate bucket: ${value}`);
		if (maxBytes && obj.size > maxBytes) throw tooBigError(obj.size, maxBytes);
		const bytes = await obj.arrayBuffer();
		return { bytes, contentType: mimeHint ?? obj.httpMetadata?.contentType ?? 'application/octet-stream', stream: new Response(bytes).body! };
	}
	if (source === 'base64') {
		// base64 decodes to ~3/4 its string length.
		if (maxBytes && value.length * 0.75 > maxBytes) throw tooBigError(value.length * 0.75, maxBytes);
		const binary = atob(value);
		const buf = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
		return { bytes: buf.buffer as ArrayBuffer, contentType: mimeHint ?? 'application/octet-stream', stream: new Response(buf.buffer as ArrayBuffer).body! };
	}
	throw new Error(`Unknown source: ${source}`);
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

// Multimodal models for image understanding. NOT the dedicated vision models
// (llama-3.2-vision, LLaVA) — those are weak. General multimodal LLMs read
// visible text AND describe the image in one call. Mirrors Goanna's split.
const IMAGE_MODELS: Record<string, string> = {
	gemma4: '@cf/google/gemma-4-26b-a4b-it', // fast default, good for most images
	kimi: '@cf/moonshotai/kimi-k2.6', // slower, better for complex / dense documents
};

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mpe?g|3gp)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|oga|opus|flac|aiff?|wma)$/i;

function isImageInput(filename: string, contentType: string): boolean {
	return contentType.startsWith('image/') || IMAGE_EXT.test(filename);
}

function isVideoInput(filename: string, contentType: string): boolean {
	return contentType.startsWith('video/') || VIDEO_EXT.test(filename);
}

function isAudioInput(filename: string, contentType: string): boolean {
	return contentType.startsWith('audio/') || AUDIO_EXT.test(filename);
}

const IMAGE_SYSTEM_PROMPT = `You describe images so they become searchable, useful context in a knowledge base. Look at the image and write concise markdown covering, only where applicable:

- **What it is** — a photo, a scanned document, a brochure, a screenshot, a diagram, a product shot, a logo?
- **Visible text** — transcribe any text you can read (signs, labels, headings, body, handwriting, numbers, prices, dates, contact details). This matters most for documents.
- **Subject & key details** — what's shown: people (described, never identified by name unless the text states it), places, objects, products, layout, colours, condition, anything distinctive.
- **Why it might matter** — one line on what this document or image is for, if it's clear.

Write only the description — no preamble like "This image shows". If the image is unreadable or empty, say so plainly.`;

function coerceModelText(result: unknown): string {
	if (typeof result === 'string') return result;
	if (result == null) return '';
	if (typeof result !== 'object') return String(result);
	const r = result as Record<string, unknown>;
	if (typeof r.response === 'string') return r.response;
	const choices = r.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const msg = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
		if (msg) {
			if (typeof msg.content === 'string') return msg.content;
			if (Array.isArray(msg.content)) {
				return (msg.content as Array<Record<string, unknown>>)
					.map((p) => (typeof p.text === 'string' ? p.text : ''))
					.filter(Boolean)
					.join('\n');
			}
			if (typeof msg.reasoning_content === 'string') return msg.reasoning_content;
		}
	}
	return '';
}

// Core multimodal call. Takes one or more image data URLs (a single still, or
// an ordered sequence of video frames — Gemma 4 processes video as interleaved
// frames) and returns the model's description. Images go BEFORE the text, per
// Gemma's guidance for multimodal prompts.
async function runVision(
	env: Env,
	modelKey: string,
	imageDataUrls: string[],
	userText: string,
	systemPrompt: string,
	maxTokens = 1024,
): Promise<string> {
	const modelId = IMAGE_MODELS[modelKey] ?? IMAGE_MODELS.gemma4;
	const content = [
		...imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
		{ type: 'text', text: userText },
	];
	const result = await env.AI.run(modelId as never, {
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content },
		],
		max_tokens: maxTokens,
	} as never);
	const text = coerceModelText(result).trim();
	if (!text) throw new Error(`Model ${modelId} returned no description`);
	return text;
}

// Formats a multimodal LLM can decode directly. HEIC/HEIF/TIFF/BMP are not in
// this set — they must be transcoded first or the model returns "unreadable".
const VISION_SAFE_MIME = /^image\/(jpeg|png|webp|gif)$/i;

function visionSafeContentType(filename: string, contentType: string): string | null {
	if (VISION_SAFE_MIME.test(contentType)) return contentType.toLowerCase();
	const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
	if (ext === 'png') return 'image/png';
	if (ext === 'webp') return 'image/webp';
	if (ext === 'gif') return 'image/gif';
	return null; // needs normalising (HEIC from iPhones, TIFF, BMP, ...)
}

// Transcode non-vision-safe image bytes to JPEG via Cloudflare Images so the
// model can decode them. iPhone photos are HEIC; CF Images decodes SOME HEIC
// but not all ("features which are not supported"), and can't ingest TIFF/BMP.
// When a format the model can't read also fails to transcode, throw a clear,
// actionable error rather than passing undecodable bytes to the model (which
// returns a cryptic "cannot identify image file").
async function normaliseImageForVision(
	env: Env,
	bytes: ArrayBuffer,
	contentType: string,
	filename: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
	const safe = visionSafeContentType(filename, contentType);
	if (safe) return { bytes, contentType: safe };
	// Format the model can't read directly — must transcode.
	try {
		const result = await env.IMAGES.input(new Response(bytes).body!).output({ format: 'image/jpeg' } as never);
		const out = await new Response(result.image()).arrayBuffer();
		if (out.byteLength > 0) return { bytes: out, contentType: 'image/jpeg' };
		throw new Error('transcode produced empty output');
	} catch (err) {
		console.error(JSON.stringify({ event: 'vision_normalise_error', filename, error: String(err) }));
		throw new Error(
			`Couldn't decode ${filename} for description. HEIC/HEIF and some exotic image formats aren't reliably decodable in the cloud. On a Mac, re-save it as JPEG or PNG (Preview → File → Export) and convert that instead.`,
		);
	}
}

// Transcribe audio bytes with Whisper. Returns the raw transcript text, or ''
// if there's no speech. Used for standalone audio files AND the audio track of
// a video. toMarkdown does NOT transcribe audio (it rejects mp3/wav/m4a as
// "Unsupported file type"), so audio must route here.
async function whisperText(env: Env, bytes: ArrayBuffer): Promise<string> {
	const tr = (await env.AI.run('@cf/openai/whisper' as never, {
		audio: [...new Uint8Array(bytes)],
	} as never)) as { text?: string };
	return tr?.text?.trim() || '';
}

async function transcribeAudio(env: Env, bytes: ArrayBuffer): Promise<string> {
	const text = await whisperText(env, bytes);
	if (!text) return '_(no speech detected in this audio)_';
	return `## Transcript\n\n${text}`;
}

function decodeXmlEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// PowerPoint → markdown. toMarkdown rejects PPTX, so we extract the slide TEXT
// ourselves: a .pptx is a zip of XML; ppt/slides/slideN.xml holds the text runs
// (<a:t>) grouped into paragraphs (<a:p>). We don't need slide images/layout for
// the cortex — the words (names, numbers, content) are what the agent learns
// from. Pure-JS (fflate), no native deps, runs in the Worker.
function pptxToMarkdown(bytes: ArrayBuffer): string {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(new Uint8Array(bytes));
	} catch {
		throw new Error("Couldn't read this PowerPoint file (not a valid .pptx zip).");
	}
	const slideNames = Object.keys(files)
		.filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
		.sort((a, b) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]));
	if (slideNames.length === 0) {
		throw new Error('No slides found in this PowerPoint file.');
	}
	const parts: string[] = [];
	slideNames.forEach((name, i) => {
		const xml = strFromU8(files[name]);
		const paragraphs = xml
			.split('<a:p>')
			.slice(1)
			.map((chunk) =>
				[...chunk.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1])).join(''),
			)
			.filter((t) => t.trim().length > 0);
		parts.push(`## Slide ${i + 1}\n\n${paragraphs.length ? paragraphs.join('\n\n') : '_(no text)_'}`);
	});
	return parts.join('\n\n');
}

const PPTX_EXT = /\.pptx$/i;
function isPptxInput(filename: string, contentType: string): boolean {
	return PPTX_EXT.test(filename) || contentType.includes('presentationml');
}

async function describeImage(
	env: Env,
	bytes: ArrayBuffer,
	contentType: string,
	filename: string,
	hint: string | undefined,
	modelKey: string,
	userIntro = 'Describe this image for a knowledge base.',
): Promise<string> {
	const norm = await normaliseImageForVision(env, bytes, contentType, filename);
	const dataUrl = `data:${norm.contentType};base64,${arrayBufferToBase64(norm.bytes)}`;
	const userText = hint ? `${userIntro} Focus: ${hint}` : userIntro;
	return runVision(env, modelKey, [dataUrl], userText, IMAGE_SYSTEM_PROMPT);
}

// Video understanding via Media Transformations (env.MEDIA) — frames + audio
// extracted server-side, no ffmpeg. Frames are sampled across the clip and
// passed as an ordered image sequence (Gemma 4's native multimodal way), and
// the audio track is transcribed by Whisper. The two are combined into one
// markdown doc: visual summary + transcript.
async function describeVideo(
	env: Env,
	bytes: ArrayBuffer,
	hint: string | undefined,
	modelKey: string,
): Promise<string> {
	const VIDEO_INTRO =
		'These images are still frames sampled in time order across a single video (early frames first). Read them as a sequence: describe what happens across the clip, note scene or subject changes, and transcribe any visible text. Treat them as one video, not separate images.';

	// Extract individual full-res frames at evenly-spaced timestamps and pass
	// them as an ordered sequence — Gemma 4 processes video natively this way
	// (interleaved frames, up to ~60 at 1fps), which keeps each frame legible.
	// Timestamps past the clip's end fail and are skipped, so a short clip just
	// yields fewer frames. Frame + audio extraction run in parallel.
	const FRAME_TIMES = ['0s', '4s', '8s', '12s', '16s', '20s', '26s', '32s', '40s', '48s', '56s'];

	const extractFrame = async (time: string): Promise<string | null> => {
		try {
			const resp = await env.MEDIA.input(new Response(bytes).body!)
				.transform({ width: 768 })
				.output({ mode: 'frame', time, format: 'jpg' })
				.response();
			if (!resp.ok) return null;
			const fb = await resp.arrayBuffer();
			if (fb.byteLength === 0) return null;
			return `data:image/jpeg;base64,${arrayBufferToBase64(fb)}`;
		} catch {
			return null;
		}
	};

	const extractAudioTranscript = async (): Promise<string | null> => {
		try {
			const resp = await env.MEDIA.input(new Response(bytes).body!).output({ mode: 'audio' }).response();
			if (!resp.ok) return null;
			const ab = await resp.arrayBuffer();
			if (ab.byteLength === 0) return null;
			return (await whisperText(env, ab)) || null;
		} catch (err) {
			console.error(JSON.stringify({ event: 'video_audio_error', error: String(err) }));
			return null;
		}
	};

	const [frameResults, transcript] = await Promise.all([
		Promise.all(FRAME_TIMES.map(extractFrame)),
		extractAudioTranscript(),
	]);
	const frames = frameResults.filter((f): f is string => f !== null);

	const parts: string[] = [];
	if (frames.length > 0) {
		const userText = hint ? `${VIDEO_INTRO} Focus: ${hint}` : VIDEO_INTRO;
		const visual = await runVision(env, modelKey, frames, userText, IMAGE_SYSTEM_PROMPT, 2048);
		parts.push(`## Visual (${frames.length} frames)\n\n${visual}`);
	}
	if (transcript) parts.push(`## Transcript\n\n${transcript}`);

	if (parts.length === 0) {
		throw new Error('Could not extract frames or audio from this video');
	}
	return parts.join('\n\n');
}

// Pick the R2 bucket for a key the same way the sync API does: wiki/ → WIKI,
// everything else → FILES. Keeps a sidecar in the same bucket as its sibling.
function bucketForKey(env: Env, key: string): R2Bucket {
	return key.startsWith('wiki/') ? env.WIKI : env.FILES;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleAction(env: Env, args: Record<string, unknown>): Promise<unknown> {
	const action = args.action as FilesAction;
	if (!VALID_ACTIONS.includes(action)) {
		throw new Error(`Unknown files action: '${action}'. Valid: ${VALID_ACTIONS.join(', ')}`);
	}

	const files = new FilesService(env);

	switch (action) {
		case 'upload': {
			if (!args.path) throw new Error('upload requires path');
			return await files.upload({
				path: args.path as string,
				content_base64: args.content_base64 as string | undefined,
				content_text: args.content_text as string | undefined,
				content_type: args.content_type as string | undefined,
			});
		}

		case 'download': {
			if (!args.path) throw new Error('download requires path');
			const result = await files.download(args.path as string);
			if (!result) throw new Error(`Not found: ${args.path}`);
			const bytes = await new Response(result.body).arrayBuffer();
			return {
				path: result.meta.path,
				content_type: result.meta.content_type,
				size_bytes: result.meta.size,
				content_base64: arrayBufferToBase64(bytes),
			};
		}

		case 'list': {
			const prefix = (args.prefix as string | undefined) ?? '';
			return { files: await files.list(prefix) };
		}

		case 'delete': {
			if (!args.path) throw new Error('delete requires path');
			await files.delete(args.path as string);
			return { ok: true };
		}

		case 'share': {
			if (!args.path) throw new Error('share requires path');
			const mode = (args.mode as 'temp' | 'public' | undefined) ?? 'temp';
			if (mode === 'public') {
				// Public share → fetch the file content + publish as a page
				const dl = await files.download(args.path as string);
				if (!dl) throw new Error(`Not found: ${args.path}`);
				const text = await new Response(dl.body).text();
				const ps = new PublishService(env);
				const result = await ps.publish({
					slug: (args.slug as string) ?? (args.path as string).replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
					title: (args.title as string) ?? (args.path as string),
					markdown: text,
					visibility: 'public',
				});
				return { mode: 'public', ...result };
			}
			const ttl = (args.ttl_hours as number | undefined) ?? 168;
			const link = await files.createShare(args.path as string, ttl);
			return { mode: 'temp', ...link };
		}

		case 'revoke': {
			if (!args.share_id && !args.slug) throw new Error('revoke requires share_id or slug (for public)');
			if (args.slug) {
				const ps = new PublishService(env);
				await ps.unpublish(args.slug as string);
				return { ok: true, kind: 'public' };
			}
			// FilesService doesn't expose revoke — share lives in R2 under shares/<id>. Delete the object directly.
			await env.FILES.delete(`shares/${args.share_id as string}`);
			return { ok: true, kind: 'temp' };
		}

		case 'publish': {
			const ps = new PublishService(env);
			if (!args.slug) throw new Error('publish requires slug');
			const result = await ps.publish({
				slug: args.slug as string,
				title: (args.title as string) ?? '',
				markdown: (args.body as string) ?? '',
				visibility: 'public',
			});
			return result;
		}

		case 'unpublish': {
			if (!args.slug) throw new Error('unpublish requires slug');
			const ps = new PublishService(env);
			await ps.unpublish(args.slug as string);
			return { ok: true };
		}

		case 'convert': {
			if (!args.source || !args.source_value) {
				throw new Error('convert requires source + source_value');
			}
			const sourceKind = args.source as string;
			const sourceValue = args.source_value as string;
			// filename drives type detection + toMarkdown's name. Derive it from
			// the key/URL basename when omitted (an r2_path like inbox/quote.pdf
			// already carries the name) so agents don't have to repeat it; only
			// base64 sources truly need it given.
			let filename = ((args.filename as string | undefined) ?? '').trim();
			if (!filename && (sourceKind === 'r2_path' || sourceKind === 'url')) {
				filename = sourceValue.split(/[?#]/)[0]!.split('/').filter(Boolean).pop() ?? '';
			}
			if (!filename) {
				throw new Error('convert needs filename for base64 sources (to detect the type) — add filename: "<name.ext>".');
			}
			// Cap input size to survive the 128MB isolate. Video streams through
			// Media Transformations (100MB input cap, no full base64); images/docs
			// get base64-encoded (~1.33x) so stay well under at 40MB.
			const looksVideo = isVideoInput(filename, (args.mime_type as string | undefined) ?? '');
			const maxConvertBytes = looksVideo ? 100 * 1024 * 1024 : 40 * 1024 * 1024;
			const { bytes, contentType } = await resolveBytes(
				env,
				sourceKind,
				sourceValue,
				args.mime_type as string | undefined,
				maxConvertBytes,
			);
			const isImage = isImageInput(filename, contentType);
			const isVideo = !isImage && isVideoInput(filename, contentType);
			const isAudio = !isImage && !isVideo && isAudioInput(filename, contentType);
			const isPptx = !isImage && !isVideo && !isAudio && isPptxInput(filename, contentType);
			const kind = isImage ? 'img' : isVideo ? 'video' : isAudio ? 'audio' : isPptx ? 'pptx' : 'md';
			const model = (args.model as string | undefined) ?? 'gemma4';
			const hint = args.hint as string | undefined;

			// Cache by content hash + variant. Re-converting the same bytes (a
			// re-sync, a cross-session re-run) returns the stored markdown for
			// free. Variant captures the inputs that change the output: model +
			// hint for images/video; just the kind for audio (Whisper) and
			// toMarkdown (deterministic).
			const contentHash = await sha256Hex(bytes);
			const cacheKey = kind === 'md' || kind === 'audio' || kind === 'pptx'
				? `${contentHash}|${kind}`
				: `${contentHash}|${kind}|${model}|${hint ?? ''}`;

			type ConvertHandler = 'image-description' | 'video-description' | 'audio-transcription' | 'pptx-text' | 'to-markdown';
			let markdown: string;
			let mimeType: string;
			let handler: ConvertHandler;
			let tokens: number | undefined;
			let cached = false;

			const hit = await env.DB.prepare(
				'SELECT handler, mime_type, markdown FROM convert_cache WHERE cache_key = ?',
			)
				.bind(cacheKey)
				.first<{ handler: string; mime_type: string | null; markdown: string }>();

			if (hit) {
				markdown = hit.markdown;
				mimeType = hit.mime_type ?? contentType;
				handler = hit.handler as ConvertHandler;
				cached = true;
			} else if (isImage) {
				markdown = await describeImage(env, bytes, contentType, filename, hint, model);
				mimeType = contentType;
				handler = 'image-description';
			} else if (isVideo) {
				markdown = await describeVideo(env, bytes, hint, model);
				mimeType = contentType.startsWith('video/') ? contentType : 'video/mp4';
				handler = 'video-description';
			} else if (isAudio) {
				markdown = await transcribeAudio(env, bytes);
				mimeType = contentType.startsWith('audio/') ? contentType : 'audio/mpeg';
				handler = 'audio-transcription';
			} else if (isPptx) {
				markdown = pptxToMarkdown(bytes);
				mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
				handler = 'pptx-text';
			} else {
				const blob = new Blob([bytes], { type: contentType });
				const result = await env.AI.toMarkdown({ name: filename, blob });
				if (result.format === 'error') {
					// toMarkdown rejects PPTX and some exotic formats as "Unsupported
					// file type". Give a recoverable hint rather than a raw error.
					if (/unsupported file type/i.test(result.error ?? '')) {
						throw new Error(
							`Can't convert ${filename} directly (this format isn't supported). Export it to PDF and convert that instead.`,
						);
					}
					throw new Error(`Conversion failed for ${filename}: ${result.error}`);
				}
				markdown = result.data;
				mimeType = result.mimeType;
				tokens = result.tokens;
				handler = 'to-markdown';
			}

			if (!cached) {
				await env.DB.prepare(
					'INSERT OR REPLACE INTO convert_cache (cache_key, handler, mime_type, markdown) VALUES (?, ?, ?, ?)',
				)
					.bind(cacheKey, handler, mimeType, markdown)
					.run();
			}

			// Persist the converted markdown as a sidecar next to the original.
			// Explicit save_to_files wins; otherwise, when converting an R2 file,
			// default to "<original-key>.md" in the same bucket — unless the
			// caller opts out with save_sidecar:false. url/base64 sources have no
			// natural home, so only save when save_to_files is given.
			let savedAt: string | undefined;
			const explicit = args.save_to_files as string | undefined;
			const sidecarOptOut = args.save_sidecar === false;
			let sidecarKey: string | undefined = explicit;
			if (!sidecarKey && sourceKind === 'r2_path' && !sidecarOptOut) {
				sidecarKey = sourceValue.replace(/\.[^./]+$/, '') + '.md';
				if (sidecarKey === sourceValue) sidecarKey = `${sourceValue}.md`; // no ext
			}
			if (sidecarKey) {
				await bucketForKey(env, sidecarKey).put(sidecarKey, markdown, {
					httpMetadata: { contentType: 'text/markdown' },
				});
				savedAt = sidecarKey;
			}

			return {
				filename,
				mime_type: mimeType,
				handler,
				cached,
				markdown,
				...(tokens ? { tokens } : {}),
				...(savedAt ? { saved_to: savedAt } : {}),
			};
		}

		case 'generate_image': {
			// Workers AI FLUX 2 / FLUX 1 image generation.
			// FLUX 2 takes multipart; FLUX 1 takes JSON.
			const prompt = args.prompt as string;
			if (!prompt) throw new Error('generate_image requires prompt');
			const model = (args.model as string | undefined) ?? '@cf/black-forest-labs/flux-2-klein-9b';

			let imageBytes: Uint8Array;
			if (model.includes('flux-2')) {
				const form = new FormData();
				form.append('prompt', prompt);
				if (args.width) form.append('width', String(args.width));
				if (args.height) form.append('height', String(args.height));
				if (args.guidance) form.append('guidance', String(args.guidance));
				const formResponse = new Response(form);
				const result = await env.AI.run(model as never, {
					multipart: { body: formResponse.body!, contentType: formResponse.headers.get('content-type')! },
				} as never);
				const img = (result as unknown as Record<string, unknown>).image as string;
				imageBytes = new Uint8Array(atob(img).split('').map((c) => c.charCodeAt(0)));
			} else {
				const result = await env.AI.run(model as never, {
					prompt,
					width: (args.width as number) ?? 1024,
					height: (args.height as number) ?? 1024,
				} as never);
				const img = (result as unknown as Record<string, unknown>).image as string;
				imageBytes = new Uint8Array(atob(img).split('').map((c) => c.charCodeAt(0)));
			}

			let savedAt: string | undefined;
			let base64: string | undefined = arrayBufferToBase64(imageBytes.buffer as ArrayBuffer);
			if (args.save_to_files) {
				const meta = await files.upload({
					path: args.save_to_files as string,
					content_base64: base64,
					content_type: 'image/png',
				});
				savedAt = meta.path;
				base64 = undefined;
			}
			return {
				model,
				prompt,
				size_bytes: imageBytes.byteLength,
				...(savedAt ? { saved_to: savedAt } : { image_base64: base64 }),
			};
		}

		case 'speak': {
			// Workers AI Aura-2 TTS — text → audio.
			const text = args.text as string;
			if (!text) throw new Error('speak requires text');
			const voice = ((args.voice as string | undefined) ?? 'orion').replace(/-en$/i, '');
			const result = await env.AI.run('@cf/deepgram/aura-2-en' as never, {
				text,
				speaker: voice,
				encoding: 'mp3',
				container: 'none',
			} as never);
			// Aura-2 returns a stream of audio bytes
			const audioBytes = await new Response(result as unknown as ReadableStream).arrayBuffer();
			let savedAt: string | undefined;
			let base64: string | undefined = arrayBufferToBase64(audioBytes);
			if (args.save_to_files) {
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

		case 'fetch_with_js': {
			// URL → puppeteer render → toMarkdown via Workers AI.
			const url = args.url as string;
			if (!url) throw new Error('fetch_with_js requires url');
			const browser = await puppeteer.launch(env.BROWSER as never);
			try {
				const page = await browser.newPage();
				if (args.viewport_width || args.viewport_height) {
					await page.setViewport({
						width: (args.viewport_width as number) ?? 1280,
						height: (args.viewport_height as number) ?? 800,
					});
				}
				await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
				if (args.wait_for_selector) {
					await page.waitForSelector(args.wait_for_selector as string, { timeout: 8_000 });
				}
				if (args.wait_ms) {
					await new Promise((r) => setTimeout(r, args.wait_ms as number));
				}
				const html = await page.content();
				const title = await page.title();
				const finalUrl = page.url();

				// Optionally convert to markdown via Workers AI toMarkdown
				let markdown: string | null = null;
				if (args.as_markdown !== false) {
					const blob = new Blob([html], { type: 'text/html' });
					const conv = await env.AI.toMarkdown({ name: 'page.html', blob });
					if (conv.format === 'markdown') markdown = conv.data;
				}

				let savedAt: string | undefined;
				if (args.save_to_files && markdown) {
					const meta = await files.upload({
						path: args.save_to_files as string,
						content_text: markdown,
						content_type: 'text/markdown',
					});
					savedAt = meta.path;
				}

				return {
					url: finalUrl,
					title,
					html_length: html.length,
					markdown,
					...(savedAt ? { saved_to: savedAt } : {}),
				};
			} finally {
				await browser.close();
			}
		}

		case 'screenshot': {
			const url = args.url as string;
			if (!url) throw new Error('screenshot requires url');
			const browser = await puppeteer.launch(env.BROWSER as never);
			try {
				const page = await browser.newPage();
				await page.setViewport({
					width: (args.viewport_width as number) ?? 1280,
					height: (args.viewport_height as number) ?? 800,
				});
				await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
				const buffer = (await page.screenshot({
					fullPage: (args.full_page as boolean) ?? false,
					type: 'png',
				})) as Uint8Array;

				let savedAt: string | undefined;
				let base64: string | undefined = arrayBufferToBase64(buffer.buffer as ArrayBuffer);
				if (args.save_to_files) {
					const meta = await files.upload({
						path: args.save_to_files as string,
						content_base64: base64,
						content_type: 'image/png',
					});
					savedAt = meta.path;
					base64 = undefined;
				}
				return {
					url,
					size_bytes: buffer.byteLength,
					...(savedAt ? { saved_to: savedAt } : { screenshot_base64: base64 }),
				};
			} finally {
				await browser.close();
			}
		}

		case 'transform_image': {
			if (!args.source || !args.source_value) throw new Error('transform_image requires source + source_value');
			const { stream } = await resolveBytes(env, args.source as string, args.source_value as string);
			const transform: Record<string, unknown> = {};
			if (args.width) transform.width = args.width;
			if (args.height) transform.height = args.height;
			if (args.fit) transform.fit = args.fit;
			const outputFormat = (args.format as string | undefined) ?? 'image/jpeg';
			const outputOpts: Record<string, unknown> = {
				format: outputFormat.startsWith('image/') ? outputFormat : `image/${outputFormat}`,
			};
			if (args.quality) outputOpts.quality = args.quality;

			const transformer = env.IMAGES.input(stream);
			const result = await (Object.keys(transform).length > 0
				? transformer.transform(transform as never).output(outputOpts as never)
				: transformer.output(outputOpts as never));

			const transformedStream = result.image();
			const transformedBytes = await new Response(transformedStream).arrayBuffer();
			const outContentType = result.contentType();

			let savedAt: string | undefined;
			let returnedBase64: string | undefined = arrayBufferToBase64(transformedBytes);
			if (args.save_to_files) {
				const meta = await files.upload({
					path: args.save_to_files as string,
					content_base64: returnedBase64,
					content_type: outContentType,
				});
				savedAt = meta.path;
				returnedBase64 = undefined;
			}
			return {
				content_type: outContentType,
				size_bytes: transformedBytes.byteLength,
				...(savedAt ? { saved_to: savedAt } : { image_base64: returnedBase64 }),
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
						serverInfo: { name: 'office-town-files', version: '1.0.0' },
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
	if (!auth || auth !== `Bearer ${await getEffectiveBearer(c.env)}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const req = await c.req.json<JsonRpcRequest>();
	const result = await handleRpc(c.env, req);
	return c.json(result);
});

app.get('/sse', async (c) => {
	const auth = c.req.header('authorization');
	if (!auth || auth !== `Bearer ${await getEffectiveBearer(c.env)}`) {
		return c.json({ error: 'Unauthorised' }, 401);
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/files\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-files-mcp', actions: VALID_ACTIONS.length }));

export const filesMcpRoutes = app;
