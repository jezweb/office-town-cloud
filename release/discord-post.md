# Goose Discord — #show-and-tell post draft

🏢 **Office Town v1.0 — AI agents that work like a team**

Hey Goose community 👋 Just shipped Office Town v1.0 — a markdown methodology for Goose-based agent fleets, Cloudflare-backed substrate, 8 role packs.

**The shape**: 4 buildings (office/library/workshop/lookout) + 4 core roles + wiki-backed substrate. Each role is a markdown file in `agents/`. Each building has its own `AGENTS.md` that Goose auto-loads. The boss routes work, the librarian extracts/curates the wiki, the worker builds, the scout scans.

**Substrate**: Wiki on R2 + D1/FTS5 + Vectorize. Hybrid keyword + semantic search. Triage-shape results (frontmatter + 300-char excerpt + signed URL) to keep your context window lean. Runs on Cloudflare Workers — one worker, ~$2/mo at typical usage.

**Install**: `goose plugin install jezweb/office-town-plugin` then click "Deploy to Cloudflare" for the backend.

**The killer feature** I keep coming back to is `extract-commitments` from the startup pack. Every meeting note generates structured commitments with deadlines + parties + source quotes. The dashboard surfaces "due this week". Founders' #1 friction → solved.

**8 packs ship out of the box**: startup, design, hosting, wordpress, business, cloudflare, comms, knowledge. The knowledge pack alone seeds your wiki with 17 portable agent concepts + 35 coding gotchas (Cloudflare patterns, React Hook Form gotchas, OAuth cookies, etc.).

**Repos** (all MIT):
- Template: github.com/jezweb/office-town
- Cloud backend: github.com/jezweb/office-town-cloud
- Plugin: github.com/jezweb/office-town-plugin

**Demo + screenshots**: officetown.au

Would love feedback from anyone running multi-agent setups — what role packs would actually help you? What's a pattern you wish was captured but isn't?

A few specific asks for review:
1. The MCP servers (wiki/files/publish/cron/browser/devops/email) — would the streamable-HTTP shape work for your setup?
2. The Custom Distribution path — anyone else interested in white-labelling Goose for client deployments?
3. The plugin spec — we follow Open Plugin Spec v1.0.0 (cross-host portable). Have you tested it in Claude Code?

Happy to help anyone get their first town running.

— Jez
