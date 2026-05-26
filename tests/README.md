# Office Town test pack

Headless Goose tests that verify roles, briefings, and delegation work as designed. Run against any Office Town deployment on every PR.

## Why these tests exist

LLM-driven systems can drift quietly. A role file change might break the persona; a briefing edit might silently lose the building context; a new pack might collide with existing roles. These tests catch those regressions automatically.

They were seeded from the M1 dogfood pass (2026-05-26) — every test here was verified passing against the live template before being codified.

## Running the test pack

```bash
# From the office-town-cloud repo root
# Set TOWN_ROOT to wherever your Office Town deployment lives
export TOWN_ROOT=~/Documents/my-town    # any clone of the office-town template
export GOOSE_BIN=/path/to/goose         # default ~/Documents/goose/target/release/goose

./tests/runner.sh

# Or run a single test:
./tests/runner.sh roles/librarian-identity.yaml
```

The runner shells out to `goose run --no-session --quiet -t "..." --max-turns N`, captures the stdout, and checks pattern presence per the test config.

## Test config format

Each `.yaml` file is one test:

```yaml
name: librarian-identity
description: Librarian responds correctly to "who are you?"
working_dir: buildings/library          # relative to TOWN_ROOT
prompt: "@librarian how can you help me?"
max_turns: 4
expected_patterns:
  must_contain:                          # at least one of each must appear
    - ["library", "Library"]             # array = any of these
    - ["extract", "extraction"]
    - ["curat", "curation"]
    - ["wiki"]
  must_not_contain:                      # none of these may appear
    - "I cannot help"
    - "@developer"                       # not a role in v1.1
expected_persona_markers:                # at least one must appear
  - "spectacles"
  - "reading"
  - "shelves"
  - "calm"
```

## Test categories

### `roles/` — per-role identity + behaviour

One test per role validating: identifies building, identifies role, mentions key duties, doesn't claim duties outside its scope.

### `integration/` — multi-role delegation

Tests that exercise the delegation chain (boss → librarian → worker, etc.).

### `briefings/` — AGENTS.md loading

Tests that verify each building's AGENTS.md is correctly loaded by Goose at session start. Run by opening Goose in each building and checking the agent identifies the building correctly.

## Adding new tests

When you add a new role to a pack, add an identity test to `roles/`. When you discover a delegation pattern, codify it in `integration/`. When you add a new building, add a briefings test.

The bar to add a test: a real failure mode you've encountered or want to prevent. Don't add speculative tests for theoretical issues.

## CI integration

Once `office-town-plugin` is published, these tests run as a GitHub Action on every PR. The action installs Goose, points it at a fresh test deployment of the template, runs the pack, fails the PR if any test fails.

For now (M1), run locally before each commit to role files or briefings against any Office Town deployment you have on disk.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `TOWN_ROOT` | `~/Documents/office-town` | Path to the Office Town deployment to test against |
| `GOOSE_BIN` | `~/Documents/goose/target/release/goose` | Path to the goose binary |

Both can be overridden per-machine.
