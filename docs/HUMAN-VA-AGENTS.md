# Human + VA agent — hybrid team citizens (v2)

Office Town v2 introduces real humans as first-class citizens of the town via personalised VA (virtual assistant) agents. Each human team member gets a VA that lives in the town as them, responding instantly in town-time and escalating to the actual human via their configured channel when judgment is needed.

## Why this design (not "humans as runtime: human")

The naive design was "humans become @-mentionable directly, with runtime: human; inbox messages route to their email." Problems:

- Town blocks waiting for the human to respond
- Routine work that doesn't need human judgment still requires their attention
- Humans get raw delegations, not curated context
- The town's pace is reduced to the human's response time

The VA model fixes all of this:

| Scenario | Direct human-as-runtime | Human + VA |
|---|---|---|
| Boss delegates routine draft to Sue | Sue gets the email; town waits; Sue replies tomorrow | Sue's VA drafts immediately based on Sue's voice; town continues; Sue reviews when ready |
| Boss delegates judgment call to Sue | Same — Sue gets it raw, has to figure out context | Sue's VA prepares the context summary + draft recommendation + escalates with clear ask: "ready for your decision, here's what I'd suggest" |
| Sue is on holiday | Town blocked on Sue's work | Sue's VA handles routine; flags non-routine items for when Sue returns; the town keeps moving |
| Sue's voice in town-generated artifacts | Sue has to write everything | Sue's VA learns her voice from `wiki/team/humans/sue/voice.md` and writes in it; Sue reviews + adjusts |

## How a VA is configured

Each human in `wiki/team/humans/<slug>/` has:

```
wiki/team/humans/sue/
├── contact.md              # who is Sue (name, email, role, etc.)
├── voice.md                # how Sue communicates (her own version of wiki/owner/voice.md)
├── va-config.md            # the VA's rules + escalation policy
└── notification-channel.md # how to reach Sue
```

The VA agent is named `<slug>-va` or just `<slug>` (we use the latter — `@sue` is the VA; `@sue-direct` bypasses for rare direct contact).

### `va-config.md` shape

```yaml
---
slug: sue-va
kind: va-config
human_slug: sue
auto_handle: [draft_email, schedule_meeting, file_contact, summarise_thread]
escalate_for: [pricing_decision, client_signoff, contract_changes]
escalate_below_confidence: 0.8     # if VA is unsure, escalate
auto_send_threshold: low_risk      # send autonomously only if risk score = low
voice_source: wiki/team/humans/sue/voice.md
escalation_channel: email          # email | slack | imessage | sms
escalation_email: sue@example.com
working_hours: "Mon-Fri 9-5 AEST"
on_holiday_until: null             # set when Sue's away
last_updated: 2026-05-26
---

# Sue's VA configuration

## What Sue's VA can do without asking

[free-text rules for the VA — Sue writes this]

## What needs Sue's approval

[free-text rules for escalation]

## Sue's preferences when drafting

[tone, framing, what to never say, etc.]
```

### How the VA acts

When `@sue` receives a delegation:

1. **Check the brief against `va-config.md`**:
   - Auto-handlable? → do it, log to journal, optionally notify Sue
   - Needs escalation? → prepare context + draft → send to `escalation_channel` → wait for response
2. **Voice match**: load Sue's voice from `voice.md` + relevant body content
3. **Confidence check**: if the VA's confidence in the draft is below `escalate_below_confidence`, surface for Sue's review even if the topic is auto-handlable
4. **Log everything**: every action logged to `wiki/team/humans/sue/journal/<date>.md` so Sue can audit on return

### How the human responds back to the town

Sue replies to the escalation email/message. Her reply lands back in the town as a journal entry on the original task. The VA continues:

- "Sue approved the draft" → VA sends the draft
- "Sue wants changes" → VA revises, optionally re-escalates
- "Sue handled it directly" → VA logs Sue's action and stands down on this thread

## Onboarding a human (in v2 setup flow)

When the user adds a human team member during setup or later:

1. Capture basics: name, role, email, voice samples
2. Create `wiki/team/humans/<slug>/contact.md` and `voice.md`
3. Create default `va-config.md` with sensible defaults
4. Walk through escalation policy: "what should your VA decide on its own? what should it always ask you about?"
5. Configure notification channel
6. Set the VA active

The human can later refine `va-config.md` directly or via @-mentioning their own VA: "@sue from-jez, please add 'prefer concise responses unless I ask for detail' to your config."

## The hybrid town in practice

A typical Office Town deployment might have:

| Role | Type | Behaviour |
|---|---|---|
| `@boss` | AI agent | Routes work, holds the thread |
| `@librarian` | AI agent | Extracts + curates the wiki |
| `@worker` | AI agent | Deep work |
| `@scout` | AI agent | Outward scanning |
| `@jez` | Human's VA | Acts on Jez's behalf, escalates when needed |
| `@sue` | Human's VA | Acts on Sue's behalf, escalates when needed |
| `@mark` | Human's VA | Acts on Mark's behalf, escalates when needed |

The boss delegates to any of them the same way. The town doesn't have to know who's a "pure AI" vs who's an "AI representing a human." Both are first-class.

This is genuinely a workspace for hybrid teams — the work flows, the humans stay in the loop on what matters, and routine work doesn't grind to a halt waiting for humans to wake up.

## Implementation notes (for when v2 lands)

- Each VA is just a Goose agent — same `.md` file shape, lives in `~/.agents/agents/<slug>.md`
- The VA's role file references the human's `voice.md` and `va-config.md` for context
- Escalation is a built-in tool (`escalate_to_human(message, channel)`) provided by the office-town-wiki MCP
- Reply parsing is straightforward: poll the configured channel (Gmail API, Slack webhook, iMessage AppleScript) and route replies into the journal

Effort estimate: 1-2 weeks for v1 of the VA pattern. The escalation channel integration is the fiddly bit (per-channel auth, polling vs webhook, reply parsing). Worth doing once Office Town v1.1 is shipping and we have real users wanting to onboard their teams.

## Why this matters for product positioning

"AI agent fleet" is a developer/technical-buyer pitch. "Workspace for hybrid teams where AI handles the routine and humans handle the judgment" is an SME/business-buyer pitch. The same architecture serves both, but the second framing is what wins business customers.

When Office Town v2 ships this, we lead the marketing with the hybrid story.
