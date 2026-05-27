// MCP server — file conversion + image transformation tools.
//
// Mounted on the office-town worker at /mcp/files. Two binding-backed tools:
//
//   files.convert         — any-doc → markdown via env.AI.toMarkdown
//                           (PDF, DOCX, XLSX, PPTX, HTML, images-OCR, audio-transcribe)
//   files.transform_image — resize / format-convert / crop / strip via env.IMAGES
//
// Both can either return content inline or save to the FILES R2 bucket.
// No API keys — pure Cloudflare bindings.

import { Hono } from 'hono';
import type { Env, AppContext } from '../types';
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

const TOOLS = {
	'files.convert': {
		description:
			'Convert any document file to markdown using Cloudflare Workers AI. Supports PDF, DOCX, XLSX, PPTX, HTML, images (OCR), and audio (transcription). Source can be a URL, a path in the FILES bucket, or inline base64 content. Returns the markdown text plus tokens used. Optionally saves the markdown to FILES at the given path.',
		inputSchema: {
			type: 'object',
			properties: {
				source: {
					type: 'string',
					enum: ['url', 'r2_path', 'base64'],
					description: 'Where the file comes from',
				},
				source_value: {
					type: 'string',
					description: 'URL, R2 path, or base64-encoded bytes depending on source',
				},
				filename: {
					type: 'string',
					description: 'Original filename incl. extension (e.g. "contract.pdf") — helps the converter pick a parser',
				},
				mime_type: {
					type: 'string',
					description: 'Optional MIME type hint (e.g. "application/pdf"). Auto-detected from filename otherwise.',
				},
				save_to_files: {
					type: 'string',
					description: 'If set, save the resulting markdown to this path in the FILES bucket (e.g. "converted/contract.md")',
				},
			},
			required: ['source', 'source_value', 'filename'],
		},
	},
	'files.transform_image': {
		description:
			'Resize, crop, or format-convert an image using Cloudflare Images. Source can be a URL, a path in the FILES bucket, or inline base64. Returns the transformed image as base64, or saves to FILES at the given path. Common use: agent fetches a logo, transforms to 200x200 PNG, saves to <client>/logo.png.',
		inputSchema: {
			type: 'object',
			properties: {
				source: { type: 'string', enum: ['url', 'r2_path', 'base64'] },
				source_value: { type: 'string' },
				width: { type: 'number', description: 'Target width in pixels (omit to preserve aspect)' },
				height: { type: 'number', description: 'Target height in pixels (omit to preserve aspect)' },
				fit: {
					type: 'string',
					enum: ['scale-down', 'contain', 'pad', 'cover', 'crop'],
					description: 'How to fit when both width + height given (default: scale-down)',
				},
				format: {
					type: 'string',
					enum: ['avif', 'webp', 'jpeg', 'png', 'json'],
					description: 'Output format (default: keep input format)',
				},
				quality: { type: 'number', description: '0-100, for lossy formats (default: 85)' },
				save_to_files: {
					type: 'string',
					description: 'If set, save the transformed image to this path in the FILES bucket',
				},
			},
			required: ['source', 'source_value'],
		},
	},
} as const;

/**
 * Resolve a source descriptor into a ReadableStream + content-type guess.
 */
async function resolveSource(
	env: Env,
	source: string,
	value: string,
	mimeHint?: string,
): Promise<{ stream: ReadableStream<Uint8Array>; bytes: ArrayBuffer; contentType: string }> {
	if (source === 'url') {
		const resp = await fetch(value);
		if (!resp.ok) throw new Error(`Failed to fetch ${value}: ${resp.status}`);
		const bytes = await resp.arrayBuffer();
		return {
			stream: new Response(bytes).body!,
			bytes,
			contentType: mimeHint ?? resp.headers.get('content-type') ?? 'application/octet-stream',
		};
	}
	if (source === 'r2_path') {
		const obj = await env.FILES.get(value);
		if (!obj) throw new Error(`Not found in FILES bucket: ${value}`);
		const bytes = await obj.arrayBuffer();
		return {
			stream: new Response(bytes).body!,
			bytes,
			contentType: mimeHint ?? obj.httpMetadata?.contentType ?? 'application/octet-stream',
		};
	}
	if (source === 'base64') {
		const binary = atob(value);
		const buf = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
		return {
			stream: new Response(buf.buffer as ArrayBuffer).body!,
			bytes: buf.buffer as ArrayBuffer,
			contentType: mimeHint ?? 'application/octet-stream',
		};
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

async function handleToolCall(env: Env, tool: string, args: Record<string, unknown>): Promise<unknown> {
	switch (tool) {
		case 'files.convert': {
			const { bytes, contentType } = await resolveSource(
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
				const filesService = new FilesService(env);
				const meta = await filesService.upload({
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

		case 'files.transform_image': {
			const { stream } = await resolveSource(
				env,
				args.source as string,
				args.source_value as string,
			);
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
				const filesService = new FilesService(env);
				const meta = await filesService.upload({
					path: args.save_to_files as string,
					content_base64: returnedBase64,
					content_type: outContentType,
				});
				savedAt = meta.path;
				// Don't echo the base64 back when we've saved it — caller has the path
				returnedBase64 = undefined;
			}

			return {
				content_type: outContentType,
				size_bytes: transformedBytes.byteLength,
				...(savedAt ? { saved_to: savedAt } : { image_base64: returnedBase64 }),
			};
		}

		default:
			throw new Error(`Unknown tool: ${tool}`);
	}
}

function asContent(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
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
				const value = await handleToolCall(env, params.name, params.arguments ?? {});
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

app.get('/health', (c) => c.json({ status: 'ok', service: 'office-town-files-mcp' }));

export const filesMcpRoutes = app;
