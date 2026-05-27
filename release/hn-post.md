> ⚠️ **PRE-PIVOT DRAFT (2026-05-27)** — written when Office Town was framed as a host-agnostic methodology with a Custom Distribution Mac app. After dogfood + reflection, Office Town was repositioned as "capabilities for Goose" and the .app was parked. This draft needs an editing pass before publishing: remove Office Town Desktop references, lead with the Goose-first install path.

# HN post draft

## Title (under 80 chars)

Show HN: Office Town — markdown methodology for AI agent fleets on Cloudflare

## Body

I've been building Office Town for the last few months. The bet: treat AI agents like a team — four buildings, four core roles, a wiki-backed substrate — and they act like a team. Open source today.

The shape: every Office Town deployment has 4 buildings (office, library, workshop, lookout), each with an `AGENTS.md` that Goose auto-loads. The boss routes work; the librarian extracts + curates the wiki; the worker builds; the scout scans. They @-mention each other. Discipline beats throughput — the boss never builds, the worker never extracts.

The substrate runs on Cloudflare Workers. R2 holds the canonical markdown. D1 + FTS5 + Vectorize give hybrid keyword + semantic search. One worker, one Vectorize index, ~$2/mo at typical usage.

The killer feature came from dogfooding as a fictional pre-seed startup founder: structured commitment tracking. Every customer call generates promises like "I'll ship X by Friday". The `extract-commitments` skill scans meeting notes and writes commitments with deadlines, parties, and source quotes. The dashboard surfaces "due this week". The morning `/standup` walks through them.

8 role packs ship out of the box: startup, design, hosting, wordpress, business, cloudflare, comms, knowledge. Pack-knowledge bundles 17 portable agent concepts + 35 coding gotchas — your wiki starts with real wisdom, not empty folders.

Deploy in 2 ways: (1) Office Town Desktop — download .app, sign in with Google, click "Deploy to Cloudflare", paste token, done. (2) Vanilla Goose — `goose plugin install jezweb/office-town-plugin`, configure 7 MCPs.

Three repos (all MIT):
- github.com/jezweb/office-town (template + methodology)
- github.com/jezweb/office-town-cloud (Cloudflare backend)
- github.com/jezweb/office-town-plugin (Goose plugin)

Landing: officetown.au

Happy to discuss the architectural choices (why FTS5 + Vectorize over AI Search, why MCP Sampling for classification, why Custom Distribution over a fresh Electron app) and the methodology choices (why the wiki is the substrate, why agents stay disciplined to their building, why commitments are first-class).

What's missing from v1.0 (lands in v1.1, ~4 weeks):
- Voice — phone the librarian via WebRTC + Nova-3 + Aura-2
- Sandbox — run untrusted code in Cloudflare Containers
- The mixed-portability concepts from goanna (21 still to adapt)

Would love feedback from anyone running multi-agent Goose / Claude Code setups — what role packs would actually help you?
