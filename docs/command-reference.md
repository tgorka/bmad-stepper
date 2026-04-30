# Command Reference

BMAD Stepper v1 is prompt-first. The command specifications are the product behavior contract until executable validation is justified. BMAD Method must already exist in the target project; Stepper diagnoses missing BMAD prerequisites and stops instead of installing BMAD.

## `/bmad-next`

### Intent

Select and, unless `--dry-run` is present, execute exactly one BMAD workflow step as the atomic unit of progress.

### Inputs

- `.bmad-stepper/config.yaml`, especially `bmad.configPath`, optional-step policy, repair limits, loop limits, sequential task execution, output directories, review/fix history, and project-pinned asset update policy.
- `.bmad-stepper/state.yaml`, treated as an index.
- BMAD workflow definitions and referenced agents, tasks, templates, and checklists.
- Existing artifacts, frontmatter, run records, task outputs, review results, and test evidence.
- Evidence references, conflict records, reconcile decisions, checkpoints, and unfinished run records from `.bmad-stepper/state.yaml`.
- Optional scope flags: `--epic`, `--story`, `--phase`, and `--step`.

### Outputs

- Dry-run preview or execution summary.
- Stop report when safe continuation cannot be proven.
- During execution only: step artifacts, task outputs, validation results, repair history, failure reports when repair is exhausted, run records, and state index updates after evidence passes.
- During reconcile only: repair report and any user-confirmed state or artifact changes.
- During asset update planning only: change plans and accept/defer/reject decisions for project-pinned Stepper assets.

### State Changes

- `--dry-run` makes no state changes.
- Normal execution may update `.bmad-stepper/state.yaml` only after required artifact/frontmatter evidence proves the step complete.
- During execution, state records the completed step and supporting evidence only after task outputs and step done criteria validate.
- Failed validation, repair exhaustion, missing inputs, ambiguous completion, or checkpoint stops leave the step incomplete.
- `--reconcile` may update state or files only after the user explicitly chooses and confirms a repair path.
- Interrupted runs remain indexed as unfinished until the user chooses resume, restart, abandon, or reconcile.
- Project-pinned asset updates may change command specs, schemas, templates, or docs only after a local-change-aware plan is confirmed.

### Mutation Scope

- `--dry-run` is read-only.
- Normal execution may mutate only selected step outputs, run/task records, and the state index after validation.
- Out-of-scope mutations stop the step or require explicit user confirmation.

### Stop Conditions

Missing BMAD prerequisites, missing required inputs, unresolved scope filters, state/artifact conflicts, ambiguous completion evidence, failed validation, human checkpoints, out-of-scope mutations, and exceeded repair limits.

### Failure Behavior

The command stops without marking the step complete. The report must state what Stepper tried, what it detected, why it stopped, whether any files changed, and the recommended next safe action.

### Execution Lifecycle

Normal `/bmad-next` execution is one transaction:

1. Validate `.bmad-stepper/config.yaml` and `.bmad-stepper/state.yaml` against the prompt-first templates and schemas.
2. Compare the state index with artifact evidence before selecting downstream work.
3. Classify relevant prior evidence as proven, unproven, conflicting, or unknown.
4. Stop for reconcile if state and evidence conflict or if an unfinished run prevents safe selection.
5. Select exactly one step from workflow, state, artifacts, and optional scope flags.
6. Open a run record for that selected step, including selected inputs and expected evidence.
7. Load persona, instructions, inputs, outputs, tasks, done criteria, review policy, and next transitions.
8. Include optional steps by default unless `--skip-optional` is present.
9. Reuse proven artifacts on idempotent re-entry and retry only unproven outputs.
10. Run declared task sub-agents sequentially.
11. Validate each task output and mutation scope before starting the next task.
12. Repair failed task outputs only within `execution.maxRepairIterations`.
13. Confirm step completion evidence.
14. Update `.bmad-stepper/state.yaml` only after evidence passes.
15. Stop without starting a downstream step.

### Configuration and Project-Pinned Assets

Config controls optional steps, repair limits, loop limits, sequential task execution, output directories, review/fix history, recovery policy, and the project pin. Optional steps are included by default, task execution is sequential in v1, and output directories define where run, task, failure, loop, reconcile, and diagnostic records are written.

`plugin.pinnedVersion` records the Stepper behavior this project expects. A newer global plugin must not silently overwrite project-pinned command specs, schemas, templates, or docs. Any asset update flow must detect local changes, distinguish upstream plugin changes from project-local modifications, show a change plan, require confirmation before overwrites, and capture accepted, deferred, or rejected items in an audit record.

Invalid config or state stops before workflow selection. The diagnostic should name the invalid field, expected schema/template value, repair path, and whether any files changed.

### State, Evidence, and Conflicts

State is an index, not proof. Before `/bmad-next --dry-run` or real execution trusts `workflow.lastStep`, `workflow.nextStep`, recent runs, or checkpoints, it must compare the index with artifact evidence:

- artifact paths and frontmatter,
- expected output files,
- run/task records and validation results,
- tests declared by the step contract,
- review results and review/fix history,
- repair attempts and failure reports.

Blocking conflicts include state marking a step complete while artifacts say incomplete, expected outputs missing, tests or review results contradicting state, state pointing to the wrong workflow position, unfinished runs without completion evidence, or partial artifacts that cannot prove downstream work is safe.

When conflicts exist, `/bmad-next` refuses unsafe continuation. The report must state what state says, what artifacts prove, why the sources disagree, what proof is missing, whether files changed, and the recommended next safe action.

### Reconcile and Diagnostics

`/bmad-next --reconcile` is interactive. It presents the evidence and offers these choices:

- `update state`: update `.bmad-stepper/state.yaml` to match artifact-proven progress.
- `trust artifacts`: proceed from artifact evidence while recording that the state index was stale.
- `rerun step`: re-enter the conflicted step and regenerate only unproven outputs.
- `skip step`: skip only when the workflow, artifacts, and user confirmation make that safe.
- `diagnostic`: produce an evidence and repair-path report without mutation.

Any choice that mutates state, artifacts, checkpoints, run records, or repair records requires explicit confirmation. Diagnostic mode is read-only and should be the safe default when evidence remains ambiguous.

### Interrupted Runs and Re-Entry

If a recent run record is `in-progress` or `interrupted`, `/bmad-next` must stop before unrelated downstream work and offer:

- `resume`: reuse proven artifacts and continue only from unproven task outputs.
- `restart`: record the prior run as superseded or abandoned, then start the same step again.
- `abandon`: record the decision and leave workflow progress unadvanced unless artifacts independently prove completion.
- `reconcile`: compare the unfinished run, state index, and artifacts when they disagree.

Re-entry is idempotent: existing proven artifacts are reused, duplicate outputs are avoided, and only missing, failed, contradicted, or out-of-scope outputs are regenerated or repaired.

### Task Contract and Validation

Each task record must include persona, explicit inputs, any source output from prior tasks, allowed paths, required outputs, validation result, self-check, and downstream outputs. The required self-check fields are persona used, inputs read, outputs produced, and scope respected.

Validation checks declared output presence, required sections or frontmatter, contract markers, self-check completeness, and mutation scope. Out-of-scope mutations are listed and either stop the step or require explicit user approval.

### Repair and Failure Reports

When task validation fails, Stepper may request repair attempts up to `execution.maxRepairIterations`. Every repair attempt records the failed checks, repair summary, changed files, and post-repair validation result.

If repair succeeds, the current transaction continues and the run record keeps the repair history. If repair is exhausted, Stepper writes a failure report, leaves the step incomplete, does not advance state, and recommends the next safe action.

### Run and Audit Records

Run records preserve selected step, inputs, task outputs, validation results, repairs, failures, review/fix history, state update results, and evidence references. They must include enough interruption context for resume, restart, abandon, reconcile, or audit after the chat context is gone. State remains an index of those records; the detailed proof lives in `.bmad-stepper/runs`.

### Options

- `--epic <id>`: Constrains selection to a known epic. Input is an epic id from workflow or artifacts. Output reports the active filter. Stops read-only if the epic cannot be resolved.
- `--story <id>`: Constrains selection to a story. Input is a story id such as `2.3`. Output reports the selected unfinished step within that story. Stops read-only if the story is unknown or artifact evidence conflicts.
- `--phase <name>`: Constrains selection to a workflow phase. Output reports which phase scope was used. Stops read-only if no matching phase exists.
- `--step <id>`: Selects a specific step contract for preview or execution. Stops if the step id is unknown, already complete without a safe rerun path, or lacks required inputs.
- `--skip-optional`: Skips optional steps for this invocation. State changes are still evidence-backed; skipped optional steps must be reported.
- `--dry-run`: Performs prerequisite diagnostics, step selection, state/artifact comparison, preview output, and stop-condition reporting without file mutation.
- `--reconcile`: Runs interactive state/artifact repair. It shows what state says, what artifacts prove, why they disagree, and user-confirmed choices such as update state, trust artifacts, rerun step, skip step, or diagnostic.

## `/bmad-loop`

### Intent

Repeat `/bmad-next` transactions until an explicit target or stop condition is reached.

### Inputs

- The same config, BMAD prerequisites, state index, workflow assets, and artifact evidence used by `/bmad-next`.
- Configured optional-step policy, `execution.maxLoopSteps`, output directories, review/fix history policy, and project pinning fields.
- Conflict records, reconcile decisions, checkpoints, and unfinished run records that may block repeated execution.
- A loop target from `--until`: `next-story`, `story:<id>`, `story-range:<start>-<end>`, `epic:<id>`, `phase:<name>`, or `step:<id>`.
- Optional loop controls: `--max-steps`, `--skip-optional`, and `--dry-run`.

### Outputs

- Dry-run loop plan with resolved target, likely step sequence, expected outputs, evidence, mutation scope, limits, and stop conditions.
- Loop execution summary with target, per-step outcomes, optional skips, repairs, final stop reason, state updates, and next safe action.
- Per-step summaries from each `/bmad-next` transaction.
- Stop report when a target, limit, checkpoint, validation problem, or conflict stops the loop.
- During execution only: selected step artifacts, run/task records, validation results, repair histories or failure reports, loop records, and state updates after each proven step.
- Asset update decisions only when a maintainer explicitly runs or accepts an update plan outside normal step execution.

### State Changes

- `--dry-run` makes no state changes.
- Execution updates state only through completed `/bmad-next` transactions.
- Reaching `--max-steps` or any blocker stops before starting another step.
- Loop records may be written during real execution to preserve target, iterations, stop reason, and recommended next action.

### Mutation Scope

- Dry-run loop planning is read-only.
- Execution may mutate only the files allowed by each selected step plus loop run summaries.
- Unexpected mutation outside the selected step scope stops or requires confirmation.

### Stop Conditions

Target reached, missing BMAD prerequisites, unresolved or malformed target, max step limit reached, missing input, state/artifact conflict, unfinished run, human checkpoint, failed validation, ambiguous completion, out-of-scope mutation, or exceeded repair limit.

### Failure Behavior

The loop stops at the first unsafe condition. The report must explain the target, steps attempted, steps completed, blocking evidence or missing input, failed step or task record when relevant, why continuation is unsafe, and the recommended next command or repair action.

`/bmad-loop` does not define a separate execution model. It repeatedly invokes the `/bmad-next` one-step transaction and stops when a task validation failure cannot be repaired within limits.

### Target Parsing

Targets are parsed before planning or execution:

- `next-story`: Resolve from the current story inferred from workflow, state, and artifact evidence. Stops before any step from the next story starts.
- `story:<id>`: Resolve one story id, such as `2.3`, and stop when that story is complete, including required review/fix loops.
- `story-range:<start>-<end>`: Resolve an inclusive range in workflow order. Both endpoints must exist and the range must be ordered.
- `epic:<id>`: Resolve an epic boundary and stop when required epic work is complete.
- `phase:<name>`: Resolve a BMAD workflow phase and stop before moving beyond that phase.
- `step:<id>`: Resolve an exact step contract and stop after it completes.

Malformed targets stop without mutation. The diagnostic reports the raw target, expected grammar, evidence checked, why resolution failed, and how to clarify or repair the target.

### Loop Execution Lifecycle

Normal `/bmad-loop` execution is a bounded sequence:

1. Load config, BMAD prerequisites, state index, workflow assets, and artifact evidence.
2. Resolve the target and effective max-step limit.
3. Verify the state index against evidence and stop if conflicts or unfinished runs make the first step unsafe.
4. Open a loop record with target, optional-step policy, max-step limit, and starting evidence.
5. Select and execute one safe `/bmad-next` transaction.
6. Record the iteration result, evidence, reusable artifacts, and any repair or failure references.
7. Stop if the target is reached, a blocker occurs, or another iteration would exceed the max-step limit.
8. Otherwise repeat selection and single-step execution.
9. Write the loop summary and stop report.

### Options

- `--until next-story`: Runs until the current story boundary is complete and stops before moving to the next story.
- `--until story:<id>`: Runs until the specified story is complete, including required review/fix loops.
- `--until story-range:<start>-<end>`: Runs through a bounded story range. Stops if either endpoint cannot be resolved.
- `--until epic:<id>`: Runs until the epic target is complete or a safety stop occurs.
- `--until phase:<name>`: Runs until the phase target is complete or a safety stop occurs.
- `--until step:<id>`: Runs until the specific step is complete, then stops.
- `--max-steps <n>`: Overrides `execution.maxLoopSteps` for this invocation. The loop stops before executing step `n + 1`.
- `--skip-optional`: Skips optional steps throughout the loop and reports each skip.
- `--dry-run`: Previews target resolution, likely step sequence, evidence, mutation scope, limits, and stop conditions without executing steps or writing files.
