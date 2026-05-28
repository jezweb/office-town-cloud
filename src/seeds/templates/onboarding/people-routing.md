# Routing template: people.md → cortex destinations

A dossier's `people.md` artifact captures everyone in the user's world in one document. The setup skill routes it across multiple cortex collections — different relationships need different homes.

## Routing rules

| Section in people.md | Cortex destination | One file per person |
|---|---|---|
| Family / household | `wiki/contacts/<slug>/contact.md` with `relationship: family` | Yes |
| Internal employees | `wiki/team/<slug>/profile.md` | Yes |
| AI agents / virtual team | `wiki/team/<slug>/profile.md` with `kind: ai-agent` | Yes |
| External professional contacts | `wiki/contacts/<slug>/contact.md` with `relationship: <client/vendor/partner>` | Yes |
| Health / personal services (doctor, PT, etc.) | `wiki/contacts/<slug>/contact.md` with `relationship: service-provider` | Yes |
| Community memberships (organisations, not individuals) | `wiki/orgs/<slug>/entity.md` with `relationship: community` | Yes |

## Per-person shape — `wiki/contacts/<slug>/contact.md` template

```markdown
# <Full Name>

<One-line description: role + relationship.>

## Frontmatter slots (set by setup skill)
- slug: <kebab-case>
- relationship: family | employee | contractor | client | vendor | partner | service-provider | other
- email: <if known>
- phone: <if known>
- orgs: [<linked org slugs>]
- primary_org: <slug if applicable>
- projects: [<linked project slugs if active>]

## Detail
<Specifics the user mentioned: role, history, current relationship, preferences, sensitivities, recurring topics, anything that disambiguates one [Sarah] from another. Include nicknames + how they sign messages.>

## Recent
<Engagement traces — append-only. Filled by curator on first interaction; previous interactions backfilled from dossier where mentioned.>

## See also
- [[orgs/<their-org>]]
- [[projects/<active-project>]] if relevant
```

## Per-person shape — `wiki/team/<slug>/profile.md` template

Similar to contact.md but for internal humans + AI agents. Add:

- `role`: their actual job (IT, Sales, Business Manager, Developer, etc.)
- `start_date`: when they joined the team
- `kind`: human | ai-agent
- For ai-agent: where they live (Google Chat space, Slack channel, etc.), what runtime (Claude Code, Goose), what shared memory (repo path, MCP server)

## Names that come up but lack detail

For names the dossier mentions only in passing (e.g. "Joseph 'Jo' Andrade, a strong developer assessed as a weaker communicator"), still mint a stub `contact.md` with `status: stub` + flag in `wiki/inbox/onboarding/needs-followup.md`. The detail can come in a later session.

## Cross-references to add

After all people are minted, the curator should:

1. Walk each contact + add reverse links to their `orgs[]` entries
2. Update each org's `contacts[]` to include the minted slugs
3. Update each project's `contacts[]` if any contacts are participants
4. Surface a summary in the curator's journal: "Minted N contacts + M team members + K orgs from people.md"
