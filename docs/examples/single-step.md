# Worked Example 2: Single-Step Execution

**Scenario:** You want to run the next BMAD step on the current project. Zero flags. Zero config.

**Command:**

```text
/bmad-next
```

**Expected output (stderr):**

```text
Dispatching dev-story → bmad-step-runner (sonnet, 60k context, 5min timeout).
[...sub-agent runs in isolation; transcript streams to _bmad-output/.stepper/runs/2026-05-06T<ts>-dev-story.log...]
✓ dev-story complete. Next: code-review.
```

**Narrative:** `/bmad-next` with no flags is the canonical zero-config invocation. Stepper:

1. Reads `state.yaml` (lock-free).
2. Runs the DAG resolver to compute the next step.
3. Resolves the persona (default: BMAD's per-skill persona).
4. Builds the dispatch spec at `staging/<run-id>/dispatch-spec.json`.
5. Emits ONE JSON line on stdout (AR9): `{"action": "dispatch", "runId": "...", "agent": "bmad-step-runner"}`.
6. Layer 1 reads the JSON and invokes the sub-agent via the Task tool.
7. Sub-agent runs in isolation; writes to `staging/<run-id>/outputs/`.
8. Layer 1 invokes `verify-and-advance.ts` which (a) acquires the lock, (b) runs the verifier, (c) on pass: promotes + advances state, (d) on fail: dispatches the failure-UX handler.

**Why this matters:** Single-step execution with sub-agent dispatch + verifier-before-promote gate is the FR8 + FR16 + FR17 trio. The whole roundtrip takes ~3-10 seconds + the sub-agent execution time.

**Related:** [`cold-start-return.md`](cold-start-return.md), [`overnight-loop.md`](overnight-loop.md), [`doctor-diagnostic.md`](doctor-diagnostic.md).
