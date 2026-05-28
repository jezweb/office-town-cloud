# Onboarding by Dossier Extraction

**Date**: 2026-05-28
**Status**: Design pattern. The recommended primary path for Office Town's first-install experience, replacing the Goanna-inherited "6-question conversational interview" as the default. The conversational walkthrough remains as a fallback for users without a rich existing AI context bank.

**Inherits + extends**: Goanna's `skills/setup-goanna/SKILL.md` pattern (one canonical setup skill, multiple paths to the same routing table). Per `goanna-onboarding-templates-2026-05-28.md`.

---

## The unlock

The user installing Office Town is almost certainly already an AI user. Their existing Claude / Gemini / ChatGPT / other agent has months — possibly years — of conversation history with them. Those agents *already know* the user's voice, preferences, work style, business context, current projects, key contacts, working rhythm.

Instead of asking the user 50 questions, **ask the user's existing agents to write a dossier**. The user pastes a crafted prompt into Claude/Gemini/ChatGPT, gets back pages of structured detail, pastes it back into Office Town. Office Town's setup skill routes the content into the right cortex files.

Three things make this dramatically better than direct interview:

1. **Massive friction reduction.** Two-hour onboarding interviews don't happen. People bounce off. A 5-minute paste-and-review does happen.
2. **The user reviews + corrects in one pass.** They skim what the dossier says, catch inaccuracies, ship a corrected version. Accuracy is built in as a side effect of the paste loop.
3. **The dossier reflects how the user *actually* worked over the past months/years**, not how they describe themselves in a one-shot interview. Long-term agent history captures behaviour, preferences, and idiom that direct interviewing misses.

The barrier to using a new system is *"do I have to do this all over again?"* If we can pull rich context from the user's existing AI history in 5 minutes, that barrier collapses.

## The pattern

### Path 1 — Dossier extraction (default)

```
1. User installs Office Town + sets bearer
2. User opens dashboard or Goose curator session at cortex root
3. Setup skill detects cortex_state = 'fresh', offers three paths
4. User picks "Bring it across from my existing AI"
5. Office Town shows a crafted prompt — sectioned, comprehensive,
   designed to elicit depth
6. User copies the prompt
7. User pastes into their existing Claude/Gemini/ChatGPT/etc.
8. The existing agent generates a markdown dossier — pages of
   sectioned detail across identity, voice, work, business,
   rhythm, expertise, opinions, relationships, current projects
9. User skims, corrects anything inaccurate
10. User pastes the corrected dossier back into Office Town
11. Setup skill runs the dossier through the routing table —
    splits by section, writes to wiki/owner/voice.md,
    wiki/owner/rhythm.md, wiki/business/<biz>.md,
    wiki/contacts/<who>.md, wiki/projects/<current>.md, etc.
12. Setup skill surfaces summary: "I've created N entries from
    your dossier. Have a look at /dashboard/wiki?c=owner —
    correct anything that needs adjusting."
13. cortex_state transitions to 'live'
```

### Path 2 — Time-capsule import (additive)

The dossier-extraction path can be augmented or replaced with file/folder imports. The framing:

> *"If you had to pack one filing box to start over with a new business, what would go in it?"*

That's a real question that yields a concrete inventory. The user attaches:

- **Documents** — brochures, sample contracts, recent quotes, voice guidelines, P&L sheets, org charts
- **Folders** — point at `~/Documents/work/` or a Google Drive folder
- **Sources** — link to recent gmail threads, slack channels, GitHub repos
- **Images** — product photos, team photos, brand assets
- **Existing wikis** — Notion exports, Obsidian vault exports, current spreadsheets

Office Town's curator persona walks through what was attached, runs Workers AI extraction per file type, routes to the right collections (via the same routing table the dossier path uses).

This path also works for users without rich AI history (the dossier path's prerequisite). It's also additive: dossier paste FIRST, file attachments add depth.

### Path 3 — Conversational walkthrough (fallback)

The Goanna 6-question pattern, ported. For users who:
- Don't have an existing AI context bank to extract from
- Prefer to talk it through interactively
- Want a quick start before doing the dossier later

The setup skill walks them through identity → voice → work → business → rhythm → expertise → opinions, writing as it goes.

### All three paths converge on the same routing table

| Source content | Lands in |
|---|---|
| Identity / role / bio | `wiki/owner/bio.md` |
| Voice preferences / dialect / banned phrases | `wiki/owner/voice.md` (load-bearing) |
| Working hours / response cadence | `wiki/owner/rhythm.md` |
| Domain knowledge / expertise areas | `wiki/owner/expertise.md` |
| Tool preferences / stack | `wiki/owner/tooling.md` |
| Opinions / stances | `wiki/owner/opinions.md` |
| Values / non-negotiables | `wiki/owner/values.md` |
| Vocabulary / words to use vs avoid | `wiki/owner/vocabulary.md` |
| Business name / sector / services | `wiki/business/<biz-slug>/entity.md` |
| Team members | `wiki/team/<slug>/profile.md` |
| Key contacts (clients, vendors, partners) | `wiki/contacts/<slug>/contact.md` |
| Key organisations | `wiki/orgs/<slug>/entity.md` |
| Active projects | `wiki/projects/<slug>/project.md` |
| Recent decisions worth recording | `wiki/decisions/<slug>/decision.md` |
| Recurring patterns / methodologies | `wiki/knowledge/<slug>/concept.md` |
| Goals / aims | `wiki/owner/goals.md` |
| Raw documents | `wiki/raw/uploads/<sha-prefix>/<filename>` |

The routing table is the load-bearing artefact. It's the same regardless of which path produced the input.

## The crafted prompt (draft v1)

This is what the user pastes into their existing AI. It needs to:

- Cover everything the cortex's owner cascade + business + contacts + projects benefits from
- Be structured so the response is parseable (consistent headers)
- Authorise honest depth, not summaries
- Make the existing AI dump context from prior conversations
- Be copyable in one block

Draft:

```markdown
I'm setting up a new AI working environment called Office Town. It's a
personal cortex that helps me work across multiple sessions with full
context — but it starts empty. Rather than answer 50 questions to
populate it, I'd like you to write a comprehensive dossier of
everything you've learned about me over our conversations.

Please write a markdown document with the following sections. For each
section, draw on what you've actually observed in our prior conversations
— don't be generic. If you're uncertain about something, say so
explicitly rather than guessing. If you genuinely don't know, leave the
section short or note "unclear, needs interview."

## About me — identity
- Name, role, location, anything else that defines who I am
- Personality traits I've shown
- How I describe myself when I introduce myself

## About me — voice
- How I talk: tone, register, level of formality
- Words I use a lot
- Words I avoid or that bother me
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

## About my team / collaborators
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

Please write each section as detailed paragraphs (not bullet points) with
specific examples from our actual conversations where possible. Length:
go long. I'd rather have 2000 words of detail than 300 words of summary.
```

The user pastes this. The existing AI responds with the dossier. The user reads it (correcting inaccuracies in their head or directly in the markdown), then pastes the corrected version back into Office Town's setup skill.

Setup skill parses by section headers, runs the routing table, writes to the right cortex files.

## Detection + state

`worker_config.cortex_state` flag:
- `fresh` — initial install, no setup run yet
- `dossier-pending` — user asked for the prompt, hasn't pasted result back
- `setup-in-progress` — actively writing files from a paste OR mid-conversational-walkthrough
- `live` — setup complete; normal operation
- `re-onboarding` — user explicitly requested redo (preserves prior files as `superseded_by` references)

Plus a sentinel file `wiki/install/bootstrap.md` written at bootstrap, deleted by setup skill on completion. Belt + braces — if cortex_state isn't reachable for any reason, the sentinel's presence indicates fresh-install state.

## File attachment + folder import mechanics

Path 2 (time-capsule import) needs concrete plumbing:

| Input | How it's processed |
|---|---|
| Markdown / text files | Read directly, classify via Workers AI extractor, route per the table |
| PDFs | Cloudflare AI PDF extraction → text → classify → route |
| Images | Vision LLM (GPT Image / Llama Vision) describes content, classifies as logo / photo / brochure / org-chart / etc. |
| Spreadsheets | Parse first sheet, look for client lists / project lists / contact lists; route per row |
| Folder pointer | Curator walks the directory, decides what's worth ingesting (skips noise like node_modules, system files) |
| Google Drive link | Browser Rendering MCP fetches the doc, then process as document |
| URL | Browser Rendering fetches, extract content, route |
| Gmail thread reference | If user has Gmail MCP installed in their Goose, the curator can read directly |

The user doesn't have to be precise about what to attach. The curator agent figures out shape + relevance.

## Why this works for Office Town specifically

The dossier-extraction pattern works because **Office Town's user IS already an AI user.** Anyone deploying Office Town:
- Has used Claude, Gemini, ChatGPT, or similar for some months at least
- Has accumulated context in those tools that's denser than any questionnaire could extract
- Is comfortable copy-pasting between tools
- Will skim AI-generated content + correct what's wrong

The pattern wouldn't work for a general consumer who's never used an AI. For Office Town's target user, it works.

## Comparison to OpenHuman

OpenHuman scrapes the user's life into a database via Composio connectors (gmail, slack, etc.). Powerful but:
- Requires API access to every source
- Depends on Composio's reliability + cost
- Doesn't capture the user's *voice + preferences* — only their *content*
- Slow to populate; takes days of background polling to build context

Office Town's dossier-extraction works differently:
- Voice + preferences come from the user's existing AI (their persona-aware context)
- Content + structure come from file attachments + connected sources
- Combines both → richer + faster than either alone

The dossier captures the *self-aware summary* the user's AI has built from observing the user. That's a different signal than the raw content OpenHuman ingests, and it complements rather than replaces source-scraping.

## Risks + caveats

- **Dossier accuracy depends on the user's existing AI.** A user with a 10-message history will get a thin dossier. A user with 1000+ messages will get a rich one. Setup skill should ask: "Have you been using Claude/Gemini/ChatGPT for more than a few months? If yes, the dossier path is likely to work well. If no, try the conversational walkthrough."
- **Existing AIs may decline or hallucinate.** Some might refuse the prompt; others might generate plausible-sounding but wrong content. The user-review step is the safety net.
- **Privacy.** The user is explicitly choosing to dump their existing AI's understanding of them into Office Town. We should be clear: "This pastes context from your existing AI into Office Town. The content goes into your own cortex; we don't transmit it anywhere else."
- **The prompt might need per-AI tuning.** Claude responds differently than Gemini than ChatGPT. v1.0 ships one prompt; v1.1 might ship per-AI variants.

## What Office Town ships in v1.0

Minimum viable dossier-extraction path:

1. **`/dashboard/setup` route** — surfaces the three paths on cold install
2. **`office-town-setup` skill** — the canonical procedure for the Goose-side path
3. **The crafted prompt** (above) — shipped as `wiki/install/dossier-prompt.md` so it's portable + editable
4. **The routing table** — implemented in `src/setup/routing.ts` as a per-section dispatcher
5. **`/api/setup/dossier`** endpoint — accepts the pasted dossier, runs routing, returns summary
6. **`cortex_state` flag** in worker_config + transitions
7. **`wiki/install/bootstrap.md` sentinel** — created at bootstrap, deleted by setup skill on completion
8. **Empty-state dashboard** — when cortex_state = 'fresh', the town view shows the setup CTA instead of the buildings

What waits for v1.1:
- File-attachment plumbing (PDF / image / spreadsheet extraction)
- Folder-pointer walking
- Per-AI prompt variants
- Re-onboarding flow

## Related docs

- `goanna-onboarding-templates-2026-05-28.md` — Goanna's setup-goanna skill + routing-table pattern that inspired this
- `goose-usage-patterns-2026-05-28.md` — multi-session patterns; setup runs in a single curator session at cortex root
- `office-town-framework-2026-05-28.md` — needs Section 23 added for first-install + a Section 6 update on dossier-as-onboarding-source
- `cortex-shape-2026-05-28.md` — owner cascade structure that the routing table populates
- Goanna's `skills/setup-goanna/SKILL.md` — the reference implementation
