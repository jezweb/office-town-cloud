---
title: "Office Town — AI agents that work like a team"
date: 2026-05-27
author: Jeremy Dawes (Jezweb)
slug: office-town-launch
tags: [ai, agents, cloudflare, goose, methodology]
---

# Office Town — AI agents that work like a team

Most AI agent setups end up the same way: a single chat, a stack of MCP servers, no shared memory between sessions, no real division of labour. The agent does whatever you ask in the moment and forgets the moment after. It works for one-off tasks. It falls apart when work spans days or weeks.

I've been building something different for the last few months. It's called Office Town. The bet is simple: **if you treat AI agents like a team — with roles, buildings, a shared wiki, and standing orders — they act like a team.**

Office Town v1.0 is live today. Three repos, one Cloudflare-backed substrate, and a plugin that drops it all into [Goose](https://github.com/block/goose). Let me show you the shape.

## The shape

A town has four buildings:

- **Office** — where the boss talks to you and routes work
- **Library** — where the librarian extracts and curates the wiki
- **Workshop** — where the worker does deep building
- **Lookout** — where the scout scans outward — industry, tools, world

Each role is a markdown file in `agents/`. Each building has an `AGENTS.md` that Goose auto-loads when you open a session there. The agents don't try to do each other's job. The boss never builds. The worker never extracts. The librarian never scans. **Discipline beats throughput.**

## The substrate

The wiki at `wiki/` is the team's shared memory. Ten default collections cover most of what a small business actually needs to remember:

- `business/` — who you are
- `owner/` — your voice + rhythm
- `team/` — humans + agents
- `contacts/` — external people
- `orgs/` — clients, prospects, vendors
- `projects/` — active and historical
- `decisions/` — why we chose X
- `knowledge/` — graduated findings
- `research/` — dated investigations
- `tasks/` — what's open, what's done

Every entry has a **universal sextet** in its frontmatter: `slug`, `kind`, `created`, `last_updated`, `last_edited_by`, `last_change_summary`. Agents write to the wiki via MCP tools (`wiki.create`, `wiki.update`, `wiki.search`). FTS5 + Vectorize give hybrid keyword + semantic search; results come back as **triage shapes** (frontmatter + 300-char excerpt + signed URL) to keep the LLM's context window lean.

The substrate runs on Cloudflare Workers. R2 holds the canonical markdown. D1 holds the index. Vectorize handles semantic recall. A Queue keeps the embeddings current. One worker, one database, one bucket, one index. Cheap to run. Easy to deploy.

## Try it

Two paths:

**Office Town Desktop (recommended)**:
1. Download Office Town Desktop from [officetown.au/download](https://officetown.au)
2. Open it, sign in with Google
3. Click "Deploy to Cloudflare"
4. Paste your bearer token. Done.

**Vanilla Goose**:
1. Install Goose
2. `goose plugin install jezweb/office-town-plugin`
3. Click "Deploy to Cloudflare" for the backend
4. Wire 7 MCP servers in Goose settings
5. ...you get the idea. Office Town Desktop bundles all this.

## The killer feature: commitments

I dogfood'd Office Town as a fictional pre-seed startup founder for a few hours. The thing that consistently surfaced as the most useful pattern was **commitments tracking** — every customer call, every investor call, every meeting generated promises like "I'll ship X by Friday", "I'll send Y next week", "I'll get back to you by EOQ". A founder lives or dies by what they said they'd do. Office Town's `office-town-pack-startup` ships with an `extract-commitments` skill that scans meeting notes and writes structured commitment entries with deadlines, parties, and source quotes. The dashboard surfaces "what's due this week". The morning `/standup` recipe runs through them.

That single feature — a structured home for promises with deadlines — would be enough to justify the whole system for many founders.

## Packs

Office Town ships with 8 role packs out of the box:

- `pack-startup` — investor relations, customer success, recruiter, bookkeeper + commitments
- `pack-design` — designer, copywriter, video-editor (Remotion-driven MP4)
- `pack-hosting` — hostmaster, devops + DNS audit, SSL renewal
- `pack-wordpress` — WP-specific maintenance
- `pack-business` — estimator, project manager, marketer, writer
- `pack-cloudflare` — bundles official Cloudflare skills + MCP
- `pack-comms` — helpdesk, social, newsletter
- `pack-knowledge` — 17 portable agent concepts + 35 coding gotchas seeded into your wiki

Install one or many. The boss agent knows what's in the catalogue and can recommend based on what you describe in setup.

## What's deliberately not in v1

- Multi-tenant SaaS — each user deploys their own town
- Custom Electron app from scratch — Custom Distribution path is in v1.1
- Mobile — Goose mobile is archived; tunnelled access exists if needed
- Voice — designed but not built; lands in v1.1

## Open

All three repos are MIT. The methodology, the cloud backend, the plugin, the role packs — open source. The bet: **AI fleets work better when methodology is shared.** If your team builds something on top, file a PR; if you build a new pack, let me know and we'll link it from the catalogue.

[github.com/jezweb/office-town](https://github.com/jezweb/office-town)
[github.com/jezweb/office-town-cloud](https://github.com/jezweb/office-town-cloud)
[github.com/jezweb/office-town-plugin](https://github.com/jezweb/office-town-plugin)

## What's next

v1.1 ships voice (phone the librarian via WebRTC), browser (already deployed — agents fetch + screenshot + extract from any URL), email (already deployed — agents draft and send via SMTP2Go), and sandbox (run untrusted code in Cloudflare Containers). 3-4 weeks out.

If this resonates, **try it and tell me what's missing.** The pack catalogue grows from real friction, not speculation.

— Jeremy
[@jezweb](https://twitter.com/jezweb) · [jezweb.com.au](https://jezweb.com.au)
