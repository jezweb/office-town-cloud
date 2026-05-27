# 90-second demo video storyboard (post-pivot)

The single demo video for the v1.0 launch. Target: HN + Goose Discord + landing-page hero.

## Scene 1 — 0:00-0:08 — Open

**Visual**: officetown.au landing page. Hero text "Goose capabilities that work like a team". Quick pan to the "paste into your AI agent" CTA.

**Voiceover**: "If you've got Goose, you've got an AI agent. What if you had a whole team?"

## Scene 2 — 0:08-0:20 — The shape

**Visual**: Folder tree of the town (the `your-town/` ASCII block from the landing). Highlight each building as it's named.

**Voiceover**: "Office Town gives your Goose four addressable roles. A boss who routes work. A librarian who extracts and curates the wiki. A worker who does deep building. A scout who scans outward."

## Scene 3 — 0:20-0:35 — Install

**Visual**: User pastes the single install prompt into a Claude Code terminal (or Goose chat — either reads well). Speed up the agent's work as it walks itself through the four phases: toolchain check + Cloudflare creds, then deploys ticking off (D1, R2, Vectorize, queues, 5 workers), then `goose plugin install` lines, then a green smoke-test result. Show the agent pause and ask "proceed?" after Phase 1 — that's the deliberate consent gate.

**Voiceover**: "One prompt. The agent you already use runs the install. Twenty-five minutes later you've got five Cloudflare workers, a Goose plugin, four MCPs wired up, and a town folder ready."

## Scene 4 — 0:35-0:55 — Real work: customer call debrief

**Visual**: User pastes a meeting transcript into Goose chat with `/customer-call-debrief org_slug:acme`. Cuts to:

- Boss routes to customer-success agent
- Customer-success files structured summary to research/
- Extract-commitments skill fires, creates 3 commitment entries
- Dashboard refreshes showing the new commitments with due dates

**Voiceover**: "Paste meeting notes. The customer-success agent files them, extracts your commitments with deadlines, and surfaces them on your dashboard."

## Scene 5 — 0:55-1:10 — The killer feature

**Visual**: Dashboard `/dashboard/wiki?c=commitments` — 3 commitments listed with due dates, priorities, source quotes. Click into one → full detail showing the verbatim quote from the original call.

**Voiceover**: "Every promise tracked. Every deadline visible. A founder lives or dies by what they said they'd do — Office Town makes that visible."

## Scene 6 — 1:10-1:25 — Delegation chain

**Visual**: User asks `@worker draft the monthly investor update`. Cuts to:

- Worker pulls metrics from wiki
- Drafts in the founder's voice (which the librarian captured during onboarding)
- Saves to research/ with kind:investor-update-draft
- Boss reports back to user with the draft + send instructions

**Voiceover**: "Delegate. The worker drafts in your voice. The librarian curates. The scout watches. They each do their own job."

## Scene 7 — 1:25-1:30 — Close

**Visual**: Pan over landing page → "Paste into your AI agent" button → fade to officetown.au URL.

**Voiceover**: "Office Town. Open source. Cloudflare-backed. Give your Goose a team. officetown.au."

## Production notes

- 1080p 30fps, MP4 H.264
- Screen-recorded actual app + landing page (no mockups)
- Audio: light brand background, no music over voiceover
- Captions burned-in (most HN viewers watch muted)
- Length cap: 90 seconds (no longer; people drop off after 60)

## Alternate cuts

- **30-second cut** for Twitter/X: scenes 1, 4, 5, 7
- **15-second cut** for landing-page hero: scenes 1, 5

## What we removed from the pre-pivot storyboard

- The "Download Office Town Desktop" scene (Custom Distribution was parked)
- The "click Deploy to Cloudflare from inside the app" scene (replaced with paste-prompt flow)
- Any "no Goose required" framing (Goose IS required now)

## Tools

- Screen recording: macOS Screenshot + QuickTime, or Loom
- Voiceover: human read of script preferred (warm, direct, Aussie). ElevenLabs as backup if needed.
- Editing: any NLE; the cuts above are simple enough for iMovie / DaVinci Resolve.
- The video-editor role in pack-design ships with a Remotion recipe (`make-video.yaml`) for future programmatic versions — but for the launch demo, record it real.
