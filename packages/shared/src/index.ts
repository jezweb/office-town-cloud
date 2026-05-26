// Office Town Cloud — shared types, schemas, and utilities
// The type contract between workers, MCP adapters, and tests.

export const VERSION = '0.1.0';

/**
 * Universal sextet — required frontmatter for every wiki entry.
 * Collections may add additional required fields.
 */
export interface UniversalSextet {
	slug: string;
	kind: string;
	created: string; // YYYY-MM-DD
	last_updated: string; // YYYY-MM-DD
	last_edited_by: string; // agent slug, human slug, or 'system'
	last_change_summary: string;
}

/**
 * A wiki entry as stored.
 * Body is the markdown body (without frontmatter).
 * Frontmatter is the parsed YAML — universal sextet plus collection-specific fields.
 */
export interface WikiEntry {
	collection: string;
	slug: string;
	body: string;
	frontmatter: UniversalSextet & Record<string, unknown>;
	r2_key: string; // canonical R2 path: <collection>/<slug>/<canonical>.md
	created_at: string; // ISO 8601
	updated_at: string; // ISO 8601
}

/**
 * Collection definition.
 * Each collection has a name, a shape (entity-as-folder / dated-stream / flat-topic),
 * and a set of required frontmatter fields beyond the universal sextet.
 */
export type CollectionShape = 'entity-as-folder' | 'dated-stream' | 'flat-topic';

export interface CollectionDef {
	name: string;
	shape: CollectionShape;
	canonical_filename: string; // e.g. 'entity.md', 'contact.md', or '' for dated-stream
	required_fields: string[];
	description: string;
}

/**
 * Triage shape returned by wiki.search.
 * Frontmatter + excerpt + signed URL — no body. Keeps the LLM's context lean.
 */
export interface WikiTriageHit {
	collection: string;
	slug: string;
	score: number;
	matched_by: 'fts' | 'vector' | 'fused';
	frontmatter: Record<string, unknown>;
	excerpt: string; // 300 chars max around the match
	signed_url: string; // tokenised URL to fetch the full body
}

/**
 * Full read shape.
 */
export interface WikiReadResult {
	collection: string;
	slug: string;
	frontmatter: UniversalSextet & Record<string, unknown>;
	body: string;
	r2_key: string;
	updated_at: string;
}

/**
 * MCP tool input/output types.
 */
export interface WikiCreateInput {
	collection?: string; // if absent, sampling-based classification picks one
	slug?: string; // if absent, derived from frontmatter.slug or title
	frontmatter: Record<string, unknown>;
	body: string;
}

export interface WikiUpdateInput {
	collection: string;
	slug: string;
	frontmatter_patch?: Record<string, unknown>; // merged in
	body?: string; // full replace if present
	last_change_summary: string;
}

export interface WikiSearchInput {
	query: string;
	collections?: string[];
	limit?: number; // default 10, max 50
	expanded?: boolean; // default false; when true, returns full bodies
}

export interface WikiListCollectionsResult {
	collections: CollectionDef[];
}

export interface WikiRegisterCollectionInput {
	name: string;
	shape: CollectionShape;
	canonical_filename: string;
	required_fields: string[];
	description: string;
}

/**
 * Errors surfaced to the MCP layer.
 */
export class WikiError extends Error {
	constructor(
		public readonly code: WikiErrorCode,
		message: string,
		public readonly details?: unknown
	) {
		super(message);
		this.name = 'WikiError';
	}
}

export type WikiErrorCode =
	| 'not_found'
	| 'already_exists'
	| 'invalid_collection'
	| 'invalid_frontmatter'
	| 'invalid_slug'
	| 'unauthorised'
	| 'internal';

/**
 * Default collections — the 10 universal collections that ship with every Office Town deployment.
 * Pack-specific collections (e.g. 'websites' from pack-hosting) are added via register_collection.
 */
export const DEFAULT_COLLECTIONS: CollectionDef[] = [
	{
		name: 'business',
		shape: 'flat-topic',
		canonical_filename: '',
		required_fields: ['name'],
		description: 'The business this town serves — identity, ABN, HQ, timezone',
	},
	{
		name: 'owner',
		shape: 'flat-topic',
		canonical_filename: '',
		required_fields: [],
		description: "Principal user's voice, rhythm, bio",
	},
	{
		name: 'team',
		shape: 'entity-as-folder',
		canonical_filename: 'profile.md',
		required_fields: ['name'],
		description: 'Humans + agents on the team',
	},
	{
		name: 'contacts',
		shape: 'entity-as-folder',
		canonical_filename: 'contact.md',
		required_fields: ['name'],
		description: 'External people we interact with',
	},
	{
		name: 'orgs',
		shape: 'entity-as-folder',
		canonical_filename: 'entity.md',
		required_fields: ['name', 'entity_type'],
		description: 'External organisations — clients, prospects, vendors, partners, competitors',
	},
	{
		name: 'projects',
		shape: 'entity-as-folder',
		canonical_filename: 'project.md',
		required_fields: ['name'],
		description: 'Active and historical projects',
	},
	{
		name: 'decisions',
		shape: 'entity-as-folder',
		canonical_filename: 'decision.md',
		required_fields: ['title'],
		description: 'Decisions made — with rationale and date',
	},
	{
		name: 'knowledge',
		shape: 'entity-as-folder',
		canonical_filename: 'concept.md',
		required_fields: ['title'],
		description: 'Curated knowledge concepts — patterns, conventions, references',
	},
	{
		name: 'research',
		shape: 'dated-stream',
		canonical_filename: '',
		required_fields: ['title'],
		description: 'Time-stamped investigations, scout findings worth keeping',
	},
	{
		name: 'feedback',
		shape: 'dated-stream',
		canonical_filename: '',
		required_fields: ['title'],
		description: 'User feedback, escalations, retros',
	},
	{
		name: 'tasks',
		shape: 'entity-as-folder',
		canonical_filename: 'task.md',
		required_fields: ['title'],
		description:
			'Tasks, todos, and in-flight work items — surfaced on the kanban dashboard by frontmatter.status',
	},
];

/**
 * Validate a slug — lowercase alphanumeric + hyphens, 1-100 chars.
 */
export function isValidSlug(slug: string): boolean {
	return /^[a-z0-9][a-z0-9-]{0,99}$/.test(slug);
}

/**
 * Derive an R2 key from collection + slug + collection shape.
 */
export function r2KeyFor(collection: CollectionDef, slug: string, datedTopic?: string): string {
	if (collection.shape === 'entity-as-folder') {
		return `wiki/${collection.name}/${slug}/${collection.canonical_filename}`;
	}
	if (collection.shape === 'dated-stream') {
		// slug is the date (YYYY-MM-DD); datedTopic is the topic suffix
		const topic = datedTopic ? `-${datedTopic}` : '';
		return `wiki/${collection.name}/${slug}${topic}.md`;
	}
	// flat-topic
	return `wiki/${collection.name}/${slug}.md`;
}
