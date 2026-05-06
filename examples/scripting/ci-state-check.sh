#!/usr/bin/env bash
# examples/scripting/ci-state-check.sh
#
# CI gate: ensure the project is on a clean Stepper state before merge.
# Usage: ci-state-check.sh
# Exit codes:
#   0 — clean state (no in-flight dispatches, no last_failure_reason)
#   1 — dirty state (last_failure_reason present, or last_attempted != last_successful_step)
#   2 — Stepper not installed or BMAD compatibility error
#
# Requires: bun, jq, /bmad-next available as a slash command (this script
# invokes the underlying TypeScript runner directly via `bun run`).

set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "ci-state-check: bun is not installed; aborting." >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ci-state-check: jq is not installed; aborting." >&2
  exit 2
fi

state_json=$(bun run src/commands/next/run.ts -- --export-state 2>/dev/null) || {
  echo "ci-state-check: --export-state failed (exit $?); see _bmad-output/.stepper/runs/ for transcripts." >&2
  exit 2
}

failure_reason=$(echo "$state_json" | jq -r '.lastFailureReason // empty')

if [[ -n "$failure_reason" ]]; then
  echo "ci-state-check: project is in a halted state. last_failure_reason: $failure_reason" >&2
  echo "Run /bmad-next --resume locally to recover before merging." >&2
  exit 1
fi

last_successful_step=$(echo "$state_json" | jq -r '.lastSuccessfulStep.step // empty')
last_attempted=$(echo "$state_json" | jq -r '.lastAttempted.step // empty')

if [[ "$last_attempted" != "$last_successful_step" && -n "$last_attempted" ]]; then
  echo "ci-state-check: there is an in-flight dispatch (last_attempted=$last_attempted; last_successful=$last_successful_step)." >&2
  echo "Run /bmad-next locally to complete or /bmad-next --skip $last_attempted --resume to skip." >&2
  exit 1
fi

echo "ci-state-check: project is on a clean state. last_successful_step=$last_successful_step. OK to merge."
exit 0
