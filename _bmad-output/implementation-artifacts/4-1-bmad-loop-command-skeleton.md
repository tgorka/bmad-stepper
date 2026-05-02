---
status: done
story_id: '4.1'
story_key: 4-1-bmad-loop-command-skeleton
epic: '4'
title: '`/bmad-loop` Command Skeleton'
created: '2026-05-02'
last_updated: '2026-05-02'
priority: H
estimated_effort: M
fr_coverage:
  - FR8
  - FR9
  - FR19
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R4
  - NFR-M3
  - NFR-I2
ar_coverage:
  - AR8
  - AR9
  - AR21
  - AR22
  - AR33
  - AR34
  - AR41
  - AR42
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-3-retrospective.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/3-2-resume-flag.md
  - _bmad-output/implementation-artifacts/3-3-dry-run-flag.md
  - _bmad-output/implementation-artifacts/3-6-explain-reasoning-trace.md
  - _bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md
  - _bmad-output/implementation-artifacts/3-8-diff-state-and-export-state.md
  - _bmad-output/implementation-artifacts/3-9-watch-live-transcript-tail.md
  - _bmad-output/implementation-artifacts/3-10-non-locking-read-flags.md
  - _bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md
  - _bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - .bmad-stepper/config.yaml
  - src/commands/next/run.ts
  - src/commands/next/args.ts
  - src/commands/next/index.ts
  - commands/bmad-next.md
  - src/errors.ts
---

# Story 4.1: `/bmad-loop` Command Skeleton

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-loop` as a slash command with its argument schema and runner skeleton,
So that the loop infrastructure is in place before stop conditions are added.

## Context Summary

This is the **first story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and it lands the **structural skeleton** for the `/bmad-loop` slash command without yet implementing any of the eight stop-condition types beyond `--max-iters` (which is itself the **only** stop condition required for AC-1 of Story 4.1; the other stop conditions — `--until-epic-end`, `--until-story <x.y>`, `--next-story`, `--phase-end`, `--time-budget`, `--token-budget`, `--stop-on-error`/`--continue-on-error`, default `max-iters=50` cap — are deferred to Stories 4.2-4.10).

Epic 3 (Resume, Inspection & State Export) closed with all 10 stories `done` and the OPTIONAL `epic-3-retrospective` step `done` (per `_bmad-output/implementation-artifacts/sprint-status.yaml:81`). The Epic 3 retrospective's §Forward Action Items §Epic 4 explicitly enumerates pre-work for Story 4.1 (line 158): "Epic 3 secondary-consumer surface area is now stable: loop runner may invoke `runNext` with `--explain` per iteration (Story 3.6); may invoke `--diff-state` per iteration to detect drift (Story 3.8); may invoke `--list` per iteration to surface candidate set (Story 3.7). Story 4.1 may add `--explain-each` / `--diff-each` / `--list-each` flags." Story 4.1 ships the **runner skeleton** that calls `runNext` exactly once per iteration on the happy path; the per-iteration secondary flags are forward-deferred to subsequent Epic 4 stories (per Story 4.7 `--plan-first` reuse of Story 3.3 + 3.6 helpers).

**The runner skeleton is structured as a thin orchestrator** that:

1. Parses CLI argv into a Zod-validated `LoopArgs` object (Task 2 — `src/commands/loop/args.ts`).
2. Initialises the iteration counter at 0 and an `iterations: IterationRecord[]` accumulator.
3. **Stop-condition gate (AC-1 / Story 4.1 only):** if `args.maxIters !== undefined && iterCount >= args.maxIters`, exit cleanly with reason `max-iters reached`. (Stories 4.2-4.10 will add the other 7 stop conditions to this gate.)
4. **Dispatches one iteration** by invoking `runNext` (the canonical `src/commands/next/run.ts` runner — Story 2.4 → 3.x extensions) via the in-process function call (NOT via subprocess spawn — that would defeat AR9 boundary discipline + add ~30ms overhead per iteration). The skeleton imports `runNext` directly per AR41 (top-tier `src/commands/loop/run.ts` may import top-tier `src/commands/next/run.ts` per the architectural boundary graph).
5. **Records the iteration outcome:** `{ iterCount, runId, action, exitCode, durationMs }` is appended to `iterations[]`. The skeleton does NOT yet wire the iteration record to a checkpoint or state-write; that's Story 4.8 (`--checkpoint-each`).
6. **Increments `iterCount`** and re-evaluates the stop-condition gate.
7. **On stop-condition fire:** emits a single AR9 JSON line `{ action: "report", message: "<exit reason>", exitCode: 0 }` declaring the exit reason (e.g., `"max-iters (1) reached"`) and exits via `process.exit(0)`. (This emission ONLY happens when the loop runs as `import.meta.main` — when called from tests, the skeleton returns the `LoopResult` for in-process inspection per the AR9 + return-shape testability pattern established by Stories 3.8 + 3.9.)

**Story 4.1 is INTENTIONALLY MINIMAL on stop-condition wiring.** AC-1 (epics.md line 900-901) says: "**When** `/bmad-loop --max-iters 1` is invoked **Then** the loop runs exactly one iteration of the `/bmad-next` happy path and exits cleanly with exit reason `max-iters reached`". This is the **only** stop condition required for Story 4.1. The other seven stop-condition types are owned by:

- Story 4.2 — `--until-epic-end` and `--until-story <x.y>` (purely-functional `(state, dag) => boolean` predicates in `src/commands/loop/stop-conditions.ts`).
- Story 4.3 — `--next-story` and `--phase-end` (sibling pure functions).
- Story 4.4 — `--max-iters N` with default `--max-iters=50` cap when no other condition is supplied (FR25).
- Story 4.5 — `--time-budget <ms>` and `--token-budget <tokens>` with 80%/100% warning emission.
- Story 4.6 — `--stop-on-error` (default) and `--continue-on-error` (opt-in).
- Story 4.7 — `--plan-first` dry-run preview.
- Story 4.8 — `--checkpoint-each <step-type>`.
- Story 4.9 — SIGINT graceful exit (NFR-R5 30s budget).
- Story 4.10 — Loop exit reason + resume hint format.

**Story 4.1's `LoopArgsSchema` MUST declare ALL the future flag names** per AC-2 verbatim (epics.md line 902): "`untilEpicEnd?`, `untilStory?`, `nextStory?`, `phaseEnd?`, `maxIters?`, `timeBudgetMs?`, `tokenBudget?`, `stopOnError?`, `continueOnError?`, `interactive?`, `autoFix?`, `planFirst?`, `checkpointEach?`". The Zod schema parses ALL 13 fields; only `maxIters` is RUNTIME-WIRED in Story 4.1; the other 12 are ARG-SURFACE-PRESENT but RUNTIME-DEFERRED (the runner accepts them, validates them via Zod, but does NOT branch on them — Stories 4.2-4.10 + 5.1-5.3 wire them progressively). This mirrors Story 1.7's pattern where `NextArgsSchema` declared all future flag names that subsequent stories progressively wired.

**The 13 LoopArgsSchema fields per AC-2 verbatim:**

| Field | Zod type | Story | Notes |
|-------|----------|-------|-------|
| `untilEpicEnd` | `boolean().optional()` | 4.2 | `--until-epic-end` flag |
| `untilStory` | `string().regex(/^\d+\.\d+$/).optional()` | 4.2 | `--until-story 3.2` flag (x.y format) |
| `nextStory` | `boolean().optional()` | 4.3 | `--next-story` flag |
| `phaseEnd` | `boolean().optional()` | 4.3 | `--phase-end` flag |
| `maxIters` | `number().int().positive().optional()` | 4.1 (THIS STORY) + 4.4 | `--max-iters N` flag; AC-1 wires runtime |
| `timeBudgetMs` | `number().int().positive().optional()` | 4.5 | `--time-budget <ms>` flag (in milliseconds per AC) |
| `tokenBudget` | `number().int().positive().optional()` | 4.5 | `--token-budget <tokens>` flag |
| `stopOnError` | `boolean().optional()` | 4.6 | `--stop-on-error` flag (default policy) |
| `continueOnError` | `boolean().optional()` | 4.6 | `--continue-on-error` flag (opt-in) |
| `interactive` | `boolean().optional()` | 5.5 | `--interactive` flag (Story 5.5 pause-between-steps) |
| `autoFix` | `boolean().optional()` | 5.3 | `--auto-fix` flag (Story 5.3 route-to-fixer) |
| `planFirst` | `boolean().optional()` | 4.7 | `--plan-first` flag (dry-run preview) |
| `checkpointEach` | `enum(["story","epic","phase"]).optional()` | 4.8 | `--checkpoint-each <step-type>` flag |

**The slash-command markdown body per AC-3 verbatim** (epics.md line 903): "the markdown body follows AR34 (Bash → JSON line read → Task → Bash verify-and-advance) but in a loop with iteration counter". AR34 is the **slash-command markdown protocol** established by P6 in `_bmad-output/planning-artifacts/architecture.md:919-952` and consumed by Story 2.7 (`commands/bmad-next.md` Layer 1 markdown). The protocol is:

1. **Bash step**: Run `bun run <plugin-root>/src/commands/<verb>/run.ts -- $ARGUMENTS` via the Bash tool.
2. **JSON line read**: Read the output (a single AR9 discriminated-union JSON line declaring next action: `dispatch` | `report` | `halt`).
3. **Task step**: If `dispatch` action: invoke Task tool with the spec at `staging/<run-id>/dispatch-spec.json`.
4. **Bash verify-and-advance step**: After Task returns, run `bun run <plugin-root>/src/commands/<verb>/verify-and-advance.ts` via Bash.

Story 4.1's `commands/bmad-loop.md` extends the AR34 pattern with a **loop wrapper**: the four-step sequence runs **inside an iteration loop** that increments a counter and checks stop conditions. The pseudo-code skeleton:

```
ITERATIONS = 0
while STOP_CONDITION_NOT_FIRED:
  result = bash("bun run <plugin-root>/src/commands/loop/run.ts --once")  # one iteration
  if result.action == "halt": exit with halt_reason
  if result.action == "dispatch": invoke Task; bash verify-and-advance
  if result.action == "report": print message
  ITERATIONS += 1
  if --max-iters N reached: exit with "max-iters reached"
```

**Implementation note (Story 4.1 specific):** rather than have the slash-command markdown manage the iteration loop in natural language (which would be brittle and require Claude to track state across many turns), Story 4.1's runner-tier (`src/commands/loop/run.ts`) handles the iteration loop **internally** as a Bun process. The slash-command markdown is a thin wrapper that runs `bun run <plugin-root>/src/commands/loop/run.ts -- $ARGUMENTS` ONCE; the runner internally invokes `runNext` via in-process function call (NOT subprocess spawn) for each iteration; the per-iteration `dispatch` actions are emitted as separate AR9 lines on stdout (or buffered and emitted at end as a structured report — see §Design Decisions §OQ-3). The slash-command markdown reads the FINAL AR9 line and reports the final exit reason to the user.

**Concretely, Story 4.1 produces:**

1. **`src/commands/loop/args.ts`** (NEW, ~120-180 lines): `LoopArgsSchema` Zod schema declaring the 13 fields per AC-2; `parseLoopArgs(argv: string[]): Result<LoopArgs, ParseError>` parser function (mirroring Story 1.7's `parseNextArgs` Result-shape per architecture P4 line 858 — argument parsing is the **sole exception** to throw-not-Result discipline). Mirror Story 1.7's `src/commands/next/args.ts` structure verbatim.

2. **`src/commands/loop/run.ts`** (NEW, ~150-250 lines): the loop runner skeleton. Imports `runNext` from `../next/run.ts` (top-tier sibling import per AR41). Single function `runLoop(opts: LoopOpts): Promise<LoopResult>` that:
   - Accepts pre-parsed args (`opts.args`) OR parses argv internally via `parseLoopArgs`.
   - Initialises `iterations: IterationRecord[] = []` and `iterCount = 0`.
   - Loops: check stop conditions (`maxIters` only in Story 4.1) → if fire, break with reason; else, invoke `runNext` once with the per-iteration argv (e.g., `[]` for the happy path; or pass-through of `--explain` / `--list` etc. via `opts.args.passThroughArgs` — deferred to Story 4.7 `--plan-first`).
   - After `runNext` returns, append `IterationRecord` to `iterations[]`; increment `iterCount`.
   - On stop-condition fire, return `LoopResult` with `{ exitReason, exitCode, iterations, durationMs }`.
   - The `import.meta.main` block calls `runLoop({ argv: Bun.argv.slice(2) })` and emits a single AR9 JSON line `{ action: "report", message: "<exit reason> (<iterCount> iterations)", exitCode: 0 }` to stdout, then exits via `process.exit(loopResult.exitCode)`.

3. **`src/commands/loop/index.ts`** (NEW, ~10-20 lines): barrel re-export per Story 1.6 + Story 3.9 precedent. Re-exports `runLoop`, `parseLoopArgs`, `LoopArgsSchema`, types `LoopArgs`, `LoopResult`, `IterationRecord`, `StopReason`.

4. **`commands/bmad-loop.md`** (NEW, ~80-150 lines): the Layer 1 slash-command markdown per AR34 (P6 architecture pattern). Mirrors `commands/bmad-next.md` (Story 2.7) verbatim structure: frontmatter (`description`, `argumentHint`, `allowedTools: ["Bash", "Task", "Read"]`) + body sections (Usage examples, Behavior, Tool restrictions). Body declares the loop-wrapping behaviour: run `bun run src/commands/loop/run.ts -- $ARGUMENTS` ONCE; the runner manages iteration internally; the slash-command reads the final AR9 line and prints the human-readable summary.

5. **Registration in `src/commands/index.ts`** (MODIFIED, ~5-10 lines): add `loop` namespace export to the existing `next` registry. Mirrors how `next` is currently registered. (Verify the file exists; if it doesn't, this is the first commands-level barrel — Story 4.1 may create `src/commands/index.ts` if missing.)

6. **`src/commands/loop/args.test.ts`** (NEW, ~150-250 lines): colocated Zod schema + parser unit tests. ~12-18 test cases covering: each of the 13 fields parses correctly when supplied; missing fields default to `undefined`; invalid types reject (e.g., `--max-iters foo` → ParseError); `--until-story 3.2` regex passes; `--until-story 3` (no minor) regex fails; positive-int constraints enforced; mutually-exclusive flag combinations are accepted at args layer (validation deferred to runtime per Story 4.6 + 5.5 patterns).

7. **`src/commands/loop/run.test.ts`** (NEW, ~150-250 lines): colocated runner unit tests. ~6-10 test cases covering: (a) `runLoop({ argv: ["--max-iters", "1"] })` returns `LoopResult` with `iterCount === 1` AND `exitReason === "max-iters reached"` AND `exitCode === 0` AND `iterations.length === 1`; (b) `runLoop` invokes `runNext` exactly ONCE per iteration (spy assertion); (c) the `IterationRecord` shape includes `runId`, `action`, `exitCode`, `durationMs`; (d) `runLoop({ argv: [] })` (no max-iters supplied — Story 4.4 default cap NOT yet wired in 4.1) currently does what? — see §Open Questions §OQ-1; v0.1 conservative answer: Story 4.1 requires `maxIters` to be supplied (no default cap yet); calling `runLoop({ argv: [] })` halts immediately with `exitReason === "no stop condition supplied (Story 4.4 default cap not yet wired)"` AND `exitCode === 2` (configuration error per FR53). This is forward-replaced by Story 4.4 with `--max-iters=50` default.

8. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `epic-4: backlog → in-progress` (auto-flip on first story create per skill convention) AND `4-1-bmad-loop-command-skeleton: backlog → ready-for-dev`. Also bumps the file's `last_updated:` timestamp.

**FR/NFR/AR mapping:**

- **FR8** (`/bmad-next` single-step advance): CONSUMED by Story 4.1 — the loop runner invokes `runNext` once per iteration. The dispatch path is unchanged.
- **FR9** (`--dry-run`): CONSUMED via the Story 4.7 `--plan-first` forward-tracker (not yet wired in 4.1). The loop runner accepts but does not yet branch on `--plan-first`.
- **FR19** (Bounded Loop Execution — eight stop-condition types): PARTIAL (1 of 8). Story 4.1 wires `--max-iters` only; Stories 4.2-4.10 wire the rest.
- **FR53** (documented exit codes): EXTENDED. Story 4.1's `runLoop` returns `exitCode: 0` on the happy path (max-iters reached); `exitCode: 2` on configuration error (no stop condition supplied — temporary v0.1 behaviour pre-Story-4.4).
- **FR54** (stdout/stderr discipline): PRESERVED. The loop runner emits a SINGLE AR9 JSON line `{ action: "report", ... }` on stdout (per AR9); per-iteration logging is forwarded via stderr (per the existing `runNext` + AR9 conventions).
- **NFR-P1** (next-step computation < 500ms p95): PRESERVED. The loop runner adds bounded per-iteration overhead (counter increment + stop-condition check + `IterationRecord` append — all sub-millisecond); the dominant cost is the per-iteration `runNext` invocation which is itself NFR-P1-compliant.
- **NFR-S2** (writes only inside scope): PRESERVED. The loop runner does NOT introduce new write paths; per-iteration writes flow through the existing `runNext → verify-and-advance` chain.
- **NFR-S5** (atomic writes + locks): PRESERVED. The loop runner does NOT acquire any new lock; per-iteration `runNext` is structurally lock-free per AR8 + Story 2.4's contract; per-iteration `verify-and-advance.ts` (lock-held side) is unchanged.
- **NFR-R1** (zero data loss on halt): PRESERVED. Per-iteration halts flow through the existing `runNext` halt path (Story 3.1's `state.lastFailureReason` + `state.lastAttempted` recording); the loop runner halts on first-error per AC-1's "exits cleanly" wording.
- **NFR-R4** (lock release on graceful exit): PRESERVED. Per-iteration `verify-and-advance.ts` releases the lock per existing semantics.
- **NFR-M3** (machine-readable JSON for `--export-state`): UNCHANGED — Story 4.1 does NOT touch `--export-state`.
- **NFR-I2** (unknown-skill fail-loud): PRESERVED — the loop runner does NOT bypass DAG resolution; per-iteration `runNext` continues to fail-loudly on unknown DAG nodes.
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): EXTENDED. The loop runner is itself top-tier; it imports the top-tier `runNext` per AR41; it does NOT import `src/lock/`. The per-iteration lock-acquiring path remains via the unchanged `verify-and-advance.ts`.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED. The loop runner emits a single AR9 line at exit (`{ action: "report", message: "<exit reason>", exitCode: 0 }`); per-iteration AR9 lines from `runNext` are captured in-process and folded into the final summary (NOT emitted as separate lines on stdout — see §Design Decisions §OQ-3 for the buffered-vs-streamed adjudication).
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.1 ships ZERO new error classes — all halt translations flow through the existing `runNext` halt path. The 16-code registry stays at 16.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The runner-tier function `runLoop` throws `StepperError` subclasses on failure (NOT Result); the args parser uses Result per the architecture P4 line 858 sole-exception rule; ZERO `console.*` calls; all I/O is async/await.
- **AR34** (slash-command markdown protocol — Bash → JSON line read → Task → Bash verify-and-advance): EXTENDED to support the loop wrapper. The skeleton's `commands/bmad-loop.md` Layer 1 markdown follows the four-step pattern but the iteration management is handled INSIDE the runner (the markdown's Bash step runs the runner ONCE; the runner internally loops; the final AR9 line is read by the markdown).
- **AR41** (boundary graph): UPHELD. `src/commands/loop/run.ts` is top-tier; imports the top-tier sibling `src/commands/next/run.ts` (the `runNext` function); does NOT import any sub-tier inappropriately. Story 4.1's only top-tier sibling import is to `next/run.ts` for `runNext` — explicitly within the architectural boundary.
- **AR42** (test discipline): EXTENDED. New colocated test files `args.test.ts` + `run.test.ts` in `src/commands/loop/`; AR35 tmpdir-per-test discipline preserved.

**What this story DOES NOT do:**

- **Implement stop conditions other than `--max-iters`.** Forward-deferred to Stories 4.2-4.10.
- **Implement `--max-iters=50` default cap when no other condition is supplied.** Forward-deferred to Story 4.4.
- **Implement `--plan-first` dry-run preview.** Forward-deferred to Story 4.7.
- **Implement `--checkpoint-each <step-type>`.** Forward-deferred to Story 4.8.
- **Implement SIGINT graceful exit (NFR-R5 30s budget).** Forward-deferred to Story 4.9.
- **Implement `--interactive` pause-between-steps.** Forward-deferred to Story 5.5.
- **Implement `--auto-fix` route-to-fixer.** Forward-deferred to Story 5.3.
- **Wire pure-function stop-condition predicates `(state, dag) => boolean` in `src/commands/loop/stop-conditions.ts`.** Forward-deferred to Story 4.2 (which establishes the file + the first two predicates).
- **Add new error classes for stop-condition halts.** The 16-code registry stays at 16 — `runLoop` reuses existing `ConfigError` for "no stop condition supplied" + relays per-iteration halts via the existing `runNext` halt path.
- **Implement secondary read-only flag pass-through (`--explain-each`, `--diff-each`, `--list-each`).** Forward-deferred per Epic 3 retrospective Forward Action Item §Story 4.1 (line 158).
- **Modify `src/commands/next/run.ts`.** Story 4.1 is purely additive on a NEW `src/commands/loop/` directory; the canonical Layer 2 runner is unchanged.
- **Modify `commands/bmad-next.md` (Story 2.7 Layer 1 markdown).** The new `commands/bmad-loop.md` is a SIBLING file, not a modification of `bmad-next.md`.
- **Add a new schema for `LoopResult` or `IterationRecord`.** v0.1 keeps these as plain TypeScript types in `src/commands/loop/run.ts` (NOT Zod schemas) — they are internal-only return shapes; not persisted; no migration concern. Forward-tracker: Story 6.x may extract to a `src/schemas/loop-result.ts` if checkpoints need Zod validation.

**What this story DOES land:**

- The architecturally-prescribed **`/bmad-loop` slash command** as a NEW top-tier surface — `src/commands/loop/{args,run,index}.ts` + `commands/bmad-loop.md`.
- The architecturally-prescribed **`LoopArgsSchema` Zod-validated argument schema** declaring ALL 13 future flag fields per AC-2 verbatim.
- The architecturally-prescribed **`runLoop` runner skeleton** that invokes `runNext` once per iteration on the happy path AND respects the `--max-iters` stop condition per AC-1 verbatim.
- The architecturally-prescribed **AR34-compliant slash-command markdown** following the Bash → JSON line read → Task → Bash verify-and-advance pattern in a loop with an iteration counter per AC-3 verbatim.
- The **registration** of the `loop` namespace in `src/commands/index.ts` (creating the file if missing) per the Stepper command-registry convention.
- The **forward-coupling documentation** with Stories 4.2-4.10 + 5.3, 5.5 + 6.x.
- **~12-18 colocated test cases** in `args.test.ts` covering the Zod schema + parser.
- **~6-10 colocated test cases** in `run.test.ts` covering the single-iteration happy path + the `IterationRecord` shape + the AC-1 verbatim scenario.

This story exercises:

- **AR8** (lock-free `run.ts`): UPHELD. The new `src/commands/loop/run.ts` does NOT acquire a lock; it imports the structurally-lock-free `runNext` per AR41 + Story 2.4's contract.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED. The loop runner emits ONE AR9 line at exit (`{ action: "report", message: "<exit reason>", exitCode: 0 }`); per-iteration AR9 lines from `runNext` are captured in-process and folded into the final summary.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED.
- **AR33** (function & error semantics): UPHELD.
- **AR34** (slash-command markdown protocol): EXTENDED for the loop wrapper.
- **AR41** (boundary graph): UPHELD. Top-tier `src/commands/loop/` imports top-tier sibling `src/commands/next/run.ts`.
- **AR42** (test discipline): EXTENDED.
- **FR8** (`/bmad-next`): CONSUMED.
- **FR9** (`--dry-run`): forward-tracker for Story 4.7.
- **FR19** (Bounded Loop): PARTIAL (1 of 8 stop conditions wired).
- **FR53** (exit codes): EXTENDED.
- **FR54** (stdout/stderr): PRESERVED.
- **NFR-P1, NFR-S2, NFR-S5, NFR-R1, NFR-R4, NFR-M3, NFR-I2**: PRESERVED or EXTENDED.

Estimated effort: **M** (medium — THREE new TypeScript source files in `src/commands/loop/` (args.ts ~120-180L, run.ts ~150-250L, index.ts ~10-20L); ONE new slash-command markdown `commands/bmad-loop.md` (~80-150L); ONE new (or modified) `src/commands/index.ts` registry barrel (~5-10L); TWO new colocated test files (args.test.ts ~150-250L, run.test.ts ~150-250L) covering ~18-28 test cases. Net additions: ~660-1110 lines across 7-8 files. The runtime-wired stop condition is `--max-iters` only — bounded. The args parser declares 13 fields but only one drives runtime behaviour in 4.1. ZERO new error classes; ZERO `src/commands/next/` modifications; ZERO new schema work; ZERO `verify-and-advance.ts` modifications; ZERO `lock.ts` modifications. The skeleton stage of Epic 4. Subsequent stories progressively wire the deferred stop conditions.)

It does **NOT**:

- **Implement the seven other stop-condition types.** Forward-deferred to Stories 4.2-4.10.
- **Implement `--max-iters=50` default cap.** Forward-deferred to Story 4.4.
- **Implement `--plan-first`, `--checkpoint-each`, `--interactive`, `--auto-fix`.** Forward-deferred to Stories 4.7, 4.8, 5.5, 5.3.
- **Implement SIGINT graceful exit.** Forward-deferred to Story 4.9.
- **Implement secondary read-only flag pass-through (`--explain-each`, etc.).** Forward-deferred.
- **Modify `src/commands/next/`, `src/lock/`, `src/state/`, or any state-write path.** Story 4.1 is purely additive on a NEW `src/commands/loop/` directory.
- **Create `src/commands/loop/stop-conditions.ts`.** Forward-deferred to Story 4.2.
- **Add a new error class.** Registry stays at 16 codes.
- **Modify `commands/bmad-next.md`.** New `commands/bmad-loop.md` is a SIBLING file.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.1 (lines 891-903, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `src/commands/loop/{args,run,index}.ts` and `commands/bmad-loop.md`
**When** `/bmad-loop --max-iters 1` is invoked
**Then** the loop runs exactly one iteration of the `/bmad-next` happy path and exits cleanly with exit reason `max-iters reached`
**And** `LoopArgsSchema` Zod-validates: `untilEpicEnd?`, `untilStory?`, `nextStory?`, `phaseEnd?`, `maxIters?`, `timeBudgetMs?`, `tokenBudget?`, `stopOnError?`, `continueOnError?`, `interactive?`, `autoFix?`, `planFirst?`, `checkpointEach?`
**And** the markdown body follows AR34 (Bash → JSON line read → Task → Bash verify-and-advance) but in a loop with iteration counter

> **Story 4.1 stop-condition scope note:** AC-1 explicitly mentions ONLY `--max-iters` as the runtime-wired stop condition for Story 4.1. The other 7 stop-condition types (epic-end, story-X-Y, next-story, phase-end, time-budget, token-budget, stop-on-error/continue-on-error) are deferred to Stories 4.2-4.10. The Zod schema declares ALL 13 future flag names per AC-2 (arg-surface-present); only `maxIters` drives runtime behaviour in 4.1 (runtime-wired).

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Epic 3 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:70`. All 10 stories 3.1-3.10 + `epic-3-retrospective` are `done` per lines 71-81.
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/epic-3-retrospective.md` §Forward Action Items §Epic 4 §Story 4.1 (line 158): "Epic 3 secondary-consumer surface area is now stable... Story 4.1 may add `--explain-each` / `--diff-each` / `--list-each` flags." Note the forward-tracker — Story 4.1 does NOT add these flags now; they're deferred per the retrospective's recommendation that Story 4.1 ship the SKELETON first.
  - [x] 0.3 Read epics.md §Epic 4 lines 887-1062 (the entire Epic 4 block) to understand the scope of Stories 4.2-4.10. Confirm Story 4.1's AC-1 mentions ONLY `--max-iters` as the runtime-wired stop condition; the other 7 stop conditions are owned by Stories 4.2-4.10.
  - [x] 0.4 Read epics.md §Story 4.1 lines 891-903 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 897-903.
  - [x] 0.5 Read `_bmad-output/planning-artifacts/architecture.md` §P6 lines 919-952 (Slash-Command Markdown Patterns) — establishes the AR34 protocol referenced by AC-3. Read `commands/bmad-next.md` (Story 2.7) for the canonical Layer 1 markdown structure to mirror in `commands/bmad-loop.md`.
  - [x] 0.6 Read `src/commands/next/args.ts` (Story 1.7) for the canonical `parseNextArgs` Result-shape pattern. The new `parseLoopArgs` mirrors this verbatim (Result-shape per architecture P4 line 858 sole-exception rule for argument parsing).
  - [x] 0.7 Read `src/commands/next/run.ts` (Stories 2.4 + 3.x extensions) for the canonical Layer 2 runner-tier composer pattern. The new `runLoop` is itself top-tier and imports `runNext` from `../next/run.ts`.
  - [x] 0.8 Read `_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md` for the canonical halt-recording mutation pair pattern. Confirm Story 4.1 does NOT modify the halt-recording surface (per-iteration halts flow through the existing `runNext` halt path unchanged).
  - [x] 0.9 Read `_bmad-output/implementation-artifacts/3-2-resume-flag.md` for the `NON_RECOVERABLE_FAILURE_CODES` literal at `src/commands/next/run.ts:153-156` (Story 3.2 carry-over). Forward-tracker: Story 4.6 (`--stop-on-error` / `--continue-on-error`) will branch on this literal; Story 4.1 does NOT consume it directly.
  - [x] 0.10 Read `_bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md` (Story 2.7) for the slash-command markdown structure. Confirm `commands/bmad-next.md` follows the AR34 pattern verbatim (frontmatter + Usage examples + Behavior + Tool restrictions sections).
  - [x] 0.11 Read `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (Story 2.3) for the sub-agent dispatch pattern. Confirm Story 4.1 does NOT introduce a new sub-agent — the loop runner reuses the existing per-iteration `runNext → bmad-step-runner` dispatch chain.
  - [x] 0.12 Confirm baseline `bun run check` exits 0 with the post-Story-3.10 baseline (727 pass / 0 fail / 2737 expects / 56 files per epic-3 retrospective).
  - [x] 0.13 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.14 Read `src/commands/next/index.ts` (if it exists) for the barrel re-export pattern. Mirror the structure for `src/commands/loop/index.ts`.
  - [x] 0.15 Confirm `src/commands/index.ts` exists (the top-level command registry barrel). If it does NOT exist, Story 4.1 creates it per Task 5. If it DOES exist, Story 4.1 modifies it to add the `loop` namespace export.
  - [x] 0.16 Confirm `src/errors.ts` registry stays at 16 codes (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.1 ships ZERO new error classes.

- [x] **Task 1 — Define `LoopArgs` types + supporting types (AC-2)**
  - [x] 1.1 Create `src/commands/loop/args.ts`. Add file-level JSDoc citing FR8, FR9, FR19, AR9, AR33, AR41 + epic AC line 902 (the 13-field enumeration).
  - [x] 1.2 Define the `LoopArgs` interface (TypeScript type) with all 13 optional fields per AC-2. Use `readonly` modifiers per Story 1.7 + 3.x precedent.
  - [x] 1.3 Define `ParseError` type or import from `src/commands/next/args.ts` (verify the export). The Result shape is `Result<LoopArgs, ParseError> = { ok: true; value: LoopArgs } | { ok: false; error: ParseError }`.
  - [x] 1.4 Note: NO Zod schema for `LoopResult` or `IterationRecord` in v0.1 — those are internal return-shape types; not persisted; no migration concern. Forward-tracker: Story 6.x may extract.

- [x] **Task 2 — Define `LoopArgsSchema` Zod schema (AC-2)**
  - [x] 2.1 In `src/commands/loop/args.ts`, define `LoopArgsSchema = z.object({...}).strict()` with all 13 fields per AC-2 verbatim:
    ```typescript
    export const LoopArgsSchema = z.object({
      untilEpicEnd: z.boolean().optional(),
      untilStory: z.string().regex(/^\d+\.\d+$/).optional(),
      nextStory: z.boolean().optional(),
      phaseEnd: z.boolean().optional(),
      maxIters: z.number().int().positive().optional(),
      timeBudgetMs: z.number().int().positive().optional(),
      tokenBudget: z.number().int().positive().optional(),
      stopOnError: z.boolean().optional(),
      continueOnError: z.boolean().optional(),
      interactive: z.boolean().optional(),
      autoFix: z.boolean().optional(),
      planFirst: z.boolean().optional(),
      checkpointEach: z.enum(["story", "epic", "phase"]).optional(),
    }).strict();
    ```
  - [x] 2.2 Use `.strict()` per Story 1.7 + 3.x precedent — extra fields surface as Zod errors (defence-in-depth against typos in argv parsing).
  - [x] 2.3 Add type alias `export type LoopArgs = z.infer<typeof LoopArgsSchema>;` per AR20 type-alias-chain pattern (Story 3.8 precedent).
  - [x] 2.4 The `untilStory` regex `/^\d+\.\d+$/` matches `3.2`, `10.5`, `1.10`, etc.; rejects `3` (no minor), `3.2.1` (three parts), `a.b` (non-numeric). Verified by Test 5 in args.test.ts.
  - [x] 2.5 The `checkpointEach` enum allows three values: `"story"` (Story 4.8 default), `"epic"`, `"phase"`. Forward-tracker: Story 6.1 may add additional values via config (e.g., `"every-N-iters"`).
  - [x] 2.6 Numeric fields use `z.number().int().positive()` to reject zero, negative numbers, and non-integers. Story 4.5 may relax `timeBudgetMs` to allow `0` for "no time limit" — forward-tracker; v0.1 conservative is positive-only.

- [x] **Task 3 — Implement `parseLoopArgs(argv: string[]): Result<LoopArgs, ParseError>` (AC-2)**
  - [x] 3.1 In `src/commands/loop/args.ts`, define `parseLoopArgs(argv: readonly string[]): Result<LoopArgs, ParseError>`. Mirror Story 1.7's `parseNextArgs` structure verbatim.
  - [x] 3.2 The parser walks `argv` looking for the canonical CLI flag forms: `--max-iters N` (requires next-arg value), `--until-story X.Y` (requires next-arg value), `--until-epic-end` (boolean — no value), `--next-story` (boolean), `--phase-end` (boolean), `--time-budget MS` (requires next-arg value), `--token-budget N` (requires next-arg value), `--stop-on-error` (boolean), `--continue-on-error` (boolean), `--interactive` (boolean), `--auto-fix` (boolean), `--plan-first` (boolean), `--checkpoint-each TYPE` (requires next-arg value).
  - [x] 3.3 The parser builds a partial object as it walks; passes the partial to `LoopArgsSchema.safeParse(...)` at end; if `safeParse.success === true`, returns `{ ok: true, value: parsed.data }`; else returns `{ ok: false, error: parseError(parsed.error) }`.
  - [x] 3.4 On unknown flags, return `{ ok: false, error: { code: "UNKNOWN_FLAG", flag: argv[i] } }`. Mirror Story 1.7's behaviour.
  - [x] 3.5 On missing-required-value (e.g., `--max-iters` with no next arg), return `{ ok: false, error: { code: "MISSING_VALUE", flag: argv[i] } }`.
  - [x] 3.6 On invalid-value (e.g., `--max-iters foo`), return `{ ok: false, error: { code: "INVALID_VALUE", flag: argv[i], value: argv[i+1], reason: "expected positive integer" } }`. The Zod parse failure surfaces as `INVALID_VALUE` with the Zod error path joined.
  - [x] 3.7 Numeric coercion: `--max-iters` is parsed via `Number.parseInt(value, 10)`. NaN check: `Number.isFinite(parsed) && Number.isInteger(parsed)` (rejects `1.5`). Defence-in-depth via `LoopArgsSchema.safeParse` (Zod's `.int().positive()` constraint).

- [x] **Task 4 — Define `IterationRecord`, `StopReason`, `LoopResult` types + `runLoop` runner (AC-1)**
  - [x] 4.1 Create `src/commands/loop/run.ts`. Add file-level JSDoc citing FR8, FR9, FR19, AR9, AR33, AR41 + epic AC lines 891-903.
  - [x] 4.2 Define internal types:
    ```typescript
    export interface IterationRecord {
      readonly iterCount: number;        // 1-indexed (first iteration is 1)
      readonly runId: string | null;     // from runNext result; null if runNext halted before emitting
      readonly action: "dispatch" | "report" | "halt" | "unknown";  // from runNext AR9 line
      readonly exitCode: number;         // from runNext result
      readonly durationMs: number;       // wall-clock
      readonly startedAt: string;        // ISO timestamp
    }
    
    export type StopReason =
      | { code: "max-iters-reached"; maxIters: number; iterCount: number }
      | { code: "no-stop-condition"; iterCount: number }    // v0.1 pre-Story-4.4 default-cap
      | { code: "halt-on-error"; iterCount: number; failureCode: string };
    
    export interface LoopResult {
      readonly stopReason: StopReason;
      readonly exitCode: number;
      readonly iterations: readonly IterationRecord[];
      readonly durationMs: number;
      readonly startedAt: string;
      readonly completedAt: string;
    }
    
    export interface LoopOpts {
      readonly argv?: readonly string[];      // raw argv to parse
      readonly args?: LoopArgs;               // pre-parsed args (mutually exclusive with argv)
      readonly runNextOverride?: typeof runNext;  // for tests — inject mock runNext
    }
    ```
  - [x] 4.3 Define `runLoop(opts: LoopOpts): Promise<LoopResult>`. The runner:
    1. Parses `opts.argv` if `opts.args` is missing (via `parseLoopArgs`); throws `ConfigError` on Result failure.
    2. Records `startedAt = new Date().toISOString()` and `loopStart = Bun.nanoseconds()` (for monotonic durationMs).
    3. Initialises `iterations: IterationRecord[] = []` and `iterCount = 0`.
    4. **Stop-condition gate (Story 4.1: max-iters only)**:
       ```typescript
       function shouldStop(iterCount: number, args: LoopArgs): StopReason | null {
         if (args.maxIters !== undefined && iterCount >= args.maxIters) {
           return { code: "max-iters-reached", maxIters: args.maxIters, iterCount };
         }
         // Story 4.1: if no stop condition is supplied at all, halt immediately
         // (Story 4.4 will replace this with --max-iters=50 default cap)
         if (args.maxIters === undefined && iterCount === 0) {
           return { code: "no-stop-condition", iterCount };
         }
         return null;
       }
       ```
    5. Loops: check `shouldStop(iterCount, args)`; if non-null, break with the StopReason; else, invoke `runNext` once; capture the result into an `IterationRecord`; append to `iterations[]`; increment `iterCount`.
    6. On halt-on-error from `runNext` (the result's exitCode > 0 OR action === "halt"), break with `{ code: "halt-on-error", iterCount, failureCode: result.failureCode ?? "unknown" }`.
    7. Returns `LoopResult` with `stopReason`, `exitCode` (computed from stopReason: `0` for max-iters-reached or no-stop-condition; `1` for halt-on-error), `iterations`, `durationMs`, `startedAt`, `completedAt`.
  - [x] 4.4 The runner imports `runNext` from `../next/run.ts` (top-tier sibling per AR41). The import statement: `import { runNext } from "../next/run.ts";` — verified by the AR41 boundary check pattern.
  - [x] 4.5 The runner does NOT import `src/lock/`, `src/state/` (directly), or any sub-tier module — all per-iteration state I/O flows through `runNext` per the AR41 boundary.
  - [x] 4.6 The `runNextOverride` field on `LoopOpts` is the test-injection seam (per Story 1.6 + Story 3.x precedent — runtime-injectable test seams are preferred over `mock.module` per the Bun mock-restore carry-over). Tests pass a stub `runNextOverride` to assert the iteration loop's call count; production code passes nothing.
  - [x] 4.7 The `import.meta.main` block (at the bottom of `run.ts`) parses argv via `parseLoopArgs`, calls `runLoop({ argv })`, awaits, then emits a single AR9 JSON line `{ action: "report", message: "<exit reason summary>", exitCode: result.exitCode }` to stdout via `process.stdout.write(JSON.stringify({...}) + "\n")` per AR9 line discipline.
  - [x] 4.8 Exit reason summary format (Story 4.1 minimal):
    - `max-iters-reached`: `"max-iters (${maxIters}) reached after ${iterCount} iteration${iterCount === 1 ? "" : "s"}"`
    - `no-stop-condition`: `"no stop condition supplied (Story 4.4 default cap not yet wired) — exiting"`
    - `halt-on-error`: `"halt on error (${failureCode}) at iteration ${iterCount}"`
  - [x] 4.9 Exit code: `process.exit(result.exitCode)` after emitting the AR9 line.
  - [x] 4.10 The `import.meta.main` block guards against being called from tests (which import `runLoop` directly per AR41). Standard pattern: `if (import.meta.main) { const result = await runLoop({ argv: Bun.argv.slice(2) }); ...; process.exit(result.exitCode); }`.

- [x] **Task 5 — Create `src/commands/loop/index.ts` barrel + register `loop` in `src/commands/index.ts` (AC-1)**
  - [x] 5.1 Create `src/commands/loop/index.ts` (~10-20 lines): re-exports `runLoop`, `parseLoopArgs`, `LoopArgsSchema`, types `LoopArgs`, `LoopResult`, `IterationRecord`, `StopReason`, `LoopOpts`, `ParseError`. Mirror Story 3.9's `src/runs/index.ts` barrel pattern verbatim.
  - [x] 5.2 Verify `src/commands/index.ts` exists. If it DOES NOT exist, create it with `export * as next from "./next/index.ts"; export * as loop from "./loop/index.ts";` (the FIRST top-level command registry barrel).
  - [x] 5.3 If `src/commands/index.ts` DOES exist, modify to add `export * as loop from "./loop/index.ts";` after the existing `export * as next from "./next/index.ts";` line. Preserve any existing additional exports.
  - [x] 5.4 The barrel pattern enables future `src/commands/<verb>/` additions (Story 6.x may add `--upgrade`, `--telemetry-report`, etc. as new top-tier verbs).

- [x] **Task 6 — Create `commands/bmad-loop.md` slash-command markdown (AC-3)**
  - [x] 6.1 Create `commands/bmad-loop.md`. Add YAML frontmatter per architecture P6 line 921-928:
    ```yaml
    ---
    description: Run /bmad-next in a bounded loop with stop conditions
    argumentHint: "[--max-iters N] [--until-epic-end] [--until-story X.Y] [--next-story] [--phase-end] [--time-budget MS] [--token-budget N] [--stop-on-error|--continue-on-error] [--plan-first] [--checkpoint-each story|epic|phase] [--interactive] [--auto-fix]"
    allowedTools: ["Bash", "Task", "Read"]
    ---
    ```
  - [x] 6.2 Body: H1 heading `# /bmad-loop`. Then sections per architecture P6 lines 935-952:
  - [x] 6.3 §Usage examples section: bullet list of common invocations:
    - `/bmad-loop --max-iters 1` (Story 4.1 AC-1 verbatim — single-iteration smoke)
    - `/bmad-loop --max-iters 50` (Story 4.4 default cap when wired)
    - `/bmad-loop --until-epic-end` (Story 4.2)
    - `/bmad-loop --until-story 4.5` (Story 4.2)
    - `/bmad-loop --next-story` (Story 4.3)
    - `/bmad-loop --phase-end` (Story 4.3)
    - `/bmad-loop --time-budget 7200000 --token-budget 200000` (Story 4.5; 2 hours / 200k tokens)
    - `/bmad-loop --plan-first` (Story 4.7; dry-run preview)
  - [x] 6.4 §Behavior section: numbered list per AR34 (P6 lines 941-946) extended with the loop wrapper (per AC-3):
    1. Run `bun run <plugin-root>/src/commands/loop/run.ts -- $ARGUMENTS` via the Bash tool.
    2. The loop runner manages iterations INTERNALLY (via in-process invocation of `runNext` per iteration). Per-iteration `dispatch` actions are batched/streamed per the runner's AR9 line emission strategy.
    3. Read the FINAL output (a single AR9 JSON line declaring the loop's final action: `report` with the exit reason).
    4. If a per-iteration `dispatch` action emerges (the runner emits dispatch lines mid-loop): invoke Task tool with the spec at `staging/<run-id>/dispatch-spec.json`.
    5. After Task returns, run `bun run <plugin-root>/src/commands/next/verify-and-advance.ts` via Bash (per the Story 4.1 reuse of the existing per-iteration verify-and-advance chain).
    6. Print one or two human-readable lines summarizing the loop outcome (iteration count + exit reason + resume hint per Story 4.10 forward-tracker).
  - [x] 6.5 §Tool restrictions section: bullet list per architecture P6 lines 948-952:
    - Bash is restricted to `bun run <plugin-root>/...` invocations.
    - Task is restricted to dispatching agents declared in this plugin's `agents/` directory.
    - No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`.
  - [x] 6.6 The body MUST follow the Story 2.7 `commands/bmad-next.md` structure verbatim (per AR34 + AC-3): same section headers, same numbered list format. Diff against `commands/bmad-next.md` should show ONLY the loop-wrapper differences (iteration counter; per-iteration dispatch handling; final report).
  - [x] 6.7 Implementation note: the loop runner emits AR9 lines on stdout — the slash-command markdown's natural-language Behavior section describes the expected message flow but the actual loop iteration is handled by the runner (Bun process), NOT by Claude in the markdown. This is a critical distinction from `commands/bmad-next.md` (which dispatches ONE step per invocation) — `commands/bmad-loop.md` invokes the runner ONCE; the runner internally loops.

- [x] **Task 7 — Add `src/commands/loop/args.test.ts` colocated tests (AC-2)**
  - [x] 7.1 Create `src/commands/loop/args.test.ts`. Import `LoopArgsSchema`, `parseLoopArgs` from `./args.ts`. Mirror Story 1.7's `src/commands/next/args.test.ts` structure.
  - [x] 7.2 **Test 1 (LoopArgsSchema parses all 13 fields when all are supplied)**: build a partial object with all 13 fields populated; `LoopArgsSchema.safeParse(partial)`; assert `success === true` AND `data` matches verbatim. Five sub-assertions per the AC-2 enumeration.
  - [x] 7.3 **Test 2 (LoopArgsSchema parses empty object as all-undefined)**: `LoopArgsSchema.safeParse({})`; assert `success === true` AND all 13 fields are `undefined`.
  - [x] 7.4 **Test 3 (LoopArgsSchema rejects unknown fields with `.strict()`)**: `LoopArgsSchema.safeParse({ unknownField: "foo" })`; assert `success === false`.
  - [x] 7.5 **Test 4 (LoopArgsSchema rejects invalid types per field)**: 13 sub-cases — for each field, supply a type-mismatched value (e.g., `untilEpicEnd: "yes"`, `maxIters: "1"`, `checkpointEach: "invalid"`); assert `success === false` for each.
  - [x] 7.6 **Test 5 (untilStory regex matches X.Y format)**: positive cases `["3.2", "10.5", "1.10", "100.999"]`; negative cases `["3", "3.2.1", "a.b", "3.x", "", "3."]`; `.parse(...)` for each; assert pass/fail per case.
  - [x] 7.7 **Test 6 (numeric fields require positive int)**: for `maxIters`, `timeBudgetMs`, `tokenBudget` — supply `0`, `-1`, `1.5`, `"1"`, `null`; assert `safeParse.success === false` for each. Supply `1`, `100`, `2147483647`; assert `success === true`.
  - [x] 7.8 **Test 7 (parseLoopArgs `--max-iters 1` parses correctly)**: `parseLoopArgs(["--max-iters", "1"])`; assert `result.ok === true` AND `result.value.maxIters === 1` AND all other fields are `undefined`.
  - [x] 7.9 **Test 8 (parseLoopArgs `--until-story 3.2` parses correctly)**: `parseLoopArgs(["--until-story", "3.2"])`; assert `result.ok === true` AND `result.value.untilStory === "3.2"`.
  - [x] 7.10 **Test 9 (parseLoopArgs handles all 13 flags in argv)**: build an argv with all 13 flags supplied; assert `result.ok === true` AND all fields match.
  - [x] 7.11 **Test 10 (parseLoopArgs rejects unknown flags)**: `parseLoopArgs(["--no-such-flag"])`; assert `result.ok === false` AND `result.error.code === "UNKNOWN_FLAG"`.
  - [x] 7.12 **Test 11 (parseLoopArgs rejects missing values)**: `parseLoopArgs(["--max-iters"])`; assert `result.ok === false` AND `result.error.code === "MISSING_VALUE"`.
  - [x] 7.13 **Test 12 (parseLoopArgs rejects invalid numeric values)**: `parseLoopArgs(["--max-iters", "foo"])`; assert `result.ok === false` AND `result.error.code === "INVALID_VALUE"`.
  - [x] 7.14 **Test 13 (parseLoopArgs rejects untilStory regex mismatch)**: `parseLoopArgs(["--until-story", "abc"])`; assert `result.ok === false`.
  - [x] 7.15 **Test 14 (parseLoopArgs accepts `--checkpoint-each` enum values)**: positive cases `["story", "epic", "phase"]`; negative case `"invalid"`. Assert pass/fail per case.
  - [x] 7.16 **Test 15 (parseLoopArgs handles boolean flags without values)**: `parseLoopArgs(["--until-epic-end", "--next-story", "--phase-end", "--stop-on-error", "--continue-on-error", "--interactive", "--auto-fix", "--plan-first"])`; assert `result.ok === true` AND each boolean is `true`.
  - [x] 7.17 **Test 16 (parseLoopArgs preserves order-independence)**: `parseLoopArgs(["--max-iters", "5", "--until-epic-end"])` and `parseLoopArgs(["--until-epic-end", "--max-iters", "5"])` produce identical results.
  - [x] 7.18 Test counts projection: ~16 colocated tests / ~50-80 expects in `src/commands/loop/args.test.ts`.

- [x] **Task 8 — Add `src/commands/loop/run.test.ts` colocated tests (AC-1)**
  - [x] 8.1 Create `src/commands/loop/run.test.ts`. Import `runLoop`, types from `./run.ts`. Use AR35 tmpdir-per-test discipline.
  - [x] 8.2 **Test A (AC-1 verbatim — single iteration with `--max-iters 1`)**: build a stub `runNextOverride` that returns `{ exitCode: 0, action: "report", runId: "iter-test-1", message: "OK" }` once. Invoke `runLoop({ argv: ["--max-iters", "1"], runNextOverride: stub })`. Assert (a) `result.iterations.length === 1`, (b) `result.iterations[0].iterCount === 1`, (c) `result.stopReason.code === "max-iters-reached"`, (d) `result.stopReason.maxIters === 1`, (e) `result.exitCode === 0`, (f) the stub `runNextOverride` was called EXACTLY once.
  - [x] 8.3 **Test B (AC-1 — exits with reason `max-iters reached`)**: same setup as Test A; assert `result.stopReason.code === "max-iters-reached"` (the verbatim exit reason text per AC-1 line 901).
  - [x] 8.4 **Test C (`--max-iters 3` runs exactly 3 iterations)**: `runLoop({ argv: ["--max-iters", "3"], runNextOverride: stub })`; assert `result.iterations.length === 3` AND `stub.callCount === 3` AND `result.stopReason.code === "max-iters-reached"` AND `result.stopReason.maxIters === 3` AND `result.stopReason.iterCount === 3`.
  - [x] 8.5 **Test D (IterationRecord shape)**: the iteration record contains all required fields. Assert `record.iterCount > 0`, `record.runId === "iter-test-1"` (from stub), `record.action === "report"`, `record.exitCode === 0`, `record.durationMs >= 0`, `record.startedAt` parses as ISO timestamp.
  - [x] 8.6 **Test E (no stop condition supplied — v0.1 pre-Story-4.4 behaviour)**: `runLoop({ argv: [], runNextOverride: stub })`; assert (a) `result.iterations.length === 0`, (b) `result.stopReason.code === "no-stop-condition"`, (c) `result.exitCode === 0` (the no-stop-condition exit is clean per Story 4.1's pre-Story-4.4 v0.1 behaviour — see §Open Questions §OQ-1; alternative interpretation: exitCode === 2 for ConfigError).
  - [x] 8.7 **Test F (halt-on-error stops the loop)**: stub `runNextOverride` to return `{ exitCode: 1, action: "halt", runId: "iter-halt", failureCode: "VERIFIER_FAILURE" }` on the first call. Invoke `runLoop({ argv: ["--max-iters", "5"], runNextOverride: stub })`; assert (a) `result.iterations.length === 1` (halted before reaching 5), (b) `result.stopReason.code === "halt-on-error"`, (c) `result.stopReason.failureCode === "VERIFIER_FAILURE"`, (d) `result.exitCode === 1`.
  - [x] 8.8 **Test G (LoopResult shape)**: assert `result.startedAt` and `result.completedAt` parse as valid ISO timestamps; `result.durationMs >= 0` AND is monotonic-derived (not wall-clock-derived — uses `Bun.nanoseconds()` per Story 3.9 precedent).
  - [x] 8.9 **Test H (ConfigError on argv parse failure)**: `runLoop({ argv: ["--unknown-flag"] })`; assert that an Error is thrown with `code === "CONFIG_ERROR"` (or whatever `parseLoopArgs` returns mapped through the architecture P4 sole-exception flow).
  - [x] 8.10 Test counts projection: ~8 colocated tests / ~40-60 expects in `src/commands/loop/run.test.ts`.
  - [x] 8.11 Tmpdir discipline: even though Story 4.1's `runLoop` does NOT touch the filesystem (per the test seam injection of `runNextOverride`), use AR35 tmpdir-per-test pattern in case future tests need a state.yaml fixture.

- [x] **Task 9 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` + record completion (AC: all)**
  - [x] 9.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `epic-4: backlog → in-progress` (auto-flip on first story create per skill convention; sprint-status.yaml line 17 documents this transition).
  - [x] 9.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-1-bmad-loop-command-skeleton: backlog → ready-for-dev` (this Story 4.1 create-story step). At dev-story completion (Step 9 of bmad-dev-story workflow), flip to `review`. At code-review completion, flip to `done`.
  - [x] 9.3 Bump `last_updated:` timestamp (both the `# last_updated:` comment line AND the `last_updated:` key:value line). Use UTC ISO timestamp at create-story-completion time.
  - [x] 9.4 sprint-status.yaml retains its original schema (no new fields).

- [x] **Task 10 — Run the full test suite + `bun run check` (AC: all)**
  - [x] 10.1 `bun run check` exit 0. Test delta projection: ~+24 tests / ~+90-140 expects (16 in args.test.ts + 8 in run.test.ts).
  - [x] 10.2 Post-Story-4.1 baseline projection: ~750-755 pass / 0 fail / ~2825-2880 expects / ~58 files (+2 new test files: `src/commands/loop/args.test.ts` + `src/commands/loop/run.test.ts`).
  - [x] 10.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.1 ships ZERO new error classes.
  - [x] 10.4 Confirm `bunx --bun tsc --noEmit` exits 0.
  - [x] 10.5 Confirm `bunx --bun biome ci .` exits 0 (the new files pass biome lint/format).
  - [x] 10.6 Confirm AR41 boundary check at `run.test.ts:606-638` still passes — Story 4.1 does NOT modify `src/commands/next/run.ts`; the existing boundary check is unchanged.
  - [x] 10.7 Optional: add a NEW AR41 boundary check at `src/commands/loop/run.test.ts` that scans `src/commands/loop/run.ts` source and asserts ZERO `from "../../lock/"` AND ZERO `from "../../state/"` imports (the loop runner stays top-tier per AR41).
  - [x] 10.8 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body (no syntax errors).

## Dev Notes

### File List

#### New Files

- **`src/commands/loop/args.ts`** (~120-180 lines): the `LoopArgsSchema` Zod schema declaring all 13 fields per AC-2 + the `parseLoopArgs(argv): Result<LoopArgs, ParseError>` parser function mirroring Story 1.7's `parseNextArgs`. Adds JSDoc citing FR8/9/19, AR9/33/41, epic AC line 902.

- **`src/commands/loop/run.ts`** (~150-250 lines): the `runLoop(opts: LoopOpts): Promise<LoopResult>` runner skeleton. Defines internal types `IterationRecord`, `StopReason`, `LoopResult`, `LoopOpts`. Imports `runNext` from `../next/run.ts` (top-tier sibling per AR41). Implements the iteration loop with `--max-iters` stop condition (Story 4.1 only; Stories 4.2-4.10 progressively wire the others). The `import.meta.main` block emits a single AR9 JSON line on exit.

- **`src/commands/loop/index.ts`** (~10-20 lines): barrel re-export. `export { runLoop, parseLoopArgs, LoopArgsSchema, type LoopArgs, type LoopResult, type IterationRecord, type StopReason, type LoopOpts, type ParseError } from ...`.

- **`commands/bmad-loop.md`** (~80-150 lines): the Layer 1 slash-command markdown per AR34 (P6 architecture pattern). Frontmatter (`description`, `argumentHint`, `allowedTools`) + body (Usage examples + Behavior + Tool restrictions sections). Mirrors `commands/bmad-next.md` structure verbatim with the loop-wrapper extensions per AC-3.

- **`src/commands/loop/args.test.ts`** (~150-250 lines): 16 colocated test cases covering the LoopArgsSchema Zod schema + the parseLoopArgs parser. ~50-80 expects total.

- **`src/commands/loop/run.test.ts`** (~150-250 lines): 8 colocated test cases covering the `runLoop` runner — single-iteration AC-1 verbatim (Test A + B), multi-iteration (Test C), IterationRecord shape (Test D), no-stop-condition behaviour (Test E), halt-on-error (Test F), LoopResult shape (Test G), ConfigError on parse failure (Test H). ~40-60 expects total.

#### Modified Files

- **`src/commands/index.ts`** (CREATED-OR-MODIFIED, ~5-10 lines): if the file does not exist, create it with `export * as next from "./next/index.ts"; export * as loop from "./loop/index.ts";`. If the file exists, add the `loop` namespace export after the existing `next` namespace export.

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `epic-4: backlog → in-progress` (auto-flip on first story create) AND `4-1-bmad-loop-command-skeleton: backlog → ready-for-dev`. Bump `last_updated:` timestamp.

#### NOT Modified (per spec)

- `src/commands/next/` (run.ts, args.ts, index.ts, verify-and-advance.ts) — Story 4.1 is purely additive on a NEW `src/commands/loop/` directory.
- `src/lock/lock.ts` — the loop runner does NOT acquire a lock; Story 3.10's `skipAcquire` flag is unused in 4.1 (the structural lock-free invariant holds via `runNext` per AR8).
- `src/state/` (load.ts, save.ts, recompute.ts, diff.ts, export.ts) — Story 4.1 does NOT touch the state subsystem; per-iteration state I/O flows through `runNext`.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `commands/bmad-next.md` (Story 2.7 Layer 1) — `commands/bmad-loop.md` is a SIBLING file, NOT a modification.
- `src/dag/`, `src/dispatch/`, `src/personas/`, `src/runs/`, `src/verifiers/`, `src/schemas/` — Story 4.1 does NOT touch these subsystems.
- `agents/` directory — no new sub-agent; per-iteration dispatch reuses the existing `bmad-step-runner` (Story 2.3).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): EXTENDED. The new `src/commands/loop/run.ts` is itself lock-free top-tier; it imports the structurally-lock-free `runNext` per AR41 + Story 2.4's contract; per-iteration `verify-and-advance.ts` (lock-held side) is unchanged. Optional AR41 boundary check at `src/commands/loop/run.test.ts` may scan the source to assert ZERO `from "../../lock/"` import.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED. The loop runner emits ONE AR9 line at exit (`{ action: "report", message: "<exit reason summary>", exitCode: 0 }`); per-iteration AR9 lines from `runNext` are captured in-process and folded into the final summary per the buffered-vs-streamed adjudication (§Open Questions §OQ-3).
- **AR11** (`state.yaml` at canonical path): UNCHANGED — Story 4.1 does NOT touch `state.yaml`; per-iteration state I/O flows through `runNext`.
- **AR21** (errors carry code): UNCHANGED. Registry stays at 16 codes. `runLoop` reuses existing `ConfigError` for parse failures + relays per-iteration halts via the existing `runNext` halt path.
- **AR22** (errors carry actionable hint): UNCHANGED.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. `runLoop` throws on failure (NOT Result); the args parser uses Result per the architecture P4 line 858 sole-exception rule for argument parsing; ZERO `console.*` calls; all I/O is async/await.
- **AR34** (slash-command markdown protocol — Bash → JSON line read → Task → Bash verify-and-advance): EXTENDED for the loop wrapper. The new `commands/bmad-loop.md` follows the four-step pattern with the iteration management handled INSIDE the runner per AC-3.
- **AR41** (boundary graph; no upward / sibling-higher imports): UPHELD. `src/commands/loop/run.ts` is top-tier; imports the top-tier sibling `src/commands/next/run.ts` (the `runNext` function) — explicitly within the architectural boundary. Story 4.1's only top-tier sibling import is to `next/run.ts` for `runNext`.
- **AR42** (test discipline): EXTENDED. New colocated test files `args.test.ts` + `run.test.ts` in `src/commands/loop/`; AR35 tmpdir-per-test discipline preserved.

### Acceptance Criteria Mapping

- **AC-1** (epic AC lines 899-901: `src/commands/loop/{args,run,index}.ts` and `commands/bmad-loop.md` → `/bmad-loop --max-iters 1` is invoked → the loop runs exactly one iteration of the `/bmad-next` happy path and exits cleanly with exit reason `max-iters reached`): delivered by **Tasks 1 + 4 + 5 + 6**. Tests A + B + C + D in `run.test.ts` (Task 8) verify the single-iteration AC-1 verbatim scenario AND the multi-iteration extension AND the IterationRecord shape.
- **AC-2** (epic AC line 902: `LoopArgsSchema` Zod-validates the 13 fields): delivered by **Tasks 1 + 2 + 3**. Tests 1-16 in `args.test.ts` (Task 7) verify the schema + parser cover all 13 fields with positive + negative cases.
- **AC-3** (epic AC line 903: the markdown body follows AR34 in a loop with iteration counter): delivered by **Task 6**. Visual review of `commands/bmad-loop.md` against `commands/bmad-next.md` (Story 2.7) confirms structural fidelity to AR34 pattern + the loop-wrapper extensions.

### v0.1 Design Decisions

#### `src/commands/loop/run.ts` is top-tier (consumes top-tier sibling `runNext`)

Per AR41, `src/commands/loop/run.ts` is top-tier; its only top-tier sibling import is `src/commands/next/run.ts` (the `runNext` function). This is the canonical top-tier composer pattern: top-tier modules MAY compose other top-tier siblings via direct import (NOT via subprocess spawn — that would defeat AR9 + add ~30ms overhead per iteration). The existing `src/commands/next/run.ts` already imports `runNext` from various sibling modules (e.g., `verify-and-advance.ts`); Story 4.1 follows the same pattern for the loop runner.

**Trade-off**: subprocess spawn vs in-process function call. v0.1 chooses in-process per (a) AR9 line discipline (subprocess would emit per-iteration AR9 lines on the spawned stdout, requiring buffer-and-relay logic in the loop runner — brittle); (b) NFR-P1 next-step computation overhead (in-process is sub-millisecond; subprocess is ~30ms minimum); (c) testability (in-process supports the `runNextOverride` test seam; subprocess requires real or mock spawn). Tracked as Open Question 2.

#### LoopArgsSchema declares ALL 13 fields per AC-2; only `maxIters` is RUNTIME-WIRED in Story 4.1

Per AC-2 verbatim, the schema MUST declare all 13 future flag names. v0.1 conservative interprets this as ARG-SURFACE-PRESENT (the schema parses the field; the parser accepts the flag) but RUNTIME-DEFERRED (the runner does NOT branch on the field — Stories 4.2-4.10 + 5.x will progressively wire). This mirrors Story 1.7's `NextArgsSchema` pattern where Stories 3.x progressively wired the future flags.

**Trade-off**: arg-surface-present + runtime-deferred (v0.1 conservative; pragmatic; preserves AC-2 verbatim) vs arg-surface-deferred (each story owns its OWN flag declaration in the schema; AC-2 would be deferred to a later "consolidation" story; pragmatically harder because LoopArgsSchema would need partial schema extension across multiple stories). v0.1 chooses arg-surface-present per AC-2 verbatim. Tracked as Open Question 3.

#### Buffered vs streamed AR9 line emission across iterations

The loop runner invokes `runNext` once per iteration. Each `runNext` invocation has its own AR9 emission strategy at `import.meta.main`. When `runNext` is called IN-PROCESS from the loop runner (NOT at `import.meta.main`), the AR9 line is constructed and returned as part of the `LoopResult` — NOT emitted on stdout per-iteration. The loop runner's OWN `import.meta.main` block emits ONE AR9 line at exit summarising the loop.

**Trade-off**: per-iteration emission (each iteration's AR9 line streams to stdout — supports `--watch` integration but requires buffer+relay; per-iteration latency is preserved for live-tail consumers) vs final emission (only ONE AR9 line is emitted at exit; per-iteration outcomes are aggregated into the final summary — cleaner; matches the AR9 single-line invariant; loses live-tail visibility). v0.1 chooses final emission per the cleaner AR9 invariant + the iteration record's `runId` field provides traceability for post-hoc inspection. Tracked as Open Question 4.

#### `--max-iters` is the ONLY runtime-wired stop condition in Story 4.1

Per AC-1 verbatim ("`/bmad-loop --max-iters 1` is invoked Then the loop runs exactly one iteration"). The other 7 stop conditions (epic-end, story-X-Y, next-story, phase-end, time-budget, token-budget, stop-on-error/continue-on-error) are owned by Stories 4.2-4.10. Story 4.1's `shouldStop()` predicate ONLY checks `--max-iters`; the other flag fields exist on the schema but are NOT consulted by the predicate.

**Trade-off**: AC-1 narrow (only --max-iters wired; defer others) vs AC-1 expansive (wire ALL 8 stop conditions in 4.1). v0.1 chooses narrow per Epic 4's explicit story decomposition (Stories 4.1-4.10 are independently scheduled; 4.1 is the SKELETON; 4.2-4.10 are the FILL-IN). Tracked as Open Question 5.

#### v0.1 pre-Story-4.4 behaviour: no stop condition supplied → halt immediately

Story 4.4 wires `--max-iters=50` as the default cap when no other condition is supplied (FR25). Story 4.1 does NOT yet wire this default. Question: when `runLoop({ argv: [] })` is called (no stop condition), what should happen?

v0.1 conservative chooses: halt immediately with `stopReason.code === "no-stop-condition"` AND `exitCode === 0` (the no-stop-condition exit is clean — Story 4.1's pre-Story-4.4 placeholder). Story 4.4 will REPLACE this branch with `args.maxIters = args.maxIters ?? 50` default cap.

**Trade-off**: halt-clean-zero (v0.1 conservative; documents the placeholder) vs halt-config-error-exit-2 (treats no-stop-condition as a CONFIG_ERROR; pragmatically harder because the behaviour is FORWARD-REPLACED by Story 4.4's default cap; would require Story 4.4 to remove the error). v0.1 chooses halt-clean-zero per the forward-replace contract. Tracked as Open Question 1.

#### Test seam: `runNextOverride` injection vs `mock.module`

Per the Bun mock-restore carry-over (Story 3.1 dev-002 + Epic 3 retrospective Forward Action Item §6.x), the project prefers RUNTIME-INJECTABLE TEST SEAMS over `mock.module` (which has process-global state and requires subprocess-spawn isolation). Story 4.1 follows this pattern: `runLoop` accepts an optional `runNextOverride: typeof runNext` field on `LoopOpts`; tests pass a stub; production code passes nothing (uses the default imported `runNext`).

**Trade-off**: runtime-injection (v0.1 preferred; in-process tests; no subprocess overhead) vs subprocess+mock (Story 3.1 dev-002 pattern; works around Bun's mock.module limitation). v0.1 chooses runtime-injection per the project's emerging preference. Tracked as Open Question 6.

### Carry-overs from Epic 3

- **Story 3.1's halt-recording mutation pair**: PRESERVED. Per-iteration halts flow through the existing `runNext` halt path; `state.lastAttempted` + `state.lastFailureReason` are recorded per Story 3.1's contract. Story 4.1's loop runner does NOT modify the halt-recording surface.
- **Story 3.2's `--resume` recoverable-codes allow-list**: forward-tracker for Story 4.6. The `NON_RECOVERABLE_FAILURE_CODES` literal at `src/commands/next/run.ts:153-156` will be consumed by Story 4.6's `--stop-on-error` / `--continue-on-error` branching.
- **Story 3.3's `--dry-run` lock-free posture**: PRESERVED. Story 4.1's loop runner does NOT acquire a lock; per-iteration `runNext` invocations are structurally lock-free per AR8 + Story 2.4's contract.
- **Story 3.6's `--explain` reasoning trace**: forward-tracker for Story 4.7 `--plan-first`. The `--plan-first` flag will reuse Story 3.6's `formatExplainMessage` + 3.7's candidate enumeration helpers per the Epic 3 retrospective Forward Action Item.
- **Story 3.7's `--list` candidate enumeration**: forward-tracker for Story 4.7.
- **Story 3.8's `--diff-state` and `--export-state` helpers**: forward-tracker for `--diff-each` / `--export-each` per-iteration drift detection (deferred per Epic 3 retrospective).
- **Story 3.9's `--watch` live transcript tail**: STRUCTURAL LOCK-FREE. Story 4.1's loop runner is itself lock-free; future `--watch-loop` integration may consume Story 3.9's `watchMostRecentRunLog` helper (forward-tracker).
- **Story 3.10's `skipAcquire` flag on `lock.ts`**: NOT EXERCISED in v0.1. The loop runner is structurally lock-free per AR8; the `skipAcquire` flag is forward-proofing for Story 6.x lock-acquiring read flows.
- **Errors registry held at 16 codes throughout Epic 3**: PRESERVED. Story 4.1 ships ZERO new error classes.

### Carry-overs from Epic 2

- **Story 2.4's lock-free `run.ts` contract** (architecture §line 1672 + AR8): PRESERVED. The new `src/commands/loop/run.ts` extends the lock-free invariant to the loop runner.
- **Story 2.7's `commands/bmad-next.md` Layer 1 markdown** (per AR34 + P6): STRUCTURAL TEMPLATE. The new `commands/bmad-loop.md` mirrors the structure verbatim with the loop-wrapper extensions per AC-3.
- **Story 2.3's generic sub-agent (`bmad-step-runner.md`)**: REUSED via the per-iteration `runNext` dispatch chain. The loop runner does NOT introduce a new sub-agent.
- **Story 2.6's `verify-and-advance.ts` lock-held runner**: REUSED via the per-iteration verify-and-advance step in the slash-command markdown. The loop runner does NOT modify `verify-and-advance.ts`.

### Carry-overs from Epic 1

- **Story 1.7's `parseNextArgs` Result-shape pattern** (per architecture P4 line 858 sole-exception rule): STRUCTURAL TEMPLATE. The new `parseLoopArgs` mirrors the structure verbatim.
- **Story 1.6's `src/state/` barrel pattern**: STRUCTURAL TEMPLATE for `src/commands/loop/index.ts`.
- **Story 1.5's Zod schema versioning**: NOT EXERCISED in v0.1. Story 4.1 keeps `LoopResult` and `IterationRecord` as plain TypeScript types (NOT Zod schemas) — they are internal-only return shapes; not persisted; no migration concern.
- **Story 1.4's `src/lock/lock.ts`**: NOT IMPORTED. The loop runner is structurally lock-free per AR8.

### Forward Dependencies

- **Story 4.2 (`--until-epic-end` + `--until-story <x.y>` stop conditions)**: PRIMARY DOWNSTREAM. Will create `src/commands/loop/stop-conditions.ts` with pure functions `(state, dag) => boolean`; will extend `runLoop`'s `shouldStop()` predicate to consume these. Story 4.1 declares the `untilEpicEnd` + `untilStory` flag fields on the schema; Story 4.2 wires them at runtime.
- **Story 4.3 (`--next-story` + `--phase-end` stop conditions)**: SECONDARY. Extends `stop-conditions.ts` with two more pure-function predicates.
- **Story 4.4 (`--max-iters` default cap of 50)**: TERTIARY. Replaces Story 4.1's "no-stop-condition halt" branch with `args.maxIters = args.maxIters ?? 50` default cap.
- **Story 4.5 (`--time-budget` + `--token-budget` stop conditions)**: SECONDARY. Will add a `LoopState` mutable interface with `elapsedMs` + `tokensIn` + `tokensOut` accumulators; will read per-iteration `tokensIn + tokensOut` from each `verify-and-advance.ts` invocation per AR10.
- **Story 4.6 (`--stop-on-error` + `--continue-on-error` policy)**: SECONDARY. Branches on per-iteration `runNext` exit code + `state.lastFailureReason.code` (per Story 3.1).
- **Story 4.7 (`--plan-first` dry-run preview)**: SECONDARY. Reuses Story 3.3's `--dry-run` helpers + Story 3.6's `--explain` helpers for the planned-step-sequence preview. Story 4.7 may extend `runLoop` to short-circuit on `--plan-first` and emit a structured plan instead of dispatching iterations.
- **Story 4.8 (`--checkpoint-each <step-type>` per-iteration snapshot)**: SECONDARY. Will write a per-iteration checkpoint to `_bmad-output/.stepper/checkpoints/<run-id>-iter-<N>.json` per AR11 + Story 1.6's atomic-write discipline.
- **Story 4.9 (SIGINT graceful exit; NFR-R5 30s budget)**: SECONDARY. Will register a SIGINT handler at `import.meta.main` (or via `LoopOpts.signal: AbortSignal` for in-process cancellation per Story 3.9's AbortController bridge precedent); will gracefully drain the in-flight `runNext` invocation; will emit the AR9 exit line; will flush the iteration record to disk per Story 4.8's checkpoint mechanism.
- **Story 4.10 (Loop exit reason + resume hint format)**: PRIMARY DOWNSTREAM. Will format the AR9 exit line with `state.lastFailureReason.hint` (per Story 3.1) for the resume-hint surfaced on loop halt. Will define the `--resume` hint format for the loop ("Resume with `/bmad-loop --max-iters <remaining>` after fixing <hint>").
- **Story 5.3 (`--auto-fix` route-to-fixer mode)**: TERTIARY. Branches on per-iteration `state.lastFailureReason.code` + reuses Story 3.2's `NON_RECOVERABLE_FAILURE_CODES` allow-list.
- **Story 5.5 (`--interactive` pause-between-steps)**: TERTIARY. Will add a per-iteration interactive prompt before invoking the next `runNext`; user-confirms-or-skip semantics.
- **Story 6.1 (`bmad-stepper.config.yaml` schema loader)**: TERTIARY. May surface `loop.maxIters: number` (default cap) as a config knob if the config-loader chooses to extend the default-cap policy from Story 4.4 to be config-driven.

### Previous Story Intelligence

This story builds on:

- **Story 1.7 (CLI Argument Parser)** — established `parseNextArgs` Result-shape pattern at `src/commands/next/args.ts`. Story 4.1's `parseLoopArgs` mirrors the structure verbatim. Result-shape per architecture P4 line 858 sole-exception rule (argument parsing is the sole exception to throw-not-Result).
- **Story 2.3 (Generic Sub-Agent — `bmad-step-runner.md`)** — established the per-step sub-agent dispatch contract. Story 4.1 reuses the existing per-iteration dispatch chain (loop runner invokes `runNext` per iteration; `runNext` invokes the sub-agent).
- **Story 2.4 (Lock-free `run.ts` for `/bmad-next`)** — established the AR8 + architecture §line 1672 lock-free contract for the runner-tier. Story 4.1's `src/commands/loop/run.ts` extends the lock-free invariant.
- **Story 2.6 (`verify-and-advance.ts` with state hash check)** — established the lock-held verifier-tier runner. Story 4.1 does NOT modify; per-iteration verify-and-advance flows through unchanged.
- **Story 2.7 (Slash-command markdown for `/bmad-next`)** — established `commands/bmad-next.md` Layer 1 markdown structure per AR34 + P6. Story 4.1's `commands/bmad-loop.md` mirrors verbatim with the loop-wrapper extensions per AC-3.
- **Story 3.1 (Halt-recording mutation pair)** — established `state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-halt. Story 4.1 does NOT modify; per-iteration halts flow through unchanged.
- **Story 3.2 (`--resume` Flag)** — established the recoverable-codes allow-list `NON_RECOVERABLE_FAILURE_CODES`. Forward-tracker for Story 4.6.
- **Story 3.3 (`--dry-run` Flag)** — established the no-state-mutation invariant for read-only flags. Story 4.1's loop runner inherits the lock-free + read-only-pre-dispatch posture.
- **Story 3.6 (`--explain` Reasoning Trace)** — forward-tracker for Story 4.7 `--plan-first`.
- **Story 3.7 (`--list` Candidate Next Steps)** — forward-tracker for Story 4.7.
- **Story 3.8 (`--diff-state` and `--export-state`)** — established the FR54 SPECIAL CASE pattern. Story 4.1 does NOT introduce new FR54 special cases.
- **Story 3.9 (`--watch` Live Transcript Tail)** — established the AbortController-bridged SIGINT cleanup pattern. Forward-tracker for Story 4.9.
- **Story 3.10 (Non-Locking Read Flags)** — closed Epic 3 with the `skipAcquire: boolean` lock-free contract surface. Story 4.1's loop runner is structurally lock-free per AR8; the `skipAcquire` flag is forward-proofing for Story 6.x.

Story 4.1 does NOT consume from:

- Stories 1.1-1.3, 1.5-1.6, 1.8-1.13 (repo scaffold, errors module, logger, schemas, state subsystem, branch detection, BMAD detection, DAG, persona resolution, doctor, quick-start docs) — independent prerequisites; Story 4.1 reads NOT modifies.
- Stories 2.1, 2.2, 2.5, 2.8 (verifier registry, dispatch-spec generator, transcript writers, smoke test) — Story 4.1 reuses via the unchanged `runNext` per-iteration chain; no direct touch.
- Stories 3.4, 3.5 (scope flags, persona override) — Story 4.1 does NOT consume; per-iteration `runNext` may pass through these flags via `LoopArgs.passThroughArgs` (forward-tracker for Story 4.7).

### Open Questions for Code Review

1. **What is the v0.1 pre-Story-4.4 behaviour when `runLoop({ argv: [] })` is called (no stop condition supplied)?** v0.1 conservative chooses halt-clean-zero with `stopReason.code === "no-stop-condition"` AND `exitCode === 0` per the forward-replace contract (Story 4.4 will replace with default cap). Alternative: halt-config-error-exit-2 (treats no-stop-condition as CONFIG_ERROR per FR53 line 4 = configuration error). v0.1 chooses halt-clean-zero per the forward-replace nature; tracked here for code-review adjudication.

2. **In-process function call vs subprocess spawn for per-iteration `runNext` invocation?** v0.1 conservative chooses in-process per (a) AR9 line discipline, (b) NFR-P1 next-step computation overhead (in-process is sub-millisecond; subprocess is ~30ms minimum), (c) testability (in-process supports the `runNextOverride` test seam; subprocess requires real or mock spawn). Trade-off: in-process = cleaner; subprocess = process-level isolation between iterations (each iteration gets a fresh Bun process state). v0.1 chooses in-process; tracked here.

3. **`LoopArgsSchema` declares ALL 13 fields per AC-2; only `maxIters` is RUNTIME-WIRED in Story 4.1?** v0.1 conservative chooses arg-surface-present + runtime-deferred per AC-2 verbatim. Alternative: arg-surface-deferred (each story owns its own field declaration; AC-2 deferred to a "consolidation" story). v0.1 chooses arg-surface-present per the forward-deferral pattern of Story 1.7's `NextArgsSchema`. Tracked here.

4. **Buffered vs streamed AR9 line emission across iterations?** v0.1 conservative chooses final emission (only ONE AR9 line at exit; per-iteration outcomes aggregated into the final summary). Alternative: per-iteration emission (each iteration's AR9 line streams; supports `--watch` integration). Trade-off: final = cleaner AR9 invariant; streamed = live-tail visibility but requires buffer+relay. v0.1 chooses final per the AR9 single-line invariant + per-iteration `runId` provides traceability via `IterationRecord`. Tracked here. Forward-tracker: Story 4.9 SIGINT graceful exit MAY require streamed emission for partial-progress reporting.

5. **Wire ALL 8 stop conditions in Story 4.1 (AC-1 expansive) or only `--max-iters` (AC-1 narrow)?** v0.1 conservative chooses AC-1 narrow per Epic 4's explicit story decomposition (Stories 4.1-4.10 are independently scheduled). Trade-off: expansive = single-PR completeness; narrow = cleaner story boundaries + smaller PR. v0.1 chooses narrow per Epic 4 plan. Tracked here.

6. **Test seam: `runNextOverride` runtime injection vs `mock.module` subprocess pattern?** v0.1 conservative chooses runtime injection per the project's emerging preference (Story 3.1 dev-002 + Epic 3 retrospective Forward Action Item §6.x). Trade-off: runtime injection = in-process tests; mock.module = process-global state requires subprocess isolation. v0.1 chooses runtime injection. Tracked here.

7. **Should Story 4.1 ship `--explain-each` / `--diff-each` / `--list-each` per-iteration secondary flags now, or defer per Epic 3 retrospective?** v0.1 conservative defers per epic-3-retrospective.md line 158 ("Story 4.1 may add `--explain-each` / `--diff-each` / `--list-each` flags" — note "may", not "must"). Story 4.1's `LoopArgsSchema` does NOT yet declare these flags. Forward-tracker: Story 4.7 (`--plan-first`) is the primary consumer; secondary-flag pass-through is its territory. Tracked here.

8. **Should `commands/bmad-loop.md` describe the loop iteration in natural language (Claude-managed loop) or delegate to the runner (process-managed loop)?** v0.1 conservative chooses runner-managed loop per (a) brittleness of natural-language iteration in long Claude turns, (b) AR9 line discipline (one line per command invocation; multiple iterations would emit multiple lines and break the protocol), (c) testability (runner-managed loops are testable in isolation; Claude-managed loops are not). Trade-off: runner-managed = clean process boundary; Claude-managed = visible per-iteration narration. v0.1 chooses runner-managed per the four-tier defence; tracked here.

9. **Should `src/commands/index.ts` be created if missing, or should each command's index.ts be the entry point?** v0.1 conservative chooses to create the top-level barrel (mirrors the AR41 + Story 1.6 pattern of barrel files at module boundaries). Alternative: each command has its own index.ts; `src/commands/` has no top-level barrel. v0.1 chooses top-level barrel for consistency + extensibility (Story 6.x may add more commands). Tracked here.

### Deviations / Open Questions for Code Review

(See §Open Questions for Code Review section above — 9 open questions consolidated; all are v0.1-conservative defaults pending code-review adjudication.)

The Epic 3 retrospective §Forward Action Items §Epic 4 explicitly enumerates pre-work for Story 4.1:

- **Q4.1 (Story 3.6, 3.7, 3.8)**: Loop runner may invoke `runNext --explain` / `--list` / `--diff-state` per iteration; Story 4.1 may add `--explain-each` / `--list-each` / `--diff-each` flags. **v0.1 conservative defers** per Epic 3 retro's "may" wording (vs "must"). Story 4.7 (`--plan-first`) is the primary consumer of these.
- **Q4.7 (Story 3.10)**: If `--plan-first` is added to read-only-flag enumeration in Epic 4, Story 4.7 may extend `skipAcquire` caller list. **Story 4.1 does NOT touch**. Forward-tracker for 4.7.
- **Q4.9 (Story 3.9)**: NFR-R5 30s budget at loop runner; Story 3.9's watcher's sub-millisecond cleanup is structurally separate but precedent-relevant for AbortController bridge pattern. **Story 4.1 does NOT touch**. Forward-tracker for 4.9.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` (this file)
- `src/commands/loop/args.ts` (NEW — `LoopArgsSchema` Zod schema + `parseLoopArgs` Result-shape parser)
- `src/commands/loop/run.ts` (NEW — `runLoop(opts): Promise<LoopResult>` runner skeleton + types)
- `src/commands/loop/index.ts` (NEW — barrel re-export)
- `src/commands/loop/args.test.ts` (NEW — 16 colocated test cases for the schema + parser)
- `src/commands/loop/run.test.ts` (NEW — 8 colocated test cases for the runner)
- `commands/bmad-loop.md` (NEW — Layer 1 slash-command markdown per AR34)
- `src/commands/index.ts` (CREATED-OR-MODIFIED — register `loop` namespace)

### Agent Model Used

claude-opus-4-7[1m] (Anthropic Claude Opus 4.7, 1M-context variant). Bun host 1.3.12 (AR2 satisfied: Bun >= 1.3).

### Debug Log References

- `bun test` (full suite, post-implementation): 771 pass / 0 fail / 2889 expects / 58 files. Δ from baseline (727/0/2737/56): +44 tests / +152 expects / +2 files. The +2 files are `src/commands/loop/args.test.ts` (28 tests / 95 expects) and `src/commands/loop/run.test.ts` (16 tests / 57 expects).
- `bunx --bun tsc --noEmit`: exit 0 (clean — no type errors).
- `bunx --bun biome ci .`: exit 0 (132 files checked).
- `bun test src/errors.test.ts`: 10 pass / 197 expects (registry held at 16 codes).

### Completion Notes List

- **Implementation discipline**: TDD-adjacent — wrote tests + implementation in parallel, ran loop-only tests first to catch the BigInt/division mismatch on `Bun.nanoseconds()` (returns `number`, not `BigInt`), and the `--time-budget` → `timeBudgetMs` schema-key alias gap. Both fixed before running the full suite.
- **AR41 boundary**: `src/commands/loop/run.ts` imports ONLY: `../../dispatch/index.ts` (mid-tier, AR9 emit helper); `../../errors.ts` (foundational); `../../io/log.ts` (foundational); `../../schemas/dispatch-protocol.ts` (foundational); `../next/run.ts` (top-tier sibling for `runNext` + `NextResult` + `RunNextOptions`); `./args.ts` (intra-module). No `from "../../lock/"`, no `from "../../state/"`. Test I (`src/commands/loop/run.test.ts:235-253`) asserts these invariants via source-text scan.
- **AR9 final-emission strategy**: per-iteration `runNext` AR9 lines are CAPTURED in-process via the structured `NextResult` (not emitted to stdout). The loop runner's `import.meta.main` block emits ONE AR9 line at exit summarising the loop outcome. Preserves the AR9 single-line invariant.
- **Errors registry**: held at 16 codes throughout. Story 4.1 ships ZERO new error classes. The argv parse failure path uses the existing `ConfigError` (`src/errors.ts`); the loop-internal "no stop reason" defensive throw also reuses `ConfigError`. No registry mutation.
- **Schema-key alias for `--time-budget`**: the user-facing flag is `--time-budget MS` (kebab) but the schema field per AC-2 verbatim is `timeBudgetMs`. Added a `FLAG_ALIASES` Map entry mapping `timeBudget` → `timeBudgetMs` to bridge. Other 12 flags use the canonical kebab↔camel mapping with no alias.
- **Exit code 2 path**: argv parse failure throws `ConfigError` (which sets exitCode=2 in the `import.meta.main` catch via `err.exitCode`). The runner's typed `LoopResult.exitCode` union is `0 | 1 | 2` to allow future stories to extend; currently only 0 (success) and 1 (halt-on-error) are returned by `runLoop` (the 2 path throws before returning).
- **Bun.nanoseconds() returns number not BigInt**: discovered during initial test run; fixed by using regular `/` division (not BigInt division). Documented in JSDoc comment at `src/commands/loop/run.ts:212-213`.

### Test Counts (final)

- `src/commands/loop/args.test.ts`: 28 tests, 95 expects.
- `src/commands/loop/run.test.ts`: 16 tests, 57 expects.
- **Total Story 4.1 deltas**: +44 tests, +152 expects, +2 colocated test files.
- **Project-wide totals**: 771 pass / 0 fail / 2889 expects / 58 files.

### File List

#### New files (created by Story 4.1)

| Path | Lines | Purpose |
|------|-------|---------|
| `src/commands/loop/args.ts` | 307 | `LoopArgsSchema` Zod schema (13 fields per AC-2) + `parseLoopArgs(argv)` Result-shape parser. |
| `src/commands/loop/args.test.ts` | 310 | 28 colocated tests covering schema inventory, defaults, strict-mode rejection, type rejection, regex/enum constraints, and parser flag-form coverage. |
| `src/commands/loop/run.ts` | 354 | `runLoop(opts)` runner skeleton + `IterationRecord` / `StopReason` / `LoopResult` / `LoopOpts` types + `import.meta.main` AR9-line emission. |
| `src/commands/loop/run.test.ts` | 297 | 16 colocated tests covering AC-1 verbatim (Test A + B), multi-iteration (Test C), IterationRecord shape (Test D), no-stop-condition (Test E), halt-on-error (Test F), LoopResult shape (Test G), ConfigError on parse failure (Test H), AR41 boundary check (Test I), args pass-through, and multi-iteration with mixed action sequence. |
| `src/commands/loop/index.ts` | 30 | Barrel re-export for the public surface. |
| `commands/bmad-loop.md` | 260 | Layer 1 slash-command markdown per AR34 (frontmatter + Usage examples + Behavior + Stop conditions table + Tool restrictions + Error handling). |

#### Modified files

| Path | Change |
|------|--------|
| `src/commands/index.ts` | Added `export * as loop from "./loop/index.ts";` (one new export line). |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Flipped `4-1-bmad-loop-command-skeleton: ready-for-dev → review`. Bumped `last_updated` timestamp. |
| `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` (this file) | Frontmatter `status: ready-for-dev → review`; ticked all task checkboxes; appended Dev Agent Record sections; appended Change Log entry. |

#### Run record artifacts

| Path | Purpose |
|------|---------|
| `.bmad-stepper/runs/2026-05-02T004316Z-bmad-next/run.yaml` | Run record (loop iteration 2). |
| `.bmad-stepper/runs/2026-05-02T004316Z-bmad-next/tasks/t1-dev-story.yaml` | Task record for the dev-story step. |

### Acceptance Criteria Verification

- **AC-1** (`/bmad-loop --max-iters 1` → one iteration → exits with `max-iters reached`): VERIFIED.
  - `runLoop` implementation at `src/commands/loop/run.ts:182-279` (the `runLoop` function).
  - Test A at `src/commands/loop/run.test.ts:69-79` (`--max-iters 1` runs exactly one iteration; `result.iterations.length === 1`; `calls() === 1`).
  - Test B at `src/commands/loop/run.test.ts:82-92` (verifies `result.stopReason.code === "max-iters-reached"` AND `result.stopReason.maxIters === 1` AND `result.stopReason.iterCount === 1`).
  - Test C at `src/commands/loop/run.test.ts:95-113` (extends to multi-iteration: `--max-iters 3` runs exactly 3).
  - The `import.meta.main` block at `src/commands/loop/run.ts:307-329` emits the AR9 line `{ action: "report", message: "max-iters reached (1 iteration)", exitCode: 0 }` per AC-1 verbatim.

- **AC-2** (`LoopArgsSchema` Zod-validates the 13 fields): VERIFIED.
  - Schema definition at `src/commands/loop/args.ts:78-101` (13 fields per AC-2 verbatim, all with `.optional()`, `.strict()` rejection of unknown keys).
  - Test at `src/commands/loop/args.test.ts:27-51` (`LoopArgsSchema enumerates exactly 13 keys (AC-2 verbatim)`).
  - Test at `src/commands/loop/args.test.ts:69-90` (`parses every field when all 13 are populated`).
  - Type-rejection tests at `src/commands/loop/args.test.ts:104-122` (per-field type rejection).
  - Regex tests at `src/commands/loop/args.test.ts:125-138` (untilStory X.Y format).
  - Numeric-constraint tests at `src/commands/loop/args.test.ts:141-160` (positive integers).

- **AC-3** (markdown body follows AR34 in a loop with iteration counter): VERIFIED.
  - `commands/bmad-loop.md` frontmatter (lines 1-5) + Behavior section (lines 36-94) + Per-iteration AR34 pattern subsection (lines 100-127) describe the four-step pattern (Bash → JSON line read → Task → Bash verify-and-advance) with the loop-wrapper extension per AC-3. Mirrors `commands/bmad-next.md` (Story 2.7) structure.
  - Iteration-counter handling is documented as runner-managed (the loop runner manages the iteration counter INTERNALLY as a Bun process; the slash-command markdown is a thin wrapper that runs the runner ONCE; the runner internally loops). Per Story 4.1 §Open Question 8, this design choice (runner-managed loop vs Claude-managed natural-language loop) is documented as v0.1 conservative.

### Quality Gate Results

| Gate | Result | Notes |
|------|--------|-------|
| `bun test` | PASS | 771 pass / 0 fail / 2889 expects / 58 files. Δ +44 tests / +152 expects / +2 files from baseline 727/0/2737/56. |
| `bun run check` (chains tests + biome ci) | PASS | exit 0. Reports above. |
| `bunx --bun biome ci .` | PASS | exit 0. 132 files checked; no fixes applied. Two formatting fixes applied via `biome check --write` during repair iteration 1: line-wrap of `readFileSync(join(...), "utf-8")` and unfolding of `const exitCode: 0 | 1 | 2 = stopReason?.code === "halt-on-error" ? 1 : 0;` to one line. |
| `bunx --bun tsc --noEmit` | PASS | exit 0. One type error caught + fixed during repair iteration 1: `result.value.checkpointEach` is union `"epic" \| "story" \| "phase" \| undefined`; loop-array iterator was widening to `string`; fixed via `as const` on the iteration array. |
| `bun test src/errors.test.ts` (registry guard) | PASS | 10 pass / 197 expects. **Registry held at 16 codes**; ZERO new error classes added. |

### AR Boundary Check Verdict

- **AR8** (lock-free `run.ts`): UPHELD. `src/commands/loop/run.ts` does NOT import `from "../../lock/"`. Test I at `run.test.ts:235-253` asserts this invariant via source scan.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. The loop runner's `import.meta.main` block emits exactly ONE AR9 line at exit; per-iteration AR9 lines are captured in-process and folded into the final summary (final-emission strategy per Story 4.1 §Design Decision 3).
- **AR21 + AR22** (errors carry code + actionable hint): UPHELD. ZERO new error classes; reuses existing `ConfigError`.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. `runLoop` throws `ConfigError` on parse failure (NOT Result); the args parser uses Result per architecture P4 line 858 sole-exception. ZERO `console.*` calls. All I/O is async/await.
- **AR34** (slash-command markdown protocol): EXTENDED for the loop wrapper. `commands/bmad-loop.md` follows the four-step pattern with the iteration management handled INSIDE the runner per AC-3.
- **AR41** (boundary graph): UPHELD. `src/commands/loop/run.ts` is top-tier; imports only top-tier sibling `runNext` (next/run.ts), intra-module `./args.ts`, foundational `errors.ts` + `io/log.ts` + `schemas/dispatch-protocol.ts`, and mid-tier `dispatch/index.ts` for the AR9 emit helper. Test I asserts this invariant.
- **AR42** (test discipline): EXTENDED. New colocated test files `args.test.ts` + `run.test.ts` in `src/commands/loop/`; per-test isolation via `runNextOverride` runtime injection (no `mock.module`, no subprocess spawn).

### Errors Registry Count

**16 codes (UNCHANGED).** Verified via `bun test src/errors.test.ts`: 10 pass / 197 expects. Registry guard CI gate at `src/errors.test.ts` passes.

### Repair Iterations Consumed

**1 of 3 max repair iterations consumed.**

- **Repair iteration 1** (caught by initial loop-only test run + `bun run check`): three issues surfaced and were fixed:
  1. `Bun.nanoseconds()` returns `number` (not `BigInt`) — initial code wrote `n / 1_000_000n` (BigInt) but `Bun.nanoseconds()` returns `number`. Fixed by removing the `n` suffix and the `Number(...)` cast.
  2. `--time-budget` → `timeBudgetMs` schema-key alias gap — the canonical kebab→camel mapping produced `timeBudget` but the schema field is `timeBudgetMs`. Added a `FLAG_ALIASES` Map.
  3. tsc type error on `args.test.ts:240` — `for (const value of ["story", "epic", "phase"])` widened to `string[]`; the `result.value.checkpointEach` field is `"epic" \| "story" \| "phase" \| undefined`; passing a `string` to `.toBe()` failed type narrowing. Fixed via `as const` on the iteration array.
  4. Biome formatting issues on two lines (one in run.ts, one in run.test.ts) — fixed via `biome check --write`.

After repair iteration 1, all quality gates green; no further repairs needed.

### Deviations from Story Spec

(See §Open Questions for Code Review section above — 9 open questions consolidated; all resolved as v0.1-conservative defaults pending code-review adjudication.)

**Concrete deviations from the story spec's Task list (all minor; flagged for code-review)**:

1. **`src/commands/loop/args.ts` line count diverged**: spec estimated ~120-180 lines; actual is 307 lines. The over-shoot is JSDoc-driven (file header + per-section comment blocks). Trade-off: more docs vs leaner code; v0.1 chooses more docs per the Story 1.7 / 3.x precedent of comprehensive JSDoc on first-of-kind modules.
2. **`src/commands/loop/run.ts` line count**: spec estimated ~150-250 lines; actual is 354 lines. Same JSDoc-driven over-shoot.
3. **`commands/bmad-loop.md` line count**: spec estimated ~80-150 lines; actual is 260 lines. Body section "Per-iteration AR34 pattern" (lines 100-127) explicitly disambiguates the runner-managed-loop choice (per Story 4.1 §Open Question 8) — this disambiguation is verbose but necessary for code-reviewer + future implementer clarity.
4. **`src/commands/loop/args.test.ts` test count**: spec estimated 16 tests; actual is 28 tests. Extra tests cover defence-in-depth (typo of existing field, boolean shorthand interactions, order-independence, fractional-numeric rejection, untilStory next-arg-is-flag rejection). Net positive — more coverage, no regression.
5. **`src/commands/loop/run.test.ts` test count**: spec estimated 8 tests; actual is 16 tests. Extra tests cover the AR41 boundary check (Test I — split into 2 sub-tests for source-scan), the args pass-through (`opts.args` overrides `opts.argv`), and multi-iteration with mixed action sequence (each iteration's runId is unique). Net positive.
6. **`extractFailureCode` returns `EXIT_<n>` instead of consuming `state.lastFailureReason.code`**: the dispatch protocol does NOT carry a structured `code` field on halt. v0.1 conservative: synthesise `EXIT_<exitCode>` as the stable string tag. Story 4.10 may enrich with a structured failure-code lookup pulled from `state.lastFailureReason.code` (per Story 3.1's halt-recording mutation pair). Forward-tracker.
7. **`runNextOverride` signature includes `RunNextOptions`**: spec said "test-injection seam"; the actual signature is `(opts?: RunNextOptions) => Promise<NextResult> | NextResult`. Production-code path passes nothing (uses default imported `runNext`); test-code path passes a stub that ignores its `opts` arg. The `RunNextOptions` parameter is preserved for forward-compat in case future stories thread per-iteration overrides to runNext.

### Open Questions Surfaced for Code Review

(All 9 from §Open Questions for Code Review section above are PRESERVED as v0.1-conservative defaults.)

Plus the deviations enumerated above (items 6-7 in §Deviations).

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (parallel layers: Blind Hunter + Edge Case Hunter + Acceptance Auditor)
**Date:** 2026-05-02
**Verdict:** approve-with-actions
**Counts:** 0 must-fix / 2 should-fix / 3 nits / 9 info (open-question adjudications)

### Quality Gates (independently re-verified)

| Gate | Result | Notes |
|------|--------|-------|
| `bun test` | PASS | 771 pass / 0 fail / 2889 expects / 58 files. Matches dev-story claim verbatim. |
| `bun run check` | PASS | exit 0. |
| `bunx --bun tsc --noEmit` | PASS | exit 0. |
| `bun test src/errors.test.ts` | PASS | 10 pass / 197 expects. |
| Errors registry size | 16 | Held; verified by class-count grep on `src/errors.ts` (16 `extends StepperError` matches). ZERO new error classes added by Story 4.1. |

### AC Verification (file:line evidence)

- **AC-1** (`/bmad-loop --max-iters 1` → exactly one iteration → exit reason `max-iters reached`): **PASS**
  - Implementation: `src/commands/loop/run.ts:134-149` (`shouldStop` predicate fires on `iterCount >= args.maxIters`); `src/commands/loop/run.ts:205-304` (`runLoop` main body); `src/commands/loop/run.ts:316-327` (`formatExitReason` → `"max-iters reached (1 iteration)"` matches AC-1 verbatim).
  - `import.meta.main` AR9 emit: `src/commands/loop/run.ts:331-354`.
  - Tests: `src/commands/loop/run.test.ts:69-93` (Test A: one iteration; Test B: `stopReason.code === "max-iters-reached"` + `maxIters === 1` + `iterCount === 1`); `src/commands/loop/run.test.ts:95-113` (Test C extends to `--max-iters 3`).

- **AC-2** (`LoopArgsSchema` Zod-validates 13 fields): **PASS**
  - Schema: `src/commands/loop/args.ts:84-106` (13 fields, all `.optional()`, `.strict()`); names match AC-2 verbatim character-for-character (`untilEpicEnd`, `untilStory`, `nextStory`, `phaseEnd`, `maxIters`, `timeBudgetMs`, `tokenBudget`, `stopOnError`, `continueOnError`, `interactive`, `autoFix`, `planFirst`, `checkpointEach`).
  - Inventory test: `src/commands/loop/args.test.ts:28-48` (asserts exactly 13 keys, by name).
  - Round-trip test: `src/commands/loop/args.test.ts:70-90` (parses every field when populated).
  - Field-level rejection tests: `args.test.ts:106-126` (type rejections), `args.test.ts:128-142` (regex), `args.test.ts:144-162` (numeric positive-int), `args.test.ts:93-104` (.strict() unknown-key + typo).

- **AC-3** (markdown body follows AR34 — Bash → JSON line read → Task → Bash verify-and-advance — but in a loop with iteration counter): **PASS**
  - Frontmatter: `commands/bmad-loop.md:1-5` (`description`, `argumentHint`, `allowedTools: ["Bash", "Task", "Read"]`).
  - Behavior section: `commands/bmad-loop.md:39-94` (declares the four-step pattern).
  - Per-iteration AR34 subsection: `commands/bmad-loop.md:124-154` (explicitly documents the runner-managed iteration loop wrapping the four-step pattern; iteration counter is internal to the runner per OQ-8).
  - Stop-conditions table: `commands/bmad-loop.md:156-182` (documents Story 4.1 wires only `--max-iters` runtime; other 12 are parsed-only).

### Architecture Invariants

- **AR8** (lock-free top-tier `run.ts`): **UPHELD**. Independent grep of `src/commands/loop/` shows zero `from "../../lock/"` imports. Only foundational/sibling/intra-module imports (`run.ts:41-46`).
- **AR9** (single discriminated-union JSON line on stdout): **UPHELD with caveat**. The `import.meta.main` block emits exactly ONE AR9 line via `emitDispatchAction` (`run.ts:335-339`); per-iteration `runNext` AR9 lines are captured in-process via the typed `NextResult` return shape (final-emission strategy per OQ-4). Caveat: when `runLoop` is invoked via `import.meta.main` and `runNext` itself runs `import.meta.main` (it doesn't in this story's test path because we use `runNextOverride`), in production the imported `runNext` does NOT run its own `import.meta.main` block — only the function body — so no extra stdout lines leak. Verified by reading `src/commands/next/run.ts:1342` (`runNext` is a plain async function; the `import.meta.main` block is separate).
- **AR21 + AR22** (errors carry code + actionable hint): **UPHELD**. ZERO new error classes; `ConfigError` reused for argv parse failures (`run.ts:214-218`) and the defensive "no stop reason" branch (`run.ts:289-293`); both invocations supply a custom `hintOverride` per the AR22 + Story 1.11 pattern.
- **AR33** (throw not Result; no `console.*`; async/await): **UPHELD**. Independent grep of `src/commands/loop/` shows zero `console.*` calls. The args parser uses `Result<LoopArgs, ParseError>` per the architecture P4 line 858 sole-exception rule. `runLoop` throws `ConfigError` on parse failure (`run.ts:214-218`).
- **AR34** (slash-command markdown protocol): **EXTENDED**. `commands/bmad-loop.md` follows the four-step pattern in a loop with the iteration counter handled inside the runner per AC-3.
- **AR41** (boundary graph): **UPHELD**. `src/commands/loop/run.ts` is top-tier; imports only top-tier sibling `runNext` (`../next/run.ts`), intra-module `./args.ts`, foundational `errors.ts` + `io/log.ts` + `schemas/dispatch-protocol.ts`, and mid-tier `dispatch/index.ts` for the AR9 emit helper. Independently verified via `Grep` of `src/commands/loop/`. Test I (`run.test.ts:240-251`) asserts via source-text scan.
- **AR42** (test discipline): **UPHELD**. Colocated test files (`args.test.ts`, `run.test.ts`); per-test isolation via `runNextOverride` runtime injection (no `mock.module`, no subprocess spawn).

### Findings

#### Must-Fix (blocks promotion)

(none)

#### Should-Fix (highly recommended; can be done in follow-up; not blocking)

1. **`extractFailureCode` returns `EXIT_0` if `runNext` ever returns `{ exitCode: 0, action: { action: "halt", ... } }`** (`src/commands/loop/run.ts:170-180` invoked from `:265-271`). The halt-on-error short-circuit at `run.ts:265` fires when EITHER `exitCode !== 0` OR `action === "halt"`. If `runNext` ever returns the `(0, halt)` combination (currently no production code path produces this, but `NextResult.exitCode` union allows `0`), the synthesised tag would be `"EXIT_0"`, which is misleading. Recommendation: either (a) defensively coerce non-zero in `extractFailureCode` when action is halt, OR (b) tighten `NextResult` to require `exitCode > 0` when `action === "halt"`. Forward-tracker for Story 4.10 (which also plans to enrich `extractFailureCode` to read `state.lastFailureReason.code`).

2. **`extractFailureCode` accepts `DispatchActionV1` but only branches on `action === "halt"`; non-halt non-dispatch actions silently return `"UNKNOWN_FAILURE"`** (`run.ts:170-180`). Today's protocol has only three variants (`dispatch`, `report`, `halt`), and the call site already requires the halt-on-error short-circuit fire — so `report` would arrive here only if its `exitCode !== 0`. The `IterationRecord.action` type widens to `"unknown"` (`run.ts:62`) without any production producer. Recommendation: collapse the union to the three known variants and drop `"unknown"` to keep the type honest, OR add a code-comment justifying the defensive `"unknown"` for forward-compatibility.

#### Nits (optional polish)

1. **`run.ts:286-294` defensive throw** — claims "should be unreachable" but `shouldStop(iterCount=0, args)` only returns non-null when `args.maxIters === undefined && iterCount === 0`. If a future refactor adds a stop condition that allows 0-iter completion, the path becomes reachable. The defensive throw is fine; consider adding a unit test that *forces* the unreachable branch (e.g., via `runNextOverride` that mutates iterCount mid-loop) so future refactors notice the safety net.

2. **`run.ts:62` IterationRecord.action union includes `"unknown"`** but no production code produces it. Either add a `default` branch in the discriminator or drop the `"unknown"` member.

3. **LoopOpts.runNextOverride signature accepts `RunNextOptions` but `runLoop` always invokes `runNextFn()` with no args** (`run.ts:248`). The signature suggests the parameter is meaningful, but Story 4.1's iteration loop never threads per-iteration options through. Either drop the parameter to match actual usage OR add a per-iteration override-builder (forward-tracker for Story 4.7 `--plan-first` pass-through).

#### Informational (forward-tracking — open-question adjudications)

The dev-story flagged 9 open questions (`§Open Questions for Code Review`, lines 629-647). All adjudicated:

- **OQ-1** (no-stop-condition: clean exit 0 vs CONFIG_ERROR exit 2): **ACCEPT**. The forward-replace contract with Story 4.4 (default `--max-iters=50` cap) makes the v0.1 placeholder appropriate. The distinct `stopReason.code === "no-stop-condition"` allows downstream tooling to disambiguate.
- **OQ-2** (in-process function call vs subprocess spawn for `runNext`): **ACCEPT**. AR9 line discipline + NFR-P1 sub-millisecond overhead + testability via `runNextOverride` make in-process the correct choice. Subprocess would complicate the AR9 invariant.
- **OQ-3** (LoopArgsSchema declares all 13 fields per AC-2, only `maxIters` runtime-wired): **ACCEPT**. AC-2 is verbatim; the arg-surface-present + runtime-deferred pattern mirrors Story 1.7's NextArgsSchema precedent.
- **OQ-4** (buffered final AR9 emission vs streamed per-iteration): **ACCEPT**. Final emission preserves the AR9 single-line-per-invocation invariant. `IterationRecord` provides per-iteration traceability via `runId`. Forward-tracker noted for Story 4.9 SIGINT (may need streamed emission for partial-progress reporting).
- **OQ-5** (AC-1 narrow: only `--max-iters` wired vs expansive: all 8): **ACCEPT**. Epic 4's explicit story decomposition (4.1 skeleton; 4.2-4.10 fill-in) prescribes narrow.
- **OQ-6** (test seam: `runNextOverride` runtime injection vs `mock.module`): **ACCEPT**. Runtime injection is in-process, no subprocess overhead, matches Story 3.1 dev-002 + Epic 3 retro precedent.
- **OQ-7** (defer `--explain-each`/`--diff-each`/`--list-each`): **ACCEPT**. Epic 3 retro line 158 says "may", not "must". Story 4.7 (`--plan-first`) is the primary consumer.
- **OQ-8** (runner-managed loop vs Claude-managed natural-language loop in markdown): **ACCEPT**. Brittleness of NL iteration in long Claude turns + AR9 line discipline + testability all favour runner-managed.
- **OQ-9** (top-level `src/commands/index.ts` barrel): **ACCEPT**. Mirrors AR41 + Story 1.6 barrel-at-boundary precedent. `src/commands/index.ts` already existed (verified at `src/commands/index.ts:24-26`); Story 4.1 added `export * as loop from "./loop/index.ts";` (one new line — within scope).

### LOC Overshoot Adjudication

- `args.ts` 307 LOC vs spec 120-180: **JUSTIFIED**. ~110 lines are JSDoc (file header table + per-symbol JSDoc); ~200 lines are code. Comparable to Story 1.7's `next/args.ts`. Net positive (more docs = more discoverable).
- `run.ts` 354 LOC vs spec 150-250: **JUSTIFIED**. JSDoc-heavy file header (39 lines) + per-symbol JSDoc on `IterationRecord`/`StopReason`/`LoopResult`/`LoopOpts`/`shouldStop`/`extractRunId`/`extractFailureCode`/`runLoop`/`formatExitReason`. Function bodies are appropriately concise.
- `commands/bmad-loop.md` 260 LOC vs spec 80-150: **JUSTIFIED**. The "Per-iteration AR34 pattern" subsection (`bmad-loop.md:124-154`) explicitly disambiguates the runner-managed-loop choice for future implementers — verbose but necessary given OQ-8's nuance.
- Test count 28+16=44 vs spec 12-18+6-10=18-28: **JUSTIFIED**. Extra tests cover defence-in-depth (typo of existing field, boolean shorthand interactions, order-independence, fractional-numeric rejection, untilStory next-arg-is-flag rejection, args pass-through via `opts.args`, mixed action sequence with unique runIds). Net positive coverage; no regression.

### Forward Dependencies

- **Story 4.2** will create `src/commands/loop/stop-conditions.ts` and extend `runLoop`'s `shouldStop` predicate.
- **Story 4.4** will REPLACE the `no-stop-condition` branch with `args.maxIters ?? 50` default cap.
- **Story 4.10** may enrich `extractFailureCode` to read `state.lastFailureReason.code` (per Should-Fix #1).
- All 12 currently-deferred fields on `LoopArgsSchema` carry forward to Stories 4.2-4.10 + 5.3, 5.5.

### Verdict Rationale

`approve-with-actions` rather than `approve` because two should-fix items (`extractFailureCode` `EXIT_0` edge case + `IterationRecord.action` `"unknown"` member) merit follow-up — but neither blocks promotion to `done`. The implementation:

- Faithfully meets all three ACs verbatim with file:line evidence.
- Holds all architecture invariants (AR8/9/21/22/33/34/41/42).
- Holds all quality gates green (771/0/2889/58, biome 0, tsc 0, errors 16).
- Passes the AR41 boundary check via independent grep + Test I (run.test.ts:240-251).
- Documents 9 open questions thoroughly; all adjudicated as ACCEPT (v0.1-conservative defaults are appropriate).
- LOC and test-count overshoots are JSDoc-driven and defence-in-depth; not over-engineering.
- 1 repair iteration consumed for legitimate issues (Bun.nanoseconds BigInt mistake, flag alias, tsc narrowing, biome auto-format) — all disclosed in Dev Agent Record.

The two should-fix items can be addressed in Stories 4.6/4.10 (which already plan `extractFailureCode` enrichment).

## Change Log

| Date       | Author            | Change                                                                                  |
| ---------- | ----------------- | --------------------------------------------------------------------------------------- |
| 2026-05-02 | bmad-code-review (claude-opus-4-7) | Senior Developer Review (AI) appended. Verdict: approve-with-actions. 0 must-fix / 2 should-fix / 3 nits / 9 info. All 3 ACs PASS with file:line evidence. All AR invariants UPHELD (AR8/9/21/22/33/34/41/42). Quality gates re-verified independently: bun test 771/0/2889/58, biome ci 0, tsc 0, errors registry held at 16. All 9 dev-flagged open questions adjudicated ACCEPT. LOC + test-count overshoots adjudged JUSTIFIED (JSDoc + defence-in-depth). Flipped story status `review → done`. Should-fix items deferred to Stories 4.6/4.10. |
| 2026-05-02 | dev (claude-opus-4-7) | Implemented Story 4.1 per AC-1/2/3. Created `src/commands/loop/{args,run,index}.ts` + `commands/bmad-loop.md` + colocated tests. Wired `loop` namespace into `src/commands/index.ts` barrel. Quality gates green: 771/0/2889/58 (Δ +44/+152/+2). Errors registry held at 16. AR41 boundary respected (Test I asserts via source-scan). Flipped story status `ready-for-dev → review`. 1 repair iteration consumed (BigInt/division mismatch + flag-alias gap + tsc narrowing + biome formatting; all in iteration 1). |
| 2026-05-02 | bmad-create-story | Initial story file created from epics.md §4.1 (first story of Epic 4). Epic 4 flipped backlog → in-progress. Story 4.1 flipped backlog → ready-for-dev. |
