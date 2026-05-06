# Worked Example 5: Skip on Failure

**Scenario:** A non-blocking step (e.g., a non-critical lint or doc step) keeps failing. You want to skip it and advance to the next step.

**Command:**

```text
/bmad-next --skip code-review --resume
```

**Expected output (stderr):**

```text
Skip recorded: code-review at epic 4 / story 4.3.
state.yaml.skips[] appended { step: "code-review", at: "2026-05-06T11:05:00Z", reason: "user-skip" }.
Advancing past skipped step.

Dispatching tea-test-plan → bmad-step-runner (sonnet, 60k context, 5min timeout).
[...sub-agent runs; transcript at _bmad-output/.stepper/runs/2026-05-06T<ts>-tea-test-plan.log...]
✓ tea-test-plan complete. Next: bmad-checkpoint-preview.
```

**Narrative:** `--skip <step>` records the skip in `state.yaml.skips[]` with the timestamp + reason. The flag REQUIRES `--resume` to confirm intent — bare `/bmad-next --skip code-review` halts with a `SkipRequiresResumeError` carrying the byte-identical hint `Run /bmad-next --skip code-review --resume to confirm and advance.` (Story 5.2; matches AR22 regex).

After the skip is recorded, the DAG resolver computes the next step ignoring the skipped one; the dispatch proceeds normally. Subsequent runs see the skip in state.yaml and DO NOT re-attempt the skipped step (the skip is sticky for the current story; it does NOT persist across stories — a fresh story re-evaluates the skip).

**Why this matters:** FR28 (skip-then-advance) + the AR22 actionable-hint contract make skip a safe operation. The `SkipRequiresResumeError` ensures the user explicitly opts in (no accidental skips); the state.yaml record provides an audit trail.

For per-step skip policy (e.g., "always skip code-review for stories tagged docs-only"), see the `failurePolicies` config block — set `failurePolicies.<step>: skip` to make the skip automatic on first verifier rejection. The four supported failure modes are `retry` / `skip` / `route-to-fixer` / `escalate`; see `CONTRIBUTING.md` for the model.

**Related:** [`halt-recovery.md`](halt-recovery.md), [`overnight-loop.md`](overnight-loop.md).
