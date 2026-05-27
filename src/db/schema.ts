// Drizzle schema for Office Town Cloud D1 database.
//
// FTS5 virtual tables aren't directly modelled by Drizzle — they're created
// in a hand-written migration (drizzle/0001_fts5.sql) and queried via raw SQL.

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Wiki entries — the index over R2. R2 holds the canonical markdown body;
 * D1 holds frontmatter, search metadata, and the FTS index.
 *
 * Per MEMORY-COMPARISON.md design: every entry has a stable UUID and a
 * lifecycle status (active | archived | deleted) for soft-delete via archive.
 */
export const wikiEntries = sqliteTable('wiki_entries', {
	id: text('id').primaryKey(), // `${collection}:${slug}`
	collection: text('collection').notNull(),
	slug: text('slug').notNull(),
	r2_key: text('r2_key').notNull(),
	title: text('title'),
	frontmatter_json: text('frontmatter_json').notNull(),
	body: text('body').notNull(), // duplicated for fast read + FTS hydration
	body_hash: text('body_hash').notNull(),
	last_change_summary: text('last_change_summary'),
	last_edited_by: text('last_edited_by'),
	created_at: text('created_at').notNull(),
	updated_at: text('updated_at').notNull(),
	status: text('status').notNull().default('active'), // active | archived | deleted
	uuid: text('uuid'), // stable cross-rename id, set on create, immutable after
});

/**
 * Audit log — append-only record of every wiki mutation.
 * Required `why:` on every write/supersede/archive/delete per
 * MEMORY-COMPARISON.md design contract.
 */
export const wikiAudit = sqliteTable('wiki_audit', {
	audit_id: text('audit_id').primaryKey(),
	ts: integer('ts').notNull(), // unix ms
	action: text('action').notNull(), // write|update|supersede|archive|delete|restore|link|attach|detach
	collection: text('collection').notNull(),
	slug: text('slug').notNull(),
	entry_uuid: text('entry_uuid'),
	agent_slug: text('agent_slug'),
	session_id: text('session_id'),
	prev_hash: text('prev_hash'),
	new_hash: text('new_hash'),
	why: text('why').notNull(),
});

/**
 * Cross-references between wiki entries.
 * Used by wiki(action: link) and wiki(action: related).
 */
export const wikiLinks = sqliteTable('wiki_links', {
	link_id: text('link_id').primaryKey(),
	from_collection: text('from_collection').notNull(),
	from_slug: text('from_slug').notNull(),
	to_collection: text('to_collection').notNull(),
	to_slug: text('to_slug').notNull(),
	kind: text('kind'),
	why: text('why'),
	created_at: integer('created_at').notNull(),
});

/**
 * Non-markdown attachments — files associated with an entry (entity-as-folder shape).
 * The file itself lives in R2 alongside entity.md at wiki/<col>/<slug>/<filename>;
 * this table is the index of what attachments each entry has.
 */
export const wikiAttachments = sqliteTable('wiki_attachments', {
	attachment_id: text('attachment_id').primaryKey(),
	collection: text('collection').notNull(),
	slug: text('slug').notNull(),
	filename: text('filename').notNull(),
	r2_key: text('r2_key').notNull(),
	content_type: text('content_type'),
	size_bytes: integer('size_bytes'),
	uploaded_at: integer('uploaded_at').notNull(),
});

/**
 * Collection definitions — schema-on-the-side. Default 10 collections are
 * seeded by migration; new collections registered via register_collection.
 */
export const wikiCollections = sqliteTable('wiki_collections', {
	name: text('name').primaryKey(),
	shape: text('shape').notNull(), // entity-as-folder | dated-stream | flat-topic
	canonical_filename: text('canonical_filename').notNull(),
	required_fields_json: text('required_fields_json').notNull(),
	description: text('description').notNull(),
	created_at: text('created_at').notNull(),
});

/**
 * Vector index sidecar — track which entries have been embedded so we can
 * skip already-indexed entries on resync.
 */
export const wikiVectorIndex = sqliteTable('wiki_vector_index', {
	entry_id: text('entry_id').primaryKey(), // `${collection}:${slug}`
	vector_id: text('vector_id').notNull(),
	body_hash: text('body_hash').notNull(), // dedup against unchanged content
	indexed_at: text('indexed_at').notNull(),
});

/**
 * Better-auth tables — see drizzle/0002_better_auth.sql migration.
 * Not modelled here because better-auth manages its own schema; we just
 * declare bindings so wrangler picks them up.
 */
export const sessionLog = sqliteTable('session_log', {
	id: text('id').primaryKey(),
	user_id: text('user_id').notNull(),
	action: text('action').notNull(),
	target: text('target'),
	created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
});
