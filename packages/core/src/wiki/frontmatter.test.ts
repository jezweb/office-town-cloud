import { describe, expect, it } from 'vitest';
import { applySextectDefaults, parseMarkdown, renderMarkdown, validateUniversalSextet } from './frontmatter';

describe('parseMarkdown', () => {
	it('returns empty frontmatter and original body when no frontmatter delimiter', () => {
		const result = parseMarkdown('Just a body, no frontmatter\n');
		expect(result.frontmatter).toEqual({});
		expect(result.body).toBe('Just a body, no frontmatter\n');
	});

	it('parses frontmatter and body', () => {
		const md = `---
slug: hello
kind: knowledge
created: 2026-05-27
---

Body content here.`;
		const { frontmatter, body } = parseMarkdown(md);
		expect(frontmatter.slug).toBe('hello');
		expect(frontmatter.kind).toBe('knowledge');
		expect(body.trim()).toBe('Body content here.');
	});

	it('tolerates malformed YAML without throwing', () => {
		const md = `---
slug: hello
this is: not: valid: yaml: here
---

Body.`;
		const { frontmatter, body } = parseMarkdown(md);
		// Malformed YAML — empty frontmatter, original body
		expect(typeof frontmatter).toBe('object');
		expect(body.includes('Body.')).toBe(true);
	});
});

describe('renderMarkdown', () => {
	it('round-trips through parseMarkdown', () => {
		const original = {
			frontmatter: { slug: 'test', kind: 'knowledge', count: 42 },
			body: 'Hello world.\n\nSecond paragraph.',
		};
		const rendered = renderMarkdown(original.frontmatter, original.body);
		const parsed = parseMarkdown(rendered);
		expect(parsed.frontmatter.slug).toBe('test');
		expect(parsed.frontmatter.kind).toBe('knowledge');
		expect(parsed.frontmatter.count).toBe(42);
		expect(parsed.body.trim()).toBe(original.body.trim());
	});
});

describe('validateUniversalSextet', () => {
	it('returns missing fields', () => {
		const missing = validateUniversalSextet({ slug: 'x' });
		expect(missing).toContain('kind');
		expect(missing).toContain('created');
		expect(missing).toContain('last_updated');
		expect(missing).toContain('last_edited_by');
		expect(missing).toContain('last_change_summary');
	});

	it('returns empty when all present', () => {
		const result = validateUniversalSextet({
			slug: 'x',
			kind: 'k',
			created: '2026-05-27',
			last_updated: '2026-05-27',
			last_edited_by: 'me',
			last_change_summary: 'created',
		});
		expect(result).toEqual([]);
	});
});

describe('applySextectDefaults', () => {
	it('fills missing sextet fields', () => {
		const result = applySextectDefaults(
			{ title: 'Hello' },
			{ slug: 'hello-world', kind: 'knowledge', editor: 'librarian', summary: 'initial' }
		);
		expect(result.slug).toBe('hello-world');
		expect(result.kind).toBe('knowledge');
		expect(result.last_edited_by).toBe('librarian');
		expect(result.last_change_summary).toBe('initial');
		expect(result.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(result.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('preserves user-supplied created date', () => {
		const result = applySextectDefaults(
			{ created: '2024-01-01' },
			{ slug: 'x', kind: 'k', editor: 'e', summary: 's' }
		);
		expect(result.created).toBe('2024-01-01');
	});

	it('always overwrites last_updated and last_edited_by with current values', () => {
		const result = applySextectDefaults(
			{ last_updated: '2020-01-01', last_edited_by: 'old-user' },
			{ slug: 'x', kind: 'k', editor: 'new-editor', summary: 's' }
		);
		expect(result.last_edited_by).toBe('new-editor');
		expect(result.last_updated).not.toBe('2020-01-01');
	});
});
