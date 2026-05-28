// Routing logic — given a dossier file, decide where it lands in the cortex.
//
// Two routing modes:
//   1. 1:1 mapping — a known filename routes to one cortex destination
//      (bio.md → wiki/owner/bio.md, business.md → wiki/business/<slug>/entity.md)
//   2. Splitting — people.md and projects.md contain multiple entities each;
//      we parse by H2 sections and fan out into per-entity entries.

import type { DossierFile, PlannedWrite, RouteKind } from './types';

// ---------- Filename → routing kind ----------

const OWNER_CASCADE_FILES = new Set([
	'bio.md',
	'voice.md',
	'rhythm.md',
	'expertise.md',
	'opinions.md',
	'values.md',
	'vocabulary.md',
	'tooling.md',
	'goals.md',
	'family.md',
]);

export function classifyFile(filename: string): RouteKind {
	const normalised = filename.toLowerCase().split('/').pop() ?? '';
	if (OWNER_CASCADE_FILES.has(normalised)) return 'owner';
	if (normalised === 'business.md' || normalised.startsWith('business-')) return 'business';
	if (normalised === 'people.md') return 'people-split';
	if (normalised === 'projects.md') return 'projects-split';
	if (normalised === 'unclear.md' || normalised === 'followups.md' || normalised === 'needs-followup.md') return 'followup';
	return 'raw';
}

// ---------- Slug derivation ----------

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.trim()
		.replace(/[''""`]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

// Extract H1 (# Title) from markdown body, stripping it from the content.
function extractH1(body: string): { title: string | null; remainder: string } {
	const lines = body.split('\n');
	for (let i = 0; i < Math.min(lines.length, 5); i++) {
		const m = lines[i].match(/^#\s+(.+?)\s*$/);
		if (m) {
			const remainder = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n');
			return { title: m[1].trim(), remainder: remainder.replace(/^\n+/, '') };
		}
	}
	return { title: null, remainder: body };
}

// ---------- 1:1 routers ----------

export function routeOwnerCascade(file: DossierFile): PlannedWrite {
	const filename = file.filename.toLowerCase().split('/').pop() ?? file.filename;
	const slug = filename.replace(/\.md$/, '');
	const { title, remainder } = extractH1(file.content);
	return {
		collection: 'owner',
		slug,
		r2_key: `wiki/owner/${slug}.md`,
		title: title ?? slug,
		body: remainder,
		source_filename: file.filename,
		classification: 'owner-cascade',
	};
}

export function routeBusiness(file: DossierFile): PlannedWrite {
	const { title, remainder } = extractH1(file.content);
	// Look for "**<Business Name>**" or first bold or first capitalised proper noun
	// in body to derive slug; fall back to the H1.
	const boldMatch = remainder.match(/\*\*([^*]+)\*\*/);
	const baseName = boldMatch?.[1] ?? title ?? 'business';
	const slug = slugify(baseName);
	return {
		collection: 'business',
		slug,
		r2_key: `wiki/business/${slug}/entity.md`,
		title: title ?? baseName,
		body: remainder,
		source_filename: file.filename,
		classification: 'business-entity',
	};
}

export function routeFollowup(file: DossierFile): PlannedWrite {
	const { title, remainder } = extractH1(file.content);
	return {
		collection: 'inbox',
		slug: 'onboarding-needs-followup',
		r2_key: 'wiki/inbox/onboarding/needs-followup.md',
		title: title ?? 'Onboarding — needs follow-up',
		body: remainder,
		source_filename: file.filename,
		classification: 'followup-queue',
	};
}

export function routeRaw(file: DossierFile): PlannedWrite {
	const filename = file.filename.toLowerCase().split('/').pop() ?? file.filename;
	const slug = slugify(filename.replace(/\.md$/, '')) || 'unknown';
	return {
		collection: 'raw',
		slug,
		r2_key: `wiki/raw/dossier-paste/${slug}.md`,
		title: filename,
		body: file.content,
		source_filename: file.filename,
		classification: 'raw-dossier-fragment',
	};
}

// ---------- H2 splitters for people.md + projects.md ----------

interface H2Section {
	heading: string;
	body: string;
}

// Parse a markdown body into H2-delimited sections. Content before the first H2
// becomes a "preamble" with heading "". Each H2 starts a new section.
function splitByH2(body: string): { preamble: string; sections: H2Section[] } {
	const lines = body.split('\n');
	const sections: H2Section[] = [];
	let preamble: string[] = [];
	let current: H2Section | null = null;

	for (const line of lines) {
		const m = line.match(/^##\s+(.+?)\s*$/);
		if (m) {
			if (current) sections.push(current);
			current = { heading: m[1].trim(), body: '' };
		} else if (current) {
			current.body += line + '\n';
		} else {
			preamble.push(line);
		}
	}
	if (current) sections.push(current);

	for (const s of sections) {
		s.body = s.body.trim();
	}

	return { preamble: preamble.join('\n').trim(), sections };
}

// Inside a section like "## Family", each H3 (### Pip Sidaway) or bolded line
// (**Sarah Smith** — ...) is one entity.
function splitSectionIntoEntities(sectionBody: string): Array<{ name: string; body: string }> {
	const lines = sectionBody.split('\n');
	const entities: Array<{ name: string; body: string }> = [];
	let current: { name: string; body: string } | null = null;

	for (const line of lines) {
		// H3: "### Name"
		const h3 = line.match(/^###\s+(.+?)\s*$/);
		// Bold-led bullet: "- **Name** — ..." or "- **Name**:"
		const boldBullet = line.match(/^-\s+\*\*([^*]+)\*\*\s*[—\-:]?\s*(.*)$/);
		// Plain bullet line: "- Name — ..." (no bold; less common)
		const plainBullet = line.match(/^-\s+([A-Z][A-Za-z'.\s]+?)\s*[—\-:]\s*(.+)$/);

		if (h3) {
			if (current) entities.push(current);
			current = { name: h3[1].trim(), body: '' };
		} else if (boldBullet) {
			if (current) entities.push(current);
			current = { name: boldBullet[1].trim(), body: boldBullet[2].trim() };
		} else if (plainBullet && plainBullet[1].length < 40) {
			if (current) entities.push(current);
			current = { name: plainBullet[1].trim(), body: plainBullet[2].trim() };
		} else if (current) {
			current.body += '\n' + line;
		}
	}
	if (current) entities.push(current);

	// Trim + filter out empty
	return entities
		.map((e) => ({ name: e.name, body: e.body.trim() }))
		.filter((e) => e.name && e.name.length > 1 && e.name.length < 80);
}

// Map a section heading to a target collection.
function peopleSectionToCollection(heading: string): 'contacts' | 'team' | 'orgs' | null {
	const h = heading.toLowerCase();
	if (h.includes('family') || h.includes('household') || h.includes('personal')) return 'contacts';
	if (h.includes('team') || h.includes('employee') || h.includes('staff') || h.includes('crew')) return 'team';
	if (h.includes('virtual') || h.includes('ai') || h.includes('agents')) return 'team';
	if (h.includes('client') || h.includes('vendor') || h.includes('partner') || h.includes('contact')) return 'contacts';
	if (h.includes('external') || h.includes('professional')) return 'contacts';
	if (h.includes('health') || h.includes('fitness') || h.includes('service')) return 'contacts';
	if (h.includes('community') || h.includes('membership') || h.includes('organisations')) return 'orgs';
	return 'contacts'; // default
}

export function routePeopleSplit(file: DossierFile): PlannedWrite[] {
	const { remainder } = extractH1(file.content);
	const { sections } = splitByH2(remainder);
	const writes: PlannedWrite[] = [];

	for (const section of sections) {
		const collection = peopleSectionToCollection(section.heading);
		if (!collection) continue;

		const entities = splitSectionIntoEntities(section.body);
		for (const entity of entities) {
			const slug = slugify(entity.name);
			if (!slug) continue;

			// Build a minimal entry body
			const bodyMarkdown = `## About\n\n${entity.body || `${entity.name} — captured from dossier ${section.heading} section.`}\n\n## Source\n\nImported from \`${file.filename}\` § ${section.heading} during onboarding setup.\n`;

			writes.push({
				collection,
				slug,
				r2_key:
					collection === 'team'
						? `wiki/team/${slug}/profile.md`
						: collection === 'orgs'
							? `wiki/orgs/${slug}/entity.md`
							: `wiki/contacts/${slug}/contact.md`,
				title: entity.name,
				body: bodyMarkdown,
				source_filename: file.filename,
				classification: `${collection}-from-people-split § ${section.heading}`,
			});
		}
	}

	return writes;
}

// Parse projects.md — H2 sections are project-status buckets; H3 (or bold-led
// bullet) within each section is a single project.
export function routeProjectsSplit(file: DossierFile): PlannedWrite[] {
	const { remainder } = extractH1(file.content);
	const { sections } = splitByH2(remainder);
	const writes: PlannedWrite[] = [];

	for (const section of sections) {
		const stage = projectSectionToStage(section.heading);
		const entities = splitSectionIntoEntities(section.body);

		for (const entity of entities) {
			const slug = slugify(entity.name);
			if (!slug) continue;

			const bodyMarkdown = `## About\n\n${entity.body || `${entity.name} — captured from dossier ${section.heading} section.`}\n\n## Stage\n\n\`stage: ${stage}\` — sourced from ${section.heading}.\n\n## Source\n\nImported from \`${file.filename}\` during onboarding setup.\n`;

			writes.push({
				collection: 'projects',
				slug,
				r2_key: `wiki/projects/${slug}/project.md`,
				title: entity.name,
				body: bodyMarkdown,
				source_filename: file.filename,
				classification: `project § ${section.heading} → stage: ${stage}`,
			});
		}
	}

	return writes;
}

function projectSectionToStage(heading: string): string {
	const h = heading.toLowerCase();
	if (h.includes('active') || h.includes('ongoing') || h.includes('current')) return 'active';
	if (h.includes('archived') || h.includes('archive')) return 'archived';
	if (h.includes('adjacent') || h.includes('recently built') || h.includes('exploring')) return 'exploring';
	if (h.includes('blocker') || h.includes('open thread')) return 'active';
	if (h.includes('personal')) return 'active';
	return 'active';
}

// ---------- Main dispatch ----------

export function routeFile(file: DossierFile): PlannedWrite[] {
	const kind = classifyFile(file.filename);
	switch (kind) {
		case 'owner':
			return [routeOwnerCascade(file)];
		case 'business':
			return [routeBusiness(file)];
		case 'people-split':
			return routePeopleSplit(file);
		case 'projects-split':
			return routeProjectsSplit(file);
		case 'followup':
			return [routeFollowup(file)];
		case 'raw':
			return [routeRaw(file)];
	}
}
