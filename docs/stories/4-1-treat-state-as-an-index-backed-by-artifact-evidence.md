# Story 4.1: Treat State as an Index Backed by Artifact Evidence

## Status

done

## Story

As a solo developer, I want Stepper to compare `.bmad-stepper/state.yaml` with artifact evidence before continuing, so that resumed workflow state is grounded in files rather than stale memory.

## Acceptance Criteria

1. Given `.bmad-stepper/state.yaml` indicates the current workflow position, when Stepper evaluates the next action, then it treats state as an index, and verifies relevant artifacts, frontmatter, task outputs, tests, or review results before trusting it.
2. Given artifact evidence confirms the indexed state, when Stepper selects the next step, then it may proceed from the indexed position, and the preview or run record identifies the evidence used.
3. Given artifact evidence is missing or incomplete, when Stepper compares state and artifacts, then it does not mark the prior step as proven, and it reports the missing evidence.
4. Given the same command is rerun after an interruption, when Stepper inspects existing artifacts, then it avoids duplicating proven completed work, and it identifies the next unproven step.

## Dev Notes

- Source requirements: `docs/epics.md` Story 4.1; PRD FR17-FR18 and FR24; NFR1, NFR2, NFR5, NFR9, NFR11, NFR19, NFR20, and NFR24.
- Architecture constraints: prompt-first and script-light; BMAD Method remains a prerequisite; workflow steps are atomic; artifacts and frontmatter prove completion while state is only an index.
- Epic 3 retrospective asked Epic 4 to preserve state-as-index behavior and reuse loop stop-report structure for recovery.
- State evidence comparison must occur before dry-run selection and before real execution selects downstream work.

## Tasks/Subtasks

- [x] Specify state as an index in `/bmad-next` before downstream step selection.
- [x] Require artifact/frontmatter/task/test/review evidence checks before trusting indexed progress.
- [x] Add evidence reference support to schemas and templates.
- [x] Document proven evidence in command reference, examples, and README.
- [x] Self-review state-as-index behavior against Epic 4 acceptance criteria.

## Dev Agent Record

- Created this story artifact from Epic 4 requirements and prior Epic 3 recovery follow-ups.
- Implemented explicit state/evidence verification in `/bmad-next` and command reference.
- Added `evidenceIndex` to the state schema/template and `evidence` rules to the step schema.
- Added examples showing state index proof by artifacts and idempotent re-entry after partial output.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking command specs, docs, schemas, and templates for consistent state-as-index language.

## File List

- `commands/bmad-next.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `README.md`
- `schemas/state.schema.json`
- `schemas/step.schema.json`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/4-1-treat-state-as-an-index-backed-by-artifact-evidence.md`

## Change Log

- 2026-04-29: Specified evidence-backed state indexing before step selection and documented proven versus missing evidence behavior.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation consistently treats `.bmad-stepper/state.yaml` as an index and requires artifact evidence before trusting workflow progress.

## Review Follow-ups (AI)

None.
