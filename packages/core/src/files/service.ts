// Files service — thin wrapper over R2 FILES bucket with shareable signed URLs.
//
// Files go in `office-town-files`. The FILES bucket is the agent's working
// drive — upload/download/list/share/extract. The WIKI bucket is reserved
// for wiki entries; never mix them.

import type { Env } from '../types';

const FILES_PREFIX = 'files/';
const SHARE_PREFIX = 'shares/';

export interface FileUploadInput {
	path: string;
	content_base64?: string;
	content_text?: string;
	content_type?: string;
}

export interface FileMetadata {
	path: string;
	size: number;
	content_type: string;
	uploaded_at: string;
	etag: string;
}

export interface ShareLink {
	share_id: string;
	original_path: string;
	created_at: string;
	expires_at: string;
	url: string;
}

function normalisePath(path: string): string {
	const trimmed = path.replace(/^\/+/, '').replace(/\.\.\//g, '');
	return `${FILES_PREFIX}${trimmed}`;
}

function nanoid(len = 16): string {
	const chars = 'ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnpqrstuvwxyz23456789';
	const bytes = crypto.getRandomValues(new Uint8Array(len));
	return Array.from(bytes)
		.map((b) => chars[b % chars.length])
		.join('');
}

export class FilesService {
	constructor(private readonly env: Env) {}

	async upload(input: FileUploadInput): Promise<FileMetadata> {
		const key = normalisePath(input.path);
		let body: ArrayBuffer | string;
		const contentType = input.content_type ?? 'application/octet-stream';

		if (input.content_text !== undefined) {
			body = input.content_text;
		} else if (input.content_base64 !== undefined) {
			const binary = atob(input.content_base64);
			const buf = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
			body = buf.buffer;
		} else {
			throw new Error('Either content_text or content_base64 must be provided');
		}

		const result = await this.env.FILES.put(key, body, {
			httpMetadata: { contentType },
		});
		if (!result) throw new Error('Upload failed');

		return {
			path: input.path,
			size: result.size,
			content_type: contentType,
			uploaded_at: result.uploaded.toISOString(),
			etag: result.etag,
		};
	}

	async download(path: string): Promise<{ body: ReadableStream; meta: FileMetadata } | null> {
		const key = normalisePath(path);
		const obj = await this.env.FILES.get(key);
		if (!obj) return null;
		return {
			body: obj.body,
			meta: {
				path,
				size: obj.size,
				content_type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
				uploaded_at: obj.uploaded.toISOString(),
				etag: obj.etag,
			},
		};
	}

	async list(prefix = ''): Promise<FileMetadata[]> {
		const r2Prefix = normalisePath(prefix === '' ? '' : prefix + '/');
		const listing = await this.env.FILES.list({ prefix: r2Prefix, limit: 1000 });
		return listing.objects.map((obj) => ({
			path: obj.key.slice(FILES_PREFIX.length),
			size: obj.size,
			content_type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
			uploaded_at: obj.uploaded.toISOString(),
			etag: obj.etag,
		}));
	}

	async delete(path: string): Promise<void> {
		const key = normalisePath(path);
		await this.env.FILES.delete(key);
	}

	async createShare(path: string, expiresInHours = 168): Promise<ShareLink> {
		const key = normalisePath(path);
		const exists = await this.env.FILES.head(key);
		if (!exists) throw new Error(`File not found: ${path}`);

		const shareId = nanoid(12);
		const createdAt = new Date();
		const expiresAt = new Date(createdAt.getTime() + expiresInHours * 60 * 60 * 1000);

		const sharePayload = {
			share_id: shareId,
			original_path: path,
			original_key: key,
			created_at: createdAt.toISOString(),
			expires_at: expiresAt.toISOString(),
		};
		await this.env.FILES.put(`${SHARE_PREFIX}${shareId}.json`, JSON.stringify(sharePayload), {
			httpMetadata: { contentType: 'application/json' },
			customMetadata: { kind: 'share-record' },
		});

		return {
			share_id: shareId,
			original_path: path,
			created_at: createdAt.toISOString(),
			expires_at: expiresAt.toISOString(),
			// Resolved at the public /s/:id endpoint
			url: `/s/${shareId}`,
		};
	}

	async resolveShare(shareId: string): Promise<{ stream: ReadableStream; meta: FileMetadata } | null> {
		const record = await this.env.FILES.get(`${SHARE_PREFIX}${shareId}.json`);
		if (!record) return null;
		const payload = (await record.json()) as {
			original_key: string;
			expires_at: string;
			original_path: string;
		};
		if (new Date(payload.expires_at).getTime() < Date.now()) {
			return null;
		}
		const obj = await this.env.FILES.get(payload.original_key);
		if (!obj) return null;
		return {
			stream: obj.body,
			meta: {
				path: payload.original_path,
				size: obj.size,
				content_type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
				uploaded_at: obj.uploaded.toISOString(),
				etag: obj.etag,
			},
		};
	}
}
