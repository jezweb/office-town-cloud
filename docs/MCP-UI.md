# MCP Apps for Office Town

The planned MCP App / MCP UI surfaces. All ship as HTML returned from our Cloudflare Workers via `mimeType: "text/html;profile=mcp-app"`, embedded in Goose's sandboxed iframe. PostMessage JSON-RPC for interactivity.

## The pattern

Goose's MCP Apps spec lets an MCP server return rich HTML responses that Goose embeds inline in chat. Our Workers serve these endpoints; Goose handles theming, sizing, and the sandbox. Each "app" is roughly one HTML page with embedded JS/CSS, calls back to the same MCP for any interactions, no external CDN required (sandboxed iframe).

Effort per app: 2-8 hours depending on complexity.

## v1 — ship with M6 dashboard

These are the surfaces users see in their first session.

### Town map

The single most demo-able MCP App. Isometric town view with character sprites at buildings; status indicators (idle/working/blocked); click building → expand to that building's view.

- Generative assets via Gemini 3.1 Flash Image (one-time, ~$2 for the asset set; see M6.5 in BUILD-SPEC)
- Status from substrate Worker queries (last journal entry time, open task count, inbox count per building)
- Click handler: postMessage → `wiki.building_detail(slug)` → opens the building view

Entry point at session start. The first thing every user sees.

### Kanban board

Cards grouped by status, organised by role. Each card is a task. Drag-and-drop status changes call `wiki.update`. Click card → opens `wiki.read(slug, expanded: true)`.

- Source data: `wiki.search(kind: 'task', status: ['todo', 'doing', 'blocked', 'done'])`
- Drag-drop: postMessage → `wiki.update(slug, {status: new_status})`
- Drilldown: postMessage → `wiki.read(slug)` opens entry detail app

### Search results panel

Hybrid FTS + vector results returned by `wiki.search`. Each hit shown with score, snippet, "expand to full" button.

- Source: `wiki.search` triage-shape responses
- Click "expand": postMessage → `wiki.read(slug, expanded: true)`

### Approval prompt

For destructive actions (`wiki.delete`, `wiki.archive`, `wiki.supersede`): preview the change + Approve / Deny via MCP Elicitation.

- Triggered automatically when an agent tries a destructive action
- Renders the entity that's about to be modified + the proposed change
- Returns the user's choice via Elicitation's structured response

Uses MCP Elicitation as the underlying primitive, MCP App for the visual.

### Wiki entry detail

When user clicks a slug from any other app, this is what opens. Rendered markdown with backlinks (incoming via search; outgoing via frontmatter `relates_to`). Shows recent audit history.

- Source: `wiki.read(slug, expanded: true)`
- Backlinks: `wiki.search(query: slug, where: 'relates_to')`
- History strip: `wiki.history(slug, limit: 5)`

## v1.1 — alongside the killer Cloudflare extensions

### Contact / Org / Decision cards

When an agent surfaces a contact, org, or decision in chat, render as a card with avatar/icon, key fields, "view full" button — not raw frontmatter dump.

- Lightweight HTML, no interactivity needed beyond click-to-expand
- Replaces verbose text output from `wiki.get` in many turns
- Templates per entity kind

### Voice control panel

When voice extension is active: large "Call @<role>" button, audio meter while connected, transcript stream.

- Used by voice extension (M6 v1.1)
- WebRTC connection state, mute/unmute, end-call
- Optional: choose voice (per-role voice mapping from frontmatter)

### Image preview

When agent generates an image (Nano Banana, Flux, etc.): preview before save with "Approve / Regenerate / Edit prompt" buttons.

- Used by designer role + creative pack
- Returns user choice via Elicitation
- "Edit prompt" reopens the generation with the prompt pre-filled

### Brief composer

When boss is delegating, structured form: recipient role dropdown, subject, priority radio, context fields, attachments. Submits to write an inbox entry.

- Triggered by boss role detecting "delegate to..." or similar
- Form submission calls `wiki.write(kind: 'inbox-message', ...)` against the recipient's inbox
- The clarifying questions become structured form fields, not back-and-forth chat

### Publish preview

Before `share(mode: 'public')`, render the page with theme + show URL.

- Used by share extension when publishing
- Lets user verify the rendered output matches intent before going live
- Approve → permanent URL; Cancel → no publish

### Schedule calendar

Cron routines visualised on a week/month grid. Each routine is a calendar entry. Click → edit; "run now" button per routine.

- Used by cron extension
- Source: `cron.list()` returns schedules
- Edit: postMessage → `cron.schedule(id, expr, recipe)` for update

### Voice message composer — "drop a note to @<role>"

Quick voice-to-inbox messaging. User holds a record button or says wake-word, dictates a message for another role, sees the transcribed message in a card with recipient/subject/priority pre-filled, confirms or edits, sends. Lands as an inbox-message in the target role's `inbox/`.

- Triggered by user voice command ("hey librarian, drop a note to worker about the redesign") OR by clicking a "send message" button in town map / kanban
- Pipeline: voice extension transcribes → MCP App renders the brief composer pre-filled → user confirms → `wiki.write(kind: 'inbox-message', to: <role>, ...)`
- The voice extension provides the transcription; the brief composer (existing v1.1 MCP App) provides the structured form; the wiki MCP writes it
- Cool detail: the SENDING role's voice is captured (librarian's tone if librarian is the sender), so the message in the recipient's inbox reads in the sender's voice — not a generic system message

Use case: walking between meetings, "hey @boss, drop a note to scout asking them to research Cloudflare AI Search pricing this week" — message lands in scout's inbox, ready for next session.

This is one of the small features that makes Office Town feel less like "AI tooling" and more like a real team where people actually communicate.

## v2 / nice-to-have

| App | What it does |
|---|---|
| **Wiki graph viewer** | Visual node-and-edge graph of entity relationships (orgs → contacts → projects → decisions). Force-directed layout via cytoscape.js. |
| **Audit trail viewer** | History of a wiki entry — who changed what when, with diffs |
| **Cost meter** | Live token/cost tracker per session; "this session: $0.42 so far" |
| **Building activity feed** | Recent inbox/journal/findings per building, time-bucketed |
| **Memory recall preview** | Before agent uses a fact, show user "I'm about to reference X — is this current?" via Elicitation |
| **File picker** | When agent needs to choose between many candidates (which email to extract, which file to share) |
| **Routine wizard** | Natural language → cron + recipe → save (e.g., "every Monday at 9am, ask scout for AI news") |
| **Town hall meeting** | When multiple agents are working on the same task, show their state side-by-side (workshop progress + scout findings + librarian filing) |

## Design principles

1. **One mental model.** The town map is the entry point. Everything else flows from clicking a building or a card.
2. **HTML is the lingua franca.** No React/Vue runtime in the iframe; vanilla HTML + small JS for interactivity.
3. **PostMessage RPC, not REST.** Each app talks back to its MCP server via the postMessage channel Goose provides. No external network calls (sandbox restricts them anyway).
4. **Goose handles theming.** Use CSS variables Goose provides (dark/light, accent colour, font stack). Don't hardcode colours.
5. **Apps are small and focused.** A single app does one thing well. Composability comes from chaining (click here → open that).
6. **Server is the source of truth.** Apps render the *current* state of substrate data on every open. No client-side state stored across sessions.

## Implementation order

When M6 lands, implement in this order:

1. Town map (entry point, demo-able, highest impact)
2. Kanban board (used most often)
3. Wiki entry detail (the drilldown target)
4. Search results panel (used every recall)
5. Approval prompt (safety for destructive actions)

Then v1.1 in pack order (design pack → cards; voice → voice panel; share → publish preview; cron → schedule calendar).

## What we deliberately don't build as MCP Apps

| Item | Why |
|---|---|
| Login / auth | Better-auth's hosted OAuth pages are the right pattern; not in chat |
| Provider config / settings | Lives in Goose Settings, not our app surface |
| Long-form editing (full markdown editor) | Use the user's preferred editor; the wiki MCP edits via update tool calls |
| Multi-pane IDE-like surfaces | Too heavy for iframe; would belong in standalone web dashboard if needed |
| Anything streaming-heavy | MCP App sandbox doesn't handle long-lived connections well; use Goose's native streaming for chat |
