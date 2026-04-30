# Story 1.4: Document First-Run Path, Command Reference, and Core Examples

## Status

done

## Story

As a solo developer, I want concise docs for first-run setup, command options, and common dry-run workflows, so that I can adopt Stepper without guessing how preview and recovery are supposed to work.

## Acceptance Criteria

1. Given a new user opens the README or first-run docs, when they follow the initial path, then the docs show configuration, prerequisite confirmation, `/bmad-next --dry-run`, single-step execution, and recovery guidance in order, and the docs identify which files the user should expect to create or inspect.
2. Given a user opens the command reference, when they inspect `/bmad-next` and `/bmad-loop`, then every v1 option from the PRD is listed with its intent, inputs, outputs, state changes, mutation scope, stop conditions, and failure behavior.
3. Given a user opens the examples, when they review preview, scoped execution, story loop, skip optional, and reconcile examples, then each example explains what Stepper checks, why it may stop, and the next safe action.
4. Given a maintainer changes command behavior, when they update docs, then README, command reference, and examples remain consistent about dry-run behavior and the trust boundary.

## Dev Notes

- Source requirements: `docs/epics.md` Story 1.4, PRD FR38-FR41, NFR6, NFR8, and NFR20.
- Keep documentation concise but explicit about inputs, outputs, state changes, mutation scope, stop conditions, and failure behavior.
- Do not imply a runtime package or installer exists.

## Tasks/Subtasks

- [x] Expand README first-run path and trust boundary.
- [x] Expand command reference for `/bmad-next` and `/bmad-loop` options.
- [x] Expand examples for preview, scoped dry-run, prerequisite failure, trust boundary, safe next action, loop, skip optional, and reconcile.
- [x] Keep docs aligned with command specs and templates.
- [x] Self-review documentation consistency across Epic 1 surfaces.

## Dev Agent Record

- Reworked README into an ordered first-run path.
- Expanded `docs/command-reference.md` from option list into behavior contract for both commands.
- Expanded `docs/examples.md` with checks, stop reasons, and next safe actions.
- Initial self-review pass: no follow-up fixes required after checking the PRD option list appears in the command reference and that examples cover requested workflows.

## File List

- `README.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/1-4-document-first-run-path-command-reference-and-core-examples.md`

## Change Log

- 2026-04-29: Added first-run path, command reference details, examples, and docs consistency self-review.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The README, command reference, and examples now provide a coherent adoption path and preserve the dry-run read-only guarantee and trust boundary.

## Review Follow-ups (AI)

None.
