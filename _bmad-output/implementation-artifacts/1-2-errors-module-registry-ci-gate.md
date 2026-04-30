---
status: done
story_id: '1.2'
story_key: 1-2-errors-module-registry-ci-gate
epic: '1'
title: Errors Module + Registry CI Gate
created: '2026-04-30'
last_updated: '2026-04-30'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR6
  - FR32
  - FR46
  - FR53
nfr_coverage:
  - NFR-M1
  - NFR-M2
ar_coverage:
  - AR21
  - AR22
  - AR33
  - AR36
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad/config.yaml
---

# Story 1.2: Errors Module + Registry CI Gate

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a **Stepper contributor**,
I want **every error class registered in a single `src/errors.ts` with a CI gate that asserts hint format, code uniqueness, and valid exit code**,
so that **errors-as-primary-UX is enforceable from day one and no error class can ship without an actionable hint**.

## Context Summary

This is the **first source-code story** of the project. Story 1.1 landed the repository scaffold (package.json, tsconfig.json, biome.json, plugin manifest, CI workflow, placeholder slash command) but no `src/` files. Story 1.2 introduces the **first TypeScript module** — `src/errors.ts` — and its colocated test `src/errors.test.ts`. Both are foundational primitives in the module-boundary graph (AR41): `errors.ts` has zero upward imports and is itself imported by **every other module** in the project, so its shape must be locked-in before any other Epic 1 story (1.3 IO primitives, 1.4 file lock, 1.5 schemas, 1.6 state, 1.7 CLI parser, 1.8 snapshot, 1.9 BMAD detect, 1.10 DAG, 1.11 personas, 1.12 doctor) can begin.

The story also wires the **first real CI gate** of the project. Story 1.1's `bun run check` ran `biome ci . && bun test --pass-with-no-tests` (the empty-pass case). After Story 1.2 lands, `bun test` will discover `src/errors.test.ts` automatically (Bun's default test glob includes `**/*.test.ts`), the registry assertions will run on every CI pass, and the `--pass-with-no-tests` flag becomes a defensive no-op.

The PRD's **Errors-as-primary-UX** principle (one of the four user-experience pillars) is operationalised here. Every concrete error class declares an `actionableHint` that ends with a concrete next-action command starting with `Run`, `See`, `Try`, or `Check`. The CI gate enforces this at compile-and-test time so that no future contributor can ship an error class that prints a stack trace as the user-facing message.

This is **AR21 + AR22** literally. AR21 defines the error-class shape; AR22 defines the registry CI gate. Both architectural requirements name `src/errors.ts` and `src/errors.test.ts` explicitly.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.2 (lines 367–373, BDD Given/When/Then/And format).

### AC-1 (Given/When/Then)

**Given** the abstract `StepperError` class with `code: StepperErrorCode`, `exitCode: 0|1|2|3|4|5`, `actionableHint: string`, optional `detail`
**When** every concrete error subclass is registered via the exported `errorRegistry`
**Then** `src/errors.test.ts` enumerates the registry and asserts: (a) every `actionableHint` is non-empty, (b) every hint matches `/^.*(Run|See|Try|Check) /`, (c) every `code` is unique, (d) every `exitCode` ∈ {0,1,2,3,4,5}

### AC-2 (And — initial codes registered)

**And** initial codes are registered: `LOCK_CONTENTION`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE`, `CORRUPT_STATE`, `STATE_TOO_NEW`, `STATE_CHANGED_DURING_DISPATCH`, `VERIFIER_FAILURE`, `PATHOLOGICAL_INPUT`, `BUDGET_EXCEEDED`, `TIMEOUT`, `CONFIG_ERROR`, `MIGRATION_FAILURE`

### AC-3 (And — release blocker)

**And** `bun run check` includes this test as a release blocker

## Tasks / Subtasks

- [x] **Task 1 — Create `src/` directory and `src/errors.ts` skeleton (AC: 1)**
  - [x] 1.1 Create the `src/` directory at the project root. (Story 1.1's source tree explicitly excluded `src/`; this story is the first one to materialise it.)
  - [x] 1.2 Create `src/errors.ts` with the `StepperErrorCode` discriminated-union string-literal type listing all 15 codes from AC-2 (verbatim, no aliases): `LOCK_CONTENTION`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE`, `CORRUPT_STATE`, `STATE_TOO_NEW`, `STATE_CHANGED_DURING_DISPATCH`, `VERIFIER_FAILURE`, `PATHOLOGICAL_INPUT`, `BUDGET_EXCEEDED`, `TIMEOUT`, `CONFIG_ERROR`, `MIGRATION_FAILURE`.
  - [x] 1.3 Define the abstract base class `StepperError` per AR21 / architecture §D11:
    - extends `Error`
    - `abstract readonly code: StepperErrorCode`
    - `abstract readonly exitCode: 0 | 1 | 2 | 3 | 4 | 5`
    - `abstract readonly actionableHint: string` (single-line, main-thread output)
    - `readonly detail?: string` (multi-line, run-log only)
    - `toJSON()` that returns `{ code, exitCode, message, actionableHint, detail }`
    - constructor takes `(message: string, detail?: string)` and forwards `message` to `super(...)`
  - [x] 1.4 Set `Error.name` per subclass: each subclass MUST set `this.name = "<SubclassName>"` in its constructor (or via a static initializer) so stack traces and `JSON.stringify` carry meaningful class names.

- [x] **Task 2 — Implement the 15 concrete error subclasses (AC: 2)**

  Each subclass has class name = `<TitleCaseFromCode>Error` (e.g., `LOCK_CONTENTION` → `LockContentionError`) per the AR31 naming convention (architecture §"Naming Conventions" + story 1.1 dev guardrails). Each subclass declares its `code`, `exitCode`, and `actionableHint` as `readonly` literal fields. The exit-code mapping below is from architecture §D11 "Exit-code mapping (PRD-mandated)" (lines 591–600) and the §Coherence Validation Correction (lines 1666–1675) for the two later additions.

  Implement these subclasses with **exact** `code`, `exitCode`, and `actionableHint` strings (each hint MUST start with `Run`, `See`, `Try`, or `Check` — see AR22 regex):

  - [x] 2.1 **`LockContentionError`** — `code: "LOCK_CONTENTION"`, `exitCode: 4`, hint: `Run /bmad-next --force-unlock if you are sure no other Stepper process is running.`
  - [x] 2.2 **`BranchSwitchError`** — `code: "BRANCH_SWITCH"`, `exitCode: 1`, hint: `Run /bmad-next --resume to retry on the new branch after reviewing the state delta.`
  - [x] 2.3 **`BmadIncompatibleError`** — `code: "BMAD_INCOMPATIBLE"`, `exitCode: 3`, hint: `Run /bmad-next --upgrade to see a Stepper version compatible with your BMAD installation.`
  - [x] 2.4 **`BmadNotInstalledError`** — `code: "BMAD_NOT_INSTALLED"`, `exitCode: 3`, hint: `Run npx bmad-method install --tools claude-code first.` (Architecture §Coherence Validation Correction line 1666 + line 1675.)
  - [x] 2.5 **`UnknownBmadSkillError`** — `code: "UNKNOWN_BMAD_SKILL"`, `exitCode: 3`, hint: `Run /bmad-next --list to see the candidate skills your BMAD installation registers.`
  - [x] 2.6 **`DagCycleError`** — `code: "DAG_CYCLE"`, `exitCode: 3`, hint: `See _bmad-output/.stepper/runs/<latest>/log.md for the cycle path; check the bmad-stepper.config.yaml dag.overrides block for circular edges.`
  - [x] 2.7 **`CorruptStateError`** — `code: "CORRUPT_STATE"`, `exitCode: 1`, hint: `Run /bmad-next --doctor to inspect _bmad-output/.stepper/state.yaml; restore from .bak if needed.`
  - [x] 2.8 **`StateTooNewError`** — `code: "STATE_TOO_NEW"`, `exitCode: 1`, hint: `Run /bmad-next --upgrade to install a Stepper version that supports this schema.` (Architecture §"Old-Stepper-on-new-state behavior" line 541.)
  - [x] 2.9 **`StateChangedDuringDispatchError`** — `code: "STATE_CHANGED_DURING_DISPATCH"`, `exitCode: 1`, hint: `Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state.` (Architecture §Coherence Validation Correction line 1674.)
  - [x] 2.10 **`VerifierFailureError`** — `code: "VERIFIER_FAILURE"`, `exitCode: 1`, hint: `See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.`
  - [x] 2.11 **`PathologicalInputError`** — `code: "PATHOLOGICAL_INPUT"`, `exitCode: 5`, hint: `Check the input shape against the schema in _bmad-output/.stepper/runs/<latest>/log.md.`
  - [x] 2.12 **`BudgetExceededError`** — `code: "BUDGET_EXCEEDED"`, `exitCode: 5`, hint: `See bmad-stepper.config.yaml budgets to raise the per-step limit, or run /bmad-next --resume after pruning the input.`
  - [x] 2.13 **`TimeoutError`** — `code: "TIMEOUT"`, `exitCode: 1`, hint: `Run /bmad-next --resume to retry; check bmad-stepper.config.yaml timeouts to extend the per-step deadline.`
  - [x] 2.14 **`ConfigError`** — `code: "CONFIG_ERROR"`, `exitCode: 2`, hint: `See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema.`
  - [x] 2.15 **`MigrationFailureError`** — `code: "MIGRATION_FAILURE"`, `exitCode: 2`, hint: `Run /bmad-next --doctor to inspect the failing migration; restore _bmad-output/.stepper/state.yaml from .bak and re-run the migration.`

  Notes for the dev agent:
  - The hint text above is the canonical wording. If a hint must change for clarity, the regex `/^.*(Run|See|Try|Check) /` MUST still match (the verb followed by a space MUST appear in the hint).
  - Hints SHOULD be a single line (no `\n`). The CI gate does not regex against newlines but the user-facing principle is single-line on the main thread.
  - Each subclass constructor takes `(message: string, detail?: string)` to match the abstract base. The `detail` field is optional and is only consumed by the run-log writer (Story 1.3 onwards).

- [x] **Task 3 — Export the `errorRegistry` (AC: 1, 2)**
  - [x] 3.1 At the bottom of `src/errors.ts`, export a `const errorRegistry` whose values are the **15 concrete error classes** (constructors, not instances). The exact runtime shape must support `Object.values(errorRegistry)` enumeration in the test (architecture §D11 line 589).
  - [x] 3.2 Recommended shape (TypeScript):
    ```typescript
    export const errorRegistry = {
      LockContentionError,
      BranchSwitchError,
      BmadIncompatibleError,
      BmadNotInstalledError,
      UnknownBmadSkillError,
      DagCycleError,
      CorruptStateError,
      StateTooNewError,
      StateChangedDuringDispatchError,
      VerifierFailureError,
      PathologicalInputError,
      BudgetExceededError,
      TimeoutError,
      ConfigError,
      MigrationFailureError,
    } as const;

    export type ErrorRegistry = typeof errorRegistry;
    ```
  - [x] 3.3 Also export the `StepperErrorCode` type and the abstract `StepperError` class so other modules can both throw and pattern-match on `instanceof StepperError`.
  - [x] 3.4 Ensure no side-effects at module load time (the file is foundational per AR41 — pure declarations only, no IO, no logging, no mutations of global state).

- [x] **Task 4 — Implement `src/errors.test.ts` registry CI gate (AC: 1, 3)**
  - [x] 4.1 Create `src/errors.test.ts` colocated next to `src/errors.ts` per AR32 ("Tests colocated next to source") and Story 1.1's naming convention (P7).
  - [x] 4.2 Use the Bun test runner imports (`import { describe, expect, it } from "bun:test";` per the architecture's bun-test framework declaration).
  - [x] 4.3 Import `errorRegistry` and the abstract `StepperError` from `./errors.ts` (note the `.ts` extension in the import — `tsconfig.json` sets `allowImportingTsExtensions: true`).
  - [x] 4.4 The test enumerates `Object.values(errorRegistry)` and instantiates each constructor with a synthetic message (e.g., `new ErrorClass("test")`) to read its `code`, `exitCode`, and `actionableHint` fields.
  - [x] 4.5 Assertions (AC-1 a/b/c/d):
    - **(a) Non-empty hint:** `expect(instance.actionableHint.trim().length).toBeGreaterThan(0)` for every subclass.
    - **(b) Hint regex:** `expect(instance.actionableHint).toMatch(/^.*(Run|See|Try|Check) /)` for every subclass.
    - **(c) Code uniqueness:** collect all codes into an array; assert `new Set(codes).size === codes.length` (or use a `Map` and fail with a descriptive message naming the duplicate).
    - **(d) Exit code domain:** `expect([0, 1, 2, 3, 4, 5]).toContain(instance.exitCode)` for every subclass.
  - [x] 4.6 Add a meta-assertion that the registry contains **exactly 15** entries and that the 15 expected codes (the AC-2 list) are all present. Use a `Set<StepperErrorCode>` derived from the 15 string literals and compare to the registry's collected codes. This protects against silent additions or removals.
  - [x] 4.7 The test file must have **zero `console.log`** (Biome `noConsole` rule blocks it; the dev agent uses `expect` with descriptive failure messages instead).
  - [x] 4.8 The test must complete in well under 1 second (no IO, no network — pure in-memory enumeration). Mark each `it(...)` block with a clear description that names the assertion (e.g., `"every actionableHint is non-empty"`, `"every hint starts with Run/See/Try/Check"`, etc.).

- [x] **Task 5 — Verify `bun run check` includes the test as a release blocker (AC: 3)**
  - [x] 5.1 Inspect `package.json`. The current `scripts.check` is `"biome ci . && bun test --pass-with-no-tests"` (per Story 1.1). Bun's default test discovery globs `**/*.test.ts` (and a few sibling patterns), which includes `src/errors.test.ts` automatically — **no `package.json` change is required** if Bun's defaults pick up the file.
  - [x] 5.2 Run `bun test` locally and confirm the output line lists `src/errors.test.ts` and reports the assertion count (≥ 5 expects per the test design above). If `bun test` does NOT discover the file, troubleshoot the `bunfig.toml`'s `[test]` config (Story 1.1 left `bunfig.toml` as a comment-only placeholder so defaults apply).
  - [x] 5.3 Run `bun run check` locally and confirm exit 0, with `src/errors.test.ts` reported as run. The `--pass-with-no-tests` flag becomes a defensive no-op (it only changes behaviour when zero tests exist, and now one test file exists).
  - [x] 5.4 Confirm the GitHub Actions workflow `.github/workflows/ci.yml` (from Story 1.1) runs `bun run check` and therefore picks up the registry test automatically. **No workflow file change is required** — the gate is already a release blocker per AR36.
  - [x] 5.5 If for any reason `bun test` does not auto-discover `src/errors.test.ts`, the dev agent SHOULD prefer a `bunfig.toml` `[test]` adjustment over modifying `package.json`. Adding an explicit test path to `scripts.check` is allowed only as a last resort and must be documented in Completion Notes.

- [x] **Task 6 — Local verification (AC: 1, 2, 3)**
  - [x] 6.1 Run `bunx biome ci .` and confirm exit 0. The new `src/errors.ts` and `src/errors.test.ts` MUST pass Biome 2.3.15 linting (note the `noConsole` rename from `noConsoleLog` per Story 1.1 Completion Notes — this only applies if the dev accidentally writes a `console.log`).
  - [x] 6.2 Run `bun test` and confirm: 1 test file (`src/errors.test.ts`), at least 5 individual `it(...)` assertions, all green, exit 0.
  - [x] 6.3 Run `bun run check` (the composite release-blocker gate) and confirm exit 0.
  - [x] 6.4 Confirm `src/errors.ts` imports nothing from `src/io/`, `src/state/`, `src/dag/`, or any other src module (AR41 module-boundary graph: errors.ts is foundational with **zero upward imports**).
  - [x] 6.5 Confirm `src/errors.ts` imports nothing from Node.js (`node:*`), npm packages, or external libraries — only `Error` from the JS lib is needed (no Zod here; AR41).

- [x] **Task 7 — Final story-level sanity check (AC: 1, 2, 3)**
  - [x] 7.1 Confirm the file count: exactly two new files under `src/` (`src/errors.ts`, `src/errors.test.ts`). No other src files in this story.
  - [x] 7.2 Confirm no edits to: `package.json` (unless Task 5.5 last-resort), `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/`. This story is source-only.
  - [x] 7.3 Confirm no edits to anything under `_bmad-output/.stepper/` (the persistence boundary AR42 — `_bmad-output/.stepper/` does not exist yet anyway, but assert intent).
  - [x] 7.4 Confirm the registry test exit code is 0 even when run via `bun test src/errors.test.ts` directly (in addition to the full-suite `bun test`).
  - [x] 7.5 Update this story file's Status to `review` upon completion (the dev-story workflow handles this — bmad-create-story leaves it `ready-for-dev`).

## Dev Notes

### Architecture Compliance — What the Dev Agent MUST Follow

This story implements **AR21** (Error class hierarchy), **AR22** (Error registry CI gate), **AR33** (throw-everywhere semantics — sets the contract for every later module), **AR36** (Code quality CI gates), and **AR41** (Module boundary graph — `errors.ts` is foundational with no upward imports). Every byte the dev agent writes in `src/errors.ts` and `src/errors.test.ts` is constrained by these five Architectural Requirements plus the cross-cutting requirements below.

#### AR21 — Error class hierarchy (verbatim from epics.md line 198)

> Discriminated-union `StepperError` with `code: StepperErrorCode`, `exitCode: 0|1|2|3|4|5`, `actionableHint: string` (single-line, ends with concrete next-action verb), optional `detail`. Single file `src/errors.ts` + CI test `src/errors.test.ts` enumerating registry and asserting hint format, code uniqueness, valid exitCode.

The `StepperError` shape is **non-negotiable**. Do NOT rename fields, do NOT add new abstract fields, do NOT change `exitCode` to a wider numeric type, do NOT make `code` an enum (it's a string-literal union per architecture §D11 line 560 — TypeScript-idiomatic, no runtime enum overhead).

#### AR22 — Error registry CI gate (verbatim from epics.md line 199)

> Every concrete `StepperError` subclass exposed via `errorRegistry` export; `errors.test.ts` asserts non-empty hint, hint matches `/^.*(Run|See|Try|Check) /`, code unique, exitCode ∈ {0,1,2,3,4,5}.

The regex `/^.*(Run|See|Try|Check) /` is anchored at the start of the line and requires the verb-then-space pattern to appear. The `^.*` allows preamble text before the verb (so a hint like `If unsure, run /bmad-next --doctor` would NOT match — the dev agent must keep the verb early in the sentence). All 15 hints in Task 2 above start with the verb immediately, satisfying the regex without ambiguity.

**The CI gate is a release blocker.** AR36 declares `bun run check` to be the release-blocker gate, and `bun run check` includes `bun test` which discovers `src/errors.test.ts`. There is no separate test invocation needed.

#### AR33 — Function & error semantics (verbatim, partial)

> Throw `StepperError` subclasses (no `Result<T,E>` in general code path). Sole exception: CLI parser uses `Result<Args, ParseError>`.

This story does NOT yet have callers; later stories will throw the 15 subclasses. The dev agent's task is to make the throw-site ergonomic: every constructor takes `(message: string, detail?: string)` so callers can write `throw new LockContentionError("PID 12345 holds the lock", \`pidPath: ${pidPath}\`);`.

#### AR41 — Module boundary graph (verbatim, partial)

> Foundational (no upward imports): `errors.ts`, `schemas/`, `io/`. Mid-level: `migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. Higher-level: `verifiers/`, `dispatch/`, `failure-ux/`. Top-level: `commands/`. Enforced by Biome import-restriction rule or hand-rolled CI test.

`src/errors.ts` MUST NOT import from any other `src/` module. The only allowed imports are from the JS standard library (`Error` is the global type so no import needed; `Error` is not in any `node:` namespace). No `import type` from `./io/log.ts` for stack-trace formatting — that's a Story 1.3 concern.

`src/errors.test.ts` MAY import from `bun:test` and from `./errors.ts` (sibling). Nothing else.

#### AR36 — Code quality CI gates (verbatim, partial)

> Biome 2.3 only (no ESLint/Prettier); `biome.json` enforces strict (incl. `noConsoleLog`, `noImplicitAnyLet`). CI gate `bun run check = biome ci . && bun test` is a release blocker.

The Biome rule names in 2.3.15 are slightly different from 2.3.0 (per Story 1.1 Completion Notes): `noConsoleLog` was renamed to `noConsole`, and `noImplicitAnyLet` moved from `style` to `suspicious`. The dev agent does NOT need to touch `biome.json` for this story — Story 1.1's canonical config already enforces these rules.

#### Exit-Code Mapping (PRD-mandated, architecture §D11 lines 591–600)

The 15 error codes' exit codes follow this exact mapping from architecture.md:

| Exit Code | Meaning | Codes |
|-----------|---------|-------|
| 0 | Success | (no error class — exit 0 is the no-error state) |
| 1 | Halt-with-actionable-error | `BRANCH_SWITCH`, `CORRUPT_STATE`, `STATE_TOO_NEW`, `STATE_CHANGED_DURING_DISPATCH`, `VERIFIER_FAILURE`, `TIMEOUT` |
| 2 | Configuration error | `CONFIG_ERROR`, `MIGRATION_FAILURE` |
| 3 | BMAD compatibility error | `BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE` |
| 4 | Lock contention | `LOCK_CONTENTION` |
| 5 | Pathological input | `PATHOLOGICAL_INPUT`, `BUDGET_EXCEEDED` |

**Verification reminder:** Task 4.5(d) asserts `exitCode ∈ {0,1,2,3,4,5}`. The literal `0` is in the union but no error class will use it (an error implies a non-zero exit). The type union must still include 0 because architecture §D11 line 578 declares `exitCode: 0 | 1 | 2 | 3 | 4 | 5`. The test passes regardless because every concrete subclass picks a value from the set.

### Source Tree — Exact Files to Create or Modify

This story creates exactly **two new files** under `src/` (and creates the `src/` directory itself, which Story 1.1 explicitly excluded from its scaffold).

**Files created:**

```
bmad-stepper/
└── src/
    ├── errors.ts                # Abstract StepperError + 15 concrete subclasses + errorRegistry
    └── errors.test.ts           # CI gate: enumerates registry; asserts hint format, code unique, exitCode valid
```

**Files NOT modified (preserved verbatim from Story 1.1):**

- `package.json` — no edits (Bun auto-discovers `src/errors.test.ts`; Task 5 verifies, Task 5.5 last-resort path covers the unlikely case where it does not).
- `tsconfig.json`, `biome.json`, `bunfig.toml` — no edits.
- `.github/workflows/ci.yml` — no edits (the workflow already runs `bun run check`).
- `.claude-plugin/plugin.json`, `commands/bmad-next.md` — no edits.
- `.gitignore`, `LICENSE` — no edits.

**Files NOT created in this story** (deferred to later Epic 1 stories per the architecture's source tree, lines 1230–1255):

- Anything else under `src/` — `src/io/`, `src/schemas/`, `src/state/`, `src/dag/`, etc. own their own stories (1.3 onwards).
- `docs/exit-codes.md` — the public-facing exit-code reference is a Story 1.13 deliverable (Quick-Start Documentation owns docs/).
- Integration tests (`tests/integration/no-write-outside-scope.test.ts`, `tests/integration/no-network-on-main.test.ts`) — Story 1.3 (no-write-outside-scope) and Story 1.7 / Epic 6 (no-network-on-main).

### Testing Requirements

- **`bun test` MUST pass with at least 1 test file (`src/errors.test.ts`)** discovered and at least 5 `it(...)` blocks executed.
- **`bun test src/errors.test.ts`** MUST exit 0 when run as a single-file invocation.
- **The registry test MUST run in under 1 second** — pure in-memory enumeration, no IO.
- **`bunx biome ci .`** MUST exit 0 against the new files.
- **`bun run check`** MUST exit 0 (composite release-blocker).
- **CI matrix** (`ubuntu-latest`, `macos-latest` per Story 1.1 `ci.yml`) MUST be green on first push (no platform-specific paths in the test — pure JS/TS, no `process.platform` branches).

#### Test design — minimum assertion plan

The dev agent SHOULD organise `src/errors.test.ts` along these lines (this is a recommendation, not a hard contract — the assertions in AC-1 a/b/c/d are the hard contract):

```typescript
import { describe, expect, it } from "bun:test";
import { type StepperErrorCode, StepperError, errorRegistry } from "./errors.ts";

const REQUIRED_CODES: StepperErrorCode[] = [
  "LOCK_CONTENTION", "BRANCH_SWITCH", "BMAD_INCOMPATIBLE", "BMAD_NOT_INSTALLED",
  "UNKNOWN_BMAD_SKILL", "DAG_CYCLE", "CORRUPT_STATE", "STATE_TOO_NEW",
  "STATE_CHANGED_DURING_DISPATCH", "VERIFIER_FAILURE", "PATHOLOGICAL_INPUT",
  "BUDGET_EXCEEDED", "TIMEOUT", "CONFIG_ERROR", "MIGRATION_FAILURE",
];

const HINT_REGEX = /^.*(Run|See|Try|Check) /;

describe("errorRegistry", () => {
  const instances = Object.values(errorRegistry).map((Ctor) => new Ctor("test message"));

  it("contains exactly 15 entries", () => {
    expect(Object.values(errorRegistry)).toHaveLength(15);
  });

  it("registers all required codes", () => {
    const codes = instances.map((e) => e.code).sort();
    expect(codes).toEqual([...REQUIRED_CODES].sort());
  });

  it("every actionableHint is non-empty", () => {
    for (const instance of instances) {
      expect(instance.actionableHint.trim().length).toBeGreaterThan(0);
    }
  });

  it("every hint starts with Run/See/Try/Check (AR22 regex)", () => {
    for (const instance of instances) {
      expect(instance.actionableHint).toMatch(HINT_REGEX);
    }
  });

  it("every code is unique across the registry", () => {
    const codes = instances.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every exitCode is in {0, 1, 2, 3, 4, 5}", () => {
    const allowed: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5];
    for (const instance of instances) {
      expect(allowed).toContain(instance.exitCode);
    }
  });

  it("every instance is a StepperError", () => {
    for (const instance of instances) {
      expect(instance).toBeInstanceOf(StepperError);
      expect(instance).toBeInstanceOf(Error);
    }
  });
});
```

The dev agent MAY add additional `it(...)` blocks for sanity checks (e.g., `toJSON()` shape, `name` property correctness) but the seven `it(...)` blocks above are the minimum to satisfy AC-1 a/b/c/d plus the AC-2 fixed-list assertion.

#### Bun-test specifics (from Story 1.1 dev agent learnings)

- The Bun test runner is invoked via `bun test` (Story 1.1 added `--pass-with-no-tests` to all test scripts to handle the empty-repo case in Bun 1.3.12 — once `src/errors.test.ts` exists, the flag becomes a no-op).
- Default test glob: `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx` (and a few sibling patterns). `src/errors.test.ts` matches automatically.
- Imports use the `bun:test` namespace (`import { describe, expect, it } from "bun:test";`) — DO NOT install `@types/jest`, `vitest`, or any other test framework.
- `tsconfig.json` (Story 1.1) has `allowImportingTsExtensions: true` and `verbatimModuleSyntax: true`, so the test imports use `from "./errors.ts"` (with the `.ts` extension) — NOT `from "./errors"` (no extension).
- `tsconfig.json` has `noEmit: true` and Bun runs `.ts` source directly — there is no transpile step.

### File Structure Requirements — Final Check

Before declaring this story done, the dev agent MUST verify ALL of these checks pass:

1. **`src/errors.ts` exists** and is a valid TypeScript file (Biome 2.3.15 passes).
2. **`src/errors.test.ts` exists** colocated next to `src/errors.ts`.
3. **`src/errors.ts` exports** all 15 concrete error classes by name (e.g., `LockContentionError`, `BranchSwitchError`, ..., `MigrationFailureError`).
4. **`src/errors.ts` exports** the abstract `StepperError` base class.
5. **`src/errors.ts` exports** the `StepperErrorCode` string-literal union type.
6. **`src/errors.ts` exports** the `errorRegistry` constant containing exactly 15 entries.
7. **`src/errors.test.ts` runs at least 5 `it(...)` blocks** covering AC-1 a/b/c/d + the AC-2 fixed-code-list assertion.
8. **`bun test` exits 0** with `src/errors.test.ts` reported as run.
9. **`bun test src/errors.test.ts` exits 0** as a standalone invocation.
10. **`bunx biome ci .` exits 0** against the new files.
11. **`bun run check` exits 0** (the release-blocker gate).
12. **No imports** from any non-foundational `src/` module in `src/errors.ts` (AR41 module-boundary graph).
13. **No external runtime dependencies** in `src/errors.ts` — only `Error` (global) is used.
14. **`package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`** are byte-identical to their Story 1.1 state (or modified only via Task 5.5 last-resort, with documentation in Completion Notes).

### Code Quality Enforcement (AR36)

- **Biome 2.3.15 only.** No ESLint, no Prettier (Story 1.1 already wired this).
- **`noConsole: "error"`** — the rule was renamed from `noConsoleLog` in 2.3.15 (Story 1.1 Completion Notes). The dev agent MUST NOT use `console.log` / `console.error` / `console.info` anywhere — neither in `src/errors.ts` nor `src/errors.test.ts`. All test failure messages flow through `expect(...)` matchers.
- **`noUnusedVariables: "error"`** — every imported symbol in the test must be used. Don't import `describe` if you don't use `describe(...)`.
- **`noImplicitAnyLet: "error"`** (under `suspicious` in 2.3.15) — every `let` declaration must have an explicit type. The test file's `instances`, `codes`, `allowed` use `const` (recommended) so this is a non-issue, but be aware.
- **`useExhaustiveDependencies: "error"`** — irrelevant for non-React code, no `useEffect` here, no impact.

### Naming Conventions (AR31, applied to Source TS)

This is the FIRST story to write `src/` TypeScript, so Story 1.1's naming conventions become enforceable here:

- **Filenames:** `kebab-case.ts` — `errors.ts` (already kebab-case, single word). `errors.test.ts` for the colocated test (P7).
- **Class names:** `PascalCase` ending in `Error` — `LockContentionError`, `BranchSwitchError`, etc. NO `I`-prefixed interfaces (the architecture and Story 1.1 dev guardrails forbid them).
- **Type names:** `PascalCase` — `StepperErrorCode`, `ErrorRegistry`. (Note: `StepperError` is BOTH a class and a type; the class name doubles as the instance type.)
- **Constants:** `SCREAMING_SNAKE_CASE` — `REQUIRED_CODES`, `HINT_REGEX` (in the test file).
- **Error code string literals:** `SCREAMING_SNAKE_CASE` — `"LOCK_CONTENTION"`, `"STATE_CHANGED_DURING_DISPATCH"`, etc. (matches AR31's "SCREAMING_SNAKE_CASE for constants and error codes").
- **Functions/methods/variables:** `camelCase` — `actionableHint`, `exitCode`, `errorRegistry`.

### Module Boundary Graph (AR41) — First Enforcement Point

Story 1.1 noted (line 332): "the module boundary graph is enforced from Story 1.2 onwards once `src/errors.ts` exists. For Story 1.1 there is no source code, so no boundary to enforce yet." This story is that enforcement point.

`src/errors.ts` is a **foundational module**. The architecture document explicitly lists it (alongside `src/schemas/` and `src/io/`) as having "no upward imports". The dev agent MUST NOT add any import statements to `src/errors.ts` other than the absolute minimum (currently zero imports — `Error` is a JS global).

`src/errors.test.ts` is allowed to import from `bun:test` and from `./errors.ts` (sibling). Nothing else.

This boundary will eventually be enforced by a Biome import-restriction rule or a hand-rolled CI test (architecture §AR41 line 236) — likely a Story 1.13 / Epic 6 deliverable. For now, the boundary is enforced manually by the code reviewer.

### Persistence Boundary (AR42)

`_bmad-output/.stepper/` does not exist yet (it's created by Story 1.6 / state subsystem). The dev agent MUST NOT create it during this story. The errors module is in-memory only — no IO, no file writes, no logging.

### Documentation Within This Story

This story does NOT ship `docs/exit-codes.md` or any other narrative documentation. Story 1.13 (Quick-Start Documentation) owns the public-facing exit-code reference. The error-class hints in this story are the **single source of truth** for actionable next-action commands; `docs/exit-codes.md` (later) will be a tabular projection of the same hints, generated or hand-curated from `src/errors.ts`.

### Previous Story Intelligence (from Story 1.1 — `done` status)

Story 1.1 landed the repository scaffold and is `done` per `sprint-status.yaml`. Key learnings the dev agent should fold into this story's execution:

#### Project Structure (from 1.1 File List section)

- `package.json` is at the project root. `scripts.test`, `scripts.test:watch`, and `scripts.check` all use the `--pass-with-no-tests` flag. Once `src/errors.test.ts` exists the flag becomes a no-op (it only changes behaviour when zero test files exist) — leave the flag in place for forward compatibility (e.g., a future `git rebase` that temporarily removes all tests).
- `tsconfig.json` has `strict: true`, `target: "ESNext"`, `module: "Preserve"`, `moduleResolution: "bundler"`, `verbatimModuleSyntax: true`, `noEmit: true`, `allowImportingTsExtensions: true`, plus extras (`noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `moduleDetection: "force"`, `skipLibCheck: true`, `lib: ["ESNext"]`, `types: ["bun"]`, `allowJs: true`).
  - `noUncheckedIndexedAccess` means array access returns `T | undefined`. The dev agent should be aware that `instances[0]` returns `instance | undefined`, NOT `instance`. Use `for (const instance of instances)` (which iterates only defined elements) instead of indexed access for safety.
- `biome.json` is the canonical config from architecture §P8 adapted to Biome 2.3.15: `noConsole: "error"` (renamed from `noConsoleLog`), `noImplicitAnyLet: "error"` (moved from `style` to `suspicious`), `useExhaustiveDependencies: "error"`, `noUnusedVariables: "error"`. Schema URL pinned to `https://biomejs.dev/schemas/2.3.15/schema.json`.
- `bunfig.toml` is a comment-only placeholder (Bun 1.3+ no longer auto-creates one). No runtime knobs are tuned. Bun's default test discovery applies.
- The lockfile is `bun.lock` (text format) — Bun 1.2+ defaults to text. Story 1.1 documented this deviation from the architecture's "bun.lockb" reference.
- The CI workflow `.github/workflows/ci.yml` runs `bun install --frozen-lockfile && bun run check` on `[ubuntu-latest, macos-latest]` matrix using `oven-sh/setup-bun@v2`.

#### Bun + Test Runner Conventions (from 1.1 Completion Notes)

- **`--pass-with-no-tests`:** Story 1.1 added this flag to `scripts.test`, `scripts.test:watch`, `scripts.check` because plain `bun test` exits 1 on a zero-test repo in Bun 1.3.12. Once Story 1.2 lands `src/errors.test.ts`, the flag is a no-op. **DO NOT remove the flag** — it remains a defensive guard.
- **Bun version on host:** 1.3.12 (architecture's "1.3.13 verified Apr 2026" is forward-looking; 1.3.12 satisfies AR2's `Bun ≥ 1.3` pin).
- **`bun init -y` side-effect cleanup:** Story 1.1 deleted `index.ts`, `README.md`, `CLAUDE.md`, and `.cursor/` after `bun init -y` produced them. **DO NOT re-create any of these in Story 1.2.** No new top-level files at all.

#### Biome Rule Names in 2.3.15 (CRITICAL — from 1.1 Completion Notes)

- `suspicious.noConsoleLog` was **renamed** to `suspicious.noConsole` in Biome 2.3.15 (between 2.3.0 and 2.3.15 patch releases). The architecture §P8 canonical config uses the old name; Story 1.1's `biome.json` uses the new name. **Use `console`-free code** in `src/errors.ts` and `src/errors.test.ts` — the rule blocks ALL `console.*` calls (not just `console.log`).
- `style.noImplicitAnyLet` was **moved** to `suspicious.noImplicitAnyLet` in Biome 2.3.15. Story 1.1's `biome.json` reflects this. **Always declare explicit types on `let`** (or use `const`).

#### Naming + File Layout (from 1.1 dev guardrails)

- Filenames: `kebab-case.ts`. Test file: `<source>.test.ts` colocated.
- TS classes: `PascalCase` ending in `Error` for error classes.
- TS variables/functions: `camelCase`.
- Constants and string-literal codes: `SCREAMING_SNAKE_CASE`.
- No `I`-prefixed interfaces.
- ESM exclusively (`package.json` has `"type": "module"`). No CommonJS.

#### Forbidden Actions (from 1.1 dev guardrails — still apply)

- **Do NOT add `tsc`-based build steps.** Bun runs `.ts` source directly; `tsconfig.json` has `noEmit: true`.
- **Do NOT add `dist/`, `build/`, or any output directory.** Source = release.
- **Do NOT add `commander`, `oclif`, `yargs`, `jest`, `vitest`, `mocha`.** None of these are runtime or dev deps.
- **Do NOT add `package-lock.json` or `yarn.lock`.** Only `bun.lock` (text) is the lockfile.
- **Do NOT add ESLint or Prettier.** Biome 2.3.15 is the only linter/formatter (AR36).
- **Do NOT touch `_bmad/` or `_bmad-output/planning-artifacts/`.** Those are managed by other tooling.
- **Do NOT publish, tag, or push a release.** Version stays at `0.0.0` until Epic 6.
- **Do NOT skip the `-E` flag on Biome.** Story 1.1 already exact-pinned to `2.3.15`; this story does not modify dependencies.
- **Do NOT add native Windows support.** Linux + macOS only in v0.1.

#### Story 1.1 Senior Developer Review — Action Items Inherited

Story 1.1's review (`approve-with-actions`) recorded four non-blocking follow-ups:

- **A1:** Replace `@types/bun: "latest"` with the resolved exact version. (Not actioned in this story — `@types/bun` is unrelated to errors module.)
- **A2:** Remove or justify the `peerDependencies.typescript: "^5"` auto-added by `bun init -y`. (Not actioned — same reason.)
- **A3:** Add `bun-version: "1.3"` to the `setup-bun@v2` step in CI. (Defer to Epic 6 release polish.)
- **A4:** Confirm CI green on both `ubuntu-latest` and `macos-latest` after first push. (This story's CI run will be the first observed run; verify post-merge.)

Story 1.2 should focus exclusively on the AC-1 / AC-2 / AC-3 deliverables and NOT chase A1–A4 — those are Epic 6 polish items.

### Latest Tech Information (v0.1.0 release window)

Versions are pinned per AR2 — no further web research is required for this story. Story 1.1 already validated:

- Bun 1.3.12 on the executing host (satisfies `≥ 1.3`).
- Biome 2.3.15 exact-pinned (`-E` flag in Story 1.1 Task 3).
- Zod 4.4.1 (not used in this story — `errors.ts` is foundational and has zero runtime deps).
- TypeScript bundled with Bun (no explicit pin; `peerDependencies.typescript: "^5"` is the cosmetic auto-added entry from `bun init -y`).

The dev agent MUST NOT install or upgrade any package during this story. If `bun install` is run for any reason, the lockfile MUST remain byte-identical (no new entries, no version bumps).

### Project Structure Notes — Anticipated Variances

- **`src/` directory creation:** `src/` does not exist after Story 1.1. The dev agent creates it via `mkdir -p src` (or implicitly when `bun.write("src/errors.ts", ...)` is called). No `index.ts` barrel is created — there is no `src/index.ts` in v0.1 of the project (per architecture §"Complete Project Directory Structure" line 1230, the ONLY root `src/` file is `errors.ts`; `errors.test.ts`; everything else is in subdirectories).
- **`bunfig.toml`'s comment-only state:** Story 1.1 left `bunfig.toml` as a comment-only file. Bun's default test discovery globs `**/*.test.ts` automatically. **DO NOT add a `[test]` block** to `bunfig.toml` in this story unless Task 5.2 verification fails (it will not — Bun discovers `src/errors.test.ts` by default).
- **`tsconfig.json`'s `noUncheckedIndexedAccess`:** This flag means `array[0]` is `T | undefined`. In `src/errors.test.ts`, prefer `for (const instance of instances)` over `instances[0]` — the for-of loop iterates only defined elements without the union.
- **`tsconfig.json`'s `verbatimModuleSyntax`:** Type-only imports MUST use `import type` (e.g., `import type { StepperErrorCode } from "./errors.ts";`). Mixed-imports (value + type) are allowed but the type portion can be marked with `type`.
- **`tsconfig.json`'s `allowImportingTsExtensions`:** All sibling imports use the `.ts` extension (`from "./errors.ts"`). Do NOT use extensionless imports (`from "./errors"` will fail to resolve at runtime under `module: "Preserve"`).

### Dev Agent Guardrails — Do Not Do These Things

In addition to the Story 1.1 guardrails (still in force):

- **Do NOT add Zod imports to `src/errors.ts`.** The errors module is foundational and runtime-dep-free. Zod is used by `src/schemas/` (Story 1.5) for state-shape validation, not by errors.
- **Do NOT add `console.log` / `console.error` anywhere.** Biome's `noConsole` rule blocks it. The errors module has NO logging — that's `src/io/log.ts`'s job (Story 1.3).
- **Do NOT add a test for `toJSON()` shape verification UNLESS** the dev agent feels the test design above is incomplete. The five AC-1 a/b/c/d + AC-2 fixed-list assertions are the hard contract.
- **Do NOT change `package.json` `scripts`** unless Task 5.5 last-resort path is taken (and it should not be — Bun's default test discovery picks up `src/errors.test.ts` automatically).
- **Do NOT change `biome.json`.** Story 1.1's canonical config already enforces all required rules.
- **Do NOT change `tsconfig.json`.** Story 1.1's flags are sufficient for this story.
- **Do NOT create `src/errors/` (a directory).** The architecture explicitly says "Single file: `src/errors.ts`" (line 737). One file, not a directory.
- **Do NOT create `src/index.ts`.** There is no top-level src barrel in v0.1 — every module is imported by full path.
- **Do NOT commit a Changeset entry.** Version stays at `0.0.0` (Story 1.1's guardrail still applies — Epic 6 ships v0.1.0).
- **Do NOT modify any file outside `src/errors.ts` and `src/errors.test.ts`** (with the exception of this story file's status update at completion, and the sprint-status.yaml status update; both are bmad-create-story / bmad-dev-story workflow side-effects).
- **Do NOT introduce a runtime dep on `node:util`, `node:assert`, etc.** Use plain JS (`Error.prototype`, `Object.values`, `Set`, `Array.prototype.includes`, etc.).
- **Do NOT skip stack-trace capture.** Each subclass should call `super(message)` so `Error.captureStackTrace` is invoked (V8 + Bun default). Stack traces are captured automatically — the dev agent does NOT need to call `Error.captureStackTrace(this, this.constructor)` explicitly (Bun handles it), but doing so is harmless.

### Git Intelligence

The recent git history (post-Story 1.1):

- `9760e7d docs: add sprint status tracking`
- `58f0e12 docs: add implementation readiness report`
- `8360f72 chore: ignore stepper and claude local state`
- `3a814ae docs: add epics and stories breakdown`
- `03a6c22 docs: add architecture decision document`

(plus the Story 1.1 scaffold commit, which may not be reflected in this snapshot — the active branch is `04-30-docs_add_sprint_status_tracking` per the run.yaml).

This story's commit (when authored by the dev-story workflow) will be the **first source-code commit** of the project — `src/errors.ts` and `src/errors.test.ts`. Use a single commit (`feat: add errors module + registry CI gate`) to keep the diff reviewable.

### References

Cite all technical details with source paths and sections:

- **Story Foundation:**
  - [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2: Errors Module + Registry CI Gate] — User story + AC verbatim (lines 361–373).
  - [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Foundation & First-Run Diagnostic] — Epic context.
  - [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements] — AR21, AR22, AR33, AR36, AR41 declarations (lines 198–199, 219, 222, 236).
- **Architecture Compliance:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#D11 — Error class shape] — `StepperError` class structure + exit-code mapping (lines 555–600).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Errors registry test] — Registry CI gate spec (lines 999–1005).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Coherence Validation Correction] — `STATE_CHANGED_DURING_DISPATCH` and `BMAD_NOT_INSTALLED` additions (lines 1666–1675).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — `src/errors.ts` + `src/errors.test.ts` placement (lines 1230–1231).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Module Boundary Graph (AR41)] — Foundational module declaration (lines 1273–1278).
- **Cross-Cutting:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#Naming Conventions (P1, P3, P4)] — Class names + filename rules (line 723).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Errors are thrown, not returned] — Throw-everywhere semantics (line 857).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — Throw `StepperError` subclasses, never raw `Error` (P4, line 1015).
- **Previous Story:**
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md#Senior Developer Review (AI)] — Review outcome `approve-with-actions`; non-blocking action items A1–A4.
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md#Completion Notes List] — Bun 1.3.12 host; Biome 2.3.15 rule renames; `--pass-with-no-tests` flag; `bunfig.toml` hand-rolled placeholder; lockfile is `bun.lock` (text).
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md#File List] — Final scaffold state to preserve.
- **Project Config Pin:**
  - [Source: _bmad/config.yaml] — `project_name: bmad-stepper`, `planning_artifacts`, `implementation_artifacts`, `test_framework: bun-test`. **Pinned to `_bmad/config.yaml` (NOT `_bmad/bmm/config.yaml`).**

### Definition of Done

- [x] All 7 tasks above completed and self-checked.
- [x] All 14 file-structure final-check items pass.
- [x] `src/errors.ts` and `src/errors.test.ts` exist and pass Biome ci + bun test.
- [x] `bun run check` exits 0 locally.
- [ ] CI green on `ubuntu-latest` and `macos-latest`. _(deferred — verified post-merge per Story 1.1 A4 follow-up)_
- [x] All 15 error codes registered with the exact strings from AC-2 (no aliases, no extras).
- [x] All 15 hints satisfy the regex `/^.*(Run|See|Try|Check) /`.
- [x] All 15 codes are unique.
- [x] All 15 exit codes ∈ {0, 1, 2, 3, 4, 5}.
- [x] No imports outside foundational scope in `src/errors.ts` (AR41).
- [x] Status flipped to `review` upon dev-story completion (handled by dev-story workflow).
- [ ] Commit pushed to a branch (no force-push to `main`). _(deferred — bmad-loop / orchestrator owns commit + push)_

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] — invoked as a `bmad-dev-story` sub-agent within
`/bmad-loop --until epic:1` iteration 5 (run id `2026-04-30T091117Z-bmad-next`).

### Debug Log References

Task record: `.bmad-stepper/runs/2026-04-30T091117Z-bmad-next/tasks/t1-dev-story.yaml`.

**Verification command outputs (captured during dev-story execution):**

1. `bun test`
   ```
   bun test v1.3.12 (700fc117)
    10 pass
    0 fail
    185 expect() calls
   Ran 10 tests across 1 file. [60.00ms]
   ```

2. `bun test src/errors.test.ts` (single-file invocation, AC-3 sanity)
   ```
   bun test v1.3.12 (700fc117)
    10 pass
    0 fail
    185 expect() calls
   Ran 10 tests across 1 file. [5.00ms]
   ```

3. `bunx biome ci .`
   ```
   Checked 7 files in 4ms. No fixes applied.
   ```
   (Initial run flagged a fixable `assist/source/organizeImports` lint on
   `src/errors.test.ts` because the original import list had `StepperError`
   before `errorRegistry`. Reordered alphabetically — `errorRegistry`,
   `StepperError`, then the `type StepperErrorCode` — and Biome passed
   cleanly on the second invocation.)

4. `bun run check` (release-blocker composite gate, AC-3)
   ```
   $ biome ci . && bun test --pass-with-no-tests
   Checked 7 files in 3ms. No fixes applied.
   bun test v1.3.12 (700fc117)
    10 pass
    0 fail
    185 expect() calls
   Ran 10 tests across 1 file. [8.00ms]
   ```

5. `bunx tsc --noEmit` (TypeScript type check, defensive)
   ```
   exit: 0
   ```

**JUnit XML test names** (from `bun test --reporter=junit`):
- `errorRegistry > contains exactly 15 entries` (1 expect)
- `errorRegistry > registers all required codes (AC-2 fixed list)` (1 expect)
- `errorRegistry > every actionableHint is non-empty (AC-1 a)` (15 expects)
- `errorRegistry > every hint starts with Run/See/Try/Check (AC-1 b — AR22 regex)` (15 expects)
- `errorRegistry > every code is unique across the registry (AC-1 c)` (1 expect)
- `errorRegistry > every exitCode is in {0, 1, 2, 3, 4, 5} (AC-1 d)` (15 expects)
- `errorRegistry > every instance is a StepperError and Error` (30 expects)
- `errorRegistry > every instance carries its subclass name on Error.name` (30 expects)
- `errorRegistry > toJSON() returns the structured shape with all fields` (75 expects)
- `errorRegistry > constructor accepts an optional detail string` (2 expects)

Total: 10 tests, 185 expects, < 60ms wall time.

### Completion Notes List

- **`src/errors.ts` is foundational (AR41):** zero imports of any kind
  (verified via `grep "^import"` — no matches). Only `Error` (JS global)
  is referenced, satisfying the "no upward imports, no Node.js, no npm
  packages" requirement.
- **`src/errors.test.ts` imports only `bun:test` and `./errors.ts`**
  (sibling), per AR41. Biome's import-organize rule expects sorted order;
  the test file imports `errorRegistry`, `StepperError`, then `type
  StepperErrorCode` in alphabetical order, with `bun:test` first.
- **`new.target.name` for subclass naming:** the abstract base class sets
  `this.name = new.target.name` in its constructor instead of duplicating
  `this.name = "<SubclassName>"` in every subclass. This satisfies Task 1.4
  (`Error.name` per subclass) without requiring 15 boilerplate constructors.
- **`override` modifier:** every concrete subclass uses `override readonly
  code = "..." as const;` to satisfy `tsconfig.noImplicitOverride: true`.
  The `as const` narrows the literal type to match the abstract field's
  string-literal union.
- **`StepperExitCode` exported:** the `0 | 1 | 2 | 3 | 4 | 5` numeric union
  was promoted to a named exported type alias for readability; the
  abstract base class declares `abstract readonly exitCode: StepperExitCode`
  which is structurally identical to the inline union spec from AR21.
- **No `package.json` change needed:** Bun 1.3.12's default test discovery
  globs `**/*.test.ts` and picked up `src/errors.test.ts` automatically.
  The `--pass-with-no-tests` flag is now a defensive no-op (per Story 1.1
  guardrail — flag is preserved for forward compatibility).
- **No `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/`,
  `.claude-plugin/`, or `commands/` edits.** Story 1.1's scaffold is
  byte-identical to its post-Story-1.1 state.
- **No new top-level files.** Only `src/errors.ts` and `src/errors.test.ts`
  (plus this story file's status update + sprint-status flip + dev-story
  task record under `.bmad-stepper/runs/`) were created or modified.
- **Biome import-sort gotcha:** the first attempt at the test file
  imported `StepperError` before `errorRegistry`. Biome 2.3.15's
  `assist/source/organizeImports` rule (enabled by default) failed with
  exit 1. Reordered to `errorRegistry, StepperError, type
  StepperErrorCode` (alphabetical, with type-only import last per Biome
  convention) and the lint passed.
- **`bunx tsc --noEmit` is green** (defensive; not a release-blocker
  command but useful since `tsconfig.json` enforces strict type checks).
  No `tsc` install needed — `bunx` resolves it from `peerDependencies`.

### File List

**Created (2 new files):**
- `src/errors.ts` — Abstract `StepperError` class + 15 concrete subclasses + `errorRegistry` constant.
- `src/errors.test.ts` — Bun-test registry CI gate; 10 `it(...)` blocks covering AC-1 a/b/c/d, AC-2 fixed list, plus 4 sanity checks (instanceof, name property, toJSON shape, optional detail).

**Modified (story-administrative only):**
- `_bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md` — Status flipped to `review`; tasks ticked; Dev Agent Record + Change Log filled in.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-2-errors-module-registry-ci-gate` flipped from `ready-for-dev` to `review`.
- `.bmad-stepper/runs/2026-04-30T091117Z-bmad-next/tasks/t1-dev-story.yaml` — New task record for this dev-story sub-agent invocation.

**Unchanged (preserved verbatim from Story 1.1):**
- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`.
- `.gitignore`, `LICENSE`.
- All `_bmad/`, `_bmad-output/planning-artifacts/`, `docs/`, `.changeset/` files.

## Change Log

| Date       | Version | Description                                                                                       | Author          |
|------------|---------|---------------------------------------------------------------------------------------------------|-----------------|
| 2026-04-30 | 0.1.0   | Initial story authored (status `ready-for-dev`).                                                  | bmad-create-story |
| 2026-04-30 | 0.2.0   | Implementation complete: `src/errors.ts` + `src/errors.test.ts` landed; status → `review`.        | bmad-dev-story (claude-opus-4-7[1m]) |
| 2026-04-30 | 0.3.0   | Senior Developer Review: outcome `approve`; status → `done`.                                      | bmad-code-review (claude-opus-4-7[1m]) |

## Senior Developer Review (AI)

### Reviewer

claude-opus-4-7[1m] — invoked as a `bmad-code-review` sub-agent within
`/bmad-loop --until epic:1` iteration 6 (run id `2026-04-30T091959Z-bmad-next`).

### Date

2026-04-30

### Outcome

**approve** — no must-fix findings, no should-fix findings, no nits. The
implementation is a faithful, byte-tight realisation of AR21, AR22, AR33,
AR36, and AR41 as specified by the architecture and Story 1.2's AC-1, AC-2,
AC-3.

### Summary

Story 1.2 lands the **first source-code module** of the project — `src/errors.ts`
— with its colocated registry CI gate `src/errors.test.ts`. Both files are
foundational primitives in the AR41 module-boundary graph (zero upward
imports), and together they install the **first release-blocker test gate**
of the project (AR22 + AR36).

The `StepperError` abstract base + 15 concrete subclasses + `errorRegistry`
constant precisely match the architecture's §D11 specification. The test
file's 10 `it(...)` blocks (185 expects total, sub-60ms wall time) cover
AC-1 (a/b/c/d) verbatim, plus the AC-2 fixed-code-list assertion, plus four
useful sanity checks (instanceof, name property, toJSON shape, optional
detail). All assertions are precise and would actually catch the failure
modes they claim to catch.

`bun run check` exits 0 (composite release-blocker gate). Biome 2.3.15
passes with zero warnings. `bunx tsc --noEmit` is green. No `console.*`
calls, no `any` types, zero runtime imports in `src/errors.ts`.

### Key Findings

**Must-fix:** None.

**Should-fix:** None.

**Nits:** None.

**Info-level observations** (no action required, recorded for traceability):

1. **Hint regex semantics — by design, not a bug.** The AR22 regex
   `/^.*(Run|See|Try|Check) /` is greedy at `^.*`, so it matches a verb
   appearing anywhere on the line (not just at the start). The architecture's
   prose at §D11 line 579 says hints "end with a concrete next-action verb"
   while AC-1(b) and AR22 codify the more permissive regex. The 15 hints
   shipped here all have the verb at position 0 (or near-0 — e.g.,
   "Run /bmad-next ...", "See _bmad-output/...", "Check the input ..."), so
   the intent matches the prose. No change required; the regex is verbatim
   from the spec.

2. **Registry runtime immutability is `as const`-only, not `Object.freeze`d.**
   A consumer could in theory mutate `errorRegistry.LockContentionError = X`
   at runtime. The architecture spec uses `as const` (compile-time
   immutability) and TypeScript's `readonly` semantics suffice for the
   single-process, single-import use case. The CI test would still pass
   because it enumerates `Object.values(errorRegistry)` after the (potential)
   mutation. Adding `Object.freeze(errorRegistry)` would be defensive but
   is not specified and would risk minor runtime cost on every import. Not
   actioned.

3. **"Subclass not registered" detection is indirect.** If a future
   contributor adds a 16th `StepperErrorCode` literal + a subclass but
   forgets to add the class to `errorRegistry`, the registry's `15` count
   assertion would still pass; only the AC-2 `REQUIRED_CODES` cross-check
   would fail (because the dev would need to also update `REQUIRED_CODES`
   to 16 entries to pass that test, at which point the missing registry
   entry would be visible). The errors.ts JSDoc explicitly enumerates the
   four-step add-a-code procedure, so this is acceptable as-is. The natural
   point to tighten this is when a 16th code is added (Story 1.5 or later).

4. **Architecture variance acknowledged.** Architecture §D11 line 560–574
   shows a partial `StepperErrorCode` example (13 codes) ending with
   `/* ... */`. The full 15-code list comes from epics.md AC-2 (line 372)
   plus the §Coherence Validation Correction (lines 1666–1675) which adds
   `BMAD_NOT_INSTALLED` and `STATE_CHANGED_DURING_DISPATCH`. The
   implementation correctly merges both sources into the canonical 15-code
   list.

5. **`StepperExitCode` named alias.** The implementation hoists the inline
   `0 | 1 | 2 | 3 | 4 | 5` numeric union into an exported named type
   `StepperExitCode` for readability. Architecture §D11 line 578 declares
   the union inline; the named alias is structurally identical and
   improves IDE hover docs. Not a finding — purely additive.

### Acceptance Criteria Coverage

| AC    | Verdict | Evidence |
|-------|---------|----------|
| AC-1  | **pass** | Abstract `StepperError` matches AR21 shape: `code: StepperErrorCode`, `exitCode: 0\|1\|2\|3\|4\|5`, `actionableHint: string`, optional `detail` (src/errors.ts:46–73). All four sub-clauses asserted: (a) `every actionableHint is non-empty (AC-1 a)` at src/errors.test.ts:57; (b) `every hint starts with Run/See/Try/Check (AC-1 b — AR22 regex)` at src/errors.test.ts:63 with regex `/^.*(Run|See|Try|Check) /`; (c) `every code is unique across the registry (AC-1 c)` at src/errors.test.ts:69 via `Set` size comparison; (d) `every exitCode is in {0, 1, 2, 3, 4, 5} (AC-1 d)` at src/errors.test.ts:74 via `ALLOWED_EXIT_CODES.toContain(...)`. All 10 tests pass with 185 expects, sub-60ms. |
| AC-2  | **pass** | All 15 codes registered with exact strings from AC-2 (verified via `bun -e` enumeration, output captured in review notes). Cross-checked via the test's `REQUIRED_CODES` constant (src/errors.test.ts:23–39) against `instances.map((e) => e.code).sort()`. The `errorRegistry` constant has exactly 15 entries (src/errors.ts:194–210). Subclass naming follows `<TitleCaseFromCode>Error` per AR31 (e.g., `LOCK_CONTENTION` → `LockContentionError`). |
| AC-3  | **pass** | `bun run check` exits 0 with `src/errors.test.ts` discovered automatically by Bun's default `**/*.test.ts` glob. The `package.json` `scripts.check` is unchanged (`biome ci . && bun test --pass-with-no-tests`); the `--pass-with-no-tests` flag is now a defensive no-op, as planned. The CI workflow `.github/workflows/ci.yml` runs `bun run check` on the `[ubuntu-latest, macos-latest]` matrix per Story 1.1 — therefore the test is a release blocker per AR36. Verified locally: `bun run check` exits 0 in 18ms (Biome) + 52ms (test) = ~70ms total. Single-file invocation `bun test src/errors.test.ts` also exits 0 in 5ms. |

### Architectural Conformance

| AR    | Verdict | Notes |
|-------|---------|-------|
| AR21  | **pass** | Discriminated-union `StepperError` shape matches verbatim. `code` is a string-literal union (no enum). `exitCode` is `StepperExitCode = 0\|1\|2\|3\|4\|5` (named alias of the inline union — semantically identical). `actionableHint` is single-line `string`. Optional `detail` is `string \| undefined` post-init via constructor parameter. `toJSON()` returns the structured `{ code, exitCode, message, actionableHint, detail }` shape. |
| AR22  | **pass** | The registry CI gate enumerates `Object.values(errorRegistry)`, instantiates each constructor, and asserts the four sub-clauses (a/b/c/d) plus the AC-2 fixed-list. The hint regex `/^.*(Run|See|Try|Check) /` is correctly applied. The test is a release blocker via `bun run check`. |
| AR33  | **pass** | All 15 subclasses extend `StepperError` (via `extends StepperError`); none use `Result<T, E>`. The throw-everywhere semantics are preserved. The constructor signature `(message: string, detail?: string)` is ergonomic for callers (`throw new LockContentionError("PID 12345 holds lock", \`pidPath: ${path}\`)`). |
| AR36  | **pass** | `bun run check` (Biome 2.3.15 + `bun test`) exits 0. The Biome 2.3.15 rule renames (`noConsoleLog` → `noConsole`, `noImplicitAnyLet` moved to `suspicious`) are correctly handled by Story 1.1's `biome.json`; this story does not modify Biome config. Zero `console.*` calls; zero `any` types; explicit `readonly` modifiers where needed; `override` keyword on every concrete subclass field per `noImplicitOverride: true`. |
| AR41  | **pass** | `src/errors.ts` has **zero imports** of any kind (verified via `grep "^import|require(|node:" src/errors.ts` — no matches). Only the JS global `Error` is referenced. `src/errors.test.ts` imports only from `bun:test` (test framework) and `./errors.ts` (sibling) — no other src modules, no Node.js, no npm packages. Module boundary graph is preserved. |

### TypeScript Hygiene

- **Strict mode:** `bunx tsc --noEmit` exits 0. All `tsconfig.json` flags
  satisfied (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `verbatimModuleSyntax`, `allowImportingTsExtensions`).
- **No `any`:** verified via `grep ": any\|as any" src/`. No matches.
- **Exhaustive types:** `StepperErrorCode` is a 15-member string-literal
  union. `ErrorRegistry = typeof errorRegistry` is exported for downstream
  type-safety. `StepperExitCode = 0|1|2|3|4|5` is a named alias.
- **`noUncheckedIndexedAccess` compliance:** test uses `for..of` iteration
  for safety; the one indexed access (`constructors[index]`) is correctly
  guarded by `expect(ctor).toBeDefined(); if (ctor) { ... }`.
- **`verbatimModuleSyntax` compliance:** `type StepperErrorCode` is imported
  with the `type` keyword in the test (src/errors.test.ts:20).
- **`allowImportingTsExtensions` compliance:** sibling import uses
  `from "./errors.ts"` (with extension).
- **`noImplicitOverride` compliance:** every concrete subclass field uses
  the `override` modifier (e.g., `override readonly code = "..." as const`).
- **`as const` narrowing:** every concrete subclass uses `as const` on the
  string-literal `code` field to narrow the type to the specific union
  member, satisfying the abstract base's `abstract readonly code: StepperErrorCode`.

### Test Quality Assessment

- **Enumerative, not hardcoded:** the test enumerates `Object.values(errorRegistry)`
  and instantiates each constructor at test setup (src/errors.test.ts:45–46).
  Adding a new error class requires only updating four locations
  (documented in errors.ts:185–193); the test self-adapts.
- **Precision:** assertions are surgical — set-size for uniqueness, array
  inclusion for exit-code domain, regex for hint format, length-after-trim
  for non-emptiness. No `toBeTruthy()` or `toBeDefined()` lazy assertions.
- **Failure-mode coverage:** the test would catch (i) a missing registry
  entry (count assertion `toHaveLength(15)`), (ii) a duplicate code (set
  size assertion), (iii) an empty hint (trim length assertion), (iv) a
  malformed hint (regex assertion), (v) an out-of-range exit code (toContain
  assertion). All five are independently asserted in dedicated `it(...)`
  blocks for clear failure messages.
- **AC-2 cross-check:** the `REQUIRED_CODES` constant duplicates the AC-2
  list and asserts `codes.sort() === REQUIRED_CODES.sort()`. This catches
  silent additions or deletions.
- **Bun-native test discovery:** `src/errors.test.ts` is auto-discovered
  by Bun's default glob `**/*.test.ts` — no `bunfig.toml` `[test]` block
  needed, no `package.json` test-path edit needed.
- **Sub-second wall time:** 10 tests, 185 expects, 5–60ms wall time. Pure
  in-memory enumeration, no IO.

### Edge-Case Coverage

| Edge case                               | Handled? | How |
|-----------------------------------------|----------|-----|
| Empty `actionableHint`                  | Yes      | `trim().length > 0` per AC-1(a) |
| Hint missing the verb                   | Yes      | `/^.*(Run|See|Try|Check) /` regex per AC-1(b) |
| Duplicate code across subclasses        | Yes      | `new Set(codes).size === codes.length` per AC-1(c) |
| Exit code outside {0,...,5}             | Yes      | `[0,1,2,3,4,5].toContain(exitCode)` per AC-1(d) |
| Registry has fewer/more than 15 entries | Yes      | `toHaveLength(15)` count assertion |
| Subclass not extending `StepperError`   | Yes      | `expect(instance).toBeInstanceOf(StepperError)` |
| `Error.name` collision (anonymous class)| Yes      | `expect(instance.name).toBe(ctor.name)` per subclass |
| `toJSON()` shape drift                  | Yes      | full structural assertion (5 fields per instance) |
| Optional `detail` lost across `toJSON`  | Yes      | dedicated test passes detail through constructor |
| `noUncheckedIndexedAccess` `T \| undef` | Yes      | `expect(ctor).toBeDefined()` guard |

### Security & Supply-Chain

- **No new runtime dependencies.** `src/errors.ts` has zero imports.
  `package.json` is unchanged.
- **No filesystem IO.** Pure in-memory module — cannot leak paths or write
  outside the scope.
- **No network IO.** No `Bun.fetch`, no `node:http`, nothing.
- **No global mutation.** No `process.env` reads, no `globalThis.x = y`.
- **No eval, no Function constructor, no dynamic require.** Only static
  string literals and class declarations.
- **CSV / log injection vectors:** the `actionableHint` strings are static
  literals; user input flows through `message` and `detail` (which are
  caller-supplied) — those are stored as-is per the abstract base's design,
  with no formatting that could enable log injection. Downstream
  log writers (Story 1.3) are responsible for output escaping.

### Action Items

None. This story is approved as-shipped.

The four non-blocking action items inherited from Story 1.1's review (A1
`@types/bun: latest`, A2 `peerDependencies.typescript: ^5`, A3 CI bun-version
pin, A4 first-CI green confirmation) remain Epic 6 polish items and are NOT
introduced as new actions for this story.

### Files Reviewed

- `src/errors.ts` (213 lines) — Abstract `StepperError` + 15 concrete subclasses + `errorRegistry`.
- `src/errors.test.ts` (114 lines) — Bun-test registry CI gate; 10 `it(...)` blocks; 185 expects.
- `package.json` (unchanged from Story 1.1) — `scripts.check` is the release-blocker gate.
- `_bmad-output/planning-artifacts/architecture.md` §D11, §AR41, §Coherence Validation Correction.
- `_bmad-output/planning-artifacts/epics.md` §Story 1.2 (lines 367–373) for AC verbatim.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status flipped to `done`.
