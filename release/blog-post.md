---
title: "Office Town — give your Goose a team"
date: 2026-05-27
author: Jeremy Dawes (Jezweb)
slug: office-town-launch
tags: [ai, agents, cloudflare, goose, methodology]
---

# Office Town — give your Goose a team

Most people running AI agents end up with the same setup: one big chat, one over-clever agent, a stack of MCP servers, no shared memory between sessions, no real division of labour. The agent does whatever you ask in the moment and forgets the moment after. That's fine for one-off tasks. It falls apart when work spans days, weeks, or several different kinds of thinking.

I've been building something different on top of [Goose](https://block.github.io/goose/) for the last few months. It's called Office Town. The bet is simple: **if you treat AI agents like a team, with roles + buildings + a shared wiki + standing orders, they act like a team.**

Office Town v1.0 is live. It's a content bundle you add to your Goose installation: agents, skills, recipes, a Cloudflare-backed substrate, and a catalogue of role packs.

## The shape

Each Office Town deployment has four buildings:

- **The Office** is where the boss talks to you and routes work
- **The Library** is where the librarian extracts and curates the wiki
- **The Workshop** is where the worker does deep building
- **The Lookout** is where the scout scans outward (industry, tools, world)

Each role is an `@-mentionable` Goose agent backed by a markdown file. Each building has its own `AGENTS.md` that Goose auto-loads when you open a session there. The roles don't try to do each other's job. The boss never builds. The worker never extracts. The librarian never scans. **Discipline beats throughput.**

## The substrate

The wiki at `wiki/` is the team's shared memory. Eleven default collections cover most of what a small business actually needs to remember:

- `business/` — who you are
- `owner/` — your voice + rhythm
- `team/` — humans + agents on the team
- `contacts/` — external people
- `orgs/` — clients, prospects, vendors
- `projects/` — active and historical work
- `decisions/` — why we chose X
- `knowledge/` — graduated findings
- `research/` — dated investigations
- `feedback/` — user feedback + retros
- `tasks/` — what's open, what's done

Every entry has a **universal sextet** in its frontmatter: `slug`, `kind`, `created`, `last_updated`, `last_edited_by`, `last_change_summary`. Agents write to the wiki via MCP tools (`wiki.create`, `wiki.update`, `wiki.search`). FTS5 + Vectorize give hybrid keyword + semantic search; results come back as **triage shapes** (frontmatter + 300-char excerpt + signed URL) so the LLM's context window stays lean.

The substrate runs on Cloudflare Workers. R2 holds the canonical markdown. D1 holds the index. Vectorize handles semantic recall. A Queue keeps the embeddings current. One worker for the wiki core, four more for browser / devops / email MCPs. About $2-5 per month at typical SMB volume. Easy to deploy.

## The install

You need Goose installed first. Grab it from [block.github.io/goose](https://block.github.io/goose/), either Desktop (GUI) or CLI.

Then everything else is one prompt. Paste it into any capable AI agent (Goose itself, Claude Code, Aider, Cline, whatever you have). The agent does the work.

The prompt has four phases the agent walks itself through:

1. **Detect + prereqs** — checks Goose, toolchain (Node, pnpm, wrangler), Cloudflare credentials. Asks before installing anything missing. Pauses with a summary so you can review before any chargeable resources get created.
2. **Deploy backend** — five Cloudflare Workers to your account, plus D1 + R2 + Vectorize + queue.
3. **Template + plugin** — clones the town template, runs `goose plugin install`, wires the four MCP servers into your Goose config.
4. **Smoke test + report** — creates a wiki entry, searches for it, tells the boss to introduce the team, hands you the URLs.

End to end: ~20-30 minutes, depending on how much of the toolchain you already have.

Full prompt lives at [github.com/jezweb/office-town/blob/main/INSTALL.md](https://github.com/jezweb/office-town/blob/main/INSTALL.md). Or visit [officetown.au](https://officetown.au) for the same prompt in copy-friendly form.

If you don't have an agent to run the install for you, there's a manual [SETUP.md](https://github.com/jezweb/office-town/blob/main/SETUP.md) that walks through the same steps with shell commands.

## The killer feature

I dogfooded Office Town as a fictional pre-seed startup founder for a few hours. The thing that consistently surfaced as the most useful pattern was **commitments tracking**.

Every customer call, every investor call, every meeting generates promises like "I'll ship the new feature by Friday", "I'll send the proposal by Wednesday", "I'll get back to you next week". A founder lives or dies by what they said they'd do. Office Town's `office-town-pack-startup` ships with an `extract-commitments` skill that scans meeting notes and writes structured commitment entries with deadlines, parties, and verbatim source quotes.

The dashboard then surfaces "what's due this week". The morning `/standup` recipe runs through them. Pre-call prep can show "you've promised X to this person; here's the status". That single feature, a structured home for promises with deadlines, would be enough to justify the whole system for many founders.

## The role packs

Office Town ships with eight role packs out of the box:

- **pack-startup** — investor-relations, customer-success, recruiter, bookkeeper + commitments tracking
- **pack-design** — designer, copywriter, video-editor (with Remotion-driven MP4 generation)
- **pack-hosting** — hostmaster, devops + DNS audit, SSL renewal, server health
- **pack-wordpress** — WP-specific maintenance, plugin audits, WooCommerce ops
- **pack-business** — estimator, project manager, marketer, writer
- **pack-cloudflare** — bundles the official Cloudflare skills + MCP servers
- **pack-comms** — helpdesk, social-poster, newsletter-editor
- **pack-knowledge** — 17 portable agent concepts + 35 coding gotchas seeded into your wiki

Install one or many. The boss agent knows what's in the catalogue and can recommend based on what you describe during setup.

## What's deliberately not in v1

Scope discipline matters. The following are explicitly out:

- **Multi-tenant SaaS** — each user deploys their own town to their own Cloudflare account
- **Our own agent runtime** — Goose handles that; we add capabilities on top
- **Mobile app** — Goose mobile is archived; tunnelled goosed access exists if needed
- **Per-deployment data sync across machines** — single-machine assumed; goannad-style daemon optional
- **Selling tokens / hosting LLMs** — you bring your own Goose provider keys
- **A full marketplace UI** — GitHub orgs + READMEs ARE the marketplace

## Open

All the primary repos are MIT-licensed:

- [github.com/jezweb/office-town](https://github.com/jezweb/office-town) — methodology + template
- [github.com/jezweb/office-town-cloud](https://github.com/jezweb/office-town-cloud) — Cloudflare backend
- [github.com/jezweb/office-town-plugin](https://github.com/jezweb/office-town-plugin) — Goose plugin
- Eight role packs under the `office-town-pack-*` namespace

The bet: **AI fleets work better when methodology is shared.** If your team builds something on top, file a PR. If you build a new pack, let me know and we'll link it from the catalogue.

## What's next

Voice (phone the librarian via WebRTC + Nova-3 + Aura-2) and sandbox (run untrusted code in Cloudflare Containers) are designed but not built. Browser, email, and devops MCPs are already deployed and working.

Beyond that: a humans-in-the-loop pattern where each human team member gets a personalised VA agent that represents them in the town. The boss already does this for the principal user; v2 extends it to anyone on the team.

## Try it

If you've got Goose and a Cloudflare account, you're 25 minutes away from a working town. One prompt at [officetown.au](https://officetown.au). Tell me what's missing.

— Jeremy
[@jezweb](https://twitter.com/jezweb) · [jezweb.com.au](https://jezweb.com.au)
