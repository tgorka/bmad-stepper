# Story 3.1: Define Loop Targets and Dry-Run Planning

## Status

done

## Story

As a solo developer, I want `/bmad-loop` to accept explicit loop targets and preview the planned path, so that I can bound automation before it starts repeating workflow steps.

## Acceptance Criteria

1. Given the user runs `/bmad-loop --until next-story`, when Stepper parses the command, then it resolves the target to the next story boundary, and reports that target in the loop plan.
2. Given the user runs `/bmad-loop --until story:<id>`, `story-range:<start>-<end>`, `epic:<id>`, `phase:<name>`, or `step:<id>`, when Stepper parses the command, then it resolves the requested target type and value, and rejects unknown or malformed targets without mutation.
3. Given the user includes `--dry-run`, when loop planning runs, then Stepper previews the selected target, likely step sequence, expected outputs, stop conditions, and limits, and does not execute steps.
4. Given the target cannot be proven from workflow, state, and artifacts, when loop planning runs, then Stepper stops with a diagnostic, and recommends how to clarify or repair the target.

## Dev Notes

- Source requirements: `docs/epics.md` Story 3.1; PRD FR11-FR12 and NFR5, NFR8, NFR19, NFR20, NFR23, and NFR24.
- Prior Epic 2 learning: `/bmad-loop` must reuse `/bmad-next` as the single-step transaction primitive and must not invent a separate execution model.
- Target parsing must happen before execution or dry-run output can be treated as actionable.
- Dry-run loop planning remains read-only and must report target, likely step sequence, evidence, mutation scope, limits, and stop conditions.

## Tasks/Subtasks

- [x] Define supported target grammar for `next-story`, story, story range, epic, phase, and step targets.
- [x] Specify malformed, unknown, ambiguous, and unsupported target diagnostics without mutation.
- [x] Expand `/bmad-loop --dry-run` output requirements for loop plans.
- [x] Align command reference and examples with target parsing and dry-run planning behavior.
- [x] Self-review target and dry-run behavior against Epic 3 acceptance criteria.

## Dev Agent Record

- Created this story artifact from Epic 3 planning context and the Epic 2 retrospective.
- Implemented target parsing and dry-run loop planning in the prompt-first command spec and documentation.
- Confirmed dry-run remains read-only and target resolution is required before execution.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking command spec, command reference, examples, and story acceptance criteria.

## File List

- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `docs/stories/3-1-define-loop-targets-and-dry-run-planning.md`

## Change Log

- 2026-04-29: Specified loop target grammar, malformed target handling, and dry-run loop planning output.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation resolves supported targets before execution, rejects malformed targets without mutation, and makes dry-run planning explicit enough to bound automation before any repeated transaction starts.

## Review Follow-ups (AI)

None.
