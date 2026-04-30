# /bmad-next

Select and, unless `--dry-run` is present, execute exactly one BMAD workflow step.

BMAD Method is a prerequisite. Stepper must diagnose missing BMAD assets and stop; it must never install BMAD or imply that it can repair a missing BMAD installation automatically.

## Usage

```text
/bmad-next
/bmad-next --epic 2
/bmad-next --story 2.3
/bmad-next --phase planning
/bmad-next --step story.dev
/bmad-next --skip-optional
/bmad-next --dry-run
/bmad-next --reconcile
```

## Inputs

- `.bmad-stepper/config.yaml`, using `bmad.configPath` to locate BMAD Method configuration.
- Project-pinned Stepper config, including `plugin.pinnedVersion`, `plugin.updatePolicy`, and asset update protections.
- `.bmad-stepper/state.yaml`, treated as an index of the active workflow position.
- BMAD workflow files, agent definitions, task definitions, templates, checklists, and project artifacts required by the selected workflow.
- Artifact frontmatter, expected output files, run records, task outputs, review results, and test evidence relevant to the current step.
- Evidence references recorded in prior run records, including artifact paths, frontmatter keys, task output paths, test summaries, review results, and failure or repair reports.
- Optional scope flags: `--epic`, `--story`, `--phase`, or `--step`.

## Configuration and Project Pin

Before preview or execution, Stepper must read `.bmad-stepper/config.yaml` and validate the prompt-first contract:

- `execution.optionalSteps`: optional BMAD steps are included by default unless `--skip-optional` is present.
- `execution.maxRepairIterations`: bounded repair limit used for task output validation.
- `execution.maxLoopSteps`: default loop limit inherited by `/bmad-loop`.
- `execution.taskExecution`: v1 must be `sequential`.
- `outputs.*`: directories for run records, task outputs, failure reports, loop summaries, reconcile reports, and diagnostics.
- `plugin.pinnedVersion`: project behavior is interpreted against this pinned Stepper version.
- `plugin.assetUpdate`: local-change detection, change-plan requirements, overwrite confirmation, and accept/defer/reject decision recording for project assets.

If config or state is invalid, Stepper stops before selecting or executing work. The diagnostic must identify the invalid field, explain the expected schema or template value, recommend repair from the committed templates/schemas, and confirm whether any files were modified.

Project-pinned behavior means a newer global plugin must not silently change this project's command specs, schemas, templates, or docs. When an asset update is considered, Stepper must compare the incoming plugin asset, the pinned project asset, and the current local file; classify differences as upstream, project-local, or both; present a change plan; require confirmation before overwrites; and record accepted, deferred, or rejected items for audit.

## Prerequisite Diagnostics

Before selecting work, Stepper must verify that the configured BMAD prerequisite category is present:

- BMAD core config: the path from `bmad.configPath`, usually `_bmad/core/config.yaml`.
- BMAD workflow source: workflow definitions or workflow references needed to determine step order.
- BMAD execution assets: referenced agents, tasks, templates, and checklists for the candidate workflow.

If any prerequisite category is missing, Stepper stops before workflow selection and before file mutation. The diagnostic output must include:

- Missing category and expected path or reference.
- Why the category is required for safe preview or execution.
- Recommended repair, such as installing BMAD Method in the target project or correcting `bmad.configPath`.
- Confirmation that no project files were modified.

## Dry-Run Behavior

`/bmad-next --dry-run` is the first trust path. It performs configuration loading, BMAD prerequisite diagnostics, workflow/state/artifact inspection, scope filtering, and preview rendering only.

Dry-run output must include:

- Selected step identity: workflow, phase, epic, story, step id, and optionality when known.
- Selection basis: workflow order, state index values, artifact/frontmatter evidence, and active scope filter.
- Required inputs and whether each input is present, missing, or ambiguous.
- Expected outputs, declared mutation scope, planned tasks, and sequential task order.
- Completion evidence Stepper will require before the step can be marked complete.
- Existing evidence versus missing evidence.
- Stop conditions, possible conflicts, and recommended next safe action.
- A clear statement that no project files were modified.

Dry-run must stop without mutation when:

- BMAD prerequisites are missing.
- The requested scope cannot be resolved.
- State and artifacts conflict.
- The next safe step cannot be proven from workflow, state, and evidence.

## Step Selection

Stepper selects the nearest unfinished BMAD step by comparing:

1. Workflow order from BMAD.
2. `.bmad-stepper/state.yaml` as an index, not as proof.
3. Artifact evidence, including frontmatter, expected output files, run/task records, review results, and tests where declared.

`--epic`, `--story`, `--phase`, and `--step` constrain selection to the requested target. If the target does not map to a known workflow element or artifact scope, Stepper stops without mutation and reports the unresolved target.

## State Index and Evidence Verification

Before dry-run selection or real execution chooses downstream work, Stepper must reconcile the indexed state with evidence:

1. Read `.bmad-stepper/state.yaml` only as a pointer to workflow id, phase, epic, story, last step, next-step hint, recent runs, conflicts, checkpoints, and evidence references.
2. Load only the artifact evidence relevant to the candidate scope and nearest indexed steps: declared output files, frontmatter, run/task records, validation results, tests, review results, repair history, and failure reports.
3. Classify each relevant prior step as `proven`, `unproven`, `conflicting`, or `unknown`.
4. Trust an indexed `lastStep` or `nextStep` only when the required evidence for the preceding step is `proven`.
5. Treat missing, incomplete, contradictory, or stale evidence as a blocker for selecting downstream work.

If evidence confirms the indexed position, the dry-run preview or run record must name the evidence used. If evidence is missing, Stepper reports the missing proof and selects the next unproven step only when doing so is safe and within the requested scope.

## Conflict Detection

State/artifact conflicts are blocking when any of these conditions appear:

- State marks a step complete, but artifact frontmatter, run status, review result, or test evidence says incomplete, failed, blocked, or unresolved.
- State points past a step whose expected output file, required section, task output, review result, or test summary is missing.
- State points to one workflow, epic, story, phase, or step while artifacts prove a different active position.
- A run record is `in-progress` or `interrupted` and lacks enough evidence to prove the selected step completed.
- Repair history, failure reports, checkpoints, or review follow-ups contradict the claimed completed step.
- Existing artifacts partially satisfy a step, but the unproven outputs are required before downstream work can start.

When a blocking conflict exists, `/bmad-next` must stop before selecting or executing downstream work. The report must show what state says, what artifacts prove, which sources disagree, why continuation is unsafe, and the recommended next safe action. Dry-run conflict detection remains read-only.

## Reconcile Mode

`/bmad-next --reconcile` is the interactive repair path for state/artifact disagreement. It must:

1. Show the indexed workflow position and the relevant evidence sources.
2. Explain each conflict in plain language, including the proof required for safe continuation.
3. Recommend the safest default action, normally `diagnostic` or `rerun step` when evidence is incomplete.
4. Offer these choices:
   - `update state`: change `.bmad-stepper/state.yaml` to match proven artifacts.
   - `trust artifacts`: continue from artifact-proven progress while recording why the indexed state was stale.
   - `rerun step`: re-enter the conflicted step and regenerate only unproven outputs.
   - `skip step`: mark a step skipped only when the workflow and user confirmation make that safe.
   - `diagnostic`: write or display an evidence report without mutating state or artifacts.
5. Require explicit user confirmation before any choice mutates state, artifacts, run records, checkpoints, or repair records.
6. Record the confirmed decision, evidence reviewed, files changed if any, and next recommended command in the run or repair record.

Reconcile must never perform fully automatic state repair. If the user declines confirmation or chooses diagnostic, workflow state remains unchanged.

## Interrupted Runs and Idempotent Re-Entry

Before starting new work, Stepper must inspect recent run records for `in-progress` or `interrupted` runs in the active scope. If an unfinished run exists, Stepper stops and offers:

- `resume`: re-enter the same step, reuse proven artifacts, and retry only unproven or incomplete task outputs.
- `restart`: start a fresh run for the same step after recording the abandoned or superseded run decision.
- `abandon`: record that the prior run will not be continued and leave workflow progress unadvanced unless artifacts independently prove completion.
- `reconcile`: enter reconcile mode when the unfinished run and artifacts disagree.

Re-entry is idempotent: Stepper must inspect existing artifacts before retrying work, preserve proven outputs, avoid duplicating completed task outputs, and regenerate or repair only evidence that is missing, failed, contradicted, or outside declared scope.

## Execution Behavior

Without `--dry-run`, `/bmad-next` executes one selected step as a transaction:

1. Select exactly one candidate step using the same workflow, state, artifact, and scope rules used by dry-run.
2. Stop before opening new work if an unfinished run requires resume, restart, abandon, or reconcile.
3. Open a run record for the selected step with `status: in-progress`, the selected scope, selected inputs, optional-step policy, declared mutation scope, and the evidence Stepper expects before completion.
4. Load the selected step contract: persona, instructions, required inputs, expected outputs, tasks, done criteria, review policy, and next transitions.
5. Stop before task execution if required inputs are missing, completion criteria are ambiguous, the selected step needs a human decision, or the selected step cannot be proven safe from state and artifacts.
6. Include optional steps by default unless `--skip-optional` is present. When default inclusion applies, the run record must state that optional steps were included by default.
7. Prepare task context from the step contract and existing artifacts.
8. Reuse proven existing artifacts on re-entry and identify unproven outputs that must be retried or repaired.
9. Run task sub-agents sequentially in declared order.
10. Validate each task output and mutation scope before starting the next task.
11. Run bounded repair when validation fails and repair is allowed.
12. Confirm step-level done criteria from validated task outputs, artifacts, frontmatter, review results, or tests declared by the step contract.
13. Update `.bmad-stepper/state.yaml` only after required completion evidence is proven, recording the completed step and supporting evidence.
14. Close the run record as `completed`, `blocked`, `failed`, `interrupted`, or `abandoned` with enough context to resume, reconcile, or audit later.

`/bmad-next` must execute no more than the selected step. It may prepare downstream transition information, but it must not start the next workflow step.

## Task Execution Contract

Every task inside the selected step runs as a sub-agent with an explicit contract:

- `id` and declared order within the step.
- Persona and instructions the task must use.
- Explicit inputs, including any source task output passed from an earlier task.
- Allowed paths and mutation scope.
- Required outputs, including output paths, required sections, frontmatter, metadata, or contract markers.
- Self-check fields covering persona used, inputs read, outputs produced, and scope respected.
- Validation rules and repair policy.
- Downstream outputs that may be passed as explicit inputs to later tasks.

The main thread orchestrates tasks and records results. V1 task sub-agents must not run in parallel. A later task cannot start until every prior task has completed, passed validation, and recorded its output references.

When a prior output is used by a later task, the later task record must identify the source task id, source output path or key, and how the value was used.

## Output Validation

After each task completes, Stepper validates the task result before continuing:

- Every declared output exists at the expected path or location.
- Required sections, frontmatter, metadata, or contract markers are present and valid.
- The task self-check names the persona used, inputs read, outputs produced, and whether scope was respected.
- File changes are inside the declared allowed paths and mutation scope.
- Any downstream output expected by a later task is named and referenceable.

Missing outputs, missing self-check details, invalid markers, or out-of-scope mutations are validation problems. Out-of-scope mutations are stop-or-confirm conditions: Stepper must list the unexpected files and either stop or ask for explicit user approval before continuing.

Validated task outputs may become completion evidence for the step transaction. Unvalidated task outputs must not advance state.

## Repair Behavior

When task validation fails and repair is allowed by configuration, Stepper may request repair attempts up to `execution.maxRepairIterations`.

Each repair attempt must record:

- Attempt number and failed validation items.
- Repair prompt or instruction summary.
- Files changed during repair.
- Validation result after the repair.
- Remaining issues, if any.

If a repair attempt succeeds and validation passes, Stepper may continue the current step and the run record must preserve the repair history.

If repair attempts reach the configured limit and validation still fails, Stepper must:

- Write a failure report under the configured runs directory.
- Keep the selected step incomplete.
- Avoid advancing `.bmad-stepper/state.yaml`.
- Stop downstream tasks and transitions.
- Recommend the next safe action.

The failure report must explain the failed task, expected contract, actual output, attempted repairs, changed files, validation failures, and recommended next action.

## Run and Audit Records

Run records are the durable audit trail for `/bmad-next`. Each real execution record must preserve:

- Selected step identity, scope filters, optional-step policy, and declared mutation scope.
- Inputs read, missing inputs, and ambiguous inputs.
- Task outputs, source-output handoffs between sequential tasks, and task self-checks.
- Validation results for declared outputs, required sections/frontmatter, mutation scope, done criteria, review/fix checks, and evidence checks.
- Repair attempts, remaining failures, failure report paths, and recommended next action.
- Review/fix history up to the configured cap, including whether follow-ups remain.
- State update result and evidence references used to justify any advancement.
- Interruption context sufficient for resume, restart, abandon, reconcile, or later audit.

The main conversation may summarize plan and status, but detailed proof belongs in run/task/audit records under the configured output directories.

## Mutation Scope

Dry-run may read project files but must not write any files. Real execution may mutate only the files declared by the selected step contract, expected artifacts, run/task records, and the state index after evidence passes. Out-of-scope mutations are stop-or-confirm conditions.

## Stop and Failure Behavior

Stop without marking the step complete when inputs are missing, completion is ambiguous, validation fails, a human checkpoint is required, state/artifact evidence conflicts, out-of-scope mutation is detected, or repair limits are exceeded. The stop report must state what Stepper tried, what it detected, why it stopped, and the recommended next safe action.

If execution stops after files changed but before completion evidence passes, the run record remains the audit trail. State must not be manually advanced unless a later reconcile confirms that artifacts prove completion.

When the stop reason is conflict or interruption, the report must include the available choices: reconcile, resume, restart, abandon, diagnostic, or manual artifact repair as applicable. Any mutation path requires user confirmation before it changes state or files.
