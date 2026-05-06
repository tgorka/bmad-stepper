#!/usr/bin/env bash
# examples/scripting/nightly-loop.sh
#
# Run a bounded /bmad-loop overnight with sensible safety defaults.
# Usage: nightly-loop.sh
# Stops at:
#   - End of current epic (--until-epic-end), OR
#   - 200k token budget (--token-budget), OR
#   - 50 iterations (--max-iters default cap).
# Checkpoints: after every implementation step.

set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "nightly-loop: bun is not installed; aborting." >&2
  exit 1
fi

bun run src/commands/loop/run.ts -- \
  --until-epic-end \
  --plan-first \
  --token-budget 200000 \
  --checkpoint-each implementation \
  --max-iters 50

# Exit code propagates: 0 = clean exit; 1 = halt with actionable error;
# the loop exit-reason + resume hint are emitted on stderr.
