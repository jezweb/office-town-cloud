# Routing template: projects.md → cortex destinations

A dossier's `projects.md` artifact lists all active + adjacent + archived projects. The setup skill mints one wiki/projects/ entry per active project, plus knowledge concepts for thesis-level patterns the projects collectively express.

## Routing rules

| Section in projects.md | Cortex destination |
|---|---|
| Active / ongoing projects | `wiki/projects/<slug>/project.md` with `stage: active` |
| Recently shipped / in stable use | `wiki/projects/<slug>/project.md` with `stage: shipped` |
| Adjacent / recently built / exploratory | `wiki/projects/<slug>/project.md` with `stage: exploring` |
| Archived (closed, sunsetted) | `wiki/projects/<slug>/project.md` with `stage: archived` |
| Blockers / open threads | One `findings/<date>-<topic>.md` per blocker filed in the relevant project's folder |
| Strategic thesis ("replace categories of work") | Extract to `wiki/knowledge/<thesis-slug>/concept.md` |
| Personal in-flight (non-business) | `wiki/projects/personal/<slug>/project.md` with `kind: personal` |

## Per-project shape — `wiki/projects/<slug>/project.md` template

```markdown
# <Project Name>

<One-paragraph what-it-is.>

## Frontmatter slots (set by setup skill)
- slug: <kebab-case>
- name: <Full project name>
- kind: product | client-work | internal-tool | research | personal
- stage: planned | active | shipped | exploring | archived
- started_at: <ISO date>
- ended_at: <if archived/shipped>
- org: <client org slug if client work>
- contacts: [<participating contact slugs>]
- decisions: [<related decision slugs>]
- related_projects: [<adjacent project slugs>]
- tags: [<sparse, only for cross-cutting concerns>]

## Scope
<What it's doing, what it's NOT doing. The thesis driving it. The success criteria.>

## Status
<Current state in detail: what's shipped, what's blocked, what's next.>

## Stack / dependencies
<Tools, services, plugins, frameworks the project relies on. Especially relevant for products + custom builds.>

## See also
- [[orgs/<client-org>]] if applicable
- [[decisions/<key-decision-slug>]]
- [[projects/<adjacent-project>]] if cross-referenced
```

## Knowledge concepts to extract from projects.md

Many dossier project sections express *theses* worth promoting to `wiki/knowledge/`. Watch for:

- **Patterns named explicitly** (e.g. "Full Flare Stack", "Proof-of-Real for AI SEO", "the Qwen test"). Each earns its own concept entry.
- **Strategic positions** (e.g. "AI replaces categories of SaaS, not just speeds up devs"). Promote to a concept if the user has repeated the position.
- **Conventions** (e.g. "patch.md / PATCHES.md for fork-divergence"). Concept-shaped — separate from the projects that use them.

The setup skill should flag these candidate concepts in the curator's journal for promotion in a subsequent pass; don't auto-mint knowledge concepts during initial routing (the 3-instance threshold + librarian discretion applies).

## Adjacent vs archived disambiguation

The dossier may list projects as "adjacent / recently built". The setup skill should treat these as `stage: exploring` unless:
- The user explicitly marks them archived (then: `stage: archived` with date)
- The repo has been archived on GitHub (then: `stage: archived`)
- The project has had no updates in 12+ months AND no current dependency on it (then: `stage: archived` with the original ship-date if known)

When unsure, default to `exploring` + flag in `wiki/inbox/onboarding/needs-followup.md` for the user to confirm.

## Blocker handling

The dossier often includes a "Blockers / open threads" subsection. Each blocker should:
1. Be filed as `findings/<date>-<topic>.md` in the project folder OR in the relevant agent's findings
2. Cross-link to any external party involved (e.g. partner, insurer, dependency)
3. Set `status: open` until the user marks resolved
