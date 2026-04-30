# Story 1.3: Specify Dry-Run Preview Output and Trust Boundary

## Status

done

## Story

As a solo developer, I want dry-run output to show the selected step, planned work, evidence, stop conditions, conflicts, and mutation scope, so that I can decide whether it is safe to let Stepper execute the next BMAD step.

## Acceptance Criteria

1. Given `/bmad-next --dry-run` selects a candidate step, when the preview is rendered, then it shows the selected step identity, required inputs, expected outputs, planned tasks, completion evidence, stop conditions, and possible conflicts, and it clearly states that no project files were modified.
2. Given the selected step has declared output artifacts or frontmatter evidence, when dry-run preview is rendered, then the preview lists the evidence Stepper will require before treating the step as complete, and the preview distinguishes existing evidence from missing evidence.
3. Given the selected step may mutate files during real execution, when dry-run preview is rendered, then the preview declares the expected file mutation scope, and it identifies mutations outside that scope as stop-or-confirm conditions.
4. Given the user reads the dry-run preview, when they compare the preview against the docs, then the docs explain that artifact evidence proves workflow completion, not semantic quality of product or implementation decisions, and the examples reinforce that human review remains part of trust.

## Dev Notes

- Source requirements: `docs/epics.md` Story 1.3, PRD FR1/FR3/FR41, NFR5, NFR7, NFR8, NFR17, and architecture trust/transparency constraints.
- Dry-run output is a trust mechanism, not a quality guarantee.
- Out-of-scope mutation must be a stop-or-confirm condition.

## Tasks/Subtasks

- [x] Specify required dry-run preview fields in `commands/bmad-next.md`.
- [x] Document evidence distinctions: existing evidence versus missing evidence.
- [x] Document expected mutation scope and out-of-scope mutation stop behavior.
- [x] Add trust-boundary and safe-next-action examples.
- [x] Self-review preview output against Story 1.3 acceptance criteria.

## Dev Agent Record

- Expanded dry-run output contract with selected step identity, inputs, outputs, tasks, evidence, conflicts, mutation scope, stop conditions, and no-mutation statement.
- Added explicit trust boundary to README and examples.
- Added schema descriptions linking outputs and done criteria to completion evidence.
- Initial self-review pass: no follow-up fixes required after checking that docs consistently distinguish workflow evidence from semantic quality.

## File List

- `README.md`
- `commands/bmad-next.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `schemas/step.schema.json`
- `docs/stories/1-3-specify-dry-run-preview-output-and-trust-boundary.md`

## Change Log

- 2026-04-29: Added dry-run preview output contract and trust boundary documentation.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The dry-run contract is specific enough for review, mutation scope is visible, and trust boundary language avoids overstating what artifact evidence proves.

## Review Follow-ups (AI)

None.
