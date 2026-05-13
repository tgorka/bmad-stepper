# AGENTS.md

This document is the **contract for AI agents and human contributors** working on Stepper. It captures (a) the sub-agent dispatch contract for Layer 3 BMAD agents (`agents/bmad-step-runner.md` + `agents/bmad-step-fixer.md`), (b) the contributor expectations for Layer 1 markdown + Layer 2 TypeScript code, and (c) the architectural boundaries that ALL contributions MUST respect.

## Three-Layer Architecture

- **Layer 1 (`skills/<name>/SKILL.md`, `agents/*.md` descriptions):** Claude Code main thread. Communicates with Layer 2 via Bash; with Layer 3 via Task. NEVER does direct file IO.
- **Layer 2 (`src/**/*.ts`):** Bun TypeScript core. Communicates with the filesystem and the GitHub API (only inside `src/upgrade/`). NEVER calls Task or orchestrates sub-agents.
- **Layer 3 (`agents/*.md` body):** BMAD sub-agents. File-in/file-out only via `staging/<run-id>/`. NEVER decides what comes next; never validates own output; never interacts with the user.

## Sub-Agent Dispatch Contract (Layer 3)

Every heavy task is delegated to an isolated sub-agent. The dispatch contract is six-section, mandatory in every sub-agent invocation:

- **PERSONA** — which BMAD persona owns this work
- **CONTEXT** — input files, frontmatter snippets, prior step outputs
- **TASK** — single clear deliverable (one artifact)
- **OUTPUT FORMAT** — schema, required sections, file location in staging dir
- **SUCCESS CRITERIA** — verifier-checkable conditions
- **CONSTRAINTS** — allowed tools, scope limits, what NOT to do

Operational discipline:

- Sub-agent **does not decide what comes next.** Orchestration stays main-thread.
- Sub-agent **does not validate its own output.** Verifier runs as a separate step.
- Sub-agent **does not interact with the user.** File-in, file-out only.
- Sub-agent **has a declared context budget** (default 60k) and **timeout** (default 5 min) per task; both overrideable via config.
- Sub-agent writes to `_bmad-output/.stepper/staging/<run-id>/` first; main thread promotes to final location only after the verifier passes.
- Sub-agent run is fully captured in the transcript log under `_bmad-output/.stepper/runs/<ts>-<step>.log` for audit.
- Per AR21 + AR33: sub-agents emit single-line audit notices; never `console.log` from runtime code; throw `StepperError` subclasses for all halts.

## Code Architecture (Layer 2)

- **Foundational tier (no upward imports):** `src/errors.ts`, `src/schemas/`, `src/io/`.
- **Mid-tier (depend only on foundational):** `src/migrations/`, `src/state/`, `src/bmad-detect/`, `src/personas/`, `src/dag/`, `src/transcript/`, `src/telemetry/`, `src/upgrade/`, `src/runs/`, `src/startup/`, `src/snapshot/`, `src/lock/`, `src/config/`, `src/failure-ux/`.
- **Higher-tier (depend on foundational + mid-tier):** `src/verifiers/`, `src/dispatch/`.
- **Top-tier (depend on everything below):** `src/commands/{next, loop, doctor}/`.

The dependency graph is enforced by the `src/integration/no-write-outside-scope.test.ts` integration gate (NFR-S2). The cross-cutting `src/integration/no-network-on-main.test.ts` gate is documented as a forward-deferred contract for v0.2 — for v0.1, the contract is enforced by code review against this AGENTS.md spec ("NEVER make a main-thread network call EXCEPT inside `src/upgrade/`"). NEVER add an upward import from a foundational module.

Per AR32: tests are colocated next to source (`<source>.test.ts`); one folder per command; centralised schemas/errors/io in foundational tier.

## Errors as Primary UX

Errors are first-class UX. Every halt produces a single-line actionable hint matching the regex `/^.*(Run|See|Try|Check) /` per AR22. The errors registry lives in `src/errors.ts` (currently 17 codes); adding a new error class requires:

- A unique `StepperErrorCode` union member (SCREAMING_SNAKE_CASE).
- An `actionableHint` field passing the AR22 regex.
- A registration entry in the `errorRegistry`.
- A test in `src/errors.test.ts` asserting the registry membership AND the single-line constraint (`expect(actionableHint).not.toMatch(/\n/)`).
- The integration sweep at `src/integration/escalate-actionable-hint.test.ts` automatically picks up the new class via the registry sweep.

## State Discipline

- State lives at `_bmad-output/.stepper/state.yaml` with a `.bak` rotation buddy.
- Atomic writes via tmp+rename; lock-based read-modify-write cycles via `_bmad-output/.stepper/state.yaml.lock/`.
- **NEVER** write to `~/.claude/plugins/` from any code path (NFR-S2 + AR42; CI-gated by `src/integration/no-write-outside-scope.test.ts`).
- **NEVER** mutate state outside `_bmad-output/`.

## Network Discipline

- **NEVER** make a main-thread network call EXCEPT inside `src/upgrade/` (NFR-S1 + AR41 mid-tier exception).
- The contract is enforced by code review and documented here; the cross-cutting integration gate `src/integration/no-network-on-main.test.ts` is a forward-deferred enforcement for v0.2.
- Sub-agents follow Claude Code's standard model API path (no Stepper code involvement).

## Skill Markdown Protocol (AR34)

Each `skills/<name>/SKILL.md` follows this body pattern:

1. Capture the flag string the user typed after `/<name>` as `<captured-flags>`.
2. Bash: `bun run src/commands/<name>/run.ts -- <captured-flags>` (Layer 1 → Layer 2).
3. Read the AR9-disciplined single JSON line from stdout.
4. If `action: "dispatch"`, Task tool invokes the sub-agent (Layer 1 → Layer 3).
5. Bash: `bun run src/commands/<name>/verify-and-advance.ts -- <run-id>` (Layer 1 → Layer 2 verify-and-advance).
6. Print summary line.

Frontmatter requirements: `name` (matching the directory basename — Claude Code uses this to build the invocable name) and `description` (carries the inline argument hint).

Each SKILL.md's `## Tool restrictions` section is the prompt-layer guardrail; the architectural enforcement lives at Layer 2 (`src/verifiers/scope.ts:assertWithinScope`).

## Test Patterns (AR35)

- Tests are colocated `<source>.test.ts` next to source. NO `tests/` directory inside `src/`.
- Every fs-touching test seeds `mkdtemp(path.join(os.tmpdir(), "stepper-..."))` and cleans up in afterEach.
- Tests NEVER touch `_bmad-output/` (the project's own state directory).
- Fixtures live at `tests/fixtures/<scenario>/` with minimal BMAD-project replicas.
- Unique test ID prefixes per concern: e.g., `UPGRADE_69_*`, `RENDER_69_*`, `CLI_69_*`.

## Code Quality Gates

- **`bun run check`** is the release-blocker gate (Biome 2.3 lint + bun test).
- **`bunx tsc --noEmit`** must exit 0.
- The integration test `escalate-actionable-hint.test.ts` (AR22 sweep over all 17 errors) + `no-write-outside-scope.test.ts` (NFR-S2) MUST pass.
- All four failure-UX modes (retry / skip / route-to-fixer / escalate) and all eight stop-condition paths have integration tests.

## Contributing

See `CONTRIBUTING.md` for the full contributor flow (fork, branch, PR template, Changeset, CI gates, review process).
