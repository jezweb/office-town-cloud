// Vertical packs — a pack bundles {collections to register, apps to install} for
// a trade. Installing one = register its collections (so the cortex has the right
// folders) + add its apps to the installed-set (the daemon reconciles them onto
// the Apps page). Packs are pure data; install logic lives in install.ts.
//
// Apps reference existing CATALOG slugs (apps-api/routes.ts) — a pack never
// defines new app code, only which built apps a vertical wants. Collections use
// the three storage shapes (entity-as-folder / dated-stream / flat-topic) and
// reuse the universal defaults (orgs, contacts, tasks…) rather than duplicating.

import type { CollectionDef } from '../lib/shared';

export interface PackDef {
	slug: string;
	name: string;
	blurb: string; // one line for the catalogue
	collections: CollectionDef[];
	apps: string[]; // CATALOG slugs to add to the installed-set
}

// Reusable collection defs (an app/pack may share a collection — define once).
const C = {
	jobs: { name: 'jobs', shape: 'entity-as-folder', canonical_filename: 'job.md', required_fields: ['title'], description: 'Jobs — scope, site, materials, photos, status, next step' },
	sites: { name: 'sites', shape: 'entity-as-folder', canonical_filename: 'site.md', required_fields: ['name'], description: 'Sites / premises you work at — address, access notes, contacts' },
	priceList: { name: 'price-list', shape: 'flat-topic', canonical_filename: '', required_fields: [], description: 'Your standard rates and common line items' },
	engagements: { name: 'engagements', shape: 'entity-as-folder', canonical_filename: 'engagement.md', required_fields: ['title'], description: 'Client engagements — scope, fee basis, status, key dates' },
	deadlines: { name: 'deadlines', shape: 'dated-stream', canonical_filename: '', required_fields: ['title'], description: 'Compliance + lodgement deadlines (BAS, tax, super, ASIC)' },
	projects: { name: 'creative-projects', shape: 'entity-as-folder', canonical_filename: 'project.md', required_fields: ['title'], description: 'Creative projects — brief, deliverables, feedback rounds, status' },
	deliverables: { name: 'deliverables', shape: 'entity-as-folder', canonical_filename: 'deliverable.md', required_fields: ['title'], description: 'Work products — format, status, links, approvals' },
	properties: { name: 'properties', shape: 'entity-as-folder', canonical_filename: 'property.md', required_fields: ['name'], description: 'Websites / apps / hosting you manage — stack, URLs, renewals, health' },
	tickets: { name: 'tickets', shape: 'dated-stream', canonical_filename: '', required_fields: ['title'], description: 'Support requests + their resolution' },
	bookings: { name: 'bookings', shape: 'dated-stream', canonical_filename: '', required_fields: ['title'], description: 'Appointments / reservations / sessions' },
} satisfies Record<string, CollectionDef>;

export const PACKS: PackDef[] = [
	{
		slug: 'trades',
		name: 'Trades',
		blurb: 'For sparkies, plumbers, chippies — run sheet, on-site quoting, quote-to-cash, and a tool/equipment register.',
		collections: [C.jobs, C.sites, C.priceList],
		apps: ['office-town-run-sheet', 'office-town-onsite-quote', 'office-town-quote-to-cash', 'office-town-asset-register'],
	},
	{
		slug: 'professional-services',
		name: 'Professional services',
		blurb: 'For accountants, bookkeepers, consultants — compliance deadlines, a mini-CRM, a client-request tracker and a decision log.',
		collections: [C.engagements, C.deadlines],
		apps: ['office-town-compliance', 'office-town-mini-crm', 'office-town-support-tickets', 'office-town-decision-log'],
	},
	{
		slug: 'creative',
		name: 'Creative',
		blurb: 'For photographers, designers, studios — a booking calendar, deliverables tracker and a lead/project CRM.',
		collections: [C.projects, C.deliverables, C.bookings],
		apps: ['office-town-bookings', 'office-town-deliverables', 'office-town-mini-crm'],
	},
	{
		slug: 'web-agency',
		name: 'Web agency',
		blurb: 'Jezweb dogfood — a website/asset register with renewal countdowns, support tickets, deliverables and a decision log.',
		collections: [C.properties, C.tickets],
		apps: ['office-town-asset-register', 'office-town-support-tickets', 'office-town-deliverables', 'office-town-decision-log'],
	},
	{
		slug: 'bookings-services',
		name: 'Bookings & services',
		blurb: 'For any appointment business — salons, tutors, allied health, coaches: a booking calendar, mini-CRM and quoting.',
		collections: [C.bookings],
		apps: ['office-town-bookings', 'office-town-mini-crm', 'office-town-onsite-quote'],
	},
];

export function getPack(slug: string): PackDef | undefined {
	return PACKS.find((p) => p.slug === slug);
}
