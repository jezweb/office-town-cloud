#!/usr/bin/env bash
# Office Town test pack runner
# Usage: ./tests/runner.sh [test-path]
#   Without args: runs all tests
#   With arg: runs a single test (e.g., ./tests/runner.sh roles/librarian-identity.yaml)

set -euo pipefail

# Configuration — adjust per machine
GOOSE_BIN="${GOOSE_BIN:-$HOME/Documents/goose/target/release/goose}"
# TOWN_ROOT points at an Office Town deployment (any clone of the template).
# Default tries common locations; override with: export TOWN_ROOT=/path/to/your/town
TOWN_ROOT="${TOWN_ROOT:-$HOME/Documents/office-town}"
[ -d "$TOWN_ROOT" ] || TOWN_ROOT="$HOME/Documents/my-town"
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0
FAIL=0
FAIL_NAMES=()

run_test() {
    local test_file="$1"
    local test_name
    test_name=$(basename "$test_file" .yaml)

    echo -n "▸ $test_name ... "

    # Parse the YAML (cheap shell parsing — for full pack, replace with yq)
    local working_dir
    local prompt
    local max_turns
    working_dir=$(grep '^working_dir:' "$test_file" | sed 's/working_dir: *//')
    prompt=$(grep '^prompt:' "$test_file" | sed 's/prompt: *//; s/^"//; s/"$//')
    max_turns=$(grep '^max_turns:' "$test_file" | sed 's/max_turns: *//' || echo 4)

    # Run Goose headlessly
    local response
    if ! response=$(cd "$TOWN_ROOT/$working_dir" && "$GOOSE_BIN" run --no-session --quiet --text "$prompt" --max-turns "$max_turns" 2>&1); then
        echo "FAIL (goose run errored)"
        FAIL=$((FAIL+1))
        FAIL_NAMES+=("$test_name (run error)")
        return 1
    fi

    # Check must_contain patterns (very basic — pack a real YAML parser for production)
    local all_ok=1
    while IFS= read -r pattern; do
        # Strip surrounding [] and quotes; if multiple, any match counts
        pattern=$(echo "$pattern" | sed 's/^ *- *//; s/^\[//; s/\]$//')
        local matched=0
        IFS=',' read -ra alternatives <<<"$pattern"
        for alt in "${alternatives[@]}"; do
            alt=$(echo "$alt" | sed 's/^ *//; s/ *$//; s/^"//; s/"$//')
            if echo "$response" | grep -qi -- "$alt"; then
                matched=1
                break
            fi
        done
        if [ "$matched" -eq 0 ]; then
            all_ok=0
            break
        fi
    done < <(awk '/^expected_patterns:/,/^[a-z_]+:/{ if (/^    - /) print $0 }' "$test_file" || true)

    if [ "$all_ok" -eq 1 ]; then
        echo "PASS"
        PASS=$((PASS+1))
    else
        echo "FAIL (pattern check)"
        FAIL=$((FAIL+1))
        FAIL_NAMES+=("$test_name")
    fi
}

main() {
    if ! [ -x "$GOOSE_BIN" ]; then
        echo "Error: goose binary not found at $GOOSE_BIN"
        echo "Set GOOSE_BIN env var or build goose with: cd ~/Documents/goose && cargo build --release"
        exit 1
    fi

    if ! [ -d "$TOWN_ROOT" ]; then
        echo "Error: town root not found at $TOWN_ROOT"
        echo "Set TOWN_ROOT env var to a cloned office-town deployment"
        exit 1
    fi

    if [ $# -gt 0 ]; then
        # Single test
        run_test "$TESTS_DIR/$1" || true
    else
        # All tests
        echo "Office Town test pack — running against $TOWN_ROOT"
        echo "=================================================="
        for test_file in "$TESTS_DIR"/roles/*.yaml "$TESTS_DIR"/integration/*.yaml; do
            [ -f "$test_file" ] || continue
            run_test "$test_file" || true
        done
    fi

    echo "=================================================="
    echo "Results: $PASS passed, $FAIL failed"
    if [ ${#FAIL_NAMES[@]} -gt 0 ]; then
        echo ""
        echo "Failed tests:"
        for name in "${FAIL_NAMES[@]}"; do
            echo "  - $name"
        done
    fi

    [ "$FAIL" -eq 0 ] || exit 1
}

main "$@"
