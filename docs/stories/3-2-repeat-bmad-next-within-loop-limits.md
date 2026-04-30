# Story 3.2: Repeat `/bmad-next` Within Loop Limits

## Status

done

## Story

As a solo developer, I want `/bmad-loop` to repeat the same safe single-step transaction until the explicit target or a limit is reached, so that loop automation remains bounded and understandable.

## Acceptance Criteria

1. Given a valid loop target and no dry-run flag, when `/bmad-loop` starts, then Stepper executes work by repeatedly invoking the `/bmad-next` transaction model, and each iteration records the selected step and result.
2. Given the loop reaches its explicit target, when the final required step is complete, then Stepper stops the loop successfully, and the summary explains which target was reached.
3. Given the loop reaches `--max-steps` or the configured default step limit, when another step would be needed, then Stepper stops before executing more work, and the stop report explains that the step limit was reached.
4. Given the user passes `--skip-optional`, when the loop encounters optional steps, then Stepper skips optional steps according to the command contract, and records which optional steps were skipped.

## Dev Notes

- Source requirements: `docs/epics.md` Story 3.2; PRD FR13-FR14 and NFR4, NFR9, NFR11, NFR19, NFR20, and NFR25.
- Epic 2 established `/bmad-next` as the only single-step transaction boundary. Loop execution must evaluate targets only between completed or stopped transactions.
- The effective max-step limit is `--max-steps` first, then `execution.maxLoopSteps`.
- Optional steps run by default; `--skip-optional` must be explicit and auditable.

## Tasks/Subtasks

- [x] Specify loop execution as repeated `/bmad-next` transactions.
- [x] Define per-iteration records for selected step, status, evidence, repair history, and failure links.
- [x] Define target-reached and max-step stop behavior.
- [x] Preserve optional-step inclusion by default and skipped optional-step reporting.
- [x] Add schema/template support for loop records and loop summaries.
- [x] Self-review loop limits against transaction and state advancement rules.

## Dev Agent Record

- Created this story artifact after Story 3.1 context and prior Epic 2 transaction behavior were in place.
- Implemented loop execution lifecycle, max-step behavior, optional-step behavior, and loop record support across prompt-first specs, docs, schemas, and templates.
- Confirmed state advances only through completed `/bmad-next` transactions and that the loop stops before executing beyond the effective step limit.
- Review iteration 1: clean self-review. No follow-up fixes remained after aligning command docs, config/state schemas, and templates.

## File List

- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `README.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/3-2-repeat-bmad-next-within-loop-limits.md`

## Change Log

- 2026-04-29: Specified repeated `/bmad-next` loop execution, target-reached behavior, max-step stopping, and skipped optional-step reporting.
- 2026-04-29: Added loop records and loop summary template/schema support.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation keeps `/bmad-next` as the transaction boundary, records loop iterations, stops before exceeding max-step limits, and preserves default optional-step inclusion unless `--skip-optional` is requested.

## Review Follow-ups (AI)

None.
