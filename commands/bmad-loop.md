# /bmad-loop

Repeatedly execute the `/bmad-next` single-step transaction until an explicit stop condition is reached.

`/bmad-loop` inherits BMAD prerequisite diagnostics, state/artifact comparison, state-as-index evidence verification, conflict detection, interrupted-run handling, optional-step policy, one-step transaction semantics, sequential task orchestration, output validation, repair limits, mutation scope, and stop behavior from `/bmad-next`.

## Usage

```text
/bmad-loop --until next-story
/bmad-loop --until story:2.3
/bmad-loop --until story-range:2.3-2.5
/bmad-loop --until epic:2
/bmad-loop --until phase:planning
/bmad-loop --until step:epic.retro
/bmad-loop --max-steps 10
/bmad-loop --skip-optional
/bmad-loop --dry-run
```

## Inputs

- The same config, state, BMAD workflow assets, and artifact evidence required by `/bmad-next`.
- Project-pinned Stepper config, including loop limits, output directories, and asset update protections inherited from `.bmad-stepper/config.yaml`.
- `--until <target>`, unless a project default loop target is explicitly configured later.
- Optional loop controls: `--max-steps`, `--skip-optional`, and `--dry-run`.

## Target Parsing

`--until` must resolve before dry-run planning or execution. Supported target forms are:

- `next-story`: Stop when the current story boundary is complete and before any step from the next story would start. If no active story can be inferred from workflow, state, and artifacts, stop without mutation and recommend a story, epic, phase, or step target.
- `story:<id>`: Stop when the named story is complete, including required review/fix loops and declared completion evidence. `<id>` is the BMAD story id, such as `2.3`.
- `story-range:<start>-<end>`: Stop when every story in the inclusive range is complete. Both endpoints must resolve to known stories in workflow order and `<start>` must not sort after `<end>`.
- `epic:<id>`: Stop when every required story or step in the epic target is complete.
- `phase:<name>`: Stop when the phase target is complete or before the next phase would start.
- `step:<id>`: Stop after the exact step contract is complete.

Malformed, unknown, ambiguous, or unsupported targets stop before planning output can be treated as executable. The diagnostic must include:

- The raw target string.
- The expected target grammar.
- Which workflow, state, or artifact evidence was checked.
- Why the target could not be resolved safely.
- A recommended clarification or repair action.
- Confirmation that no files were modified.

Examples of malformed targets include missing prefixes (`story`), missing values (`story:`), reversed or unresolved ranges (`story-range:2.5-2.3`), unsupported prefixes (`milestone:alpha`), and ids that do not map to BMAD workflow or artifact evidence.

## Dry-Run Loop Plan

`/bmad-loop --dry-run` is read-only. It performs prerequisite diagnostics, target parsing, workflow/state/artifact inspection, and likely path planning without executing any step.

The dry-run loop plan must show:

- Resolved target type, value, and boundary rule.
- Current workflow position and evidence used to infer it.
- Whether the indexed state is proven by artifacts, unproven, conflicting, or blocked by an unfinished run.
- Likely step sequence up to the target or configured max-step limit.
- For each likely step: step id, phase, epic/story scope when known, optionality, expected outputs, mutation scope, and completion evidence.
- Optional-step policy: included by default or skipped by `--skip-optional`.
- Effective step limit: `--max-steps` when present, otherwise `execution.maxLoopSteps`.
- Stop conditions that would interrupt execution before the target.
- Any unresolved evidence, conflicts, missing inputs, or ambiguous completion criteria.
- A clear statement that no project files were modified.

If the target or first safe step cannot be proven from workflow, state, and artifacts, dry-run stops with a diagnostic and recommends `/bmad-next --reconcile`, `/bmad-next --dry-run --step <id>`, a narrower target, resume/restart/abandon for an interrupted run, or manual artifact repair as appropriate.

## Operating Rules

1. Require an explicit `--until` stop condition unless a project default exists.
2. Resolve the target before execution: `next-story`, `story:<id>`, `story-range:<start>-<end>`, `epic:<id>`, `phase:<name>`, or `step:<id>`.
3. Reject malformed or unresolved targets without mutation.
4. For `--dry-run`, preview the target, likely step sequence, expected outputs, evidence requirements, mutation scope, configured limits, and stop conditions without executing steps or writing files.
5. For execution, repeatedly invoke `/bmad-next` semantics for each individual step. `/bmad-loop` does not create a second transaction model.
6. Evaluate the loop target after each completed `/bmad-next` transaction.
7. Respect `--max-steps` when provided, otherwise `execution.maxLoopSteps`.
8. Include optional steps by default unless `--skip-optional` is present.
9. Treat story completion as including required review/fix loops.
10. Stop immediately on checkpoint, reconcile requirement, state/artifact conflict, unfinished run requiring resume/restart/abandon, missing input, ambiguous `doneCriteria` or completion evidence, failed validation, target resolution failure, out-of-scope mutation, repair limit, max-step limit, or target reached.
11. When a task validation failure is repaired within the configured limit, continue the current `/bmad-next` transaction before evaluating the loop target again.
12. When repair is exhausted, preserve the `/bmad-next` failure report, stop the loop, and do not start another step.
13. Write a loop summary showing every step attempted, completed, blocked, skipped, repaired, failed, interrupted, abandoned, or reused from proven evidence.

## Execution Behavior

Without `--dry-run`, `/bmad-loop` executes as a bounded sequence of `/bmad-next` transactions:

1. Load Stepper config and BMAD prerequisites. Stop before mutation if BMAD Method assets are missing.
2. Resolve the loop target and effective max-step limit.
3. Compare the state index with artifact evidence and stop before mutation if conflicts or unfinished runs prevent proving the first safe step.
4. Open or update a loop run record with target, optional-step policy, max-step limit, selected scope, configured output directories, and initial evidence.
5. Select the next safe step using `/bmad-next` selection rules.
6. Stop before execution if the next safe step cannot be proven from workflow, state, and artifact evidence.
7. Execute exactly one `/bmad-next` transaction.
8. Record the iteration result: selected step, status, evidence, reused proven artifacts, skipped optional step if any, repair history, failure report link, and state update status.
9. If the transaction completed and the target is reached, stop successfully and write a loop summary.
10. If the transaction completed and the target is not reached, repeat from step selection unless the next iteration would exceed the max-step limit.
11. If the transaction stops, blocks, is interrupted, fails validation, requires reconcile, reaches repair limits, or needs a human decision, stop the loop before starting another step.

Each iteration must preserve `/bmad-next` transaction boundaries. State may advance after a completed step, but the loop itself must not mark downstream progress complete without that step's evidence.

If config or state is invalid before the loop starts, `/bmad-loop` stops with the same validation-oriented diagnostic required by `/bmad-next`. Invalid `execution.maxLoopSteps`, output directories, optional-step policy, task execution policy, or project-pinning fields must be reported before any mutation.

## Max-Step Behavior

The effective step limit is:

1. `--max-steps <n>` when provided.
2. Otherwise `execution.maxLoopSteps` from `.bmad-stepper/config.yaml`.

The limit counts attempted `/bmad-next` transactions, not skipped planning entries. When the limit is reached and another step would be required to hit the target, Stepper stops before executing more work. The stop report must state the effective limit, steps attempted, steps completed, remaining target, and the command that would continue intentionally, such as rerunning with a higher `--max-steps` after reviewing the summary.

## Optional-Step Behavior

Optional BMAD steps are included by default. When `--skip-optional` is present, Stepper skips optional steps for the whole loop only when the step contract allows skipping. Every skipped optional step must be recorded in the loop summary with step id, reason, and evidence that it was optional.

Skipping an optional step does not relax required completion evidence for the target. If skipping makes target completion ambiguous, the loop stops and asks for a human decision instead of marking the target complete.

## Mutation Scope

Dry-run may inspect workflow, state, and artifact evidence but must not write files. Real loop execution may only apply the mutations allowed by each selected `/bmad-next` step plus loop run summaries. State updates remain transactional and evidence-backed per step.

## Loop Summary and Stop Reports

Every loop stop, successful or blocked, writes a summary with:

- Target and resolved boundary.
- Effective max-step limit and optional-step policy.
- Steps planned, attempted, completed, skipped, repaired, blocked, or failed.
- Per-iteration `/bmad-next` run record links.
- Evidence used to decide target progress.
- Final stop reason.
- State updates made after completed steps.
- Files changed by allowed step mutations and loop records.
- Run/task validation results, repair history, failure report references, and review/fix history needed to understand progress after interruption.
- Recommended next safe action.

Stop reasons include:

- `target-reached`
- `max-steps-reached`
- `checkpoint-required`
- `reconcile-required`
- `conflict-detected`
- `interrupted-run`
- `missing-input`
- `ambiguous-completion`
- `validation-failed`
- `repair-limit-reached`
- `target-unresolved`
- `out-of-scope-mutation`
- `bmad-prerequisite-missing`

When the loop cannot prove the next safe step or target boundary, it stops instead of guessing. The stop report must explain the target, completed iterations, blocking evidence, missing input, failed task validation, repair exhaustion, why continuation is unsafe, and the recommended next command or repair action.

For conflict or interrupted-run stops, the report must show what state says, what artifacts prove, whether any outputs are reusable, and whether the next safe action is reconcile, resume, restart, abandon, diagnostic, or manual repair. `/bmad-loop` must not perform reconcile itself; it delegates repair to `/bmad-next --reconcile` or a user-confirmed single-step action.
