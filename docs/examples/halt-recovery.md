# Worked Example 4: Halt Recovery

**Scenario:** A `/bmad-loop` run halted mid-execution because the verifier rejected a sub-agent's output. The state file holds the failure context; you want to recover from disk without losing prior work.

**Command:**

```text
/bmad-next --resume
```

**Expected output (stderr):**

```text
Resuming from halt: epic 4 / story 4.3 / step code-review.
Last failure reason: verifier-rejected (verifier=schema-check; failedAt=2026-05-06T10:42:00Z).
Last successful step: dev-story (completed at 2026-05-06T10:30:00Z).

Re-dispatching code-review → bmad-step-runner (sonnet, 60k context, 5min timeout).
[...sub-agent runs; transcript at _bmad-output/.stepper/runs/2026-05-06T<ts>-code-review.log...]
✓ code-review complete. Next: tea-test-plan.
```

**Narrative:** `--resume` is the halt-recovery surface. It:

1. Reads `state.yaml` (acquires the file lock per NFR-S5).
2. Inspects `state.yaml.lastFailureReason` to determine the halt cause.
3. Determines the next concrete action — for `verifier-rejected`, the action is to re-dispatch the same step.
4. Clears `lastFailureReason` and re-runs the dispatch; on success, advances normally.
5. On a second consecutive failure, the failure-UX policy escalates per `bmad-stepper.config.yaml:failurePolicies` (default: `escalate` → halt with single-line actionable hint per AR22).

**Why this matters:** FR27 (resume from halt) + FR32 (recompute state from disk) are the load-bearing reliability invariants. State is recoverable from `_bmad-output/.stepper/state.yaml` without Claude session state (NFR-I4 + NFR-R3); a halt is never a dead-end.

The actionable-hint contract (AR22) ensures every halt produces a single-line `Run /bmad-next --resume to recover.` hint matching the regex `/^.*(Run|See|Try|Check) /` — see `src/errors.ts` for the registry of 17 error codes, all carrying compliant hints.

**Related:** [`skip-on-failure.md`](skip-on-failure.md), [`overnight-loop.md`](overnight-loop.md), [`doctor-diagnostic.md`](doctor-diagnostic.md).
