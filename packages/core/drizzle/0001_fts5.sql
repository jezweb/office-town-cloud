-- FTS5 virtual table over wiki_entries.
-- Drizzle can't model FTS5; this migration creates the virtual table and
-- the sync triggers that keep it aligned with wiki_entries.

CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
	id UNINDEXED,
	collection,
	slug,
	title,
	body,
	tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with wiki_entries.
CREATE TRIGGER IF NOT EXISTS wiki_entries_ai AFTER INSERT ON wiki_entries BEGIN
	INSERT INTO wiki_fts(id, collection, slug, title, body)
	VALUES (new.id, new.collection, new.slug, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS wiki_entries_ad AFTER DELETE ON wiki_entries BEGIN
	DELETE FROM wiki_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS wiki_entries_au AFTER UPDATE ON wiki_entries BEGIN
	DELETE FROM wiki_fts WHERE id = old.id;
	INSERT INTO wiki_fts(id, collection, slug, title, body)
	VALUES (new.id, new.collection, new.slug, new.title, new.body);
END;
