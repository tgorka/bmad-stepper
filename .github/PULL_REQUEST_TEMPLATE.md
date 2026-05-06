## Description

<!-- Provide a clear description of the changes. What problem does this solve? What is the user-facing impact? -->

## Related Issues

<!-- Link to any GitHub issues this PR addresses (e.g., "Closes #123"). -->

## Changesets

- [ ] I have added a Changeset entry via `bun run changeset` describing this change.

## Quality Gates

- [ ] `bun run check` exits 0 locally (Biome lint + all tests pass).
- [ ] `bunx tsc --noEmit` exits 0 (TypeScript strict mode passes).
- [ ] Tests added or updated for any user-visible behavior change.
- [ ] No new `console.log` calls — used `src/io/log.ts` if logging is needed.
- [ ] No new main-thread network calls outside `src/upgrade/` (NFR-S1).
- [ ] No new writes outside `_bmad-output/` and `~/.claude/plugins/` (NFR-S2).

## Architectural Compliance

- [ ] No upward imports from foundational modules (`errors.ts`, `schemas/`, `io/`) — AR41.
- [ ] New error classes have a single-line actionable hint matching `/^.*(Run|See|Try|Check) /` — AR22.
- [ ] Slash-command markdown changes follow the AR34 pattern (Bash → JSON line → Task → Bash → summary).

## BMAD Compatibility

- [ ] If this PR changes BMAD compatibility (e.g., supports a new BMAD version, deprecates a step), the CHANGELOG's *BMAD Compatibility* section is updated.
- [ ] If this PR introduces an unknown upstream skill, an `overrides:` config example is added to `examples/`.

## Documentation

- [ ] User-facing flag changes are documented in `docs/configuration.md` and `commands/<name>.md`.
- [ ] Exit-code additions are documented in `docs/exit-codes.md`.
