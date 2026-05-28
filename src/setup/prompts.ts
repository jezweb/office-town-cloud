// Dossier-extraction prompts the user pastes into their existing AI.
// Surfaced on /dashboard/setup with copy-to-clipboard so users don't
// need to track down an external doc.
//
// All three variants produce content that routes through the same
// /api/setup/dossier endpoint. Variant 2 (multi-file) is the
// recommended default — modern AI surfaces (Claude artifacts, ChatGPT
// canvas, Gemini canvas) render each file separately and export cleanly.

export interface DossierPromptVariant {
	id: string;
	title: string;
	shortDescription: string;
	recommended: boolean;
	body: string;
}

const VARIANT_2 = `I'm setting up a new AI working environment called Office Town. It's a personal cortex that gets populated with structured markdown files about me, my work, my business, and the people I work with. The structure is fixed; the content I need from you.

Please produce the following as 10 separate artifacts (or canvases — whichever your interface supports). Each should be a complete markdown file at a reasonable depth (200-500 words).

Draw on what you've actually observed in our prior conversations — don't be generic. If you're uncertain about something, say so in the file itself ("I'm not sure but I think..."). If you genuinely don't have enough data on a topic, write a short file noting "unclear, needs interview" rather than making things up.

Produce these 10 files:

1. **bio.md** — Who I am: name, role, location, personality, how I introduce myself
2. **voice.md** — How I talk: tone, register, words I use, words I avoid, per-channel variation (formal in client comms? casual in team chat?), things I push back on
3. **rhythm.md** — My week + working hours + when I'm most productive + what drains me + when I respond vs when I disconnect
4. **expertise.md** — Domains I'm deep in + topics I know unusually well + things I get into the weeds on
5. **opinions.md** — Strong views I hold (technical, business, philosophical) + approaches I prefer + approaches I reject + things I'm willing to push back on
6. **values.md** — What matters most to me in how work gets done + lines I don't cross + lines I push others not to cross
7. **vocabulary.md** — Words/phrases I use frequently + words I avoid + technical jargon I default to + AU/UK/US spelling preferences if relevant
8. **business.md** — Business name, sector, services, scale, current strategic direction, key clients I've mentioned
9. **people.md** — Team members + contractors + family + key external contacts I've mentioned by name, with how each relates to me
10. **projects.md** — What I'm actively working on, status, blockers, adjacent projects on the horizon

Length per file: 200-500 words each. Write detailed paragraphs with specific examples from our actual conversations where possible. Going long is better than going short — these files will populate a wiki that future AI agents read to understand me, so depth matters.

After the 10 files, produce one final artifact:

**unclear.md** — topics or sections above where you guessed because you don't have enough data; things you'd want to ask me about to fill in.

Begin.`;

const VARIANT_1 = `I'm setting up a new AI working environment called Office Town. It's a personal cortex that helps me work across multiple sessions with full context — but it starts empty. Rather than answer 50 questions to populate it, I'd like you to write a comprehensive dossier of everything you've learned about me over our conversations.

Please write a markdown document with the following sections. For each section, draw on what you've actually observed in our prior conversations — don't be generic. If you're uncertain about something, say so explicitly rather than guessing. If you genuinely don't know, leave the section short or note "unclear, needs interview."

## About me — identity
- Name, role, location, anything else that defines who I am
- Personality traits I've shown over time
- How I describe myself when I introduce myself to others

## About me — voice
- How I talk: tone, register, level of formality
- Words and phrases I use a lot
- Words I avoid or that bother me when others use them
- Per-channel variation if any (more formal in client comms vs casual in team chat?)
- Things I push back on; things I get excited about

## About my work
- What I do day-to-day
- Tools I rely on
- My typical week / rhythm / when I'm most productive
- What energises me; what drains me

## About my business / role
- Business name (if I run one) or employer
- What the business does — products + services
- Who the customers/clients typically are
- Scale (solo? small team? enterprise?)
- Current focus / strategic direction

## About my team + collaborators
- Key people I've mentioned by name with what they do + how we relate
- Contractors / freelancers I work with regularly
- Family members who come up in conversation if relevant

## About my expertise
- Domains I'm deep in
- Topics I get into the weeds on
- Things I know that most people don't

## My opinions + stances
- Strong views I hold (technical, business, philosophical)
- Approaches I prefer; approaches I reject
- Things I'm willing to push back on

## My current projects
- What I'm actively working on right now
- Status, blockers, what success looks like
- Adjacent projects on the horizon

## My values + non-negotiables
- What matters most to me in how work gets done
- Lines I don't cross
- Lines I push others not to cross

## Open questions / things you're unsure about
- Sections above where you guessed because you don't have enough data
- Things you'd like to ask me about

Please write each section as detailed paragraphs (not bullet points) with specific examples from our actual conversations where possible. Length: go long. I'd rather have 2000 words of detail than 300 words of summary. The dossier will populate a wiki that future AI agents will read to understand me, so depth matters more than concision.`;

const VARIANT_3 = `I'm bootstrapping a new AI cortex called Office Town that needs context about me. Please write a markdown dossier covering just five things, drawing on what you've learned about me from our prior conversations. Don't be generic — if you're guessing, say so. If you don't know, say so.

## 1. Who I am
Two or three paragraphs covering name, role, what I do, what I'm like to work with.

## 2. How I talk
How I write + speak. Words I use a lot. Words I avoid. Tone preferences (formal? casual? per-channel?). What gets a reaction out of me.

## 3. What I do
My typical work week. Tools I rely on. What energises vs drains me.

## 4. My business or role
What it does, who the customers are, current focus.

## 5. The people in my world
Team members, contractors, key clients, family — by name where you remember, with how each relates to me.

Length: 800-1500 words total. Be specific. Draw from real conversations.

End with a short "## What I'm unsure about" section flagging anything you guessed.`;

export const PROMPT_VARIANTS: DossierPromptVariant[] = [
	{
		id: 'multi-file',
		title: 'Multi-file output (recommended)',
		shortDescription: '10-11 separate artifacts. Modern AI surfaces (Claude / ChatGPT canvas / Gemini canvas) render each one as its own file you can download. Cleanest for routing.',
		recommended: true,
		body: VARIANT_2,
	},
	{
		id: 'single-dossier',
		title: 'Single dossier',
		shortDescription: 'One big sectioned markdown response. Works consistently across all major AIs. Best if your AI doesn\'t handle multi-artifact output well.',
		recommended: false,
		body: VARIANT_1,
	},
	{
		id: 'quick-start',
		title: 'Quick start',
		shortDescription: '5 sections, ~250-word prompt, ~1000-word output. For a fast test before committing to the deeper variants.',
		recommended: false,
		body: VARIANT_3,
	},
];
