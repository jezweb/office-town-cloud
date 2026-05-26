// Drizzle schema for Office Town Cloud D1 database.
//
// FTS5 virtual tables aren't directly modelled by Drizzle — they're created
// in a hand-written migration (drizzle/0001_fts5.sql) and queried via raw SQL.

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Wiki entries — the index over R2. R2 holds the canonical markdown body;
 * D1 holds frontmatter, search metadata, and the FTS index.
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
