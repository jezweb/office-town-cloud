> ⚠️ **PRE-PIVOT DRAFT (2026-05-27)** — written when Office Town was framed as a host-agnostic methodology with a Custom Distribution Mac app. After dogfood + reflection, Office Town was repositioned as "capabilities for Goose" and the .app was parked. This draft needs an editing pass before publishing: remove Office Town Desktop references, lead with the Goose-first install path.

# 90-second demo video storyboard

The single demo video for the v1.0 launch. Target: HN + Discord + landing-page hero.

## Scene 1 — 0:00-0:08

**Visual**: Office Town Desktop icon → opens → splash screen with brand colours

**Voiceover**: "Office Town. AI agents that work like a team."

## Scene 2 — 0:08-0:18 — Setup

**Visual**: Setup flow steps in the app:
1. "Connect to Cloudflare" — paste token
2. "Choose your town location"
3. "Deploy to Cloudflare" — click → progress → green checks → done

**Voiceover**: "One-click deploy. Cloudflare Workers, D1, R2, Vectorize. About 45 seconds to a working backend."

## Scene 3 — 0:18-0:30 — First session: setup recipe

**Visual**: Goose Desktop chat — boss agent walks through the 7-step setup, conversationally:
- "What's the business?"
- "How should I sound?"
- "Who's on the team?"

**Voiceover**: "The boss agent walks you through onboarding. Captures your voice, your team, your customers. Conversational — not a form."

## Scene 4 — 0:30-0:50 — Real work: customer call debrief

**Visual**: User pastes customer call notes into chat with `/customer-call-debrief org_slug:acme`. Cuts to:
- Boss routes to customer-success agent
- Customer-success files structured summary to research/
- Extract-commitments skill fires, creates 3 commitment entries
- Dashboard refreshes showing the new commitments

**Voiceover**: "Paste meeting notes. The customer-success agent files them, extracts commitments with deadlines, and surfaces them on your dashboard."

## Scene 5 — 0:50-1:05 — The commitments killer feature

**Visual**: Dashboard `/dashboard/wiki?c=commitments` — 3 commitments listed with due dates, priorities, source quotes. Click into one → full detail with the verbatim quote from the call.

**Voiceover**: "Every promise tracked. Every deadline visible. A founder lives or dies by what they said they'd do — Office Town makes that visible."

## Scene 6 — 1:05-1:20 — Delegation chain

**Visual**: User asks "@worker draft the weekly investor update". Cuts to:
- Worker pulls metrics from wiki
- Drafts in founder's voice
- Saves to research/ with kind:investor-update-draft
- Boss reports back with the draft + sent destination

**Voiceover**: "Delegate. The worker drafts in your voice. The librarian curates. The scout watches. They do their jobs."

## Scene 7 — 1:20-1:30 — Close

**Visual**: Pan over landing page → 3 download buttons → fade to officetown.au URL

**Voiceover**: "Office Town. Open source. Cloudflare-backed. Get your fleet acting like a team. officetown.au."

## Production notes

- 1080p 30fps, MP4 H.264
- Screen-recorded actual app (no mockups)
- Audio: light brand background, no music over voiceover
- Captions burned-in (most HN viewers watch muted)
- Length cap: 90 seconds (no longer; people drop off after 60)

## Alternate cuts

- **30-second cut** for Twitter/X: scenes 1, 4, 5, 7
- **15-second cut** for landing-page hero: scenes 1, 5

## Tool

Built via the pack-design `make-video` recipe — Remotion + voiceover via ElevenLabs (or human VO via Sarah's voice match if available).
