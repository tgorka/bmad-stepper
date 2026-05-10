---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper.md
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper-distillate.md
  - _bmad-output/brainstorming/brainstorming-session-2026-04-29-1656.md
workflowType: 'architecture'
project_name: 'bmad-stepper'
user_name: 'tgorka'
date: '2026-04-29'
documentCounts:
  prd: 1
  briefs: 2
  ux: 0
  research: 0
  brainstorming: 1
  projectDocs: 0
  projectContext: 0
lastStep: 8
status: complete
completedAt: '2026-04-29'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (54 FRs across 8 categories):**

| Category | Count | Architectural implication |
|----------|-------|---------------------------|
| Stateful Workflow Orchestration (FR1–7) | 7 | Hybrid 3-layer state machine: files = SoT, `state.yaml` = write-through cache, frontmatter = authoritative per artifact. State is recomputable from disk alone (`--recompute-state`), validated against a Zod-versioned schema with idempotent migrations. |
| Step Execution & Dispatch (FR8–18) | 11 | Pluggable step registry built from BMAD skills + project overrides; DAG-validated on load. Every heavy task delegates to a single-shot, isolated sub-agent with declared budget/timeout, file-based I/O via a staging directory, and a separate verifier gate before promotion. |
| Bounded Loop Execution (FR19–26) | 8 | Loop driver with eight stop-condition types (`epic-end`, `story-X-Y`, `next-story`, `phase-end`, `max-iters`, `time-budget`, `token-budget`, `error`), default `max-iters` cap when none supplied, `--plan-first` dry-run, per-step-type checkpoint snapshots, graceful SIGINT shutdown within 30 s. |
| Failure Handling & Recovery (FR27–33) | 7 | Four failure-UX modes (retry / skip / route-to-fixer / escalate) configurable per step; `last_attempted` + `last_failure_reason` recorded on every halt; `--resume` always picks up cleanly from `state.yaml`; no stack traces on the main thread. |
| Configuration & Customization (FR34–40) | 7 | Layered resolution: project (`bmad-stepper.config.yaml`) > user (`~/.config/bmad-stepper/config.yaml`) > plugin defaults. Override surfaces: `personas`, `overrides` (DAG placement), `verifiers`, `failure-policies`, `models`, `budgets`, `paths`, `telemetry`. |
| Diagnostics & Observability (FR41–46) | 6 | `--doctor`, `--watch`, per-step markdown transcript + JSON run-log, opt-in human-readable telemetry report, single-line actionable error on main thread + full detail in run log. |
| Distribution & Lifecycle (FR47–51) | 5 | Marketplace install path (`tgorka/bmad-stepper`), `--upgrade` flow against GitHub Releases, BMAD version detection at first run, fail-loudly on unknown upstream skills with remediation hint. |
| Scripting & Integration (FR52–54) | 3 | Read-only flags (`--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`) safe in non-interactive contexts and never hold the project lock; documented exit codes 0–5; stdout = JSON only on `--export-state`, stderr = diagnostics. |

**Non-Functional Requirements (35 NFRs across 6 categories):**

- **Performance (P1–P6):** next-step computation < 500 ms p95; state recompute < 5 s for 100×1000; sub-agent dispatch overhead < 200 ms p95; transcript streaming has zero observable latency impact; `state.yaml` ≤ 1 MB loads < 100 ms (warn > 1 MB, halt > 50 MB); telemetry report < 2 s for one week of logs.
- **Security (S1–S6):** no main-thread network I/O except `--upgrade` and Claude Code marketplace ops; writes only inside project root + `~/.claude/plugins/` (CI gate enforced); telemetry contains no PII / no source / no out-of-project paths; sub-agents cannot escalate beyond declared `CONSTRAINTS`; explicit atomic tmp+rename with file lock for read-modify-write cycles; sub-agent output is never executed by Stepper.
- **Reliability (R1–R8):** zero data loss under any halt scenario; 100 % `--resume` recovery rate (CI-tested across all 8 stop-conditions × 4 failure modes); state recomputable from disk; clean halt on stale lock with `--force-unlock` remediation; SIGINT yields graceful exit within 30 s; idempotent Zod migrations.
- **Scalability (Sc1–Sc5):** 100 epics × 1000 stories per project; PRDs up to 50 000 lines paginated; loops up to 1 000 sub-agent dispatches without main-thread leaks; runs older than 90 days auto-archived; telemetry > 12 months auto-rotated.
- **Integration (I1–I5):** BMAD compatibility declared per release in CHANGELOG and tested in CI; unknown upstream skills fail loudly; runs on Claude Code plugin runtime as published at v0.1.0 with no patches; restart-tolerant (no Claude Code session-state dependency); Linux + macOS via Bun ≥ 1.1 only.
- **Maintainability (M1–M5):** every FR/NFR maps to an integration test (orphan requirements block release); errors module is CI-tested for actionable hints; all public schemas validated by Zod with versioned migrations; README quick-start ≤ 10 minutes to first `/bmad-next`; per-release maintainer time trends down post-v0.1.

### Scale & Complexity

- **Project complexity:** **high** — concurrency invariants (file lock + PID heartbeat, atomic tmp+rename, NFS fallback), three-layer state model with explicit precedence, schema-versioned Zod migrations, DAG-validated step registry with cycle detection, sub-agent dispatch architecture with staging/verify/promote, eight stop-condition semantics, four failure-UX modes, five pathological-input guards.
- **Primary technical domain:** Claude Code plugin → AI-agent orchestration with bounded autonomy. No GUI, no browser surface, no public network API, no database. CLI-shape derived from on-disk artifacts.
- **Estimated architectural components (subject to refinement in step-06):** ~16 — state subsystem; step registry; next-step computer; sub-agent dispatcher; verifier; stop-condition evaluator; failure-UX engine; snapshot/checkpoint engine; lock manager; transcript log writer; telemetry collector; doctor diagnostics; config loader; CLI parser & exit-code mapper; errors module; schema/migration registry.

### Technical Constraints & Dependencies

**Hard constraints (v0.1 release blockers):**

- **Runtime:** Bun ≥ 1.1; no Node.js compatibility commitment; no transpile step shipped (source = release).
- **Language:** TypeScript strict mode, ES2022 target, ESM modules.
- **Runtime dependencies:** Bun standard library + Zod (schema validation/migrations) only. No further runtime deps unless explicitly added with justification.
- **Operating systems:** Linux + macOS; Windows via WSL (no native Windows in v0.1).
- **Read-only upstream BMAD:** Stepper never writes to BMAD-installed files; CI gate enforced.
- **Network discipline:** no main-thread network I/O except `--upgrade` and Claude Code marketplace operations; sub-agents follow Claude Code's standard model API path.
- **Filesystem semantics:** atomic tmp+rename for every write; `.bak` backups before destructive ops; fallback warning on filesystems lacking atomic rename (NFS, iCloud sync, Time Machine paths).

**External dependencies:**

| Dependency | Purpose | Version constraint |
|------------|---------|--------------------|
| Claude Code plugin runtime | Host environment, slash-command surface, sub-agent dispatch primitives | As published at v0.1.0 release time |
| BMAD-METHOD upstream | Read-only consumer of installed skills + workflow artifacts | Tracked in CHANGELOG *BMAD Compatibility* per release |
| Bun | Runtime, test runner, package manager | ≥ 1.1 |
| Zod | Schema validation + migrations for `state.yaml`, config, run-log JSON | Latest stable, pinned via lockfile |
| Biome | Lint + format (replaces ESLint + Prettier) | Latest stable |
| Changesets | PR-based versioning + CHANGELOG generation | Latest stable |
| GitHub Actions | CI matrix (Linux + macOS) | n/a |

### Cross-Cutting Concerns

These concerns affect multiple components and must be designed with explicit contracts before component decomposition (step-06):

1. **Concurrency control.** Exclusive lock per project root via `state.yaml.lock` with PID + heartbeat; stale-lock detection with `--force-unlock`; halt-on-branch-switch (branch + sha snapshot per run); atomic tmp+rename for all writes with NFS-style fallback.
2. **Schema versioning & migrations.** All persisted schemas (`state.yaml`, `bmad-stepper.config.yaml`, run-log JSON, telemetry) carry a `version` field validated by Zod; migrations are idempotent and surface actionable errors on corruption rather than stack traces.
3. **Errors-as-primary-UX.** Every error class produces a single-line actionable hint on main thread + full detail in run log; CI test asserts the hint format for every error in `errors.ts`; no stack traces on main thread.
4. **Observability (transcripts + run logs).** Per step: markdown transcript at `_bmad-output/.stepper/runs/<ts>-<step>.log` (Git-friendly, human-readable) + JSON run-log at `<ts>-<step>.json` (machine-readable, schema-versioned, used by `--export-state`, `--diff-state`, telemetry).
5. **Telemetry.** Opt-in (default `false`); local-only in v0.1; aggregates step timing, retry rates, verifier failure patterns to `_bmad-output/.stepper/telemetry/<period>.md`; auto-rotates > 12 months; remote upload deferred post-v0.1.
6. **Configuration resolution.** Project (`bmad-stepper.config.yaml`) overrides user (`~/.config/bmad-stepper/config.yaml`) overrides plugin defaults; resolution rule documented and Zod-validated.
7. **Persona resolution.** Step frontmatter > project config `personas:` > plugin default mapping; auto-detect from `_bmad/{module}/config.yaml`; multi-persona steps run sequentially in v0.1.
8. **Verifier integration.** Runs as a separate step after every sub-agent dispatch and before promotion from staging; v0.1 conservative strategy (file-existence + Zod schema + required-section frontmatter); strength evolution is data-driven from telemetry.
9. **Pathological-input guards.** 50 k-line PRD warning + paginated read; 50 MB `state.yaml` halt; UTF-8 filename enforcement; 200-issue review pagination; lazy registry load for 100 epics × 1 000 stories.
10. **Exit-code discipline.** 0 = success, 1 = halt-with-actionable-error, 2 = configuration error, 3 = BMAD compatibility error, 4 = lock contention, 5 = pathological input. Stdout reserved for `--export-state` JSON; diagnostics on stderr; run logs on disk only.

### Open Architectural Questions Carried Forward

The PRD explicitly defers five questions to this architecture workflow:

1. **Step registry discovery mechanism** (PRD §11, distillate §11) — parse skill frontmatter vs naming-convention matching vs hand-curated YAML overrides with auto-detection. To be decided in step-04/05.
2. **Verifier strategy evolution** (PRD §12) — v0.1 conservative is fixed; the rule for adding LLM-as-judge later needs an architectural contract.
3. **Sub-agent dispatch interface to Claude Code** — exact mechanism for delegating tasks (Task-tool style vs `/skill` invocation vs plugin runtime API) is not yet pinned and shapes the dispatcher contract.
4. **Telemetry storage layout** — JSON Lines with rotation vs per-period directories; affects how NFR-Sc5 (12-month auto-rotation) is implemented.
5. **Schema-migration runner ergonomics** — concrete pattern for registering and running idempotent Zod migrations across all four versioned schemas (state, config, run-log, telemetry).

These questions frame the decision space for the remaining steps (3-7).

## Starter Template Evaluation

### Primary Technology Domain

**Claude Code plugin** running on Bun. The plugin is a directory containing `.claude-plugin/plugin.json` plus optional `commands/`, `skills/`, `agents/`, and `.mcp.json`, distributed via the Claude Code marketplace and hosted by the Claude Code plugin runtime. This domain has no off-the-shelf "starter" that matches Stepper's constraints (Bun-only, source-as-release, runtime deps = Bun stdlib + Zod).

### Starter Options Considered

| Option | What it provides | Verdict |
|--------|------------------|---------|
| `bun init` (canonical Bun scaffold) | `package.json`, `tsconfig.json`, `bunfig.toml`, smoke `index.ts` | **Selected** as runtime base |
| `anthropics/claude-plugins-official/plugins/example-plugin` | Canonical Claude Code plugin shape: `.claude-plugin/plugin.json`, `commands/<name>.md`, `agents/`, `skills/`, `.mcp.json` | **Selected** as plugin-shape reference (not forked; copied selectively) |
| `claude-code-template` (scotthavird) | Comprehensive Claude Code dev template: slash commands + subagents + auto-skills + output styles + status line + hooks + MCP | Rejected: aimed at developers *using* Claude Code, not building plugins. Would inject 80% to be deleted. |
| `ai-coding-project-boilerplate` (shinpr) | Sub-agent dev workflows + context engineering + quality checks | Rejected: a developer-workflow template, not a plugin scaffold |
| `claude-toolbox` (serpro69) | Multi-language, multi-tool agentic-dev config collection | Rejected: multi-language opinion conflicts with Bun-only constraint |
| `bun-ts-starter` / `bun-starter` | Bun + TS skeleton | Marginal: barely more than `bun init`; no plugin-shape value-add |

### Selected Approach: Assemble From Canonical Pieces (No Pre-Packaged Starter)

**Rationale:**

1. The PRD's hard constraints (Bun ≥ 1.3, runtime deps = Bun stdlib + Zod 4 only, source-as-release with no `dist/`, Linux + macOS only, plugin manifest at `.claude-plugin/plugin.json`) eliminate every comprehensive Claude Code starter — they all assume Node compatibility, ship a build step, or inject tooling we'd have to remove.
2. Bun 1.3 is now the runtime powering Claude Code itself (acquired by Anthropic in 2026). Targeting Bun-native is a first-class fit, not a workaround.
3. Anthropic's `claude-plugins-official/plugins/example-plugin` is the authoritative shape reference for plugin manifest + commands directory. We copy structure, not code.
4. Each tooling decision (Biome, Changesets, GitHub Actions matrix) has a one-command init that we run explicitly so the tooling state is auditable in Git.

**Initialization sequence (canonical commands):**

```bash
# 1. Runtime skeleton (Bun creates package.json, tsconfig.json, bunfig.toml, .gitignore)
bun init -y

# 2. Plugin shape (manual): create .claude-plugin/plugin.json and commands/<name>.md
#    using anthropics/claude-plugins-official/plugins/example-plugin as the structural reference

# 3. Schema validation (only runtime dep allowed in v0.1)
bun add zod@4

# 4. Lint + format
bun add -D -E @biomejs/biome
bunx @biomejs/biome init

# 5. Versioning + CHANGELOG
bun add -D @changesets/cli
bunx changeset init

# 6. CI workflows: hand-rolled GitHub Actions matrix
#    runs-on: [ubuntu-latest, macos-latest]; action: oven-sh/setup-bun@v2
```

### Architectural Decisions Provided By This Initialization

**Language & Runtime:**

- TypeScript strict mode; `target: "ESNext"`, `module: "Preserve"`, `moduleResolution: "bundler"`, `verbatimModuleSyntax: true` (per Bun 2026 recommendations).
- Bun ≥ 1.3 (bumped from PRD's ≥ 1.1 because Bun is now the Claude Code host runtime and 1.3 brings `bun test --parallel/--isolate/--shard/--changed` needed for NFR-R7/R8/Sc3 coverage).
- ESM exclusively; no CommonJS.
- No transpilation step — Bun runs `.ts` source directly. Plugin manifest points to `.ts` files; "source = release".

**Build Tooling:**

- No bundler. Bun loads source files at plugin load time.
- No `dist/` directory shipped or generated.

**Testing Framework:**

- `bun test` (built-in). Native parallelism via `bun test --parallel`, isolation via `--isolate`, sharding via `--shard`, changed-file scoping via `--changed`.
- Smoke tests + integration tests in the same runner; integration tests cover all 8 stop-conditions × 4 failure-UX modes per NFR-R7/R8.

**Code Organization (high-level; component-level deferred to step-06):**

- Plugin root contains: `.claude-plugin/plugin.json`, `commands/`, `src/` (TypeScript modules), `tests/` (or `*.test.ts` colocated), `package.json`, `tsconfig.json`, `bunfig.toml`, `biome.json`, `.changeset/`, `.github/workflows/`.
- `commands/bmad-next.md`, `commands/bmad-loop.md`, and `commands/bmad-doctor.md` declare the slash-command surface.

**Lint / Format:**

- Biome 2.3 only. No ESLint, no Prettier.
- `biome.json` enforces strict mode; CI runs `biome ci` as a release blocker.

**Versioning & Distribution:**

- Changesets for PR-based versioning + CHANGELOG. Convention: `MAJOR` = plugin API break, `MINOR` = features, `PATCH` = fix.
- Distribution: Claude Code marketplace as `tgorka/bmad-stepper`; `--upgrade` checks GitHub Releases.
- Plugin manifest `.claude-plugin/plugin.json` includes `name`, `version`, `description`, `author`, `homepage`, `repository`, `license: MIT`, `keywords: ["claude-code", "claude-code-plugin", "bmad", "bmad-method", "agile", "ai-development"]`.

**Schema Validation Library:**

- Zod 4 (the only runtime dependency). Justified by Zod 4's 14× faster string parsing, 7× faster array parsing, 57% smaller bundle, 20× TS instantiation reduction, and built-in JSON Schema conversion (useful for `--export-state` JSON-shape contract).

**Development Experience:**

- `bun test --watch` for TDD loop.
- `biome check --write` for format + autofix.
- `bun run` for ad-hoc scripts; no Taskfile.
- CI matrix: `ubuntu-latest` + `macos-latest`; `oven-sh/setup-bun@v2`; cache Bun's lockfile.

### Slash Command Format Decision

We use `commands/<name>.md` (explicit user invocation), not `skills/<name>/SKILL.md` (semantic auto-trigger). Rationale: PRD intent is that users type `/bmad-next` and `/bmad-loop` literally; `commands/` is the correct vehicle for that intent. Anthropic's note that "skills/ is preferred for new plugins" applies to semantically-invoked skills, not user-typed slash commands.

### Pinned Versions (at v0.1.0 release time)

| Component | Pinned version |
|-----------|----------------|
| Bun | ≥ 1.3 (latest at release: 1.3.13 verified Apr 2026) |
| TypeScript | bundled with Bun (strict + ESNext + Preserve modules) |
| Zod | 4.x latest stable |
| Biome | 2.3.x (`-E` exact pin per Biome semver-strict guidance) |
| Changesets | latest stable, lockfile-pinned |
| GitHub Actions: setup-bun | `oven-sh/setup-bun@v2` |

**Note:** Project initialization with the commands above must be the first implementation story. Each step is explicit and reproducible; no `--template` magic that would obscure tooling state.

## Core Architectural Decisions

The standard step-04 categories (Data Architecture / Auth / API / Frontend / Infra) do not map onto bmad-stepper. The plugin has no database, no auth surface, no public API, no UI, and its infrastructure is fixed by the PRD (Claude Code marketplace + GH Releases + Linux/macOS CI). The categories below are adapted to the plugin's actual decision space.

**Adapted Decision Categories**

| ID | Category |
|----|----------|
| A | Plugin execution model & sub-agent dispatch |
| B | State persistence, locking, snapshots |
| C | Step registry & DAG |
| D | Verifier & failure-UX engine |
| E | Configuration, schemas & migrations |
| F | Observability & telemetry |
| G | CLI surface & errors |
| H | Distribution & upgrade flow |

### Decision Priority Analysis

**Critical Decisions (block implementation):**

- D1 — Plugin execution model (hybrid: Claude orchestrator + Bun deterministic core + Task-tool sub-agent dispatch)
- D2 — Sub-agent dispatch interface (Claude Code's standard `Task` tool over agents in our `agents/` directory)
- D3 — YAML parser (`Bun.YAML` built-in, no dependency)
- D4 — File locking (hand-rolled mkdir-based with `mtime` heartbeat, no dependency)
- D5 — Step registry discovery (three-tier: built-in DAG seed + project overrides + frontmatter-parse fallback)
- D6 — DAG representation (adjacency list + Tarjan SCC cycle detection; lazy story-level loading)
- D7 — State persistence layout (`_bmad-output/.stepper/{state.yaml, runs/, staging/, telemetry/, journal/}`)
- D8 — Schema migration runner (in-band on load; per-schema migration registries; idempotent)

**Important Decisions (shape architecture):**

- D9 — Verifier registration (per-step config object: required files + Zod schema + frontmatter sections + optional custom check)
- D10 — Snapshot/checkpoint mechanism (Git-aware branch+sha + file-level `.bak`; non-Git fallback warns once)
- D11 — Error class shape (discriminated-union `StepperError` with `code`, `exitCode`, `actionableHint`)
- D12 — CLI argument handling (hand-rolled Zod-validated parser per command, no external arg-parser dependency)
- D13 — Persona resolution (defaults map + config override + frontmatter override + module-config auto-detect)
- D14 — Distribution & `--upgrade` flow (GH Releases canonical; explicit user invocation; never auto-install)

**Deferred Decisions (post-MVP):**

- Parallel sub-agent dispatch (PRD §17: rejected for v0.1; sequential default)
- LLM-as-judge verifier strategy (PRD §12: data-driven evolution from telemetry)
- Remote telemetry upload (PRD §15: opt-in remote upload deferred post-v0.1)
- Stacked PRs / Graphite integration (PRD growth feature, not v0.1)
- Native Windows support (PRD §15: WSL only in v0.1)

### A. Plugin Execution Model & Sub-Agent Dispatch

#### D1 — Hybrid execution model (three-layer)

**Decision:** The plugin uses a three-layer execution model. Each layer has a distinct responsibility and a strict boundary.

| Layer | Responsibility | Implementation |
|-------|----------------|----------------|
| 1 — Claude main thread | Orchestration, logging, sub-agent dispatch, decision making | Slash-command markdown files (`commands/bmad-next.md`, `commands/bmad-loop.md`, `commands/bmad-doctor.md`) authored as Claude prompts |
| 2 — Bun deterministic core | State read/write, lock acquisition, atomic writes, snapshot capture, registry/DAG construction, verifier execution, schema validation, migration application, telemetry aggregation, CLI argument parsing, error formatting | TypeScript modules under `src/`; invoked from Layer 1 via the `Bash` tool as `bun run <script>` |
| 3 — BMAD sub-agents | Single-shot heavy task execution with isolated context | Sub-agent definitions under `agents/`; dispatched from Layer 1 via the `Task` tool with declared budget/timeout/persona |

**Boundary rules:**

- Layer 2 (Bun) **never** calls the `Task` tool and **never** interacts with Claude orchestration. It is pure deterministic IO and computation.
- Layer 3 (sub-agents) **never** decides what comes next, **never** validates its own output, and **never** holds a long dialogue with the user. File-in (`staging/<run-id>/inputs/`), file-out (`staging/<run-id>/outputs/`).
- Layer 1 (main thread) is the only orchestrator. It owns the dispatch decision, the verifier-then-promote sequence, and the state-advance sequence.

**Rationale:** This boundary maps cleanly to the PRD's invariants. Sub-agent isolation lives in Layer 3. Files-as-truth lives in Layer 2. Main-thread-only orchestration lives in Layer 1. Each layer can be tested independently: Layer 2 with `bun test` (no Claude), Layer 1 with a recorded-prompt fixture, Layer 3 by running fixture sub-agent prompts against staging directories.

**Trade-offs accepted:**

- Some duplication: state information is passed to Claude via prompt (for orchestration choices) and lives in `state.yaml` (for the deterministic core). The slash-command prompt is responsible for re-reading state via `bun run get-state` rather than caching it in the prompt body — single source of truth.
- Two test surfaces (Bun unit tests + slash-command fixture tests). Acceptable because both are CI-cheap.

#### D2 — Sub-agent dispatch via Claude Code's Task tool

**Decision:** Sub-agent dispatch uses Claude Code's standard `Task` tool against sub-agents defined in our plugin's `agents/` directory. We do **not** use Anthropic Dispatch (paid tier), the Claude Agent SDK `query()` (for external integrations), or direct model API calls (which would skip Claude Code orchestration).

**Mechanism:**

1. The slash-command markdown body instructs Claude (Layer 1) to call `Task` with a constructed prompt that follows the **6-section sub-agent task spec** declared in PRD §Sub-Agent Dispatch Contract:

   ```
   PERSONA          — which BMAD persona owns this work (resolved per D13)
   CONTEXT          — input files, frontmatter snippets, prior step outputs
   TASK             — single clear deliverable (one artifact)
   OUTPUT FORMAT    — schema, required sections, file location in staging dir
   SUCCESS CRITERIA — verifier-checkable conditions
   CONSTRAINTS      — allowed tools, scope limits, what NOT to do
   ```

2. The dispatch spec (the six sections, model selection, budget, timeout) is generated by `bun run generate-dispatch-spec <step-name>` (Layer 2) and written to `staging/<run-id>/dispatch-spec.json`. The slash-command prompt reads it and constructs the `Task` invocation deterministically.

3. The sub-agent writes its artifact to `staging/<run-id>/outputs/`. The slash-command prompt then runs `bun run verify <run-id>` (Layer 2). On verifier pass, the prompt runs `bun run promote <run-id>` (Layer 2) which atomically moves the artifact to its canonical location and updates `state.yaml`.

**Why this dispatch interface:**

- Standard Claude Code mechanism: every Pro/Max user has it; no paid-tier dependency.
- Sub-agents declared in `agents/` get the persona + tool-restriction + system-prompt benefits Claude Code provides natively.
- File-based handoff (`staging/`) keeps Layer 1's prompt-stack clean: it doesn't need to embed the artifact in conversation context; it tells Claude "the result is at this path."

**Rejected alternatives:**

| Alternative | Why rejected |
|-------------|--------------|
| Anthropic Dispatch (March 2026) | Paid tier ($100/m Max, $20/m Pro). Community users may not have access. Stepper must run on the standard Claude Code surface. |
| Claude Agent SDK `query()` | Designed for external programs talking to Claude Code, not for plugin code already running inside it. |
| Direct Anthropic API call | Skips Claude Code orchestration, breaks sub-agent isolation guarantees, and breaks plugin runtime contract. |

**Sub-agent definitions (initial set, refined in step-06):** at minimum we ship one generic `agents/bmad-step-runner.md` whose description matches "execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json". Specialized agents may be added per step type if telemetry shows quality benefits.

### B. State Persistence, Locking, Snapshots

#### D7 — State persistence layout

**Decision:** All Stepper state lives under `_bmad-output/.stepper/`:

```
_bmad-output/.stepper/
  state.yaml                          # canonical state (single file, schema-versioned)
  state.yaml.bak                      # last-good snapshot before destructive write
  state.yaml.lock/                    # lock directory (atomic mkdir-based)
    pid                               # PID + heartbeat metadata (Zod-validated)
  runs/
    <ts>-<step>.log                   # markdown transcript per step (Git-friendly)
    <ts>-<step>.json                  # machine-readable run log per step (Zod schema)
    .archive/<period>/                # auto-archived after 90 days (NFR-Sc4)
  staging/
    <run-id>/
      dispatch-spec.json              # input to sub-agent dispatch
      inputs/                         # files passed to sub-agent
      outputs/                        # sub-agent's produced artifacts (pre-verify)
  telemetry/
    <period>.md                       # opt-in human-readable report
    <period>.jsonl                    # opt-in machine-readable per-step records
    .archive/                         # auto-rotated after 12 months (NFR-Sc5)
  journal/
    <date>.md                         # daily dogfood journal entries
```

**Conventions:**

- `<ts>` is `YYYY-MM-DDTHH-mm-ss` (sortable, filesystem-safe, UTC).
- `<step>` is BMAD skill name with `epic-N-story-X-Y` suffix when applicable.
- `<run-id>` is `<ts>-<step>-<short-uuid>` to disambiguate retries.
- `<period>` is `YYYY-MM` for monthly aggregates.
- Orphan staging directories (`<run-id>` older than 24 h with no completion marker) are cleaned up at Stepper start.

#### D4 — File locking via hand-rolled mkdir-based algorithm

**Decision:** Implement file locking ourselves using the mkdir strategy. No external dependency.

**Algorithm:**

1. **Acquire:** `mkdir(state.yaml.lock)`. If it succeeds, we have the lock. If it fails with `EEXIST`, the lock is held — read the `pid` file inside, evaluate staleness (heartbeat `mtime`), retry with backoff or fail with `LOCK_CONTENTION` (exit code 4).
2. **Heartbeat:** while holding the lock, every 5 seconds, update `mtime` of `state.yaml.lock/pid` (e.g., `utimes` syscall). The pid file contains JSON validated by Zod: `{ pid: number, hostname: string, acquiredAt: string, heartbeatInterval: 5 }`.
3. **Stale detection:** if `mtime` is more than 30 seconds old, the lock is considered stale. The PID is checked: if the process is alive, treat the lock as live (race window — abort and ask user). If the PID is not alive (`kill(pid, 0)` returns ESRCH), the lock is removed and re-acquired.
4. **Release:** `rm -rf state.yaml.lock` (atomic dir removal). Always wrapped in `try/finally`.
5. **Force unlock:** `--force-unlock` flag removes the lock dir unconditionally (after warning user). Maps to NFR-R4.

**Why mkdir over `O_EXCL` or fcntl/flock:** mkdir is atomic on every filesystem including NFS; `O_EXCL` is broken on NFS; `flock`/`fcntl` are POSIX-only and have edge cases on shared FS. mkdir gives us cross-FS consistency at the cost of being slightly slower than `O_EXCL` on local FS — irrelevant at the lock-frequency Stepper operates at (one acquire per `/bmad-next` invocation).

**Why no `proper-lockfile` dep:** Adopting the well-tested library would be sound, but the algorithm itself is ~80 lines of TS. Keeping the runtime-deps surface to Bun stdlib + Zod is a PRD constraint. The mkdir+heartbeat pattern is small enough to own and audit.

**Test coverage:** dedicated integration tests for: concurrent acquire (two processes), stale lock recovery (kill -9 first process, second acquires), heartbeat-loss behavior (suspended process), `--force-unlock` UX, and behavior on filesystems lacking sub-second `mtime` (warn and fall back to 60-second stale threshold).

#### D10 — Snapshot/checkpoint mechanism

**Decision:** Two-layer snapshotting.

**Layer 1 — Git-aware project snapshot.** On every state-mutating step:

- If the project is a Git repo, capture `branch` and `sha` (HEAD commit). Persist to `state.yaml` field `lastSnapshot: { branch, sha, takenAt }`.
- On the next Stepper invocation, compare current Git state to `lastSnapshot`. If branch changed or sha changed mid-loop, halt with `BRANCH_SWITCH` error and require explicit `--resume` or `--recompute-state`.
- If the project is not a Git repo, `lastSnapshot` is `null`. Print a one-time warning at first run; do not block.

**Layer 2 — File-level `.bak`.** Before any destructive write to `state.yaml`:

- Rename current `state.yaml` to `state.yaml.bak`.
- Write new state to `state.yaml.tmp` (atomic write — `Bun.write` to tmp then `fs.rename` to canonical).
- On successful write, leave `state.yaml.bak` for one more cycle as a safety buffer; remove on the cycle after that (always one-cycle-back available for recovery).

**`--checkpoint-each <step-type>`** (PRD-required flag): triggers an explicit Layer 1 snapshot recorded under `state.yaml.checkpoints[]: [{ branch, sha, takenAt, stepType }]`. Bounded to last 50 entries; older ones are FIFO-evicted.

**Branch-switch detection** (NFR-R1, PRD safety invariant): performed on every Stepper start by `bun run check-branch`. Returns exit code 1 with `BRANCH_SWITCH` actionable hint on mismatch.

### C. Step Registry & DAG

#### D5 — Three-tier step registry discovery

**Decision:** Resolve each BMAD step's DAG placement using three tiers, in order:

**Tier 1 — Built-in DAG seed (`src/dag/seed-v6.x.ts`).** A hand-curated TypeScript module declaring placements for every BMAD skill known at Stepper release time:

```typescript
export const seedV6_3: SeedEntry[] = [
  { name: "analyst-research", phase: "analysis", after: [], before: [], optional: false, persona: "analyst" },
  { name: "brainstorming", phase: "analysis", after: ["analyst-research"], optional: true, persona: "analyst" },
  // ...
];
```

The seed is **versioned per BMAD compatibility** (matches CHANGELOG *BMAD Compatibility* per release) and tested in CI against an actual BMAD install.

**Tier 2 — Project overrides (`bmad-stepper.config.yaml`).** Users supply DAG placements for skills the seed doesn't know:

```yaml
overrides:
  architecture-validator:
    phase: solutioning
    after: [architecture]
    optional: true
```

Overrides have **higher priority than the seed** (users can also re-place a known skill if they have local reasons). Validated by Zod (`OverridesSchema`).

**Tier 3 — Frontmatter-parse fallback.** When a skill is detected in the BMAD install but has no entry in seed or overrides, attempt to parse its `SKILL.md` or `skill.yaml` frontmatter for `phase`, `after`, `before`, `optional`, `persona`. If parseable, use it; if not, **fail loudly** with `UNKNOWN_BMAD_SKILL` (exit code 3) and a remediation hint pointing at the override config.

**Rationale:** Tier 1 is the fast path (no IO at runtime — already compiled into the seed). Tier 2 is the user escape hatch. Tier 3 is the upstream-evolution slow-path — when a new BMAD release introduces a skill that follows the convention, Stepper auto-detects it; when it doesn't, we surface a fixable error rather than silently misorder the DAG.

**Maintenance contract:** every BMAD upstream minor release triggers a CI compatibility job. If an unknown skill is detected, the maintainer either adds it to the seed (preferred) or documents the override in CHANGELOG. The seed-update PR is the mechanism for tracking *BMAD Compatibility* per Stepper release.

#### D6 — DAG representation as adjacency list with Tarjan SCC

**Decision:** Represent the resolved step graph as an in-memory adjacency list:

```typescript
type StepNode = {
  name: string;
  phase: "analysis" | "planning" | "solutioning" | "implementation" | "retro";
  after: string[];          // depends-on
  before: string[];         // depended-on-by (computed from `after` of others)
  optional: boolean;
  persona: string | string[] | null;
  idempotent: boolean;
};

type DAG = {
  nodes: Map<string, StepNode>;
  edgesOut: Map<string, Set<string>>;
  edgesIn: Map<string, Set<string>>;
};
```

**Cycle detection:** Tarjan's SCC algorithm runs on every load. A cycle is a fail-loud `DAG_CYCLE` error with the offending nodes listed.

**Topological order:** computed lazily on `--list` and `--explain`. Multiple valid orderings are possible; the deterministic tiebreaker is `phase` order then `name` lexicographic.

**Lazy story-level loading (NFR-Sc1):** the global skill DAG is loaded once at start (~30-50 nodes). Story-level expansions (e.g., `dev-story` for epic 3 / story 3.2) are materialized on demand from the epics/stories directory listing — never preloaded for all 100 epics × 1000 stories.

**Rejected alternatives:** dedicated graph library (`graphlib`, `dagre`, `@dagrejs/dagre`) — overkill for a 30-50 node graph and adds a runtime dep; topological-sort npm packages — same.

### D. Verifier & Failure-UX Engine

#### D9 — Per-step verifier configuration

**Decision:** Each step has a verifier object, registered in `src/verifiers/<step-name>.ts` and discoverable by name:

```typescript
type VerifierConfig = {
  requiredFiles: string[];                   // glob patterns relative to staging output
  requiredFrontmatterSections: string[];     // top-level frontmatter keys that must exist
  schema: ZodSchema | null;                  // optional Zod schema for the artifact body
  custom?: (artifact: ArtifactRef) => Result<void, VerifierError>;
};
```

**Resolution priority:** Project config (`bmad-stepper.config.yaml` `verifiers:`) overrides plugin defaults. Custom checks (the `custom` field) run last and have access to the file's content; they are intentionally limited to deterministic, stateless work — no Claude calls.

**Failure-UX modes (PRD §8 — four modes):**

- `retry` — re-run sub-agent with same input; configurable max retries (default 2).
- `skip` — record skip in state; advance to next step.
- `route-to-fixer` — dispatch a fixer sub-agent (`agents/bmad-step-fixer.md`) with the failure context to attempt remediation. After fixer returns, the original verifier re-runs.
- `escalate` — halt loop, surface human-readable failure report, set `last_failure_reason`, `--resume` available.

**Per-step policy** is selectable via `bmad-stepper.config.yaml` `failure-policies:`. Default policy per step is shipped in plugin defaults (`escalate` is the safest fallback when no per-step policy is set). Loop-level `--auto-fix` flag overrides per-step policy to `route-to-fixer` for one run.

### E. Configuration, Schemas & Migrations

#### D3 — `Bun.YAML` for YAML parsing

**Decision:** Use `Bun.YAML.parse()` (built-in since Bun 1.2.21; YAML 1.2 compliant; written in Zig). No external YAML library.

**Usage:** every YAML read in Stepper (`state.yaml`, `bmad-stepper.config.yaml`, BMAD module configs) goes through `Bun.YAML.parse(text)` followed by Zod validation. Hot-reload is not used — Stepper does not run as a long process.

**Rejected alternatives:** `js-yaml`, `yaml` (npm package). Both are well-tested but unnecessary given Bun's built-in.

#### D8 — In-band schema migration runner

**Decision:** Per persisted-schema migration registry, applied on load.

**Schema-versioned files:** `state.yaml`, `bmad-stepper.config.yaml`, `runs/<ts>-<step>.json`, `telemetry/<period>.jsonl`. Each top-level object carries `schemaVersion: <n>`.

**Migration registry shape (per schema family):**

```typescript
type Migration<From, To> = (data: From) => To;

type MigrationRegistry<Latest> = {
  current: number;
  versions: Record<number, ZodSchema>;
  migrations: Record<number, Migration<unknown, unknown>>;
};

function loadAndMigrate<L>(
  raw: unknown,
  registry: MigrationRegistry<L>
): Result<L, MigrationError> {
  // 1. Read raw.schemaVersion (default 1 if absent on first-version files)
  // 2. While version < current: validate against versions[v], apply migrations[v], increment
  // 3. Final validate against versions[current]; return typed L
  // 4. On failure surface CORRUPT_STATE (exit 1) with actionable hint
}
```

**Idempotency contract:** running migration `n → n+1` on already-`n+1`-shaped data is a no-op (validated by passing the migrated data through `versions[n+1]` and confirming it parses unchanged). CI test enumerates every `(fromVersion, toVersion)` path and asserts idempotency.

**Old-Stepper-on-new-state behavior:** loading `state.yaml` with `schemaVersion > current` produces `STATE_TOO_NEW` (exit 1) with hint `Run /bmad-next --upgrade to install a Stepper version that supports this schema.` No silent corruption.

### F. Observability & Telemetry

State persistence layout (D7) defines the file layout. The observability behaviors are:

- **Markdown transcript per step (`runs/<ts>-<step>.log`)** — Git-friendly, human-readable. Sections: `# Step <name>`, `## Inputs`, `## Sub-agent prompt`, `## Sub-agent output (excerpt)`, `## Verifier result`, `## State delta`. Streamed write — main thread tails to disk, never to stdout/stderr.
- **JSON run log per step (`runs/<ts>-<step>.json`)** — schema-versioned, used by `--export-state`, `--diff-state`, telemetry aggregator. Fields: `ts`, `step`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `timeout`, `verifierResult`, `stateBefore`, `stateAfter`, `durationMs`, `tokensIn`, `tokensOut`, `errors`.
- **Telemetry aggregation (`telemetry/<period>.md` + `<period>.jsonl`)** — opt-in (default off via `bmad-stepper.config.yaml` `telemetry: { enabled: false }`). Generated by `bun run aggregate-telemetry --period <YYYY-MM>` from JSON run logs. No PII, no source content, no out-of-project paths.
- **`--watch`** — `bun run watch-runs` tails the most recent transcript log as text.
- **Auto-rotation** — runs > 90 days move to `runs/.archive/<YYYY-MM>/`; telemetry > 12 months moves to `telemetry/.archive/`. Both run on Stepper start.

### G. CLI Surface & Errors

#### D11 — Error class shape

**Decision:** Discriminated-union error hierarchy in `src/errors.ts`:

```typescript
type StepperErrorCode =
  | "LOCK_CONTENTION"
  | "BRANCH_SWITCH"
  | "BMAD_INCOMPATIBLE"
  | "UNKNOWN_BMAD_SKILL"
  | "DAG_CYCLE"
  | "CORRUPT_STATE"
  | "STATE_TOO_NEW"
  | "VERIFIER_FAILURE"
  | "PATHOLOGICAL_INPUT"
  | "BUDGET_EXCEEDED"
  | "TIMEOUT"
  | "CONFIG_ERROR"
  | "MIGRATION_FAILURE"
  | /* ... */ ;

abstract class StepperError extends Error {
  abstract readonly code: StepperErrorCode;
  abstract readonly exitCode: 0 | 1 | 2 | 3 | 4 | 5;
  abstract readonly actionableHint: string;       // single-line, main-thread output
  readonly detail?: string;                       // multi-line, run-log only

  toJSON() {
    return { code: this.code, exitCode: this.exitCode, message: this.message,
             actionableHint: this.actionableHint, detail: this.detail };
  }
}
```

**CI gate:** `tests/errors.test.ts` enumerates every concrete `StepperError` subclass via `Object.values()` of an exported registry and asserts: (a) `actionableHint` is non-empty, (b) `actionableHint` ends with a concrete next-action command (regex), (c) `code` is unique across the codebase, (d) `exitCode` ∈ {0,1,2,3,4,5}.

**Exit-code mapping (PRD-mandated):**

| Code | Meaning | Example |
|------|---------|---------|
| 0 | Success | step advanced cleanly |
| 1 | Halt-with-actionable-error | `VERIFIER_FAILURE`, `BRANCH_SWITCH`, `CORRUPT_STATE` |
| 2 | Configuration error | `CONFIG_ERROR`, `MIGRATION_FAILURE` (config file) |
| 3 | BMAD compatibility error | `BMAD_INCOMPATIBLE`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE` |
| 4 | Lock contention | `LOCK_CONTENTION` |
| 5 | Pathological input | `PATHOLOGICAL_INPUT`, `BUDGET_EXCEEDED` (when input-driven) |

#### D12 — Hand-rolled Zod-validated CLI parser per command

**Decision:** Each command has `src/commands/<name>/args.ts`:

```typescript
export const NextArgsSchema = z.object({
  step: z.string().optional(),
  epic: z.string().optional(),
  story: z.string().optional(),
  phase: z.enum(["analysis", "planning", "solutioning", "implementation", "retro"]).optional(),
  dryRun: z.boolean().default(false),
  resume: z.boolean().default(false),
  includeOptional: z.boolean().default(false),
  noOptional: z.boolean().default(false),
  persona: z.string().optional(),
  explain: z.boolean().default(false),
  list: z.boolean().default(false),
  /* ... */
});

export type NextArgs = z.infer<typeof NextArgsSchema>;

export function parseNextArgs(argv: string[]): Result<NextArgs, ParseError>;
```

**Parser implementation** is hand-rolled (~50 lines): tokenize `--flag` and `--flag=value` and positional; build a raw object; pass through Zod for validation and defaults. No external arg library (commander/oclif/yargs) needed for this flag inventory.

**Slash-command argument flow:** Claude expands `$ARGUMENTS` in the slash-command body to the user's tail string. The slash-command prompt instructs Claude to invoke `bun run parse-and-dispatch -- $ARGUMENTS`. The Bun script parses, validates, and either reports a Zod error (exit 2) or proceeds.

#### D13 — Persona resolution

**Decision:** Resolution order (highest priority first):

1. **Step frontmatter** — if the BMAD skill's `SKILL.md` declares `persona: <name>` in frontmatter, that wins.
2. **Project config** (`bmad-stepper.config.yaml` `personas:`) — map of `{ stepName: personaName }`.
3. **Plugin defaults** — `src/personas/defaults.ts` ships a hand-curated map for every step in the seed DAG.
4. **Auto-detect from `_bmad/<module>/config.yaml`** — when none of the above resolve, parse the BMAD module config and pick the persona whose triggers match the step name.

**Multi-persona steps** (e.g., `code-review` = `dev` + `tea`): the value is `string | string[]`. In v0.1, multi-persona steps dispatch sub-agents sequentially (parallel deferred per PRD §17).

**Persona-not-resolvable** is a `CONFIG_ERROR` (exit 2) with hint pointing at the config override block.

### H. Distribution & Upgrade Flow

#### D14 — Read-only `--upgrade`

**Decision:** `--upgrade` is a read-only diagnostic. It never writes to `~/.claude/plugins/`.

**Flow:**

1. `bun run check-upgrade` calls `gh api repos/tgorka/bmad-stepper/releases/latest` via `Bun.fetch` (this is the **only** main-thread network I/O permitted by NFR-S1, and it's user-explicit).
2. Compares `currentVersion` (read from our own `.claude-plugin/plugin.json`) to `latestVersion`.
3. Prints diff: current, latest, CHANGELOG link, BMAD compatibility for latest.
4. If newer available, prints actionable hint: `Run /plugin marketplace update tgorka/bmad-stepper to upgrade.`

**No auto-install.** Auto-install would require writes to `~/.claude/plugins/` from our code, violating NFR-S2 and the read-only respect for plugin runtime files. The user remains in control.

**Marketplace metadata** in `.claude-plugin/plugin.json`: `keywords: ["claude-code", "claude-code-plugin", "bmad", "bmad-method", "agile", "ai-development"]` for marketplace discoverability per PRD §14.

### Decision Impact Analysis

**Implementation sequence (which decisions enable which):**

```
D1 (execution model) ─┬─> D2 (sub-agent dispatch) ─────> D9 (verifier) ──> Failure-UX engine
                      ├─> D7 (state layout) ─────────┬─> D4 (locking) ──> D10 (snapshots)
                      └─> D11 (error shape) ─────────┴─> D8 (migrations) ─> D3 (Bun.YAML)

D5 (registry discovery) ────> D6 (DAG repr) ──────────> D13 (persona resolution)

D12 (CLI parsing) ──────┬─> D11 (error shape)
                        └─> D14 (upgrade flow)
```

The implementation can start at any "leaf" decision (D3, D11, D12) and converge upward to D1. The natural sprint order is: D11 + D12 + D3 → D7 + D4 → D8 → D5 + D6 → D13 → D10 → D9 → D1 + D2 + D14 last.

**Cross-component dependencies:**

- The verifier engine (D9) requires both the Bun core (Layer 2 of D1) and the dispatch interface (D2) — verifiers run after sub-agent output is staged.
- The DAG seed (D5 Tier 1) must be kept in sync with BMAD upstream — the CHANGELOG *BMAD Compatibility* section is the contract that operationalizes this.
- The error shape (D11) is a pre-requisite for every other decision — every component throws `StepperError` subclasses, and CI gates depend on the registry.
- The persona resolution (D13) is consumed by D2 (dispatch builds the `PERSONA` section of the sub-agent task spec).

This decision set closes all five PRD-deferred questions (PRD §11 mechanism, §12 verifier strategy, sub-agent dispatch interface, telemetry layout, migration runner) and locks the foundation for step-05 (architectural patterns) and step-06 (component decomposition).

## Implementation Patterns & Consistency Rules

The standard step-05 categories (Database / API / Frontend / Events) do not apply (no DB, no API, no UI, no event bus). The categories below target the actual conflict surface for sub-agents and contributors writing code into this plugin.

### Pattern Categories Adapted to Stepper

| ID | Category |
|----|----------|
| P1 | Naming conventions |
| P2 | Repository structure |
| P3 | Persisted file shapes |
| P4 | Function & error semantics |
| P5 | Sub-agent dispatch contract |
| P6 | Slash-command markdown patterns |
| P7 | Test patterns |
| P8 | Code quality enforcement |

### P1 — Naming Conventions

**Files:**

- TypeScript files: `kebab-case.ts` (e.g., `step-registry.ts`, `dispatch-spec.ts`).
- Test files: colocated `<source>.test.ts` next to the source.
- Slash-command files: `commands/bmad-<verb>.md` (e.g., `bmad-next.md`, `bmad-loop.md`, `bmad-doctor.md`).
- Sub-agent files: `agents/bmad-<role>.md` (e.g., `agents/bmad-step-runner.md`, `agents/bmad-step-fixer.md`).

**TypeScript identifiers:**

- Functions: `camelCase` (`computeNextStep`, `acquireLock`).
- Types and interfaces: `PascalCase`. **No `I` prefix** on interfaces (`StepNode`, not `IStepNode`).
- Constants (top-level immutable values): `SCREAMING_SNAKE_CASE` (`MAX_HEARTBEAT_AGE_MS`, `DEFAULT_BUDGET_TOKENS`).
- Variables (locals/parameters): `camelCase`.
- Schema-version typed aliases: `StateV1`, `StateV2` for explicit-version types; `State = z.infer<typeof StateLatestSchema>` as the alias for the current version. The current alias is what application code uses; explicit-version types are reserved for migration code.

**Errors:**

- Class names: `XxxError` (`LockContentionError`, `BranchSwitchError`). Each subclass declares one `code` field whose value is a string literal in the `StepperErrorCode` union.
- Error codes: `SCREAMING_SNAKE_CASE` string literals (`"LOCK_CONTENTION"`, `"BRANCH_SWITCH"`).

**Persisted-file field naming:** `camelCase` everywhere — including YAML files. This keeps Zod-inferred TS types 1:1 with persisted shapes and eliminates a casing-translation layer that sub-agents could implement inconsistently.

### P2 — Repository Structure

| Concern | Convention |
|---------|------------|
| Tests | Colocated `*.test.ts` next to source. **Not** `tests/` directory. Reason: `bun test --changed` filters per source file at finest granularity. |
| Commands | One folder per command: `src/commands/<name>/{index.ts, args.ts, run.ts}`. Each command typically has 2–3 files (CLI parser, runner, helpers). |
| Schemas | Centralized: `src/schemas/<schema-family>.ts` (`state.ts`, `config.ts`, `run-log.ts`, `telemetry.ts`, `dispatch-spec.ts`, `verifier-result.ts`). Cross-cutting concern; central is easier to find. |
| Migrations | One file per migration: `src/migrations/<schema-family>/<from>-to-<to>.ts` plus an `index.ts` registry per family. Per-PR review-friendly. |
| Verifiers | Per-step: `src/verifiers/<step-name>.ts` plus `src/verifiers/index.ts` registry mapping step name to verifier config. |
| Errors | Single file: `src/errors.ts`. CI-tested registry. Plus `src/errors.test.ts`. |
| File-IO helpers | `src/io/{lock.ts, atomic-write.ts, snapshot.ts, paths.ts}`. Single source of truth per IO pattern. |
| DAG | `src/dag/{seed-v6.x.ts, build.ts, sort.ts}`. Seed is per BMAD compatibility version. |
| Personas | `src/personas/{defaults.ts, resolve.ts}`. |
| Integration tests (multi-module flows) | `src/integration/<flow>.test.ts`. |
| Smoke tests (happy paths) | `src/smoke/<command>.test.ts`. |
| Test fixtures | `tests/fixtures/<scenario>/` with a minimal BMAD-project replica per scenario. Documented in `tests/fixtures/README.md`. |

### P3 — Persisted File Shapes

**`state.yaml` (schemaVersion 1):**

```yaml
schemaVersion: 1
project:
  name: bmad-stepper
  bmadVersion: "6.3.0"            # detected at last run
lastSuccessfulStep:
  step: dev-story
  epic: 3
  story: "3.2"
  completedAt: "2026-04-29T10:15:00Z"
lastAttempted:
  step: code-review
  epic: 3
  story: "3.2"
  attemptedAt: "2026-04-29T10:20:00Z"
lastFailureReason: null              # or { code, message, hint, runId }
lastSnapshot:
  branch: main
  sha: "abc1234..."
  takenAt: "2026-04-29T10:15:00Z"
checkpoints: []                       # bounded to 50 entries, FIFO eviction
runHistory: []                        # bounded to last 100 entries
```

**`bmad-stepper.config.yaml` (schemaVersion 1):**

```yaml
schemaVersion: 1
personas: {}                          # { stepName: personaName | personaName[] }
overrides: {}                         # { skillName: { phase, after, before, optional } }
verifiers: {}                         # { stepName: { requiredFiles[], requiredFrontmatterSections[] } }
failurePolicies: {}                   # { stepName: "retry" | "skip" | "route-to-fixer" | "escalate" }
models: {}                            # { stepName: "sonnet" | "opus" | "haiku" }
budgets: {}                           # { stepName: { contextTokens, timeoutMs } }
paths:
  state: "_bmad-output/.stepper/state.yaml"
  runs: "_bmad-output/.stepper/runs/"
  staging: "_bmad-output/.stepper/staging/"
  telemetry: "_bmad-output/.stepper/telemetry/"
telemetry:
  enabled: false
```

**Run log JSON (`runs/<ts>-<step>.json`, schemaVersion 1):**

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-29T10-15-00",
  "runId": "2026-04-29T10-15-00-dev-story-abc12",
  "step": "dev-story",
  "epic": 3,
  "story": "3.2",
  "phase": "implementation",
  "persona": "dev",
  "model": "sonnet",
  "budget": { "contextTokens": 60000, "timeoutMs": 300000 },
  "verifierResult": { "status": "pass", "checks": [] },
  "stateBefore": {},
  "stateAfter": {},
  "durationMs": 184321,
  "tokensIn": 12450,
  "tokensOut": 4321,
  "errors": []
}
```

**Markdown transcript (`runs/<ts>-<step>.log`):**

```markdown
# Step <name> — <runId>

## Inputs
<list of files passed to sub-agent>

## Sub-agent prompt (6 sections)
PERSONA: ...
CONTEXT: ...
TASK: ...
OUTPUT FORMAT: ...
SUCCESS CRITERIA: ...
CONSTRAINTS: ...

## Sub-agent output (excerpt — full at staging/<run-id>/outputs/)
...

## Verifier result
- requiredFiles: ✓
- frontmatter: ✓
- schema: ✓
- custom check: ✓

## State delta
- lastSuccessfulStep: story-create → dev-story
- lastAttempted: dev-story (cleared on success)

## Outcome
✓ Promoted from staging/<run-id>/ to canonical location.
```

**Telemetry JSONL (`telemetry/<period>.jsonl`, one record per step):**

```json
{"schemaVersion": 1, "ts": "...", "step": "...", "durationMs": 0, "verifierStatus": "pass", "retries": 0, "tokensTotal": 0}
```

### P4 — Function & Error Semantics

- **Errors are thrown, not returned.** Every TS function throws a `StepperError` subclass on failure (`throw new LockContentionError(detail)`). No `Result<T, E>` discriminated unions in the general code path. Top-level handlers in each Bun-script entrypoint catch and map to exit codes. Idiomatic, less boilerplate, and aligned with how the runtime already handles uncaught errors.
- **Sole exception:** the CLI argument parser returns `Result<Args, ParseError>`. Argument parsing failure is non-fatal in the sense that we want a pretty error and exit 2 without a stack trace even in development. All other code paths use throw.
- **Async style:** always `async/await`, never `.then()`. Consistent with the modern TypeScript ecosystem.
- **Bun-native APIs preferred:** `Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn` over `node:fs` and `node:child_process`. Faster, Bun-idiomatic.
- **No `any`.** Biome rule + tsc strict mode require explicit types. `unknown` with type-guards is acceptable.
- **No `console.log` in runtime code.** A logger helper at `src/io/log.ts` writes to the proper output stream (stderr for diagnostics, stdout reserved for `--export-state` JSON).

### P5 — Sub-Agent Dispatch Contract

Every dispatch generates `staging/<run-id>/dispatch-spec.json`:

```json
{
  "schemaVersion": 1,
  "runId": "2026-04-29T10-15-00-dev-story-abc12",
  "step": "dev-story",
  "epic": 3,
  "story": "3.2",
  "model": "sonnet",
  "budget": { "contextTokens": 60000, "timeoutMs": 300000 },
  "taskSpec": {
    "persona": "dev",
    "context": [
      { "type": "file", "path": "_bmad-output/planning-artifacts/prd.md", "section": "§4.2" },
      { "type": "file", "path": "_bmad-output/planning-artifacts/architecture.md" }
    ],
    "task": "Create story 3.2 dev artifact from PRD §4.2 and architecture §6.",
    "outputFormat": {
      "schemaRef": "src/schemas/dev-story.ts#StoryArtifactSchema",
      "fileLocation": "staging/<run-id>/outputs/story-3-2.md",
      "requiredSections": ["Title", "Acceptance Criteria", "Implementation Notes"]
    },
    "successCriteria": [
      "Frontmatter has required keys: title, status",
      "All acceptance criteria addressable by single PR"
    ],
    "constraints": {
      "allowedTools": ["Read", "Write", "Edit", "Grep"],
      "scopeLimits": "Only files inside staging/<run-id>/ may be written."
    }
  }
}
```

**Verifier output (`staging/<run-id>/verifier-result.json`):**

```json
{
  "schemaVersion": 1,
  "status": "pass",
  "checks": [
    { "name": "required-files", "status": "pass", "detail": "" },
    { "name": "frontmatter", "status": "pass", "detail": "" },
    { "name": "schema", "status": "pass", "detail": "" },
    { "name": "custom", "status": "pass", "detail": "" }
  ],
  "promotedTo": null
}
```

**Promotion contract:** verifier `pass` → atomic copy from `staging/<run-id>/outputs/` to canonical path. Cleanup of `staging/<run-id>/` after `promotedAt + 24 h`.

### P6 — Slash-Command Markdown Patterns

Every `commands/<name>.md` has a frontmatter:

```yaml
---
description: One-line description visible in /help
argumentHint: "<flags>"
allowedTools: ["Bash", "Task", "Read"]
---
```

Body pattern:

```markdown
# /bmad-<verb>

## Usage examples
/bmad-<verb>
/bmad-<verb> --explain
/bmad-<verb> --resume

## Behavior
1. Run `bun run <plugin-root>/src/commands/<verb>/run.ts -- $ARGUMENTS` via the Bash tool.
2. Read the output (a JSON line declaring next action).
3. If `dispatch` action: invoke Task tool with the spec at `staging/<run-id>/dispatch-spec.json`.
4. After Task returns, run `bun run <plugin-root>/src/commands/<verb>/verify-and-advance.ts` via Bash.
5. Print one or two human-readable lines summarizing the outcome.

## Tool restrictions
- Bash is restricted to `bun run <plugin-root>/...` invocations.
- Task is restricted to dispatching agents declared in this plugin's `agents/` directory.
- No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`.
```

### P7 — Test Patterns

- Naming: colocated `<source>.test.ts`. Multi-module flows: `src/integration/<flow>.test.ts`. Smoke: `src/smoke/<command>.test.ts`.
- Isolation: any test that touches the filesystem uses a unique `tmpdir()` per test; cleanup in `afterEach`. **Never** touch `_bmad-output/` from a test — always go through tmpdir.
- Fixtures: `tests/fixtures/<scenario>/` with a minimal replica of the BMAD project structure (e.g., `prd.md`, `_bmad/.../skill.yaml`).
- Test commands declared in `package.json`:
  - `test` — `bun test`
  - `test:watch` — `bun test --watch`
  - `test:integration` — `bun test src/integration/`
  - `test:smoke` — `bun test src/smoke/`
- Coverage: `bun test --coverage`. Release blocker at `< 80%` line coverage for v0.1.
- CI matrix: every test runs on Linux + macOS. Sharding via `bun test --shard <n>/<total>` in GitHub Actions.

### P8 — Code Quality Enforcement

**Biome `biome.json`:**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.0/schema.json",
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noConsoleLog": "error" },
      "correctness": { "useExhaustiveDependencies": "error", "noUnusedVariables": "error" },
      "style": { "noImplicitAnyLet": "error" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always"
    }
  }
}
```

**CI gate `bun run check` =** `biome ci . && bun test`. Release blocker.

**Errors registry test (`src/errors.test.ts`):**

- Enumerates every `StepperError` subclass via the exported `errorRegistry`.
- Asserts: every error class has a non-empty `actionableHint`.
- Asserts: every hint ends with a concrete next-action verb (regex `/^.*(Run|See|Try|Check) /`).
- Asserts: every `code` is unique.
- Asserts: every `exitCode` ∈ {0, 1, 2, 3, 4, 5}.

**No-write-outside-scope CI gate:** an integration test exercises typical paths (state advance, lock, snapshot, telemetry) and afterwards uses `fs.access` to verify nothing was written outside `_bmad-output/.stepper/` and the test's tmpdir. Enforces NFR-S2.

**No-network-on-main-thread CI gate:** an integration test mocks `Bun.fetch`, then invokes top-level entrypoints other than `--upgrade`. If `Bun.fetch` is called, the test fails. Enforces NFR-S1.

### Enforcement Guidelines

**All sub-agents and contributors MUST:**

- Throw `StepperError` subclasses, never raw `Error` (P4).
- Use `kebab-case` for filenames (P1).
- Use `camelCase` for persisted-file fields (P3).
- Use `Bun.YAML` and `Bun.file`/`Bun.write` for IO (P4).
- Place new tests colocated next to source (P7).
- Add a Changeset entry for every visible change (P8 — release-flow consequence).
- Validate persisted shapes against Zod schemas in `src/schemas/` (P3).

**Pattern violations** are caught by:

- Biome lint rules (naming, no-console-log, no-any).
- CI gates (errors registry test, no-write-outside-scope, no-network-on-main).
- Code review against this section of the architecture document.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
bmad-stepper/
├── README.md
├── CHANGELOG.md                              # Changesets-managed; "BMAD Compatibility" per release
├── AGENTS.md                                 # contributor & sub-agent contract documentation
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── LICENSE                                   # MIT
├── package.json                              # name, scripts, devDeps, deps (zod only)
├── bun.lockb                                 # Bun lockfile (binary)
├── tsconfig.json                             # strict, ES2022, ESM, Preserve modules
├── biome.json                                # Biome 2.3 config (P8)
├── bunfig.toml                               # Bun runtime config
├── .gitignore                                # excludes _bmad-output/, .stepper/, *.log, .env*
├── .changeset/
│   ├── README.md
│   └── config.json
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                            # bun test + biome ci, matrix Linux+macOS
│   │   ├── release.yml                       # Changesets release flow
│   │   └── bmad-compat.yml                   # weekly check vs latest BMAD
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.md
│   │   ├── feature.md
│   │   └── bmad-compat.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── .claude-plugin/
│   └── plugin.json                           # plugin manifest (FR47)
├── commands/
│   ├── bmad-next.md                          # Layer 1 orchestrator for /bmad-next
│   ├── bmad-loop.md                          # Layer 1 orchestrator for /bmad-loop
│   └── bmad-doctor.md                        # Layer 1 orchestrator for /bmad-doctor (--doctor delegated here)
├── agents/
│   ├── bmad-step-runner.md                   # Layer 3 generic step executor
│   └── bmad-step-fixer.md                    # Layer 3 route-to-fixer worker
├── docs/
│   ├── getting-started.md                    # README quick-start companion (NFR-M4)
│   ├── configuration.md                      # bmad-stepper.config.yaml schema reference
│   ├── exit-codes.md                         # exit code 0–5 catalog
│   ├── bmad-compatibility.md                 # per-Stepper-release BMAD compat history
│   ├── architecture.md                       # link or copy of this document
│   └── examples/
│       ├── cold-start-return.md              # PRD example 1
│       ├── single-step.md                    # PRD example 2
│       ├── overnight-loop.md                 # PRD example 3
│       ├── halt-recovery.md                  # PRD example 4
│       ├── skip-on-failure.md                # PRD example 5
│       ├── doctor-diagnostic.md              # PRD example 6
│       └── state-export-ci.md                # PRD example 7
├── examples/
│   ├── bmad-stepper.config.yaml              # documented config example
│   ├── bmad-6.4-overrides.yaml               # forward-compat override sample
│   └── scripting/
│       ├── ci-state-check.sh
│       └── nightly-loop.sh
├── tests/
│   └── fixtures/
│       ├── README.md
│       ├── minimal-bmad-project/             # smallest valid BMAD project
│       ├── full-epic-makistack-like/         # fixture mimicking makistack
│       ├── bmad-v6.3-install/                # fixture BMAD upstream
│       ├── bmad-v6.4-with-new-skills/        # forward-compat fixture
│       └── corrupt-state/                    # corrupted state.yaml fixtures
└── src/
    ├── index.ts                              # entry barrel; re-exports the public surface
    │
    ├── commands/                             # Layer 2 entrypoints invoked by Layer 1 markdown
    │   ├── index.ts
    │   ├── next/
    │   │   ├── index.ts
    │   │   ├── args.ts                       # NextArgsSchema, parseNextArgs (FR8–15, 27)
    │   │   ├── run.ts                        # main runner: load state → compute → dispatch-spec
    │   │   ├── verify-and-advance.ts         # post-dispatch verifier + state advance
    │   │   ├── run.test.ts
    │   │   └── verify-and-advance.test.ts
    │   ├── loop/
    │   │   ├── index.ts
    │   │   ├── args.ts                       # LoopArgsSchema (FR19–26, 30)
    │   │   ├── run.ts                        # main loop runner + SIGINT handler (FR24)
    │   │   ├── stop-conditions.ts            # 8 stop-condition implementations (FR20)
    │   │   ├── stop-conditions.test.ts
    │   │   └── run.test.ts
    │   └── doctor/
    │       ├── index.ts
    │       ├── args.ts
    │       ├── run.ts                        # --doctor + --upgrade entrypoints
    │       ├── checks.ts                     # individual diagnostic checks (FR41, 50)
    │       └── run.test.ts
    │
    ├── state/                                # state management
    │   ├── index.ts
    │   ├── load.ts                           # loadAndMigrate (FR5–7)
    │   ├── save.ts                           # atomic save with .bak rotation
    │   ├── recompute.ts                      # --recompute-state (FR2)
    │   ├── diff.ts                           # --diff-state (FR3)
    │   ├── export.ts                         # --export-state JSON (FR4, 52)
    │   └── *.test.ts
    │
    ├── schemas/                              # all Zod schemas centralized
    │   ├── state.ts                          # StateV1Schema; current alias `State`
    │   ├── config.ts                         # ConfigV1Schema (FR34–40)
    │   ├── run-log.ts                        # RunLogV1Schema (FR43, 44)
    │   ├── telemetry.ts                      # TelemetryRecordV1Schema (FR45)
    │   ├── dispatch-spec.ts                  # DispatchSpecSchema (P5)
    │   ├── verifier-result.ts                # VerifierResultSchema
    │   ├── pid.ts                            # lock pid file
    │   └── *.test.ts
    │
    ├── migrations/                           # one file per (from→to) per schema family
    │   ├── state/
    │   │   ├── index.ts                      # MigrationRegistry<State>
    │   │   └── 1-to-2.ts                     # placeholder for future
    │   ├── config/
    │   │   └── index.ts
    │   ├── run-log/
    │   │   └── index.ts
    │   └── telemetry/
    │       └── index.ts
    │
    ├── dag/                                  # step registry & DAG (D5, D6)
    │   ├── index.ts
    │   ├── seed-v6.x.ts                      # tier 1 built-in seed
    │   ├── build.ts                          # 3-tier resolver (FR35, 51)
    │   ├── sort.ts                           # Tarjan SCC + topo sort
    │   ├── frontmatter-parse.ts              # tier 3 fallback parser
    │   └── *.test.ts
    │
    ├── verifiers/                            # per-step verifier registry (D9, FR17, 38)
    │   ├── index.ts                          # registry
    │   ├── default.ts                        # base config
    │   ├── analyst-research.ts
    │   ├── prd.ts
    │   ├── architecture.ts
    │   ├── story-create.ts
    │   ├── dev-story.ts
    │   ├── code-review.ts
    │   ├── retro.ts
    │   └── *.test.ts
    │
    ├── dispatch/                             # sub-agent dispatch (D2, FR16)
    │   ├── index.ts
    │   ├── generate-spec.ts                  # writes staging/<run-id>/dispatch-spec.json
    │   ├── promote.ts                        # post-verify atomic promotion
    │   ├── staging-cleanup.ts                # orphan staging cleanup on start
    │   └── *.test.ts
    │
    ├── failure-ux/                           # 4 failure modes (D9, FR28–31)
    │   ├── index.ts
    │   ├── retry.ts
    │   ├── skip.ts
    │   ├── route-to-fixer.ts
    │   ├── escalate.ts
    │   └── *.test.ts
    │
    ├── personas/                             # persona resolution (D13, FR12)
    │   ├── index.ts
    │   ├── defaults.ts                       # built-in persona mapping
    │   ├── resolve.ts                        # 4-tier resolution
    │   └── *.test.ts
    │
    ├── io/                                   # foundational IO primitives
    │   ├── index.ts
    │   ├── lock.ts                           # mkdir-based lock + heartbeat (D4, FR R4)
    │   ├── atomic-write.ts                   # tmp+rename + .bak (NFR-S5, R1)
    │   ├── snapshot.ts                       # branch+sha + checkpoint (D10)
    │   ├── paths.ts                          # canonical path helpers + scope check
    │   ├── log.ts                            # logger (FR18, 46, 54; NFR-S1)
    │   └── *.test.ts
    │
    ├── telemetry/                            # opt-in telemetry (FR39, 45; NFR-Sc5)
    │   ├── index.ts
    │   ├── collect.ts                        # write per-step JSONL records
    │   ├── aggregate.ts                      # period rollup → markdown
    │   ├── rotate.ts                         # 12-month auto-rotation
    │   └── *.test.ts
    │
    ├── transcript/                           # per-step run logs (FR42–44; NFR-Sc4)
    │   ├── index.ts
    │   ├── write-step.ts                     # markdown + JSON per step
    │   ├── archive.ts                        # 90-day archive
    │   ├── watch.ts                          # --watch tail
    │   └── *.test.ts
    │
    ├── upgrade/                              # --upgrade flow (D14, FR48)
    │   ├── index.ts
    │   ├── check.ts                          # GH API call via Bun.fetch
    │   └── check.test.ts
    │
    ├── bmad-detect/                          # BMAD upstream detection (FR50, 51)
    │   ├── index.ts
    │   ├── detect-version.ts
    │   ├── detect-skills.ts                  # enumerate skills for tier-3 fallback
    │   └── *.test.ts
    │
    ├── errors.ts                             # entire StepperError hierarchy + registry (D11)
    ├── errors.test.ts                        # CI gate: registry + actionableHint format
    │
    ├── integration/                          # cross-module integration tests
    │   ├── stop-conditions.test.ts           # NFR-R7 (all 8 stop conditions)
    │   ├── failure-ux.test.ts                # NFR-R8 (all 4 failure modes)
    │   ├── doctor.test.ts                    # --doctor against fixture BMAD
    │   ├── upgrade.test.ts                   # --upgrade flow
    │   ├── recompute.test.ts                 # --recompute-state
    │   ├── export-state.test.ts              # --export-state JSON contract (FR4, 52)
    │   ├── concurrent-acquire.test.ts        # lock contention
    │   ├── stale-lock.test.ts                # stale-lock recovery
    │   ├── branch-switch.test.ts             # halt-on-branch-switch (D10)
    │   ├── migration.test.ts                 # all migration paths (NFR-R6)
    │   ├── pathological-input.test.ts        # 50k-line PRD, 50MB state (NFR-Sc1, Sc2)
    │   ├── no-write-outside-scope.test.ts    # NFR-S2 enforcement
    │   ├── no-network-on-main.test.ts        # NFR-S1 enforcement
    │   └── long-run-1000-dispatches.test.ts  # NFR-Sc3
    │
    └── smoke/                                # happy-path smoke tests
        ├── next.test.ts
        ├── loop.test.ts
        └── doctor.test.ts
```

**Total `src/` directories:** 14 module directories + integration + smoke + 1 root file (`errors.ts`).

### Architectural Boundaries

#### Three-Layer Boundary (D1 enforced)

| Layer | Code lives in | Communicates with | Forbidden |
|-------|---------------|-------------------|-----------|
| Layer 1 — Claude main thread | `commands/*.md`, `agents/*.md` (descriptions only) | Layer 2 via `Bash` tool; Layer 3 via `Task` tool | Direct file IO; running TS code other than via Bash; bypassing the verifier-then-promote sequence |
| Layer 2 — Bun TypeScript core | `src/**/*.ts` | The filesystem; the GH API (only inside `src/upgrade/`) | Calling `Task`; orchestrating sub-agents; reading from Claude session state; printing to stdout other than `--export-state` JSON |
| Layer 3 — BMAD sub-agents | `agents/*.md` (prompt body) | The filesystem (read inputs from `staging/<run-id>/inputs/`, write outputs to `staging/<run-id>/outputs/`) | Deciding what comes next; validating own output; user dialogue; writes outside their `staging/<run-id>/` |

#### Module Boundaries Inside `src/`

A directed dependency graph between modules. **Foundational** modules have no upward dependencies; consumers import from them but not vice versa.

```
        Foundational (no upward imports)
        ──────────────────────────────────
        errors.ts   schemas/   io/

                       │
                       │ (imported by)
                       ▼
        Mid-level (depend only on foundational)
        ─────────────────────────────────────────
        migrations/   state/   bmad-detect/
        personas/     dag/     transcript/
        telemetry/    upgrade/

                       │
                       ▼
        Higher-level (depend on foundational + mid-level)
        ──────────────────────────────────────────────────
        verifiers/   dispatch/   failure-ux/

                       │
                       ▼
        Top-level (depend on everything below)
        ──────────────────────────────────────
        commands/

                       │
                       ▼
        Tests (cross-module integration)
        ─────────────────────────────────
        integration/    smoke/
```

A Biome import-restriction rule (or hand-rolled CI test) enforces no upward imports from foundational modules.

#### Persistence Boundary

All Stepper state lives under `_bmad-output/.stepper/`. Reads from BMAD project artifacts (PRD, architecture, stories) and writes to Stepper state are strictly separated:

| Operation | Allowed Stepper paths | Allowed BMAD project paths |
|-----------|------------------------|----------------------------|
| Read | `_bmad-output/.stepper/**` | `_bmad-output/**`, `_bmad/**`, `docs/**`, `bmad-stepper.config.yaml`, `~/.claude/plugins/<bmad>/**` |
| Write | `_bmad-output/.stepper/**` | **Never** to `~/.claude/plugins/**`. Only to `_bmad-output/**` (artifact promotion) and never to `_bmad/**` (read-only respect, NFR-S2 + CI gate) |
| Lock | `_bmad-output/.stepper/state.yaml.lock/` | None |

#### External Dependency Boundary

Only two external dependencies cross into Stepper at runtime:

1. **Claude Code plugin runtime** — provides slash command surface, `Bash`, `Task`, and other tools to Layer 1.
2. **Zod 4** — provides Layer 2 schema validation.

Every other capability (YAML, file IO, lock, fetch, hashing, gzip) is supplied by Bun's standard library. **No `node:*` imports** unless an explicit lint allowance — the goal is single-runtime semantic alignment.

### Requirements to Structure Mapping

#### Functional Requirements (FR1–FR54)

| FR | Capability | Primary location | Supporting code |
|----|------------|------------------|-----------------|
| FR1 | Compute next step zero-config | `src/commands/next/run.ts` | `src/dag/build.ts`, `src/state/load.ts` |
| FR2 | `--recompute-state` | `src/state/recompute.ts` | `src/dag/build.ts`, `src/bmad-detect/detect-skills.ts` |
| FR3 | `--diff-state` | `src/state/diff.ts` | `src/state/recompute.ts` |
| FR4 | `--export-state` JSON | `src/state/export.ts` | `src/io/log.ts` (stdout discipline) |
| FR5 | Recover from any halt | `src/state/load.ts` | `src/state/recompute.ts`, `src/io/snapshot.ts` |
| FR6 | Validated state with actionable errors | `src/schemas/state.ts`, `src/state/load.ts` | `src/errors.ts` |
| FR7 | Auto-apply schema migrations | `src/migrations/state/` | `src/state/load.ts` |
| FR8 | Single-step advance (`/bmad-next`) | `src/commands/next/run.ts` | `commands/bmad-next.md` |
| FR9 | `--dry-run` | `src/commands/next/args.ts`, `src/commands/next/run.ts` | — |
| FR10 | `--step <id>` override | `src/commands/next/args.ts`, `src/commands/next/run.ts` | `src/dag/build.ts` |
| FR11 | `--epic`/`--story`/`--phase` | same | `src/dag/sort.ts` |
| FR12 | `--persona` override | `src/commands/next/args.ts` | `src/personas/resolve.ts` |
| FR13 | `--explain` | `src/commands/next/run.ts` | `src/dag/sort.ts` |
| FR14 | `--list` | `src/commands/next/run.ts` | `src/dag/sort.ts` |
| FR15 | `--include-optional`/`--no-optional` | `src/commands/next/args.ts` | `src/dag/build.ts` |
| FR16 | Sub-agent dispatch with budget+timeout | `src/dispatch/generate-spec.ts` | `commands/bmad-next.md` (Task invocation) |
| FR17 | Verifier before promote | `src/verifiers/`, `src/dispatch/promote.ts` | `src/schemas/verifier-result.ts` |
| FR18 | One-line main-thread output | `src/io/log.ts`, `commands/*.md` | — |
| FR19 | `/bmad-loop` | `src/commands/loop/run.ts` | `commands/bmad-loop.md` |
| FR20 | Eight stop-condition types | `src/commands/loop/stop-conditions.ts` | `src/integration/stop-conditions.test.ts` |
| FR21 | `--plan-first` | `src/commands/loop/run.ts` | `src/dag/sort.ts` |
| FR22 | `--checkpoint-each` | `src/commands/loop/args.ts`, `src/io/snapshot.ts` | — |
| FR23 | `--time-budget`/`--token-budget`/`--max-iters` | `src/commands/loop/args.ts` | `src/commands/loop/run.ts` |
| FR24 | SIGINT graceful exit | `src/commands/loop/run.ts` (signal handler) | `src/io/lock.ts` (release in finally) |
| FR25 | Default `max-iters` cap | `src/commands/loop/args.ts` (default) | — |
| FR26 | Exit reason + `--resume` hint | `src/commands/loop/run.ts` | `src/io/log.ts` |
| FR27 | `--resume` | `src/commands/next/args.ts`, `src/state/load.ts` | — |
| FR28 | `--skip` | `src/failure-ux/skip.ts` | `src/state/save.ts` |
| FR29 | `--auto-fix` (route-to-fixer) | `src/failure-ux/route-to-fixer.ts` | `agents/bmad-step-fixer.md` |
| FR30 | `--interactive` | `src/commands/loop/args.ts`, `src/commands/loop/run.ts` | — |
| FR31 | Per-step failure policies | `src/schemas/config.ts`, `src/failure-ux/index.ts` | — |
| FR32 | Actionable error report on halt | `src/errors.ts`, `src/io/log.ts` | `src/transcript/write-step.ts` |
| FR33 | Record `last_attempted` etc. | `src/state/save.ts` | `src/schemas/state.ts` |
| FR34 | Project YAML config | `src/schemas/config.ts` | `src/state/load.ts` |
| FR35 | DAG `overrides:` | `src/dag/build.ts` (tier 2) | `src/schemas/config.ts` |
| FR36 | `models:` per step | `src/schemas/config.ts`, `src/dispatch/generate-spec.ts` | — |
| FR37 | `budgets:` per step | same | — |
| FR38 | `verifiers:` per step | `src/schemas/config.ts`, `src/verifiers/index.ts` | — |
| FR39 | Telemetry opt-in | `src/schemas/config.ts`, `src/telemetry/index.ts` | — |
| FR40 | Project > user > defaults config | `src/state/load.ts` (config layer resolver) | `src/schemas/config.ts` |
| FR41 | `--doctor` | `src/commands/doctor/run.ts`, `src/commands/doctor/checks.ts` | `src/bmad-detect/detect-version.ts` |
| FR42 | `--watch` | `src/transcript/watch.ts` | — |
| FR43 | Markdown transcript per step | `src/transcript/write-step.ts` | `src/schemas/run-log.ts` |
| FR44 | JSON run log per step | `src/transcript/write-step.ts` (paired) | `src/schemas/run-log.ts` |
| FR45 | Telemetry report | `src/telemetry/aggregate.ts` | `src/schemas/telemetry.ts` |
| FR46 | Single-line + full-detail errors | `src/errors.ts`, `src/io/log.ts`, `src/transcript/write-step.ts` | — |
| FR47 | Marketplace install | `.claude-plugin/plugin.json`, `README.md` | — |
| FR48 | `--upgrade` | `src/upgrade/check.ts` | `src/commands/doctor/run.ts` |
| FR49 | Uninstall preserves state | Documented in `README.md`; no code | — |
| FR50 | Detect BMAD version on first run | `src/bmad-detect/detect-version.ts` | `src/commands/doctor/checks.ts` |
| FR51 | Fail-loud unknown skill | `src/dag/build.ts` (tier 3 fail), `src/errors.ts` | `src/dag/frontmatter-parse.ts` |
| FR52 | Read-only flags non-locking | `src/state/export.ts`, `src/state/diff.ts` | `src/io/lock.ts` (acquire skipped) |
| FR53 | Documented exit codes | `src/errors.ts` (mapping) | `docs/exit-codes.md` |
| FR54 | stdout/stderr discipline | `src/io/log.ts` | — |

#### Non-Functional Requirements

| NFR | Target | Enforcement location |
|-----|--------|----------------------|
| NFR-P1 next-step < 500 ms p95 | Performance | `src/integration/long-run-1000-dispatches.test.ts` (assertion) |
| NFR-P2 recompute < 5 s for 100×1000 | Performance | `src/integration/recompute.test.ts` |
| NFR-P3 dispatch overhead < 200 ms p95 | Performance | `src/integration/long-run-1000-dispatches.test.ts` |
| NFR-P4 transcript streaming | Performance | `src/transcript/write-step.ts` (streamed write) |
| NFR-P5 state.yaml ≤ 1 MB < 100 ms; > 50 MB halt | Performance | `src/state/load.ts` (size guard) + `src/integration/pathological-input.test.ts` |
| NFR-P6 telemetry < 2 s for 1 week | Performance | `src/telemetry/aggregate.ts` (assertion) |
| NFR-S1 no main-thread network except `--upgrade` | Security | `src/integration/no-network-on-main.test.ts` |
| NFR-S2 writes only inside scope | Security | `src/io/paths.ts` (scope check) + `src/integration/no-write-outside-scope.test.ts` |
| NFR-S3 telemetry no PII | Security | `src/telemetry/collect.ts` (whitelist of fields) |
| NFR-S4 sub-agent isolation | Security | `src/dispatch/generate-spec.ts` (`CONSTRAINTS` section) |
| NFR-S5 atomic writes + locks | Security | `src/io/atomic-write.ts`, `src/io/lock.ts` |
| NFR-S6 no execution of sub-agent output | Security | Lint rule + code review (no `Bun.spawn` of `staging/<run-id>/outputs/**`) |
| NFR-R1 zero data loss on halt | Reliability | `src/io/atomic-write.ts`, `src/io/snapshot.ts`, `src/io/lock.ts` |
| NFR-R2 100 % `--resume` recovery | Reliability | `src/integration/stop-conditions.test.ts` × `src/integration/failure-ux.test.ts` |
| NFR-R3 state recomputable from disk | Reliability | `src/state/recompute.ts` |
| NFR-R4 `--force-unlock` on stale lock | Reliability | `src/io/lock.ts`, `src/integration/stale-lock.test.ts` |
| NFR-R5 SIGINT graceful within 30 s | Reliability | `src/commands/loop/run.ts`, `src/integration/stop-conditions.test.ts` |
| NFR-R6 idempotent migrations | Reliability | `src/integration/migration.test.ts` (per path × idempotency assertion) |
| NFR-R7 8 stop-conditions covered | Reliability | `src/integration/stop-conditions.test.ts` |
| NFR-R8 4 failure modes covered | Reliability | `src/integration/failure-ux.test.ts` |
| NFR-Sc1 100 epics × 1000 stories | Scalability | `src/dag/build.ts` (lazy story load), `src/integration/pathological-input.test.ts` |
| NFR-Sc2 50 k-line PRD paginated | Scalability | `src/state/load.ts` (paginated read), `src/integration/pathological-input.test.ts` |
| NFR-Sc3 1 000 dispatches no leak | Scalability | `src/integration/long-run-1000-dispatches.test.ts` |
| NFR-Sc4 90-day run archive | Scalability | `src/transcript/archive.ts` |
| NFR-Sc5 12-month telemetry rotation | Scalability | `src/telemetry/rotate.ts` |
| NFR-I1 BMAD compat declared per release | Integration | `.github/workflows/bmad-compat.yml`, `CHANGELOG.md` |
| NFR-I2 unknown skill fail-loud | Integration | `src/dag/build.ts` tier 3, `src/errors.ts` |
| NFR-I3 runtime parity at release | Integration | Tested at release (no specific code) |
| NFR-I4 no Claude session-state dependency | Integration | `src/state/recompute.ts` |
| NFR-I5 Linux + macOS via Bun ≥ 1.3 | Integration | `package.json#engines`, CI matrix |
| NFR-M1 every requirement has a test | Maintainability | CI traceability check; orphan-FR detector script |
| NFR-M2 actionable hints | Maintainability | `src/errors.test.ts` |
| NFR-M3 schemas + migrations | Maintainability | `src/schemas/`, `src/migrations/` |
| NFR-M4 README quick-start ≤ 10 min | Maintainability | `docs/getting-started.md` (timed-walk-through fixture) |
| NFR-M5 maintainer time trends down | Maintainability | Tracked in release notes (no code gate) |

### Cross-Cutting Concerns to Locations

| Concern (from step-02) | Implementation location |
|------------------------|--------------------------|
| 1. Concurrency control | `src/io/lock.ts`, `src/io/atomic-write.ts`, `src/io/snapshot.ts` |
| 2. Schema versioning & migrations | `src/schemas/`, `src/migrations/` |
| 3. Errors-as-primary-UX | `src/errors.ts`, `src/errors.test.ts`, `src/io/log.ts` |
| 4. Observability (transcripts + run logs) | `src/transcript/`, `src/schemas/run-log.ts` |
| 5. Telemetry | `src/telemetry/`, `src/schemas/telemetry.ts` |
| 6. Configuration resolution | `src/state/load.ts`, `src/schemas/config.ts` |
| 7. Persona resolution | `src/personas/`, `src/schemas/config.ts` |
| 8. Verifier integration | `src/verifiers/`, `src/dispatch/promote.ts` |
| 9. Pathological-input guards | `src/state/load.ts` (size guards), `src/dag/build.ts` (lazy load), `src/integration/pathological-input.test.ts` |
| 10. Exit-code discipline | `src/errors.ts` (mapping), `src/commands/*/run.ts` (top-level handlers), `docs/exit-codes.md` |

### Integration Points

#### Internal Communication (Layer 1 ↔ Layer 2 ↔ Layer 3)

```
User
 │  /bmad-next --resume
 ▼
Layer 1 — Claude main thread reads commands/bmad-next.md
 │
 │  Bash: bun run src/commands/next/run.ts -- --resume
 ▼
Layer 2 — run.ts
 │  1. parseNextArgs → NextArgs
 │  2. acquireLock()                          (src/io/lock.ts)
 │  3. loadState() + buildDag()               (src/state, src/dag)
 │  4. computeNextStep(state, dag)            (src/dag)
 │  5. resolvePersona() + buildDispatchSpec() (src/personas, src/dispatch)
 │  6. write staging/<run-id>/dispatch-spec.json
 │  7. emit JSON instruction line on stdout: { "action": "dispatch", "runId": "...", "agent": "bmad-step-runner" }
 │  8. releaseLock()  (or transfer to verify-and-advance via lock-file path)
 │  9. exit 0
 │
 │  Layer 1 reads stdout JSON
 │  Task: <agent= bmad-step-runner>, prompt = read staging/<run-id>/dispatch-spec.json
 ▼
Layer 3 — sub-agent (bmad-step-runner)
 │  reads inputs/, writes outputs/ in staging/<run-id>/
 │  returns
 │
 │  Layer 1 then runs Bash: bun run src/commands/next/verify-and-advance.ts -- <run-id>
 ▼
Layer 2 — verify-and-advance.ts
 │  1. acquireLock()
 │  2. runVerifier(<run-id>)                  (src/verifiers)
 │  3. on pass: promote() + advanceState()    (src/dispatch, src/state)
 │     on fail: dispatchFailureUx(...)        (src/failure-ux)
 │  4. write transcript markdown + JSON       (src/transcript)
 │  5. releaseLock()
 │  6. emit single-line summary on stdout
 │  7. exit 0..5
 │
 ▼
Layer 1 prints summary to user.
```

#### External Integrations

- **BMAD upstream filesystem** (`~/.claude/plugins/<bmad>/**`): read-only via `src/bmad-detect/`. Never written to.
- **GitHub Releases API** (`api.github.com/repos/tgorka/bmad-stepper/releases/latest`): read-only via `src/upgrade/check.ts`. Only invoked by `--upgrade`.
- **Claude Code plugin marketplace**: side-effect of user typing `/plugin marketplace …`. Stepper does not call marketplace APIs.
- **Git** (any project repository where Stepper runs): read-only via `Bun.spawn(["git", "rev-parse", ...])`. Used by `src/io/snapshot.ts` to capture branch+sha and detect branch switches.

#### Data Flow Summary

```
state.yaml (canonical)
  ▲       │
  │       │ read on start
  │       ▼
  │  buildDag (3-tier resolver) ◀── seed-v6.x.ts (tier 1)
  │       │                       ◀── bmad-stepper.config.yaml (tier 2)
  │       │                       ◀── _bmad/<module>/skill.yaml (tier 3 frontmatter parse)
  │       ▼
  │  computeNextStep(state, dag)
  │       │
  │       ▼
  │  generateDispatchSpec → staging/<run-id>/dispatch-spec.json
  │                                        │
  │                                        ▼
  │                              [sub-agent runs] → staging/<run-id>/outputs/
  │                                        │
  │                                        ▼
  │  runVerifier(<run-id>) → staging/<run-id>/verifier-result.json
  │       │
  │       ├── on pass → promote → canonical artifact path + advance state
  │       │              │
  │       │              ▼
  │       └─ on fail → dispatchFailureUx (retry|skip|route-to-fixer|escalate)
  │                       │
  │                       ▼
  └──── advanceState ── atomic write state.yaml.tmp → rename ── state.yaml
                                 │
                                 ▼
                        write transcript + run-log JSON
                                 │
                                 ▼
                        if telemetry.enabled → telemetry/<period>.jsonl record
```

### File Organization Patterns

#### Configuration Files (root level)

- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml` — runtime/tooling configuration. Pinned versions per step-03 decisions.
- `.changeset/config.json` — Changesets configuration.
- `.github/dependabot.yml` — automated dependency PRs.

#### Source Organization (`src/`)

- One directory per **bounded concern** (state, dag, dispatch, …). 14 directories.
- Each directory has an `index.ts` re-exporting its public surface; private helpers stay unexported.
- Tests colocated as `*.test.ts`. No `tests/` directory inside `src/`.

#### Test Organization

- Unit tests: colocated `<source>.test.ts` (P7).
- Integration tests: `src/integration/<flow>.test.ts`. One file per cross-cutting flow.
- Smoke tests: `src/smoke/<command>.test.ts`. One file per slash command.
- Fixtures: `tests/fixtures/` (project root, outside `src/`). Loaded by integration/smoke tests via tmpdir copy.

#### Asset Organization

- Plugin manifest: `.claude-plugin/plugin.json`.
- Slash commands: `commands/*.md` (root level — required by Claude Code plugin spec).
- Sub-agent definitions: `agents/*.md` (root level — required by Claude Code plugin spec).
- User documentation: `docs/`.
- Reusable user examples: `examples/`.

### Development Workflow Integration

**Development server:** Stepper has no long-running server. Development workflow is `bun test --watch` while editing TS modules; Claude Code reloads slash-command markdown changes when the plugin is re-loaded (`/plugin reload bmad-stepper` if needed).

**Build process:** none. `package.json` has no `build` script. Source files in `src/` are loaded directly by Bun at runtime via `bun run src/...`. The plugin manifest's command files are markdown.

**Release process:** Changesets PR-based flow. `bun run changeset` creates a Changeset entry; merging the auto-generated *Version Packages* PR publishes a GitHub Release; users update via `/plugin marketplace update tgorka/bmad-stepper`.

**Deployment structure:** the plugin is its own deployment unit. The repository tarball *is* the artifact installed by the marketplace. There is no separate dist or container.

## Architecture Validation Results

### Coherence Validation

#### Decision Compatibility — PASS (with two corrections)

| Check | Result |
|-------|--------|
| TypeScript strict + ESM + Bun runtime | ✅ Bun runs `.ts` directly; `module: Preserve` + `verbatimModuleSyntax` aligned with strict ESM. |
| `Bun.YAML` for config + Zod for validation | ✅ Independent layers: parse with Bun, validate with Zod. |
| Throw-everywhere errors + Result-typed CLI parser | ✅ Justified inconsistency; both compile under strict mode. |
| File-based dispatch + Task tool API | ✅ Task tool accepts arbitrary prompt; passing the dispatch-spec path satisfies the invocation contract. |
| Atomic tmp+rename + lock + `.bak` | ✅ All three are commutative — lock held over the entire write sequence; tmp+rename is the write itself; `.bak` is pre-write rotation. |
| Hybrid execution model + slash command markdown patterns | ✅ Layer 1 (markdown) calls Bash for Layer 2 and Task for Layer 3 — both are standard Claude Code tools. |
| Source-as-release + `bun test --shard` CI matrix | ✅ Matrix runs against source files; no build to gate. |

**Correction 1 — Lock semantics across dispatch sequence (CRITICAL):**

The original component decomposition implied verify-and-advance re-acquires the lock after dispatch, but kept the lock held across the (5+ minute) sub-agent run. That is incoherent: `run.ts` exits between dispatch-spec generation and Task invocation, so its heartbeat dies and the lock is detected as stale by anyone else. **Resolution:** make `run.ts` **read-only and lock-free**; only `verify-and-advance.ts` acquires the lock. To prevent TOCTOU between read and verify-and-advance, `verify-and-advance.ts` re-reads `state.yaml` after lock acquisition, recomputes a state-hash over `(lastSuccessfulStep, lastAttempted)`, and compares to the snapshot in `staging/<run-id>/dispatch-spec.json`. On mismatch → halt with `STATE_CHANGED_DURING_DISPATCH` (exit 1) and an actionable hint pointing the user at `--diff-state`.

**Correction 2 — `--doctor` is a flag, not a separate slash command (IMPORTANT):**

PRD §api_surface explicitly lists `--doctor` and `--upgrade` as diagnostic *flags*, not separate slash commands. Step-06 introduced a `commands/bmad-doctor.md` file as a peer of `bmad-next` and `bmad-loop`. **Resolution:** `--doctor` and `--upgrade` are flags on `/bmad-next`. The optional convenience alias `commands/bmad-doctor.md` is preserved as a thin wrapper that simply forwards to `--doctor` (zero new behavior — the runner code lives in `src/commands/doctor/`). This keeps PRD intent intact while still surfacing a single-token slash command for muscle memory.

#### Pattern Consistency — PASS

| Check | Result |
|-------|--------|
| Naming conventions (P1) align with TS idioms used in src/ | ✅ |
| Repository structure (P2) supports module boundary graph from §Architectural Boundaries | ✅ |
| Persisted shapes (P3) match Zod schemas declared in `src/schemas/` | ✅ |
| Function semantics (P4 throw-everywhere) align with `errors.ts` discriminated-union (D11) | ✅ |
| Sub-agent dispatch contract (P5) matches the data flow drawn in step-06 §Internal Communication | ✅ |
| Slash-command markdown patterns (P6) are followed by all three commands | ✅ |
| Test patterns (P7) use the locations reserved in §Repository Structure | ✅ |
| Code quality enforcement (P8) maps to specific CI gates | ✅ |

#### Structure Alignment — PASS

The 14 `src/` directories cleanly partition the design space — each module owns exactly one of: foundational primitives (`io`, `errors`, `schemas`), state lifecycle (`state`, `migrations`), workflow registry (`dag`, `personas`, `bmad-detect`), execution (`dispatch`, `verifiers`, `failure-ux`, `transcript`, `telemetry`, `upgrade`), or surface (`commands`). No module has cross-responsibility.

### Requirements Coverage Validation

#### Functional Requirements — 54/54 covered

The §Requirements to Structure Mapping table lists every FR with at least one primary location plus supporting code. No orphan FRs detected.

#### Non-Functional Requirements — 35/35 covered

The §Non-Functional Requirements table maps every NFR to either an enforcement code path or a CI gate. NFR-M5 is the only requirement without a code gate (maintainer hours tracked manually) — accepted because it is a *trend* metric, not a binary check.

#### Cross-Cutting Concerns — 10/10 covered

Each of the ten concerns identified in step-02 has at least one implementation location specified in §Cross-Cutting Concerns to Locations.

#### PRD-Deferred Questions — 5/5 closed

| PRD-deferred | Closed in |
|--------------|-----------|
| Step registry discovery mechanism (PRD §11) | D5 (three-tier resolver) |
| Verifier strategy evolution (PRD §12) | D9 (per-step config + telemetry-driven evolution) |
| Sub-agent dispatch interface | D2 (Task tool against `agents/`) |
| Telemetry storage layout | D7 + D8 (period-based JSONL + markdown) |
| Schema-migration runner | D8 (in-band per-schema registries) |

### Implementation Readiness Validation

#### Decision Completeness — PASS

| Check | Status |
|-------|--------|
| All critical decisions documented with versions | ✅ Bun ≥ 1.3, Zod 4, Biome 2.3, Changesets latest, oven-sh/setup-bun@v2 |
| Implementation patterns are example-bearing | ✅ P3 has full file-shape examples; P5 has a complete dispatch-spec.json |
| Consistency rules are enforceable | ✅ Biome rules + CI gates + errors.test.ts + scope-check tests |
| Examples for every major pattern | ✅ |

#### Structure Completeness — PASS

The complete project tree in §Project Structure & Boundaries enumerates every file and directory. Integration points are mapped in §Internal Communication. Module boundaries are explicit in §Architectural Boundaries.

#### Pattern Completeness — PASS

All conflict points identified in step-05 have a locked pattern. No "TBD" or "decided later" markers remain in the document.

### Gap Analysis Results

| Gap | Priority | Resolution |
|-----|----------|------------|
| Lock semantics ambiguity across dispatch sequence | **Critical** | Resolved in §Coherence Validation Correction 1 — `run.ts` is read-only and lock-free; `verify-and-advance.ts` acquires lock + re-validates state hash. New error: `STATE_CHANGED_DURING_DISPATCH`. |
| `--doctor` shape inconsistency (flag vs separate command) | **Important** | Resolved in §Coherence Validation Correction 2 — flag-canonical; `commands/bmad-doctor.md` is a thin alias. |
| `run.ts` stdout protocol not concretized | **Important** | `run.ts` emits exactly one JSON line on stdout: `{ "action": "dispatch" \| "report" \| "halt", "runId"?: string, "agent"?: string, "message"?: string, "exitCode": number }`. Layer 1's slash-command markdown reads this single line and branches accordingly. Other modes (`--dry-run`, `--explain`, `--list`) use `action: "report"` and pass content via `message`. Spec lives in `src/schemas/dispatch-protocol.ts` (a new schema file added to step-06's tree). |
| Token-budget tracking flow not concretized | **Important** | The Task tool's response (in Claude Code) yields token counts. Layer 1 captures these and passes them to `verify-and-advance.ts` via a positional argument: `bun run src/commands/next/verify-and-advance.ts -- <run-id> --tokens-in <n> --tokens-out <n>`. The script writes them into the run-log JSON and the `runHistory[]` entry on `state.yaml`. The loop runner sums `tokensIn + tokensOut` across iterations and halts on `--token-budget` exceeded. |
| `AGENTS.md` content not specified | Minor | Documented in step-08 handoff: contributor + sub-agent contract, declared as a v0.1 deliverable. |
| `SECURITY.md` content not specified | Minor | Standard OSS practice (vuln reporting email, supported versions table). v0.1 deliverable. |
| Telemetry "no PII" enforcement field whitelist | Minor | `src/schemas/telemetry.ts` declares `TelemetryRecordV1Schema` with an explicit closed-set field list: `schemaVersion, ts, step, phase, persona, model, durationMs, verifierStatus, retries, tokensIn, tokensOut, errorCode?`. Anything else fails Zod validation on collect. |
| `.claude-plugin/plugin.json` field set | Minor | Required: `name, version, description, author, homepage, repository, license, keywords`. Optional: `commands` (paths to command files; defaults work). Step-06 §Marketplace metadata covered keywords; the rest is boilerplate. |
| Behavior outside a BMAD project | Important | Add a `BMAD_NOT_INSTALLED` (exit 3) check at the top of every command runner. Detect by absence of any directory under `~/.claude/plugins/` matching `bmad-method-*` AND absence of a `_bmad/` directory in the project root. Hint: `Run npx bmad-method install --tools claude-code first.` |

### Critical Gap Resolutions Applied to the Document

The following architectural updates are now part of the v1 architecture (applied to in-document data):

1. **`run.ts` is read-only.** No lock acquired in `src/commands/next/run.ts` or `src/commands/loop/run.ts`'s per-iteration step-compute. Lock is acquired only in `src/commands/next/verify-and-advance.ts` (and the loop runner's commit phase).
2. **State-hash check in `verify-and-advance.ts`.** Reads `state.yaml`, re-computes a stable hash over `(lastSuccessfulStep, lastAttempted)` and compares to the snapshot stored in `staging/<run-id>/dispatch-spec.json` at dispatch-time. Mismatch → `STATE_CHANGED_DURING_DISPATCH` error.
3. **`STATE_CHANGED_DURING_DISPATCH` added to error registry.** `code: "STATE_CHANGED_DURING_DISPATCH"`, `exitCode: 1`, hint: `Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state.`
4. **`BMAD_NOT_INSTALLED` added to error registry.** `code: "BMAD_NOT_INSTALLED"`, `exitCode: 3`, hint: `Run npx bmad-method install --tools claude-code first.`
5. **`run.ts` JSON line protocol added.** Schema declared in `src/schemas/dispatch-protocol.ts`. Slash-command markdown reads exactly one line from `bun run`'s stdout and branches.
6. **Token counts threaded through verify-and-advance.** Slash-command markdown captures Task response token counts and forwards them as flags. Loop runner aggregates for `--token-budget` enforcement.
7. **`commands/bmad-doctor.md` is a thin alias.** Its body delegates to `bun run src/commands/doctor/run.ts -- $ARGUMENTS`. Functionally equivalent to `/bmad-next --doctor` invoking the same runner.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed (step-02)
- [x] Scale and complexity assessed (high; 100 epics × 1000 stories; 50 k-line PRD)
- [x] Technical constraints identified (Bun-only, source-as-release, deps = Bun stdlib + Zod 4)
- [x] Cross-cutting concerns mapped to locations (§Cross-Cutting Concerns to Locations)

**Architectural Decisions**

- [x] 14 critical/important decisions documented with versions and rationale (D1–D14)
- [x] Technology stack fully specified (step-03 + D3, D4, D8, D11, D12, D14)
- [x] Integration patterns defined (§Internal Communication, §External Integrations)
- [x] Performance considerations addressed (NFR-P1–P6 mapped to enforcement)

**Implementation Patterns**

- [x] Naming conventions established (P1)
- [x] Structure patterns defined (P2)
- [x] Communication patterns specified (P5, P6)
- [x] Process patterns documented (P4 errors, P7 tests, P8 enforcement)

**Project Structure**

- [x] Complete directory structure defined (§Complete Project Directory Structure)
- [x] Component boundaries established (§Module Boundaries Inside `src/`)
- [x] Integration points mapped (§Internal Communication)
- [x] Requirements to structure mapping complete (54/54 FRs, 35/35 NFRs)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH — every PRD requirement has a documented architectural home; every cross-cutting concern has at least one enforcement location; no decisions are deferred to implementation that would block a sub-agent from picking up an early story.

**Key Strengths:**

- **Three-layer execution model** cleanly separates orchestration (Claude), determinism (Bun), and isolation (sub-agents). Each layer is independently testable.
- **File-as-truth state machine** with three-tier registry resolution closes all five PRD-deferred design questions and makes the system inspectable, branch-aware, and recoverable.
- **Errors-as-primary-UX** pattern is enforceable in CI: the registry test asserts every error class has an actionable hint.
- **Source-as-release** + Bun-native tooling minimizes the build-pipeline surface to nearly zero. Distribution is just the repository tarball.
- **Read-only respect for upstream BMAD** is structurally guaranteed (CI gate + scope-check), making maintenance moat (PRD strategic concern) compile-time enforced rather than convention-based.

**Areas for Future Enhancement:**

- **Parallel sub-agent dispatch** (PRD growth feature). The dispatch interface is sequential by construction in v0.1 but the staging-directory model (one `<run-id>` per dispatch) lifts cleanly to parallel.
- **LLM-as-judge verifier** (PRD §12). The verifier-config object can grow a `judge:` field that points at a specialized sub-agent; current shape doesn't preclude this.
- **Remote telemetry upload** (PRD growth). The JSONL schema in `src/schemas/telemetry.ts` is already remote-upload-friendly; only the upload mechanism is deferred.
- **`--init` for `bmad-stepper.config.yaml` template** (PRD growth). The Zod config schema can generate the starter via `z.toJsonSchema()` if/when needed.
- **`--visualize` for DAG dot output** (PRD growth). The adjacency-list representation lifts to Graphviz dot trivially.

### Implementation Handoff

**For sub-agents and contributors implementing this architecture:**

- Follow all architectural decisions exactly as documented. The 14 decisions in §Core Architectural Decisions and 8 patterns in §Implementation Patterns are binding for v0.1.
- Use implementation patterns consistently. Naming, structure, format, and process patterns are CI-gated.
- Respect project structure and boundaries. Module dependencies flow strictly downward in the boundary graph; foundational modules have no upward imports.
- Refer to this document for any architectural question. Open questions discovered during implementation should be raised as PRD/architecture amendments — never silently resolved in code.

**First Implementation Story (the canonical "story 1"):**

Initialize the repository following step-03 §Initialization Sequence. The output is a working empty plugin scaffold that:

1. Has `bun init` baseline with TypeScript strict + ESNext + Preserve modules.
2. Has `.claude-plugin/plugin.json` shaped per Anthropic's example-plugin reference.
3. Has placeholder `commands/bmad-next.md`, `commands/bmad-loop.md`, optionally `commands/bmad-doctor.md`.
4. Has Biome 2.3 config from `biome init`.
5. Has Changesets initialized.
6. Has GitHub Actions CI matrix (Linux + macOS) running `bun test` and `biome ci`.
7. Has Zod 4 added as the only runtime dep.
8. Has `src/errors.ts` skeleton + a single `src/errors.test.ts` proving the registry-test gate.
9. Has the `_bmad-output/.stepper/` directory tree convention documented in the README's Quick Start.
10. Has a smoke test: `bun test src/smoke/` (initially empty, just running `bun test` exits 0).

This story unblocks all subsequent stories because it instantiates every binding decision in this architecture. Subsequent stories (in PRD-suggested implementation order) build on top in the order from §Decision Impact Analysis: errors → CLI parsing → state IO → migrations → registry → DAG → personas → snapshot → verifier → dispatch → upgrade → assemblies for `/bmad-next` and `/bmad-loop`.

## Workflow Completion

**Status:** Architecture workflow complete. All eight steps closed.

**Document sections delivered:**

1. Project Context Analysis — 54 FRs and 35 NFRs categorized; cross-cutting concerns mapped; five PRD-deferred questions identified.
2. Starter Template Evaluation — `bun init` + Anthropic example-plugin reference selected; six pinned tooling versions.
3. Core Architectural Decisions — 14 decisions (D1–D14) with rationale, trade-offs, and rejected alternatives.
4. Implementation Patterns & Consistency Rules — 8 pattern categories (P1–P8) with concrete examples and CI-gated enforcement.
5. Project Structure & Boundaries — complete directory tree, three-layer boundary, module dependency graph, FR/NFR-to-location mapping for all 89 requirements.
6. Architecture Validation Results — coherence/coverage/readiness checks all pass; nine gaps identified, two critical resolved in-document, seven addressed by reference.
7. Implementation Handoff — first implementation story defined; subsequent story sequence ordered.

**Five PRD-deferred questions closed:**

- Step registry discovery → D5 three-tier resolver
- Verifier strategy → D9 conservative + telemetry-driven evolution
- Sub-agent dispatch interface → D2 standard Task tool
- Telemetry storage layout → D7 + D8 period-based JSONL + markdown
- Schema-migration runner → D8 in-band per-schema registries

**Two critical coherence corrections applied:**

- Lock semantics across dispatch sequence — `run.ts` is now read-only; `verify-and-advance.ts` re-validates state hash; new `STATE_CHANGED_DURING_DISPATCH` error.
- `--doctor` is a flag, not a separate slash command — `commands/bmad-doctor.md` retained as a thin alias to preserve muscle memory.

This document is the binding architectural reference for all v0.1 implementation work. Amendments require an explicit PRD/architecture revision.
