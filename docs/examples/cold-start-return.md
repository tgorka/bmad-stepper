# Worked Example 1: Cold-Start Return

**Scenario:** You return to a Stepper-managed project after a week away. You have no memory of where you left off. You want a one-line answer.

**Command:**

```text
/bmad-next --explain
```

**Expected output (stderr):**

```text
Resuming epic 3 / story 3.2.
Last successful step: dev-story (completed at 2026-04-29T10:15:00Z).
Last attempted: code-review (attempted at 2026-04-29T10:20:00Z).
Reasoning: state.yaml.lastAttempted = code-review; the verifier passed retry-attempt 1 of 2; the dispatch was halted by SIGINT (manual-sigint). The next step computed by the DAG resolver is `code-review` (resume from the same step).
Suggestion: run /bmad-next to resume the in-flight code-review dispatch.
```

**Narrative:** `--explain` is the cold-start return tool. It re-reads `state.yaml`, runs the DAG resolver, and prints (a) where you are, (b) what the last successful step was, (c) what the last attempted step was, (d) the reasoning the resolver used, and (e) the next-action suggestion. This is the FR1 + FR13 pair used in the canonical "what step is next?" recovery scenario from PRD §journey.

**Why this matters:** Stateful resumption from files alone — no Claude session state required (NFR-I4). The state lives at `_bmad-output/.stepper/state.yaml`; recovery is from disk. Stepper is built for the cold-install persona (Lena scenario in product brief): a developer comes back after days off and immediately knows the next concrete action.

**Related:** [`single-step.md`](single-step.md), [`halt-recovery.md`](halt-recovery.md).
