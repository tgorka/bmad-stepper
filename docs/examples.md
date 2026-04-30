# Examples

## First Preview

```text
/bmad-next --dry-run
```

Use this before allowing Stepper to run work. Stepper checks `.bmad-stepper/config.yaml`, verifies BMAD prerequisites, reads `.bmad-stepper/state.yaml` as an index, compares artifact evidence, and previews the nearest unfinished step.

Expected preview content includes selected step, selection basis, required inputs, expected outputs, planned tasks, existing and missing evidence, mutation scope, stop conditions, conflicts, and the statement that no project files were modified.

Next safe action: if the preview matches your understanding and reports no blockers, run `/bmad-next` to execute one step.

## State Index Proven by Artifacts

```text
/bmad-next --dry-run
```

If `.bmad-stepper/state.yaml` says the last completed step is `story.dev`, Stepper must still inspect the story artifact frontmatter, task output records, test evidence, and review result required by that step. When all evidence agrees, the preview may select the next unproven step and list the evidence it trusted.

Next safe action: continue with `/bmad-next` only when the preview names the proof and reports no conflicts.

## Scoped Dry-Run

```text
/bmad-next --story 2.3 --dry-run
```

This constrains selection to story `2.3` while remaining read-only. Stepper should report the active story filter and select the nearest unfinished step inside that story based on workflow order, state, and artifact evidence.

Why it may stop: story `2.3` is not known to the workflow, the story artifact is missing required frontmatter, or state claims progress that artifacts do not prove.

Next safe action: correct the target, create or repair the missing artifact, or run `/bmad-next --reconcile` if state and artifacts disagree.

## Prerequisite Failure

```text
/bmad-next --dry-run
```

If `_bmad/core/config.yaml` or the configured `bmad.configPath` is missing, Stepper stops before selecting a step. The diagnostic should name the missing prerequisite category, explain that BMAD Method must already be installed, recommend installing BMAD Method or correcting the config path, and confirm that no project files were modified.

Next safe action: install or restore BMAD Method in the target project, then rerun `/bmad-next --dry-run`.

## Trust Boundary

```text
/bmad-next --dry-run --step story.dev
```

Dry-run can show that Stepper will require declared artifacts, frontmatter, review results, or tests before marking `story.dev` complete. That proves workflow completion evidence, not the semantic quality of the story or implementation.

Next safe action: use human review, BMAD checkpoints, and tests for quality decisions; use Stepper evidence to decide whether workflow progress can be recorded.

## Safe Next Action After Preview

```text
/bmad-next
```

Run this only after a trustworthy preview or when you intentionally want Stepper to execute the nearest safe step. It executes at most one step, runs tasks sequentially, validates outputs, and updates state only after completion evidence is present.

Expected execution record: selected step, optional-step policy, loaded persona/instructions, required inputs, task order, output validation results, repair history if any, completion evidence, and final state update if the transaction passed.

Why it may stop: missing input, ambiguous done criteria, failed validation, human checkpoint, out-of-scope mutation, or repair limit.

Next safe action: follow the stop report. Do not manually advance `.bmad-stepper/state.yaml` unless reconcile confirms that artifacts prove the change.

## Invalid Config or State

```text
/bmad-next --dry-run
```

If `.bmad-stepper/config.yaml` is missing `execution.maxRepairIterations`, has an unsupported `execution.taskExecution`, or lacks the project pin fields under `plugin`, Stepper stops before selecting work. The same applies when `.bmad-stepper/state.yaml` is not shaped like the state template.

Expected diagnostic: invalid field, expected schema or template value, why the field matters for safe execution, recommended repair from `templates/` and `schemas/`, and confirmation that no project files were modified.

## Project-Pinned Asset Update Plan

```text
/bmad-next --dry-run
```

Normal step execution does not update Stepper assets. When a maintainer considers a plugin asset update, Stepper must compare the incoming plugin asset, the pinned project asset, and the current local file. The change plan should classify each item as upstream change, project-local modification, both, or unchanged.

Expected plan content: pinned version, incoming version, affected commands/docs/schemas/templates, local-change status, proposed action, whether overwrite confirmation is required, and how accept, defer, or reject decisions will be recorded.

Next safe action: accept only the items you want overwritten, defer items that need manual review, or reject items that should remain project-local. Deferred and rejected items leave local files unchanged and are captured for audit.

## Blocking State/Artifact Conflict

```text
/bmad-next --dry-run
```

Example conflict: state says `story.review` is complete, but `docs/stories/2-3-example.md` still has `Status: review` and the review follow-up checklist contains unresolved items. Stepper must not select a downstream step from state alone.

Expected diagnostic: what state says, what the story artifact says, which review evidence is unresolved, why continuation is unsafe, and the recommended next action.

Next safe action: run `/bmad-next --reconcile` or repair the artifact evidence before rerunning dry-run.

## Optional Step Included by Default

```text
/bmad-next --step review.fix
```

If `review.fix` is optional and `--skip-optional` is not present, Stepper includes it in normal execution. The run record should state that default optional-step behavior was used.

Next safe action: inspect the run record and completion evidence before allowing the next step.

## Task Validation Failure

```text
/bmad-next --step story.dev
```

If a task declares `docs/stories/2-3-example.md` as a required output but the task does not create it, validation fails. Stepper must not start downstream tasks that depend on that output and must not mark the step complete.

Expected stop report: failed task id, missing output, expected contract, files changed so far, whether repair is available, and the recommended next safe action.

## Repair Succeeds

```text
/bmad-next --step story.review
```

If a task output is missing a required `Senior Developer Review (AI)` section, Stepper may request a repair attempt when repair is allowed and the configured limit has not been reached. After the repair adds the required section and validation passes, Stepper can continue the current step.

Expected run record: initial validation failure, repair attempt number, files changed by repair, post-repair validation result, and final completion evidence if the step later passes.

## Repair Exhausted

```text
/bmad-next --step story.review
```

If validation still fails after `execution.maxRepairIterations`, Stepper writes a failure report and leaves the step incomplete. State is not advanced.

Expected failure report: failed task, expected contract, actual output, attempted repairs, changed files, remaining validation failures, and recommended next action such as manual repair, rerun, or reconcile after evidence exists.

## Finish a Story Loop

```text
/bmad-loop --until story:2.3
```

Runs `/bmad-next` transactions until story `2.3` is complete, including required review/fix loops. Stepper first resolves the `story:<id>` target from workflow, state, and artifact evidence, then records each selected step and result.

Expected loop summary: target `story:2.3`, effective max-step limit, optional-step policy, steps attempted, completed steps, repairs, skipped optional steps if any, state updates after proven steps, final stop reason, and next safe action.

Why it may stop: checkpoint, reconcile requirement, conflict, missing input, ambiguous completion, validation failure, repair limit, max-step limit, or target reached.

Next safe action: inspect the loop summary and any stop report before rerunning the loop.

## Preview a Loop

```text
/bmad-loop --until epic:2 --dry-run
```

Shows the target, likely step sequence, expected outputs, evidence, mutation scope, optional-step policy, effective max-step limit, and stop conditions without executing steps or writing files. Use this when you want to understand loop scope before allowing repeated transactions.

Why it may stop: the target cannot be resolved, the story/epic/phase boundary is ambiguous, or the current state/artifact evidence cannot prove a safe first step.

Next safe action: clarify the target, run `/bmad-next --reconcile`, or repair missing artifacts before executing the loop.

## Story Range Loop

```text
/bmad-loop --until story-range:2.3-2.5 --max-steps 12
```

Runs through the inclusive story range if both endpoints resolve in BMAD workflow order. The loop still executes one `/bmad-next` transaction at a time and stops before step `13` if the target has not been reached.

Why it may stop: either range endpoint is unknown, the range is reversed, a story needs human review, or another step would exceed `--max-steps`.

Next safe action: inspect completed iterations, then rerun with a narrower range, higher limit, or repair action only if the stop report makes continuation safe.

## Malformed Loop Target

```text
/bmad-loop --until story:
```

Stepper rejects the target before mutation because the `story:<id>` value is missing. The diagnostic should show the raw target, accepted target grammar, evidence checked, and a recommended correction such as `/bmad-loop --until story:2.3 --dry-run`.

## Skip Optional Steps

```text
/bmad-loop --until epic:2 --skip-optional
```

Runs through epic `2` while skipping optional steps allowed by the step contract. Optional steps are included by default, so every skipped step must be reported with step id, reason, and evidence that it was optional.

Why it may stop: skipping an optional step makes target completion ambiguous, or a later required step needs evidence that the skipped step would have produced.

Next safe action: review skipped optional steps before treating the epic as fully acceptable for your project.

## Loop Stop Report

```text
/bmad-loop --until next-story
```

If Stepper reaches a human checkpoint, failed validation, repair limit, missing input, ambiguous completion, max-step limit, or target boundary, it stops before starting another step.

Expected stop report: what Stepper tried, what it detected, why it stopped, the relevant step/task/run record, files changed by completed transactions, whether state advanced, and the recommended next command or repair action.

## Reconcile State

```text
/bmad-next --reconcile
```

Use this when `.bmad-stepper/state.yaml` and project artifacts disagree. Stepper should show what state says, what artifacts prove, why they conflict, and choices such as update state, trust artifacts, rerun step, skip step, or diagnostic.

Mutation rule: update state, trust artifacts, rerun step, and skip step require explicit confirmation before state or files change. Diagnostic mode is read-only and should produce the evidence report without modifying workflow state.

Next safe action: choose a repair path only after reading the evidence. Fully automatic state repair is out of scope for v1.

## Reconcile Diagnostic Only

```text
/bmad-next --reconcile
```

Choose `diagnostic` when you want an evidence report without mutation. Stepper should list the conflicting state fields, relevant artifact paths, frontmatter values, run/task records, tests, review results, possible repair choices, and the safest default action.

Next safe action: after reviewing the diagnostic, rerun reconcile and confirm a mutation path, or manually repair artifacts and rerun `/bmad-next --dry-run`.

## Interrupted Run Resume

```text
/bmad-next
```

If the latest run record for `story.dev` is `interrupted`, Stepper must stop before starting unrelated downstream work and offer resume, restart, abandon, or reconcile.

Choose `resume` when existing artifacts partially prove the step. Stepper should reuse proven outputs, avoid duplicating them, and retry only missing or failed task outputs.

Expected run record: prior interrupted run id, reused evidence, unproven outputs retried, validation results after retry, and whether state advanced.

## Restart or Abandon an Interrupted Run

```text
/bmad-next
```

Choose `restart` when the prior run is too stale to resume. Stepper records that the earlier run was superseded, then starts the same selected step again from the current evidence. Choose `abandon` when no further work should be done from that run; state remains unadvanced unless artifacts independently prove completion.

Next safe action: inspect the run record and rerun `/bmad-next --dry-run` before allowing downstream work.

## Idempotent Re-Entry After Partial Output

```text
/bmad-next --step story.review
```

If a previous attempt already produced the review artifact and test summary but failed to update the run record, Stepper must inspect those artifacts before retrying. Proven outputs are reused; only missing review follow-ups, invalid frontmatter, failed tests, or unvalidated task outputs are regenerated or repaired.

Why it may stop: the partial artifacts contradict each other, a required output is missing, or mutation scope cannot be proven.

Next safe action: use reconcile when state and artifacts disagree, or resume the step when only unproven outputs remain.
