# Office Town Hooks

How Office Town uses Goose hooks (per Open Plugin Spec) to make agents reliably aware of their inbox, recent journal entries, open tasks, and team state at session start — without relying on the LLM to remember to check.

## The problem hooks solve

The M1 dogfood proved the role files work: agents identify their building, know their neighbours, adopt the right persona. But the role files currently say "*On start I read: inbox/, journal/<today>.md, recent findings/, in-flight tasks/*" — and the LLM has to choose to do this. It's instruction, not enforcement.

A busy inbox that the agent ignores is worse than no inbox at all. We need state injection to be **automatic and reliable** — not depend on the model remembering to check.

## Office Town's hook design

| Event | Hook | What it does |
|---|---|---|
| **SessionStart** | `hooks/scripts/session-start.sh` | Read building state (inbox / journal / tasks / findings counts); inject as system-prompt context |
| **SessionEnd** | `hooks/scripts/session-end.sh` | Append summary to today's journal entry (if anything happened this session) |
| **PreToolUse** (optional, v1.1) | `hooks/scripts/pre-tool-use.sh` | For destructive actions (delete, archive, supersede) — log to audit |

These are configured in `hooks/hooks.json` per the Open Plugin Spec.

## SessionStart hook — the inbox-awareness mechanism

When a user opens Goose at a building (e.g., `cd buildings/library`), the SessionStart hook fires before the agent's first turn. It reads the building's state and outputs structured context that Goose injects into the system prompt for this session.

### Example: `hooks/scripts/session-start.sh`

```bash
#!/usr/bin/env bash
# SessionStart hook — invoked by Goose at session start
# Receives event JSON on stdin; outputs context JSON on stdout

set -euo pipefail

WORKING_DIR="${GOOSE_WORKING_DIR:-$(pwd)}"
BUILDING=$(basename "$WORKING_DIR")
TODAY=$(date +%Y-%m-%d)

# Count inbox items (excluding hidden and processed)
INBOX_COUNT=0
if [ -d "$WORKING_DIR/inbox" ]; then
  INBOX_COUNT=$(find "$WORKING_DIR/inbox" -maxdepth 1 -type f ! -name '.*' 2>/dev/null | wc -l | tr -d ' ')
fi

# Today's journal
JOURNAL_STATE="not started"
if [ -f "$WORKING_DIR/journal/$TODAY.md" ]; then
  JOURNAL_STATE="started ($(wc -l < "$WORKING_DIR/journal/$TODAY.md" | tr -d ' ') lines)"
fi

# Recent findings (last 7 days)
RECENT_FINDINGS=0
if [ -d "$WORKING_DIR/findings" ]; then
  RECENT_FINDINGS=$(find "$WORKING_DIR/findings" -type f -mtime -7 ! -name '.*' 2>/dev/null | wc -l | tr -d ' ')
fi

# Open tasks (those without status=done)
OPEN_TASKS=0
if [ -d "$WORKING_DIR/tasks" ]; then
  OPEN_TASKS=$(find "$WORKING_DIR/tasks" -type f ! -name '.*' 2>/dev/null | \
    xargs grep -L 'status: done' 2>/dev/null | wc -l | tr -d ' ')
fi

# Output structured context that Goose will inject into the system prompt
cat <<EOF
{
  "additionalContext": "## Building state — at session start\n\n- Building: $BUILDING\n- Inbox: $INBOX_COUNT pending items\n- Today's journal ($TODAY): $JOURNAL_STATE\n- Open tasks: $OPEN_TASKS\n- Recent findings (last 7 days): $RECENT_FINDINGS\n\n$([ "$INBOX_COUNT" -gt 0 ] && echo 'You have pending inbox items. Review them before starting new work unless the user is asking for something specific.')\n$([ "$OPEN_TASKS" -gt 0 ] && echo 'You have open tasks. Check tasks/ for in-flight work.')"
}
EOF
```

What this gives the agent at session start:

```
## Building state — at session start

- Building: library
- Inbox: 3 pending items
- Today's journal (2026-05-26): not started
- Open tasks: 2
- Recent findings (last 7 days): 5

You have pending inbox items. Review them before starting new work unless the user is asking for something specific.
You have open tasks. Check tasks/ for in-flight work.
```

The agent **knows** before it generates its first reply that there are 3 inbox items waiting, 2 open tasks, and recent findings to consider. Not "the role file says to check" — the system prompt itself contains the state.

### Why bash and not a richer language?

- Goose hooks run via `sh -c` per the Open Plugin Spec
- Bash + standard Unix tools (`find`, `grep`, `wc`, `date`) is enough
- No runtime dependency (no Python, no Node)
- 30-line scripts are easy to audit
- The hook output is just JSON to stdout — anything that can write JSON works

If a hook grows complex (more than ~50 lines), it should call into a packaged tool inside `$PLUGIN_ROOT` rather than inline the logic.

## SessionEnd hook — journal continuity

When a session ends, append a summary to today's journal. Optional but useful for the boss role which holds the fleet narrative.

```bash
#!/usr/bin/env bash
# SessionEnd hook — append session summary to today's journal

WORKING_DIR="${GOOSE_WORKING_DIR:-$(pwd)}"
TODAY=$(date +%Y-%m-%d)
TIMESTAMP=$(date "+%H:%M")

JOURNAL="$WORKING_DIR/journal/$TODAY.md"
mkdir -p "$(dirname "$JOURNAL")"

# Read session metadata from stdin (Goose passes event details)
SESSION_DATA=$(cat || echo "{}")

# Append a marker; the agent's own journal writes during the session
# do the real content. This is a fallback to ensure the day's journal exists.
if [ ! -f "$JOURNAL" ]; then
  cat > "$JOURNAL" <<EOF
# $TODAY

## ~$TIMESTAMP — session
$(echo "$SESSION_DATA" | head -c 200)
EOF
fi
```

This is a fallback — the agent's own journal writes (instructed in the role file's "end of session" section) are the primary mechanism. The hook ensures something gets written even if the agent forgets.

## PreToolUse hook (v1.1) — audit destructive actions

When the wiki MCP lands (M3), destructive actions (`wiki.delete`, `wiki.archive`, `wiki.supersede`) should be logged to a local audit trail in addition to the cloud one. PreToolUse can do this:

```bash
#!/usr/bin/env bash
# PreToolUse hook — log destructive wiki actions

TOOL_NAME=$(jq -r '.tool_name' <<<"$EVENT_JSON")

case "$TOOL_NAME" in
  mcp__plugin_office-town_wiki__delete|mcp__plugin_office-town_wiki__archive|mcp__plugin_office-town_wiki__supersede)
    WORKING_DIR="${GOOSE_WORKING_DIR:-$(pwd)}"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $TOOL_NAME $EVENT_JSON" >> "$WORKING_DIR/.office-town-local-audit.log"
    ;;
esac
```

Defer to v1.1 — not blocking for v1.

## Hook configuration in the plugin manifest

Per Open Plugin Spec, hooks are declared in `hooks/hooks.json`:

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "command": "${PLUGIN_ROOT}/hooks/scripts/session-start.sh",
      "timeout": 5000
    },
    {
      "event": "SessionEnd",
      "command": "${PLUGIN_ROOT}/hooks/scripts/session-end.sh",
      "timeout": 5000
    }
  ]
}
```

`${PLUGIN_ROOT}` is substituted with the plugin's absolute install path by Goose at hook execution time.

## Hooks are NOT a substitute for role file instructions

Hooks inject state; the agent still needs to know **what to do with it**. The role files (e.g., `roles/librarian.md`) still say:

> When I wake up, I check `inbox/` for pending items. If there's a brief from boss, I act on it before starting new work.

What hooks add: the agent doesn't have to manually `read inbox/` to know there are 3 items waiting. The state is in the system prompt by the time the agent generates its first reply.

The two work together — instruction (what to do) + state injection (what's true right now).

## What hooks don't do

- They don't modify the agent's tool surface
- They don't run on every turn (only at SessionStart/End or specific tool events)
- They don't have access to the LLM (use MCP Sampling for that — see ARCHITECTURE.md)
- They can't fail loud — if a hook errors, Goose logs and continues (good UX, but means we can't rely on hooks for hard guarantees)

## Testing hooks

Add a test to `tests/` that verifies the SessionStart hook produces the right context for various building states:

```yaml
name: librarian-inbox-awareness-with-pending-items
description: Librarian acknowledges pending inbox items on session start
working_dir: buildings/library
setup:
  - "touch $TOWN_ROOT/buildings/library/inbox/2026-05-26-from-boss-test.md"
prompt: "@librarian what's on your plate today?"
max_turns: 4
expected_patterns:
  must_contain:
    - ["inbox", "pending", "from boss", "waiting"]
    - ["1", "one"]  # count
teardown:
  - "rm $TOWN_ROOT/buildings/library/inbox/2026-05-26-from-boss-test.md"
```

This verifies the hook fires AND the agent uses the injected state correctly.

## Future: per-role customisation

Some roles might want richer SessionStart context. The boss might want a town-wide health summary; the scout might want recent signals from the wiki. The hook script could `case` on building name and inject different context.

Defer that to v1.1 when we have richer state to inject. For v1, one SessionStart hook for all buildings, with state appropriate to whichever building it fires in.

## In summary

**Yes — agents will reliably know what's in their inbox** via the SessionStart hook. The hook reads the building's state and injects it as system-prompt context before the agent's first turn. The role files' "wake up" instructions then act on that state.

This is shipping in M2 (plugin packaging) so it's wired from the start, not bolted on later.
