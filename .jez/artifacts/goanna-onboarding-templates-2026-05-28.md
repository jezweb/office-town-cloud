---
about: Goanna's onboarding workflow + template architecture, synthesised for Office Town
last_updated: 2026-05-28
last_edited_by: research-agent
last_change_summary: Initial synthesis from goanna wiki/owner, wiki/business, templates, skills
---

# Goanna onboarding + templates — synthesis for Office Town

> Research artefact. Reads Goanna's owner cascade, business identity, template family, and onboarding skills to extract the SHAPE (not the content) so Office Town can replicate the depth-collection mechanism Jez built up over many hours of curation.

## 1. The owner cascade — what makes it rich

`wiki/owner/` is the deep folder about the install's steering human(s). The companion contact record at `wiki/contacts/<owner-slug>/contact.md` stays thin (CRM-shape); the rich content lives here. The cascade auto-loads via Claude Code's CLAUDE.md walk, so every agent in the fleet gets owner context at warm-up.

The cascade Goanna actually carries (13 files, all earning their place):

| File | ~Lines | What makes it load-bearing |
|---|---|---|
| `CLAUDE.md` | ~70 | Schema + curatorial rules for the folder — what goes here vs adjacent. Defines the `voice.md` contract (required sections). |
| `INDEX.md` | ~15 | Manifest with one-line summary per file. |
| `voice.md` | ~90 | THE most load-bearing file. Voice principles, dialect, banned phrases, behavioural anti-patterns, behavioural rules ("how to behave"), per-channel variants, voice-text mode. Read by every agent before producing styled output. |
| `voice-samples.md` | (referenced) | Concrete sent-mail examples across 5 registers. "Show, don't tell" companion to voice.md. |
| `rhythm.md` | ~40 | Timezone, when sharpest, when reactive, hard scheduling constraints, voice-text windows. |
| `expertise.md` | ~40 | Domains by expert/intermediate/beginner. Calibration heuristic for explanation depth. |
| `bio.md` | ~80 | Short (50w) / medium (~150w) / long bios, origin story, career arc, education, awards, memberships. |
| `values.md` | ~80 | Identity values, operating values (weighted), community commitments, refusal stance, defence stance, tolerate-no-more, end-state preference. |
| `goals.md` | ~150 | 12-month objectives + 5-year objectives + SMART framing + goal-watch list + when-goals-shift narrative. |
| `opinions.md` | ~40 | Subscribes-to / Rejects. Used to predict the owner's reaction before proposing something. |
| `tooling.md` | ~70 | Hardware, sync, `.jez/` convention, credentials policy, brains-trust pattern, routing conventions. |
| `vocabulary.md` | ~40 | Personal phrasing, working conventions, design heuristics. House terms ("Phase 0", "brains-trust", "effort scale"). |
| `family.md` | ~30 | Household, family-stewardship dev work, calendar conventions. |

**Why this cascade is rich rather than stale:**

- **Each file has ONE job.** Voice is not in rhythm. Goals are not in values. Bio is not in expertise. The single-purpose discipline prevents bloat.
- **Files mint when content earns them.** `family.md` doesn't exist until family-stewardship work surfaces. `goals.md` got minted from a real awards-application articulation, not invented.
- **Cross-references everywhere.** Every file ends with a "Cross-references" section pointing to adjacent files, so the reader navigates rather than the writer duplicates.
- **`last_updated` + `last_change_summary` frontmatter** captures provenance. Migration notes ("Phase 1 reshape", "Phase 2d migration") show the cascade has been actively re-shaped multiple times.
- **"Verification needed" sections** are explicit. Goals.md, values.md, voice.md all end with a list of unresolved questions for the next session — turning the file into a continuous conversation rather than a static document.
- **Behavioural rules sit alongside voice.** voice.md carries not just "how to talk" but "how to behave" (probe before assuming, push back when wrong, verify by inspection, default short). These behavioural rules are inseparable from voice for any styled output, so they live together.
- **Per-channel variants** sit inside voice.md only when they earn it. Goanna's voice.md names 5 channels (direct chat, newsletters, two client audiences, git commits). Most installs would have 2-3.
- **Two-source provenance**: goals.md was filled from the awards application (public-facing forward shape) AND from librarian-proposed gap fills (internal cross-axis coverage). Both ARE captured as separate origin paths. This shows how the file evolved through real authoring sessions.

## 2. The business identity — wiki/business/

`wiki/business/` is the symmetric deep folder for the install's OWN business entity. Symmetry: `wiki/orgs/` holds thin records of external parties; `wiki/business/` holds the deep record of "us".

Goanna's business folder carries ~45 files split across:

**Identity + strategy** (8 files): `jezweb.md` (entity record — day-one required), `australianworkplacesafety.md` (a separate Jezweb-owned trade publication), `history.md` (timeline), `strategy.md` (operating model), `delivery-model.md` (the four-role pattern), `values.md` (operating values), `vocabulary.md` (brand voice words), `brand-taxonomy.md`.

**Operations** (5 files): `cadence.md`, `finances.md`, `metrics.md`, `software.md`, `credentials-map.md`.

**Taxonomies** (~15 files): canonical value lists for entity frontmatter — `services.md`, `products.md`, `groups.md`, `verticals.md`, `hosting-platforms.md`, `email-platforms.md`, `cms-platforms.md`, `voices.md`, `pricing-tiers.md`, `comms-contexts.md`, `referral-sources.md`, `third-party-roles.md`, `specialists.md`. Plus a `taxonomies.md` meta-index.

**Auto-derived views** (12 files): `_<taxonomy>-actual.md` views generated by the worker showing what values are actually in use vs canonical (drift reconciliation).

**Goals** (subfolder): minted 2026-05-18 once 2 goals existed.

The CLAUDE.md sets a strict identity test: *"is this about US as a company?"* If yes, lives here. If portable (Cloudflare gotchas), lives in `wiki/knowledge/`. If a how-to, lives in `skills/`. If an adjudication, lives in `wiki/decisions/`.

Key disciplines:
- **Day-one required file** is the entity record (e.g. `jezweb.md`) with full frontmatter (`schema_version`, `business`, `slug`, `status`, `abn`, `hq_location`, `timezone`, `trading_names_history`).
- The entity record's frontmatter is the canonical source of truth for HQ-level operating context (timezone, hq_location). Agents don't duplicate.
- Anti-pattern called out explicitly: "importing enterprise-shaped patterns" (EOS, Holacracy, Scaling Up). Prefer one file with sections over folders with hierarchy.
- Taxonomy files all share a shape: frontmatter + intro + values table + "How to extend" + cross-references.

## 3. Templates as conversation guides

`templates/` carries ~54 files. Two flavours:

**Schema-shape templates** (entity, contact, project, decision, concept, investigation, task, quote/) — define WHAT a record looks like. Mostly frontmatter shape + section headings + brief inline guidance.

**Conversation-guide templates** in `templates/collections/owner/` and `templates/collections/business/` — these are the ones Jez was pointing at. They use `<placeholder>` slots AND inline prompts that tell the curator/agent what depth to seek, what to ask about, what to consider including.

Example from `templates/collections/owner/voice.md.template` (quoted verbatim, partial):

```
## Voice principles

<3-5 sentences capturing how you talk. Examples to consider replacing:>

- Warm but direct. No fluff, no apology-stacking.
- Plain English over technical jargon when explaining; technical when collaborating with other technical readers.
- I'd rather be told the unvarnished version than be managed.

## Banned phrases / anti-patterns

<List things you never want produced in your voice. Examples:>

- Em dashes (—). Use commas, full stops, or parentheses instead.
- "I'd love to help with that" / "Great question!" — AI-tell phrasing
- "Simply" / "just" / "easily" as filler before a complex action

## Per-channel variants (optional)

### Email (formal)
<how voice shifts for client emails — fuller sentences, sign-off conventions, etc.>

### Google Chat / Slack (team)
<more direct, less ceremonial>

### Voice agent / spoken
<sentence rhythm matters; punctuation cues pacing>
```

Example from `templates/collections/owner/rhythm.md.template`:

```
## Daily shape

| Block | When | Mode |
|---|---|---|
| Sharpest deep work | <e.g. 9am-noon AEST> | Building, coding, hard thinking |
| Mid-energy | <e.g. 1pm-3pm> | Reviews, comms, calls |

## Hard nos

<e.g. "Don't schedule meetings before 9am or after 6pm AEST without asking">
<e.g. "Friday afternoons are admin/wrap-up — no new client meetings">
```

Example from `templates/collections/owner/expertise.md.template`:

```
## Expert (don't over-explain)
<Domains where you've shipped extensively, debugged at depth.
 Agents should treat you as a peer here.>

## What I delegate
<Domains where you don't want to be the deciding voice — flag these
 so agents route appropriately.>
- <e.g. Tax / accounting decisions — delegate to accountant>
```

**The pattern that makes these templates conversation-guides rather than blank schemas:**

1. **Inline `<...>` prompts** that ask for a SHAPE of answer ("3-5 sentences capturing how you talk").
2. **`<e.g. ...>` examples** seeded inline so the curator/owner sees what depth looks like before they answer.
3. **Section names that prompt depth-collection** — "Banned phrases", "Per-channel variants", "Voice texts", "Hard nos", "What I delegate", "Curious about / actively learning". Each name suggests an angle the curator hadn't thought to ask.
4. **Optional sections marked optional.** Per-channel variants on voice.md, "Beginner" on expertise.md, "What I delegate" on expertise. The template doesn't force the answer.
5. **"Last updated, initial seeding via setup-goanna kickoff-X"** at the bottom — the template is explicit about which onboarding skill mints it.

Business templates (`templates/collections/business/`) follow the same pattern: entity.md.template prompts for "Audience tracks", "Pointers", "Gotchas". pricing.md.template prompts for "Custom development", "Retainers", "Quoting rules" — including specific gotchas like "After-hours / weekend uplift".

Team templates (`templates/collections/team/`) cover human.md, role.md, agent-persona.md, agent-instance.md. Same pattern: schemas with inline prompts.

## 4. The onboarding workflow Goanna actually uses

Goanna has **one canonical onboarding skill**: `skills/setup-goanna/SKILL.md`. ~280 lines. Frontmatter description summarises:

> Bootstrap a goanna installation end-to-end. Default: paste-from-AI shortcut (user pastes a context dump from another AI; one paste replaces six questions). Falls back to a 6-question conversational flow. Routes content across the full file family.

**Detection of first-install state:** the skill says *"Detected by: wiki/contacts/ has only INDEX.md; wiki/owner/ has no content beyond stubs; journal/ folders are empty"*. So first-install detection is structural — the absence of populated content signals fresh.

**Two paths:**

1. **Paste-from-AI shortcut (default).** User has another AI (ChatGPT, Claude.ai, Gemini, etc.) that already knows them. Goanna ships three paste prompts (`install/onboarding-context-prompt-work.md`, `install/onboarding-context-prompt-personal.md`, `install/onboarding-context-prompt-comprehensive.md`). User pastes a context dump; the skill parses it against a routing table that maps source sections → destination files.

2. **6-question conversational fallback.** Name, timezone, work, voice preferences, optional website, optional context.

**The routing table is the load-bearing artefact.** It's a section-to-destination map covering ~17 source-content categories. Things like "Identity, what I do, domain expertise, working rhythm" → contact + wiki/owner/ files; "Strong opinions" → wiki/knowledge/opinions.md; "Stack and tooling" → wiki/knowledge/stack.md; etc.

**Post-onboarding actions (the bit that landed during the first real-world onboarding failure):**

- Update every `INDEX.md` for collections touched.
- Write **post-onboarding comms briefs** to each non-boss agent's inbox: "here's what landed relevant to you, suggested first move, open questions". Without these, each non-boss agent's first session is "hi, what do you want?" with no context.
- Set `boss/status.md` "Next" breadcrumb.
- Delete `install/bootstrap.md` (the unambiguous fresh-install signal).
- Add `boss/facts/bootstrap-complete.md`.
- Optional: avatars, orientation pointer at `~/CLAUDE.md`, UI checklist.

**`kickoff` is separate from `setup-goanna`.** `kickoff` is the per-session warm-up that every agent runs at the start of every session. It reads CLAUDE.md cascade + facts/ + owner/voice.md + tasks + journal + inbox. Onboarding is once-per-install; kickoff is once-per-session.

**`onboard-agent` is for adding agents AFTER the install.** Different from onboarding the owner.

## 5. Office Town synthesis — recommendation

### Onboarding workflow

**Curator-led conversation, dashboard-assisted, paste-shortcut available.** Three modes:

1. **Paste shortcut (fastest).** Office Town ships three paste prompts (work / personal / comprehensive). User pastes a dump from whichever AI they're already using. Curator parses and routes.
2. **Conversational fallback.** Curator runs a 6-8 question sequence one-at-a-time.
3. **Dashboard wizard surface.** Cards or steppers visible in the web UI for users who want to drive directly. The wizard fills the same files the curator would.

All three paths produce the same on-disk output. The dashboard is a visualisation + control surface, not a separate system.

### Templates set to ship

**Owner cascade templates** (~6 files, 30-90 lines each):
- `templates/owner/voice.md.template` (90+ lines — the deepest template, including the per-channel variants section, voice-samples pointer, banned-phrases, dialect, behavioural rules)
- `templates/owner/rhythm.md.template`
- `templates/owner/expertise.md.template`
- `templates/owner/bio.md.template`
- `templates/owner/values.md.template`
- `templates/owner/goals.md.template`

Plus optional-mint: `opinions.md.template`, `vocabulary.md.template`, `tooling.md.template`, `family.md.template`. These ship in templates/ but only get used when content earns them.

**Business identity templates** (~3 files):
- `templates/business/entity.md.template` (the day-one required record)
- `templates/business/pricing.md.template`
- `templates/business/team.md.template`

**Schema templates** (~10 files): contact, org/entity, project, decision, task, concept, investigation, finding, comms-brief, journal-daily, skill.

**Onboarding paste prompts** (~3 files in install/): `onboarding-context-prompt-work.md`, `onboarding-context-prompt-personal.md`, `onboarding-context-prompt-comprehensive.md`.

Total templates target: ~25-30 files at first ship. Goanna's 54 includes specialist shapes earned over time; Office Town can start lean and mint more as shapes earn their place.

### Skills needed

- `office-town-setup` — the end-to-end install bootstrap (Goanna's `setup-goanna` equivalent). Detects first-install state, runs paste-or-conversation path, routes to files, writes comms briefs, updates indexes.
- `office-town-kickoff` — per-session warm-up. Reads owner cascade + agent CLAUDE.md + facts + inbox + tasks. Wires crons.
- `office-town-onboard-agent` — adds a new agent post-install (rare).
- `office-town-mint-template` — when a new shape earns its place (3+ instances), authors a template.

Optionally split owner onboarding from business onboarding into separate skills if the conversation is too long for one session — but Goanna keeps it as one skill with one routing table.

### First-install detection

Three signals, any one of which triggers the onboarding skill on the curator's next turn:

1. **Bootstrap sentinel file** (Goanna's pattern): `install/bootstrap.md` present means fresh. The setup skill deletes it as the unambiguous fresh-install signal.
2. **Structural emptiness**: `wiki/contacts/` has only INDEX.md; `wiki/owner/` has no content beyond stubs.
3. **Worker_config flag** in D1 (Office Town has more dashboard surface than Goanna): `cortex_state = 'fresh' | 'onboarding' | 'live'`. Curator + dashboard both read this.

Prefer the sentinel file + worker_config combo. The structural-emptiness check is a fallback.

### Order to ask in

Goanna's natural sequence, validated by setup-goanna and the paste-prompt structure:

1. **Identity** — name, what to call you, pronouns, timezone, location. (Bio + rhythm seed.)
2. **Voice preferences** — dialect, banned phrases, AI-tells you hate, formal-vs-casual default. (Voice.md seed — the most load-bearing file, ask early.)
3. **Work + role** — what kind of work, who's the audience, what's distinctive. (Bio + business entity seed.)
4. **Business identity** — entity name, ABN if applicable, what we sell, who buys, how we make money. (Business entity record seed.)
5. **Rhythm** — when sharpest, when reactive, hard scheduling constraints, async vs sync preference. (Rhythm.md seed.)
6. **Expertise + delegations** — where you're expert, where you want explanations, what you delegate. (Expertise.md seed.)
7. **Values + opinions** — what you optimise for, what you refuse, what you reject. (Values.md + opinions.md seed.)
8. **Optional**: goals, stack, connected systems, key contacts, family/personal context.

Voice comes early because EVERY subsequent agent interaction uses it. Identity comes first because every file's frontmatter wants `about:` + `slug:`. Business identity comes before deep operations because the entity record is the canonical operating-context source.

The paste shortcut compresses 1-8 into one paste; the routing table fans it back out across the files.

### What NOT to do

- **Don't pre-populate empty templates** in the install. Stubs that say `<your bio>` accumulate as noise. Each file should mint when its content arrives, not at install time.
- **Don't make every owner file required.** voice.md + rhythm.md + bio.md + expertise.md are the minimum-viable cascade. values.md, goals.md, opinions.md, vocabulary.md, tooling.md, family.md all mint when content earns.
- **Don't force the conversation in one direction.** The paste shortcut is faster for users with another AI; conversation is better for users without one. Offer both.
- **Don't skip the comms briefs.** Goanna explicitly calls out that not-writing inbox briefs to non-boss agents was the first real-world onboarding failure. Each non-curator agent needs a brief saying "here's what just landed relevant to you".
- **Don't ship a 12-tier pricing.md by default.** Anti-pattern from business CLAUDE.md: enterprise-shaped patterns kill small-team installs. Default to lean; let depth earn its place.

## Provenance

Sources read for this synthesis:

- `wiki/owner/{CLAUDE.md, INDEX.md, voice.md, rhythm.md, expertise.md, bio.md, values.md, goals.md, opinions.md, vocabulary.md, tooling.md, family.md}`
- `wiki/business/{CLAUDE.md, INDEX.md, values.md}`
- `templates/{CLAUDE.md, collections/owner/*.template, collections/business/*.template, collections/team/{human,role}.md.template}`
- `skills/{setup-goanna, onboard-agent, kickoff}/SKILL.md`
- Glob and list operations across `templates/`, `skills/`, `agents/`, `docs/`.

Generalised to shape, not content. Jez-specific voice rules, client names, and project specifics intentionally omitted — Office Town's owner will fill different values into the same shapes.
