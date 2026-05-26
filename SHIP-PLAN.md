# Ship Plan — Office Town

The master plan to ship everything from architecture spec to publicly-released product. This document covers the template (`office-town`), the cloud backend (`office-town-cloud`), role packs, marketing, and sustained release.

**Owner**: Jezweb (Jez)
**Started**: 2026-05-26
**Current state**: Foundation phase complete; ready to build
**Target v1 release**: ~4-6 weeks of focused AI-session work
**Target v1.1 release** (killer extensions): ~3-4 weeks after v1

## Executive summary

Three things ship in v1:

1. **Office Town template** (`github.com/jezweb/office-town`) — markdown-shaped methodology + 4 core roles + 4 default buildings. Flip public. Installable via `git clone` or `goose plugin install`.
2. **Office Town Cloud backend** (`github.com/jezweb/office-town-cloud`) — Cloudflare Workers serving wiki, files, publish, search, kanban, cron as MCP extensions. One-click "Deploy to Cloudflare". Flip public.
3. **Office Town as a Goose Plugin** (`github.com/jezweb/office-town-plugin`) — bundled distribution: roles + skills + hooks + recipes + default MCP wiring.

Then v1.1 adds the killer Cloudflare extensions (voice, browser, email, sandbox) that make Office Town genuinely differentiated in the Goose ecosystem.

## What's already done (foundation)

| Artefact | Status | Location |
|---|---|---|
| Office Town vocabulary (Town/Place/Role/Task) | ✅ canonical | `~/Documents/.jez/knowledge/office-town.md` |
| Office Town template v1.1 | ✅ published, private | `github.com/jezweb/office-town` |
| Role files: boss, librarian (extractive), worker, scout | ✅ in template | `office-town/roles/` |
| Building briefings (AGENTS.md) | ✅ in template | `office-town/buildings/*/AGENTS.md` |
| Methodology + setup docs | ✅ in template | `METHODOLOGY.md`, `SETUP.md`, `README.md` |
| Office Town Cloud architecture spec | ✅ done | `github.com/jezweb/office-town-cloud` (this folder) |
| Build spec (15 phases) | ✅ done | `BUILD-SPEC.md` |
| Extensions catalogue | ✅ done | `EXTENSIONS-CATALOGUE.md` |
| Wiki schema | ✅ done | `WIKI-SCHEMA.md` |
| Dogfood deployment (jezweb-town) | ✅ exists | `~/Documents/jezweb-town/` |
| Goose role file installation | ✅ done | `~/.agents/agents/{boss,librarian,worker,scout}.md` |

## Milestones

### M1 — Dogfood validation (1 day)

Verify the template actually works under real use before we build the backend.

**Deliverables:**
- Open Goose at `~/Documents/jezweb-town/buildings/library` and run a real librarian session
- Repeat at office, workshop, lookout
- Try delegation: boss delegates to librarian, librarian to worker, worker reports back
- Document what worked, what didn't (any briefing problems, role drift, vocabulary friction) in `office-town/.jez/dogfood-2026-XX-XX.md`
- Patch template based on findings (likely small briefing edits)

**Verification:** A complete delegation chain (boss → librarian → worker → boss) runs cleanly with the librarian extracting something into the wiki.

**Skip if:** dogfooding can run alongside M3/M4. Not blocking. But discovery here informs every subsequent phase.

### M2 — Office Town as an Open Plugin Spec plugin + test pack (3-4 days)

Convert the template from "folder you copy" to "plugin you install." Package follows the **[Open Plugin Spec v1.0.0](https://github.com/vercel-labs/open-plugin-spec)** which Goose committed to adopting in their May 2026 roadmap. **Cross-host portable** — same plugin works in any conformant host (Goose today; potentially Claude Code, other agents tomorrow).

**Deliverables:**
- `github.com/jezweb/office-town-plugin` — new repo
- `.plugin/plugin.json` manifest with `name: office-town`, `version`, `description`, `author: Jezweb`, `license: MIT`, `mcpServers` references, component path declarations
- `agents/` — one markdown file per role (boss, librarian, worker, scout — extended by future packs)
- `skills/<name>/SKILL.md` — per-role techniques (curate, extract, build, scan, dispatch)
- `commands/` — slash-command recipes (3-5 starter playbooks: weekly news sweep, knowledge graduation, project onboarding)
- `hooks/hooks.json` — SessionStart (load briefing + recent journal + open tasks), SessionEnd (write journal entry)
- `rules/` — Office Town town-wide standing orders
- README explaining what's in the plugin and how to install
- Install command works: `goose plugin install jezweb/office-town-plugin`

**Verification:** Fresh Goose install + `goose plugin install jezweb/office-town` + open Goose → all four core roles available via `@-mention`, recipes show as slash commands, hooks fire at session start/end, MCP servers (wiki, share, cron) are wired.

**Sub-deliverable: Test pack (`tests/`)** — seeded from M1 dogfood; codifies role-identity + delegation + briefing-loading tests. Runner shells out to `goose run --no-session --quiet` and checks pattern presence. Lives in `office-town-cloud/tests/` initially; moves to `office-town-plugin/tests/` when the plugin repo exists. Becomes CI on every PR to roles/briefings/packs.

**Sub-deliverable: Setup recipe (`commands/office-town-setup.yaml`)** — first-session onboarding flow. Captures business, owner voice/rhythm, team, anchor contacts/orgs, wires services. ~15-30 min walk-through; supports `quick` mode for essentials only and `import-from-goanna` mode for migrating from a goanna-shaped substrate. See `docs/ONBOARDING.md` for the full flow.

**Effort:** ~2-3 days. Mostly content (skills + recipes) — the plugin format itself is straightforward.

### M3 — Cloud v1: Wiki backbone (1 week)

The substrate Worker — wiki MCP, FTS5 + Vectorize, R2 source-of-truth.

**Deliverables (from BUILD-SPEC Phase 1-3):**
- pnpm workspace bootstrapped with vite-flare-starter patterns
- `packages/shared/` with types
- `packages/core/` with Hono app, Drizzle migrations, better-auth, deployed to a test Worker
- `packages/mcp-wiki/` exposing wiki tools (create/read/update/delete/search/list_collections/register_collection)
- R2 bucket + D1 database + Vectorize index + Workers AI bindings configured
- R2 events → Queue → Workflow → embed + FTS index
- Smoke test: agent in Goose calls `wiki.create` for a contact; entry appears in R2; FTS+vector search returns it within 30 seconds

**Verification:** A real librarian Goose session creates 3 contacts and 2 knowledge concepts. `wiki.search` finds them by FTS and by semantic similarity.

**Effort:** ~5-7 days of focused sessions.

### M4 — Cloud v1: Files + Publish + Kanban + Cron + Dashboard (2 weeks)

Round out the v1 cloud features.

**Deliverables (BUILD-SPEC Phases 5-7):**
- `packages/mcp-files/` — upload, download, list, share (signed URLs), extract (mediabox-shaped)
- `packages/mcp-publish/` — markdown → public page at `/p/<slug>`
- `packages/mcp-cron/` — schedule + run + list + history
- Web dashboard at `/` with: town map (4 buildings + status), kanban board, search UI
- `wiki/kanban.md` auto-regenerated by cron
- Better-auth login working for the dashboard
- Each MCP has its own streamable-HTTP endpoint
- One-click "Deploy to Cloudflare" button configured

**Cron execution model (decided):** v1 uses *poll model* — the user's Goose Desktop polls our Worker for due jobs and runs them via Headless Goose locally. Pros: zero daemon dependency, simpler install. Cons: routines only fire while desktop is open. v1.1 adds optional *remote `goosed` mode* for power users with always-on Mac minis.

**Verification:** End-to-end test:
1. Open dashboard, log in
2. See town map with current activity
3. Click into a building, see its tasks + recent journal entries
4. Open Goose, ask the librarian to file a finding — appears in dashboard within 30s
5. Schedule a routine via `cron.schedule`, watch it fire on schedule (with Goose Desktop open)
6. Publish a markdown page, visit the public URL

**Effort:** ~10-12 days of focused sessions.

### M4.5 — Cloudflare Workers AI provider (1 day, parallel with M4)

Contribute Cloudflare Workers AI as a native provider to upstream Goose, AND ship it preconfigured in Office Town Desktop.

**Deliverables:**
- **Custom Distribution config** (for our M5 build): Workers AI preconfigured as a provider option via Goose's declarative custom-provider mechanism. Uses OpenAI-compatible endpoint at `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/`. Default model: `@cf/openai/gpt-oss-20b`. Users see "Cloudflare Workers AI" in the provider picker.
- **Documented workaround** for vanilla Goose users (config.yaml with OPENAI_HOST override)
- **Upstream PR** to `block/goose` (or `aaif-goose/goose`): native `crates/goose/src/providers/cloudflare.rs` implementing the `Provider` trait, ~300-500 lines of Rust based on similar provider implementations. Adds to `provider_registry`. Handles Workers AI-specific quirks (model API shapes per `workers-ai-gotchas.md`).

**Verification:** Office Town Desktop user picks "Cloudflare Workers AI" from provider list; selects `@cf/openai/gpt-oss-20b`; runs `@librarian who are you?` successfully. Upstream PR opened with passing tests.

**Effort:** ~1 day. PR review timeline upstream is out of our control; the Custom Distribution config doesn't wait on it.

**Status update (2026-05-26):** ✅ Upstream PR opened at https://github.com/aaif-goose/goose/pull/9425. 4 files changed, 432 insertions, 6 unit tests passing, `cargo check -p goose` clean. Awaiting review. Custom Distribution config can proceed in parallel.

### M5 — v1.0 public release (1 week)

Polish, document, market. **Now includes Custom Distribution** (white-labelled Goose Desktop).

**Deliverables:**
- All three repos flipped public:
  - `github.com/jezweb/office-town`
  - `github.com/jezweb/office-town-cloud`
  - `github.com/jezweb/office-town-plugin`
- **`github.com/jezweb/office-town-desktop`** — Custom Distribution build of Goose with:
  - App rebranded (icon, name, accent colour)
  - Our MCPs bundled via `init-config.yaml`
  - Default recipes pre-loaded
  - Default provider/model config (Opus planner + Sonnet executor)
  - Default system prompt extension
  - Built via `goose build --custom-distribution`
  - Code-signed + notarised .app for macOS distribution (requires Apple Developer account)
- Landing page at `officetown.au` — short, opinionated, three buttons:
  - "Deploy to Cloudflare" (the backend)
  - "Download Office Town Desktop" (the app)
  - "Use vanilla Goose" (for users who want full control)
- README polished on each repo
- A 90-second demo video: download .app → "Deploy to Cloudflare" → first delegation
- Blog post on jezweb.com explaining the why and the how
- HN post once there's something genuinely demo-able
- Goose Discord post in #show-and-tell
- Office Town pages added to the Goose docs (one MCP page per extension via PR)

**Install UX comparison (the win from Custom Distribution):**

| Without Custom Distribution | With Custom Distribution |
|---|---|
| 1. Install Goose | 1. Download Office Town Desktop |
| 2. `goose plugin install jezweb/office-town-plugin` | 2. Open it; sign in with Google |
| 3. Click "Deploy to Cloudflare" | 3. Click "Deploy to Cloudflare" |
| 4. Open Goose Settings → Extensions | 4. Paste bearer token in setup screen |
| 5. Add streamable-http extension × 6 (wiki, files, publish, kanban, cron, search) | (done) |
| 6. Paste 6 different URLs + bearer tokens | |
| 7. Configure providers | |
| 8. Restart Goose | |

**Effort:** ~7-10 days (includes Custom Distribution build setup + Apple Developer account + notarisation flow). The Custom Distribution itself is half a day; the rest is one-time setup that pays back forever.

**Verification:** A stranger downloads the .app + clicks the deploy button + has a working town within 15 minutes (versus 60+ minutes without Custom Distribution).

### M6 — Cloud v1.1: The killer Cloudflare extensions (3-4 weeks)

The differentiators that nobody else has built for Goose.

**Deliverables (BUILD-SPEC Phases 9-14):**

| Extension | Effort | Demo moment |
|---|---|---|
| **Voice** (Realtime + Nova-3 + Aura-2) | 2-3 days | "Phone the librarian" demo video — talk to your agent over WebRTC |
| **Browser** (Browser Rendering + Stagehand) | 2 days | "Agent logs into your client's WordPress and reports back" demo |
| **Email** (Email Routing + Email Service) | 2 days | "Librarian@<your-town> receives the newsletter and files it" demo |
| **Sandbox** (Containers) | 1 day | "Worker runs Python in a sandbox and returns results" |
| **Devops** (CF API wrapper) | 1 day | The Cloudflare-agent that helps users set up and maintain their own town |
| **Search wrapper** (DIY + AI Search backends) | 1-2 days | Bake-off comparison report |

**Effort:** ~10-12 days of focused sessions.

### M6.6 — Knowledge starter pack (1-2 days, parallel with M7)

Audit `/Users/Shared/goanna/wiki/knowledge/` and ship portable concepts as `office-town-knowledge-starter` — an opt-in plugin that seeds new Office Town deployments with hard-won learnings (AI model gotchas, Cloudflare patterns, vendor quirks, etc.).

**Deliverables:**
- Sub-agent audit of every goanna knowledge concept — classify Jezweb-specific / portable / mixed
- Adapt portable concepts (strip Jezweb-specific references)
- Bundle as `office-town-knowledge-starter` plugin (Open Plugin Spec compliant)
- Skip concepts that are too niche or too specific to be useful generally
- Document each adapted concept's source goanna concept for attribution

**Effort:** ~1-2 days depending on how many concepts make the cut. Mostly mechanical filtering + light adaptation.

**Why this matters:** new Office Town deployments start with a wiki containing distilled wisdom from goanna's months of accumulated learning, not empty folders. Big leg up on adoption.

### M7 — Role packs + v1.1 launch (1 week)

Distribution maturity.

**Deliverables (revised packs — domain-focused):**
- `github.com/jezweb/office-town-pack-design` (designer, copywriter, video-editor — includes Remotion recipe + brand-mockup, typography, layout-review skills)
- `github.com/jezweb/office-town-pack-hosting` (hostmaster, devops — adds `properties/{websites,apps,hosting}/` wiki collections, dns-audit, ssl-cert-renew, server-health skills)
- `github.com/jezweb/office-town-pack-wordpress` (wordpress-specialist — extends `properties/websites/` with WP frontmatter; theme-update, plugin-audit, wp-security skills)
- `github.com/jezweb/office-town-pack-business` (estimator, project-manager, product-manager, marketer, writer — adds `quotes/` collection)
- `github.com/jezweb/office-town-pack-cloudflare` (no new roles — bundles **official Cloudflare skills** from `github.com/cloudflare/skills` + **official MCP servers** from `github.com/cloudflare/mcp`; ships by default in Office Town Desktop since OTC runs on CF)
- `github.com/jezweb/office-town-pack-comms` (helpdesk, social-poster, newsletter-editor)
- Each pack: roles + skills + recipes + briefings + README
- Update Office Town docs with the pack catalogue
- v1.1 release announcement focused on the killer trio (voice + browser + email) plus the creative bonus (agent-generated videos via Remotion)
- Updated demo video

**Remotion recipe (creative pack):**

The video-editor role ships with `recipes/make-video.yaml` that wraps the Remotion Summon skill. Sample use:

```
@video-editor make a 30-second client onboarding intro for example-corp
  with kinetic typography, brand colours from business/voice.md,
  music from assets/onboarding-music.mp3
```

Generates a React-based Remotion composition, renders to MP4 (~30s, 30fps, 1080p), saves to `~/Documents/{town}/output/videos/` and optionally publishes via the publish MCP.

This is a v1.1 demo-able novelty: "yes, your agents can make videos."

**Effort:** ~5-7 days. Roles are mostly content; packaging is fast once we've done it once.

### M8 — Sustained release (ongoing)

After v1.1 ships, the work becomes:
- Community feedback integration
- Bug fixes
- Documentation improvements
- New roles as they earn their place
- v2 features (see "v2 roadmap" below)

## Realistic timeline

Based on 2-4 focused AI sessions per week:

| Window | Milestones | Deliverable |
|---|---|---|
| Week 1 | M1 + M2 | Template dogfooded; plugin published |
| Weeks 2-3 | M3 | Wiki MCP working end-to-end |
| Weeks 4-5 | M4 | Cloud v1 features complete |
| Week 6 | M5 | v1.0 public release |
| Weeks 7-10 | M6 | v1.1 killer extensions |
| Week 11 | M7 | Role packs + v1.1 announcement |
| Week 12+ | M8 | Sustained |

**Total: ~12 weeks for v1 + v1.1.** This is achievable with the AI-session cadence. Real-world disruptions (client work, life) will stretch this; plan for 16-20 calendar weeks to be safe.

## Decision points

| When | Decision | Default | Trigger to revisit |
|---|---|---|---|
| After M1 (dogfood) | Do the briefings need refactoring? | No — proceed | If briefings clearly don't work for the librarian's extractive role |
| Before M3 | Fork L2Stack OR start fresh? | Start fresh from vite-flare-starter patterns (already decided) | — |
| Mid-M4 | Build kanban as MCP or just markdown view? | Markdown view first; MCP later | If the dashboard needs richer kanban interaction |
| Before M5 (public flip) | Public timeline — wait for v1.1? | No — ship v1.0 public; v1.1 follows | If v1 feels too thin to attract attention |
| Day 1 of M6 | Voice first or browser first? | Voice (more demo-able) | If voice integration is harder than estimated |
| Day 90 after M3 | AI Search vs DIY | Stay on DIY unless AI Search measurably wins | Run the bake-off; if AI Search wins on quality + cost, migrate behind the existing MCP interface |
| After M7 | Office Town as branded Goose .app? | Defer to v2 | If multiple users ask for it |

## Marketing / communication

### Audience

Three groups, in priority order:

1. **Goose users** — already using Goose; want better methodology + Cloudflare-backed extensions. Reach via Goose Discord, Goose docs PRs.
2. **SME owners using AI** (Jez's natural audience) — want to deploy AI fleets but don't have engineering teams. Reach via Jezweb network, business newsletters, LinkedIn.
3. **Developers building agent systems** — interested in convergent architecture. Reach via HN, Twitter/X, dev blogs.

### Pre-launch communication

During M1-M4 (build phases):
- **No public posts.** Repos stay private. Build in quiet.
- **Two-week update emails** to a small "early access" list (5-10 people Jez trusts)
- **Personal demos** to 2-3 SMEs to validate the deployment story

### Launch comm (M5)

- Landing page goes live
- Blog post on jezweb.com (the "why" + the "how")
- HN post once there's something compelling to demo (likely after v1.1, not v1.0)
- Twitter/X thread linking blog post + repos
- Goose Discord post in #show-and-tell with screenshot/video
- LinkedIn post (Jez's network) for SME audience

### Sustained comm

- Weekly "office hours" notes — short post on what shipped that week
- Each role pack release gets its own short announcement
- Periodic deep-dives (voice agent post, browser agent post)

## What we deliberately won't do in v1

Scope discipline. The following are explicitly out:

- **Multi-tenant SaaS** — each user deploys their own town to their own CF account
- **Our own agent runtime** — Goose handles this; we build extensions
- **Our own memory MCP that competes with Goose's built-in Memory** — we add the wiki layer instead
- **A custom Electron app** — Custom Distribution path exists for v2 if demand is there
- **Mobile app** — Goose mobile is archived; tunnelled goosed access exists if needed
- **Per-deployment data sync across machines** — single-machine assumed; goannad-style daemon optional
- **Custom UI framework** — Goose's MCP Apps for in-chat; standard React+shadcn for the web dashboard
- **Selling tokens / hosting LLMs** — users bring their own provider keys
- **Custom auth provider** — better-auth + Google OAuth
- **Forum / community platform** — Goose Discord serves this purpose
- **Detailed observability tooling** — Workers' built-in observability is enough for v1; OTel later
- **A full marketplace UI** — GitHub orgs + READMEs ARE the marketplace

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Cloudflare AI Search ships with pricing that obsoletes our search MCP** | Medium | Low | Abstraction (search MCP) lets us swap backends. If it wins, we win. |
| **Goose changes a primitive we depend on (e.g., AGENTS.md handling)** | Low | Medium | Track Goose releases; pin to known-good versions in plugin |
| **A killer extension (voice especially) is harder than estimated** | High | Medium | Voice gets a longer estimate (2-3 days). If it slips, ship browser + email first in v1.1, voice in v1.2 |
| **No-one adopts** | Medium | High | Diversified audiences (Goose users + SMEs + devs); demo-driven content; office hours to support early adopters |
| **Costs run higher than estimated** | Low | Medium | Cost-track per phase; ingest LLM is the big lever (can swap from gpt-oss-20b to rule-based parsing) |
| **Time stretches beyond 16 weeks** | Medium | Low | Acceptable; v1 doesn't have a competitive deadline |
| **Solo maintainer burnout** | Medium | High | Aggressive scope discipline (the "won't do" list); ship v1 with rough edges; iterate publicly |
| **Goose ecosystem dies or fragments** | Low | High | Office Town's design is mostly Goose-native but the methodology layer is portable; could be Claude Code-compatible too |

## v2 roadmap (after v1.1)

Park here for now; revisit after v1.1 launches.

| Item | What |
|---|---|
| **Humans + VA agents — hybrid teams as citizens** | Each human team member gets a personalised VA agent that lives in the town AS them. `@sue` is Sue's VA (instant response, learns Sue's voice, configured auto-handle vs escalate rules). The VA handles routine delegations autonomously; escalates to the actual Sue (via her configured channel — email/Slack/iMessage) for judgment calls. `@sue-direct` bypasses the VA for rare direct contact. **Why this beats "human as runtime"**: town gets immediate response, routine work doesn't block on availability, humans get curated escalations not raw delegations. Generalises the pattern goanna already uses for Jez (boss as Jez's representative). |
| Multi-tenant SaaS | One Office Town Cloud serves N customers (Cloudflare for Platforms) |
| Mobile / tablet support | iOS app talking to tunnelled goosed |
| Voice expansion | Outbound calls via Twilio bridge; voice in MCP Apps |
| Image / vision tools | Generated assets, screenshot understanding, etc. |
| Observability | OTel integration; per-role health dashboard |
| Knowledge graph integration | Optional Cognee-style relational reasoning |
| Marketplace UI | A real website to browse role packs + extensions |
| Brain trust agents | Council of Mine-shaped multi-persona deliberation for big decisions |

## How to use this plan

For Jez:
1. **Read it once cold** — see if anything is missing or wrong
2. **Pick a milestone to start** — likely M1 (dogfood) or M2 (plugin packaging) since they're small
3. **Schedule AI sessions per milestone** — don't try to do M3 in one go; break by phase
4. **Update this plan as decisions are made** — strikethrough or supersede; don't rewrite history

For future AI sessions:
1. **Read this plan first** — it's the master context
2. **Check the milestone you're working on** — what specifically ships?
3. **Read the relevant BUILD-SPEC phase** — concrete deliverables
4. **Update SHIP-PLAN.md milestones with status emoji** as work completes (✅ done / 🔄 in progress / ⏸ paused)

For external collaborators (once public):
1. README points at SHIP-PLAN.md
2. Issues link to specific milestones
3. PRs reference which phase they advance

## Status as of writing (2026-05-26)

- ✅ Foundation phase complete
- 🔄 **M1 — Dogfood validation** — pending (you, next session)
- ⏸ M2 — Goose plugin packaging
- ⏸ M3 — Cloud v1: Wiki backbone
- ⏸ M4 — Cloud v1: Full feature set
- ⏸ M5 — v1.0 public release
- ⏸ M6 — Cloud v1.1: Killer extensions
- ⏸ M7 — Role packs + v1.1 launch
- ⏸ M8 — Sustained release

## One-sentence summary

Office Town ships in two waves (v1 = wiki-shaped substrate over Goose; v1.1 = killer Cloudflare extensions like voice + browser + email), distributed as three repos (template + cloud + plugin), with a target of ~12 focused weeks from spec to v1.1 public release.
