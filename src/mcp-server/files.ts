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
//   convert         — Any-doc → markdown via env.AI.toMarkdown
//                     (PDF, DOCX, XLSX, PPTX, HTML, image-OCR, audio-transcribe)
//   transform_image — Resize/crop/format-convert via Cloudflare Images binding
//   publish         — Render markdown to HTML, expose at /p/<slug> (sugar over share mode=public)
//   unpublish       — Remove a public page (sugar over revoke)

import { Hono } from 'hono';
import puppeteer from '@cloudflare/puppeteer';
import type { AppContext, Env } from '../types';
import { FilesService } from '../files/service';
import { PublishService } from '../publish/service';

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
				// convert
				source: { type: 'string', enum: ['url', 'r2_path', 'base64'], description: 'Where the source file lives (convert)' },
				source_value: { type: 'string', description: 'URL, R2 path, or base64 bytes' },
				filename: { type: 'string', description: 'Original filename incl. extension' },
				mime_type: { type: 'string', description: 'Optional MIME hint' },
				save_to_files: { type: 'string', description: 'If set, save result to this path' },
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

async function resolveBytes(
	env: Env,
	source: string,
	value: string,
	mimeHint?: string,
): Promise<{ bytes: ArrayBuffer; contentType: string; stream: ReadableStream<Uint8Array> }> {
	if (source === 'url') {
		const resp = await fetch(value);
		if (!resp.ok) throw new Error(`Failed to fetch ${value}: ${resp.status}`);
		const bytes = await resp.arrayBuffer();
		return { bytes, contentType: mimeHint ?? resp.headers.get('content-type') ?? 'application/octet-stream', stream: new Response(bytes).body! };
	}
	if (source === 'r2_path') {
		const obj = await env.FILES.get(value);
		if (!obj) throw new Error(`Not found in substrate bucket: ${value}`);
		const bytes = await obj.arrayBuffer();
		return { bytes, contentType: mimeHint ?? obj.httpMetadata?.contentType ?? 'application/octet-stream', stream: new Response(bytes).body! };
	}
	if (source === 'base64') {
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
			if (!args.source || !args.source_value || !args.filename) {
				throw new Error('convert requires source + source_value + filename');
			}
			const { bytes, contentType } = await resolveBytes(
				env,
				args.source as string,
				args.source_value as string,
				args.mime_type as string | undefined,
			);
			const filename = args.filename as string;
			const blob = new Blob([bytes], { type: contentType });
			const result = await env.AI.toMarkdown({ name: filename, blob });
			if (result.format === 'error') {
				throw new Error(`Conversion failed for ${filename}: ${result.error}`);
			}
			const markdown = result.data;
			let savedAt: string | undefined;
			if (args.save_to_files) {
				const meta = await files.upload({
					path: args.save_to_files as string,
					content_text: markdown,
					content_type: 'text/markdown',
				});
				savedAt = meta.path;
			}
			return {
				filename,
				mime_type: result.mimeType,
				markdown,
				tokens: result.tokens,
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
			controller.enqueue(encoder.encode('event: endpoint\ndata: /mcp/files\n\n'));
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-files-mcp', actions: VALID_ACTIONS.length }));

export const filesMcpRoutes = app;
