// Setup module — types for the dossier-routing pipeline.

export interface DossierFile {
	filename: string; // e.g. "voice.md", "people.md"
	content: string; // raw markdown body, including any H1
}

export interface SetupRequest {
	files: DossierFile[];
	source?: string; // e.g. "claude" | "gemini" | "chatgpt" — for audit attribution
	dry_run?: boolean; // if true, return planned writes without applying
}

export type RouteKind =
	| 'owner' // bio.md, voice.md, rhythm.md, expertise.md, opinions.md, values.md, vocabulary.md
	| 'business' // business.md (single business entity)
	| 'people-split' // people.md → multiple contacts/team/orgs entries
	| 'projects-split' // projects.md → multiple project entries
	| 'followup' // unclear.md → inbox/onboarding/needs-followup.md
	| 'raw'; // anything we don't recognise → wiki/raw/dossier-paste/<filename>

export interface PlannedWrite {
	collection: string; // e.g. "owner", "business", "contacts", "projects"
	slug: string; // e.g. "bio", "jezweb", "sarah-smith"
	r2_key: string; // full R2 path
	title: string;
	body: string; // body markdown to write (with frontmatter prepended)
	source_filename: string; // which dossier file produced this write
	classification: string; // e.g. "owner-cascade", "team-member", "client-contact"
}

export interface SetupResult {
	ok: boolean;
	planned: PlannedWrite[]; // every write we planned
	applied: number; // how many actually landed
	skipped: number; // how many couldn't route
	errors: Array<{ filename: string; error: string }>;
	cortex_state_after?: string;
	summary: string; // one-paragraph human-readable summary
}
