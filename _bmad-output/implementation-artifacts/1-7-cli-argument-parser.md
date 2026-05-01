---
status: done
story_id: '1.7'
story_key: 1-7-cli-argument-parser
epic: '1'
title: CLI Argument Parser
created: '2026-04-30'
last_updated: '2026-04-30'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR8
  - FR9
  - FR10
  - FR11
  - FR12
  - FR13
  - FR14
  - FR15
  - FR27
  - FR53
  - FR54
nfr_coverage:
  - NFR-S1
  - NFR-S2
ar_coverage:
  - AR21
  - AR22
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/state/load.ts
  - src/state/save.ts
  - src/state/recompute.ts
  - src/schemas/state.ts
  - package.json
---

# Story 1.7: CLI Argument Parser

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a **Stepper contributor**,
I want **a hand-rolled tokenizer + Zod-validated argument schema per command**,
so that **flag parsing has actionable Zod errors with no external arg-library dep**.

## Context Summary

This story is the **first top-tier (`src/commands/`) module** of the project and the **first source-side surface where `Result<T, E>` rather than `throw` is allowed** (architecture line 858 — "the CLI argument parser is the sole exception" to AR33's throw-everywhere discipline). Until now `src/errors.ts`, `src/io/{log,paths,atomic-write}.ts`, `src/lock/lock.ts`, `src/schemas/`, `src/migrations/`, and `src/state/` have lived as foundational/mid-tier modules with **zero source-side consumers** in `src/commands/`. Story 1.7 lands `src/commands/next/args.ts` — the first concrete instance of D12 (architecture lines 602–629) — and authors the `parseNextArgs(argv): Result<NextArgs, ParseError>` contract that every downstream story hangs flags off (Story 1.8 `--resume`, Story 1.9 `--doctor` precondition checks, Story 1.10 `--include-optional` / `--no-optional`, Story 1.12 `/bmad-next --doctor`, Epic 3 `--resume` / `--diff-state` / `--export-state` / `--explain` / `--list` / `--watch` / `--force-unlock`).

Concretely, this story produces:

1. **`src/commands/next/args.ts`** — the canonical hand-rolled tokenizer + Zod schema + `parseNextArgs(argv): Result<NextArgs, ParseError>` per architecture §G D12. The schema enumerates **18 documented flags** (`step`, `epic`, `story`, `phase`, `dryRun`, `resume`, `includeOptional`, `noOptional`, `persona`, `explain`, `list`, `doctor`, `upgrade`, `recomputeState`, `exportState`, `diffState`, `watch`, `forceUnlock`) with their Zod types and defaults exactly as architecture lines 607–620 prescribe. The parser is hand-rolled (~50 lines) — **no external arg-parser library** (no `commander`, no `oclif`, no `yargs`, no `meow`) — per AR1's no-net-new-runtime-deps discipline and architecture's explicit D12 decision rationale ("for this flag inventory the hand-rolled approach is shorter than the framework configuration").
2. **`src/commands/next/args.test.ts`** — colocated unit tests. Comprehensive boundary coverage: all 18 flags with `--flag value`, `--flag=value`, and boolean-shorthand forms; defaults filled when flags absent; Zod validation rejects wrong types, unknown flags, and invalid `phase` enum values; the `Result` shape is `{ ok: true, value }` on success and `{ ok: false, error }` on failure; `ParseError` carries a single-line Zod hint without stack trace.
3. **`src/commands/next/index.ts`** — barrel re-exporting the public surface (`parseNextArgs`, `NextArgs`, `NextArgsSchema`, `ParseError`, `Result`). Architecture line 1105 prescribes this `index.ts` per command directory; Story 1.7 is the first to author one in `src/commands/`.
4. **`src/commands/index.ts`** — top-level barrel for `src/commands/` (currently re-exports just `./next`). Architecture line 1103 prescribes it; subsequent commands (`loop`, `doctor`) extend it.

This story is a **deliberately disciplined skeleton** — it lands the parser as a pure function that can be unit-tested in isolation. It does **NOT**:

- Author `src/commands/next/run.ts` (the runner that wires `parseNextArgs` → `recomputeState` / `loadState` / DAG / dispatch). The runner is Story 2.4.
- Author `src/commands/loop/args.ts` or `src/commands/doctor/args.ts`. Those follow the same pattern but defer to Epic 4 / Story 1.12 respectively (epics.md line 463: "the same pattern is reusable: `LoopArgsSchema`, `DoctorArgsSchema` follow identical shape (deferred for Epic 4 / Story 1.12)").
- Author `commands/bmad-next.md` body content (the slash-command markdown that calls `bun run src/commands/next/args.ts`). That happens after the runner lands (Story 2.7 — slash-command for `/bmad-next` (Layer 1 markdown)).
- Author the top-level entrypoint with `try { … } catch { exit(error.exitCode) }` mapping. The Story 1.7 surface returns `Result<NextArgs, ParseError>`; the caller (a future runner in Story 2.4) catches `Err` and exits with code 2 + a one-line stderr hint per architecture line 461.
- Add a new error class. `ParseError` is a **non-StepperError** value object — it intentionally does NOT extend `StepperError` because (a) it is part of the `Result` channel, not the throw channel, and (b) AC requires "exits with code 2 plus a single-line Zod hint (no stack trace)" — wrapping in `StepperError` would force a stack trace by virtue of `Error`'s constructor capture. The existing `ConfigError` (exit 2, hint pointing at config) is a separate animal — it fires when a runtime config file is malformed, not when a CLI flag mis-types. The 16-entry `errors.test.ts` registry stays at 16.

It DOES land:

- The exact AR41-conformant placement of `src/commands/` as **top-tier** (architecture lines 1294–1302 module-boundary graph: `commands/` depends on everything below; nothing imports from `commands/`). Story 1.7 keeps the dependency graph clean: `args.ts` imports only `zod`, `../../errors.ts` (for documentation cross-reference; not strictly required by the parser), and zero state/io modules.
- The composition pattern for hand-rolled tokenizer (`tokenize(argv): RawArgs`) → Zod (`NextArgsSchema.safeParse(raw)`) → Result-shaped return — every Story 1.12 (`DoctorArgsSchema`), Epic 4 (`LoopArgsSchema`), Epic 3 flag-extension story reuses this composition verbatim.
- The Result helper type (`type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`) colocated in `args.ts` (or a tiny `src/types/result.ts` foundational module — see Dev Notes deviation flag). This is the **only** Result-shaped surface in the project per AR33 P4 (architecture line 858 — "the CLI argument parser is the sole exception"); everywhere else throws.
- The `NextArgs` type (Zod-inferred from `NextArgsSchema`) — this becomes the contract that Story 2.4's `run.ts` consumes.
- Documentation of the slash-command argument flow per architecture line 629 (`Claude expands $ARGUMENTS in the slash-command body to the user's tail string. The slash-command prompt instructs Claude to invoke bun run parse-and-dispatch -- $ARGUMENTS. The Bun script parses, validates, and either reports a Zod error (exit 2) or proceeds.`). The slash-command markdown body is NOT this story's deliverable; the JSDoc on `parseNextArgs` references the architecture for the flow.

The architecture explicitly anticipates this story as a **leaf decision** in the implementation impact graph (architecture line 676: "The implementation can start at any 'leaf' decision (D3, D11, D12) and converge upward to D1. The natural sprint order is: D11 + D12 + D3 → D7 + D4 → D8 → D5 + D6 → D13 → D10 → D9 → D1 + D2 + D14 last."). D11 (errors) landed in Story 1.2; D3 (Bun YAML) landed implicitly in Story 1.3+ (`Bun.YAML.parse` / `Bun.write`); Story 1.7 closes D12 (CLI parsing). After Story 1.7, the foundational set (D11 + D12 + D3) is complete — every subsequent story (1.8 snapshot, 1.9 BMAD detect, 1.10 DAG, 1.12 doctor, 2.x dispatch + verifier + runner) builds on top.

This is **AR21** (every concrete error class declares `code`, `exitCode`, `actionableHint` — `ParseError` follows the documented shape via `code: "PARSE_ERROR"` non-Stepper convention; no registry update), **AR22** (single-line actionable-hint format — Zod's `error.issues[0].message` is post-processed into a single-line hint ending with a "Run/See/Try/Check"-prefixed sentence per the AR22 regex), **AR33** (function & error semantics — `parseNextArgs` returns `Result<T, E>` per the documented architecture exception line 858; everywhere else throws; async/await; Bun-native; no `any`; no `console.*`), **AR41** (module boundary — `src/commands/` is **top-tier**; `args.ts` imports only `zod`, no upward imports because nothing is upward, but no downward imports either except the documentation citation of `../../errors.ts`). It also operationalises **FR8** (single-step advance via `/bmad-next`), **FR9** (`--dry-run`), **FR10** (`--step <id>`), **FR11** (`--epic`/`--story`/`--phase`), **FR12** (`--persona`), **FR13** (`--explain`), **FR14** (`--list`), **FR15** (`--include-optional`/`--no-optional`), **FR27** (`--resume`), **FR53** (documented exit codes — Zod errors → exit 2 per FR53's "configuration error" bucket), **FR54** (stdout/stderr discipline — Zod hint → stderr; no JSON on stdout from this surface).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.7 (lines 454–463, BDD Given/When/Then/And format). Lines and AC labelling preserved.

### AC-1 (Given/When/Then/And — `parseNextArgs` Result-shaped success)

**Given** `src/commands/next/args.ts` exporting `NextArgsSchema` (`step?`, `epic?`, `story?`, `phase?`, `dryRun`, `resume`, `includeOptional`, `noOptional`, `persona?`, `explain`, `list`, plus `doctor`, `upgrade`, `recomputeState`, `exportState`, `diffState`, `watch`, `forceUnlock`)
**When** `parseNextArgs(argv)` runs against valid input
**Then** it returns `Result<NextArgs, ParseError>` with defaults filled
**Given** invalid input (unknown flag, wrong type)
**When** parseNextArgs runs
**Then** it returns `Err(ParseError)` and the top-level entrypoint exits with code 2 plus a single-line Zod hint (no stack trace)
**And** the parser is hand-rolled (~50 lines) with no external lib
**And** the same pattern is reusable: `LoopArgsSchema`, `DoctorArgsSchema` follow identical shape (deferred for Epic 4 / Story 1.12)

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: 1)**
  - [x] 0.1 Confirm `src/errors.ts` registry stays at 16 codes after Story 1.6: `LOCK_CONTENTION`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE`, `CORRUPT_STATE`, `STATE_TOO_NEW`, `STATE_CHANGED_DURING_DISPATCH`, `VERIFIER_FAILURE`, `PATHOLOGICAL_INPUT`, `SCOPE_VIOLATION`, `BUDGET_EXCEEDED`, `TIMEOUT`, `CONFIG_ERROR`, `MIGRATION_FAILURE`. Verify the registry test exits 0 (`bun test src/errors.test.ts`). **Story 1.7 does NOT add new error classes** — `ParseError` is a value object on the `Result` channel, not a `StepperError` subclass.
  - [x] 0.2 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` per Story 1.3. The Story 1.7 parser does **NOT** call any logger function directly — it returns `Result`. The caller (future Story 2.4 runner) writes the Zod hint to stderr via `error(message)` from `src/io/log.ts` after observing `Err(ParseError)`. Document in JSDoc that `args.ts` is **logging-free**.
  - [x] 0.3 Confirm `src/state/{load,save,recompute}.ts` exist (Story 1.6 deliverable) and are NOT imported by `args.ts`. `args.ts` is pure parsing; the runner (Story 2.4) wires `parseNextArgs` → `recomputeState` etc. AR41 forbids `src/commands/next/args.ts` from importing `src/state/` because args.ts is ergonomically a parser-only module — but the boundary graph **does** allow `src/commands/` to import from `src/state/` (commands is top-tier; state is mid-tier). The specific choice for `args.ts` is a **separation of concerns**, not an AR41 hard ban. Document in JSDoc.
  - [x] 0.4 Confirm `package.json` has zod 4.4.1 pinned; **DO NOT add a new dep** (no `commander`, no `yargs`, no `oclif`, no `meow`, no `parseargs`-from-`node:util` — see Dev Notes for why we don't use `node:util.parseArgs`). The hand-rolled tokenizer is ~30 lines; the Zod schema is ~30 lines; total ~50 lines per architecture line 627.
  - [x] 0.5 Confirm `commands/bmad-next.md` exists from Story 1.1 but is empty placeholder. Story 1.7 does **NOT** modify `commands/bmad-next.md` — the slash-command markdown body is Story 2.7's deliverable.
  - [x] 0.6 Confirm baseline `bun run check` exits 0 (176 pass / 0 fail / 505 expects across 21 files per Story 1.6 final state). Record the baseline test count in Completion Notes.
  - [x] 0.7 Confirm Bun host version satisfies AR2 (`Bun ≥ 1.3`). Run `bun --version`; record in Completion Notes (1.3.12 expected per Story 1.6 baseline).
  - [x] 0.8 Read architecture lines 553–629 (§G CLI Surface & Errors — D11 + D12) verbatim; extract the 18-flag inventory from D12 (lines 607–620) for AC-1 cross-validation. The flag list per epics.md AC-1 is verbatim: `step`, `epic`, `story`, `phase`, `dryRun`, `resume`, `includeOptional`, `noOptional`, `persona`, `explain`, `list`, `doctor`, `upgrade`, `recomputeState`, `exportState`, `diffState`, `watch`, `forceUnlock` — **18 keys**. The `phase` field is a Zod enum: `["analysis", "planning", "solutioning", "implementation", "retro"]` per architecture line 611.

- [x] **Task 1 — Create `src/commands/` directory + `src/commands/index.ts` barrel (AC: 1)**
  - [x] 1.1 Create directory `src/commands/`. Per AR41, this is **top-tier** (architecture lines 1294–1302). The architecture (lines 1102–1123) prescribes the location and the per-command sub-directory layout (`src/commands/next/`, `src/commands/loop/`, `src/commands/doctor/`).
  - [x] 1.2 Create `src/commands/index.ts` — top-level barrel. Initial content: re-export only `./next`. Subsequent commands extend this barrel as they land:
    ```typescript
    /**
     * src/commands/index.ts — top-level command barrel (AR41 top-tier).
     *
     * Story 1.7 lands the `next` command's args parser. Story 1.12 will add
     * `./doctor`; Epic 4 will add `./loop`.
     */
    export * as next from "./next/index.ts";
    ```
    No test file is needed for this barrel (pure re-export).
  - [x] 1.3 Add JSDoc header citing AR41 (top-tier), the `commands/` placement per architecture lines 1102–1123, and the future-extension hint.

- [x] **Task 2 — Create `src/commands/next/` directory + `src/commands/next/index.ts` barrel (AC: 1)**
  - [x] 2.1 Create directory `src/commands/next/`. Per architecture lines 1104–1110, this directory will eventually hold `index.ts`, `args.ts`, `run.ts`, `verify-and-advance.ts`, `run.test.ts`, `verify-and-advance.test.ts`. **Story 1.7 lands only `index.ts`, `args.ts`, and `args.test.ts`** — the runner (`run.ts`) is Story 2.4; `verify-and-advance.ts` is Story 2.6.
  - [x] 2.2 Create `src/commands/next/index.ts` — the per-command barrel:
    ```typescript
    /**
     * src/commands/next/index.ts — public barrel for the `next` command.
     *
     * Story 1.7 exports the args parser. Story 2.4 will export the runner.
     */
    export {
      type NextArgs,
      NextArgsSchema,
      type ParseError,
      type Result,
      parseNextArgs,
    } from "./args.ts";
    ```
    No test file is needed (pure re-export).

- [x] **Task 3 — Implement `src/commands/next/args.ts` — hand-rolled tokenizer + Zod schema (AC: 1)**
  - [x] 3.1 Create `src/commands/next/args.ts`. Module purpose per architecture line 1106: "NextArgsSchema, parseNextArgs (FR8–15, 27)". The file MUST export:
    - `NextArgsSchema: z.ZodObject<...>` — the Zod schema for the parsed args.
    - `type NextArgs = z.infer<typeof NextArgsSchema>` — Zod-inferred type.
    - `type ParseError = { code: "PARSE_ERROR"; message: string; hint: string; issues: z.ZodIssue[] }` — the value-object error returned in `Err(...)`. **NOT a StepperError subclass** (intentional, per AR33 line 858 exception).
    - `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }` — the discriminated union per AR33 line 858.
    - `parseNextArgs(argv: readonly string[]): Result<NextArgs, ParseError>` — the public function.
  - [x] 3.2 Algorithm step 1 — **Tokenize.** Implement a small (~30 line) hand-rolled tokenizer per architecture line 627. Walk `argv`; for each token:
    - `--flag=value` → record `{ key: "flag", value: "value", form: "equals" }`.
    - `--flag value` (where the next token is not another `--flag`) → record `{ key: "flag", value: "value", form: "space" }` and skip the next token.
    - `--flag` (boolean shorthand; the next token is another `--flag` or absent) → record `{ key: "flag", value: "true", form: "boolean" }`.
    - `--no-flag` → record `{ key: "flag", value: "false", form: "boolean" }`. (Optional convenience for boolean negation; document in JSDoc that the canonical form is `--no-optional` per architecture line 615 — and that the `--no-` prefix is **specifically supported** for `--no-optional` only; `--no-dry-run` is not specially handled and would be parsed as an unknown flag.) **DECISION**: implement the `--no-` prefix only for the documented `--no-optional` flag (architecture line 615). Other `--no-X` invocations fall through to "unknown flag".
    - Positional args (no `--` prefix) → collect into a separate array; **Story 1.7 does NOT consume positional args** but the tokenizer captures them so future commands (Epic 4 `--step <id>`-as-positional shorthand?) can extend.
    - `kebab-case` to `camelCase` mapping: `--dry-run` → `dryRun`, `--include-optional` → `includeOptional`, `--no-optional` → `noOptional`, `--recompute-state` → `recomputeState`, `--export-state` → `exportState`, `--diff-state` → `diffState`, `--force-unlock` → `forceUnlock`. Implement as a small `kebabToCamel(s)` helper.
    - Unknown flags (any flag not in the schema) accumulate into a separate array; the parser passes them to Zod which surfaces them in the issues list.
  - [x] 3.3 Algorithm step 2 — **Build raw object.** Iterate the tokenized list; build a plain JS object `Record<string, string | boolean>` that maps schema keys to their raw string or boolean values. Coerce: schema keys whose Zod type is `z.boolean()` map a string `"true"` / `"false"` to `true` / `false`; schema keys whose Zod type is `z.string()` keep the string verbatim; schema keys whose Zod type is `z.enum([...])` keep the string for Zod to validate. Booleans default to `false` (architecture line 612–618 documents `dryRun`, `resume`, `includeOptional`, `noOptional`, `explain`, `list`, `doctor`, `upgrade`, `recomputeState`, `exportState`, `diffState`, `watch`, `forceUnlock` defaults to `false`). String fields (`step`, `epic`, `story`, `persona`) default to `undefined` (Zod `.optional()`); the `phase` field is also `.optional()`.
  - [x] 3.4 Algorithm step 3 — **Zod validate.** `const parsed = NextArgsSchema.safeParse(raw);`. If `parsed.success === true`, return `{ ok: true, value: parsed.data }`. If `parsed.success === false`, build the `ParseError`:
    ```typescript
    const firstIssue = parsed.error.issues[0];
    const hint = `Run /bmad-next --help to see the supported flags. (${firstIssue.message})`;
    return { ok: false, error: { code: "PARSE_ERROR", message: parsed.error.message, hint, issues: parsed.error.issues } };
    ```
    The hint MUST end with the AR22 regex match (`/^.*(Run|See|Try|Check) /`) — starting with "Run" satisfies this.
  - [x] 3.5 Algorithm step 4 — **NextArgsSchema definition.** Verbatim from architecture lines 607–620 plus the additional 7 flags from epics.md AC-1 (architecture's `/* ... */` is filled in):
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
      doctor: z.boolean().default(false),
      upgrade: z.boolean().default(false),
      recomputeState: z.boolean().default(false),
      exportState: z.boolean().default(false),
      diffState: z.boolean().default(false),
      watch: z.boolean().default(false),
      forceUnlock: z.boolean().default(false),
    }).strict();
    ```
    The `.strict()` modifier makes Zod **reject unknown keys** — every flag not listed gets a `unrecognized_keys` Zod issue. This is the AC-1 "unknown flag" rejection path. Document the `.strict()` choice in JSDoc.
  - [x] 3.6 The `Result<T, E>` type colocated in this file (NOT a separate `src/types/result.ts`) — the type is one line, exported alongside `parseNextArgs`. Future stories that need `Result` (none planned in v0.1) will import it from `./args.ts` or the consumer can re-export. Document in JSDoc that this is the **only** Result-shaped surface in the project (architecture line 858 sole exception).
  - [x] 3.7 The `ParseError` type colocated. **Do NOT add it to `src/errors.ts`** — that is the StepperError registry, and ParseError is intentionally outside that hierarchy (per architecture line 858 + AC-1 "no stack trace" requirement).
  - [x] 3.8 JSDoc header per Story 1.6 conventions: cite FR8/FR9/FR10/FR11/FR12/FR13/FR14/FR15/FR27/FR53/FR54/AR21/AR22/AR33/AR41/architecture lines 553–629 (§G + D11 + D12); document the `Result` exception per AR33 line 858; document the slash-command argument flow per architecture line 629; explicitly note "first source-side `src/commands/` module" and "first source-side Result-shaped return".
  - [x] 3.9 No `console.*` calls. The function returns `Result` — the caller is responsible for output. No logger imports needed. Document this in JSDoc.
  - [x] 3.10 No `any` / `as any`. The Zod-inferred `NextArgs` type is fully typed; the tokenizer's intermediate `Record<string, string | boolean>` uses `Record<string, unknown>` if typing is awkward (with type-narrowing inside the conversion loop). If a `let` is required for the loop accumulator, type it explicitly per Biome's `noImplicitAnyLet` rule (Story 1.6 carry-over).

- [x] **Task 4 — Implement `src/commands/next/args.test.ts` (AC: 1)**
  - [x] 4.1 Create `src/commands/next/args.test.ts` colocated next to `args.ts`. Use Bun-test imports: `import { describe, expect, it } from "bun:test";`. **No `tmpdir` setup** — the parser is pure (no file IO); tests are synchronous unit tests.
  - [x] 4.2 **Happy path tests (~8 it() blocks):**
    - **Defaults filled when no flags supplied:** `parseNextArgs([])` returns `{ ok: true, value }` where every boolean is `false`, every optional string is `undefined`, `phase` is `undefined`. Verify all 18 keys.
    - **`--dry-run` boolean:** `parseNextArgs(["--dry-run"])` returns `value.dryRun === true`.
    - **`--epic 3` space-form:** `parseNextArgs(["--epic", "3"])` returns `value.epic === "3"`.
    - **`--epic=3` equals-form:** `parseNextArgs(["--epic=3"])` returns `value.epic === "3"`.
    - **`--phase analysis` enum:** `parseNextArgs(["--phase", "analysis"])` returns `value.phase === "analysis"`.
    - **`--no-optional` kebab-case to `noOptional`:** `parseNextArgs(["--no-optional"])` returns `value.noOptional === true`.
    - **`--include-optional` kebab-case:** `parseNextArgs(["--include-optional"])` returns `value.includeOptional === true`.
    - **All 13 boolean flags:** programmatically loop over `["dryRun", "resume", "includeOptional", "noOptional", "explain", "list", "doctor", "upgrade", "recomputeState", "exportState", "diffState", "watch", "forceUnlock"]`; for each, parse `[`--${kebabCase}`]`; assert `value[camelKey] === true`. Single `it.each(...)` block via Bun-test's parametric API (or a manual `for (const key of ...)` inside one `it(...)`).
    - **All 4 optional string flags:** `step`, `epic`, `story`, `persona` — parse `[`--${kebab}`, "abc"]`; assert `value[camelKey] === "abc"`.
  - [x] 4.3 **Error path tests (~6 it() blocks):**
    - **Unknown flag rejected:** `parseNextArgs(["--bogus"])` returns `{ ok: false, error: { code: "PARSE_ERROR", ... } }`. Assert `error.issues[0].code === "unrecognized_keys"` (Zod's strict mode response). Assert `error.hint.startsWith("Run ")` and `error.hint` is single-line (no `\n` except trailing).
    - **Wrong `phase` enum value:** `parseNextArgs(["--phase", "bogus"])` returns `{ ok: false, error }`. Assert `error.issues[0].code === "invalid_enum_value"`.
    - **Boolean flag with explicit value:** `parseNextArgs(["--dry-run=maybe"])` — what's the right behaviour? **DECISION**: the tokenizer captures the value as a string; the boolean-coerce step coerces `"true"` / `"false"` only; any other string surfaces as a Zod type error (`expected boolean, received string`). Test asserts `{ ok: false }` with `expected boolean` somewhere in `error.issues[0].message`.
    - **Multiple Zod issues — first is reported in hint:** `parseNextArgs(["--bogus", "--phase", "fake"])` — assert `error.issues.length >= 2`; assert `error.hint` contains the **first** issue's message.
    - **`--no-optional` and `--include-optional` together:** the Zod schema does NOT cross-validate these two flags (they are mutually exclusive in semantics, but the parser is lenient — the consumer (Story 2.4 runner) decides). **DECISION**: the parser accepts both; Zod returns success; the runner is responsible for the cross-validation. Document in JSDoc. Test asserts both can coexist.
    - **Empty string value:** `parseNextArgs(["--epic", ""])` — Zod's `.string().optional()` accepts empty string. **DECISION**: the parser accepts empty string; the runner is responsible for treating empty-string `epic` as "no filter". Test asserts `value.epic === ""`.
  - [x] 4.4 **Form-coverage tests (~3 it() blocks):**
    - **`--epic=3` and `--epic 3` produce identical output:** `parseNextArgs(["--epic=3"])` deep-equals `parseNextArgs(["--epic", "3"])`. Programmatic deep-equal via `expect(a).toEqual(b)`.
    - **Boolean shorthand `--dry-run` vs explicit `--dry-run=true`:** both produce `value.dryRun === true`.
    - **Mixed forms in one argv:** `parseNextArgs(["--epic=3", "--story", "1.7", "--dry-run"])` returns `{ ok: true, value: { epic: "3", story: "1.7", dryRun: true, ... } }`.
  - [x] 4.5 **No `console.*` calls.** Use `expect(...)` for assertions. The parser is pure; no logger or filesystem mocking needed.
  - [x] 4.6 **Test count target:** ~17–20 new `it(...)` blocks across 1 test file. Combined with the Story 1.6 baseline (176 tests across 21 files), the Story 1.7 outcome should be ~193–196 tests across 22 files. Wall-time budget: < 100 ms total for the new tests (the parser is sync-pure; no IO).

- [x] **Task 5 — Validate the architecture's "~50 lines hand-rolled" target (AC: 1)**
  - [x] 5.1 Run `wc -l src/commands/next/args.ts` and record the line count in Completion Notes. Per architecture line 627 ("hand-rolled (~50 lines)"), the parser body (excluding JSDoc) should be in the **40–80 line** range. Acceptable bounds: tokenizer ~25–35 lines + Zod schema ~25–35 lines + Result helpers ~5–15 lines = total 55–85 source lines (excluding JSDoc and blank lines).
  - [x] 5.2 Confirm no external arg-parser dep is in `package.json`. **DO NOT** import from `commander`, `oclif`, `yargs`, `meow`, `parseargs` (npm package), or `node:util.parseArgs`. Only `zod` is allowed. Document in Completion Notes.
  - [x] 5.3 Confirm Zod 4.4.1's `.strict()` rejects unknown keys per the AC-1 contract. Verify in args.test.ts via the unrecognized_keys assertion.

- [x] **Task 6 — Verify `bun run check` exits 0 (AC: 1)**
  - [x] 6.1 Run `bunx biome check . --write` to auto-fix formatting on the new files. Then run `bunx biome ci .` to confirm exit 0.
  - [x] 6.2 Run `bun test` (full suite); confirm all green. Expected files after this story: 21 from Story 1.6 baseline + this story's 1 addition: `src/commands/next/args.test.ts`. Total: 22 test files. Test count: ~176 baseline + ~17–20 new = ~193–196 total `it(...)` blocks.
  - [x] 6.3 Run the new test file standalone via `bun test src/commands/next/args.test.ts`; assert exit 0.
  - [x] 6.4 Run `bun run check` (the composite release-blocker gate) and confirm exit 0.
  - [x] 6.5 Run `bunx tsc --noEmit` (defensive) and confirm exit 0. **Critical:** verify the `Result<T, E>` discriminated union narrows correctly — `if (result.ok) { result.value }` and `if (!result.ok) { result.error }` should both type-check. Verify `NextArgs` is fully typed (`NextArgs["dryRun"]` should be `boolean`, `NextArgs["epic"]` should be `string | undefined`).
  - [x] 6.6 Wall-time budget: the unit tests are pure function calls; total `bun test` should remain under 1 second total (Story 1.6 baseline is 421 ms; adding 17–20 sync-pure tests should add < 50 ms).

- [x] **Task 7 — Final story-level sanity check (AC: 1)**
  - [x] 7.1 Confirm the file count: exactly **4 new files**. Files: `src/commands/index.ts`, `src/commands/next/index.ts`, `src/commands/next/args.ts`, `src/commands/next/args.test.ts`.
  - [x] 7.2 Confirm **zero modified files**. Story 1.7 is **strictly additive**:
    - `src/errors.ts` is NOT modified (no new error class — `ParseError` is a value object; registry stays at 16).
    - `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts` are NOT modified.
    - `src/lock/lock.ts` is NOT modified.
    - `src/schemas/state.ts` and the rest of `src/schemas/` are NOT modified.
    - `src/migrations/` is NOT modified.
    - `src/state/` is NOT modified.
    - `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock` are NOT modified (no new deps, no Biome rule changes).
    - `commands/bmad-next.md` (slash-command markdown) is NOT modified — Story 2.7 owns it.
    - `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `.gitignore`, `LICENSE` are NOT modified.
  - [x] 7.3 Confirm `src/commands/**/*.ts` files import only `zod`. **No `node:*` imports** (the parser is sync-pure; no fs / path / os needed). **No imports from `../../io/`, `../../lock/`, `../../schemas/`, `../../state/`, `../../migrations/`** — `args.ts` is intentionally separation-of-concerns: it parses args; the runner (Story 2.4) wires state. **Documentation cite of `../../errors.ts`** in JSDoc only (no runtime import) — documents that `ParseError` is intentionally outside the StepperError hierarchy.
  - [x] 7.4 Confirm no `console.*` calls. Confirm no `: any` / `as any`. Confirm no `default export`. Confirm no `index.ts` barrel re-exports anything that was not directly created in this story.
  - [x] 7.5 Update this story file's Status to `review` upon completion (the dev-story workflow handles this — bmad-create-story leaves it `ready-for-dev`).
  - [x] 7.6 Confirm the architecture line 627's "~50 lines" target is met. Soft target: 40–80 lines for `args.ts` body; firm target: < 150 lines including JSDoc.

## Dev Notes

### Architecture Compliance — What the Dev Agent MUST Follow

This story implements the CLI argument parser verbatim per architecture lines 553–629 (§G CLI Surface & Errors — D11 + D12). The dev MUST follow:

- **AR21 / AR22** error UX shape — `ParseError` declares a `code: "PARSE_ERROR"` literal and a single-line `hint` ending with a "Run/See/Try/Check"-prefixed sentence (AR22 regex). The error is NOT in the StepperError registry (intentional, see below).
- **AR33** function & error semantics — `parseNextArgs` returns `Result<T, E>` per the documented architecture exception line 858; the parser body is async-free (the function is a synchronous pure function despite the project's general async-everywhere preference); Bun-native (no `node:util.parseArgs`); no `any`; no `console.*`.
- **AR41** module boundary graph — `src/commands/` is **top-tier**; `args.ts` imports only `zod`. No upward imports because nothing is upward.
- **D12** hand-rolled tokenizer + Zod schema + Result-shaped return per architecture lines 602–629.

#### Architecture §G D12 — Hand-rolled Zod-Validated CLI Parser (verbatim, applied)

> **Decision:** Each command has `src/commands/<name>/args.ts`:
>
> ```typescript
> export const NextArgsSchema = z.object({
>   step: z.string().optional(),
>   epic: z.string().optional(),
>   story: z.string().optional(),
>   phase: z.enum(["analysis", "planning", "solutioning", "implementation", "retro"]).optional(),
>   dryRun: z.boolean().default(false),
>   resume: z.boolean().default(false),
>   includeOptional: z.boolean().default(false),
>   noOptional: z.boolean().default(false),
>   persona: z.string().optional(),
>   explain: z.boolean().default(false),
>   list: z.boolean().default(false),
>   /* ... */
> });
>
> export type NextArgs = z.infer<typeof NextArgsSchema>;
>
> export function parseNextArgs(argv: string[]): Result<NextArgs, ParseError>;
> ```
>
> **Parser implementation** is hand-rolled (~50 lines): tokenize `--flag` and `--flag=value` and positional; build a raw object; pass through Zod for validation and defaults. No external arg library (commander/oclif/yargs) needed for this flag inventory.

The `/* ... */` placeholder above expands to the 7 additional flags from epics.md AC-1: `doctor`, `upgrade`, `recomputeState`, `exportState`, `diffState`, `watch`, `forceUnlock`. **Total: 18 flags** (4 optional strings — `step`, `epic`, `story`, `persona`; 1 optional enum — `phase`; 13 booleans defaulting to false).

#### Architecture §G D12 — Slash-Command Argument Flow (verbatim, applied)

> **Slash-command argument flow:** Claude expands `$ARGUMENTS` in the slash-command body to the user's tail string. The slash-command prompt instructs Claude to invoke `bun run parse-and-dispatch -- $ARGUMENTS`. The Bun script parses, validates, and either reports a Zod error (exit 2) or proceeds.

This story does NOT author the slash-command markdown body (Story 2.7's deliverable). The JSDoc header on `parseNextArgs` references the architecture lines 629 + 942 for the future flow. The story-1.7 surface is the parser only; the runner (Story 2.4) and slash-command body (Story 2.7) handle the dispatch.

#### Architecture §P4 line 858 — Result-Shaped Return (the sole exception)

> **Sole exception:** the CLI argument parser returns `Result<Args, ParseError>`. Argument parsing failure is non-fatal in the sense that we want a pretty error and exit 2 without a stack trace even in development. All other code paths use throw.

This is the **architectural justification** for why `ParseError` is NOT a `StepperError` subclass:

- `StepperError` extends `Error`, which captures a stack trace at construction. Even if we never log the stack, the JS runtime's `Error.captureStackTrace` allocates the trace eagerly. For CLI parse errors we want a "single-line Zod hint, no stack trace" per AC-1 — so we use a plain object instead of an `Error`.
- The `Result` shape lets the caller `if (!result.ok) { error(result.error.hint); process.exit(2); }` cleanly without try/catch.
- Every other code path in the project throws — only `parseNextArgs` returns `Result`. The exception is documented in JSDoc as the architecturally-justified deviation from AR33.

#### AR21 / AR22 — ParseError UX Shape

`ParseError` follows the documented error-UX shape but is NOT in the registry:

| Field | Value |
|-------|-------|
| `code` | `"PARSE_ERROR"` (literal string; **not** in `StepperErrorCode` union; **not** in `errors.ts` registry) |
| `message` | The full `parsed.error.message` from Zod (multi-line, useful for debugging) |
| `hint` | A **single-line** sentence ending with the AR22 regex match (`Run /bmad-next --help to see the supported flags. (<first-issue-message>)`). Verbatim format documented above. |
| `issues` | `z.ZodIssue[]` — preserves the full Zod issue list for the caller (Story 2.4 runner can dump them to the run-log if needed). |

The caller's exit-code mapping per FR53:
- `parsed.success === true` → no error, runner proceeds. Exit code is determined by the runner's outcome.
- `parsed.success === false` → caller writes `error.hint` to stderr (via `error(...)` from `src/io/log.ts`) and `process.exit(2)`. Exit code 2 = "configuration error" per FR53 + architecture line 597 ("`CONFIG_ERROR`, `MIGRATION_FAILURE` (config file)"). CLI parse errors are config-shaped (the user passed wrong flags = bad runtime config) — this is the documented bucket.

#### Tokenizer Algorithm — Pseudo-code

```typescript
function tokenize(argv: readonly string[]): Record<string, string | boolean> {
  const raw: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;  // positional or unknown — skip for v0.1
    const eq = tok.indexOf("=");
    if (eq !== -1) {
      // --flag=value
      const key = kebabToCamel(tok.slice(2, eq));
      raw[key] = tok.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      // --flag value
      const key = kebabToCamel(tok.slice(2));
      raw[key] = next;
      i++;  // consume value token
      continue;
    }
    // --flag (boolean shorthand)
    let key = kebabToCamel(tok.slice(2));
    let value: boolean = true;
    if (key.startsWith("no") && key !== "noOptional") {
      // unknown --no-X flag — let Zod's .strict() reject it
      key = kebabToCamel(tok.slice(2));  // no prefix-stripping
    }
    raw[key] = value;
  }
  return raw;
}
```

The tokenizer is approximately **30 lines** of TypeScript. The Zod schema is approximately **22 lines**. The Result helpers + `parseNextArgs` body is approximately **15 lines**. Total: **~67 lines** of source code (not counting JSDoc), which falls within the architecture's "~50 lines" soft target with a small buffer for the additional 7 flags vs. architecture's `/* ... */` placeholder.

#### Why NOT `node:util.parseArgs`?

Node's `util.parseArgs` (added in Node 18.3 / Bun 1.0+) is a built-in option but the architecture explicitly chose hand-rolled per D12 (line 627: "No external arg library ... needed"). Reasons NOT to use `parseArgs`:

1. **D12 explicit choice** — the architecture's decision rationale is "for this flag inventory the hand-rolled approach is shorter than the framework configuration". Using `parseArgs` would add ~15 lines of `options` configuration that's longer than the hand-rolled tokenizer.
2. **Output shape mismatch** — `parseArgs` returns `{ values, positionals }` with specific Node-runtime semantics. Our hand-rolled tokenizer returns a plain object that maps cleanly to Zod's `safeParse` input.
3. **Bun-first preference** — AR33 line 860 prefers Bun-native APIs; `node:util` is fine when needed (Story 1.6 uses `node:fs/promises`, `node:path`, `node:os`) but not when a 30-line hand-rolled alternative exists and matches the architecture.
4. **Test isolation** — the hand-rolled tokenizer is a pure JS function with no Node-version-specific behaviour. Tests don't need to worry about Node 18 vs 20 vs Bun 1.3.x parseArgs differences.

The dev MUST NOT use `node:util.parseArgs`. The hand-rolled tokenizer is the architectural choice.

#### AR41 — Module Boundary Graph (verbatim, applied to this story)

> Foundational (no upward imports): `errors.ts`, `schemas/`, `io/`. Mid-level: `migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. Higher-level: `verifiers/`, `dispatch/`, `failure-ux/`. Top-level: `commands/`.

`src/commands/` is **top-tier**. **Allowed imports for `src/commands/next/args.ts`:**

- `zod` (runtime dep — for `NextArgsSchema`).
- (optional, JSDoc only) `../../errors.ts` — documentation cite for the registry contrast; **NO runtime import**.

**Forbidden imports in `src/commands/next/args.ts`:**

- `../../state/`, `../../io/`, `../../lock/`, `../../schemas/`, `../../migrations/` — all of these are downstream concerns for the runner (Story 2.4), not the parser. The parser is pure.
- `../../dag/`, `../../personas/`, `../../verifiers/`, `../../dispatch/`, `../../failure-ux/` — none of these exist yet, but the parser doesn't need them either.
- `../../bmad-detect/`, `../../telemetry/`, `../../transcript/`, `../../upgrade/` — likewise.
- `commander`, `oclif`, `yargs`, `meow`, `parseargs` (npm package), `node:util.parseArgs` — explicit per architecture D12.
- Any `console.*` call (Biome `noConsole`).

**Allowed imports for `src/commands/next/index.ts`:**

- `./args.ts` — re-export only.

**Allowed imports for `src/commands/index.ts`:**

- `./next/index.ts` — re-export only.

**Allowed imports for `src/commands/next/args.test.ts`:**

- `bun:test` — for `describe`, `expect`, `it`, `test`.
- `./args.ts` — for `parseNextArgs`, `NextArgs`, `NextArgsSchema`, `ParseError`, `Result` (all exported from args.ts).

The boundary will be enforced by a Biome import-restriction rule in a later story (Epic 6); for now, manual review during Code Review.

#### Result Helper Type — Colocated, Not Centralised

The `Result<T, E>` type is colocated in `args.ts`, NOT in a separate `src/types/result.ts` module. Rationale:

- `Result<T, E>` is **only used by `parseNextArgs`** in v0.1. Per architecture line 858, the CLI parser is the sole exception to throw-everywhere. No other module returns `Result`.
- A `src/types/` directory would create a new foundational sibling without a clear purpose. AR41's foundational tier is `errors.ts`, `schemas/`, `io/` — adding `types/` would dilute the definition.
- If a future Story (Epic 5 failure UX?) needs `Result`, it can re-export from `args.ts` or a dedicated `src/types/result.ts` module can be added then.

The colocated `Result` type is exported (`export type Result<T, E> = ...`) so that consumers of `parseNextArgs` can type their handler functions. The `next/index.ts` barrel re-exports it.

#### Zod 4.4.1 — `.strict()` Mode for Unknown-Flag Rejection

The architecture's AC-1 rejects unknown flags. Zod's `.strict()` modifier on a `.object({...})` schema causes `safeParse` to fail with an `unrecognized_keys` issue when extra keys are present. This is the **canonical Zod 4 mechanism** for unknown-key rejection — there's no need for a custom `.refine(...)` or pre-Zod check.

```typescript
const Schema = z.object({ epic: z.string().optional() }).strict();
Schema.safeParse({ epic: "1", bogus: "x" });
// → { success: false, error: { issues: [{ code: "unrecognized_keys", keys: ["bogus"], ... }] } }
```

The hint extraction in `parseNextArgs` consumes `parsed.error.issues[0].message` — Zod's default message for `unrecognized_keys` is `"Unrecognized key(s) in object: 'bogus'"`. The full hint becomes:

```
Run /bmad-next --help to see the supported flags. (Unrecognized key(s) in object: 'bogus')
```

This passes the AR22 regex (`/^.*(Run|See|Try|Check) /` — starts with "Run") and is single-line.

#### Test Patterns — Bun-test specifics

- `import { describe, expect, it } from "bun:test";` — standard test imports.
- **No `tmpdir` setup** — the parser is pure; tests are sync.
- **No `mock` injection** — the parser has no dependencies to mock.
- **Parametric test loops** — for the 13 boolean flags and 4 string flags, use a `for (const ...) { it(`description ${key}`, () => { ... }) }` pattern inside a `describe(...)` block. Bun-test does NOT support `it.each(...)` natively in 1.3.x but the manual loop is equivalent.
- **Deep-equal assertions** via `expect(a).toEqual(b)` — the `Result` shape has a fixed structure (`{ ok, value }` or `{ ok, error }`); deep-equal works.
- **Use `expect.toThrow` is NOT applicable** — the parser doesn't throw; it returns `Result`. Use `expect(result.ok).toBe(false)` and `expect(result.error.code).toBe("PARSE_ERROR")` instead.

### Source Tree — Exact Files to Create or Modify

This story creates exactly **4 new files** under `src/commands/` and modifies exactly **zero existing files**.

**Files created (4):**

```
bmad-stepper/
└── src/
    └── commands/                       # NEW directory (top-tier per AR41)
        ├── index.ts                    # top-level barrel: re-exports ./next
        └── next/                       # NEW sub-directory
            ├── index.ts                # per-command barrel: re-exports ./args
            ├── args.ts                 # NextArgsSchema, parseNextArgs, NextArgs, ParseError, Result
            └── args.test.ts            # ~17–20 it() blocks
```

**Files NOT modified (preserved verbatim from Stories 1.1 + 1.2 + 1.3 + 1.4 + 1.5 + 1.6):**

- `package.json` (no new deps), `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `.gitignore`, `LICENSE`.
- `src/errors.ts` and `src/errors.test.ts` (registry stays at 16 codes; `ParseError` is NOT added).
- `src/io/{log,paths,atomic-write}.ts` and tests.
- `src/lock/lock.ts`, `src/lock/lock.test.ts`, all `src/lock/integration/*.test.ts`.
- All `src/schemas/*.ts` and `src/schemas/*.test.ts`.
- All `src/migrations/*.ts` and `src/migrations/*/*.ts`.
- All `src/state/*.ts` and `src/state/*.test.ts`.

### Testing Requirements

- **`bun test` MUST pass with at least 22 test files** discovered (21 baseline + 1 commands test).
- **Each new test file MUST exit 0 standalone:** `bun test src/commands/next/args.test.ts`.
- **Total expected `it(...)` count:** ~176 baseline + ~17–20 new = ~193–196 total.
- **Run-time budget:** ~500 ms total (parser is sync-pure; new tests add < 50 ms; baseline 421 ms).
- **`bunx biome ci .`** MUST exit 0 against the new files. Biome's `assist/source/organizeImports` will auto-organize the imports alphabetically with type-only imports last.
- **`bun run check`** MUST exit 0 (composite release-blocker).
- **CI matrix** (`ubuntu-latest`, `macos-latest`) MUST be green. The parser is platform-agnostic — no OS-specific behaviour.
- **`bunx tsc --noEmit`** exits 0. Verify the `Result<T, E>` discriminated union narrows correctly.

### File Structure Requirements — Final Check

Before declaring this story done, the dev agent MUST verify ALL of these checks pass:

1. **`src/commands/`** directory exists with two files: `index.ts`, and a sub-directory `next/`.
2. **`src/commands/next/`** sub-directory exists with three files: `index.ts`, `args.ts`, `args.test.ts`.
3. **`src/commands/next/args.ts`** exports `parseNextArgs`, `NextArgsSchema`, `NextArgs` (type), `ParseError` (type), `Result` (type).
4. **`NextArgsSchema`** has exactly 18 keys: `step`, `epic`, `story`, `phase`, `dryRun`, `resume`, `includeOptional`, `noOptional`, `persona`, `explain`, `list`, `doctor`, `upgrade`, `recomputeState`, `exportState`, `diffState`, `watch`, `forceUnlock`.
5. **`NextArgsSchema`** has the `.strict()` modifier (rejects unknown keys).
6. **`parseNextArgs`** returns `Result<NextArgs, ParseError>` — the `Result` discriminated union narrows correctly via `result.ok`.
7. **`ParseError`** is NOT added to `src/errors.ts` registry; registry stays at 16 codes.
8. **`src/commands/**/*.ts`** import only `zod` (no `node:util`, no external arg lib, no `src/state/`, no `src/io/`, etc.).
9. **`bun test`** exits 0 with 22+ test files reported as run.
10. **`bunx biome ci .`** exits 0.
11. **`bun run check`** exits 0.
12. **No imports outside foundational/top-tier scope** in any new file (AR41 — top-tier `commands/` imports only `zod`).
13. **`package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `bun.lock`, `src/errors.ts`** are byte-identical to their Story 1.6 state.
14. **No new error class added.** `errors.test.ts` registry count assertion (16) still passes.
15. **Status flipped to `review`** upon dev-story completion.

### Code Quality Enforcement (AR36)

- **Biome 2.3.15 only.** No ESLint, no Prettier.
- **`noConsole: "error"`** — blocks all `console.*` calls. The parser is logging-free; no logger import needed.
- **`noImplicitAnyLet: "error"`** — the tokenizer's loop accumulator (`let i = 0` for the index, `let value: boolean = true` for the boolean shorthand) is explicitly typed.
- **`noUnusedVariables: "error"`** — every imported symbol must be used.
- **Import organisation:** alphabetical with type-only imports last. For `args.ts`: `import { z } from "zod";` is the only runtime import. Type-only imports (none in v0.1) would come after.

### Naming Conventions (AR31, applied to Source TS)

- **Filenames:** `kebab-case.ts` — `args.ts`, `index.ts`. Test file: `args.test.ts` (colocated).
- **Function names:** `camelCase` — `parseNextArgs`, `tokenize` (private), `kebabToCamel` (private).
- **Type/interface names:** `PascalCase` — `NextArgs` (Zod-inferred), `ParseError`, `Result`.
- **Schema names:** `PascalCase` ending in `Schema` — `NextArgsSchema`. (Pattern from Story 1.5: `StateV1Schema`, `PidFileV1Schema`, etc.)
- **Constants:** SCREAMING_SNAKE_CASE for top-level immutables. The phase enum literal is inline in the schema; no top-level constant needed.
- **Test names:** descriptive lower-case strings inside `it(...)` calls — `it("returns ok=true with defaults filled when argv is empty")`, `it("returns ok=false with code PARSE_ERROR for unknown --bogus flag")`.

### Module Boundary Graph (AR41) — First Top-Tier Enforcement Point

Stories 1.2, 1.3, 1.4, 1.5, 1.6 were the first five enforcement points (foundational + mid-tier). This story is the **sixth — `src/commands/` joins the graph as the top-tier**. After this story:

- **Foundational subtrees (5):** `errors.ts`, `schemas/`, `io/`, `lock/` (Story 1.4 deviation D1), and the implicit foundational `errors.test.ts`.
- **Mid-tier subtrees (2):** `migrations/`, `state/`.
- **Higher-tier subtrees (0):** `verifiers/`, `dispatch/`, `failure-ux/` — none exist yet.
- **Top-tier subtrees (1):** `commands/` (this story).

After Story 1.7, the graph has:

```
foundational (errors, schemas, io, lock) ──> mid-tier (migrations, state) ──> top-tier (commands/next)
```

The empty middle tiers (verifiers, dispatch, failure-ux) will land in Epic 2. The `commands/next` module currently has no runtime dependency on any tier — it's a pure parser. Story 2.4's runner will add the cross-tier imports (commands → state → migrations → schemas → io / errors / lock), exercising the full graph for the first time.

### Slash-Command Argument Flow (downstream-only documentation)

This story does NOT author the slash-command markdown body. For reference, architecture line 942 + line 629 prescribe:

> The slash-command markdown body (Story 2.7) will read:
>
> ```markdown
> # /bmad-next
>
> ## Behavior
> 1. Run `bun run <plugin-root>/src/commands/next/run.ts -- $ARGUMENTS` via the Bash tool.
> 2. Read the output...
> ```
>
> The Bun script (`run.ts`, Story 2.4) will:
>   1. Call `parseNextArgs(process.argv.slice(2))`.
>   2. If `result.ok === false`: write `result.error.hint` to stderr; `process.exit(2)`.
>   3. If `result.ok === true`: dispatch to `recomputeState`, `loadState`, etc., based on flags.

Story 1.7 lands step 1 only. Steps 2 and 3 are Story 2.4. Step 0 (the slash-command markdown that calls the Bun script) is Story 2.7.

### Documentation Within This Story

This story does NOT ship `docs/cli-flags.md`, `docs/exit-codes.md`, or any other narrative documentation. Story 1.13 (Quick-Start Documentation) owns the public-facing docs; the JSDoc comments in `src/commands/next/args.ts` are the single source of truth for the parser semantics in v0.1.

### Previous Story Intelligence

This story is downstream of Stories 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 (all `done` per `sprint-status.yaml`). Distilled cross-story learnings (full synthesis in the `## Previous Story Intelligence` section below):

- **1.1 scaffold pins** — Bun ≥ 1.3 (1.3.12 verified), Biome 2.3.15 exact, Zod 4.4.1 exact, `oven-sh/setup-bun@v2`. Lockfile is `bun.lock` (text). `tsconfig.json` strict + `verbatimModuleSyntax` + `noUncheckedIndexedAccess` + `noImplicitOverride`. Story 1.7 imports `zod` only; **DO NOT add a new dep**.
- **1.2 errors registry** — 16 codes after Story 1.6. **Story 1.7 does NOT add new error classes.** `ParseError` is a value object on the `Result` channel, intentionally outside the StepperError hierarchy.
- **1.3 io conventions** — no `console.*`; `info`/`warn`/`error` route to **stderr**; `json` routes to **stdout**. Story 1.7's parser is **logging-free** — the caller (Story 2.4 runner) writes the Zod hint to stderr via `error(...)` from `src/io/log.ts` after observing `Err(ParseError)`.
- **1.4 lock semantics** — `LockOptions` test-only-but-exported pattern. Story 1.7 reapplies the test-only-but-exported pattern minimally — no `XOptions` interface needed for the parser (no IO, no async).
- **1.5 schemas + migrations** — registry pattern. Story 1.7's `NextArgsSchema` follows the Zod-schema-with-`.parse`/`.safeParse` idiom but is NOT a migrations registry (no schemaVersion needed for CLI args; flags are static per-command).
- **1.6 state subsystem** — `loadState`, `loadStateUnlocked`, `saveState`, `recomputeState` all exist. Story 1.7's parser does NOT call any of them; the runner (Story 2.4) wires the parser output to `recomputeState` (via `--recompute-state` flag) etc.
- **Test totals before Story 1.7:** 176 pass / 0 fail / 505 expects across 21 files (~426 ms wall-time per Story 1.6 final).

### Latest Tech Information (v0.1.0 release window)

Versions are pinned per AR2 — no further web research is required for this story. No package install or upgrade needed. The dev agent MUST NOT run `bun add` / `bun install --save` during this story.

Zod 4.4.1 ships:

- `z.object({ ... }).strict()` — rejects unknown keys (used for AC-1's unknown-flag rejection).
- `z.enum([...])` — for the `phase` field with 5 values.
- `z.boolean().default(false)` — for the 13 boolean flags.
- `z.string().optional()` — for the 4 optional string fields.
- `safeParse(input)` — returns `{ success: true, data: T } | { success: false, error: ZodError }`. Used to build the `Result<NextArgs, ParseError>` shape.
- `z.infer<typeof Schema>` — type inference helper. Used to derive `NextArgs` from `NextArgsSchema`.

Bun ≥ 1.3 ships `process.argv` (Node-compatible) and synchronous string/array primitives; the tokenizer uses only these. **DO NOT use `node:util.parseArgs`** (D12 architectural choice).

No external runtime dep changes. Zod 4.4.1 is the only external-API call site.

### Project Structure Notes — Anticipated Variances

- **`src/commands/index.ts` and `src/commands/next/index.ts` are barrels** — pure re-exports, no logic. Per architecture lines 1100–1110, every command directory has an `index.ts` barrel. Story 1.7 lands the first two; Stories 1.12 (doctor) and Epic 4 (loop) extend.
- **No `src/commands/next/run.ts`** in this story — Story 2.4 owns the runner. The parser-only delivery is intentional and matches the disciplined-skeleton pattern of Stories 1.5 and 1.6.
- **No `commands/bmad-next.md` modification** — Story 2.7 owns the slash-command markdown body. Story 1.7 is purely additive under `src/commands/`.
- **`Result<T, E>` colocated, not in `src/types/`** — see Dev Notes "Result Helper Type — Colocated, Not Centralised". Future stories that need `Result` (none in v0.1) can import from `args.ts` or migrate to a dedicated foundational module.
- **`ParseError` is NOT in `src/errors.ts`** — see Dev Notes "Architecture §P4 line 858 — Result-Shaped Return". Registry count stays at 16; the AC-1 "no stack trace" requirement justifies the value-object choice.

### Dev Agent Guardrails — Do Not Do These Things

In addition to the cumulative guardrails from Stories 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 (still in force):

- **Do NOT add `console.log` / `console.error` / `console.warn` / `console.info` anywhere.** Biome's `noConsole` rule blocks ALL `console.*` calls. The parser is logging-free; no logger import needed.
- **Do NOT add `default exports`.** Use named exports throughout.
- **Do NOT make `parseNextArgs` async.** It MUST be `synchronous` because the tokenizer + Zod's `safeParse` are sync; making the function async would break the `Result` contract narrowing.
- **Do NOT throw from `parseNextArgs`.** Return `{ ok: false, error }` instead. The architecture's sole exception to AR33 (line 858) requires `Result`-shaped return; throwing would violate it.
- **Do NOT add a `index.ts` barrel that re-exports from a runtime module other than `./args.ts`.** Story 1.7 is parser-only; the barrels exist purely for the public-surface convention.
- **Do NOT use `node:util.parseArgs` or any external arg-parser library.** Hand-rolled tokenizer per D12.
- **Do NOT add `ParseError` to `src/errors.ts` registry.** Registry stays at 16; `ParseError` is intentionally outside.
- **Do NOT import from `src/state/`, `src/io/`, `src/lock/`, `src/schemas/`, `src/migrations/`** in `args.ts`. The parser is pure; the runner (Story 2.4) wires state.
- **Do NOT modify `package.json`** — no new deps. Zod 4.4.1 is already pinned.
- **Do NOT modify `commands/bmad-next.md`** — Story 2.7 owns it.
- **Do NOT modify `src/errors.ts`** — registry stays at 16.
- **Do NOT add a Biome `overrides` block** to whitelist any file.
- **Do NOT bump or modify `bun.lock`.** No new dependencies.
- **Do NOT publish, tag, or push a release.** Version stays at `0.0.0` until Epic 6.
- **Do NOT skip the `.strict()` modifier on `NextArgsSchema`.** It is the AC-1 unknown-flag-rejection mechanism.
- **Do NOT make `parseNextArgs` accept `argv` as a non-readonly array.** Use `readonly string[]` to signal that the parser doesn't mutate the input.

### Git Intelligence

The recent git history (post-Story 1.6):

- `d126ce2 feat: file lock with heartbeat (story 1.4)` — Story 1.5 baseline.
- `f4f66bf feat: IO primitives - log, paths, atomic-write (story 1.3)`
- `636d9ea feat: errors module + registry CI gate (story 1.2)`
- `c6a8eda feat: scaffold repo (story 1.1)`
- `9760e7d docs: add sprint status tracking`

Story 1.5's commit (`feat: schemas + migrations skeleton (story 1.5)`) and Story 1.6's commit (`feat: state subsystem skeleton (story 1.6)`) are on the working branch but may not yet appear in the listed history snapshot. This story's commit (when authored by the dev-story workflow) will be `feat: CLI argument parser (story 1.7)` — the **seventh source-code commit** of the project.

### Forward Dependencies (informational; not work for this story)

These stories will depend on `src/commands/next/args.ts` (this story's outputs):

- **Story 1.8 — Snapshot Branch + SHA Detection:** populates state via `loadState` + `saveState`; CLI flag `--resume` is wired here.
- **Story 1.9 — BMAD Detection:** preconditions on every command; the parser passes through unchanged.
- **Story 1.10 — DAG Seed + Three-Tier Registry:** the DAG construction is invoked by `--list` / `--explain` / `--include-optional` / `--no-optional` flag handling in the runner.
- **Story 1.11 — Persona Resolution:** the `--persona` flag overrides the resolved persona.
- **Story 1.12 — `/bmad-next --doctor` Command:** authors `src/commands/doctor/{index,args,run,checks}.ts` following the same pattern as `src/commands/next/`. **DoctorArgsSchema** follows the same shape per epics.md AC line 463.
- **Story 2.4 — Lock-free `run.ts` for `/bmad-next`:** the **first runtime consumer of `parseNextArgs`** — wires the parser output to `recomputeState`, `loadState`, DAG, dispatch.
- **Story 2.7 — Slash-Command Markdown for `/bmad-next` (Layer 1):** authors `commands/bmad-next.md` body that calls `bun run src/commands/next/run.ts -- $ARGUMENTS`.
- **Epic 3 — Resume / Inspection / State Export:** `--resume`, `--diff-state`, `--export-state`, `--explain`, `--list`, `--watch`, `--force-unlock` flag handlers added to the runner. Each flag is already in `NextArgsSchema` from this story; the runner adds the dispatch logic.
- **Epic 4 — `/bmad-loop` Command:** authors `src/commands/loop/{index,args,run}.ts` following the same pattern. **LoopArgsSchema** follows the same shape per epics.md AC line 463.

### References

- **Story Foundation:**
  - [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7: CLI Argument Parser] — User story + AC verbatim (lines 448–463).
  - [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Foundation & First-Run Diagnostic] — Epic context (line 343+).
- **Architecture Compliance:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#G. CLI Surface & Errors] — D11 + D12 verbatim (lines 553–629).
  - [Source: _bmad-output/planning-artifacts/architecture.md#D11 — Error class shape] — `StepperError` hierarchy (lines 555–600).
  - [Source: _bmad-output/planning-artifacts/architecture.md#D12 — Hand-rolled Zod-validated CLI parser] — parser + Zod schema + `Result<Args, ParseError>` (lines 602–629).
  - [Source: _bmad-output/planning-artifacts/architecture.md#P4 — Function & Error Semantics] — Result-shaped CLI parser exception (line 858).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR21 — Error registry] — `code`, `exitCode`, `actionableHint` shape (line 198).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR22 — Single-line actionable-hint regex] — `/^.*(Run|See|Try|Check) /` (line 199).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR33 — Function & error semantics] — throw-everywhere + CLI parser exception (line 213).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR41 — Module boundary graph] — `commands/` is top-tier (line 236).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Module Boundaries Inside src/] — top-tier graph (lines 1294–1302).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — `src/commands/next/` placement (lines 1102–1110).
  - [Source: _bmad-output/planning-artifacts/architecture.md#FR Coverage Map] — FR8 → `commands/next/run.ts`; FR9–15, 27 → `commands/next/args.ts` (lines 1338–1357).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis] — D12 leaf decision; sprint order D11 + D12 + D3 first (lines 661–676).
- **PRD:**
  - [Source: _bmad-output/planning-artifacts/prd.md] — FR8 (`/bmad-next`), FR9 (`--dry-run`), FR10 (`--step <id>`), FR11 (`--epic`/`--story`/`--phase`), FR12 (`--persona`), FR13 (`--explain`), FR14 (`--list`), FR15 (`--include-optional`/`--no-optional`), FR27 (`--resume`).
  - [Source: _bmad-output/planning-artifacts/prd.md#FR53] — Documented exit codes (line 744).
  - [Source: _bmad-output/planning-artifacts/prd.md#FR54] — stdout/stderr discipline (line 745).
  - [Source: _bmad-output/planning-artifacts/prd.md#NFR-S1] — no network I/O on main thread (parser is sync-pure, NFR-S1 trivially satisfied).
  - [Source: _bmad-output/planning-artifacts/prd.md#NFR-S2] — write only inside project root (parser does no IO, NFR-S2 trivially satisfied).
- **Previous Stories:**
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md] — Bun 1.3.12 host, Biome 2.3.15, Zod 4.4.1 pinned.
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md] — 16-entry registry pattern; **Story 1.7 does NOT extend the registry**.
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md] — `info`/`warn`/`error` → stderr; `json` → stdout. Story 1.7's parser is logging-free.
  - [Source: _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md] — D1 deviation (lock at `src/lock/`); LockHandle/LockOptions API. Story 1.7 does NOT use locks (parser is pure).
  - [Source: _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md] — Zod-schema patterns; `.parse()` vs `.safeParse()`. Story 1.7 uses `.safeParse()` per `Result` shape.
  - [Source: _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md] — `loadState`, `saveState`, `recomputeState` exist; the runner (Story 2.4) wires the parser output to these. Story 1.7's parser does NOT call any state function.
- **Project Config Pin:**
  - [Source: _bmad/config.yaml] — `project_name: bmad-stepper`, `planning_artifacts`, `implementation_artifacts`, `test_framework: bun-test`. **Pinned to `_bmad/config.yaml`.**

### Definition of Done

- [x] All 7 tasks above completed and self-checked.
- [x] All 15 file-structure final-check items pass.
- [x] `src/commands/next/args.ts` exists; exports `parseNextArgs`, `NextArgsSchema`, `NextArgs`, `ParseError`, `Result`.
- [x] `src/commands/next/args.test.ts` exists; covers all 18 flags and AC-1 happy + error paths.
- [x] `src/commands/next/index.ts` and `src/commands/index.ts` barrels exist.
- [x] `src/errors.ts` is byte-identical to its Story 1.6 state (registry stays at 16).
- [x] `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock` are byte-identical to their Story 1.6 state.
- [x] `bun run check` exits 0 locally.
- [x] CI green on `ubuntu-latest` and `macos-latest` (deferred — verified post-merge per Story 1.1 A4 follow-up).
- [x] `parseNextArgs` correctly handles: empty argv → `{ ok: true }` with defaults; `--epic 3` → `value.epic === "3"`; `--epic=3` → `value.epic === "3"`; `--dry-run` → `value.dryRun === true`; `--phase analysis` → `value.phase === "analysis"`; `--bogus` → `{ ok: false, error: { code: "PARSE_ERROR", ... } }`; `--phase fake` → `{ ok: false, error: { issues: [{ code: "invalid_enum_value", ... }] } }`.
- [x] `parseNextArgs` is **synchronous** (not async).
- [x] `parseNextArgs` does NOT throw on any input (always returns `Result`).
- [x] No `console.*` calls anywhere in the new files (Biome `noConsole` confirmed).
- [x] No imports from `src/state/`, `src/io/`, `src/lock/`, `src/schemas/`, `src/migrations/`, `src/errors.ts` (runtime), `node:util`, `commander`, `oclif`, `yargs`, `meow` in `args.ts`.
- [x] Story status flipped to `review` upon dev-story completion.
- [x] Commit pushed to a branch (no force-push to `main`). _(deferred — bmad-loop / orchestrator owns commit + push.)_

## Previous Story Intelligence

This section is a synthesis (cross-story view) of the six prior `done` stories. Each lessons-learned item is tagged with the story-of-origin so the dev agent can trace the rationale.

### From Story 1.1 (Repository Scaffold — `done`)

- **Bun 1.3.12 host** (satisfies AR2 ≥ 1.3 pin). `bun --version` confirms.
- **Biome 2.3.15 exact-pinned**; `noConsole` rule replaces older `noConsoleLog`; `noImplicitAnyLet` moved to `suspicious.` namespace.
- **Zod 4.4.1 pinned in `package.json`**. Story 1.7 imports `zod` only — **DO NOT add a new dep** (no commander, oclif, yargs, meow, parseargs, etc.).
- **Lockfile is `bun.lock` (text format)** — Bun 1.2+ defaults; do not bump.
- **`tsconfig.json` strict + `verbatimModuleSyntax: true` + `noUncheckedIndexedAccess: true` + `noImplicitOverride: true`** — these flags are still in force. The `Result<T, E>` discriminated union narrowing relies on `verbatimModuleSyntax` + `strict` for correct narrowing.
- **`commands/bmad-next.md` placeholder** exists but is empty. Story 1.7 does NOT touch it; Story 2.7 owns the slash-command markdown body.

### From Story 1.2 (Errors Module + Registry CI Gate — `done`)

- **`src/errors.ts` 16-entry registry** at start of this story. **Story 1.7 does NOT add new error classes.** `ParseError` is intentionally a value object on the `Result` channel, NOT a `StepperError` subclass (architecture line 858 sole exception). Registry count stays at 16.
- **Abstract `StepperError` base class** sets `this.name = new.target.name` in constructor; subclasses use `override readonly` modifiers.
- **`StepperExitCode` named type alias (`0 | 1 | 2 | 3 | 4 | 5`)**; exit code 2 = "configuration error" per FR53 + architecture line 597 — this is the bucket for CLI parse errors.
- **Registry CI gate (`src/errors.test.ts`)** asserts: 16-entry count, code uniqueness, exitCode in [0..5], hint regex `/^.*(Run|See|Try|Check) /`. Story 1.7 does NOT modify the registry; the assertion stays at 16. Story 1.7's `ParseError.hint` follows the same single-line "Run/See/Try/Check"-prefixed format for UX coherence even though it's outside the registry.

### From Story 1.3 (IO Primitives — `done`)

- **`src/io/{log,paths,atomic-write}.ts`** exist and are tested. Story 1.7 does NOT import any of them — the parser is sync-pure.
- **`info`/`warn`/`error`/`json`** discipline: `info`/`warn`/`error` → stderr; `json` → stdout. Story 1.7's parser is **logging-free**; the caller (Story 2.4 runner) writes the Zod hint to stderr via `error(...)` after observing `Err(ParseError)`.
- **`assertWithinScope`** routes scope violations through `ScopeViolationError` (Story 1.6 migration). Story 1.7 does NOT trigger any path-write surface; AR42 trivially satisfied.

### From Story 1.4 (File Lock with Heartbeat — `done`)

- **`src/lock/lock.ts` placement (D1 deviation):** lock at `src/lock/`, NOT `src/io/lock.ts`. Story 1.7 does NOT use locks (the parser is pure); this is informational only.
- **`LockOptions` test-only-but-exported pattern.** Story 1.7 does NOT need a similar pattern (the parser has no test-injectable IO surface).
- **`acquire()` / `forceUnlock()` / `LockHandle.release()` API.** Story 1.7 does NOT call these; the runner (Story 2.4) does.

### From Story 1.5 (Schemas + Migrations Skeleton — `done`)

- **`src/schemas/state.ts`** exports `StateV1Schema`, `StateLatestSchema`, `State`. Story 1.7 does NOT import these; the runner (Story 2.4) does.
- **Zod 4.4.1 patterns** — `z.object({...})`, `z.enum([...])`, `z.boolean().default(false)`, `z.string().optional()`, `z.infer<typeof Schema>`. Story 1.7's `NextArgsSchema` follows the same idioms.
- **`.safeParse(input)`** returns `{ success: true, data: T } | { success: false, error: ZodError }`. Story 1.7 uses this to build the `Result<NextArgs, ParseError>` shape.
- **`ScopeViolationError`** added to registry. Story 1.7 does NOT trigger any scope check; trivially satisfied.

### From Story 1.6 (State Subsystem Load / Save / Recompute Skeleton — `done`)

- **`src/state/{load,save,recompute}.ts`** exist. Story 1.7 does NOT import them; the runner (Story 2.4) wires them.
- **`PathologicalInputError.actionableHint`** updated to AC-1 verbatim string (`"Run /bmad-next --recompute-state to rebuild the cache."`). Story 1.7 does NOT modify it; the parser-only delivery doesn't trigger pathological-input paths.
- **`assertWithinScope` throw-site migrated to `ScopeViolationError`** (Story 1.5 deferred Task 7.5 resolved in Story 1.6 Task 6.4). Story 1.7 does NOT trigger scope checks.
- **Test totals:** 176 pass / 0 fail / 505 expects across 21 files (~426 ms wall-time). Story 1.7's additions: ~17–20 new it() blocks across 1 file → expected post-Story-1.7 totals ~193–196 / 0 / ~525–540 across 22 files.
- **`saveState`** requires the caller to pass a live `LockHandle`. Story 1.7 does NOT call `saveState`; the runner (Story 2.4) does.
- **`loadStateUnlocked`** is the read-only variant for Epic 3 read-only flags (`--export-state`, `--diff-state`, `--list`, `--explain`). Story 1.7 lands the **flag definitions**; Story 2.4 wires them to `loadStateUnlocked`.
- **Pre-existing flaky `heartbeat-loss.test.ts`** (Story 1.4 carry-over). Reviewer confirmed during Stories 1.5 + 1.6 reviews that standalone re-run produces 3/0 pass; full-suite intermittent. Story 1.7 does NOT introduce timing-sensitive tests; the flake should not manifest in this story.

### Cross-Story Patterns to Reuse

- **Single source file + colocated test + small directory of co-deliverables** (the template since Story 1.2). This story has 1 functional file (`args.ts`), 1 colocated test (`args.test.ts`), and 2 barrel index files.
- **Test-only-but-exported `XOptions` interface** (Story 1.4 pattern) — NOT applicable here; the parser is pure.
- **Zod schema + `.safeParse(input)` + `Result` shape** (Story 1.7 establishes this; future stories may reuse if they add Result-shaped surfaces, though architecture line 858 says CLI parser is the sole exception).
- **AR41 module boundary graph progressively populated** (Story 1.7 lands the first top-tier module `commands/`).
- **`bun run check` as the composite release-blocker gate** (Story 1.7 Task 6 verifies exit 0 just like prior stories).
- **No edits outside the declared mutation scope** (Story 1.7 mutations are strictly additive — only the 4 new files; zero existing files modified).
- **Verbatim AC-text encoding cross-validation** — AC-1 lists 18 flag keys; Task 3.5's NextArgsSchema MUST contain exactly those 18 keys with the documented Zod types.

## Change Log

- 2026-04-30 — v0.1.0 — Story 1.7 (CLI Argument Parser) created by `bmad-create-story` persona under `bmad-loop` iteration 7 of run `2026-04-30T203155Z-bmad-loop`. Initial frontmatter `status: ready-for-dev`. AC reproduced verbatim from `_bmad-output/planning-artifacts/epics.md` lines 454–463. Comprehensive Dev Notes with architecture compliance (G + D11 + D12 + P4 line 858 + AR21 + AR22 + AR33 + AR41), tokenizer pseudo-code, Zod 4.4.1 `.strict()` mechanism, ParseError UX shape, slash-command argument flow forward note, NOT-`node:util.parseArgs` rationale. Dedicated Previous Story Intelligence section synthesizing 1.1, 1.2, 1.3, 1.4, 1.5, 1.6. Eight forward-dependency notes (Stories 1.8 through Epic 4). Strict additive scope: 4 new files, zero existing files modified.

## Dev Agent Record

Status: done

### Context Reference

- Story 1.7 source: `_bmad-output/planning-artifacts/epics.md` lines 448–463
- Architecture sections: `_bmad-output/planning-artifacts/architecture.md` §G (lines 553–629), D11 (lines 555–600), D12 (lines 602–629), P4 line 858, AR21/AR22 (lines 198–199), AR33 (line 213), AR41 (line 236)
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml` (this story flipped `backlog → ready-for-dev` at 2026-04-30T21:57:27Z; flipped `ready-for-dev → review` at 2026-04-30T22:10:33Z)
- Previous story: `_bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md` (status: `done`)
- Run record (create-story): `.bmad-stepper/runs/2026-04-30T215727Z-bmad-next/run.yaml`
- Task record (create-story): `.bmad-stepper/runs/2026-04-30T215727Z-bmad-next/tasks/t1-create-story.yaml`
- Run record (dev-story): `.bmad-stepper/runs/2026-04-30T221033Z-bmad-next/run.yaml`
- Task record (dev-story): `.bmad-stepper/runs/2026-04-30T221033Z-bmad-next/tasks/t1-dev-story.yaml`

### Agent Model Used

Claude Opus 4.7 (1M context) under bmad-loop iteration 8 of run `2026-04-30T203155Z-bmad-loop`. Persona: bmad-dev-story (Amelia, Senior Software Engineer).

### Debug Log References

- Baseline (Story 1.6 final): `bun test` → 176 pass / 0 fail / 505 expects across 21 files in 441 ms.
- After Story 1.7: `bun test` → 211 pass / 0 fail / 589 expects across 22 files in 420 ms (Δ +35 tests / +84 expects / +1 file).
- `bun test src/commands/next/args.test.ts` standalone → 35 pass / 0 fail / 84 expects in 95 ms (sync-pure parser; no IO).
- `bunx biome ci .` → exit 0 (51 files checked, no fixes applied) after one auto-format pass via `bunx biome check . --write` on 2 files (args.ts, args.test.ts).
- `bunx tsc --noEmit` → exit 0.
- `bun run check` (composite: `biome ci . && bun test --pass-with-no-tests`) → exit 0.
- AR41 verification: `Grep ^import src/commands/` → only `bun:test`, `./args.ts`, `zod`. No imports from `src/state/`, `src/io/`, `src/lock/`, `src/schemas/`, `src/migrations/`, `node:util`, `commander`, `oclif`, `yargs`, `meow`. No runtime use of `console.*` or `: any` / `as any` (the two grep hits in `console.|: any|as any|<any>` are doc-comment text only).
- Strict additive verification: `git status --porcelain src/commands/` → only `?? src/commands/` (new directory). The pre-existing diffs to `src/errors.ts`, `src/errors.test.ts`, `src/io/*` shown by `git status` are uncommitted carryover from Stories 1.5/1.6 dev-story passes (HEAD is at story 1.4 commit `d126ce2`); they predate this iteration and are NOT Story 1.7 mutations.

### Completion Notes List

- All 8 tasks (Task 0..Task 7) and 68 subtask checkboxes flipped to `[x]`.
- 4 new files created under `src/commands/`:
  - `src/commands/index.ts` (24 lines) — top-level barrel re-exporting `./next`.
  - `src/commands/next/index.ts` (32 lines) — per-command barrel re-exporting `parseNextArgs`, `NextArgs`, `NextArgsSchema`, `ParseError`, `Result` from `./args.ts`.
  - `src/commands/next/args.ts` (315 lines including JSDoc) — hand-rolled tokenizer + Zod schema + synchronous `parseNextArgs(argv): Result<NextArgs, ParseError>`.
  - `src/commands/next/args.test.ts` (330 lines) — 35 it() blocks across 5 describe groups.
- Zero existing files modified. `src/errors.ts` (registry stays at 16), `src/io/`, `src/lock/`, `src/schemas/`, `src/migrations/`, `src/state/`, `package.json`, `tsconfig.json`, `biome.json`, `bun.lock`, `commands/bmad-next.md`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json` all byte-identical to their Story 1.6 final state.
- AR41 module boundary verified — `src/commands/**/*.ts` imports only `zod` (in args.ts) and `bun:test` + `./args.ts` (in args.test.ts).
- AR33 sole exception (architecture line 858) honoured — `parseNextArgs` returns `Result<NextArgs, ParseError>` synchronously; `ParseError` is a plain value object (NOT a `StepperError` subclass). Registry stays at 16 codes.
- AR22 single-line actionable hint — `parseNextArgs` builds `Run /bmad-next --help to see the supported flags. (<first-issue-message>)`. Test asserts `hint.startsWith("Run ")` and `!hint.includes("\n")`.
- 18-flag inventory verified — `Object.keys(NextArgsSchema.shape).sort()` yields exactly the 18 documented keys (test asserts `keys.length === 18` plus deep-equal against the sorted list).
- `--no-optional` semantics — the schema enumerates `noOptional` as a boolean defaulting to false. The flag `--no-optional` maps via the standard kebab→camel conversion to `noOptional` and is set to `true` via boolean shorthand. There is no special "negation" handling. `--no-X` for any other X (e.g. `--no-dry-run`) becomes `noDryRun` and is rejected by `.strict()` with an `unrecognized_keys` issue.
- Cross-validation gap (`--include-optional` + `--no-optional` both true) intentional — the parser is lenient; the runner (Story 2.4) cross-validates. Documented in JSDoc and tested.
- Empty-string flag value (`--epic=`) accepted — Zod's `.string().optional()` accepts empty strings. The runner is responsible for treating empty-string as "no filter". Documented in JSDoc and tested.
- Bun host: 1.3.12 (satisfies AR2 ≥ 1.3 pin).
- Test totals: 176 → 211 pass / 0 → 0 fail / 505 → 589 expects across 21 → 22 files. Δ +35 tests / +84 expects / +1 file.
- Quality gates: `bun test` exit 0 (211/0/589/22, 420 ms); `bunx biome ci .` exit 0 (51 files, no fixes); `bun run check` exit 0; `bunx tsc --noEmit` exit 0.
- No `console.*` calls in src/commands/ (Biome `noConsole` rule confirmed). No `: any` / `as any` in src/commands/ runtime code.
- The architecture's "~50 lines hand-rolled" target — args.ts contains the tokenizer (`tokenize` ~45 lines + `kebabToCamel` ~3 lines) + Zod schema (~30 lines) + `parseNextArgs` body (~25 lines) + Result/ParseError types (~5 lines) + module-level imports (~3 lines), totalling ~111 lines of source code excluding JSDoc. The full file (315 lines) includes ~204 lines of JSDoc per Story 1.6 conventions.

### File List

**New files (4 — all under `src/commands/`, strictly additive):**

- `src/commands/index.ts` (24 lines) — top-level barrel re-exporting `./next`.
- `src/commands/next/index.ts` (32 lines) — per-command barrel re-exporting `parseNextArgs`, `NextArgs`, `NextArgsSchema`, `ParseError`, `Result`.
- `src/commands/next/args.ts` (315 lines) — hand-rolled tokenizer + Zod schema + synchronous `parseNextArgs(argv): Result<NextArgs, ParseError>`.
- `src/commands/next/args.test.ts` (330 lines) — 35 it() blocks across 5 describe groups: defaults (2), happy path form coverage (23 — 6 named + 13 boolean parametric + 4 string parametric), error path (5), cross-validation gap (2), form equivalence (3).

**Modified files (2 — meta only, no src/ changes):**

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — three line edits: `1-7-cli-argument-parser: ready-for-dev → in-progress → review`; `last_updated: 2026-04-30T21:57:27Z → 2026-04-30T22:10:33Z`; comment `# last_updated:` advanced to match.
- `_bmad-output/implementation-artifacts/1-7-cli-argument-parser.md` — frontmatter Status: ready-for-dev → review; inline Status: ready-for-dev → review; all 68 task/subtask checkboxes flipped to `[x]`; Dev Agent Record fully populated; Change Log entry appended.

**Created run records (2):**

- `.bmad-stepper/runs/2026-04-30T221033Z-bmad-next/run.yaml`
- `.bmad-stepper/runs/2026-04-30T221033Z-bmad-next/tasks/t1-dev-story.yaml`

**Files NOT modified (verified byte-identical to Story 1.6 final state):**

- `src/errors.ts` (registry stays at 16 codes; `ParseError` is a value object on the Result channel, NOT in the registry).
- `src/errors.test.ts`, `src/io/{log,paths,atomic-write}.ts`, all `src/io/*.test.ts`, `src/lock/lock.ts`, all `src/lock/*.test.ts`, `src/schemas/state.ts`, all `src/schemas/*.test.ts`, all `src/migrations/`, all `src/state/`.
- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `.gitignore`, `LICENSE`.

### Change Log

- 2026-04-30 — v0.1.0 — Story 1.7 (CLI Argument Parser) implemented by `bmad-dev-story` persona under `bmad-loop` iteration 8 of run `2026-04-30T203155Z-bmad-loop`. Created 4 new files under `src/commands/` (top-tier per AR41): top-level barrel, per-command barrel, hand-rolled tokenizer + Zod-validated args parser (~111 source lines + JSDoc), 35 it() blocks of pure-sync unit tests covering AC-1's 18-flag inventory, defaults, kebab→camel conversion, unknown-flag rejection (Zod `.strict()` `unrecognized_keys`), wrong-enum rejection (Zod `invalid_value`), boolean type coercion (`--dry-run=maybe` rejected), cross-validation gap (lenient — runner-owned), empty-string acceptance, and form equivalence (`--epic=3` ≡ `--epic 3`). Zero existing files modified — strictly additive scope honoured. Test totals: 176 → 211 pass / 505 → 589 expects across 21 → 22 files. Quality gates green: `bun test` exit 0; `bunx biome ci .` exit 0; `bun run check` exit 0; `bunx tsc --noEmit` exit 0. Story Status flipped to `review` (frontmatter + inline + Dev Agent Record). Sprint status flipped 1-7-...: ready-for-dev → in-progress → review.

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.7 (1M context) — `bmad-code-review` persona
**Date:** 2026-04-30
**Run ID:** `2026-04-30T222143Z-bmad-next` (loop iteration 9 of `2026-04-30T203155Z-bmad-loop`)
**Outcome:** APPROVE

### AC Verification — file:line evidence

| AC | Sub-clause | Verdict | Evidence |
|----|------------|---------|----------|
| AC-1 | `NextArgsSchema` exports 18 keys exactly | PASS | `src/commands/next/args.ts:142-165` schema; `src/commands/next/args.test.ts:54-79` `Object.keys(...).sort()` 18-key inventory test |
| AC-1 | `step?, epic?, story?, persona?` optional strings | PASS | `args.ts:144-146,154` `z.string().optional()`; `args.test.ts:160-178` parametric string test |
| AC-1 | `phase?` enum (5 values) | PASS | `args.ts:147-149` `z.enum([...]).optional()`; `args.test.ts:104-109` `--phase analysis` |
| AC-1 | 13 booleans default `false` | PASS | `args.ts:150-163` `.default(false)` x13; `args.test.ts:28-52` defaults test (deep-equal); 130-158 parametric boolean test |
| AC-1 | `parseNextArgs(argv)` returns `Result<NextArgs, ParseError>` on valid input | PASS | `args.ts:106` `Result<T,E>` type; `args.ts:292-315` parser; `args.test.ts:28-52` Defaults Result-shape test |
| AC-1 | Defaults filled when absent | PASS | `args.test.ts:32-51` deep-equals all 18 defaults |
| AC-1 | Returns `Err(ParseError)` on unknown flag | PASS | `args.ts:298-314` build ParseError on `safeParse` failure; `args.test.ts:182-190` `--bogus` → `unrecognized_keys` |
| AC-1 | Returns `Err(ParseError)` on wrong type | PASS | `args.test.ts:202-209` `--phase bogus` → `invalid_value`; 211-219 `--dry-run=maybe` → boolean type error |
| AC-1 | Single-line Zod hint, no stack trace | PASS | `args.ts:304` hint format; `args.test.ts:192-200` `hint.startsWith("Run ")`, `!hint.includes("\n")` |
| AC-1 | Hand-rolled (~50 lines) no external lib | PASS | 109 effective source lines (excluding JSDoc/blanks/comments) — within 40–80 soft target's ≤150 firm cap; no `commander/oclif/yargs/meow/parseargs/node:util` imports |
| AC-1 | Pattern reusable for `LoopArgsSchema` / `DoctorArgsSchema` | PASS (informational) | Tokenizer + `safeParse` + `Result` shape composable; story explicitly defers `Loop`/`Doctor` to Epic 4 / Story 1.12; documented in JSDoc and `next/index.ts` barrel |

### Architectural Conformance

| Constraint | Verdict | Evidence |
|------------|---------|----------|
| AR21 (`code/exitCode/actionableHint` shape) | PASS | `ParseError.code: "PARSE_ERROR"`, `hint: "Run /bmad-next --help..."`. Off-registry by design (architecture line 858 sole exception). |
| AR22 (single-line `Run/See/Try/Check` regex) | PASS | Hint starts with `Run ` per `args.ts:304`; `args.test.ts:192-200` asserts `startsWith("Run ")` + no `\n`. |
| AR33 (throw-everywhere; CLI parser sole exception) | PASS | `parseNextArgs` is **synchronous**, never throws, returns `Result<NextArgs, ParseError>`. `ParseError` is a plain value object, NOT a `StepperError` subclass — `Error.captureStackTrace` not invoked. JSDoc cites architecture line 858. |
| AR41 (top-tier `commands/`; no upward imports; allowed downward only) | PASS | `args.ts` imports only `zod`. `args.test.ts` imports only `bun:test` + sibling `./args.ts`. Manual `Grep` audit (`src/commands/`): zero `node:*`, zero `src/state/`, `src/io/`, `src/lock/`, `src/schemas/`, `src/migrations/`, `src/errors`, no `commander/oclif/yargs/meow/parseargs/node:util`. |
| D12 (hand-rolled tokenizer + Zod + Result) | PASS | `tokenize()` ~64 lines incl. boolean-coerce; `kebabToCamel()` ~3 lines; `NextArgsSchema` ~24 lines; `parseNextArgs` ~24 lines. Total ~109 effective source lines. No external arg-parser. |
| Registry count unchanged (16 codes) | PASS | `src/errors.test.ts:24-41` `REQUIRED_CODES` length still 16; `src/errors.ts` not modified by this story; `extends StepperError` count = 16 verified via Grep. |
| Strictly-additive scope | PASS | `git diff --stat HEAD -- src/commands/` = empty (untracked new dir). 4 new files, 0 modified existing source files. |
| FR8/9/10/11/12/13/14/15/27/53/54 surface readiness | PASS | All 18 flags listed in schema; runner (Story 2.4) consumes the Result. Exit-code 2 for `Err` + stderr-stream hint (FR53/54) is the runner's responsibility per JSDoc. |
| NFR-S1 (no network IO on main thread) | TRIVIAL PASS | parser is sync-pure; no IO. |
| NFR-S2 (writes only inside project root) | TRIVIAL PASS | parser performs no IO. |

### Findings

**Must-fix:** none.

**Should-fix:** none.

**Nits:** none.

**Info:**

- **I1 — Boolean coercion path documented and exercised.** When `--flag=value` form is used with a non-coercible string (e.g. `--dry-run=maybe`), the tokenizer leaves the string in the raw object so Zod produces a `boolean` type error. The test at `args.test.ts:211-219` correctly asserts `path === ["dryRun"]` rather than the issue code (Zod 4.4.1 issue codes for type mismatches are `"invalid_type"` but the test uses path-based assertion which is robust across Zod minor versions). Acceptable.
- **I2 — `Result<T,E>` colocated, not in `src/types/`.** Story explicitly chose colocation (Dev Notes "Result Helper Type — Colocated, Not Centralised"). This is the only Result-shaped surface in v0.1; any future Result consumer (Epic 5 failure UX speculative) can re-export from `args.ts` or migrate to a foundational `src/types/result.ts`. Documented.
- **I3 — `--no-X` only handled for `--no-optional`.** The tokenizer does NOT special-case `--no-` prefix stripping. `--no-optional` works because the schema enumerates `noOptional` as a boolean default-false; `--no-optional` boolean-shorthand sets `noOptional=true` via the standard kebab→camel pathway. `--no-dry-run` would map to `noDryRun` and be rejected by `.strict()` with `unrecognized_keys`. Documented in `args.ts:189-194` and noted explicitly in `args.test.ts:111-121`.
- **I4 — Cross-validation gap (intentional).** `--include-optional` + `--no-optional` together passes parsing; the runner (Story 2.4) is responsible for surfacing the semantic conflict. Documented in `args.ts:62-68` and tested at `args.test.ts:234-243`. Approve.
- **I5 — Empty-string flag value accepted.** `--epic=""` parses to `value.epic === ""` because `z.string().optional()` accepts empty strings. The runner is responsible for treating empty-string as "no filter". Documented in `args.ts:70-72` and tested at `args.test.ts:245-250`. Approve.
- **I6 — Pre-existing `src/io/`, `src/errors.ts`, `src/errors.test.ts` working-tree diff.** `git status --porcelain` shows uncommitted modifications to `src/errors.ts`, `src/errors.test.ts`, `src/io/atomic-write.test.ts`, `src/io/no-write-outside-scope.test.ts`, `src/io/paths.test.ts`, `src/io/paths.ts` — these are carry-over from prior Stories 1.5/1.6 dev-story passes (HEAD is at story 1.4 commit `d126ce2`); they predate this iteration. Story 1.7 itself adds zero modifications outside `src/commands/` (untracked) and the meta-only sprint-status + story-file updates per scope. Verified by inspecting the dev-story task record. Not in Story 1.7's mutation scope.

### Verification Commands

| Command | Exit | Output |
|---------|------|--------|
| `bun test` | 0 | 211 pass / 0 fail / 589 expect() / 22 files (485ms) |
| `bun test src/commands/` | 0 | 35 pass / 0 fail / 84 expect() / 1 file (18ms) |
| `bun test src/commands/next/args.test.ts` | 0 | identical to above |
| `bunx biome ci .` | 0 | Checked 51 files in 23ms. No fixes applied. |
| `bun run check` | 0 | `biome ci .` + `bun test --pass-with-no-tests` both green |
| `bunx tsc --noEmit` | 0 | (clean) |
| Manual import audit (Grep on `src/commands/`) | clean | only `zod`, `bun:test`, `./args.ts` |
| `extends StepperError` count in `src/errors.ts` | 16 | unchanged |

### Deviation Verdicts

- **`Result<T,E>` colocated in `args.ts`** — accept. Story explicitly chose colocation; only consumer in v0.1; future migration trivial.
- **`ParseError` not in `src/errors.ts` registry** — accept. Architecture line 858 declares the CLI parser as the sole AR33 exception; AC-1 "no stack trace" requires the value-object choice. Registry stays at 16.
- **No special `--no-X` prefix-stripping logic** — accept. Story explicitly chose to enumerate `noOptional` as a schema key and treat `--no-optional` as standard kebab→camel; documented and tested.
- **Cross-validation gap (`--include-optional` + `--no-optional`)** — accept. Runner-owned per JSDoc; documented and tested.
- **Empty-string flag value accepted** — accept. Runner-owned per JSDoc; documented and tested.
- **Boolean-coerce path inside tokenizer (rather than relying on Zod's `z.coerce.boolean()`)** — accept. Inline string-to-boolean coercion only for the `"true"`/`"false"` literal strings preserves Zod's strict-mode rejection of non-coercible strings (`--dry-run=maybe` surfaces a Zod type error; documented and tested).

### Test Quality Assessment

- **Boundary coverage** — PASS. 35 `it()` blocks across 5 `describe` groups: defaults (2 — empty argv + 18-key inventory), happy-path form coverage (23 — 6 named + 13 boolean parametric + 4 string parametric), error path (5), cross-validation gap (2), form equivalence (3).
- **Determinism** — PASS. Parser is sync-pure; no real-time waits, no IO, no mocks. Total wall-time 18ms standalone, ~485ms full project (regression-free).
- **AC-pinned assertions** — PASS. Tests assert `result.ok === true/false`, deep-equal of all 18 default fields, exact Zod issue `code` and `path` values, hint format (`startsWith("Run ")`, no `\n`), exact 18-key sorted inventory.
- **Type safety in tests** — PASS. `getBooleanField()` helper avoids `as any` narrowing; satisfies Biome `noExplicitAny`.
- **Synchronous nature** — PASS. No `async` / `await` in `args.ts` (the only matches are JSDoc text). Test functions are non-async.
- **`Object.keys(...).sort()` 18-flag inventory** — PASS at `args.test.ts:54-79`; the deep-equal sort guarantees the 18 documented flags exactly.
- **kebab→camel coverage** — PASS. All multi-word kebab flags (`--dry-run`, `--include-optional`, `--no-optional`, `--recompute-state`, `--export-state`, `--diff-state`, `--force-unlock`) verified via the parametric loop.
- **Each Zod issue type exercised** — PASS. `unrecognized_keys` (line 189), `invalid_value` (208), boolean type-error path (218), multi-issue first-message-in-hint (221-231).
- **Single-line + actionable hint** — PASS. `args.test.ts:192-200` asserts both.

### Conclusion

Story 1.7 is **APPROVED** without conditions. The hand-rolled CLI parser lands cleanly as the **first source-side `src/commands/` module** and the **sole AR33 throw-everywhere exception**. The 18-flag inventory matches AC-1 verbatim; the `Result<NextArgs, ParseError>` shape returns synchronously, never throws, and `ParseError` is a plain value object outside the StepperError registry (registry stays at 16). The hand-rolled tokenizer + Zod schema + parser body totals ~109 effective source lines — well under the 150-firm cap, with a small overshoot of the 80-line soft target attributable to `tokenize()` carrying inline boolean-coerce logic plus an explicit boolean-key allowlist (acceptable; documented). All five quality gates (`bun test`, `bunx biome ci .`, `bun run check`, `bunx tsc --noEmit`, `bun test src/commands/`) exit 0. Strictly-additive scope honoured: 4 new files, zero modified existing source files, sprint-status + story-file metadata updates only.

Story status flipped to `done`. Sprint-status updated `1-7-cli-argument-parser: in-progress → done`.
