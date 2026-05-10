# Contributing to BMAD Stepper

Thanks for your interest in contributing to Stepper. This document covers (a) the development setup, (b) the PR flow + Changesets, (c) the code style + tests, and (d) the maintainer governance posture.

## Development Setup

1. Install Bun ≥ 1.3: `curl -fsSL https://bun.sh/install | bash` or `brew install oven-sh/bun/bun`.
2. Clone the repo: `git clone https://github.com/tgorka/bmad-stepper && cd bmad-stepper`.
3. Install dependencies: `bun install --frozen-lockfile`.
4. Run the test suite: `bun test`. Expected: all pass.
5. Run the full check: `bun run check` (Biome lint + tests).

No build step — Stepper is source-as-release; Bun runs `.ts` directly.

## PR Flow

1. Fork the repository and create a feature branch.
2. Make your changes following the code-style + test patterns below.
3. Run `bun run check` locally — it must exit 0 (Biome clean + all tests pass).
4. Add a Changeset entry: `bun run changeset` — describe the change in user-facing terms.
5. Open a PR using the PR template at `.github/PULL_REQUEST_TEMPLATE.md`.
6. CI will run on the PR (matrix Linux+macOS + bun test + biome ci); a green CI is required.
7. The maintainer reviews; addresses review comments by adding new commits (NOT amend-force-push for active PRs — Stepper history is auditable).
8. On merge, the auto-generated *Version Packages* PR is updated; merging that PR publishes a GitHub Release + the Claude Code marketplace listing is updated.

## Release Process

Stepper uses [Changesets](https://github.com/changesets/changesets) for release management. The maintainer:

1. Lands feature PRs to `main`; each carries a Changeset entry under `.changeset/<name>.md`.
2. The `.github/workflows/release.yml` workflow auto-opens or updates a *Version Packages* PR aggregating the pending Changesets into a CHANGELOG entry + version bump.
3. Merging the *Version Packages* PR triggers `release.yml` to (a) tag the release (v0.1.0, v0.2.0, etc.) and (b) create a GitHub Release.
4. **Manual step:** the maintainer submits the new version to the Claude Code marketplace UI at `tgorka/bmad-stepper` (per architecture line 1566 — there is no Anthropic API for automated submission as of v0.1.0). The GitHub Release tarball IS the marketplace artifact (per architecture line 1568 — there is no separate dist or container).

## Code Style (AR31, AR33, AR36)

- **Files:** `kebab-case.ts`. Tests: colocated `<source>.test.ts`.
- **TypeScript:** `camelCase` functions/variables, `PascalCase` types/interfaces (no `I` prefix), `SCREAMING_SNAKE_CASE` constants.
- **Async:** always `async/await`. Bun-native APIs preferred (`Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn`).
- **Errors:** throw `StepperError` subclasses (NOT `Result<T,E>` in general code path). Sole exception: CLI parser uses `Result<Args, ParseError>`.
- **No `any`. No `console.log`** in runtime code — use `src/io/log.ts` (`info`, `warn`, `error`, `json`).
- **Biome 2.3 only** (no ESLint/Prettier). `biome.json` enforces strict rules including `noConsoleLog`, `noImplicitAnyLet`. Run `bunx biome ci .` to verify.
- **No `node:*` imports** unless an explicit lint allowance — Stepper targets Bun stdlib only.

## CLI Surface for Power Users

Stepper exposes a small set of standalone CLI scripts in addition to the slash commands:

- `bun run aggregate-telemetry` — aggregate telemetry CSV/JSONL files into a summary report (Story 6.7).
- `bun run upgrade` — run the `--upgrade` GitHub Releases check + actionable hint (Story 6.9).
- `bun run check` — release-blocker gate (Biome lint + tests).
- `bun run test` / `bun test` — run the test suite.

Power users may invoke `bun run src/commands/<name>/run.ts -- <args>` directly (e.g. for CI gating; see `examples/scripting/ci-state-check.sh`).

## Test Patterns (AR35)

- Tests are colocated `<source>.test.ts` next to source. NO `tests/` directory inside `src/`.
- Every fs-touching test uses `mkdtemp(path.join(os.tmpdir(), "stepper-<concern>-"))` + cleanup in afterEach.
- Tests NEVER touch `_bmad-output/` from a test (the project's own state directory).
- Test ID prefix discipline: pick a unique prefix per concern (e.g., `UPGRADE_69_*` for Story 6.9 upgrade).
- Run `bun test` for the full suite; `bun test --watch` for active development; `bun test src/<dir>` for a single concern.

## State + Network Discipline

- **NEVER write to `~/.claude/plugins/`** from any code path. NFR-S2; CI-gated by `src/integration/no-write-outside-scope.test.ts`.
- **NEVER make a main-thread network call** EXCEPT inside `src/upgrade/`. NFR-S1; the contract is enforced by code review (the cross-cutting integration test `src/integration/no-network-on-main.test.ts` is forward-deferred to post-v0.1).
- **NEVER mutate state outside `_bmad-output/`** (the project's own scope).
- **NEVER write to BMAD-installed files** under `~/.claude/plugins/cache/bmad-method/` — those are read-only inputs.

## Errors as Primary UX (AR21, AR22)

Errors are first-class UX. Every halt produces a single-line actionable hint matching the regex `/^.*(Run|See|Try|Check) /`. Adding a new error class:

1. Add a unique `StepperErrorCode` union member (SCREAMING_SNAKE_CASE).
2. Implement the `XxxError` class extending `StepperError` with an `actionableHint` field.
3. Register in the `errorRegistry`.
4. Add a test in `src/errors.test.ts` asserting registry membership + AR22 regex match + single-line constraint.
5. The registry sweep at `src/integration/escalate-actionable-hint.test.ts` automatically picks up the new class.

The errors registry currently holds 17 codes; growth is intentional + reviewed.

## Failure-UX Modes (FR31)

Stepper supports four failure modes, configurable per step via `bmad-stepper.config.yaml:failurePolicies`:

- **`retry`** — retry the failed step up to a budget; halt with actionable hint on exhaustion.
- **`skip`** — record the skip in state.yaml, advance to next step (requires `--resume` to confirm).
- **`route-to-fixer`** — dispatch the `bmad-step-fixer` sub-agent to repair; on success retry; on failure escalate.
- **`escalate`** — halt with single-line actionable hint per AR22; user runs `--resume` after manual remediation.

See [`docs/examples/halt-recovery.md`](docs/examples/halt-recovery.md) and [`docs/examples/skip-on-failure.md`](docs/examples/skip-on-failure.md) for worked examples.

## Cross-Platform Constraints (AR43)

- **Linux + macOS only** via Bun ≥ 1.3.
- **Windows via WSL** only.
- **ESM exclusively** (no CommonJS).
- **Source = release** (no `dist/`, no transpile step).
- The CI matrix at `.github/workflows/ci.yml` runs against `ubuntu-latest` + `macos-latest`.

## Governance Posture

Stepper is currently a single-maintainer project (per the product brief — single-author-dogfood context). The maintainer's discipline:

- **Issues evaluated against personal use** — feature requests are weighed against the dogfood validation plan.
- **`AGENTS.md` is the contract** — contributions that violate the three-layer architecture or the AR41 boundary graph are politely declined.
- **Changesets are mandatory** — every visible change requires a Changeset entry; reviewers will request one if missing.
- **No force-pushes to active PRs** — history is auditable.

## Reporting Bugs / Asking Questions

- **Bug:** open an issue using the bug template at `.github/ISSUE_TEMPLATE/bug.md`.
- **Feature request:** use the feature template at `.github/ISSUE_TEMPLATE/feature.md`.
- **BMAD compatibility issue (e.g., new BMAD release breaks Stepper):** use the bmad-compat template at `.github/ISSUE_TEMPLATE/bmad-compat.md`.
- **Security:** see `SECURITY.md` for the reporting channel.

## License

Stepper is MIT-licensed (see `LICENSE`). By contributing, you agree your contributions are licensed under MIT.
