---
title: Single-Worker Collapse — Plan
date: 2026-05-27
status: drafted, awaiting Jez review
companion: single-worker-collapse-build-spec-2026-05-27.md
---

# Single-Worker Collapse

> Companion build spec: `single-worker-collapse-build-spec-2026-05-27.md`
> (this doc is the **why and shape**; the build spec is the **how**)

## Executive summary

Collapse `office-town-cloud` from a 5-worker monorepo into a single Worker
with the 4 MCP servers exposed as path routes. This unlocks Cloudflare's
"Deploy to Cloudflare" button, replacing the current ~25-step wrangler
dance in Phase 2 of `INSTALL.md` with one button click and ~2 minutes of
waiting. The install prompt shrinks from ~280 lines to ~80 and the most
common failure mode (Goose Desktop's Hermit-wrapped shell fighting
locally-installed wrangler) becomes impossible — the agent never touches
wrangler.

## What we're doing

**From:** Five workers — `office-town-core` plus `mcp-{wiki,browser,
devops,email}` — that service-bind to each other. Each has its own
`wrangler.jsonc`, its own deploy command, its own `*.workers.dev` URL.
Goose connects to four different MCP server URLs.

**To:** One worker — `office-town` — that handles everything via path
routing. `/api/*` for the wiki/files/publish API, `/dashboard` for the
HTML dashboard, `/mcp/wiki`, `/mcp/browser`, `/mcp/devops`, `/mcp/email`
for the four MCP servers. One `wrangler.jsonc` declares every binding
(D1, two R2 buckets, Vectorize, Queue, Workers AI, Browser Rendering,
Email Routing). One URL. Goose still sees four MCP servers — they just
share a base URL.

## Why now

1. **Phase 2 of the install prompt is the failure surface.** Jez's dogfood
   run on a fresh Mac with Goose Desktop + Qwen 3.6 Max got stuck mid-
   Phase 2. Goose Desktop's Hermit-wrapped shell hides system PATH; the
   agent had to manually re-export `PNPM_HOME` and use absolute wrangler
   paths on every command. Multiplied across 25+ shell calls, the
   friction is fatal. The Deploy to Cloudflare button bypasses local
   toolchain entirely.

2. **The 5-worker architecture is speculative.** It was chosen for
   "bundle size + per-extension scaling", neither of which is real for
   us. Bundle size for HTTP-handler code is tiny — the heavy stuff
   (Browser Rendering, Workers AI, D1) lives in bindings, not in the JS
   bundle. We have no per-MCP scaling concerns at SMB volume.

3. **Cloudflare's deploy button is single-Worker only.** Multi-worker
   monorepos aren't supported. To align with the platform's opinionated
   shape, we collapse.

4. **Maintenance cost.** Five wrangler.jsonc files, five package.json
   files, five sets of `wrangler deploy` invocations to think about on
   every change. Going to one of each removes ongoing tax.

## High-level architecture

Four named pieces inside the single worker:

| Piece | Routes | Lives at |
|---|---|---|
| **API surface** | `/api/wiki/*`, `/api/files/*`, `/api/publish/*`, `/api/dashboard/*` | `src/api/*` |
| **Dashboard HTML** | `/dashboard`, `/p/<slug>`, `/s/<token>` | `src/dashboard/*`, `src/publish/*` |
| **MCP servers (4)** | `/mcp/wiki`, `/mcp/browser`, `/mcp/devops`, `/mcp/email` | `src/mcp/*.ts` |
| **Workflows + cron** | scheduled handler + queue consumer | `src/cron.ts`, `src/queue.ts` |

All four pieces share the same bindings (DB, BUCKET, MEDIA, VEC, QUEUE,
AI, BROWSER) declared once in `wrangler.jsonc`. No more cross-worker
service bindings.

## Sequencing

| Phase | Effort | Deliverable |
|---|---|---|
| **1** | 1 h | New single-worker `src/` layout. Move MCP handlers from `packages/mcp-*/src/index.ts` to `src/mcp/{name}.ts`. Move core's `src/*` into the new layout. |
| **2** | 30 min | Single `wrangler.jsonc` with all bindings declared. `.dev.vars.example` for deploy-UI secrets. `package.json` cleanup (drop pnpm-workspace). |
| **3** | 30 min | Fix MCP streamable-HTTP session scoping so wiki/browser/devops/email sessions don't collide. |
| **4** | 30 min | Smoke test against Jez's existing data plane (same D1 ID, same R2 buckets, same Vectorize). Verify migration works. |
| **5** | 30 min | Deploy to Cloudflare button + README update + landing page update. |
| **6** | 30 min | Rewrite INSTALL.md prompt for new flow (~80 lines, 3 phases instead of 4). |
| **7** | 30 min | Smoke test the full new install on a fresh machine. |
| **Total** | ~4 h | |

## IA / UX changes

- **`office-town-cloud` repo shape** — five `packages/` collapse to one
  flat `src/`. Drop pnpm workspaces. Single `package.json`,
  `wrangler.jsonc`, `tsconfig.json`.
- **`office-town-cloud/INSTALL.md`** — Phase 2 ("Deploy the Cloud
  Backend") collapses from 9 sub-steps to 2 ("click button", "paste URL
  back"). Phase 3's MCP config wiring stays — but now points 4 entries
  at one base URL with different paths.
- **`office-town/INSTALL.md`** — same edits (it's a mirror).
- **`officetown.au` landing page** — "Get started" table goes from 2
  steps to 2 cleaner steps. The pasteable prompt summary in the hero
  block shows the new 3-phase shape. Copy button still works.
- **The `[Deploy to Cloudflare]` button** lives at the top of the
  `office-town-cloud` README and on the landing page hero.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Data migration on existing deployment** | Jez has a live 5-worker deploy with data in D1, R2, Vectorize. The single worker must point at the **same** resources or we lose data. | New `wrangler.jsonc` reuses the same `database_id`, same bucket names, same `index_name`. Deploy is a no-op for the data plane — just changes the JS bundle and routes. Verify before deleting old workers. |
| **Bundle size** | All MCP code in one bundle. Browser Rendering uses `@cloudflare/puppeteer` which is a binding (not bundled), so this concern is theoretical. | Keep an eye on Workers' 10 MB compressed limit. Likely fine — we're under 1 MB today across all 5 workers combined. |
| **MCP session scoping** | Streamable-HTTP uses `Mcp-Session-Id` headers. Sharing a session store across paths would let wiki sessions read browser sessions. | Include the path in the session storage key (`session:wiki:<id>`, `session:browser:<id>`, etc.). 5-line fix, covered in build spec. |
| **CF button auto-provisioning gotchas** | The button is supposed to auto-create D1 / R2 / Vectorize / Queue from `wrangler.jsonc`. Need to verify on a fresh test account that it actually works for all our bindings, not just KV/D1. | Smoke-test the button on a throwaway CF account before public-flipping. The blog post explicitly lists Vectorize + Queues as supported, but trust-but-verify. |
| **Loss of per-MCP redeploy isolation** | Today you can `wrangler deploy` just `mcp-browser` without touching the others. After collapse, any change redeploys the whole worker. | Deploy time for a single worker is ~10 s — not a meaningful concern. Workers Builds auto-deploys on push anyway. |
| **Old workers still running** | The 5 existing workers stay live until we explicitly delete them. Potential for split-brain if traffic accidentally goes to them. | Build spec includes a "delete old workers" step at the end, only after smoke test of the new single worker passes. Document the old URLs in the migration note. |

## What we explicitly skip

- **Custom domain wiring** stays optional, manual. Out of scope. Users
  who want `app.yourbusiness.town` configure it in CF dashboard
  post-deploy.
- **Per-tenant deployment** stays out of scope. Each user runs their own
  CF deployment.
- **Restructure of the office-town template repo, plugin repo, or
  knowledge pack repo.** Those three repos serve different purposes and
  don't move.

## Open decisions for Jez

1. **Worker name.** Currently `office-town-core` (the existing core
   worker). Rename to `office-town` for the unified worker, or keep
   `office-town-core` to ease the migration? I'd lean **rename to
   `office-town`** since the worker now handles everything, not just
   the core API surface. New deploys get the cleaner name; Jez's
   existing deploy can either be renamed or we can deploy fresh and
   then redirect.

2. **Jez's existing deployment — migrate in place, or fresh start?**
   - **Migrate**: Same CF account, redeploy `office-town-core` worker
     with the new bundle (new routes + handlers). Same `database_id`,
     same bucket names. Old `mcp-*` workers get deleted after smoke
     test. Zero data loss.
   - **Fresh start**: Deploy as `office-town` to a clean state, leave
     the old 5-worker deployment running until migration is verified,
     then delete the old. Same data plane, different worker, can A/B.

   I'd lean **migrate in place** — simpler, but the build spec covers
   both paths.

3. **Do we keep `office-town-cloud` as the repo name** even though
   it's no longer a multi-package monorepo? I think yes — the name
   describes what's inside (the cloud half of Office Town) and changing
   it now would break every existing link, including the button URL
   in the README.

4. **Drop the empty placeholder packages?** `mcp-cron`, `mcp-files`,
   `mcp-publish`, `mcp-sandbox`, `mcp-search`, `mcp-voice`, `tools` all
   have empty `src/` directories — they were scaffolds for future MCPs.
   In the new single-worker world, future MCPs are just new files at
   `src/mcp/<name>.ts`. The placeholders can be deleted. I'd lean
   **delete them** to keep the new structure clean.

## After this lands

Future "v1.1" additions are just new files in `src/mcp/` plus a new
binding (if needed) in `wrangler.jsonc`. Voice MCP, sandbox MCP, search
MCP, files MCP — each is a single TypeScript file in a flat folder.
That's the maintenance shape we want.

The `INSTALL.md` prompt also becomes a place where any agent (Goose,
Claude Code, Aider, Cline) can do the local-side install in 5 minutes
without needing wrangler. The most failure-prone half of the install
moves to Cloudflare's own UI, where we don't control it but we don't
have to maintain it either.
