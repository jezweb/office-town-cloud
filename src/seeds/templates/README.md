# src/seeds/templates/

Onboarding template files. Used by the `office-town-setup` skill to route a dossier-extraction paste into structured cortex entries, and as conversation guides telling the curator agent what depth to seek.

## What's here

```
templates/
├── README.md                          # this file
├── owner/                             # owner cascade (the 7 load-bearing files)
│   ├── bio.md                         # who the user is
│   ├── voice.md                       # how they want agents to talk (LOAD-BEARING)
│   ├── rhythm.md                      # working pattern + energy
│   ├── expertise.md                   # domains of unusual depth
│   ├── opinions.md                    # strong views + stances
│   ├── values.md                      # what matters most
│   └── vocabulary.md                  # words used + words avoided
├── business/
│   └── entity.md                      # business identity record shape
└── onboarding/
    ├── people-routing.md              # how people.md splits across contacts/team/orgs
    ├── projects-routing.md            # how projects.md splits + which become knowledge
    └── needs-followup.md              # the post-onboarding interview queue shape
```

## How they work

Each template is markdown with `<...>` placeholders showing what content should go in each section. The setup skill reads the relevant template, takes content from the dossier paste, and writes the populated version to the cortex.

For example: when the user pastes a multi-file dossier (variant 2) and Claude has produced 10 separate artifacts, the setup skill:

1. Reads each dossier artifact in turn
2. Looks up the matching template (e.g. `voice.md` artifact → `templates/owner/voice.md`)
3. Maps dossier sections to template sections (heading-match)
4. Writes the populated file to the cortex destination (`wiki/owner/voice.md`)
5. For multi-route artifacts (people.md, projects.md), reads the `*-routing.md` template to decide how to split

## Conversation-guide role

When the setup skill runs the **conversational fallback** path (path 3, when the user has no existing AI to dossier from), it reads each template's section headers + placeholder guidance and asks the user about each. The `<...>` content effectively becomes "what to ask".

## What these templates are NOT

- **Not blank schemas.** Each file contains real guidance about what depth to seek + what kinds of content to expect.
- **Not seed entries.** They're not written to the cortex on cold install — they're written only when the setup skill actually processes a dossier or runs an interview.
- **Not the routing table.** The routing table is the per-section dispatcher in code (`src/setup/routing.ts` when built); the templates are *what each route looks like populated*.
- **Not bound to one AI.** A dossier produced by Claude, Gemini, ChatGPT or any other AI maps the same way — the templates are AI-agnostic.

## Editing

Edits to these templates affect every future cortex install. Worth running them past the same discipline the framework doc asks of any first-class artifact:

- **Does the section earn its place?** (Would removing it leave the curator unable to act correctly? If no, cut it.)
- **Does it ask the right depth?** (Voice should ask for banned phrases + per-channel variation, not just "what's your tone?")
- **Does it acknowledge uncertainty?** (Templates that ask the AI to "guess" produce hallucinated content. Templates that ask for "honest depth or flag as unclear" produce trustworthy content.)

## Provenance

These templates were authored 2026-05-28 after Jez ran the multi-file dossier prompt (variant 2) against his existing Claude context. Claude produced 11 separate artifacts (10 + unclear.md) with consistent H1/H2 structure + inline uncertainty annotations. The structural shape proven by that output is what these templates generalise; the Jez-specific content was not retained.
