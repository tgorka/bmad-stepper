# Story 2.3: Validate Task Outputs and Mutation Scope

## Status

done

## Story

As a solo developer, I want each task output to be validated against its declared contract and mutation scope, so that plausible but contractually invalid work does not advance the workflow.

## Acceptance Criteria

1. Given a task declares one or more required outputs, when the task completes, then Stepper verifies that each declared output exists, and missing outputs prevent the step from being marked complete.
2. Given a task output requires specific sections or metadata, when validation runs, then Stepper checks for required sections, frontmatter, or other contract markers, and reports which required element is missing or invalid.
3. Given a task changes files outside its declared mutation scope, when Stepper validates the task, then the step stops or requires explicit user approval before proceeding, and the unexpected mutations are listed in the report.
4. Given all task outputs satisfy their contracts, when Stepper evaluates step completion, then those outputs can be used as completion evidence for the step transaction.

## Dev Notes

- Source requirements: `docs/epics.md` Story 2.3; PRD FR27-FR29; NFR8, NFR9, NFR17, NFR18, and NFR20.
- Validation is contractual, not semantic. It checks declared paths, required output presence, required sections or frontmatter, self-check completeness, and mutation scope.
- Out-of-scope file mutations are stop-or-confirm conditions and must be listed in reports.
- Task outputs that pass validation may become step completion evidence.

## Tasks/Subtasks

- [x] Define task output validation in `/bmad-next`.
- [x] Add required output, required marker, self-check, and mutation scope validation fields to schemas.
- [x] Align examples and command reference with validation failure and scope failure behavior.
- [x] Ensure templates can record validation results and unexpected mutations in run/task records.
- [x] Self-review validation behavior against docs, schemas, and templates.

## Dev Agent Record

- Created this story artifact from Epic 2 planning context and the Story 2.2 task contract.
- Implemented prompt-first validation language for required outputs, sections/frontmatter markers, self-checks, and mutation scope.
- Confirmed that passing task outputs can be used as completion evidence while failed validation prevents state advancement.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking command docs, examples, schemas, and templates.

## File List

- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `schemas/step.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/2-3-validate-task-outputs-and-mutation-scope.md`

## Change Log

- 2026-04-29: Specified task output validation, required markers, self-check validation, and mutation scope stop-or-confirm behavior.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation prevents contractually invalid task work from advancing a step and documents how unexpected mutations are reported before continuation.

## Review Follow-ups (AI)

None.
