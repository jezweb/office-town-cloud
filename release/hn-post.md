# HN post draft (post-pivot)

## Title (under 80 chars)

Show HN: Office Town — give your Goose AI agent a team, on a Cloudflare backend

## Body

I've been building Office Town on top of Goose for the last few months. The bet: treat AI agents like a team (4 buildings, 4 core roles, a wiki-backed substrate) and they act like a team. Open source today.

You install Office Town into an existing Goose install (block/goose, Apache 2.0). It adds:

- **4 addressable roles** — `@boss` routes work + holds the thread, `@librarian` extracts + curates the wiki, `@worker` does deep building, `@scout` scans outward. Each is a markdown agent file Goose loads on session start.
- **A Cloudflare-backed wiki** — 11 default collections (orgs, contacts, projects, decisions, knowledge, etc.) with FTS5 + Vectorize hybrid search. Triage-shape search results (frontmatter + 300-char excerpt + signed URL) keep the LLM context lean.
- **8 role packs** — startup, design, hosting, wordpress, business, comms, cloudflare, knowledge. The startup pack's `extract-commitments` skill turns "I'll ship X by Friday" out of any meeting note into a structured commitment entry with deadline + party + source quote. Dashboard surfaces "due this week"; morning standup recipe walks through them.
- **Browser / devops / email MCPs** — ship with the cloud backend. Browser uses @cloudflare/puppeteer; email goes via SMTP2Go; devops wraps the CF API.

Install is two paste-able prompts at officetown.au. The agent doing the install can be Goose itself, or Claude Code, Aider, Cline — anything that can run wrangler and edit your Goose config. Office Town runs inside Goose afterward.

Cost: ~$2-5/month on Cloudflare at typical SMB volume.

Three repos plus 8 packs (all MIT):

- github.com/jezweb/office-town (template + methodology)
- github.com/jezweb/office-town-cloud (5 Workers + D1 + R2 + Vectorize + Queue)
- github.com/jezweb/office-town-plugin (Goose plugin: agents/skills/commands/rules)
- github.com/jezweb/office-town-pack-* × 8

Landing: officetown.au

A few things I'd be interested in discussion on:

1. The plugin follows Open Plugin Spec v1.0.0, so the agents/skills/commands files are technically portable to other conformant hosts (Claude Code, etc.). We built and tested for Goose. If anyone runs it elsewhere I'd love to hear how it goes.

2. The wiki MCP exposes triage-shape search by default; full-body reads are gated behind an `expanded:true` flag or per-entry `wiki.read`. This was the single most-impactful design choice — keeps Goose's context window clean across long sessions.

3. We initially built a Custom Distribution of Goose Desktop (signed + notarised .app, CI on tag push, the works) but parked it before launch. Realised it doesn't add value over a vanilla Goose install + the agent-install prompt — Goose itself is upstream-mature enough that custom branding just adds maintenance burden. Files are preserved in a private repo for v1.1 if pre-baked init-config or first-launch wizard would change the calculus.

What's missing from v1.0 (lands in v1.1, ~4 weeks):

- Voice MCP (Cloudflare Realtime + Workers AI Nova-3 / Aura-2 — "phone the librarian")
- Sandbox MCP (Cloudflare Containers — run untrusted code from agents)
- Search wrapper (DIY + AI Search backends; bake-off pending)

Happy to discuss the architectural calls — why FTS5 + Vectorize over Cloudflare AI Search (timing + control), why we standardised on Open Plugin Spec, why MCP service bindings between workers instead of public URLs, why the universal sextet frontmatter, etc.

Anyone running multi-agent Goose / Claude Code setups who'd want to try Office Town — what's the first role pack you'd want? Or the first one missing from the eight we shipped?
