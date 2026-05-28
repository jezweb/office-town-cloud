# needs-followup.md

The post-onboarding interview queue. Populated from the dossier's `unclear.md` companion file + any inline inferences flagged by the curator during routing. Lands at `wiki/inbox/onboarding/needs-followup.md`.

The curator (or the user, or any agent) walks this list in a follow-up session and resolves items one at a time. Each resolved item gets written into the appropriate cortex file + removed from this queue.

## Sections to populate from dossier's unclear.md

### Personal facts the dossier inferred or guessed

<List facts the dossier wasn't sure about. Examples:
- Age / appearance (often inferred from career timeline)
- Specific location (suburb / postcode)
- Family member roles or full names
- Specific spellings of names
- Anything the AI flagged with "(uncertain)" or "(inferred)" inline>

### Apparent contradictions to resolve

<Items where the dossier saw two different values and couldn't reconcile. Examples:
- Mac vs Linux as primary daily-driver
- Managed-site count discrepancies
- Two role descriptions
- Two contact addresses for the same purpose>

### Status checks (time-sensitive, may have moved on)

<Things the dossier knew about but isn't sure about current state. Examples:
- "Japan trip was planned for April 2026, has it happened?"
- "Pineapple Tours dispute — resolved or still live?"
- "Microsoft publisher verification — done yet?"
- "Goose AI evaluation — adopted, parked, rejected?"

These are the highest-value follow-up questions; recent activity changes the cortex's working assumptions.>

### Thin sections worth interview depth

<Sections in the dossier that came out shallow because the AI didn't have enough data. Common candidates:
- rhythm.md (working hours, energy curve)
- values.md (synthesised from decisions rather than stated)
- expertise depth in newer areas
- per-channel voice variation that wasn't observed enough to characterise>

### Topics the AI deliberately did not invent

<Areas the AI flagged as "no data, left blank rather than guessed". Capture so the curator can ask in a non-leading way. Common: politics, religion, finances, relaxation habits, health beyond fitness.>

---

## How the curator works through this queue

Process: pick one item → ask the user → write the answer into the right cortex file → remove the item from this queue.

Don't try to clear all items in one session. Better: 3-5 items per follow-up conversation, spaced over a week or two. Each conversation also surfaces new questions, which get added here.

Worth flagging:
- **Active follow-ups go in `tasks/` if they need user action** (e.g. "Confirm Microsoft verification status with Paul")
- **Resolved items get `superseded_by:` pointing to the cortex file that now carries the answer**
- **Items that can't be resolved (genuinely unknowable) get archived with reasoning, not deleted**

---

*This queue is durable across sessions. The curator picks up where it left off via the kickoff procedure (`steps 5-6: pick up open tasks + check today's journal`).*
