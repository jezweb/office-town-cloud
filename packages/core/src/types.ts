// Cloudflare Worker env bindings for office-town-core.

import type {
	Ai,
	D1Database,
	Queue,
	R2Bucket,
	Vectorize,
} from '@cloudflare/workers-types';

export interface Env {
	DB: D1Database;
	WIKI: R2Bucket;
	FILES: R2Bucket;
	VECTOR_INDEX: Vectorize;
	AI: Ai;
	INDEX_QUEUE: Queue<IndexMessage>;

	ENVIRONMENT: 'development' | 'staging' | 'production';
	ALLOWED_AUTH_DOMAINS: string;

	// Secrets
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
