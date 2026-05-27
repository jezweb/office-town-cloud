// Cloudflare Worker env bindings for the single office-town worker.
// All capabilities (wiki + files + publish + cron + dashboard + 4 MCP servers)
// share one binding surface declared in wrangler.jsonc.

import type {
	Ai,
	D1Database,
	Fetcher,
	Queue,
	R2Bucket,
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

	// Browser Rendering (for the browser MCP)
	BROWSER: Fetcher;

	// Vars
	ENVIRONMENT: 'development' | 'staging' | 'production';
	ALLOWED_AUTH_DOMAINS: string;
	CF_ACCOUNT_ID?: string;          // devops MCP
	DEFAULT_FROM_EMAIL?: string;     // email MCP
	DEFAULT_FROM_NAME?: string;      // email MCP

	// Secrets (set via dashboard or .dev.vars)
	BETTER_AUTH_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	MCP_BEARER_TOKEN?: string;
	CF_API_TOKEN?: string;           // devops MCP
	SMTP2GO_API_KEY?: string;        // email MCP (optional)
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
