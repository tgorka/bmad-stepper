# Story 4.2: Detect Conflicts and Refuse Unsafe Continuation

## Status

done

## Story

As a solo developer, I want Stepper to detect conflicts between state and artifacts and refuse unsafe continuation, so that workflow automation does not proceed from false assumptions.

## Acceptance Criteria

1. Given state says a step is complete but artifact frontmatter says it is incomplete, when Stepper evaluates progress, then it identifies a state/artifact conflict, and stops before selecting a downstream step.
2. Given expected output files are missing, tests disagree, or review results contradict state, when Stepper compares evidence, then it reports the conflicting evidence sources, and classifies the conflict as blocking safe continuation.
3. Given Stepper cannot prove the next safe step, when `/bmad-next` or `/bmad-loop` runs, then it refuses to continue automatically, and the output explains what proof is missing.
4. Given conflict detection runs during dry-run, when conflicts exist, then no project files are modified, and the dry-run report recommends reconcile or diagnostic action.

## Dev Notes

- Source requirements: `docs/epics.md` Story 4.2; PRD FR18-FR22; NFR1, NFR2, NFR5, NFR6, NFR9, NFR15, NFR19, and NFR20.
- Conflicts are safety blockers, not hints. Stepper must not select downstream work from stale or contradicted state.
- `/bmad-loop` inherits `/bmad-next` conflict detection and must stop before starting another iteration.
- Dry-run conflict detection must remain read-only.

## Tasks/Subtasks

- [x] Classify blocking state/artifact conflicts in `/bmad-next`.
- [x] Require `/bmad-loop` to stop on inherited conflicts and report safe next actions.
- [x] Add conflict records and loop stop reasons to the state schema/template.
- [x] Document conflict diagnostics and blocking examples.
- [x] Self-review conflict behavior against refusal-to-continue requirements.

## Dev Agent Record

- Created this story artifact after Story 4.1 established state/evidence comparison.
- Implemented conflict classes for incomplete frontmatter, missing outputs, contradictory tests or reviews, wrong workflow position, unfinished runs, repair/failure contradictions, and partial artifacts.
- Updated `/bmad-loop` to stop on `conflict-detected` and to delegate repair to `/bmad-next --reconcile`.
- Added `conflicts` state schema support and conflict examples in docs.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking dry-run read-only behavior and loop stop propagation.

## File List

- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `schemas/state.schema.json`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/4-2-detect-conflicts-and-refuse-unsafe-continuation.md`

## Change Log

- 2026-04-29: Specified blocking conflict detection and refusal to select downstream work when proof is missing.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation classifies contradictions as blocking, keeps dry-run read-only, and prevents `/bmad-next` and `/bmad-loop` from continuing when proof is missing.

## Review Follow-ups (AI)

None.
