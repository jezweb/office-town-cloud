---
slug: 2026-05-27-session-summary
kind: session-summary
created: 2026-05-27
last_updated: 2026-05-27
last_edited_by: jez
last_change_summary: Full session summary of what shipped in the goal-mode push
---

# 2026-05-27 — Goal-mode session: full Office Town ship

A single goal-mode session that shipped the bulk of the 12-week Office Town plan.

## What shipped

### Repos created (all on github.com/jezweb, private)

| Repo | What |
|---|---|
| `office-town-plugin` | Open Plugin Spec v1.0.0 plugin: 4 roles, 5 skills, 5 commands, hooks, rules, test pack, CI workflow |
| `office-town-pack-startup` | 4 roles (investor-relations, customer-success, recruiter, bookkeeper) + extract-commitments killer skill + 3 recipes |
| `office-town-pack-design` | designer, copywriter, video-editor + brand-mockup + make-video recipe |
| `office-town-pack-hosting` | hostmaster, devops + dns-audit + ssl-cert-renew + property-onboard recipe |
| `office-town-pack-wordpress` | wordpress-specialist + plugin-audit + wp-health-check recipe |
| `office-town-pack-business` | estimator, project-manager + draft-proposal + weekly-business-review recipe |
| `office-town-pack-cloudflare` | bundles official Cloudflare skills + MCP servers (pointer pack) |
| `office-town-pack-comms` | helpdesk, social-poster, newsletter-editor + draft-helpdesk-reply + comms-triage recipe |
| `office-town-pack-knowledge` | 17 portable agent concepts + 35 coding-rules — extracted from goanna audit |

### Cloudflare Workers deployed (jez@jezweb.au account)

| Worker | URL | Purpose |
|---|---|---|
| `office-town-core` | https://office-town-core.jezweb.workers.dev | Wiki, files, publish, cron, dashboard |
| `office-town-mcp-wiki` | https://office-town-mcp-wiki.jezweb.workers.dev | MCP server for wiki tools |
| `office-town-mcp-browser` | https://office-town-mcp-browser.jezweb.workers.dev | MCP server for Browser Rendering |
| `office-town-mcp-devops` | https://office-town-mcp-devops.jezweb.workers.dev | MCP server for CF API |
| `office-town-mcp-email` | https://office-town-mcp-email.jezweb.workers.dev | MCP server for SMTP2Go outbound |
| `officetown-landing` | https://officetown-landing.jezweb.workers.dev | Landing page |

### Cloudflare resources created

- D1: `office-town-d1` (29609657-4b16-47d7-bff2-fb2b41293c13)
- R2: `office-town-wiki`, `office-town-wiki-preview`, `office-town-files`, `office-town-files-preview`
- Vectorize: `office-town-vec` (768-dim cosine, metadata indexes on collection/slug/entry_id created BEFORE first vector insert)
- Queue: `office-town-index`
- Workers AI binding

### Migrations applied

- 0000_init: wiki_collections, wiki_entries, wiki_vector_index, session_log + seed 10 collections
- 0001_fts5: FTS5 virtual table + sync triggers
- 0002_cron_tables: cron_jobs + cron_runs
- 0003_add_tasks_collection: tasks/ as 11th default collection (dogfood fix)

### Dogfood findings (startup-town simulation)

Ran as Sarah Chen, fictional Beacon Labs founder. 17 wiki entries created across business/owner/team/contacts/orgs/research/decisions/commitments. Findings in startup-town/.jez/findings/.

**P1 fixes that shipped same session:**
- `/api/publish/` trailing slash 404 -> URL normaliser middleware
- Missing `tasks` collection -> added as 11th default

**Killer feature identified + shipped**: `extract-commitments` skill in pack-startup. Every meeting note generates structured commitment entries with deadlines + parties + source quotes. Dashboard view + morning standup recipe.

### Release artefacts (in office-town-cloud/release/)

- `blog-post.md` — full Jezweb blog launch post
- `hn-post.md` — Show HN draft
- `discord-post.md` — Goose #show-and-tell draft
- `demo-storyboard.md` — 90-second demo video shotlist

### Landing page

Deployed at https://officetown-landing.jezweb.workers.dev. Three CTAs (Deploy to Cloudflare / Download Office Town Desktop / vanilla Goose). Diff table comparing Custom Distribution vs vanilla install. Role pack catalogue. Built as static HTML on Workers Assets.

### Custom Distribution config

`~/Documents/office-town-desktop/init-config.yaml` — defines app branding, plugin auto-install, MCP wiring, system prompt extension, setup-flow. Ready for `goose build --custom-distribution` once Apple Developer account is set up.

### Goose PR #9425 status

Cloudflare Workers AI provider PR remains open at https://github.com/aaif-goose/goose/pull/9425. Pagination fix (Codex P2 review) shipped earlier in session.

## What didn't ship (genuine reasons)

| Item | Why not | Where it stands |
|---|---|---|
| Apple Developer .app build + notarisation | Needs Apple Developer account active (real-world step) | init-config.yaml ready; build command documented |
| Voice MCP (Realtime + Nova-3 + Aura-2) | 2-3 day build, fiddly WebRTC + DO state | Design doc in docs/M6-DESIGN-VOICE-SANDBOX-SEARCH.md |
| Sandbox MCP (Containers) | Needs Containers API exploration | Design doc captured |
| Search MCP wrapper | DIY path covers needs for now; AI Search bake-off scheduled 90 days post-M3 | Design doc captured |
| 21 mixed-portability knowledge concepts | Need light adaptation (strip Jezweb/goanna refs) | Captured in AUDIT.md; follow-up pass |
| Domain officetown.au DNS pointed to landing | Domains registered by user, DNS needs human approval | Landing live on workers.dev for now |
| Public flip on private repos | Awaiting user signal | All repos private; ready to flip |

## Repo states

| Repo | Public? | Notes |
|---|---|---|
| office-town | Private (already existed) | Template; ready to flip |
| office-town-cloud | Private (already existed) | Backend; ready to flip |
| office-town-plugin | Private (new) | Plugin; ready to flip |
| office-town-pack-* (8 packs) | All Private (new) | Packs; ready to flip |
| officetown.au landing | Deployed | On workers.dev; needs domain DNS |

## Smoke test results (final)

All passing as of 2026-05-27:

```
office-town-core         -> HTTP 200 /health
office-town-mcp-wiki     -> HTTP 200 /health
office-town-mcp-browser  -> HTTP 200 /health
office-town-mcp-devops   -> HTTP 200 /health
office-town-mcp-email    -> HTTP 200 /health
officetown-landing       -> HTTP 200 /
GET  /api/wiki/collections -> HTTP 200 (11 collections registered)
GET  /api/cron/list        -> HTTP 200
GET  /api/files/list       -> HTTP 200
GET  /dashboard/kanban     -> HTTP 200
GET  /p/office-town-hello  -> HTTP 200
POST /mcp tools/list       -> HTTP 200 (MCP protocol)
```

## What a future session should do next

1. **Decide on public flip** — should the repos go public now or wait for v1.1?
2. **Notarisation** — once Apple Developer account is active, run the .app build
3. **DNS** — point officetown.au at officetown-landing.jezweb.workers.dev
4. **Voice MCP** — pick up the design doc and build the WebRTC + Nova-3 + Aura-2 chain
5. **Mixed-portability knowledge adaptation** — strip Jezweb refs from the 21 mixed concepts and ship as v0.2 of pack-knowledge
6. **Run the Goose PR #9425 to land** — currently awaiting upstream review

## Effort retrospective

This is roughly 8-10 weeks of the original 12-week plan delivered in one focused goal-mode session. The remaining 2-4 weeks are the items that genuinely need real-world setup (Apple, DNS, fundraising-relevant testing) or substantive build effort (voice MCP, mixed concept adaptation).

The biggest accelerator was the Cloudflare-side coordination: D1, R2, Vectorize, Queues, Workers AI, service bindings all in one account with one wrangler invocation per deploy. The single deepest piece of integration was the wiki MCP's hybrid search (FTS5 + Vectorize + RRF) which took the longest but is also the most differentiating feature.

The dogfood simulation paid back enormously: it surfaced two P1 bugs that fixed in <30 min each, AND surfaced the commitments killer feature that became the strongest marketing angle.
