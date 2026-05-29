// Structural seed files — the cortex skeleton an agent + owner first meet.
//
// Unlike example-entries.ts (which seeds wiki_entries rows the dashboard
// renders), these are plain R2 objects: the cortex's AGENTS.md (the brain
// every Goose session reads from cwd), the human README, the inbox/ drop-zone
// intro + onboarding prompts, and a short _intro.md per wiki collection so the
// structure is self-documenting even when a collection is empty.
//
// Bucket routing mirrors the sync API (src/sync/routes.ts): keys prefixed
// `wiki/` live in env.WIKI, everything else (AGENTS.md, README.md, inbox/*)
// in env.FILES. officetowd syncs both buckets down to ~/OfficeTown/, so the
// folder mirrors R2 exactly.
//
// AGENTS.md is templated with the worker URL at install time. The reviewed
// source of this content is .jez/drafts/AGENTS.md.

import type { Env } from '../types';

export interface StructuralFile {
	key: string;
	content: string;
}

// Each wiki collection gets a short _intro.md: what lives here + the shape of
// an entry. Keeps the structure legible for a brand-new agent reading the
// filesystem, and gives the dashboard tree a label per building.
const COLLECTION_INTROS: Record<string, string> = {
	orgs: `# orgs — clients, prospects, vendors\n\nEvery organisation you deal with. One folder per org (\`<slug>/entity.md\`), with an engagement trace of interactions and links to the contacts who work there.\n\nAsk an agent to "capture <company name>" and it'll start one here.`,
	contacts: `# contacts — the humans you work with\n\nPeople: clients, colleagues, suppliers, anyone who matters. One folder per person (\`<slug>/contact.md\`), linked to the org they belong to and the projects they touch.`,
	projects: `# projects — active and historical work\n\nWhat you're working on, and what you've finished. One folder per project (\`<slug>/project.md\`) with status, the people involved, and the decisions made along the way.`,
	decisions: `# decisions — why you chose X\n\nThe reasoning behind choices worth remembering, so future-you (and the agents) don't relitigate settled questions. One file per decision, dated.`,
	knowledge: `# knowledge — graduated findings\n\nThings worth keeping: how-tos, hard-won lessons, reference material, and the docs explaining how Office Town itself works. The library the whole team draws on.`,
	owner: `# owner — your voice, rhythm, and preferences\n\nWho you are and how you like to work — so agents write in your voice and respect your rhythm. Often thin at first; fill it by dropping a dossier in \`inbox/\` or letting an agent interview you.`,
	team: `# team — humans and agent profiles\n\nThe people on your team and the agent roles working your cortex (boss, librarian, worker, scout, plus any pack specialists).`,
	business: `# business — who you are\n\nYour business itself: what it does, who it serves, how it's positioned. The backdrop every agent reads to understand the work.`,
	tasks: `# tasks — open, in flight, done\n\nDiscrete units of work the team is tracking. Lighter than a project — the things to actually get done.`,
	feedback: `# feedback — what's working, what isn't\n\nNotes on how the cortex and the agents are performing, and friction worth fixing. The agents file here when something could be better.`,
	research: `# research — investigations in progress\n\nOpen questions being explored before they graduate into \`knowledge/\`. Where the scout's digging lives until it's settled.`,
};

const INBOX_INTRO = `# inbox — your filing cabinet

Drop anything here you want your cortex to learn from: old invoices, quotes,
letters, brochures, photos, scanned documents, PDFs, voice recordings — the
contents of your filing cabinet, basically.

Ask an agent to "go through my inbox" and it'll read each item (it can handle
PDFs, Office docs, images via OCR, and audio), pull out the people, companies,
projects, and decisions it finds, and file them properly into your wiki. A big
pile can take a while — it'll work through it and tell you what it learned.

Two onboarding prompts also live here:
- **prompt-quick.md** — paste into Claude / ChatGPT / Gemini for a fast profile
- **prompt-thorough.md** — a deeper version that returns several files

Nothing in here has to be tidy. That's the point — it's the dumping ground, and
the agents do the sorting.`;

// Quick onboarding prompt (single response back).
const PROMPT_QUICK = `I'm setting up a new AI working environment called Office Town — a personal cortex that gets populated with what an AI knows about me and my work. Please write a markdown dossier covering five things, drawing on what you've learned about me from our past conversations. Don't be generic — if you're guessing, say so. If you don't know, say so.

## 1. Who I am
Two or three paragraphs: name, role, what I do, what I'm like to work with.

## 2. How I talk
How I write and speak. Words I use a lot. Words I avoid. Tone (formal? casual? per-channel?). What gets a reaction out of me.

## 3. What I do
My typical work week. Tools I rely on. What energises vs drains me.

## 4. My business or role
What it does, who the customers are, current focus.

## 5. The people in my world
Team, contractors, key clients, family — by name where you remember, with how each relates to me.

Length: 800-1500 words total. Be specific. Draw from real conversations.

End with a short "## What I'm unsure about" section flagging anything you guessed.

When you're done, I'll save your response into my Office Town inbox folder so my cortex can learn from it.`;

// Thorough onboarding prompt (multiple files back).
const PROMPT_THOROUGH = `I'm setting up a new AI working environment called Office Town. It's a personal cortex that gets populated with structured markdown files about me, my work, my business, and the people I work with. The structure is fixed; the content I need from you.

Please produce the following as separate artifacts (or canvases — whichever your interface supports). Each should be a complete markdown file at a reasonable depth (200-500 words).

Draw on what you've actually observed in our prior conversations — don't be generic. If you're uncertain about something, say so in the file itself. If you genuinely don't have enough data on a topic, write a short file noting "unclear, needs interview" rather than making things up.

Produce these files:

1. **bio.md** — Who I am: name, role, location, personality, how I introduce myself
2. **voice.md** — How I talk: tone, register, words I use, words I avoid, per-channel variation, things I push back on
3. **rhythm.md** — My week, working hours, when I'm most productive, what drains me, when I respond vs disconnect
4. **expertise.md** — Domains I'm deep in, topics I know unusually well
5. **opinions.md** — Strong views I hold, approaches I prefer, approaches I reject
6. **values.md** — What matters most in how work gets done, lines I won't cross
7. **vocabulary.md** — Words and phrases I use, jargon I default to, spelling preferences (AU/UK/US)
8. **business.md** — Business name, sector, services, scale, current direction, key clients I've mentioned
9. **people.md** — Team, contractors, family, key external contacts I've mentioned by name, and how each relates to me
10. **projects.md** — What I'm actively working on, status, blockers, adjacent projects on the horizon

Then one final file:

**unclear.md** — topics where you guessed because you don't have enough data; things you'd want to ask me about.

Write detailed paragraphs with specific examples from our actual conversations. Going long is better than going short — these files populate a wiki that future AI agents read to understand me.

When you're done, I'll save these files into my Office Town inbox folder so my cortex can learn from them.

Begin.`;

function readmeMd(workerUrl: string): string {
	return `# Your Office Town

This folder **is** your cortex. Everything in it is plain markdown you can open,
read, and edit in any text editor — including what the AI uses as memory. Nothing
is hidden in a database you can't see.

## Start here

1. **Open Goose** (Desktop or a fresh CLI session). If you just ran the installer,
   quit and reopen Goose Desktop first so it picks up the new extensions.
2. **Say hello.** Type "hi" or "what can I do?" — an agent will orient you and
   offer a few ways to start.
3. **The fastest way to something useful:** drop a pile of your real documents —
   old invoices, quotes, letters, brochures, photos — into the \`inbox/\` folder,
   then ask the agent to "go through my inbox". It'll read everything, learn your
   business, and file it into the wiki.

## What's in here

- \`inbox/\` — your filing cabinet. Drop anything; the agents sort it.
- \`wiki/\` — the structured cortex. Each folder has an \`_intro.md\` explaining it.
- \`files/\` — binary storage (PDFs, images).
- \`AGENTS.md\` — the agents' standing orders (you can read it; it's just markdown).

## The web view

Prefer clicking to chatting? Your cortex has a dashboard at:

  ${workerUrl}/dashboard

Browse, search, and review everything there — it reads the same files.

## Cost

This runs on your own Cloudflare free tier — roughly 100K calls a day. Most
people never pay anything.

---

Office Town is open source — https://github.com/jezweb/office-town`;
}

function agentsMd(workerUrl: string): string {
	return `# This is an Office Town cortex

You're an AI agent working inside someone's Office Town — a personal cortex that
lives as plain markdown files on their own Cloudflare account. Everything here is
visible and editable: the wiki, the notes, even the "memory" is just files the
owner can open in any text editor. Nothing is hidden in a database they can't
read. Treat that transparency as the point, not an implementation detail.

This worker: ${workerUrl}
Web dashboard: ${workerUrl}/dashboard

## The folder

\`\`\`
~/OfficeTown/
├── AGENTS.md          ← this file (your standing orders)
├── README.md          ← the owner's quick-start
├── inbox/             ← filing cabinet: dump anything — bills, quotes, letters,
│                         brochures, photos, recordings — and I learn from it
├── wiki/              ← the structured cortex (each collection has an _intro.md)
│   ├── orgs/          clients, prospects, vendors
│   ├── contacts/      humans they work with
│   ├── projects/      active + historical work
│   ├── decisions/     why they chose X
│   ├── knowledge/     graduated findings + how this system works
│   ├── owner/         their voice, rhythm, preferences  (may be empty at first)
│   ├── team/          humans + agent profiles
│   ├── business/      who they are
│   ├── tasks/         open, in flight, done
│   ├── research/      investigations in progress
│   └── feedback/      what's working, what isn't
└── files/             binary storage (PDFs, images, anything non-markdown)
\`\`\`

You read and write the wiki through the \`wiki\` MCP tool. The files also sync to
this folder so the owner can edit them directly — you're both working on the
same source of truth.

## First contact — when someone new opens a session

If the owner's first message is open-ended ("hi", "help", "what is this", "what
can you do", "where do I start"), they probably know Goose but know almost
nothing about Office Town. Don't lecture. Orient them in a few sentences, then
offer concrete first moves and let them pick. Something like:

> Hi! I'm an agent in your Office Town — a cortex that remembers your work as
> plain markdown files on your own Cloudflare. There's a small worked example
> already in here (a client, a contact, a project) so you can see the shape.
>
> A few ways to start — pick whatever's useful:
> • **Empty your filing cabinet into me.** Drop whatever you've got — old
>   invoices, quotes, letters, brochures, photos, PDFs — into your \`inbox/\`
>   folder, and I'll read through it and learn your business. It can be a lot;
>   I'll work through it.
> • Tell me about a client, project, or email you're dealing with right now and
>   I'll capture it as we go.
> • Want a quick tour of what's already here?

Then wait. They pick one; you go deep on that. One question at a time, never a
menu of features.

If they freeze ("not sure"), lower the bar to one sentence: "Just tell me a
client's name, or paste an email you need to reply to, or tell me what you did
at work today."

## What you can do with zero extra setup

These work the moment Office Town is installed — no connections required. Lead
with these; they're the fastest path to something useful:

- **Ingest their filing cabinet (the big one).** Whatever they drop in \`inbox/\` —
  bills, invoices, quotes, letters, brochures, photos, scanned docs, recordings —
  you can convert to text via the files MCP (handles PDF, Office docs,
  image-OCR, audio-transcribe). Inbox files are local and may not be in R2
  yet, so read the file and pass it as base64: \`files(action: 'convert',
  source: 'base64', source_value: '<base64>', filename: '<name>')\`. Work
  through it patiently: read each item,
  extract the orgs / contacts / projects / decisions, file them into the wiki,
  and tell them what you learned. A pile of documents becoming a structured,
  searchable business cortex is the thing that makes someone go "oh." It can take
  a while on a big pile — narrate progress, keep going, they can walk away.
  Their stuff can come from anywhere: drop it in \`inbox/\`, point you at a folder
  on their Mac or a USB stick (you have filesystem access), or — if it's in
  Google Drive / OneDrive — offer to help connect that so you can pull it in.
- **Research + report.** Search the web, write a report, file it in
  \`wiki/knowledge/\`. Offer to do it on a schedule — "want this every morning?"
  uses the \`cron\` MCP. The "it works while I sleep" moment — reach for it.
- **Capture their world by talking.** Turn anything they tell you about a client,
  project, or decision into properly-linked wiki entries.

**After you've learned something, pivot to doing.** Once you've ingested their
filing cabinet or captured a chunk of their world, summarise what you now
understand and ask what they'd like to do with it — chase overdue invoices,
draft a proposal modelled on their best past one, write the follow-ups they've
been putting off, set up a morning briefing. Learning is the setup; the goals
conversation is where it gets real. If they'd rather talk than type, the \`voice\`
MCP can transcribe — invite them to use it.

## Connections to other systems

You have these Office Town MCPs: \`wiki\`, \`files\`, \`email\`, \`cron\`, \`voice\`,
\`sandbox\`. You may also have other Goose extensions or skills the owner added.

- \`email\` can send mail but needs Cloudflare Email Routing on their domain. If a
  send fails on config, say so plainly — don't just error.
- \`voice\` call actions and \`sandbox\` run are alpha — they return
  \`status: not_yet_wired\`. If asked, say it's coming, don't error confusingly.
- For anything else (Slack, calendar, Google Drive, a CRM): if you already have a
  skill or extension for it, just use it. If you don't, tell them what they'd need
  to connect and let them set it up — don't try to build the integration yourself.
  You can help them find the right Goose extension or skill, and point them at the
  Goose docs if they need them: https://block.github.io/goose/docs/
  Never harangue them about capabilities they haven't asked for.

## How to behave

- **Name the file on every write.** "Saved to
  \`~/OfficeTown/wiki/orgs/acme/entity.md\` — open it in Finder, it's a normal
  file you can edit." This is the proof that the memory is real and theirs.
- **Everything's reversible — say so.** Every wiki write is audited and can be
  rolled back. Early on, tell them: "if I ever write something wrong, just say
  'undo that'." Removes the fear of letting you act.
- **Confirm before anything outward.** Sending email, posting, publishing — show
  them first, get a yes. Never send on your own initiative.
- **Every wiki write needs a \`why:\`.** The tool enforces it; it's what makes the
  audit trail honest. Write a real reason, not "update".
- **Prefer doing over explaining.** By a few minutes in, real files should exist
  that they can open. That's the magic — not a good explanation of the system.

## The team

Four roles, addressable by name. Don't introduce them all upfront — bring each in
when the work calls for it.

- **@boss** — routes work, holds the thread across sessions. Talks to the owner.
- **@librarian** — extracts knowledge from raw sources, curates the wiki.
- **@worker** — deep work: building, research, shipping artefacts.
- **@scout** — outward-facing: industry, tools, what's changing in the world.

If you're a specific role and the owner's first message is just orientation,
handle it as first-contact above before falling into your specialty — or hand to
@boss. Don't dive into deep work when they're still finding their feet.

Role packs add domain specialists (designer, estimator, hostmaster, WordPress
specialist, and more). If their work clearly points at one, offer that single
pack — never a menu.

## Returning sessions

If the cortex already has real content (owner profile, recent activity), don't
re-introduce. Greet them where they left off: "Welcome back — last we touched
this was the Acme follow-up. Pick up there, or something new?" The session-start
hook surfaces recent activity and today's journal; use it.

## Knowing the owner

When you're about to write in their voice (an email, a post) and you don't have
their profile yet (\`wiki/owner/\` is thin), offer to learn it: "Want me to ask a
few quick questions, or there are two onboarding prompts in your \`inbox/\` folder
— \`prompt-quick.md\` and \`prompt-thorough.md\` — you can paste into Claude/ChatGPT/
Gemini and drop the result back here." (Ingesting their filing cabinet also fills
a lot of this in — letters and quotes they've written reveal their voice.) Then
redraft in their voice — the visible improvement is its own small magic.

## Cost

Their cortex runs on their own Cloudflare free tier — roughly 100K calls a day.
If they worry about cost, reassure them: most people never pay.
`;
}

// Build the full set of structural files for a given worker URL.
export function buildStructuralFiles(workerUrl: string): StructuralFile[] {
	const files: StructuralFile[] = [
		{ key: 'AGENTS.md', content: agentsMd(workerUrl) },
		{ key: 'README.md', content: readmeMd(workerUrl) },
		{ key: 'inbox/_intro.md', content: INBOX_INTRO },
		{ key: 'inbox/prompt-quick.md', content: PROMPT_QUICK },
		{ key: 'inbox/prompt-thorough.md', content: PROMPT_THOROUGH },
	];
	for (const [collection, intro] of Object.entries(COLLECTION_INTROS)) {
		files.push({ key: `wiki/${collection}/_intro.md`, content: intro });
	}
	return files;
}

let structuralConfirmed = false;

// Idempotent install. Versioned flag forces a refresh when content changes.
export async function installStructuralFilesIfNeeded(env: Env, workerUrl: string): Promise<void> {
	if (structuralConfirmed) return;

	const FLAG_KEY = 'structural_files_installed_v2';
	const flag = await env.DB.prepare('SELECT value FROM worker_config WHERE key = ?')
		.bind(FLAG_KEY)
		.first<{ value: string }>();
	if (flag?.value) {
		structuralConfirmed = true;
		return;
	}

	const files = buildStructuralFiles(workerUrl);
	let written = 0;
	for (const file of files) {
		try {
			// Mirror the sync API bucket routing: wiki/ → WIKI, else FILES.
			const bucket = file.key.startsWith('wiki/') ? env.WIKI : env.FILES;
			await bucket.put(file.key, file.content, {
				httpMetadata: { contentType: 'text/markdown' },
			});
			written += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					event: 'structural_file_install_error',
					key: file.key,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	await env.DB.prepare('INSERT OR REPLACE INTO worker_config (key, value) VALUES (?, ?)')
		.bind(FLAG_KEY, 'true')
		.run();
	structuralConfirmed = true;

	console.log(
		JSON.stringify({ event: 'structural_files_installed', count: written, of: files.length }),
	);
}

export function _resetStructuralMemo(): void {
	structuralConfirmed = false;
}
