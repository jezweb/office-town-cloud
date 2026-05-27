# Goose Discord — #show-and-tell post draft (post-pivot)

🏢 **Office Town v1.0 — capabilities that turn your Goose into a team**

Hey Goose community 👋 Just shipped Office Town v1.0 — a content bundle you add to your Goose installation that gives it 4 addressable roles, a Cloudflare-backed wiki, and 8 role packs.

**What it is**: 4 buildings (office/library/workshop/lookout) + 4 core roles (@boss / @librarian / @worker / @scout). Each role is a markdown agent file that Goose loads on session start. The boss routes work, the librarian extracts and curates the wiki, the worker does deep building, the scout scans outward. They don't try to do each other's job.

**The substrate**: Wiki on R2 + D1/FTS5 + Vectorize. Hybrid keyword + semantic search. Triage-shape results (frontmatter + 300-char excerpt + signed URL) to keep your context window lean. Runs on Cloudflare Workers — about $2-5/month at typical usage.

**Install**: Two prompts at officetown.au. Prompt A checks toolchain + Cloudflare. Prompt B deploys 5 workers + `goose plugin install` + edits your `~/.config/goose/config.yaml` to wire the 4 MCP servers. About 25 minutes end-to-end.

The agent running the install doesn't have to be Goose — Claude Code, Aider, Cline, anything capable can do it. Office Town runs inside your Goose afterward regardless.

**The killer feature** I keep coming back to is `extract-commitments` from the startup pack. Every meeting note generates structured commitments with deadlines + parties + verbatim source quotes. The dashboard surfaces "due this week". Founders' #1 friction → solved.

**8 packs ship out of the box**: startup, design, hosting, wordpress, business, comms, cloudflare, knowledge. The knowledge pack alone seeds your wiki with 17 portable agent concepts + 35 coding gotchas (Cloudflare patterns, React Hook Form gotchas, OAuth cookies, etc.).

**Repos** (all MIT):

- Template: github.com/jezweb/office-town
- Cloud backend: github.com/jezweb/office-town-cloud
- Plugin: github.com/jezweb/office-town-plugin
- 8 packs: github.com/jezweb?tab=repositories&q=office-town-pack

**Demo + screenshots**: officetown.au

Would love feedback from anyone running multi-agent setups in Goose — what's a role pack we should add? What's a pattern you wish was captured but isn't?

A few specific asks for review:

1. **MCP server shape** — wiki/files/publish/cron/browser/devops/email are streamable-HTTP MCPs. Service-bound between each other to avoid cross-zone fetch overhead. Anyone seeing similar patterns work / not work?

2. **Goose plugin install path** — we use the standard `goose plugin install jezweb/office-town-plugin` + edit config.yaml flow. Curious if there's a cleaner pattern for distributing custom MCP server wirings alongside a plugin.

3. **Custom Distribution detour** — we built and shipped a signed .app via Custom Distribution (rebranded Goose Desktop) then realised it didn't add value over vanilla Goose + paste-prompt install. Goose Desktop's own UX is good enough. Parked the .app for v1.1 when init-config auto-load + first-launch wizard would justify it. Has anyone else explored Custom Distribution and reached similar conclusions?

Happy to help anyone get their first Office Town running.

— Jez (Jezweb)
