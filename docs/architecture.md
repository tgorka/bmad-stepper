# Architecture

High-level architecture reference for contributors. Read this alongside
[`AGENTS.md`](../AGENTS.md), which carries the detailed sub-agent dispatch contract
and code-quality gates. The planning source lives at
`_bmad-output/planning-artifacts/architecture.md`; this document mirrors the
portions most relevant to day-to-day contribution.

## Overview

BMAD Stepper is a **stacked dispatch loop**: it reads the BMAD skill DAG, picks the
next ready step, dispatches a sub-agent to execute it, verifies the output, and
advances the project state — one verifiable step at a time.

The orchestration is split across three layers:

- **Layer 1 — Claude Code main thread** (`commands/*.md`): slash-command markdown
  files. Calls into Layer 2 via `Bash`, dispatches into Layer 3 via the `Task` tool.
  Never does direct file I/O.
- **Layer 2 — Bun TypeScript core** (`src/**/*.ts`): the step-runner logic,
  state machine, DAG builder, verifiers, config loader, and everything that touches
  the filesystem. Never calls `Task` or orchestrates sub-agents.
- **Layer 3 — BMAD sub-agents** (`agents/*.md` body): isolated, file-in/file-out
  workers that execute a single BMAD skill. Never decide what comes next; never
  validate their own output; never interact with the user.

## Key data flow

```
/bmad-next (slash command, Layer 1)
  │
  ├─ Bash: bun run src/commands/next/run.ts -- <flags>
  │        └─ reads state.yaml (lock-free)
  │           builds DAG (three-tier resolver)
  │           selects next ready step
  │           builds dispatch-spec.json in staging/<run-id>/
  │           emits ONE AR9 JSON line on stdout:
  │             { action: "dispatch", runId, agent, step, ... }
  │
  ├─ Layer 1 reads the AR9 JSON line
  │
  ├─ Task tool → Layer 3 sub-agent (agents/bmad-step-runner.md)
  │              reads staging/<run-id>/dispatch-spec.json
  │              writes artifact to staging/<run-id>/<artifact>
  │
  └─ Bash: bun run src/commands/next/verify-and-advance.ts -- <run-id>
           └─ ACQUIRES lock (_bmad-output/.stepper/state.yaml.lock/)
              runs verifier against staging/<run-id>/<artifact>
              on pass: promotes artifact, advances state.yaml, writes run log
              on fail: applies failure policy (retry / skip / route-to-fixer / escalate)
              RELEASES lock
              emits ONE AR9 JSON line on stdout:
                { action: "advance" | "halt" | "skip", ... }
```

The `/bmad-loop` command repeats this cycle with a configurable stop-condition
budget (step count, wall-clock time, error threshold, phase boundary, etc.).

## Four-tier module boundary system (AR41)

Layer 2 modules are organized into four dependency tiers. **Upward imports are
forbidden** — the integration test `src/integration/no-write-outside-scope.test.ts`
enforces the write-scope constraint, and code review enforces the import graph per
this document.

### Foundational tier (no upward imports)

| Module | Purpose |
|--------|---------|
| `src/errors.ts` | `StepperError` base class + 17 concrete subclasses + error registry |
| `src/schemas/` | Zod schemas for all data contracts (dispatch protocol, state, config, telemetry) |
| `src/io/` | `log.ts` (stderr info/warn/error), `json.ts` (AR9 stdout line), `paths.ts` (`assertWithinScope`) |

### Mid-tier (depend only on foundational)

| Module | Purpose |
|--------|---------|
| `src/bmad-detect/` | `detectBmadVersion` + `detectBmadSkills` — reads BMAD plugin manifest under `~/.claude/plugins/bmad-method-*/` |
| `src/dag/` | Three-tier DAG builder (seed → overrides → frontmatter) + Tarjan SCC cycle detection |
| `src/state/` | `loadState` / `loadStateUnlocked` / `saveState` — atomic `state.yaml` read-write + `.bak` rotation |
| `src/lock/` | mkdir-based file lock acquire/release around `_bmad-output/.stepper/state.yaml.lock/` |
| `src/config/` | Three-layer config loader (project → user → defaults) via `loadConfig()` |
| `src/migrations/` | Per-family schema migration registry for state and config forward-compat |
| `src/personas/` | Persona resolver — maps step names to BMAD persona identifiers |
| `src/transcript/` | Markdown + JSON run-log writer (`src/runs/`) |
| `src/telemetry/` | Opt-in JSONL telemetry writer + monthly aggregation report |
| `src/upgrade/` | GitHub Releases API check — the ONLY main-thread network I/O in the codebase |
| `src/runs/` | Run log writer + markdown transcript renderer + 90-day archival |
| `src/startup/` | Session-once archival trigger; SIGINT graceful-exit handler |
| `src/snapshot/` | State snapshot for branch-switch detection |
| `src/failure-ux/` | Four failure-mode policy executor (retry / skip / route-to-fixer / escalate) |

### Higher-tier (depend on foundational + mid-tier)

| Module | Purpose |
|--------|---------|
| `src/verifiers/` | Per-step verifier registry + file/frontmatter checkers |
| `src/dispatch/` | Dispatch-spec builder (`buildDispatchSpec`) — produces `dispatch-spec.json` in staging |

### Top-tier (depend on everything below)

| Module | Purpose |
|--------|---------|
| `src/commands/next/` | `/bmad-next` runner: `run.ts` (lock-free) + `verify-and-advance.ts` (locked) |
| `src/commands/loop/` | `/bmad-loop` runner: `run.ts` + stop-condition evaluator |
| `src/commands/doctor/` | `/bmad-doctor` / `--doctor` diagnostic: BMAD detect + DAG validate + state check |

## Directory structure

```
bmad-stepper/
├── .claude-plugin/
│   ├── marketplace.json         Marketplace manifest — lists the bmad-stepper plugin
│   └── plugin.json              Plugin manifest — version, slash commands
├── .github/
│   ├── workflows/
│   │   ├── ci.yml               Matrix CI (Linux + macOS, bun test + biome)
│   │   ├── bmad-compat.yml      Weekly BMAD upstream compatibility check
│   │   └── release.yml          Changesets-based release automation
│   └── ISSUE_TEMPLATE/          Bug, feature, bmad-compat issue templates
├── agents/
│   ├── bmad-step-runner.md      Layer 3 sub-agent — executes a BMAD skill
│   └── bmad-step-fixer.md       Layer 3 sub-agent — repairs a failed artifact
├── commands/
│   ├── bmad-next.md             Layer 1 slash command — single-step advance
│   ├── bmad-loop.md             Layer 1 slash command — bounded loop
│   └── bmad-doctor.md           Layer 1 slash command — diagnostic alias
├── docs/
│   ├── getting-started.md       Onboarding + prerequisites + troubleshooting
│   ├── exit-codes.md            FR53 exit-code catalog with verbatim hints
│   ├── configuration.md         bmad-stepper.config.yaml schema reference
│   ├── bmad-compatibility.md    Per-release BMAD compat history (this project)
│   ├── architecture.md          This file
│   └── examples/                Seven worked examples
├── src/
│   ├── errors.ts                StepperError hierarchy + 17-code registry
│   ├── schemas/                 Zod schemas (state, config, dispatch, telemetry)
│   ├── io/                      Logging + AR9 JSON stdout + scope assertion
│   ├── bmad-detect/             BMAD plugin version + skill detector
│   ├── dag/                     Three-tier DAG builder + Tarjan SCC
│   ├── state/                   state.yaml atomic reader/writer
│   ├── lock/                    mkdir-based file lock
│   ├── config/                  Three-layer config loader
│   ├── migrations/              State + config schema migration registry
│   ├── personas/                BMAD persona resolver
│   ├── transcript/              Markdown + JSON run-log writer
│   ├── telemetry/               Opt-in JSONL telemetry + aggregation report
│   ├── upgrade/                 GitHub Releases API check (only network path)
│   ├── runs/                    Run log writer + 90-day archival
│   ├── startup/                 Session-once archival trigger + SIGINT handler
│   ├── snapshot/                State snapshot for branch-switch detection
│   ├── failure-ux/              Four failure-mode policy executor
│   ├── verifiers/               Per-step verifier registry
│   ├── dispatch/                Dispatch-spec builder
│   ├── commands/                Top-tier command runners (next / loop / doctor)
│   └── integration/             Cross-cutting integration gates
├── tests/
│   └── fixtures/                Minimal BMAD-project replicas for integration tests
├── _bmad-output/
│   └── .stepper/                Runtime state (never committed; gitignored)
│       ├── state.yaml           Canonical project state
│       ├── state.yaml.bak       Last-good rollback
│       ├── state.yaml.lock/     mkdir-based file lock
│       ├── runs/                Per-step Markdown + JSON transcripts
│       ├── staging/             Ephemeral sub-agent dispatch workspaces
│       └── telemetry/           Opt-in per-step JSONL telemetry
├── AGENTS.md                    Sub-agent dispatch contract + contributor rules
├── CONTRIBUTING.md              Contributor guide (setup, PR flow, release)
├── CHANGELOG.md                 Changesets-managed release history
└── package.json                 Bun scripts + Changeset config
```

## AR9 stdout discipline

Every Layer 2 script invocation emits **exactly one JSON line** on stdout. All other
output (progress, warnings, errors) goes to stderr.

```
stdout: {"action":"dispatch","runId":"<uuid>","step":"bmad-dev-story","agent":"agents/bmad-step-runner.md",...}
stderr: info: BMAD detected v6.5.0.1 (compatible)
```

The `action` field is the dispatch protocol discriminant:

| `action` value | Meaning | Next step for Layer 1 |
|---------------|---------|----------------------|
| `"dispatch"` | A step is ready; invoke the sub-agent via Task | Call `verify-and-advance.ts` after the Task completes |
| `"advance"` | A step was verified and state advanced | Loop continues (or exits if a stop condition fires) |
| `"halt"` | Stepper stopped; read `actionableHint` for remediation | Surface the hint to the user |
| `"report"` | Read-only flag output (`--list`, `--dry-run`, etc.) | Print the `message` field; no Task invocation |
| `"skip"` | Step was skipped per failure policy | Loop continues |

Three documented AR9 carve-outs bypass the single-JSON-line wrapper: `--export-state`
(raw JSON body), `--watch` (line-by-line transcript stream), and `--upgrade` (plain-text
version report). All other flags preserve AR9 strictly.

Layer 1 reads the single JSON line via:

```text
bun run src/commands/next/run.ts -- $ARGUMENTS
```

then parses the `action` field and branches accordingly (per `commands/bmad-next.md`
§AR34 slash-command markdown protocol).

## State machine

Project state lives at `_bmad-output/.stepper/state.yaml` (Zod-validated,
schema-versioned). Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Schema version (migration guard; `STATE_TOO_NEW` on mismatch) |
| `lastSuccessfulStep` | string \| null | Most recently verified step; `null` on fresh project |
| `lastAttempted` | string \| null | Most recently dispatched step (differs from `lastSuccessfulStep` during retries) |
| `haltReason` | string \| null | Populated when Stepper halts; cleared on `--resume` |
| `skippedSteps` | string[] | Steps skipped via the `skip` failure policy |
| `completedSteps` | string[] | All verified steps in order |
| `branch` | string | Git branch at last advance (branch-switch detection via `BranchSwitchError`) |

Write discipline:

- **Atomic writes** — all saves use tmp+rename to prevent partial writes.
- **`.bak` rotation** — the prior `state.yaml` is moved to `state.yaml.bak`
  before each write (single-slot rollback).
- **Lock-based read-modify-write** — `verify-and-advance.ts` acquires the
  `state.yaml.lock/` mkdir-based lock, loads, mutates, saves, then releases. The
  `run.ts` runner is **lock-free** and calls `loadStateUnlocked` exclusively.
- **Recomputability** — `state.yaml` is a cache (NFR-R3); `--recompute-state`
  rebuilds it from disk without loss of project artifacts.

## Three-layer config system

```
project root: bmad-stepper.config.yaml   ← highest priority
user home:    ~/.config/bmad-stepper/config.yaml
plugin code:  src/config/defaults.ts     ← lowest priority (built in)
```

Resolution follows **project > user > defaults** with deep per-field merge. Arrays
at higher layers REPLACE lower-layer arrays (no concatenation). See
[`docs/configuration.md`](configuration.md#resolution-rule) for the worked merge
example.

The config schema is Zod-strict: unknown top-level keys and unknown per-field keys
surface as `CONFIG_ERROR` (exit 2) with a single-line, field-pointing actionable
hint. The loader runs at startup before any dispatch; a config parse error aborts
immediately.

## Three-tier DAG builder

The step DAG is built by `src/dag/build.ts` in three tiers:

| Tier | Source | Characteristic |
|------|--------|---------------|
| 1 (seed) | `src/dag/seed-v6.x.ts` | Hand-curated, compiled into the bundle; zero IO at runtime; targets BMAD v6.5 |
| 2 (overrides) | `bmad-stepper.config.yaml:overrides` | Zod-validated; can add nodes, mutate phase/predecessors, mark optional |
| 3 (frontmatter) | `<pluginDir>/skills/<name>/SKILL.md` | Live read for skills not in seed or overrides |

After all three tiers are merged, **Tarjan SCC** runs to detect cycles. A cycle of
size > 1 or a self-loop throws `DagCycleError` (exit 3). The resulting DAG is an
adjacency-list `DagAdjacency` sealed object used by the runner to pick the next
ready step.

## Lock model

| Site | Lock held? | Rationale |
|------|-----------|-----------|
| `src/commands/next/run.ts` | No (lock-free) | Read-only state access; fast path must not block |
| `src/commands/next/verify-and-advance.ts` | Yes | Read-modify-write cycle; must be atomic across concurrent invocations |
| `src/commands/doctor/run.ts` | No (lock-free) | Diagnostic read-only; must be safe to run while a step is in flight |
| `src/commands/loop/run.ts` | No (outer loop) | Each iteration delegates to `next/run.ts` (lock-free) and `next/verify-and-advance.ts` (locked) |

The lock is a **mkdir-based advisory lock** at `_bmad-output/.stepper/state.yaml.lock/`.
`mkdir` is atomic on POSIX filesystems; the directory's existence signals lock-held.
A stale lock (from a killed process) is cleared with `/bmad-next --force-unlock`.

## Sub-agent dispatch contract

Every sub-agent invocation carries six mandatory sections in the Task tool prompt
(per AGENTS.md §Sub-Agent Dispatch Contract):

1. **PERSONA** — which BMAD persona owns the work.
2. **CONTEXT** — input files, frontmatter, prior step outputs.
3. **TASK** — single deliverable (one artifact).
4. **OUTPUT FORMAT** — schema, required sections, file location in `staging/<run-id>/`.
5. **SUCCESS CRITERIA** — verifier-checkable conditions.
6. **CONSTRAINTS** — allowed tools, scope limits, what NOT to do.

Sub-agents write to `staging/<run-id>/` first. Layer 1 calls `verify-and-advance.ts`
after the Task completes; the verifier either promotes the artifact (on pass) or
applies the step's failure policy (on fail).

Per-step dispatch is parameterised by the config:

| Config key | Effect on dispatch-spec.json |
|-----------|------------------------------|
| `personas[step]` | Selects the BMAD persona in `PERSONA` section |
| `models[step]` | Sets `model` field (default `"sonnet"`) |
| `budgets[step].contextTokens` | Sets `budget.contextTokens` (default `60000`) |
| `budgets[step].timeoutMs` | Sets `budget.timeoutMs` (default `300000`) |
| `verifiers[step]` | Extends or replaces the baseline verifier config |
| `failurePolicies[step]` | Governs failure-mode behavior (default `escalate`) |

## Failure-UX modes

Four failure-mode policies are configurable per step via
`bmad-stepper.config.yaml:failurePolicies`:

| Policy | Behavior |
|--------|---------|
| `retry` | Retry the failed step up to a configured budget; halt with actionable hint on exhaustion |
| `skip` | Record the skip in `state.yaml`, advance to next step; requires `--resume` to confirm |
| `route-to-fixer` | Dispatch `agents/bmad-step-fixer.md`; on repair success retry; on repair failure escalate |
| `escalate` | Halt immediately with a single-line actionable hint per AR22; user runs `--resume` after manual remediation |

The default policy when none is configured is `escalate`. All four modes + all eight
loop stop-condition paths have integration tests.

## Errors as primary UX

Every halt produces a **single-line actionable hint** matching the regex
`/^.*(Run|See|Try|Check) /` (AR22). Hints are stored as `readonly` fields on each
`StepperError` subclass — they are contract, not prose.

The 17-code error registry lives in `src/errors.ts`. Adding a new error requires:

1. A unique `StepperErrorCode` union member.
2. A concrete `XxxError` class with an `actionableHint` field passing the AR22 regex.
3. A registration entry in the `errorRegistry`.
4. A test in `src/errors.test.ts` asserting registry membership + regex + single-line.

The registry sweep at `src/integration/escalate-actionable-hint.test.ts` automatically
validates every class — no manual test list to maintain.

## Key design decisions

### Why Bun?

Bun is the runtime constraint (NFR-I5). The Stepper uses Bun-native APIs throughout
(`Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn`) because:

- Bun runs `.ts` directly — **source is the release**. No `dist/`, no transpile step,
  no build CI job.
- `Bun.file().json()` and `Bun.YAML.parse()` are built-in; no extra dependencies.
- `Bun.spawn` provides the cleanest subprocess interface for the Layer 1 → Layer 2
  Bash bridge.

The `node:*` module allowlist is minimal (`node:fs/promises`, `node:os`, `node:path`
for the file-system operations Bun doesn't yet cover natively).

### Why a hand-rolled CLI parser?

The argument parser (`src/commands/next/args.ts`, `src/commands/loop/args.ts`)
returns `Result<Args, ParseError>` rather than throwing. This is the one approved
`Result<T,E>` site in the codebase (CONTRIBUTING.md §Code Style). The hand-rolled
approach avoids adding a heavy third-party dependency for a fixed, small flag surface.

### Why no network except in `src/upgrade/`?

The **no-main-thread-network** rule (NFR-S1 + AR41) keeps all non-upgrade code paths
offline-safe. The Stepper reads BMAD from the locally-installed plugin; it reads
project state from disk; it dispatches sub-agents via the Claude Code Task tool (which
has its own network path). The ONLY main-thread network call is the GitHub Releases
check in `src/upgrade/`, enforced by code review and the forward-deferred integration
gate `src/integration/no-network-on-main.test.ts`.

### Why mkdir-based locking?

POSIX `mkdir` is atomic on local and NFS filesystems without requiring a database or
advisory-lock helper. The directory's existence is the lock signal. Stale locks from
killed processes are trivially cleared (`rm -rf state.yaml.lock/`); `--force-unlock`
does exactly this via Stepper's own unlock path.

### Why `state.yaml` is a cache (NFR-R3)

`state.yaml` stores project progress, not project artifacts. The actual BMAD outputs
live under `_bmad-output/implementation-artifacts/` (your BMAD project's canonical
artifact directory). If `state.yaml` is lost or corrupt, `--recompute-state` rebuilds
it by scanning disk — no work is lost.

## Code quality gates

Run before every PR:

```bash
bun run check    # Biome 2.3 lint + bun test (release-blocker gate)
bunx tsc --noEmit  # Type check
```

Integration tests that MUST pass:

| Test | What it enforces |
|------|-----------------|
| `src/integration/escalate-actionable-hint.test.ts` | All 17 error classes pass AR22 regex + single-line constraint |
| `src/integration/no-write-outside-scope.test.ts` | No writes outside `_bmad-output/`, `_bmad-output/.stepper/`, or `os.tmpdir()` (NFR-S2) |
| `src/integration/upgrade-no-plugin-write.test.ts` | `--upgrade` flow writes ZERO bytes to `~/.claude/plugins/` |
| `src/integration/auto-archival-startup.test.ts` | Session-once archival trigger fires correctly |

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full contributor flow.
