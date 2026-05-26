// Frontmatter parsing + universal sextet validation.

import yaml from 'js-yaml';
import type { UniversalSextet } from '@office-town/shared';

const FRONTMATTER_DELIMITER = '---';

/**
 * Parse a markdown file (with optional YAML frontmatter) into frontmatter + body.
 * If no frontmatter is found, returns empty frontmatter and the original content as body.
 */
export function parseMarkdown(content: string): {
	frontmatter: Record<string, unknown>;
	body: string;
} {
	if (!content.startsWith(FRONTMATTER_DELIMITER)) {
		return { frontmatter: {}, body: content };
	}

	const endIndex = content.indexOf(`\n${FRONTMATTER_DELIMITER}`, FRONTMATTER_DELIMITER.length);
	if (endIndex === -1) {
		return { frontmatter: {}, body: content };
	}

	const yamlContent = content.slice(FRONTMATTER_DELIMITER.length, endIndex).trim();
	const body = content.slice(endIndex + FRONTMATTER_DELIMITER.length + 1).replace(/^\n/, '');

	try {
		const parsed = yaml.load(yamlContent);
		if (typeof parsed === 'object' && parsed !== null) {
			return { frontmatter: parsed as Record<string, unknown>, body };
		}
		return { frontmatter: {}, body };
	} catch {
		// Malformed YAML — return body unchanged, empty frontmatter.
		return { frontmatter: {}, body };
	}
}

/**
 * Render frontmatter + body back to a markdown file.
 */
export function renderMarkdown(frontmatter: Record<string, unknown>, body: string): string {
	const yamlContent = yaml.dump(frontmatter, { lineWidth: 100, noRefs: true }).trimEnd();
	return `---\n${yamlContent}\n---\n\n${body.replace(/^\n+/, '')}`;
}

/**
 * Validate that a frontmatter object has the universal sextet.
 * Returns the list of missing fields (empty array if valid).
 */
export function validateUniversalSextet(
	frontmatter: Record<string, unknown>
): string[] {
	const required: (keyof UniversalSextet)[] = [
		'slug',
		'kind',
		'created',
		'last_updated',
		'last_edited_by',
		'last_change_summary',
	];
	const missing: string[] = [];
	for (const field of required) {
		const value = frontmatter[field];
		if (value === undefined || value === null || value === '') {
			missing.push(field);
		}
	}
	return missing;
}

/**
 * Apply sensible defaults for the universal sextet, returning a new object.
 * Used on create so callers don't have to supply timestamps and edited-by.
 */
export function applySextectDefaults(
	frontmatter: Record<string, unknown>,
	context: { slug: string; kind: string; editor: string; summary: string }
): Record<string, unknown> {
	const today = new Date().toISOString().slice(0, 10);
	// Start from the caller's frontmatter (preserves user-supplied fields like `created`),
	// then forcibly overwrite the fields that must reflect this edit.
	return {
		slug: context.slug,
		kind: context.kind,
		created: today,
		...frontmatter,
		last_updated: today,
		last_edited_by: context.editor,
		last_change_summary: context.summary,
	};
}
