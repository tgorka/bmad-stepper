# Worked Example 7: State Export for CI

**Scenario:** You want a CI gate that asserts the project is on a clean Stepper state before merging — no in-flight dispatch, no unhandled failure. Stepper exposes the state as JSON via the read-only `--export-state` flag.

**Command:**

```text
/bmad-next --export-state > state.json
```

(or directly via the CLI runner: `bun run src/commands/next/run.ts -- --export-state > state.json`)

**Expected output (`state.json` shape):**

```json
{
  "schemaVersion": 1,
  "epic": "4",
  "story": "4.3",
  "lastSuccessfulStep": {
    "step": "tea-test-plan",
    "completedAt": "2026-05-06T11:30:00Z"
  },
  "lastAttempted": {
    "step": "tea-test-plan",
    "attemptedAt": "2026-05-06T11:30:00Z"
  },
  "lastSnapshot": {
    "branch": "05-05-feat_upgrade-flow_story_6.9_",
    "sha": "5404cbe..."
  },
  "lastFailureReason": null,
  "skips": [],
  "runHistory": [
    { "runId": "2026-05-06T112800Z-bmad-next", "step": "tea-test-plan", "outcome": "success" }
  ]
}
```

**Narrative:** `--export-state` is a non-locking read flag (Story 3.8) that emits the full state.yaml contents as JSON to STDOUT. Per the AR9 carve-out for diagnostic flags, this JSON goes DIRECTLY to stdout (it is NOT wrapped in the AR9 dispatch line shape). The convention follows Story 3.8's precedent: `--export-state`, `--diff-state`, and other read-only flags produce structured output for tooling consumption.

The companion script at [`examples/scripting/ci-state-check.sh`](../../examples/scripting/ci-state-check.sh) parses the JSON via `jq` and asserts:

- `lastFailureReason` is null or absent (no halted state).
- `lastAttempted.step` equals `lastSuccessfulStep.step` (no in-flight dispatch).

If either assertion fails, the script exits 1 with an actionable hint pointing at `--resume` or `--skip --resume`.

**Why this matters:** FR4 (state recoverable from disk) + FR52 (export state for CI integration) make Stepper composable with external tooling. CI pipelines can gate merges on Stepper state without invoking Claude Code at runtime — the script invokes the underlying TypeScript runner directly via `bun run`, so the gate works in plain CI environments.

**Related:** [`halt-recovery.md`](halt-recovery.md); the companion script [`examples/scripting/ci-state-check.sh`](../../examples/scripting/ci-state-check.sh).
