# Office Town setup / onboarding flow

The first-session experience for a fresh Office Town deployment. Ships as a recipe in the office-town-plugin: `goose run --recipe office-town-setup`.

## Why this exists

Fresh deployment = empty town. The librarian has nothing to curate, the boss has no team to delegate to, the wiki has no business identity to anchor agents to. Without a setup flow, the user has to figure out what to fill in first, in what order, with what shape.

The setup recipe walks them through capturing the foundational layer **once**, properly. After completion, agents can start doing real work because they know who the user is, who the team is, and who matters externally.

## What the setup recipe captures

In order — each step is one or more agent questions, answers written to the wiki via `wiki.write`:

### Step 1 — Business identity (`wiki/business/<slug>.md`)

Boss agent asks:
- Business name + legal name
- ABN (Australian) or equivalent business number
- Headquarters location (single source of truth for the fleet)
- Timezone (single source of truth for clock-anchored work)
- Brief description: what the business does, in 1-2 sentences
- Optional: industry, founding year, size

Writes `wiki/business/<slug>.md` with `kind: business`, `hq_location:`, `timezone:`, etc.

### Step 2 — Owner voice + rhythm (`wiki/owner/`)

Boss asks the user a small set of conversational questions to capture how they communicate. Writes (or updates) `wiki/owner/voice.md`, `rhythm.md`, `bio.md`. Examples:

- "How do you prefer your AI to sound? Warm, professional, terse, exploratory...?"
- "What's your day like? When do you do creative work, when do you do admin, when do you check email?"
- "What things matter to you about how work gets done?"
- "Anything specific to call out that other team members would already know about you?"

The boss captures these in conversational shape — not a form, a chat — then writes the frontmatter + body. The librarian indexes; every subsequent agent session reads these to anchor tone.

### Step 3 — Team roster (`wiki/team/`)

Boss asks: who's on the team? For each person, name + role + email + brief.

Writes `wiki/team/humans/<slug>.md` per person. The librarian later cross-references these as contacts mature.

Also writes `wiki/team/agents/<role>.md` for each Office Town role installed (boss, librarian, worker, scout — plus any pack-added roles).

### Step 4 — Anchor contacts + orgs

Boss asks the user to think of 3-5 of the most important external people + organisations they work with. Captures basic info per:

- Contact: name, role, email, org, relationship type, brief context
- Org: name, primary domain, type (client / prospect / vendor / partner / competitor), services they offer / consume

Writes `wiki/contacts/<slug>/contact.md` and `wiki/orgs/<slug>/entity.md` per. This seeds the contact graph so the librarian has material to start curating + extending.

### Step 5 — Wire services (Cloudflare + comms)

Boss surfaces the configured Office Town Cloud extensions and helps the user wire any needed credentials:

- Cloudflare API token (for Office Town Cloud's devops + wiki access)
- LLM provider (already configured via Goose, just confirmed)
- Email service (optional — SMTP2Go, Email Routing, Cloudflare Email)
- Inbound channels (iMessage, Slack — optional)

### Step 6 — Pack installation recommendation

Boss loads the `pack-catalogue` skill (single source of truth for what packs exist + what each does + what business types they fit) and recommends packs based on what the user described in step 1.

Examples of mappings boss applies:
- "web design / hosting / WordPress" → recommend `office-town-pack-design`, `office-town-pack-hosting`, `office-town-pack-wordpress`
- "client proposals / project management" → recommend `office-town-pack-business`
- "lots of email / chat / social" → recommend `office-town-pack-comms`
- "deployed on Cloudflare" (everyone with Office Town Cloud) → `office-town-pack-cloudflare` is already installed by default

User says yes/no per pack. Boss runs `goose plugin install` for accepted packs.

**Why this matters:** the boss knows what's available without the user having to research. Pack discovery shouldn't be on the user — it's the boss's job to know what's in the catalogue and suggest based on context.

### Step 7 — Final cycle

Boss writes a summary entry to `wiki/business/<slug>.md` updating last_change_summary, drops a welcome note in librarian's `inbox/` ("you've been onboarded; here's what was captured; what would you like to start curating?"), and offers the user a few starting prompts:

- "@librarian what should I extract first?"
- "@scout what's brewing in our industry?"
- "Add a new client" / "Add a new project"

## Boss's ongoing role: pack recommender

After setup, the boss continues to watch for emerging needs and proactively suggests packs. This is a standing order in boss's role file:

> When the user describes work that needs a pack you don't have installed, suggest the install before doing the work. E.g., if the user says "let's mock up a landing page" and the designer role isn't available, surface: "We'd want @designer for this — install office-town-pack-design? It also gives you the Studio building." Don't be pushy about it; mention once, then proceed with what's available.

This is supported by the `pack-catalogue` skill which boss can load on demand to refresh its knowledge of what's available.

## Implementation

The setup recipe is a YAML file in office-town-plugin's `commands/` directory:

```yaml
name: office-town-setup
description: First-session onboarding — captures business, owner, team, initial contacts/orgs
parameters:
  voice:
    type: select
    options: [interactive, quick, import-from-goanna]
    default: interactive
extensions: [office-town-wiki]
instructions: |
  You are the boss agent running the Office Town onboarding flow.
  
  Walk the user through the 7 steps in order. For each step:
  1. Ask the questions conversationally (not a form)
  2. After answers, write to the wiki via wiki.write with appropriate kind + frontmatter
  3. Confirm the entry shape with the user before moving on
  4. If the user says "skip", record what was skipped in the journal
  
  At the end: write a session summary to wiki/business/<slug>.md and drop
  a welcome note in librarian's inbox. Offer the starting prompts.
  
  The full flow steps are in skills/office-town-onboarding-flow.md.
```

The actual step-by-step is in a skill (`office-town-onboarding-flow`) loaded on demand. Keeps the recipe small while letting the procedure be detailed.

## Re-running setup

Users can re-run `goose run --recipe office-town-setup --params voice=quick` later to fill in gaps. The recipe checks what's already in the wiki and only asks about missing or out-of-date pieces.

## "Import from goanna" variant

For users (specifically Jez) migrating from a goanna-style substrate, setup can run in `import-from-goanna` mode:

- Reads `/Users/Shared/goanna/wiki/business/<slug>.md`, `owner/*.md`, `team/`, `contacts/`, `orgs/` (the first N per collection)
- Writes equivalent entries to the Office Town wiki via the MCP
- Surfaces any conflicts (different `kind:` field naming, missing frontmatter fields) for the user to resolve

This is the migration path for the canonical Office Town reference deployment — Jez's own town.

## Honest scope

The setup recipe should take ~15-30 minutes for a thoughtful user. Less if they pick the `quick` voice mode (essential fields only). It's not exhaustive — it's the foundational layer the librarian needs to start meaningful curation. Everything else accumulates through normal use.
