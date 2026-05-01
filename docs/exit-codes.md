# Exit Codes

Reference for `/bmad-next`, `/bmad-loop`, `/bmad-doctor`, and every Stepper subcommand. Per **FR53** (PRD line 744) and architecture cross-cutting concern §10 (line 1439). Hints below are quoted **verbatim** from `src/errors.ts`; if a hint here drifts from the registry, the registry wins (file an issue).

## Quick reference

| Code | Meaning                              |
|------|--------------------------------------|
| 0    | Success                              |
| 1    | Halt with actionable error           |
| 2    | Configuration error                  |
| 3    | BMAD compatibility error             |
| 4    | Lock contention                      |
| 5    | Pathological input / budget exceeded |

Every non-zero code maps to one or more `StepperError` subclasses. The 16-entry registry (Story 1.2 + Story 1.12) is the source of truth.

## Detailed catalog

### Exit Code 0

**Meaning.** Successful run. The command achieved its declared effect (a step advanced, the diagnostic ran clean, a read-only flag returned its data).

**Error class(es).** None — exit 0 means no `StepperError` was thrown.

**Example invocation.** `bun run src/commands/doctor/run.ts` against a project with BMAD installed and a healthy `_bmad-output/.stepper/state.yaml` (or no state file at all).

**Remediation.** N/A.

### Exit Code 1

**Meaning.** Halt with an actionable error. Stepper detected an unrecoverable inconsistency in your project state or a runtime failure that requires you to take a concrete action before retrying.

**Error class(es).** `CorruptStateError`, `StateTooNewError`, `StateChangedDuringDispatchError`, `BranchSwitchError`, `VerifierFailureError`, `TimeoutError` (all from `src/errors.ts`).

**Verbatim actionable hints:**

```text
Run /bmad-next --recompute-state to rebuild the cache from project files.
```

```text
Run /bmad-next --upgrade to install a Stepper version that supports this schema.
```

```text
Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state.
```

```text
Run /bmad-next --resume to retry on the new branch after reviewing the state delta.
```

```text
See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.
```

```text
Run /bmad-next --resume to retry; check bmad-stepper.config.yaml timeouts to extend the per-step deadline.
```

**Example invocation.** `bun run src/commands/doctor/run.ts` against a project whose `_bmad-output/.stepper/state.yaml` is malformed (e.g., truncated mid-write) — the loader throws `CorruptStateError` and the runner exits 1.

**Remediation.** Per the per-class hint above. For `CorruptStateError`, `state.yaml` is a cache (NFR-R3); `--recompute-state` rebuilds it from disk. For `StateTooNewError`, your project state was written by a newer Stepper; upgrade via `--upgrade`. For `BranchSwitchError`, you switched git branches mid-run; review the state delta and resume.

### Exit Code 2

**Meaning.** Configuration error. Stepper could not parse a configuration file (`bmad-stepper.config.yaml`) or you passed an unrecognised CLI flag.

**Error class(es).** `ConfigError`, `ParseError`, `MigrationFailureError` (`MigrationFailureError` is exit 2 in v0.1 because it surfaces from a misconfigured migration registry; this may move to exit 1 in a future polish PR).

**Verbatim actionable hints:**

```text
See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema.
```

```text
Run /bmad-next --doctor to inspect the failing migration; restore _bmad-output/.stepper/state.yaml from .bak and re-run the migration.
```

`ParseError` (Story 1.7 CLI parser) does not declare a registry default hint; the parser surfaces a per-flag synopsis instead.

**Example invocation.** `bun run src/commands/doctor/run.ts -- --unknown-flag` exits 2 with a `ParseError` synopsis.

**Remediation.** For `ConfigError`, validate `bmad-stepper.config.yaml` against the schema by running `/bmad-next --doctor`. For `ParseError`, consult this catalog and the slash command's `--help` (Epic 3 forward-dep). For `MigrationFailureError`, restore `_bmad-output/.stepper/state.yaml` from `state.yaml.bak` and rerun.

### Exit Code 3

**Meaning.** BMAD compatibility error. Either BMAD is missing, the installed version is incompatible with this Stepper release, or the resolved DAG is malformed (cycle, unknown skill).

**Error class(es).** `BmadNotInstalledError`, `BmadIncompatibleError`, `DagCycleError`, `UnknownBmadSkillError`.

**Verbatim actionable hints:**

```text
Run npx bmad-method install --tools claude-code first.
```

```text
Run /bmad-next --upgrade to see a Stepper version compatible with your BMAD installation.
```

```text
See _bmad-output/.stepper/runs/<latest>/log.md for the cycle path; check the bmad-stepper.config.yaml dag.overrides block for circular edges.
```

```text
Run /bmad-next --list to see the candidate skills your BMAD installation registers.
```

**Example invocations.**
- Doctor on a machine with no BMAD: `bun run src/commands/doctor/run.ts` → exit 3 + `BMAD_NOT_INSTALLED` hint.
- Doctor with cyclic `bmad-stepper.config.yaml dag.overrides:` block → exit 3 + `DAG_CYCLE` hint (full cycle path in the latest run log per Story 1.10).

**Remediation.** Per the per-class hint above. For BMAD compat errors, install or upgrade BMAD; for DAG/skill errors, edit `bmad-stepper.config.yaml`.

### Exit Code 4

**Meaning.** Lock contention. Another Stepper invocation holds the project lock at `_bmad-output/.stepper/.lock/`.

**Error class(es).** `LockContentionError`.

**Verbatim actionable hint:**

```text
Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.
```

**Example invocation.** Two `/bmad-next` invocations racing for the same project — the second loses the lock acquisition and exits 4. Note that `--doctor` and other read-only flags are **lock-free** (architecture line 1672); they never produce this exit code.

**Remediation.** Wait for the prior invocation to finish. If you know it died (killed, OOM, network drop), clear the stale lock with `/bmad-next --force-unlock`.

### Exit Code 5

**Meaning.** Pathological input or per-step budget exceeded. Stepper hit a safety limit (e.g., `state.yaml` larger than 50 MB per NFR-P5, a step exceeded its time/token budget, or a target path escaped the allowed scope).

**Error class(es).** `PathologicalInputError`, `BudgetExceededError`, `ScopeViolationError`.

**Verbatim actionable hints:**

```text
Run /bmad-next --recompute-state to rebuild the cache.
```

```text
See bmad-stepper.config.yaml budgets to raise the per-step limit, or run /bmad-next --resume after pruning the input.
```

```text
Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots.
```

**Example invocation.** `state.yaml` exceeds the 50 MB safety limit (NFR-P5 + Story 1.6 size guard) → `PathologicalInputError` → exit 5.

**Remediation.** Per the per-class hint. For `PathologicalInputError`, archive `_bmad-output/.stepper/runs/` and run `--recompute-state`. For `BudgetExceededError`, raise the per-step limit in `bmad-stepper.config.yaml` `budgets:` or prune the input and resume. For `ScopeViolationError`, re-target the path inside the allowed roots.

## CI integration tip

Exit codes are stable across releases (FR53). Consume them from a shell script:

```bash
bun run src/commands/doctor/run.ts
status=$?
case $status in
  0) echo "doctor OK" ;;
  1) echo "halt-with-actionable-error" ; exit 1 ;;
  2) echo "config error" ; exit 2 ;;
  3) echo "BMAD compat error" ; exit 3 ;;
  4) echo "lock contention" ; exit 4 ;;
  5) echo "pathological input / budget" ; exit 5 ;;
  *) echo "unexpected exit $status" ; exit "$status" ;;
esac
```

A worked CI integration example will ship as `docs/examples/state-export-ci.md` with the v0.1.0 marketplace release (Epic 6 Story 6.10).
