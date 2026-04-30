# Contributing

Thanks for contributing to BMAD Stepper.

## Development Approach

BMAD Stepper is currently prompt-first and script-light. Prefer documentation, schemas, templates, and command specifications before adding runtime code.

Add TypeScript/Bun only when it provides clear value for schema validation, fixture-based command tests, generated documentation, or release automation.

## Change Guidelines

- Keep slash commands deterministic and auditable.
- Preserve BMAD-as-prerequisite: do not silently install or emulate BMAD Method.
- Keep loop behavior conservative: stop on human checkpoints, reconcile conflicts, ambiguous completion, and repair limits.
- Update schemas and examples together when contract fields change.
- Avoid hidden state. Prefer explicit artifacts under `.bmad-stepper/runs/`.
- Keep project-pinned asset behavior local-change safe: distinguish upstream changes from project-local edits, show a change plan, require confirmation before overwrites, and record defer/reject decisions.
- When changing run, task, failure, reconcile, checkpoint, review/fix, or asset-update records, update command specs, docs, schemas, and templates together.
