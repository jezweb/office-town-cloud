// Cloudflare Worker env bindings for the single office-town worker.
// All capabilities (wiki + files + publish + cron + dashboard + 4 MCP servers)
// share one binding surface declared in wrangler.jsonc.

import type {
	Ai,
	D1Database,
	Fetcher,
	ImagesBinding,
	Queue,
	R2Bucket,
	SendEmail,
	Vectorize,
} from '@cloudflare/workers-types';

export interface Env {
	// Storage
	DB: D1Database;
	WIKI: R2Bucket;
	FILES: R2Bucket;
	VECTOR_INDEX: Vectorize;
	AI: Ai;
	INDEX_QUEUE: Queue<IndexMessage>;

	// Browser Rendering (for files MCP fetch_with_js + screenshot actions)
	BROWSER: Fetcher;

	// Cloudflare Images (for files MCP transform_image tool)
	IMAGES: ImagesBinding;

	// Media Transformations — video frame + audio extraction (files MCP convert,
	// video handler). Public open beta. Typed loosely; the binding's fluent API
	// (input().transform().output().response()) isn't in the ambient types yet.
	MEDIA: {
		input(stream: ReadableStream<Uint8Array>): {
			transform(opts?: { width?: number; height?: number; fit?: string }): {
				output(opts: Record<string, unknown>): { response(): Promise<Response> };
			};
			output(opts: Record<string, unknown>): { response(): Promise<Response> };
		};
	};

	// Outbound email via Cloudflare Email Routing — no API key needed.
	// Recipients must be verified destinations on the user's Email Routing setup.
	SEND_EMAIL: SendEmail;

	// Sandbox MCP — @cloudflare/sandbox SDK over Containers. Each
	// getSandbox(env.SANDBOX, id) call gets/creates a container instance.
	// Typed against the SDK's exported Sandbox class so getSandbox accepts
	// the namespace without a cast.
	SANDBOX: DurableObjectNamespace<import('@cloudflare/sandbox').Sandbox>;

	// Vars
	ENVIRONMENT: 'development' | 'staging' | 'production';
	ALLOWED_AUTH_DOMAINS: string;
	DEFAULT_FROM_EMAIL?: string;     // email MCP sender
	DEFAULT_FROM_NAME?: string;      // email MCP sender display
	SEED_EXAMPLES?: string;          // 'true' = seed demo example entries on fresh towns (default: off — clean town)

	// Secrets (set via dashboard or .dev.vars)
	BETTER_AUTH_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	MCP_BEARER_TOKEN?: string;
}

export interface IndexMessage {
	type: 'index' | 'delete';
	entry_id: string;
	collection: string;
	slug: string;
	r2_key?: string;
}

export interface AuthUser {
	id: string;
	email: string;
	name: string | null;
}

export type AppContext = {
	Bindings: Env;
	Variables: {
		user?: AuthUser;
		mcp_authed?: boolean;
	};
};
