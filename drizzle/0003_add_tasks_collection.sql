-- Add `tasks` as the 11th default collection — every team has tasks; the
-- kanban dashboard already filters wiki entries with `kind: task`. This
-- formalises the home for them.

INSERT OR IGNORE INTO wiki_collections (name, shape, canonical_filename, required_fields_json, description, created_at) VALUES
	('tasks', 'entity-as-folder', 'task.md', '["title"]', 'Tasks, todos, and in-flight work items — surfaced on the kanban dashboard by frontmatter.status', datetime('now'));
