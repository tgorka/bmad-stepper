# Worked Example 6: Doctor Diagnostic

**Scenario:** You upgraded BMAD-METHOD to a new version. Before running another step, you want to verify Stepper still detects BMAD correctly and the DAG is intact.

**Command:**

```text
/bmad-next --doctor
```

(or the alias `/bmad-doctor`)

**Expected output (stderr):**

```text
BMAD detected: v6.5.0 (compatible)
Project: bmad-stepper
State file: present (epic 4 / story 4.3)
Step registry: built from 47 BMAD skills + 0 project overrides; DAG validated; no cycles
Suggestion: run /bmad-next to advance to the next step.
```

**Narrative:** `--doctor` is the lock-free first-run + post-upgrade diagnostic. It:

1. Detects BMAD via `src/bmad-detect/` (cache layout `~/.claude/plugins/cache/bmad-method/bmad/<version>/` or spec layout `~/.claude/plugins/bmad-method-<version>/`).
2. Reads `state.yaml` if present (lock-free; never mutates).
3. Builds the step registry from BMAD's `skills.yaml` + `bmad-stepper.config.yaml:overrides`.
4. Runs the DAG validator (acyclic check + reachability check).
5. Prints five lines on stderr; exits `0` on success, `1` on corrupt state, `3` on missing or incompatible BMAD.

If BMAD introduces a new skill not yet in Stepper's seed, doctor reports `Step registry: ... + 1 unknown skill (analyst-deep-dive). Run /bmad-next --doctor with config to see the override path.` — the actionable hint pointing at the `overrides:` config workflow per FR35.

**Why this matters:** FR41 (doctor command) + FR50 (BMAD compatibility surface) make Stepper's BMAD-version handling transparent and recoverable. The `--doctor` command is read-only (no lock acquired) so it works even when the project is in a halted state.

The exit codes are part of the FR53 catalog; see `docs/exit-codes.md` for the full inventory (0 = success, 1 = corrupt state, 2 = lock contention, 3 = BMAD compat error, 4 = invalid args, 5 = sub-agent timeout).

**Related:** [`cold-start-return.md`](cold-start-return.md), [`single-step.md`](single-step.md).
