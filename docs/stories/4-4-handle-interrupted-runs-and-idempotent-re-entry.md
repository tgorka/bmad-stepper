# Story 4.4: Handle Interrupted Runs and Idempotent Re-Entry

## Status

done

## Story

As a solo developer, I want Stepper to detect unfinished runs and re-enter steps idempotently, so that interruption does not force me to guess whether to resume, restart, abandon, or reconcile.

## Acceptance Criteria

1. Given a prior run was interrupted before completion, when the user invokes Stepper again, then Stepper detects the unfinished run, and offers resume, restart, abandon, or reconcile.
2. Given the user chooses resume, when Stepper re-enters the step, then it checks existing artifacts before retrying work, and it continues only from unproven or incomplete outputs.
3. Given the user chooses restart or abandon, when Stepper applies the choice, then it records the decision, and preserves enough context for later audit.
4. Given existing artifacts partially satisfy a step, when Stepper prepares a retry or rerun, then it identifies which evidence can be reused, and which work must be regenerated or repaired.

## Dev Notes

- Source requirements: `docs/epics.md` Story 4.4; PRD FR23-FR24; NFR3, NFR6, NFR9, NFR11, NFR13, NFR19, NFR20, and NFR25.
- Interrupted run handling must happen before new downstream work starts.
- Resume is evidence-aware: proven outputs are reused; unproven outputs are retried or repaired.
- Restart and abandon are audit decisions, not silent state edits.

## Tasks/Subtasks

- [x] Specify unfinished run detection before `/bmad-next` opens new work.
- [x] Define resume, restart, abandon, and reconcile choices.
- [x] Require idempotent re-entry to reuse proven artifacts and retry only unproven outputs.
- [x] Add interrupted run status and re-entry records to schemas/templates.
- [x] Document interrupted-run and idempotent re-entry examples.
- [x] Create Epic 4 retrospective after implementation and self-review.

## Dev Agent Record

- Created this story artifact after reconcile behavior was specified.
- Implemented interrupted-run handling in `/bmad-next` and inherited stop behavior in `/bmad-loop`.
- Added run statuses and re-entry fields for interrupted and abandoned runs.
- Added examples for resume, restart, abandon, and idempotent re-entry after partial outputs.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking that re-entry preserves proven outputs and never advances state without evidence.

## File List

- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `README.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `schemas/step.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/4-4-handle-interrupted-runs-and-idempotent-re-entry.md`
- `docs/stories/epic-4-retro-2026-04-29.md`
- `docs/stories/sprint-status.yaml`

## Change Log

- 2026-04-29: Specified interrupted-run choices and idempotent re-entry behavior for repeated commands.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation detects unfinished runs, offers explicit user choices, and makes re-entry evidence-aware and idempotent.

## Review Follow-ups (AI)

None.
