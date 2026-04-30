# Story 3.3: Report Loop Stop Conditions and Next Actions

## Status

done

## Story

As a solo developer, I want loop execution to stop clearly on checkpoints, validation failures, repair limits, missing inputs, and ambiguous completion, so that I know why automation stopped and how to continue safely.

## Acceptance Criteria

1. Given a human checkpoint is encountered, when `/bmad-loop` is running, then Stepper stops before proceeding, and the stop report explains the decision required from the user.
2. Given a step fails validation or reaches repair limits, when loop execution evaluates the result, then the loop stops, and the report links the failure to the specific step or task record.
3. Given a required input is missing or completion evidence is ambiguous, when the loop attempts to continue, then Stepper stops instead of guessing, and the report recommends the next safe command or repair action.
4. Given a loop stops for any reason, when the user reads the stop report, then it states what Stepper tried, what it detected, why it stopped, and what the recommended next move is.

## Dev Notes

- Source requirements: `docs/epics.md` Story 3.3; PRD FR15-FR16 and NFR1, NFR4, NFR6, NFR10, NFR11, NFR15, NFR19, and NFR25.
- Stop reports must link loop-level stop reasons back to `/bmad-next` run records, task records, repair history, or failure reports.
- Missing inputs, ambiguous completion, validation failure, repair exhaustion, checkpoints, reconcile needs, and max-step limits are safe-stop conditions, not prompts to guess.
- Loop summaries must preserve enough context to resume, narrow the target, reconcile, or perform manual repair later.

## Tasks/Subtasks

- [x] Enumerate loop stop reasons and their reporting requirements.
- [x] Require summaries to show what Stepper tried, what it detected, why it stopped, and the next safe action.
- [x] Link failed validation and repair exhaustion to the relevant step, task record, repair history, or failure report.
- [x] Document loop stop report examples and next actions.
- [x] Update sprint status and create the Epic 3 retrospective after implementation and self-review.
- [x] Self-review stop report behavior against Epic 3 acceptance criteria.

## Dev Agent Record

- Created this story artifact after Stories 3.1 and 3.2 defined target planning and loop execution.
- Implemented loop stop reasons, loop summary fields, and stop report requirements in command specs, docs, schemas, templates, and examples.
- Confirmed the loop stops before proceeding on checkpoint, reconcile, missing input, ambiguous completion, validation failure, repair limit, max-step limit, target reached, and unresolved target conditions.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking stop report language across `/bmad-loop`, command reference, examples, state schema, and state template.

## File List

- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `schemas/state.schema.json`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/3-3-report-loop-stop-conditions-and-next-actions.md`
- `docs/stories/epic-3-retro-2026-04-29.md`
- `docs/stories/sprint-status.yaml`

## Change Log

- 2026-04-29: Specified loop stop reasons, stop reports, loop summaries, and recommended next-action reporting.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation makes every loop stop auditable, links failures to underlying step or task records, and recommends a safe next action instead of allowing the loop to guess.

## Review Follow-ups (AI)

None.
