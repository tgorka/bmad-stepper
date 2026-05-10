---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
status: complete
completedAt: '2026-04-29'
totalEpics: 6
totalStories: 57
---

# bmad-stepper - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for bmad-stepper, decomposing the requirements from the PRD and Architecture requirements into implementable stories. No UX Design document exists (the product is a Claude Code plugin with no GUI; PRD explicitly skips `visual_design` and treats accessibility as out of scope).

## Requirements Inventory

### Functional Requirements

**Stateful Workflow Orchestration (FR1-FR7)**

- **FR1:** Users can have Stepper compute the next BMAD step from project files alone, with no manual state declaration (`/bmad-next` zero-config).
- **FR2:** Users can rebuild the cached state from files of truth (`--recompute-state`).
- **FR3:** Users can inspect divergence between the cache and files of truth (`--diff-state`).
- **FR4:** Users can export the current state as machine-readable JSON (`--export-state`).
- **FR5:** System can recover correct state after any halt, branch switch, or session restart using files alone.
- **FR6:** System validates all state files against a versioned schema on load and surfaces actionable errors on corruption.
- **FR7:** System applies schema migrations automatically on load when the state schema version is older than the runtime.

**Step Execution & Dispatch (FR8-FR18)**

- **FR8:** Users can advance a single BMAD step (`/bmad-next`).
- **FR9:** Users can preview a step without executing it (`--dry-run`).
- **FR10:** Users can override the step that Stepper would otherwise compute (`--step <id>`).
- **FR11:** Users can narrow step computation by epic, story, or phase (`--epic`, `--story`, `--phase`).
- **FR12:** Users can override the persona used for a step (`--persona`).
- **FR13:** Users can request the reasoning Stepper used to select the next step (`--explain`).
- **FR14:** Users can list candidate next steps with their preconditions (`--list`).
- **FR15:** Users can include or exclude optional steps from candidate computation (`--include-optional` / `--no-optional`).
- **FR16:** System dispatches each heavy task to an isolated sub-agent with declared context budget and timeout.
- **FR17:** System runs a verifier on every sub-agent output before promoting it to the canonical artifact location.
- **FR18:** System logs main-thread output as one or two human-readable lines per step.

**Bounded Loop Execution (FR19-FR26)**

- **FR19:** Users can chain step execution until a declared stop condition fires (`/bmad-loop`).
- **FR20:** Users can declare any of eight stop-condition types: `epic-end`, `story-X-Y`, `next-story`, `phase-end`, `max-iters`, `time-budget`, `token-budget`, `error`.
- **FR21:** Users can preview the loop's planned step sequence before committing tokens (`--plan-first`).
- **FR22:** Users can force a checkpoint snapshot after every step of a given type (`--checkpoint-each`).
- **FR23:** Users can cap the loop's wall-clock time, API token spend, or iteration count (`--time-budget`, `--token-budget`, `--max-iters`).
- **FR24:** Users can interrupt a running loop with SIGINT and have Stepper exit cleanly with state preserved.
- **FR25:** System enforces a default `max-iters` cap when no other stop condition is supplied, preventing accidental infinite loops.
- **FR26:** System emits a human-readable exit reason, state-snapshot pointer, and `--resume` invocation hint on every loop exit.

**Failure Handling & Recovery (FR27-FR33)**

- **FR27:** Users can resume from the last attempted step after any halt (`--resume`).
- **FR28:** Users can skip a failing step and resume (`--skip <step> --resume`).
- **FR29:** Users can request a fixer sub-agent to retry a failure (`--auto-fix`).
- **FR30:** Users can pause for manual confirmation between steps in a loop (`--interactive`).
- **FR31:** Users can configure a per-step failure policy (retry / skip / route-to-fixer / escalate) via the config file.
- **FR32:** System produces an actionable, human-readable error report on every halt with no stack traces on the main thread.
- **FR33:** System records `last_attempted`, `last_successful_step`, and `last_failure_reason` to `state.yaml` for every halt.

**Configuration & Customization (FR34-FR40)**

- **FR34:** Users can configure Stepper via a project-level YAML file (`bmad-stepper.config.yaml`).
- **FR35:** Users can supply DAG placement overrides for unknown upstream BMAD skills (`overrides:` block).
- **FR36:** Users can pin a specific model (Sonnet / Opus / Haiku) per step (`models:` block).
- **FR37:** Users can override sub-agent context budget and timeout per step (`budgets:` block).
- **FR38:** Users can override verifier required-sections and schema per step (`verifiers:` block).
- **FR39:** Users can opt in to local telemetry collection (`telemetry: enabled: true`).
- **FR40:** System loads project-level config that overrides user-level config that overrides plugin defaults, with the resolution rule documented.

**Diagnostics & Observability (FR41-FR46)**

- **FR41:** Users can run a diagnostic that reports BMAD compatibility, state file presence, and DAG validity (`--doctor`).
- **FR42:** Users can stream the live transcript of a running loop (`--watch`).
- **FR43:** System writes a per-step transcript log (markdown) to `_bmad-output/.stepper/runs/<ts>-<step>.log`.
- **FR44:** System writes a per-step machine-readable run log (JSON) to `_bmad-output/.stepper/runs/<ts>-<step>.json`.
- **FR45:** System produces a local human-readable telemetry report aggregating step timing, retry rates, and verifier failure patterns when telemetry is enabled.
- **FR46:** System emits an actionable single-line error summary on the main thread and full details to the run log on every error.

**Distribution & Lifecycle (FR47-FR51)**

- **FR47:** Users can install Stepper from the Claude Code marketplace (`/plugin marketplace add tgorka/bmad-stepper`).
- **FR48:** Users can check for and install Stepper updates (`--upgrade`).
- **FR49:** Users can uninstall Stepper while preserving local state data in `_bmad-output/.stepper/`.
- **FR50:** System detects the installed BMAD version and validates compatibility on first run via `--doctor`.
- **FR51:** System fails loudly with a remediation hint when a BMAD skill is detected that cannot be placed in the DAG.

**Scripting & Integration (FR52-FR54)**

- **FR52:** Non-interactive callers can read state without holding the project lock (`--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`).
- **FR53:** System emits documented exit codes for distinct failure categories: 0 = success, 1 = halt-with-actionable-error, 2 = configuration error, 3 = BMAD compatibility error, 4 = lock contention, 5 = pathological input.
- **FR54:** System enforces stdout/stderr discipline so `--export-state` JSON output is safely pipeable while diagnostics are routed to stderr.

### NonFunctional Requirements

**Performance (NFR-P1 to NFR-P6)**

- **NFR-P1:** Next-step computation completes within 500 ms p95 for projects up to 50 epics × 50 stories on a typical SSD.
- **NFR-P2:** State recompute (`--recompute-state`) completes within 5 seconds for projects up to 100 epics × 1000 stories.
- **NFR-P3:** Sub-agent dispatch overhead (main-thread time, excluding sub-agent execution) is under 200 ms p95.
- **NFR-P4:** Transcript log streaming has zero observable impact on main-thread latency during loop execution.
- **NFR-P5:** Loading a `state.yaml` of up to 1 MB takes under 100 ms; warn above 1 MB; halt above 50 MB.
- **NFR-P6:** Telemetry report generation completes within 2 seconds for one week of run logs.

**Security (NFR-S1 to NFR-S6)**

- **NFR-S1:** Stepper performs no network I/O on the main thread except for explicit `--upgrade` and Claude Code plugin marketplace operations.
- **NFR-S2:** Stepper writes only inside the project root and the user's `~/.claude/plugins/` directory; CI gate enforces no writes to BMAD-installed files.
- **NFR-S3:** Telemetry contains no PII, no source code, and no file paths outside the project root; local-only in v0.1.
- **NFR-S4:** Sub-agent isolation enforces the declared context budget and tool restriction; sub-agents cannot escalate access to tools not declared in their `CONSTRAINTS` section.
- **NFR-S5:** State files have explicit read/write semantics: atomic tmp+rename for writes, file locks for read-modify-write cycles, halt on lock contention rather than retry-and-overwrite.
- **NFR-S6:** Stepper does not execute generated code from sub-agents as part of dispatch.

**Reliability (NFR-R1 to NFR-R8)**

- **NFR-R1:** Zero data loss on any halt scenario (SIGINT, crash, branch switch, lock contention, disk full, OS kill).
- **NFR-R2:** 100% recovery rate via `--resume` from any halt point in v0.1; tested in CI for all four failure-UX modes and all eight stop conditions.
- **NFR-R3:** State files are recomputable from disk alone via `--recompute-state`; the cache may always be discarded.
- **NFR-R4:** Stepper halts cleanly on a stale lock with a human-readable message and a remediation command (`--force-unlock`).
- **NFR-R5:** Loop interruption via SIGINT yields a graceful exit within 30 seconds; in-flight sub-agent allowed to finish current write.
- **NFR-R6:** Schema migrations on `state.yaml` are idempotent.
- **NFR-R7:** All eight stop-condition paths are individually covered by integration tests.
- **NFR-R8:** All four failure-UX modes (retry, skip, route-to-fixer, escalate) are individually covered by integration tests.

**Scalability (NFR-Sc1 to NFR-Sc5)**

- **NFR-Sc1:** Stepper supports up to 100 epics × 1000 stories per project with a lazy-load registry and paginated reads.
- **NFR-Sc2:** PRD files up to 50,000 lines are read with pagination + warning, not loaded fully into memory.
- **NFR-Sc3:** A loop with up to 1,000 sub-agent dispatches per `/bmad-loop` invocation runs without memory leaks in the main thread.
- **NFR-Sc4:** Run logs older than 90 days are auto-archived to `_bmad-output/.stepper/runs/.archive/`.
- **NFR-Sc5:** Telemetry data older than 12 months is auto-rotated when telemetry is enabled.

**Integration (NFR-I1 to NFR-I5)**

- **NFR-I1:** Stepper compatibility with BMAD-METHOD is declared per release in the CHANGELOG's BMAD Compatibility section; tested in CI against the latest BMAD release at Stepper release time.
- **NFR-I2:** Unknown upstream BMAD skills cause a fail-loud halt with a remediation hint; project-level `overrides:` config is the documented escape hatch.
- **NFR-I3:** Stepper runs against the Claude Code plugin runtime as published at v0.1.0 release time with no patches or workarounds.
- **NFR-I4:** Stepper does not depend on any specific Claude Code session state.
- **NFR-I5:** Stepper supports running on Linux and macOS via Bun ≥1.1; Native Windows is not supported in v0.1; WSL is the documented Windows path.

**Maintainability (NFR-M1 to NFR-M5)**

- **NFR-M1:** All FRs and NFRs map to integration tests in v0.1 release CI; orphan requirements (no test) block release.
- **NFR-M2:** Errors at every level produce actionable hints with concrete next-action commands; tested in CI.
- **NFR-M3:** All public-facing schemas (config, state, run-log JSON) are validated by Zod with versioned migrations.
- **NFR-M4:** README's Quick Start section can take a fresh user to a working `/bmad-next` invocation in under 10 minutes.
- **NFR-M5:** Maintenance time per Stepper release trends down post-v0.1.0; releases exceeding 8 hours of maintainer time flag a retrospective.

### Additional Requirements

**Starter / Initialization (from Architecture step-03 + step-08 first-implementation-story):**

- **AR1 (Starter Template):** No off-the-shelf starter is used. Repository is initialized via canonical commands: `bun init -y`, manual creation of `.claude-plugin/plugin.json` and `commands/<name>.md` using `anthropics/claude-plugins-official/plugins/example-plugin` as structural reference, `bun add zod@4`, `bun add -D -E @biomejs/biome` + `bunx @biomejs/biome init`, `bun add -D @changesets/cli` + `bunx changeset init`, hand-rolled GitHub Actions matrix (Linux + macOS) using `oven-sh/setup-bun@v2`. **This MUST be Epic 1 Story 1.**
- **AR2 (Pinned versions at v0.1.0):** Bun ≥ 1.3 (1.3.13 verified Apr 2026), TypeScript bundled with Bun (strict + ESNext + Preserve modules), Zod 4.x latest stable, Biome 2.3.x exact-pinned, Changesets latest lockfile-pinned, `oven-sh/setup-bun@v2`.
- **AR3 (Plugin manifest fields):** `.claude-plugin/plugin.json` requires `name, version, description, author, homepage, repository, license: MIT, keywords: ["claude-code", "claude-code-plugin", "bmad", "bmad-method", "agile", "ai-development"]`.

**Three-Layer Execution Model (D1):**

- **AR4 (Layer 1 — Claude main thread):** Slash-command markdown files (`commands/bmad-next.md`, `commands/bmad-loop.md`, optional `commands/bmad-doctor.md`) author the orchestration prompts. Layer 1 dispatches to Layer 2 via `Bash` tool (`bun run ...`) and to Layer 3 via `Task` tool.
- **AR5 (Layer 2 — Bun deterministic core):** TypeScript modules under `src/`. Pure deterministic IO and computation. Never calls `Task` tool. Never interacts with Claude orchestration. Tested with `bun test` in isolation.
- **AR6 (Layer 3 — BMAD sub-agents):** Sub-agent definitions under `agents/` (`bmad-step-runner.md`, `bmad-step-fixer.md`). File-in (`staging/<run-id>/inputs/`) / file-out (`staging/<run-id>/outputs/`) only. Never decides what comes next, never validates own output, never holds dialogue with user.
- **AR7 (Sub-agent task spec — 6 sections):** Every dispatch generates `staging/<run-id>/dispatch-spec.json` containing PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS.
- **AR8 (Lock-free `run.ts`, lock in `verify-and-advance.ts`):** Critical correction from architecture validation. `src/commands/next/run.ts` is read-only and lock-free. Lock is acquired only in `verify-and-advance.ts` which re-reads state and computes a state-hash to detect TOCTOU; mismatch surfaces `STATE_CHANGED_DURING_DISPATCH` (exit 1).
- **AR9 (`run.ts` JSON-line stdout protocol):** `run.ts` emits exactly one JSON line on stdout: `{ action: "dispatch" | "report" | "halt", runId?, agent?, message?, exitCode }`. Schema in `src/schemas/dispatch-protocol.ts`.
- **AR10 (Token-budget threading):** Layer 1 captures Task tool's token counts and forwards them to `verify-and-advance.ts` as `--tokens-in <n> --tokens-out <n>`. Loop runner aggregates across iterations and halts on `--token-budget` exceeded.

**State, Locking, Snapshots (D4, D7, D10):**

- **AR11 (State persistence layout):** All Stepper state under `_bmad-output/.stepper/{state.yaml, state.yaml.bak, state.yaml.lock/, runs/, staging/, telemetry/, journal/}`. Conventions: `<ts>` is `YYYY-MM-DDTHH-mm-ss` UTC; `<run-id>` is `<ts>-<step>-<short-uuid>`; orphan staging dirs > 24h cleaned up at start.
- **AR12 (Hand-rolled mkdir-based file lock):** No external lockfile dep. Algorithm: `mkdir(state.yaml.lock)` for acquire (EEXIST → contention); 5-second `mtime` heartbeat on `pid` file inside; stale at 30 s; PID-alive check via `kill(pid, 0)`; `rm -rf` for release in try/finally; `--force-unlock` flag.
- **AR13 (Snapshot two-layer):** Layer 1 — Git-aware branch+sha to `state.yaml.lastSnapshot`; halt with `BRANCH_SWITCH` on mismatch; non-Git is one-time warning. Layer 2 — `.bak` rotation before destructive write to `state.yaml` (atomic tmp+rename), one-cycle-back retention. `--checkpoint-each <step-type>` records explicit checkpoints (bounded 50 FIFO).

**Step Registry & DAG (D5, D6, D13):**

- **AR14 (Three-tier step registry):** Tier 1 — built-in DAG seed (`src/dag/seed-v6.x.ts`, hand-curated, BMAD-version-pinned, CI-tested). Tier 2 — project overrides (`bmad-stepper.config.yaml` `overrides:`, Zod-validated, higher priority than seed). Tier 3 — frontmatter-parse fallback (parse `SKILL.md` / `skill.yaml`); on fail → `UNKNOWN_BMAD_SKILL` (exit 3) with remediation hint.
- **AR15 (DAG representation):** Adjacency list with `nodes: Map<string, StepNode>`, `edgesOut: Map<string, Set<string>>`, `edgesIn`. Tarjan SCC cycle detection on every load → `DAG_CYCLE` error. Topological order tiebreaker: phase order then name lexicographic. Lazy story-level loading per NFR-Sc1.
- **AR16 (Persona resolution — 4 tiers):** Step frontmatter `persona:` > project config `personas:` > plugin defaults (`src/personas/defaults.ts`) > auto-detect from `_bmad/<module>/config.yaml`. Multi-persona steps (`string | string[]`) dispatch sub-agents sequentially in v0.1. Unresolvable → `CONFIG_ERROR` (exit 2).

**Verifier & Failure-UX (D9):**

- **AR17 (Per-step verifier config):** `VerifierConfig = { requiredFiles, requiredFrontmatterSections, schema: ZodSchema|null, custom?: (artifact)=>Result }`. Resolution: project config overrides plugin defaults. Custom checks are deterministic and stateless (no Claude calls).
- **AR18 (Four failure-UX modes):** `retry` (default max 2), `skip` (advance to next), `route-to-fixer` (dispatch `agents/bmad-step-fixer.md`, then re-verify), `escalate` (halt + actionable report + `--resume` available). Per-step policy via config; default `escalate`. `--auto-fix` flag overrides per-step policy to `route-to-fixer` for one run.

**Schemas, Migrations, Errors (D3, D8, D11, D12):**

- **AR19 (Bun.YAML for parsing):** All YAML reads use `Bun.YAML.parse(text)` (built-in, no external dep) followed by Zod validation.
- **AR20 (Schema migrations):** Per-schema migration registry; `loadAndMigrate` runs `n→n+1` while version < current; idempotent contract (CI test enumerates `(from, to)` paths). `STATE_TOO_NEW` error on schemaVersion > current; `CORRUPT_STATE` on validation failure. Schemas: `state.yaml`, `bmad-stepper.config.yaml`, run-log JSON, telemetry JSONL.
- **AR21 (Error class hierarchy):** Discriminated-union `StepperError` with `code: StepperErrorCode`, `exitCode: 0|1|2|3|4|5`, `actionableHint: string` (single-line, ends with concrete next-action verb), optional `detail`. Single file `src/errors.ts` + CI test `src/errors.test.ts` enumerating registry and asserting hint format, code uniqueness, valid exitCode.
- **AR22 (Error registry CI gate):** Every concrete `StepperError` subclass exposed via `errorRegistry` export; `errors.test.ts` asserts non-empty hint, hint matches `/^.*(Run|See|Try|Check) /`, code unique, exitCode ∈ {0,1,2,3,4,5}.
- **AR23 (Hand-rolled CLI parser):** `src/commands/<name>/args.ts` with Zod schema (`NextArgsSchema`, `LoopArgsSchema`, `DoctorArgsSchema`). ~50 lines tokenizer + Zod validate. No commander/oclif/yargs.
- **AR24 (Documented exit codes):** 0=success, 1=halt-actionable, 2=config error, 3=BMAD compat error, 4=lock contention, 5=pathological input. `docs/exit-codes.md` ships v0.1.

**Observability & Telemetry (D7):**

- **AR25 (Markdown transcript per step):** `runs/<ts>-<step>.log` with sections: `# Step <name>`, `## Inputs`, `## Sub-agent prompt`, `## Sub-agent output (excerpt)`, `## Verifier result`, `## State delta`. Streamed write to disk; never to stdout/stderr.
- **AR26 (JSON run log per step):** `runs/<ts>-<step>.json` schema-versioned: `{ schemaVersion, ts, runId, step, epic, story, phase, persona, model, budget, verifierResult, stateBefore, stateAfter, durationMs, tokensIn, tokensOut, errors }`.
- **AR27 (Telemetry collection schema):** `TelemetryRecordV1Schema` with closed-set field whitelist: `schemaVersion, ts, step, phase, persona, model, durationMs, verifierStatus, retries, tokensIn, tokensOut, errorCode?`. Anything else fails Zod validation (enforces NFR-S3 no-PII).
- **AR28 (Auto-archival/rotation):** Run logs > 90 days → `runs/.archive/<YYYY-MM>/`. Telemetry > 12 months → `telemetry/.archive/`. Both run on Stepper start.

**Distribution & Upgrade (D14):**

- **AR29 (Read-only `--upgrade`):** Calls `gh api repos/tgorka/bmad-stepper/releases/latest` via `Bun.fetch` (the only main-thread network I/O permitted by NFR-S1). Compares `currentVersion` to `latestVersion`; prints diff + CHANGELOG link + BMAD compat. Never auto-installs; emits hint `Run /plugin marketplace update tgorka/bmad-stepper to upgrade.`
- **AR30 (BMAD-not-installed detection):** `BMAD_NOT_INSTALLED` (exit 3) check at top of every command runner: detect absence of `~/.claude/plugins/bmad-method-*` AND absence of `_bmad/` in project root. Hint: `Run npx bmad-method install --tools claude-code first.`

**Implementation Patterns & Quality (P1-P8):**

- **AR31 (Naming conventions):** Files: `kebab-case.ts`, tests colocated `<source>.test.ts`. Slash-commands: `commands/bmad-<verb>.md`. Sub-agents: `agents/bmad-<role>.md`. TS: `camelCase` functions/variables, `PascalCase` types/interfaces (no `I` prefix), `SCREAMING_SNAKE_CASE` constants and error codes. Persisted-file fields: `camelCase` everywhere (incl. YAML).
- **AR32 (Repository structure):** Tests colocated next to source (not `tests/` dir, for `bun test --changed` granularity). One folder per command (`src/commands/<name>/{index, args, run, verify-and-advance}.ts`). Centralized: `src/schemas/`, `src/errors.ts`, `src/io/`. Per-step: `src/verifiers/<step>.ts`. Per migration: `src/migrations/<schema>/<from>-to-<to>.ts`. Fixtures: `tests/fixtures/<scenario>/`.
- **AR33 (Function & error semantics):** Throw `StepperError` subclasses (no `Result<T,E>` in general code path). Sole exception: CLI parser uses `Result<Args, ParseError>`. Always `async/await`. Bun-native APIs preferred (`Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn`). No `any`. No `console.log` in runtime — use `src/io/log.ts`.
- **AR34 (Slash-command markdown frontmatter):** Each `commands/<name>.md` has `description`, `argumentHint`, `allowedTools: ["Bash", "Task", "Read"]`. Body pattern: 1) Bash invokes `bun run`, 2) read JSON action line, 3) Task tool dispatch if action=dispatch, 4) Bash invokes verify-and-advance, 5) print summary line. Tool restrictions documented in body.
- **AR35 (Test patterns):** Tests use unique `tmpdir()` per test; never touch `_bmad-output/` from a test. Fixtures in `tests/fixtures/<scenario>/` with minimal BMAD-project replicas. Test commands: `test`, `test:watch`, `test:integration`, `test:smoke`. Coverage release blocker at < 80% line. Sharding via `bun test --shard <n>/<total>`.
- **AR36 (Code quality CI gates):** Biome 2.3 only (no ESLint/Prettier); `biome.json` enforces strict (incl. `noConsoleLog`, `noImplicitAnyLet`). CI gate `bun run check = biome ci . && bun test` is a release blocker. Three integration-test gates: errors-registry, no-write-outside-scope (NFR-S2), no-network-on-main (NFR-S1).

**Pathological-input Guards (cross-cutting concern 9):**

- **AR37 (Five guards):** 50k-line PRD warning + paginated read; 50 MB `state.yaml` halt; UTF-8 filename enforcement; 200-issue review pagination; lazy registry load for 100 epics × 1000 stories; configurable epic file-name pattern.

**Distribution & Repo Files (PRD §scoping + §api_surface):**

- **AR38 (Repo files):** README, CHANGELOG.md (Changesets-managed; "BMAD Compatibility" section per release), AGENTS.md (contributor + sub-agent contract), CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, MIT LICENSE, PR + issue templates, `.github/dependabot.yml`. README + getting-started docs are v0.1 deliverables, not follow-ups.
- **AR39 (Code examples shipped at v0.1.0):** Seven worked examples in `docs/examples/` and `examples/scripting/`: cold-start return, single-step, overnight loop, halt recovery, skip-on-failure, doctor diagnostic, state export for CI.
- **AR40 (CI workflows):** `.github/workflows/ci.yml` (bun test + biome ci, matrix Linux+macOS), `release.yml` (Changesets release flow), `bmad-compat.yml` (weekly check vs latest BMAD).

**Internal Architecture Constraints:**

- **AR41 (Module boundary graph):** Foundational (no upward imports): `errors.ts`, `schemas/`, `io/`. Mid-level: `migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. Higher-level: `verifiers/`, `dispatch/`, `failure-ux/`. Top-level: `commands/`. Enforced by Biome import-restriction rule or hand-rolled CI test.
- **AR42 (Persistence boundary):** Reads allowed from `_bmad-output/.stepper/**`, `_bmad-output/**`, `_bmad/**`, `docs/**`, `bmad-stepper.config.yaml`, `~/.claude/plugins/<bmad>/**`. Writes only to `_bmad-output/.stepper/**` and `_bmad-output/**` (artifact promotion). NEVER to `_bmad/**` or `~/.claude/plugins/<bmad>/**`. Lock only at `_bmad-output/.stepper/state.yaml.lock/`.
- **AR43 (Cross-platform constraints):** Linux + macOS only via Bun ≥ 1.3. Windows via WSL only. ESM exclusively, no CommonJS. Source = release (no `dist/`, no transpile step). No `node:*` imports unless explicit lint allowance.

### UX Design Requirements

_Not applicable. The product is a Claude Code plugin with no GUI, no browser surface, no public network API, no database. PRD explicitly skips `visual_design` and `store_compliance`. NFR explicitly notes "Accessibility is out of scope (Stepper has no GUI)". Slash-command UX is captured by Functional Requirements FR1-FR54 directly._

### FR Coverage Map

| FR | Epic | Brief |
|---|---|---|
| FR1 | Epic 2 | zero-config next-step computation |
| FR2 | Epic 1 | `--recompute-state` rebuilds cache from disk |
| FR3 | Epic 3 | `--diff-state` reports cache-vs-files divergence |
| FR4 | Epic 3 | `--export-state` machine-readable JSON |
| FR5 | Epic 1 | recovery from any halt via files alone |
| FR6 | Epic 1 | versioned schema validation with actionable errors |
| FR7 | Epic 1 | auto-apply schema migrations on load |
| FR8 | Epic 2 | `/bmad-next` single-step advance |
| FR9 | Epic 3 | `--dry-run` preview without executing |
| FR10 | Epic 3 | `--step <id>` override |
| FR11 | Epic 3 | `--epic`/`--story`/`--phase` scope narrowing |
| FR12 | Epic 3 | `--persona` override |
| FR13 | Epic 3 | `--explain` reasoning trace |
| FR14 | Epic 3 | `--list` candidate next steps |
| FR15 | Epic 3 | `--include-optional`/`--no-optional` |
| FR16 | Epic 2 | sub-agent dispatch with budget+timeout |
| FR17 | Epic 2 | verifier-before-promote gate |
| FR18 | Epic 2 | one-line main-thread output |
| FR19 | Epic 4 | `/bmad-loop` chained execution |
| FR20 | Epic 4 | 8 stop-condition types |
| FR21 | Epic 4 | `--plan-first` preview |
| FR22 | Epic 4 | `--checkpoint-each` snapshot per step type |
| FR23 | Epic 4 | `--time-budget`/`--token-budget`/`--max-iters` |
| FR24 | Epic 4 | SIGINT graceful exit |
| FR25 | Epic 4 | default `--max-iters=50` cap |
| FR26 | Epic 4 | exit reason + state snapshot + `--resume` hint |
| FR27 | Epic 3 | `--resume` from any halt |
| FR28 | Epic 5 | `--skip <step>` and resume |
| FR29 | Epic 5 | `--auto-fix` (route-to-fixer) |
| FR30 | Epic 5 | `--interactive` per-step confirmation |
| FR31 | Epic 5 | per-step failure policy via config |
| FR32 | Epic 5 | actionable error report on halt |
| FR33 | Epic 3 | record `last_attempted`/`last_successful`/`last_failure_reason` |
| FR34 | Epic 6 | project YAML config |
| FR35 | Epic 6 | DAG `overrides:` for unknown upstream skills |
| FR36 | Epic 6 | `models:` per step |
| FR37 | Epic 6 | `budgets:` per step |
| FR38 | Epic 6 | `verifiers:` per step |
| FR39 | Epic 6 | telemetry opt-in |
| FR40 | Epic 6 | project>user>defaults config resolution |
| FR41 | Epic 1 | `--doctor` diagnostic |
| FR42 | Epic 3 | `--watch` live transcript tail |
| FR43 | Epic 2 | markdown transcript per step |
| FR44 | Epic 2 | JSON run log per step |
| FR45 | Epic 6 | telemetry report aggregation |
| FR46 | Epic 5 | single-line + full-detail errors |
| FR47 | Epic 1 | marketplace install path |
| FR48 | Epic 6 | `--upgrade` flow |
| FR49 | Epic 1 | uninstall preserves state |
| FR50 | Epic 1 | BMAD version detection on first run |
| FR51 | Epic 1 | fail-loud on unknown BMAD skill |
| FR52 | Epic 3 | non-locking read flags |
| FR53 | Epic 1 | documented exit codes 0–5 |
| FR54 | Epic 1 | stdout/stderr discipline |

**Coverage:** 54/54 FRs mapped. No orphan requirements.

## Epic List

### Epic 1: Foundation & First-Run Diagnostic

User can install the Stepper plugin from the Claude Code marketplace, run `/bmad-next --doctor`, and get a verdict on BMAD compatibility, project state, and DAG validity. No step advancement yet — this is the bootstrapping epic that lays every foundational primitive (errors registry with CI gate, Zod schemas, atomic tmp+rename writes, mkdir-based file lock with heartbeat, CLI parser, exit-code discipline, three-tier DAG seed + registry, four-tier persona resolution, BMAD-install detection) and produces a working plugin scaffold installable from the marketplace. Documentation deliverables (README quick-start ≤10 min to first `/bmad-next`, getting-started, exit-codes catalog) ship in this epic.

**FRs covered:** FR2, FR5, FR6, FR7, FR41, FR47, FR49, FR50, FR51, FR53, FR54

### Epic 2: Single-Step Advance with Sub-Agent Dispatch

User runs `/bmad-next` zero-config on a real BMAD project, Stepper computes the next step, dispatches an isolated sub-agent via the Task tool with the 6-section task spec (PERSONA / CONTEXT / TASK / OUTPUT FORMAT / SUCCESS CRITERIA / CONSTRAINTS), runs the verifier, promotes the artifact atomically to its canonical location with a state-hash check (TOCTOU defense), advances state, and prints one human-readable line per step. Markdown + JSON transcripts are written to `_bmad-output/.stepper/runs/`. Lock semantics correction from architecture validation is enforced: `run.ts` is read-only and lock-free; `verify-and-advance.ts` acquires the lock.

**FRs covered:** FR1, FR8, FR16, FR17, FR18, FR43, FR44

### Epic 3: Resume, Inspection & State Export

User can preview, explain, narrow, override, resume, inspect divergence, and export state as machine-readable JSON. This is the "transparency surface" that makes Stepper trustable and scriptable from CI. Resume is gated on `last_attempted`/`last_failure_reason` recording from every halt. The non-locking read flags (`--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`) never block other Stepper invocations.

**FRs covered:** FR3, FR4, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR27, FR33, FR42, FR52

### Epic 4: Bounded Loop with Eight Stop Conditions

User runs `/bmad-loop` and Stepper chains step execution until any of eight stop conditions fires (`epic-end`, `story-X-Y`, `next-story`, `phase-end`, `max-iters`, `time-budget`, `token-budget`, `error`). `--plan-first` previews the planned sequence before committing tokens. `--checkpoint-each <step-type>` forces a snapshot after every step of a given type. SIGINT yields a graceful exit within 30 seconds with the in-flight sub-agent allowed to finish its current write. Default `--max-iters=50` prevents accidental infinite loops. On exit the loop emits a human-readable exit reason, state snapshot pointer, and `--resume` invocation hint.

**FRs covered:** FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26

### Epic 5: Failure-UX Modes & Auto-Fix

When a verifier fails or a sub-agent errors, the user has four recovery modes — `retry` (default 2 attempts), `skip` (advance past failing step), `route-to-fixer` (dispatch `agents/bmad-step-fixer.md`), `escalate` (halt with actionable report). Flags `--auto-fix`, `--skip`, `--interactive` expose this on the user's surface. Per-step failure policy is configurable via `bmad-stepper.config.yaml`. Errors-as-primary-UX: every halt produces a single-line actionable hint on the main thread with the full detail in the run log; never a stack trace. Loop-level `--auto-fix` overrides per-step policy to `route-to-fixer` for one run.

**FRs covered:** FR28, FR29, FR30, FR31, FR32, FR46

### Epic 6: Configuration, Telemetry & Release Readiness

User customizes Stepper per-project via `bmad-stepper.config.yaml` — personas, models, budgets, verifiers, DAG overrides for unknown upstream skills, telemetry opt-in, paths. Opt-in local telemetry collects step timing, retry rates, verifier failure patterns, and aggregates them into a human-readable monthly report — the dogfood-validation data source for the 60-day decision. `--upgrade` checks GitHub Releases and prints a CHANGELOG diff plus BMAD compatibility for the latest. Auto-archival keeps run dirs (>90 days) and telemetry (>12 months) from unbounded growth. v0.1.0 ships to the Claude Code marketplace with full repo files (README, CHANGELOG, AGENTS.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE, PR/issue templates, dependabot), the seven worked code examples, and the three CI workflows (ci, release, weekly bmad-compat).

**FRs covered:** FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR45, FR48

## Epic 1: Foundation & First-Run Diagnostic

User can install the Stepper plugin, run `/bmad-next --doctor`, and confirm BMAD compatibility, project state, and DAG validity. No step advancement yet — bootstrap epic that lays every foundational primitive and produces a marketplace-installable plugin scaffold.

### Story 1.1: Initialize Repository Scaffold

As a Stepper maintainer,
I want a reproducible repo init following the canonical sequence (`bun init`, plugin manifest, Biome, Changesets, GitHub Actions matrix),
So that every contributor starts from the same documented baseline and CI is green from PR #1.

**Acceptance Criteria:**

**Given** an empty directory
**When** the canonical init sequence runs (`bun init -y`, manual `.claude-plugin/plugin.json`, `bun add zod@4`, `bun add -D -E @biomejs/biome` + `bunx @biomejs/biome init`, `bun add -D @changesets/cli` + `bunx changeset init`, hand-rolled GitHub Actions matrix using `oven-sh/setup-bun@v2`)
**Then** the repo contains `package.json`, `tsconfig.json` (strict + ESNext + Preserve modules), `bunfig.toml`, `biome.json`, `.changeset/`, `.github/workflows/ci.yml` (matrix Linux+macOS), `.claude-plugin/plugin.json` (with `name`, `version`, `description`, `author`, `license: MIT`, `keywords: ["claude-code", "claude-code-plugin", "bmad", "bmad-method", "agile", "ai-development"]`), placeholder `commands/bmad-next.md`, and the only runtime dep is Zod 4
**And** `bun test` exits 0 (empty pass) and `biome ci` passes on Linux + macOS in CI
**And** versions are pinned per AR2: Bun ≥ 1.3, Biome 2.3.x exact, Zod 4.x latest stable, `oven-sh/setup-bun@v2`

### Story 1.2: Errors Module + Registry CI Gate

As a Stepper contributor,
I want every error class registered in a single `src/errors.ts` with a CI gate that asserts hint format, code uniqueness, and valid exit code,
So that errors-as-primary-UX is enforceable from day one and no error class can ship without an actionable hint.

**Acceptance Criteria:**

**Given** the abstract `StepperError` class with `code: StepperErrorCode`, `exitCode: 0|1|2|3|4|5`, `actionableHint: string`, optional `detail`
**When** every concrete error subclass is registered via the exported `errorRegistry`
**Then** `src/errors.test.ts` enumerates the registry and asserts: (a) every `actionableHint` is non-empty, (b) every hint matches `/^.*(Run|See|Try|Check) /`, (c) every `code` is unique, (d) every `exitCode` ∈ {0,1,2,3,4,5}
**And** initial codes are registered: `LOCK_CONTENTION`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE`, `CORRUPT_STATE`, `STATE_TOO_NEW`, `STATE_CHANGED_DURING_DISPATCH`, `VERIFIER_FAILURE`, `PATHOLOGICAL_INPUT`, `BUDGET_EXCEEDED`, `TIMEOUT`, `CONFIG_ERROR`, `MIGRATION_FAILURE`
**And** `bun run check` includes this test as a release blocker

### Story 1.3: Logger + Path Helpers + Atomic Write

As a Stepper contributor,
I want foundational IO primitives (logger with stdout/stderr discipline, path scope-checker, atomic tmp+rename writer with `.bak` rotation),
So that every higher-level module uses one set of audited IO and the no-write-outside-scope CI gate can be implemented.

**Acceptance Criteria:**

**Given** `src/io/log.ts` with `info`/`warn`/`error`/`json` functions
**When** `info`/`warn`/`error` are called
**Then** they write to stderr and `json` writes to stdout (FR54 stdout reserved for `--export-state`)
**And** Biome rule `noConsoleLog: "error"` blocks any `console.log` outside `src/io/log.ts`
**Given** `src/io/paths.ts` with `assertWithinScope(path)` helper
**When** any write target is outside `_bmad-output/.stepper/**`, `_bmad-output/**`, or the test tmpdir
**Then** the helper throws `SCOPE_VIOLATION` (or equivalent) and the integration test `no-write-outside-scope.test.ts` is green
**Given** `src/io/atomic-write.ts` with `atomicWrite(path, contents)`
**When** writing
**Then** the file is first written to `path.tmp`, then `fs.rename(path.tmp, path)`, with `path.bak` rotation kept for one cycle (NFR-R1, NFR-S5)

### Story 1.4: File Lock with Heartbeat

As a Stepper user,
I want exclusive per-project locking with a PID + heartbeat so concurrent invocations are detected, stale locks are reclaimed, and `--force-unlock` is the documented remediation,
So that branch switches, killed processes, and concurrent terminals never corrupt state.

**Acceptance Criteria:**

**Given** the mkdir-based algorithm: `mkdir(state.yaml.lock)` for acquire (EEXIST = contention), 5-second `mtime` heartbeat on the inner `pid` file, 30-second stale threshold, `kill(pid, 0)` for liveness check, `rm -rf` for release in `try/finally`
**When** a second Stepper process tries to acquire while the first holds the lock
**Then** the second exits with `LOCK_CONTENTION` (exit code 4) and the hint `Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.`
**Given** the first process is killed with `kill -9` (no graceful release)
**When** more than 30 seconds pass without heartbeat update and the second process retries
**Then** the second detects the stale lock via PID-not-alive, removes it, and acquires successfully
**And** `--force-unlock` removes the lock dir unconditionally after a `Are you sure no other Stepper is running?` prompt
**And** integration tests cover: concurrent acquire, stale-lock recovery, suspended-process heartbeat-loss, `--force-unlock` UX, sub-second-`mtime` filesystem fallback to 60-second threshold

### Story 1.5: Schemas + Migrations Skeleton

As a Stepper user,
I want every persisted file (`state.yaml`, `bmad-stepper.config.yaml`, run-log JSON, telemetry JSONL) Zod-validated with idempotent migrations,
So that loading older state surfaces actionable errors (not stack traces) and forward-compat is provable in CI.

**Acceptance Criteria:**

**Given** centralized schema files in `src/schemas/{state,config,run-log,telemetry,dispatch-spec,verifier-result,pid}.ts`
**When** `loadAndMigrate(raw, registry)` runs
**Then** it reads `schemaVersion` (default 1 if absent), iterates `versions[v]` validate → `migrations[v]` apply → increment until current, final-validates against `versions[current]`, and returns the typed Latest shape
**Given** raw state with `schemaVersion > current`
**When** loading
**Then** it surfaces `STATE_TOO_NEW` (exit 1) with hint `Run /bmad-next --upgrade to install a Stepper version that supports this schema.`
**Given** corrupt JSON/YAML
**When** loading
**Then** it surfaces `CORRUPT_STATE` (exit 1) with hint `Run /bmad-next --recompute-state to rebuild the cache from project files.`
**And** `migration.test.ts` enumerates every `(fromVersion, toVersion)` path per schema family and asserts idempotency (running `n→n+1` on already-`n+1` data is a no-op)

### Story 1.6: State Subsystem Load / Save / Recompute Skeleton

As a Stepper user,
I want `state.yaml` to round-trip cleanly with size guards (warn >1 MB, halt >50 MB) and a recompute placeholder that rebuilds state from project files,
So that the file-as-truth invariant holds and `--recompute-state` is a one-command escape.

**Acceptance Criteria:**

**Given** `src/state/load.ts` calling `loadAndMigrate` against `state.yaml`
**When** the file is between 0 and 1 MB
**Then** it loads in under 100 ms p95 (NFR-P5)
**And** files between 1 MB and 50 MB emit a warning to stderr but proceed
**And** files above 50 MB exit with `PATHOLOGICAL_INPUT` (exit code 5) and the hint `Run /bmad-next --recompute-state to rebuild the cache.`
**Given** a fresh project with no `state.yaml`
**When** `--recompute-state` runs
**Then** it scans `_bmad-output/planning-artifacts/`, `_bmad-output/implementation-artifacts/`, and `_bmad/<module>/` to compute `lastSuccessfulStep` from frontmatter `status: complete` markers, then atomically writes `state.yaml` with `schemaVersion: 1`, `project.name`, detected `bmadVersion`, empty `runHistory`, empty `checkpoints`
**And** `bun run recompute-state` completes in under 5 seconds for a fixture with 100 epics × 1000 stories (NFR-P2)

### Story 1.7: CLI Argument Parser

As a Stepper contributor,
I want a hand-rolled tokenizer + Zod-validated argument schema per command,
So that flag parsing has actionable Zod errors with no external arg-library dep.

**Acceptance Criteria:**

**Given** `src/commands/next/args.ts` exporting `NextArgsSchema` (`step?`, `epic?`, `story?`, `phase?`, `dryRun`, `resume`, `includeOptional`, `noOptional`, `persona?`, `explain`, `list`, plus `doctor`, `upgrade`, `recomputeState`, `exportState`, `diffState`, `watch`, `forceUnlock`)
**When** `parseNextArgs(argv)` runs against valid input
**Then** it returns `Result<NextArgs, ParseError>` with defaults filled
**Given** invalid input (unknown flag, wrong type)
**When** parseNextArgs runs
**Then** it returns `Err(ParseError)` and the top-level entrypoint exits with code 2 plus a single-line Zod hint (no stack trace)
**And** the parser is hand-rolled (~50 lines) with no external lib
**And** the same pattern is reusable: `LoopArgsSchema`, `DoctorArgsSchema` follow identical shape (deferred for Epic 4 / Story 1.12)

### Story 1.8: Snapshot — Branch + SHA Detection

As a Stepper user,
I want every run to capture the current Git branch+SHA and halt on mismatch since the last run,
So that branch switches mid-loop never trust a stale state cache.

**Acceptance Criteria:**

**Given** the project is a Git repo
**When** Stepper starts
**Then** it captures `branch` and `sha` via `Bun.spawn(["git", "rev-parse", "HEAD"])` + `git rev-parse --abbrev-ref HEAD` and persists to `state.yaml.lastSnapshot: { branch, sha, takenAt }`
**Given** the user `git checkout`s another branch between Stepper invocations
**When** Stepper next runs
**Then** it detects branch+sha mismatch and exits with `BRANCH_SWITCH` (exit code 1) plus the hint `Run /bmad-next --resume to re-validate state, or /bmad-next --recompute-state to rebuild from files on the new branch.`
**Given** the project is not a Git repo
**When** Stepper starts
**Then** `lastSnapshot` is set to `null` and a one-time warning is emitted (does not block)
**And** integration test `branch-switch.test.ts` covers all three paths

### Story 1.9: BMAD Detection

As a Stepper user,
I want Stepper to detect the installed BMAD version and the project's `_bmad/` directory at the top of every command,
So that the plugin fails loudly when BMAD is not installed instead of producing confusing downstream errors.

**Acceptance Criteria:**

**Given** `src/bmad-detect/detect-version.ts` and `detect-skills.ts`
**When** Stepper starts in a project that has `_bmad/` AND a BMAD plugin under `~/.claude/plugins/bmad-method-*`
**Then** detection returns `{ bmadVersion, skillNames[] }` parsed from BMAD's plugin manifest
**Given** neither `_bmad/` nor a BMAD plugin exists
**When** any Stepper command runs
**Then** it exits with `BMAD_NOT_INSTALLED` (exit code 3) and the hint `Run npx bmad-method install --tools claude-code first.`
**And** detection is invoked at the top of every command runner (`next/run.ts`, `loop/run.ts`, `doctor/run.ts`)

### Story 1.10: DAG Seed + Three-Tier Registry

As a Stepper user,
I want the BMAD step DAG built from a curated seed, project overrides, and a frontmatter-parse fallback for unknown skills,
So that Stepper auto-detects new BMAD skills when the convention permits and fails loudly otherwise.

**Acceptance Criteria:**

**Given** `src/dag/seed-v6.x.ts` with hand-curated entries for every BMAD v6.5 skill
**When** the DAG builder loads
**Then** Tier 1 (seed) populates the adjacency list with `phase`, `after`, `before`, `optional`, `persona` per node
**Given** `bmad-stepper.config.yaml` has an `overrides:` block
**When** the DAG builder loads
**Then** Tier 2 (overrides) replaces or appends entries with higher priority than the seed
**Given** the BMAD install contains a skill not in the seed and not in overrides
**When** the DAG builder runs Tier 3
**Then** it parses `SKILL.md` / `skill.yaml` frontmatter for `phase`, `after`, `before`, `optional`, `persona` — on success it includes the skill, on failure it exits with `UNKNOWN_BMAD_SKILL` (exit code 3) and the hint `Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.`
**And** Tarjan's SCC cycle detection runs on every load and emits `DAG_CYCLE` with the offending nodes listed
**And** lazy story-level loading is implemented: the global skill DAG (~30-50 nodes) loads at start; per-story expansions are materialized on demand (NFR-Sc1)

### Story 1.11: Persona Resolution

As a Stepper user,
I want every step's persona resolved through 4 tiers (frontmatter → project config → plugin defaults → module-config auto-detect),
So that the dispatch spec's PERSONA section is always populated correctly without forcing me to declare it manually.

**Acceptance Criteria:**

**Given** `src/personas/{defaults.ts, resolve.ts}` with the hand-curated default map for every seed skill
**When** `resolvePersona(stepName)` runs
**Then** it checks (1) the BMAD skill's `SKILL.md` frontmatter `persona:`, (2) `bmad-stepper.config.yaml` `personas:`, (3) `src/personas/defaults.ts`, (4) `_bmad/<module>/config.yaml` triggers — in that order
**Given** none of the four tiers resolve
**When** `resolvePersona` runs
**Then** it throws `CONFIG_ERROR` (exit code 2) with the hint `Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.`
**Given** a step with multiple personas (e.g., `code-review` = `["dev", "tea"]`)
**When** dispatching
**Then** sub-agents run sequentially (parallel deferred per PRD §17)

### Story 1.12: `/bmad-next --doctor` Command

As a Stepper user (Lena's first install scenario),
I want `/bmad-next --doctor` to report BMAD compatibility, state file presence, and DAG validity,
So that I can verify my install in 30 seconds without typing any other command.

**Acceptance Criteria:**

**Given** `src/commands/doctor/{args,run,checks}.ts` and the thin alias `commands/bmad-doctor.md` (which delegates to `bun run src/commands/doctor/run.ts`)
**When** `/bmad-next --doctor` runs in a project with BMAD installed and a fresh state
**Then** it prints to stderr: `BMAD detected: v<version> (compatible)`, `Project: <name>`, `State file: not present (fresh project)`, `Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles`, `Suggestion: run /bmad-next to start the analysis phase.`
**Given** BMAD is missing
**When** `--doctor` runs
**Then** it exits 3 with `BMAD_NOT_INSTALLED` hint
**Given** a `state.yaml` with corrupt schemaVersion
**When** `--doctor` runs
**Then** it surfaces `CORRUPT_STATE` with remediation hint
**And** exit codes follow the documented mapping (FR53)
**And** the marketplace install path works: a smoke test installs the plugin to a tmp `.claude/plugins/`, types `/bmad-next --doctor`, asserts green
**And** uninstall preserves `_bmad-output/.stepper/` (FR49 — documented in README, no code gate)

### Story 1.13: Quick-Start Documentation

As a fresh Stepper user,
I want the README to take me from `/plugin marketplace add` to a working `/bmad-next` invocation in under 10 minutes,
So that the dogfood-validation NFR-M4 is real-world tested.

**Acceptance Criteria:**

**Given** a fresh user with Claude Code + BMAD installed
**When** they follow `README.md` Quick Start
**Then** they reach a successful `/bmad-next --doctor` output within 10 minutes (timed walkthrough fixture in `tests/fixtures/quick-start-walkthrough.md`)
**And** `docs/getting-started.md` complements with deeper context (commands surface, state location, troubleshooting top-5)
**And** `docs/exit-codes.md` lists every code 0–5 with examples and remediation
**And** the README has the seven worked examples by reference (full bodies in Epic 6 Story 6.10 — these documentation files just link forward)

## Epic 2: Single-Step Advance with Sub-Agent Dispatch

User runs `/bmad-next` zero-config and Stepper computes, dispatches via Task tool, verifies, promotes atomically, advances state, and prints one line. Markdown + JSON transcripts are written. Lock semantics: `run.ts` lock-free, `verify-and-advance.ts` locks + state-hash check.

### Story 2.1: Verifier Configuration & Registry

As a Stepper contributor,
I want every BMAD step to declare a verifier config (required files, frontmatter sections, optional Zod schema, optional custom check),
So that "verifier-before-promote" is reusable across all step types and project config can override per step.

**Acceptance Criteria:**

**Given** `src/verifiers/index.ts` with the verifier registry mapping step name to `VerifierConfig`
**When** a per-step config is registered (e.g., `src/verifiers/prd.ts`, `architecture.ts`, `story-create.ts`, `dev-story.ts`, `code-review.ts`, `retro.ts`, plus `default.ts` baseline)
**Then** the verifier object has `requiredFiles: string[]`, `requiredFrontmatterSections: string[]`, `schema: ZodSchema | null`, optional `custom?: (artifact) => Result<void, VerifierError>`
**Given** a sub-agent has produced an artifact at `staging/<run-id>/outputs/`
**When** `runVerifier(runId)` runs
**Then** it executes each check and writes `staging/<run-id>/verifier-result.json` (per AR17 + AR26 schema)
**Given** a check fails
**When** runVerifier completes
**Then** the result has `status: "fail"` with structured `checks[]` reporting which check failed and why
**And** custom checks are deterministic and stateless (no Claude API calls, no network)

### Story 2.2: Dispatch Spec Generator

As a Stepper user,
I want every dispatch to produce a typed `dispatch-spec.json` containing the 6-section task spec, model, budget, timeout,
So that the slash-command markdown can construct the Task invocation deterministically and the run is fully captured for audit.

**Acceptance Criteria:**

**Given** `src/dispatch/generate-spec.ts` with `buildDispatchSpec(stepName, state, persona, modelOverride?, budgetOverride?)`
**When** invoked for a known step
**Then** it writes to `staging/<run-id>/dispatch-spec.json` validated against `src/schemas/dispatch-spec.ts` containing: `runId`, `step`, `epic`, `story`, `phase`, `model` (default `sonnet`), `budget: { contextTokens: 60000, timeoutMs: 300000 }`, `taskSpec: { persona, context[], task, outputFormat, successCriteria[], constraints }`
**And** the staging directory tree is created: `staging/<run-id>/{inputs/, outputs/, dispatch-spec.json}`
**And** orphan staging dirs (older than 24h with no completion marker) are cleaned up at Stepper start (`src/dispatch/staging-cleanup.ts`)
**And** the schema is shared with the slash-command markdown which reads exactly one JSON line on `run.ts` stdout

### Story 2.3: Generic Sub-Agent (`bmad-step-runner.md`)

As a Stepper sub-agent,
I want a single generic step-runner agent definition under `agents/bmad-step-runner.md` that reads its dispatch spec from a staging path, executes the task, and writes outputs,
So that Layer 1 has one canonical Task target and no specialized agents are needed at v0.1.

**Acceptance Criteria:**

**Given** `agents/bmad-step-runner.md` with description matching "execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json"
**When** Layer 1 invokes Task with this agent
**Then** the sub-agent reads the dispatch spec, follows the 6-section contract (PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS), reads inputs from `staging/<run-id>/inputs/`, writes outputs to `staging/<run-id>/outputs/`, and returns
**And** the sub-agent never invokes Task itself, never calls Stepper's `bun run` directly, never writes outside its own `staging/<run-id>/`
**And** the agent file declares `allowed-tools: Read, Write, Edit, Grep, Bash`
**And** smoke test verifies a fixture dispatch produces an artifact at the declared output path

### Story 2.4: Lock-Free `run.ts` for `/bmad-next`

As a Stepper user,
I want `src/commands/next/run.ts` to be read-only and lock-free, emitting exactly one JSON line on stdout describing the next action,
So that the (5+ minute) sub-agent run does not hold the lock and the slash-command markdown can branch deterministically.

**Acceptance Criteria:**

**Given** `src/commands/next/run.ts` invoked via `bun run`
**When** zero-config invocation
**Then** it acquires NO lock, reads state, computes next step, builds dispatch spec, writes `staging/<run-id>/dispatch-spec.json`, and emits to stdout exactly one JSON line: `{ "action": "dispatch", "runId": "<id>", "agent": "bmad-step-runner", "exitCode": 0 }`
**Given** a `--list`, `--explain`, `--diff-state`, `--export-state`, or `--dry-run` flag
**When** invoked
**Then** the action is `"report"` with `message` field containing the human-readable output
**Given** a state-loading failure
**When** invoked
**Then** the action is `"halt"` with `exitCode > 0` and `message` containing the actionable hint
**And** the JSON-line shape is validated against `src/schemas/dispatch-protocol.ts`
**And** integration test asserts `run.ts` never writes outside `staging/`

### Story 2.5: Markdown Transcript + JSON Run Log Writers

As a Stepper user,
I want every step run to produce both a Git-friendly markdown transcript and a machine-readable JSON run log in `_bmad-output/.stepper/runs/`,
So that the audit trail is human-greppable and `--export-state`/`--diff-state`/telemetry have a stable data source.

**Acceptance Criteria:**

**Given** `src/transcript/write-step.ts` invoked at the end of `verify-and-advance.ts`
**When** writing a transcript
**Then** it produces `runs/<ts>-<step>.log` with sections `# Step <name> — <runId>`, `## Inputs`, `## Sub-agent prompt (6 sections)`, `## Sub-agent output (excerpt)`, `## Verifier result`, `## State delta`, `## Outcome` (per AR25)
**And** it produces a paired `runs/<ts>-<step>.json` validated against `src/schemas/run-log.ts` containing `schemaVersion`, `ts`, `runId`, `step`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `verifierResult`, `stateBefore`, `stateAfter`, `durationMs`, `tokensIn`, `tokensOut`, `errors[]` (per AR26)
**Given** transcript writes
**When** running during a loop
**Then** they are streamed to disk and have zero observable impact on main-thread latency (NFR-P4 — verified by long-run integration test)
**And** `<ts>` follows `YYYY-MM-DDTHH-mm-ss` UTC convention

### Story 2.6: `verify-and-advance.ts` with State-Hash Check

As a Stepper user,
I want the post-dispatch step (verifier + atomic promote + state advance) to acquire the lock and re-validate state-hash before commit,
So that TOCTOU between dispatch-time and verify-time cannot corrupt state.

**Acceptance Criteria:**

**Given** `src/commands/next/verify-and-advance.ts` invoked with `--run-id <id> --tokens-in <n> --tokens-out <n>`
**When** invoked
**Then** it acquires `state.yaml.lock`, reads `state.yaml`, computes a stable hash over `(lastSuccessfulStep, lastAttempted)`, and compares to the snapshot stored in `staging/<run-id>/dispatch-spec.json` at dispatch-time
**Given** the hashes match
**When** verifier passes
**Then** the artifact is promoted from `staging/<run-id>/outputs/` to its canonical location (atomic copy + atomic state.yaml update with `.bak` rotation), tokens are recorded into `runHistory[]`, lock is released in `finally`
**Given** the hashes mismatch
**When** verify-and-advance runs
**Then** it exits with `STATE_CHANGED_DURING_DISPATCH` (exit code 1) and the hint `Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state.`
**And** transcript + run log are written via Story 2.5 writers
**And** integration test exercises the TOCTOU mismatch path

### Story 2.7: Slash Command for `/bmad-next` (Layer 1 Markdown)

As a Stepper user,
I want `/bmad-next` to be a single slash command that orchestrates: Bash invoke `run.ts`, read JSON line, Task dispatch sub-agent, Bash invoke `verify-and-advance.ts`, print summary line,
So that typing `/bmad-next` does the full happy path without any manual copy-paste.

**Acceptance Criteria:**

**Given** `commands/bmad-next.md` with frontmatter `description`, `argumentHint: "<flags>"`, `allowedTools: ["Bash", "Task", "Read"]`
**When** the user types `/bmad-next` in Claude Code
**Then** the markdown body instructs Claude to: (1) `Bash: bun run src/commands/next/run.ts -- $ARGUMENTS`, (2) parse the single stdout JSON line, (3) if action=`dispatch` invoke `Task` against the agent named in the JSON line (`bmad-step-runner` from Story 2.3) passing the dispatch-spec path as the prompt, (4) capture Task's response token counts, (5) `Bash: bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>`, (6) print one summary line per FR18
**Given** action=`report` (read-only flag)
**When** user types
**Then** Claude prints the `message` field directly without dispatching anything
**Given** action=`halt`
**When** user types
**Then** Claude prints the actionable hint and exits
**And** tool restrictions in the markdown body declare: Bash limited to `bun run <plugin-root>/...`; Task limited to plugin-declared agents; no file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`

### Story 2.8: Smoke Test for `/bmad-next` Happy Path

As a Stepper maintainer,
I want a smoke test that validates Epic 2's end-to-end contract against a fixture BMAD project,
So that a regression in any of: dispatch-spec generation, sub-agent dispatch, verifier, promotion, state advance, or transcript writing is caught in CI.

**Acceptance Criteria:**

**Given** `tests/fixtures/minimal-bmad-project/` with a fresh `_bmad/`, no `state.yaml`, an empty `_bmad-output/`
**When** `bun test src/smoke/next.test.ts` runs in a tmpdir copy of the fixture
**Then** the test invokes `bun run src/commands/next/run.ts` (mocking the Task tool's response with a fixture artifact written to `staging/<run-id>/outputs/`), then `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in 100 --tokens-out 50`
**And** asserts: `state.yaml` is created with `lastSuccessfulStep` set to the expected step, the artifact is at its canonical location, `runs/<ts>-<step>.log` exists with the expected sections, `runs/<ts>-<step>.json` validates against the schema, no writes occurred outside the test tmpdir
**And** the smoke test runs on Linux + macOS in CI matrix (NFR-I5)

## Epic 3: Resume, Inspection & State Export

User can preview, explain, narrow, override, resume, inspect, and export — the transparency surface that makes Stepper trustable.

### Story 3.1: Record `last_attempted` / `last_failure_reason` on Halt

As a Stepper user,
I want every halt to record the last attempted step and failure reason atomically to `state.yaml`,
So that `--resume` always picks up cleanly and post-hoc analysis has the failure context.

**Acceptance Criteria:**

**Given** `src/state/save.ts` updates
**When** any command halts (verifier failure, sub-agent timeout, lock contention, stop-condition trigger)
**Then** `state.yaml` is atomically updated with `lastAttempted: { step, epic, story, attemptedAt }` and `lastFailureReason: { code, message, hint, runId }` (or `null` on clean exit)
**And** `lastSuccessfulStep` is cleared to point at the previous success (unchanged from before the failed attempt)
**Given** a successful step
**When** verify-and-advance commits
**Then** `lastSuccessfulStep` advances, `lastAttempted` clears, `lastFailureReason` clears
**And** integration test verifies the recording on each of: VERIFIER_FAILURE, BRANCH_SWITCH, BMAD_INCOMPATIBLE, TIMEOUT, BUDGET_EXCEEDED

### Story 3.2: `--resume` Flag

As a Stepper user (Halt Recovery journey),
I want `/bmad-next --resume` to re-attempt the last attempted step with cached failure context surfaced to the sub-agent,
So that I lose under 5 minutes from any halt.

**Acceptance Criteria:**

**Given** `state.yaml.lastAttempted` is set and `lastFailureReason.code` is recoverable (not `BMAD_INCOMPATIBLE` or `BMAD_NOT_INSTALLED`)
**When** `/bmad-next --resume` is invoked
**Then** Stepper re-dispatches the last attempted step with the failure context included in the dispatch-spec's CONTEXT section (artifact excerpt + verifier failure detail)
**Given** `state.yaml.lastAttempted` is null (no halt to resume from)
**When** `--resume` is invoked
**Then** Stepper exits with `CONFIG_ERROR` (exit code 2) and the hint `No prior halt to resume from. Run /bmad-next to advance to the next step.`
**Given** `--resume` is combined with `--skip <step>`
**When** invoked
**Then** Stepper marks the attempted step as skipped in state and advances to the next (deferred to Epic 5 Story 5.2; this story rejects `--skip` here as not yet implemented)

### Story 3.3: `--dry-run` Flag

As a Stepper user,
I want `/bmad-next --dry-run` to print "what would happen" without writing anything to disk or dispatching a sub-agent,
So that I can preview before committing tokens.

**Acceptance Criteria:**

**Given** any `/bmad-next` flag combination plus `--dry-run`
**When** invoked
**Then** Stepper computes the next step, builds (in memory) what the dispatch spec would look like, but does NOT create `staging/<run-id>/`, does NOT write `state.yaml.tmp`, does NOT acquire the lock, and emits a JSON-line action `"report"` with a human-readable preview message
**And** the preview includes: target step, persona resolution path, model, budget, expected output path
**And** integration test verifies no filesystem writes occur during dry-run

### Story 3.4: `--step <id>` and Scope Flags

As a Stepper user,
I want `--step`, `--epic`, `--story`, `--phase` to override or narrow the computed next step,
So that I can manually point Stepper at a specific work item.

**Acceptance Criteria:**

**Given** `--step <name>` is supplied
**When** Stepper runs
**Then** the named step is dispatched if its preconditions are met; otherwise Stepper exits with `CONFIG_ERROR` describing the unmet preconditions and the hint `Run /bmad-next --explain to see why <step> is blocked.`
**Given** `--epic <n>`, `--story <x.y>`, or `--phase <name>` flags
**When** Stepper computes
**Then** candidate steps are filtered to those matching the scope; the highest-priority unblocked candidate is selected
**And** combining `--epic` and `--story` or `--phase` is allowed; combining `--step` with any scope flag prints a warning that scope is ignored when `--step` is explicit

### Story 3.5: `--persona` Override + `--include-optional`/`--no-optional`

As a Stepper user,
I want `--persona` to override the resolved persona for one run and `--include-optional`/`--no-optional` to toggle whether optional steps are candidates,
So that I can route a step through a non-default persona or skip soft-optional steps.

**Acceptance Criteria:**

**Given** `--persona <name>` is supplied
**When** dispatching
**Then** the dispatch-spec's PERSONA field uses the supplied name, bypassing the 4-tier resolution
**Given** `--no-optional` is supplied
**When** computing next step
**Then** steps with `optional: true` in the DAG are excluded from candidates
**Given** `--include-optional` is supplied
**When** computing
**Then** optional steps are included with normal priority
**Given** neither flag is supplied
**When** computing
**Then** the project-config `failurePolicies` and `personas` defaults apply (no toggle)

### Story 3.6: `--explain` Reasoning Trace

As a Stepper user (Cold-Start Return journey),
I want `/bmad-next --explain` to print why the chosen step is next,
So that I have zero recall, zero scrollback, and instant context after returning to a project.

**Acceptance Criteria:**

**Given** Stepper has computed the next step
**When** `--explain` is supplied
**Then** the JSON-line action is `"report"` with `message` containing: target step name, the chain of completed predecessors, the unmet preconditions for alternative candidates (sorted by which are closest to ready), the resolved persona, and a one-sentence reasoning summary in the format from PRD Journey 1
**Given** there is no next step (all done)
**When** `--explain` runs
**Then** the message reads `All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.`
**And** the explain output is human-greppable (not JSON-only) — diagnostics on stderr per FR54

### Story 3.7: `--list` Candidate Next Steps

As a Stepper user,
I want `/bmad-next --list` to show every candidate next step with its preconditions,
So that I can see the full decision space at a glance.

**Acceptance Criteria:**

**Given** Stepper has built the DAG
**When** `--list` is supplied
**Then** the JSON-line action is `"report"` with `message` listing each candidate as `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`, sorted by phase order then name
**And** the topological tiebreaker is consistent across runs (reproducible output)
**And** for projects with 100 epics × 1000 stories, the list emits within 1 second (NFR-Sc1, NFR-P1)

### Story 3.8: `--diff-state` and `--export-state`

As a Stepper user (CI Export journey),
I want `--diff-state` to report cache-vs-files divergence and `--export-state` to emit machine-readable state JSON,
So that drift never goes silent and CI scripts can read state without holding the lock.

**Acceptance Criteria:**

**Given** `src/state/diff.ts` invoked
**When** `--diff-state` runs
**Then** it loads `state.yaml`, runs `recomputeState()` to produce the would-be-recomputed shape, computes the diff, and emits a human-readable report listing every divergence (e.g., `lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2`)
**Given** `src/state/export.ts` invoked
**When** `--export-state` runs
**Then** it emits valid JSON to stdout (NEVER to stderr — FR54) containing `currentPhase`, `activeEpic`, `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`, `bmadVersion`, `stepperVersion`, schema-versioned via Zod
**And** running these flags does NOT acquire the project lock (FR52)
**And** integration test asserts `--export-state | jq '.currentPhase'` works without the lock

### Story 3.9: `--watch` Live Transcript Tail

As a Stepper user,
I want `/bmad-next --watch` to tail the most recent transcript log,
So that I can monitor a long-running step or loop without `tail -f`.

**Acceptance Criteria:**

**Given** `src/transcript/watch.ts` finds the most recent `runs/<ts>-<step>.log`
**When** `--watch` is supplied
**Then** the file is tailed (line-by-line stream) until SIGINT
**Given** there are no run logs yet (fresh project)
**When** `--watch` runs
**Then** it prints `No run logs yet. Start a step with /bmad-next.` and exits 0
**And** tail uses Bun's stream APIs (no external `tail` dep)

### Story 3.10: Non-Locking Read Flags

As a Stepper user,
I want `--export-state`, `--list`, `--explain`, `--dry-run`, and `--diff-state` to skip lock acquisition,
So that CI scripts can run them concurrently with active Stepper invocations.

**Acceptance Criteria:**

**Given** `src/io/lock.ts` updated to support a `skipAcquire: boolean` flag
**When** any of the five read-only flags is supplied
**Then** lock acquisition is skipped and the command runs in pure-read mode
**Given** an active Stepper invocation holds the lock
**When** a CI script runs `--export-state`
**Then** it succeeds without `LOCK_CONTENTION`
**And** integration test runs concurrent active + read-only invocations and asserts both succeed
**And** all read-only flags map to action=`report` with no state mutation

## Epic 4: Bounded Loop with Eight Stop Conditions

User runs `/bmad-loop` overnight. 8 stop-condition types, `--plan-first`, `--checkpoint-each`, budgets, SIGINT graceful exit, default cap, exit reason + resume hint.

### Story 4.1: `/bmad-loop` Command Skeleton

As a Stepper user,
I want `/bmad-loop` as a slash command with its argument schema and runner skeleton,
So that the loop infrastructure is in place before stop conditions are added.

**Acceptance Criteria:**

**Given** `src/commands/loop/{args,run,index}.ts` and `commands/bmad-loop.md`
**When** `/bmad-loop --max-iters 1` is invoked
**Then** the loop runs exactly one iteration of the `/bmad-next` happy path and exits cleanly with exit reason `max-iters reached`
**And** `LoopArgsSchema` Zod-validates: `untilEpicEnd?`, `untilStory?`, `nextStory?`, `phaseEnd?`, `maxIters?`, `timeBudgetMs?`, `tokenBudget?`, `stopOnError?`, `continueOnError?`, `interactive?`, `autoFix?`, `planFirst?`, `checkpointEach?`
**And** the markdown body follows AR34 (Bash → JSON line read → Task → Bash verify-and-advance) but in a loop with iteration counter

### Story 4.2: Stop-Condition: `epic-end` and `story-X-Y`

As a Stepper user,
I want `--until-epic-end` and `--until-story <x.y>` to halt the loop on epic boundary or specific story completion,
So that I can scope an overnight run to one epic or one story.

**Acceptance Criteria:**

**Given** `--until-epic-end` is supplied
**When** the loop completes a step that's the last in the current epic phase (story shipped + retro filed if applicable)
**Then** the loop exits with reason `epic-end reached` and prints state-snapshot pointer + `--resume` hint
**Given** `--until-story 3.2` is supplied
**When** the loop completes a step in story 3.2 OR begins a step in a story past 3.2
**Then** the loop exits with reason `story 3.2 reached`
**And** `src/commands/loop/stop-conditions.ts` exports each stop-condition as a pure function `(state, dag) => boolean`

### Story 4.3: Stop-Condition: `next-story` and `phase-end`

As a Stepper user,
I want `--next-story` and `--phase-end` to halt at the next story boundary or phase transition,
So that I can chain partial work without committing to a full epic.

**Acceptance Criteria:**

**Given** `--next-story` is supplied
**When** the loop completes a step and the next computed step belongs to a different story
**Then** the loop exits with reason `next-story boundary reached`
**Given** `--phase-end` is supplied
**When** the next computed step is in a different BMAD phase than the current
**Then** the loop exits with reason `phase-end (transition <from>→<to>) reached`
**And** integration test covers all four stop conditions from this story + 4.2

### Story 4.4: Stop-Condition: `max-iters` and Default Cap

As a Stepper user,
I want `--max-iters N` to cap iteration count and `--max-iters=50` to apply by default when no other condition is supplied,
So that accidental infinite loops are impossible.

**Acceptance Criteria:**

**Given** no stop condition is supplied
**When** `/bmad-loop` is invoked
**Then** `--max-iters=50` is enforced as default (FR25)
**Given** `--max-iters 10` is supplied
**When** the loop reaches 10 iterations
**Then** the loop exits with reason `max-iters (10) reached`
**Given** another stop condition (e.g., `--until-epic-end`) is supplied without `--max-iters`
**When** the loop runs
**Then** no default cap is applied (the explicit condition controls)
**And** integration test verifies the 50-default and the explicit-overrides-default behavior

### Story 4.5: Stop-Condition: `time-budget` and `token-budget`

As a Stepper user,
I want `--time-budget <ms>` and `--token-budget <tokens>` to halt the loop when wall-clock or API-token budgets are exhausted,
So that overnight runs have a hard ceiling.

**Acceptance Criteria:**

**Given** `--time-budget 7200000` (2 hours) is supplied
**When** elapsed wall-clock time approaches the budget
**Then** at 80% the loop emits a stderr warning, at 100% the loop halts cleanly with reason `time-budget (2h) reached, partial work committed`
**Given** `--token-budget 200000` is supplied
**When** the cumulative `tokensIn + tokensOut` (read from each `verify-and-advance.ts` invocation per AR10) approaches the budget
**Then** at 80% a warning is emitted, at 100% the loop halts
**And** the exit reason includes the actual usage stats

### Story 4.6: Stop-Condition: `error` (with `--stop-on-error` / `--continue-on-error`)

As a Stepper user,
I want first verifier failure to halt the loop by default and `--continue-on-error` to opt into continuation,
So that bad steps don't pollute downstream work without my consent.

**Acceptance Criteria:**

**Given** the default policy `--stop-on-error`
**When** any verifier returns `status: "fail"` and the per-step failure-policy resolves to `escalate`
**Then** the loop exits with reason `error (verifier failure on <step>) — see <run-log-path>` and the standard halt+resume hint
**Given** `--continue-on-error` is supplied
**When** a verifier failure occurs
**Then** the failure is logged but the loop continues; integration test asserts subsequent iterations still run
**And** when full failure-UX modes ship in Epic 5, `--continue-on-error` interacts correctly with per-step `retry`/`skip`/`route-to-fixer` policies

### Story 4.7: `--plan-first` Dry-Run Preview

As a Stepper user (overnight loop pattern),
I want `/bmad-loop --plan-first` to preview the planned step sequence before committing tokens,
So that I never start an unattended run on a wrong assumption.

**Acceptance Criteria:**

**Given** `--plan-first` is supplied
**When** the loop is invoked
**Then** Stepper computes the planned sequence of steps until the first declared stop condition would fire (best-effort, since failures may divert), emits a JSON-line action `"report"` with the human-readable plan, and exits 0 without dispatching anything
**And** the plan output includes: total estimated steps, total estimated tokens (using `models:` config + per-step budgets), checkpoints (if `--checkpoint-each` is supplied)
**And** the plan output is reproducible across invocations on the same state

### Story 4.8: `--checkpoint-each <step-type>`

As a Stepper user,
I want `--checkpoint-each implementation` to force a Git branch+sha + `.bak` snapshot after every step of the named type,
So that I have explicit recovery points before each implementation step.

**Acceptance Criteria:**

**Given** `--checkpoint-each implementation` is supplied
**When** the loop completes a step whose phase or type matches `implementation`
**Then** `state.yaml.checkpoints[]` is appended with `{ branch, sha, takenAt, stepType: "implementation" }` (FIFO-evicted at 50 entries — AR13)
**And** `.bak` of `state.yaml` is rotated and a Git branch+sha is captured per AR13 Layer 1
**And** the step type can be any of: `analysis`, `planning`, `solutioning`, `implementation`, `retro`

### Story 4.9: SIGINT Graceful Exit

As a Stepper user,
I want SIGINT (Ctrl-C) on a running loop to allow the in-flight sub-agent to finish its current write, then halt cleanly within 30 seconds,
So that I never lose partial work to an interrupt.

**Acceptance Criteria:**

**Given** a `/bmad-loop` run with an in-flight sub-agent dispatch
**When** the user sends SIGINT (Ctrl-C)
**Then** the loop runner sets a `shutdownRequested` flag, lets the in-flight Task return, then halts before the next iteration
**And** the total time from SIGINT to clean exit is under 30 seconds (NFR-R5 — verified by integration test)
**And** the exit reason is `manual (SIGINT) — partial work committed; --resume available`
**Given** SIGINT is sent before any iteration starts
**When** the loop runner is still in setup
**Then** clean exit happens immediately

### Story 4.10: Loop Exit-Reason + Resume Hint

As a Stepper user,
I want every loop exit (any stop condition or graceful halt) to emit a human-readable exit reason, state-snapshot pointer, and `--resume` invocation hint,
So that the next interaction is always one command away.

**Acceptance Criteria:**

**Given** any of the eight stop conditions or graceful exit fires
**When** the loop exits
**Then** the last main-thread output is one or two lines: `Loop exited: <reason>. Snapshot: <state.yaml.lastSnapshot.sha>. Resume: /bmad-next --resume.`
**And** the exit also writes the reason and snapshot to a final transcript log entry under `runs/`
**And** integration test validates output format across all eight stop conditions × happy-path and SIGINT

## Epic 5: Failure-UX Modes & Auto-Fix

Four recovery modes (retry / skip / route-to-fixer / escalate). User-surface flags `--auto-fix`, `--skip`, `--interactive`. Per-step policy via config. Errors-as-primary-UX.

### Story 5.1: Retry Failure Mode

As a Stepper user,
I want a per-step `retry` failure mode with configurable max attempts (default 2),
So that flaky verifier outcomes don't escalate immediately.

**Acceptance Criteria:**

**Given** `src/failure-ux/{index,retry}.ts` and the per-step policy registry
**When** a step's policy resolves to `retry` and the verifier fails
**Then** the same dispatch spec is re-run up to `maxRetries` times (default 2); after the cap, the policy escalates to `escalate`
**And** retry attempts are recorded into `runHistory[]` with attempt-number metadata; telemetry counts retries per step (Epic 6 dependency)
**Given** `failurePolicies: { dev-story: retry }` in config
**When** dev-story verifier fails
**Then** retry happens once, twice, then escalates with the original failure reason

### Story 5.2: Skip Failure Mode + `--skip` Flag

As a Stepper user,
I want `/bmad-next --skip <step> --resume` to mark the failing step as skipped and advance,
So that one persistently-failing step doesn't block forward progress.

**Acceptance Criteria:**

**Given** `state.yaml.lastAttempted.step` matches the skipped step
**When** `/bmad-next --skip <step> --resume` runs
**Then** state is updated with `runHistory[].skipped: true` for the matched step; lastSuccessfulStep advances to the next step in topological order; lastAttempted clears
**Given** `--skip` is given alone (no `--resume`)
**When** invoked
**Then** Stepper exits 2 with the hint `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.`
**And** the skipped step is recorded to telemetry as a skip-event (Epic 6 dependency)

### Story 5.3: Route-to-Fixer Mode + `--auto-fix` Flag

As a Stepper user,
I want `--auto-fix` to dispatch a fixer sub-agent (`agents/bmad-step-fixer.md`) on verifier failure, then re-run the original verifier,
So that obvious mistakes get auto-corrected without manual intervention.

**Acceptance Criteria:**

**Given** `agents/bmad-step-fixer.md` declared with description matching "remediate a BMAD step artifact based on a verifier failure"
**When** the per-step policy resolves to `route-to-fixer` (or `--auto-fix` is supplied)
**Then** the fixer sub-agent is dispatched with the failure context (verifier result + artifact excerpt) in its CONTEXT section, writes a corrected artifact to a fresh `staging/<run-id>-fix/outputs/`, and the original verifier re-runs
**Given** the fixer's output passes the verifier
**When** verify-and-advance commits
**Then** the corrected artifact is promoted; `runHistory[]` records the fix attempt
**Given** the fixer's output fails the verifier
**When** verify-and-advance runs
**Then** the policy escalates to `escalate` with both failures recorded

### Story 5.4: Escalate Failure Mode

As a Stepper user,
I want `escalate` (the default policy) to halt with an actionable error, set `lastFailureReason`, and surface `--resume` as the recovery path,
So that hard failures never get silently dropped or auto-retried into bad state.

**Acceptance Criteria:**

**Given** the per-step policy resolves to `escalate` (or no other policy applies)
**When** any failure occurs (verifier failure, sub-agent timeout, dispatch error)
**Then** Stepper exits 1 with `VERIFIER_FAILURE` (or the appropriate code), the actionable hint includes the run-log path and `--resume` invocation, `lastFailureReason` is recorded
**And** no stack trace appears on the main thread (NFR-M2 — full detail in run log)
**And** integration test asserts the actionable-hint regex `/^.*(Run|See|Try|Check) /` for every escalate path

### Story 5.5: `--interactive` Pause Between Steps

As a Stepper user,
I want `/bmad-loop --interactive` to pause and prompt before each step,
So that I can supervise a loop step-by-step without unleashing it fully.

**Acceptance Criteria:**

**Given** `--interactive` is supplied to `/bmad-loop`
**When** each iteration is about to dispatch
**Then** Stepper emits a JSON-line action `"report"` with the planned step and a prompt `Continue? [y/N]`; the slash-command markdown waits for user input on the main thread before the next iteration
**Given** the user responds `y`
**When** input is received
**Then** the iteration proceeds normally
**Given** the user responds `N` or anything else
**When** input is received
**Then** the loop exits cleanly with reason `manual (interactive halt) — --resume available`
**And** SIGINT during an interactive prompt also exits cleanly

### Story 5.6: Per-Step Failure Policy via Config + Actionable Errors

As a Stepper user,
I want `bmad-stepper.config.yaml` `failurePolicies:` map to declare per-step failure modes and every error to follow the single-line + full-detail pattern,
So that policies are project-customizable and errors-as-primary-UX is enforced everywhere.

**Acceptance Criteria:**

**Given** `bmad-stepper.config.yaml` with `failurePolicies: { dev-story: retry, code-review: route-to-fixer }`
**When** Stepper resolves the per-step policy
**Then** the configured policy applies; absent steps fall back to plugin default `escalate`
**And** loop-level `--auto-fix` overrides per-step policy to `route-to-fixer` for one run
**Given** every error class
**When** thrown
**Then** the main-thread output is exactly one line ending with a concrete next-action verb (regex `/^.*(Run|See|Try|Check) /` in the hint), and the full detail (stack trace if any, raw failure context) is in the run log only (FR32, FR46, NFR-M2)
**And** errors-registry CI gate (Story 1.2) covers all new codes added in Epic 5

## Epic 6: Configuration, Telemetry & Release Readiness

User customizes via YAML config. Opt-in telemetry produces dogfood-validation data. `--upgrade` checks GH Releases. Auto-archival. v0.1.0 ships to marketplace with full repo files + CI workflows.

### Story 6.1: `bmad-stepper.config.yaml` Schema + Loader

As a Stepper user,
I want a project-level YAML config validated by Zod and resolved against user-level config + plugin defaults,
So that every customization surface (personas, models, budgets, verifiers, overrides, paths, telemetry) is one place.

**Acceptance Criteria:**

**Given** `src/schemas/config.ts` with `ConfigV1Schema` exposing top-level keys: `schemaVersion`, `personas`, `overrides`, `verifiers`, `failurePolicies`, `models`, `budgets`, `paths`, `telemetry: { enabled: boolean }`
**When** `loadConfig()` runs
**Then** it loads project (`bmad-stepper.config.yaml`), then user (`~/.config/bmad-stepper/config.yaml`), then plugin defaults; resolution rule: project > user > defaults; result is validated and migrated via `loadAndMigrate`
**Given** invalid config (Zod error)
**When** loading
**Then** Stepper exits 2 with `CONFIG_ERROR` and a single-line Zod-derived hint pointing at the offending field
**And** `docs/configuration.md` documents every key with examples

### Story 6.2: DAG `overrides:` Block

As a Stepper user (BMAD Upgrade journey),
I want `overrides:` in config to take priority over the seed DAG,
So that new BMAD upstream skills work the day they're released without waiting for a Stepper update.

**Acceptance Criteria:**

**Given** `overrides: { architecture-validator: { phase: solutioning, after: [architecture], optional: true } }`
**When** the DAG builder runs Tier 2
**Then** the override entry is placed at the declared phase with the declared edges and replaces any seed entry of the same name
**Given** an override declares an unknown predecessor
**When** the DAG builder validates
**Then** it surfaces `CONFIG_ERROR` with hint pointing at the offending edge
**And** the override Zod schema is in `src/schemas/config.ts` (sub-schema)

### Story 6.3: `models:` Per-Step Config

As a Stepper user,
I want `models: { code-review: opus, dev-story: sonnet }` to pin specific Claude models per step,
So that I can route expensive analysis to Opus and bulk implementation to Sonnet.

**Acceptance Criteria:**

**Given** `models:` config block
**When** dispatch-spec is generated
**Then** the dispatch-spec.json's `model` field is the configured value; default is `sonnet` if not configured
**And** the dispatch-spec consumer (slash-command markdown) passes the model parameter through to the Task tool (where supported)
**And** Stepper logs the model on dispatch line so the user can audit which model handled each step

### Story 6.4: `budgets:` Per-Step Config

As a Stepper user,
I want `budgets: { dev-story: { contextTokens: 80000, timeoutMs: 600000 } }` to override default budget+timeout per step,
So that complex steps get more headroom and simple ones get tighter limits.

**Acceptance Criteria:**

**Given** `budgets:` config block
**When** dispatch-spec is generated for a configured step
**Then** the spec's `budget.contextTokens` and `budget.timeoutMs` use the configured values; otherwise defaults are 60000 / 300000
**And** the verifier uses these budgets to time out long-running sub-agent calls (TIMEOUT error)
**And** budget changes are surfaced in the transcript log for audit

### Story 6.5: `verifiers:` Per-Step Config Override

As a Stepper user,
I want `verifiers: { story-create: { requiredFrontmatterSections: [..., status, owner] } }` to extend the per-step verifier config,
So that I can tighten requirements for my project without forking the plugin.

**Acceptance Criteria:**

**Given** `verifiers:` config block
**When** the verifier registry resolves a config for a step
**Then** the project-config required sections are merged with (or replace, depending on declared mode) the plugin defaults; project overrides win
**And** custom checks remain plugin-side (no user-supplied custom code per AR17 — security)
**And** a config-supplied verifier mismatch (e.g., reference to a non-existent Zod schema) surfaces `CONFIG_ERROR` early

### Story 6.6: Telemetry Opt-In Collection

As a Stepper maintainer (dogfood-validation),
I want opt-in telemetry to write a JSONL record per step run with a closed-set field whitelist (no PII enforcement),
So that I have a data source for the 60-day decision and the user can never accidentally leak source content.

**Acceptance Criteria:**

**Given** `telemetry: { enabled: true }` in config
**When** every step completes (success or failure)
**Then** `src/telemetry/collect.ts` writes one JSONL line to `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl` validated against `TelemetryRecordV1Schema` (closed set: `schemaVersion, ts, step, phase, persona, model, durationMs, verifierStatus, retries, tokensIn, tokensOut, errorCode?`)
**Given** any field outside the whitelist
**When** writing
**Then** Zod validation fails (NFR-S3 enforcement); CI test verifies a malformed record is rejected
**Given** `telemetry.enabled` is false (default)
**When** steps complete
**Then** no telemetry files are written

### Story 6.7: Telemetry Aggregation Report

As a Stepper user,
I want `bun run aggregate-telemetry --period 2026-04` to produce a human-readable monthly markdown report,
So that the dogfood-validation signal is grep-friendly and shareable in retrospectives.

**Acceptance Criteria:**

**Given** `telemetry/<period>.jsonl` files exist for the period
**When** `src/telemetry/aggregate.ts` runs
**Then** it reads the JSONL records, computes per-step aggregates (count, mean/p95 duration, retry rate, verifier failure rate, mean tokens), and writes `telemetry/<period>.md` with a structured human-readable report
**And** generation completes within 2 seconds for one week of run logs (NFR-P6)
**And** the report contains no PII / no source content (asserted by integration test)

### Story 6.8: Auto-Archival of Runs and Telemetry

As a Stepper user,
I want run logs older than 90 days auto-archived and telemetry older than 12 months auto-rotated on Stepper start,
So that the active directories don't grow unbounded.

**Acceptance Criteria:**

**Given** `_bmad-output/.stepper/runs/` contains files older than 90 days
**When** Stepper starts (any command)
**Then** `src/transcript/archive.ts` moves matching files to `runs/.archive/<YYYY-MM>/` (per NFR-Sc4)
**Given** `telemetry/<period>.jsonl` and `<period>.md` are older than 12 months
**When** Stepper starts (and `telemetry.enabled` is true)
**Then** `src/telemetry/rotate.ts` moves them to `telemetry/.archive/` (per NFR-Sc5)
**And** archival is idempotent (running twice in a row is a no-op)
**And** archival never blocks the user's command — runs in the background with a one-line audit notice on first invocation per session

### Story 6.9: `--upgrade` Flow

As a Stepper user,
I want `/bmad-next --upgrade` to call the GitHub Releases API, compare current vs latest version, print a CHANGELOG diff with BMAD compatibility info, and never auto-install,
So that I stay in control while always knowing whether an update is available.

**Acceptance Criteria:**

**Given** `src/upgrade/check.ts` invoked
**When** `--upgrade` runs
**Then** it calls `Bun.fetch("https://api.github.com/repos/tgorka/bmad-stepper/releases/latest")` (NFR-S1 exception — the only main-thread network I/O permitted), reads `currentVersion` from `.claude-plugin/plugin.json`, compares; if newer is available, prints version diff + CHANGELOG link + BMAD compat for latest + the hint `Run /plugin marketplace update tgorka/bmad-stepper to upgrade.`
**And** Stepper never writes to `~/.claude/plugins/` from this code path (NFR-S2)
**Given** the API call fails (offline, rate limit)
**When** `--upgrade` runs
**Then** Stepper exits 1 with the hint `Could not reach GitHub Releases. Check your network or try again later.`

### Story 6.10: Repo Files & v0.1.0 Marketplace Release

As a community user discovering Stepper,
I want a complete OSS-ready repository (README, CHANGELOG, AGENTS.md, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE, examples, dependabot, weekly bmad-compat CI) and a v0.1.0 release on the Claude Code marketplace,
So that the product is shippable and contributable on day one.

**Acceptance Criteria:**

**Given** repo deliverables per AR38, AR39, AR40
**When** v0.1.0 is tagged
**Then** the repo contains: `README.md` (with Quick Start NFR-M4), `CHANGELOG.md` (Changesets-managed with the *BMAD Compatibility — v6.5.x* section), `AGENTS.md` (contributor + sub-agent contract), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE` (MIT), `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/{bug,feature,bmad-compat}.md`, `.github/dependabot.yml`
**And** `docs/examples/` ships the seven worked examples (cold-start return, single-step, overnight loop, halt recovery, skip-on-failure, doctor diagnostic, state export for CI) plus `examples/scripting/{ci-state-check.sh, nightly-loop.sh}`
**And** three CI workflows are green: `.github/workflows/ci.yml` (matrix Linux+macOS, `bun test` + `biome ci`), `release.yml` (Changesets PR-based release flow), `bmad-compat.yml` (weekly check vs latest BMAD upstream)
**And** the plugin is published to the Claude Code marketplace at `tgorka/bmad-stepper` (FR47); the dogfood-validation 30-day clock starts on this release


