// Town-view dashboard — the "Office Town as a place" landing page.
//
// Renders the 10 collection-buildings as a town map, with status badges
// + count badges + pulse animation on active buildings, plus a "Town
// Clock" activity log below pulled from wiki_audit + cron_runs.
//
// Returns a self-contained HTML page (own <html><head><body>), bypassing
// the existing LAYOUT so this page can use the warm earth palette
// without affecting sub-pages.

import type { Env } from '../types';

interface BuildingDef {
	collection: string; // matches wiki_collections.name
	name: string; // display name (Library, Workshop, etc.)
	label: string; // small mono label under the name
	sprite: string; // SVG markup (children of the outer <svg>)
}

const BUILDINGS: BuildingDef[] = [
	{
		collection: 'knowledge',
		name: 'Library',
		label: 'knowledge',
		sprite: `
			<rect x="12" y="14" width="40" height="9" rx="1"/>
			<line x1="20" y1="17" x2="20" y2="20"/>
			<line x1="32" y1="17" x2="32" y2="20"/>
			<line x1="44" y1="17" x2="44" y2="20"/>
			<rect x="10" y="25" width="44" height="9" rx="1"/>
			<line x1="18" y1="28" x2="18" y2="31"/>
			<line x1="28" y1="28" x2="28" y2="31"/>
			<line x1="42" y1="28" x2="42" y2="31"/>
			<rect x="13" y="36" width="38" height="9" rx="1"/>
			<line x1="22" y1="39" x2="22" y2="42"/>
			<line x1="34" y1="39" x2="34" y2="42"/>
			<line x1="44" y1="39" x2="44" y2="42"/>
			<line class="ground" x1="8" y1="49" x2="56" y2="49"/>`,
	},
	{
		collection: 'decisions',
		name: 'Records Hall',
		label: 'decisions',
		sprite: `
			<polygon points="14,22 32,12 50,22"/>
			<line x1="14" y1="22" x2="50" y2="22"/>
			<line x1="18" y1="22" x2="18" y2="46"/>
			<line x1="26" y1="22" x2="26" y2="46"/>
			<line x1="38" y1="22" x2="38" y2="46"/>
			<line x1="46" y1="22" x2="46" y2="46"/>
			<line x1="12" y1="48" x2="52" y2="48"/>
			<line class="ground" x1="10" y1="52" x2="54" y2="52"/>`,
	},
	{
		collection: 'projects',
		name: 'Workshop',
		label: 'projects',
		sprite: `
			<path d="M10,30 L32,14 L54,30 L54,48 L10,48 Z"/>
			<rect x="40" y="18" width="6" height="8"/>
			<path d="M41 14 Q40 12 42 10 Q44 12 43 14" opacity="0.5"/>
			<path d="M44 12 Q43 10 45 8 Q47 10 46 12" opacity="0.4"/>
			<line x1="28" y1="36" x2="36" y2="36"/>
			<line x1="28" y1="36" x2="28" y2="48"/>
			<line x1="36" y1="36" x2="36" y2="48"/>
			<rect x="16" y="36" width="6" height="6"/>
			<line class="ground" x1="6" y1="51" x2="58" y2="51"/>`,
	},
	{
		collection: 'orgs',
		name: 'Town Square',
		label: 'orgs',
		sprite: `
			<rect x="22" y="18" width="20" height="28"/>
			<polygon points="20,18 32,8 44,18"/>
			<circle cx="32" cy="28" r="6"/>
			<line x1="32" y1="24" x2="32" y2="28"/>
			<line x1="32" y1="28" x2="35" y2="30"/>
			<rect x="27" y="38" width="10" height="8"/>
			<line class="ground" x1="14" y1="49" x2="50" y2="49"/>`,
	},
	{
		collection: 'contacts',
		name: 'Coffee House',
		label: 'contacts',
		sprite: `
			<path d="M16 22 Q14 20 14 18 Q14 14 18 14 L18 22 M18 22 Q16 20 16 18" opacity="0.45"/>
			<path d="M22 26 Q20 23 20 21 Q20 18 23 18" opacity="0.45"/>
			<path d="M28 24 Q26 22 26 20 Q26 17 29 17" opacity="0.45"/>
			<path d="M18 28 L18 42 Q18 48 24 48 L40 48 Q46 48 46 42 L46 28 Z"/>
			<path d="M46 30 Q52 30 52 36 Q52 42 46 42"/>
			<rect x="22" y="34" width="4" height="4"/>
			<rect x="36" y="34" width="4" height="4"/>
			<line class="ground" x1="14" y1="51" x2="50" y2="51"/>`,
	},
	{
		collection: 'team',
		name: 'Guildhall',
		label: 'team',
		sprite: `
			<path d="M16 16 L48 16 L48 30 Q48 44 32 50 Q16 44 16 30 Z"/>
			<line x1="22" y1="22" x2="42" y2="22"/>
			<circle cx="26" cy="32" r="2"/>
			<circle cx="32" cy="32" r="2"/>
			<circle cx="38" cy="32" r="2"/>
			<path d="M26 38 Q32 42 38 38"/>
			<line class="ground" x1="12" y1="53" x2="52" y2="53"/>`,
	},
	{
		collection: 'feedback',
		name: 'Post Office',
		label: 'feedback',
		sprite: `
			<rect x="14" y="22" width="36" height="24"/>
			<path d="M14 22 L32 36 L50 22"/>
			<rect x="44" y="14" width="4" height="10"/>
			<rect x="46" y="14" width="6" height="4" fill="currentColor" fill-opacity="0.2"/>
			<line class="ground" x1="10" y1="49" x2="54" y2="49"/>`,
	},
	{
		collection: 'research',
		name: 'Archive',
		label: 'research',
		sprite: `
			<rect x="12" y="14" width="40" height="32"/>
			<line x1="12" y1="22" x2="52" y2="22"/>
			<line x1="12" y1="30" x2="52" y2="30"/>
			<line x1="12" y1="38" x2="52" y2="38"/>
			<line x1="18" y1="14" x2="18" y2="46"/>
			<line x1="24" y1="14" x2="24" y2="46"/>
			<line x1="32" y1="14" x2="32" y2="46"/>
			<line x1="40" y1="14" x2="40" y2="46"/>
			<line x1="46" y1="14" x2="46" y2="46"/>
			<line class="ground" x1="8" y1="49" x2="56" y2="49"/>`,
	},
	{
		collection: 'tasks',
		name: 'Workshop Yard',
		label: 'tasks',
		sprite: `
			<rect x="12" y="32" width="18" height="14"/>
			<line x1="21" y1="32" x2="21" y2="46"/>
			<line x1="12" y1="39" x2="30" y2="39"/>
			<rect x="32" y="32" width="18" height="14"/>
			<line x1="41" y1="32" x2="41" y2="46"/>
			<line x1="32" y1="39" x2="50" y2="39"/>
			<rect x="22" y="18" width="18" height="14"/>
			<line x1="31" y1="18" x2="31" y2="32"/>
			<line x1="22" y1="25" x2="40" y2="25"/>
			<line class="ground" x1="8" y1="49" x2="54" y2="49"/>`,
	},
	{
		collection: 'owner',
		name: "Mayor's House",
		label: 'owner',
		sprite: `
			<path d="M12 32 L32 16 L52 32 L52 48 L12 48 Z"/>
			<rect x="40" y="18" width="5" height="7"/>
			<path d="M41 16 Q41 14 43 13" opacity="0.4"/>
			<rect x="26" y="34" width="12" height="14"/>
			<circle cx="32" cy="42" r="1.2" fill="currentColor"/>
			<rect x="16" y="34" width="6" height="6"/>
			<rect x="42" y="34" width="6" height="6"/>
			<line class="ground" x1="8" y1="51" x2="56" y2="51"/>`,
	},
	{
		collection: 'business',
		name: 'Charter Hall',
		label: 'business',
		sprite: `
			<rect x="14" y="20" width="36" height="28"/>
			<polygon points="12,20 32,8 52,20"/>
			<line x1="22" y1="28" x2="42" y2="28"/>
			<line x1="22" y1="34" x2="42" y2="34"/>
			<rect x="29" y="38" width="6" height="10"/>
			<line class="ground" x1="10" y1="51" x2="54" y2="51"/>`,
	},
];

interface BuildingStats {
	count: number;
	active_recent: boolean; // any audit row in this collection in last 10 min
	new_count: number; // entries created in last 24h
}

interface ActivityRow {
	ts: number;
	agent_slug: string | null;
	action: string;
	collection: string;
	slug: string;
	why: string;
}

interface CronRunRow {
	job_slug: string;
	job_title: string;
	started_at: string;
	status: string;
}

interface TownStats {
	total_entries: number;
	per_building: Map<string, BuildingStats>;
	activities: ActivityRow[];
	cron_runs: CronRunRow[];
	bearer_set: boolean;
}

// Pull all stats in one batched query pass.
export async function loadTownStats(env: Env): Promise<TownStats> {
	const tenMinAgo = Date.now() - 10 * 60 * 1000;
	const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

	const [countsRes, activeRes, newRes, activityRes, cronRunsRes] = await Promise.all([
		env.DB.prepare(
			`SELECT collection, COUNT(*) AS n FROM wiki_entries
       WHERE status != 'deleted' GROUP BY collection`,
		).all<{ collection: string; n: number }>(),
		env.DB.prepare(
			`SELECT DISTINCT collection FROM wiki_audit WHERE ts > ?`,
		)
			.bind(tenMinAgo)
			.all<{ collection: string }>(),
		env.DB.prepare(
			`SELECT collection, COUNT(*) AS n FROM wiki_entries
       WHERE strftime('%s', created_at) > ?
       GROUP BY collection`,
		)
			.bind(String(oneDayAgo))
			.all<{ collection: string; n: number }>(),
		env.DB.prepare(
			`SELECT ts, agent_slug, action, collection, slug, why FROM wiki_audit
       ORDER BY ts DESC LIMIT 8`,
		).all<ActivityRow>(),
		env.DB.prepare(
			`SELECT j.slug AS job_slug, j.title AS job_title, r.started_at, r.status
       FROM cron_runs r JOIN cron_jobs j ON r.job_id = j.id
       ORDER BY r.started_at DESC LIMIT 5`,
		).all<CronRunRow>(),
	]);

	const counts = new Map<string, number>();
	for (const row of countsRes.results ?? []) counts.set(row.collection, row.n);

	const activeSet = new Set<string>();
	for (const row of activeRes.results ?? []) activeSet.add(row.collection);

	const newCounts = new Map<string, number>();
	for (const row of newRes.results ?? []) newCounts.set(row.collection, row.n);

	const per_building = new Map<string, BuildingStats>();
	let total_entries = 0;
	for (const b of BUILDINGS) {
		const count = counts.get(b.collection) ?? 0;
		per_building.set(b.collection, {
			count,
			active_recent: activeSet.has(b.collection),
			new_count: newCounts.get(b.collection) ?? 0,
		});
		total_entries += count;
	}

	return {
		total_entries,
		per_building,
		activities: activityRes.results ?? [],
		cron_runs: cronRunsRes.results ?? [],
		bearer_set: true, // refined at call-site if needed
	};
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function relativeTime(ts: number): string {
	const now = Date.now();
	const delta = Math.floor((now - ts) / 1000);
	if (delta < 60) return `${delta}s ago`;
	if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
	if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
	return `${Math.floor(delta / 86400)}d ago`;
}

function dotClass(stats: BuildingStats): string {
	if (stats.active_recent || stats.new_count > 0) return 'dot--amber';
	if (stats.count > 0) return 'dot--green';
	return 'dot--faint';
}

function buildingTile(b: BuildingDef, stats: BuildingStats): string {
	const activeClass = stats.active_recent ? 'building active' : 'building';
	const badge =
		stats.new_count > 0
			? `<span class="count-badge">${stats.new_count}</span>`
			: '';
	const statusText =
		stats.count > 0
			? stats.new_count > 0
				? `${stats.count} entries · ${stats.new_count} new`
				: `${stats.count} entries`
			: 'empty';

	return `<a class="${activeClass}" href="/dashboard/wiki?c=${escapeHtml(b.collection)}">
		${badge}
		<svg class="sprite" viewBox="0 0 64 64">${b.sprite}</svg>
		<div class="name">${escapeHtml(b.name)}</div>
		<div class="label">${escapeHtml(b.label)}</div>
		<div class="status"><span class="dot ${dotClass(stats)}"></span> ${statusText}</div>
	</a>`;
}

function townMapHtml(stats: TownStats): string {
	return BUILDINGS.map((b) =>
		buildingTile(b, stats.per_building.get(b.collection) ?? { count: 0, active_recent: false, new_count: 0 }),
	).join('');
}

function townClockHtml(stats: TownStats): string {
	// Merge activities + cron_runs into a single chronological stream.
	const events: Array<{ ts: number; who: string; what: string }> = [];

	for (const a of stats.activities) {
		const slug = `${a.collection}/${a.slug}`;
		events.push({
			ts: a.ts,
			who: a.agent_slug ?? 'unknown',
			what: `${escapeHtml(a.action)} <code>${escapeHtml(slug)}</code> — ${escapeHtml(a.why)}`,
		});
	}

	for (const r of stats.cron_runs) {
		const ts = new Date(r.started_at).getTime();
		const statusTag =
			r.status === 'success'
				? '✓ ok'
				: r.status === 'error'
					? '✗ failed'
					: r.status;
		events.push({
			ts,
			who: r.job_slug,
			what: `cron <strong>${escapeHtml(r.job_title)}</strong> — ${statusTag}`,
		});
	}

	events.sort((a, b) => b.ts - a.ts);
	const top = events.slice(0, 10);

	if (top.length === 0) {
		return `<li class="muted">No activity yet. Wire your Goose at <a href="/dashboard/connect">/dashboard/connect</a>, write your first entry, watch this fill up.</li>`;
	}

	return top
		.map(
			(e) =>
				`<li><span class="time">${relativeTime(e.ts)}</span><span class="who">${escapeHtml(e.who)}</span><span class="what">${e.what}</span></li>`,
		)
		.join('');
}

// The town-specific palette + CSS — additive layer on top of the existing
// LAYOUT styles. Loaded only on the town view.
const TOWN_CSS = `
:root {
  --bg:           #f7f3e8;
  --bg-warmer:    #efe9d8;
  --ink:          #2a2520;
  --ink-soft:     #5a4f44;
  --ink-faint:    #8a7e6f;
  --accent:       #c25e4f;
  --accent-deep:  #8c4035;
  --rule:         #d8cdb4;
  --green:        #4a7a3d;
  --amber:        #b87333;
  --red:          #a83a2c;
  --building-stroke: #3a2f24;
  --building-fill:   #fffdf5;
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: 'Iowan Old Style', 'Hoefler Text', Constantia, 'Lucida Bright', Georgia, serif;
  font-size: 15px;
  line-height: 1.5;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(rgba(60,40,20,0.025) 1px, transparent 1px),
    radial-gradient(rgba(60,40,20,0.018) 1px, transparent 1px);
  background-size: 17px 17px, 31px 31px;
  background-position: 0 0, 13px 7px;
  z-index: 0;
}

header {
  background: transparent;
  border-bottom: 1px solid var(--rule);
  position: relative;
  z-index: 1;
}

header h1 {
  font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif;
  font-weight: 600;
  letter-spacing: 0.04em;
}

main {
  position: relative;
  z-index: 1;
  max-width: 1080px;
}

.town-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 1rem;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.town-header h1 {
  margin: 0;
  font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif;
  font-weight: 600;
  font-size: 1.85rem;
  letter-spacing: 0.04em;
  color: var(--ink);
}

.town-header .sub {
  font-weight: 400;
  color: var(--ink-soft);
  font-size: 0.9rem;
  letter-spacing: 0;
  margin-left: 0.5rem;
}

.town-clock-mini {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.town-map {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem 1.5rem;
  margin-bottom: 3rem;
}

@media (max-width: 760px) {
  .town-map { grid-template-columns: repeat(2, 1fr); }
}

.building {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  text-decoration: none;
  color: inherit;
  padding: 1.25rem 0.75rem 1rem;
  background: var(--building-fill);
  border: 1px solid var(--rule);
  border-radius: 8px;
  position: relative;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.building:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(60,40,20,0.08);
  border-color: var(--accent);
}

.building:nth-child(odd)  { transform: translateY(2px); }
.building:nth-child(even) { transform: translateY(-2px); }
.building:hover:nth-child(odd)  { transform: translateY(0); }
.building:hover:nth-child(even) { transform: translateY(-4px); }

.building svg.sprite {
  width: 56px;
  height: 56px;
  color: var(--building-stroke);
  margin-bottom: 0.65rem;
}

.sprite {
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.sprite .ground {
  stroke: var(--ink-faint);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  opacity: 0.5;
}

.building .name {
  font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif;
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: 0.02em;
  color: var(--ink);
  margin-bottom: 0.25rem;
}

.building .label {
  font-size: 0.78rem;
  color: var(--ink-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 0.6rem;
}

.building .status {
  font-size: 0.82rem;
  color: var(--ink-soft);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.building .status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.dot--green { background: var(--green); }
.dot--amber { background: var(--amber); }
.dot--red   { background: var(--red); }
.dot--faint { background: var(--rule); }

.building.active::after {
  content: '';
  position: absolute;
  top: 10px;
  right: 10px;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  animation: town-pulse 2s ease-in-out infinite;
}

@keyframes town-pulse {
  0%, 100% { opacity: 0.4; box-shadow: 0 0 0 0 var(--accent); }
  50%      { opacity: 1.0; box-shadow: 0 0 0 6px transparent; }
}

.building .count-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--accent);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 9px;
  font-family: ui-monospace, monospace;
  min-width: 18px;
  text-align: center;
}

.town-clock {
  background: var(--bg-warmer);
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
}

.town-clock h2 {
  margin: 0 0 0.75rem;
  font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif;
  font-weight: 600;
  font-size: 1.1rem;
  letter-spacing: 0.03em;
  color: var(--ink);
}

.activity-log {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.83rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.activity-log li {
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--rule);
  display: grid;
  grid-template-columns: 80px 130px 1fr;
  gap: 0.75rem;
  align-items: baseline;
}

@media (max-width: 760px) {
  .activity-log li {
    grid-template-columns: 80px 1fr;
    grid-template-rows: auto auto;
  }
  .activity-log li .what { grid-column: 1 / -1; }
}

.activity-log li:last-child { border-bottom: 0; }
.activity-log .time { color: var(--ink-faint); white-space: nowrap; }
.activity-log .who  { color: var(--accent-deep); font-weight: 600; white-space: nowrap; }
.activity-log .what { color: var(--ink-soft); }
.activity-log .what code {
  background: rgba(60,40,20,0.05);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.95em;
}

.town-foot {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--rule);
  font-size: 0.78rem;
  color: var(--ink-faint);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
}

.town-foot a {
  color: var(--accent-deep);
  text-decoration: none;
  border-bottom: 1px dotted var(--accent);
}

.town-foot a:hover { color: var(--accent); }

/* Override nav-link colour so it harmonises with the warm palette */
nav a { color: var(--accent-deep) !important; }
nav a:hover { color: var(--accent) !important; }

/* The empty-state callout still uses the accent colour but tuned warm */
.callout-warm {
  background: linear-gradient(180deg, #fbf3e9 0%, var(--building-fill) 100%);
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}
.callout-warm h2 {
  margin: 0 0 0.5rem;
  font-family: 'Trajan Pro', 'Optima', 'Palatino', Georgia, serif;
  font-size: 1.15rem;
}
.callout-warm .cta-btn {
  display: inline-block;
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 500;
}
`;

// Render the town view. Returns the complete HTML document (own layout).
// Falls back through the nav from the standard dashboard header so users
// can still get to other pages.
export function renderTownView(stats: TownStats, workerHost: string): string {
	const dateStr = new Intl.DateTimeFormat('en-AU', {
		weekday: 'long',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Australia/Sydney',
		hour12: false,
	}).format(new Date());

	const noEntriesYet = stats.total_entries === 0;
	const callout = noEntriesYet
		? `<div class="callout-warm">
			<h2>First time here? Wire your Goose.</h2>
			<p style="margin: 0.4rem 0;">Your town is empty. Connect your local Goose to this worker — one paste in a terminal wires all 6 MCPs and your buildings start filling up.</p>
			<a class="cta-btn" href="/dashboard/connect">Get the install script →</a>
		</div>`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town · Dashboard</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100vh; }
header { padding: 1rem 1.5rem; }
header h1 { margin: 0; font-size: 1.4rem; }
nav { display: flex; gap: 1rem; margin-top: 0.5rem; align-items: center; }
nav a { text-decoration: none; font-size: 0.9em; }
nav a:hover { text-decoration: underline; }
main { max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem; }
${TOWN_CSS}
</style>
</head>
<body>
<header>
  <h1>Office Town</h1>
  <nav>
    <a href="/">Town</a>
    <a href="/dashboard/wiki">Wiki</a>
    <a href="/dashboard/kanban">Kanban</a>
    <a href="/dashboard/cron">Routines</a>
    <a href="/dashboard/files">Files</a>
    <a href="/dashboard/published">Published</a>
    <a href="/dashboard/connect" style="margin-left: auto;">Connect Goose →</a>
    <a href="/dashboard/sign-out">Sign out</a>
  </nav>
</header>
<main>
  ${callout}
  <div class="town-header">
    <h1>Office Town <span class="sub">/ ${escapeHtml(workerHost)}</span></h1>
    <div class="town-clock-mini">${escapeHtml(dateStr)} AEST</div>
  </div>

  <section class="town-map" aria-label="Buildings">
    ${townMapHtml(stats)}
  </section>

  <section class="town-clock" aria-label="Town clock">
    <h2>Town Clock</h2>
    <ul class="activity-log">${townClockHtml(stats)}</ul>
  </section>

  <div class="town-foot">
    <span>${stats.total_entries} entries · ${stats.cron_runs.length} recent cycles · sync via <code>officetowd</code></span>
    <span>
      <a href="/dashboard/wire-domain">Custom domain</a> ·
      <a href="/dashboard/wire-sync">Local sync</a> ·
      <a href="/dashboard/wire-google-signin">Google sign-in</a>
    </span>
  </div>
</main>
</body>
</html>`;
}
