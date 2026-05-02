---
status: done
story_id: '3.8'
story_key: 3-8-diff-state-and-export-state
epic: '3'
title: '`--diff-state` and `--export-state`'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: M
fr_coverage:
  - FR3
  - FR4
  - FR8
  - FR52
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-P5
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R3
  - NFR-M3
  - NFR-I2
ar_coverage:
  - AR8
  - AR9
  - AR11
  - AR20
  - AR21
  - AR22
  - AR33
  - AR41
  - AR42
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-2-retrospective.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/3-2-resume-flag.md
  - _bmad-output/implementation-artifacts/3-3-dry-run-flag.md
  - _bmad-output/implementation-artifacts/3-4-step-id-and-scope-flags.md
  - _bmad-output/implementation-artifacts/3-5-persona-override-include-optional-no-optional.md
  - _bmad-output/implementation-artifacts/3-6-explain-reasoning-trace.md
  - _bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - .bmad-stepper/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/state/load.ts
  - src/state/recompute.ts
  - src/state/paths.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-protocol.ts
  - src/dag/index.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/args.ts
  - src/commands/next/args.test.ts
  - src/commands/next/index.ts
---

# Story 3.8: `--diff-state` and `--export-state`

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (CI Export journey),
I want `--diff-state` to report cache-vs-files divergence and `--export-state` to emit machine-readable state JSON,
So that drift never goes silent and CI scripts can read state without holding the lock.

## Context Summary

This is the **eighth story of Epic 3** and the **first deliverable that lands TWO sibling helper modules in a single story** — `src/state/diff.ts` (FR3 — `--diff-state`) and `src/state/export.ts` (FR4 — `--export-state`). Stories 3.1 + 3.2 closed the halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`). Story 3.3 landed the first read-only-preview flag (`--dry-run`); Story 3.4 wired explicit-step + scope filtering and introduced the `isPreconditionMet(node, state)` helper; Story 3.5 wired the `--persona` override + `--include-optional`/`--no-optional` toggles AND the `--list` optional-toggle filter; Story 3.6 replaced the `--explain` placeholder with the structured 5-component reasoning trace; Story 3.7 replaced the `--list` placeholder with the canonical 4-component per-line format. Story 3.8 turns its attention to **the cache-vs-files-of-truth audit surface (FR3) AND the machine-readable state export (FR4)** — replacing the Story 2.4 placeholder short-circuits at `src/commands/next/run.ts:1402-1424` with the proper lock-free, schema-versioned implementations.

**The TWO sibling helpers** address related but orthogonal concerns:

1. **`src/state/diff.ts`** (FR3 — `--diff-state`): loads `state.yaml` via `loadStateUnlocked`, runs `recomputeState()` (Story 1.6's mid-tier helper at `src/state/recompute.ts:193-221`) to produce the would-be-recomputed shape, computes a field-by-field divergence between the cached state and the recomputed shape, and emits a human-readable report listing every divergence. Critical: the diff helper MUST run `recomputeState()` WITHOUT acquiring the lock (Story 1.6's existing `recomputeState` DOES acquire the lock at `recompute.ts:197` — Story 3.8 either (a) extends `recomputeState` with a `skipAcquire?: boolean` option OR (b) introduces a new `recomputeStateUnlocked` sibling that re-uses the same internal `scanArtifacts` + `mostRecent` loop without the `acquire(...)` call). v0.1 conservative: option (b) — introduce a new export `recomputeStateUnlocked(opts?)` in `src/state/recompute.ts` that re-uses the same internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`) but skips the lock + skips the `saveState` call (the diff path is read-only). The new `diffState({ statePath, projectRoot, ... }): DiffReport` helper composes `loadStateUnlocked + recomputeStateUnlocked + computeDivergence + formatHumanReadable`. The output format per AC line 847 is the verbatim example: `lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2`.

2. **`src/state/export.ts`** (FR4 — `--export-state`): loads `state.yaml` via `loadStateUnlocked`, projects the State shape into a stable, schema-versioned JSON export shape via Zod, emits the JSON to **stdout** (NEVER stderr — FR54). The export shape per AC line 850 enumerates 7 fields: `currentPhase`, `activeEpic`, `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`, `bmadVersion`, `stepperVersion`. The export shape is a NEW Zod schema — Story 3.8 introduces `src/schemas/state-export.ts` (or extends `src/schemas/state.ts` with an additive `StateExportV1Schema` block — v0.1 conservative chooses NEW file `src/schemas/state-export.ts` to keep the foundational schema's surface bounded and avoid coupling the export contract to the on-disk state shape). The schema-versioned wire format follows the StateV1Schema pattern (`schemaVersion: z.literal(1)` + 7 named fields).

**The existing Story 2.4 placeholders** at `src/commands/next/run.ts:1402-1424` are stub `report` actions emitting hint messages that point at this Story 3.8:

```typescript
if (args.exportState) {
  const statePath =
    opts?.statePath ??
    path.join(
      opts?.projectRoot ?? process.cwd(),
      "_bmad-output/.stepper/state.yaml",
    );
  return reportWithMessage(
    `JSON export is implemented in Story 3.10 (Epic 3); current state path: ${statePath}`,
  );
}

if (args.diffState) {
  const statePath =
    opts?.statePath ??
    path.join(
      opts?.projectRoot ?? process.cwd(),
      "_bmad-output/.stepper/state.yaml",
    );
  return reportWithMessage(
    `State diff is implemented in Story 3.8 (Epic 3); current state path: ${statePath}`,
  );
}
```

(Note: the `--export-state` placeholder cites "Story 3.10" but FR4 + architecture line 1334 routes `--export-state` to Story 3.8 alongside `--diff-state` per the natural sibling-helpers grouping; Story 3.10 owns the LOCK-SKIPPING META-CONTRACT around the read-only-flag cluster, not the per-flag implementation. Story 3.8 corrects the placeholder citation.)

Story 3.8 REPLACES both placeholders with calls into the new `diffState(...)` and `exportState(...)` helpers. The route-order at `run.ts:1398-1400` (`--export-state → --diff-state → --explain → --list → --dry-run → fall-through to dispatch`) stays UNCHANGED; both helpers fire from the same short-circuit positions; both emit `action: "report"` lines per AR9.

**The diff-state algorithm** per AC line 847:

1. **Load cached state** — via `loadStateUnlocked({ statePath: opts?.statePath })`. Returns a `State` per `src/schemas/state.ts:122` (`StateV1` alias).
2. **Compute would-be-recomputed shape** — via `recomputeStateUnlocked({ projectRoot: opts?.projectRoot, ... })`. Returns the same `State` shape (`schemaVersion: 1, project, lastSuccessfulStep, runHistory, checkpoints` — the v0.1 minimum-viable shape per Story 1.6 §line 4-29). The recompute scans `_bmad-output/{planning,implementation}-artifacts/*.md` files-of-truth, picks the artifact with the most recent `last_updated`, and constructs a fresh State.
3. **Compute field-by-field divergences** — walk the cached + recomputed shapes side-by-side; for each field that DIFFERS, append a `Divergence { field, cached, recomputed }` record. v0.1 conservative scope: 4 top-level fields ARE compared — `lastSuccessfulStep` (`step` + `epic` + `story` + `completedAt`), `project.name`, `project.bmadVersion`, `runHistory.length`. The `lastAttempted`, `lastFailureReason`, `lastSnapshot`, `checkpoints` fields are NOT compared (they're write-side state set by the runner — never recomputed from artifact frontmatter; the comparison would always show divergence). The `schemaVersion` is NOT compared (it's ALWAYS 1 in v0.1 — the migration registry guarantees it).
4. **Emit human-readable report** — for each `Divergence`, format the line per the AC line 847 example: `<field>: cached=<cachedRendered>; recomputed=<recomputedRendered>`. The empty-divergence case emits `state.yaml is in sync with files of truth (no divergence detected)`. The output is a multi-line `\n`-joined string carried inside the `report` message (the AR9 single JSON line wraps the multi-line content; same pattern as `--list` per Story 3.7).

**The export-state shape** per AC line 850 — a Zod-versioned JSON object with exactly these 7 fields plus `schemaVersion`:

```typescript
// src/schemas/state-export.ts (NEW)
export const StateExportV1Schema = z.object({
  schemaVersion: z.literal(1),
  currentPhase: z.enum([
    "analysis", "planning", "solutioning", "implementation", "retro",
  ]).nullable(),
  activeEpic: z.number().nullable(),
  lastSuccessfulStep: StateV1Schema.shape.lastSuccessfulStep, // re-use
  lastAttempted: LastAttemptedSchema.nullable(),
  lastFailureReason: LastFailureReasonSchema.nullable(),
  bmadVersion: z.string(),
  stepperVersion: z.string(),
});
```

The mapping from `State → StateExportV1`:
- `currentPhase`: derived from `state.lastSuccessfulStep?.step` by looking up the DAG node's `phase` (or `null` when no `lastSuccessfulStep`).
- `activeEpic`: `state.lastSuccessfulStep?.epic ?? state.lastAttempted?.epic ?? null`. The "active" epic is the most recent dispatch attempt OR completion.
- `lastSuccessfulStep`: pass-through from `state.lastSuccessfulStep` (`{ step, epic, story, completedAt } | null`).
- `lastAttempted`: pass-through from `state.lastAttempted` (`{ step, epic, story, attemptedAt } | null`).
- `lastFailureReason`: pass-through from `state.lastFailureReason` (`{ code, message, hint, runId } | null`).
- `bmadVersion`: pass-through from `state.project.bmadVersion`.
- `stepperVersion`: read from `package.json` `version` field at runtime (or hard-coded constant from `src/version.ts` if it exists per Story 1.13). v0.1 conservative: introduce `STEPPER_VERSION` constant in `src/version.ts` (NEW one-line file) OR import from `package.json`. **v0.1 conservative chooses the constant** — `src/version.ts` exporting `export const STEPPER_VERSION = "0.1.0"` for deterministic test fixtures.

**The schema-versioned discipline** per AR20 (Schemas + migrations apply to state, config, run-log, telemetry — and now state-export per Story 3.8): the `StateExportV1Schema` follows the same `<Family>V1Schema` + `<Family>LatestSchema` + `<Family>` type-alias-chain pattern as `src/schemas/state.ts`. When v2 ships, the schema repoints; the wire shape is stable within a Stepper MAJOR version (per architecture §line 453: "The `--export-state` JSON output is the only programmatic state-as-data contract; its shape is stable within a Stepper MAJOR version").

**FR52 no-lock invariant** per AC line 851:

Both flags use `loadStateUnlocked` exclusively (NEVER `loadState`). The `--diff-state` path additionally uses `recomputeStateUnlocked` (NEW helper introduced in Story 3.8 alongside `recomputeState`). The `--export-state` path uses ONLY `loadStateUnlocked`. Neither helper imports from `src/lock/`. The AR8 / AR41 boundary checks at `src/commands/next/run.test.ts:606-638` continue to enforce the no-lock posture.

**FR54 stdout-only-JSON invariant for `--export-state`** per AC line 850 ("emits valid JSON to stdout (NEVER to stderr — FR54)"):

The `--export-state` JSON is the AR9 `report` action's `message` field. The AR9 line itself is a single JSON line on stdout containing `{ "action": "report", "message": "<JSON-string>", "exitCode": 0 }`. The `message` field carries the JSON body as a string. Layer 1's slash-command markdown reads the AR9 line, extracts the `message`, and writes it to stdout as the user-facing output (or, more precisely, Layer 1 prints the message as-is; the ENTIRE AR9 line is what reaches stdout in the `bun run` context, and CI scripts pipe the line to `jq` to extract the message via `jq -r '.message'`). **Critical FR54 + AR9 reconciliation**: the user's `--export-state | jq '.currentPhase'` workflow per AC line 852 implies that the JSON body — NOT the AR9 wrapper — should be `jq`-parseable. Two implementation options:

- **Option A (AR9-strict)**: emit the AR9 line as-is; the user pipes to `jq -r '.message' | jq '.currentPhase'` (a 2-step pipeline). This preserves AR9 invariant verbatim.
- **Option B (FR54-friendly)**: emit the JSON body DIRECTLY on stdout (NOT wrapped in the AR9 line); the user pipes to `jq '.currentPhase'` (1-step). This requires a special `--export-state` short-circuit BEFORE the standard AR9 emission path; the function returns a structured value, but the `import.meta.main` block at the end of `run.ts` emits the JSON body directly INSTEAD OF `emitDispatchAction`.

**Story 3.8 chooses Option B per AC line 852 wording**: "integration test asserts `--export-state | jq '.currentPhase'` works without the lock". The `jq '.currentPhase'` is a single-step extraction; this implies the body is on stdout directly. Option B is also consistent with architecture line 524: "**Stdin/stdout discipline:** `--export-state` writes JSON to stdout only; all other diagnostics go to stderr; the main run-log stream is on disk, never on stdout/stderr." This is a SPECIAL CASE for `--export-state` only — every OTHER flag (including `--diff-state`) emits the AR9 line. The implementation:

- The `runNext` short-circuit for `--export-state` returns `{ exitCode: 0, action: { action: "report", message: "<JSON-body>", exitCode: 0 } }`. Tests inspect `result.action.message` and `JSON.parse(result.action.message)` against `StateExportV1Schema`.
- The `import.meta.main` block at the bottom of `run.ts` checks if `args.exportState === true` and, if so, calls `process.stdout.write(`${result.action.message}\n`)` (the JSON body directly) INSTEAD OF `emitDispatchAction`. **Defence-in-depth Zod parse**: the `runNext` function calls `StateExportV1Schema.parse(...)` on the export shape BEFORE serialising; the JSON body is guaranteed valid against the schema.

**The `--diff-state` path** stays AR9-standard: the `report` action's `message` carries the multi-line human-readable divergence report (mirrors `--list` per Story 3.7 + `--explain` per Story 3.6). The user pipes to `jq -r '.message'` to extract the multi-line content for further processing.

**Integration test for `--export-state | jq` no-lock** per AC line 852:

A NEW integration test at `src/integration/export-state-no-lock.test.ts` (file path mirrors architecture line 1239 — `src/integration/export-state.test.ts` is the canonical home; Story 3.8 chooses the more-specific `-no-lock` suffix to make the test's intent surface in the filename). The test:

1. Seeds a minimal valid `state.yaml` in tmpdir.
2. Spawns `bun run src/commands/next/run.ts -- --export-state` as a subprocess (per Story 2.8 + 3.3 spawn pattern).
3. Captures stdout; pipes to `jq '.currentPhase'` (or simpler: parses stdout via `JSON.parse(stdout.trim())` and asserts `parsed.currentPhase` is the expected string OR `null`).
4. Asserts `exitCode === 0`.
5. **Concurrent-active-lock test**: forward-deferred to Story 3.10 (which wires the explicit `skipAcquire` flag for the cluster of read-only flags). v0.1 conservative for Story 3.8: the test asserts `--export-state` works WITHOUT acquiring the lock (no concurrent process); the test verifies the helper's lock-free contract structurally (no import from `src/lock/`).

**Forward-coupling with Story 3.10**: Story 3.10's AC (epics.md lines 870-885) explicitly enumerates `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state` as the **five** read-only flags that skip lock acquisition. Story 3.10 will wire the `skipAcquire: boolean` flag on `src/io/lock.ts`'s `acquire()` API SO THAT CI scripts running `--export-state` concurrent with an active Stepper invocation succeed without `LOCK_CONTENTION`. In v0.1 (BEFORE Story 3.10), the lock is structurally never acquired in `run.ts` (architecture §line 1672 + AR8); the `--export-state` and `--diff-state` helpers inherit this. Story 3.8 documents the forward-coupling and ships ZERO Story 3.10 code — the integration test asserts the v0.1 read-only contract (no lock interaction); the concurrent-active-lock test is a Story 3.10 deliverable.

**Edge case — empty / corrupt state.yaml**: if `loadStateUnlocked(...)` throws `CorruptStateError` (size 0, malformed YAML, schema-rejection per `src/state/load.ts:99-128`), the standard error-translation pipeline (`haltFromError` at `run.ts:1000-1019`) translates it into `action: "halt"` with the existing actionable hint. Story 3.8 inherits this; both `--diff-state` and `--export-state` paths surface the same halt action (the read-only flags are NOT special-cased on corrupt state; the user gets a clear remediation hint).

**Edge case — empty divergence (`--diff-state`)**: the helper emits the message `state.yaml is in sync with files of truth (no divergence detected)`. The `report` action's `exitCode` is 0 (success — no divergence is success, not a halt). Distinct from the all-done message in `--explain` (which signals "project complete"); `--diff-state` is per-state per-files audit; emits "in sync" or a list of divergences.

**Edge case — projectRoot missing artifacts**: if `recomputeStateUnlocked` finds zero `_bmad-output/{planning,implementation}-artifacts/*.md` files with `status: complete | done`, the recomputed `lastSuccessfulStep` is `null`. The diff comparison: if cached `lastSuccessfulStep` is also `null`, no divergence; if cached is non-null, divergence reports `lastSuccessfulStep: cached=<step> epic <n> story <x.y>; recomputed=null`. v0.1 conservative: surfaces the divergence verbatim; user resolves by checking artifact frontmatter.

**Edge case — multiple combos**: `--export-state + --diff-state` (both flags set): the route order at `run.ts:1398-1400` puts `--export-state` BEFORE `--diff-state`; the `--export-state` short-circuit fires FIRST; the diff is suppressed. Test verifies. `--export-state + --explain` / `--export-state + --list` / `--export-state + --dry-run`: `--export-state` wins per route order. `--export-state + --resume`: `--export-state` is read-only — does NOT consume the resume target; the resume substitution lives on the dispatch path AFTER all read-only short-circuits. `--export-state + --doctor`: `--doctor` short-circuit at `run.ts:1380-1396` fires BEFORE `--export-state`; `--doctor` wins per route order. Test verifies for `--diff-state` + combos as well.

**Edge case — `bmadVersion` field**: the export shape's `bmadVersion` is sourced from `state.project.bmadVersion`. If the cached state has the placeholder value `"unknown"` (Story 1.6's default per `recompute.ts:209`), the export emits `bmadVersion: "unknown"`. CI scripts can detect this and surface a "BMAD version not yet resolved by `--doctor`" warning. v0.1 conservative: the exporter does NOT translate `"unknown"` → `null`; preserves the on-disk value verbatim per FR4 ("export the current state").

Concretely, this story produces:

1. **`src/state/diff.ts`** (NEW, ~150 lines): the `diffState({ statePath, projectRoot, ... }): Promise<DiffReport>` helper. `DiffReport` is a structural type `{ divergences: readonly Divergence[]; humanReadable: string }`. The function loads state via `loadStateUnlocked`, runs `recomputeStateUnlocked`, computes divergences, formats the human-readable string. Pure / async; no I/O writes. Lock-free.

2. **`src/state/export.ts`** (NEW, ~80 lines): the `exportState({ statePath, projectRoot, ... }): Promise<StateExportV1>` helper. Loads state via `loadStateUnlocked`; projects into the `StateExportV1` shape; runs the schema-versioned Zod parse for defence-in-depth; returns the typed value. Pure / async; no I/O writes. Lock-free.

3. **`src/schemas/state-export.ts`** (NEW, ~50 lines): the `StateExportV1Schema` Zod schema declaration. 7 named fields + `schemaVersion: z.literal(1)`. Type chain: `StateExportV1` + `StateExport` alias + `StateExportLatestSchema`. Foundational module per AR41 — zero upward imports; only depends on `zod` + foundational-tier sibling `./state.ts` for the `LastAttemptedSchema` + `LastFailureReasonSchema` re-use.

4. **`src/state/recompute.ts`** (MODIFIED): adds the `recomputeStateUnlocked(opts?)` export. Re-uses the existing internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`); skips the `acquire(...)` call; skips the `saveState(...)` call (read-only path). Returns the recomputed `State` value WITHOUT persisting. The existing `recomputeState` continues to be the canonical write-side helper for Story 6.x's `--recompute-state` flag (Story 3.8 does NOT touch the locked variant).

5. **`src/version.ts`** (NEW, 1-3 lines): `export const STEPPER_VERSION = "0.1.0"`. The export-state shape's `stepperVersion` field reads this constant. Forward-compatible with Story 6.10's marketplace release (`STEPPER_VERSION` becomes the single source of truth for the version bump).

6. **`src/commands/next/run.ts`** (MODIFIED, ~30-line replacement): replaces the placeholder short-circuits at `run.ts:1402-1424` with calls into `diffState(...)` and `exportState(...)`. The `--diff-state` short-circuit emits the human-readable report via `reportWithMessage`. The `--export-state` short-circuit emits a SPECIAL-CASE plain-JSON body via `process.stdout.write` (the `import.meta.main` block) instead of the standard AR9 line. The `runNext` function returns `action: "report"` with the JSON body in `message` so tests can inspect it; the process-level emit is the special case.

7. **`src/state/diff.test.ts`** (NEW, ~250 lines): 6-8 colocated test cases covering the diff helper (cached-equals-recomputed → empty divergence; one-field divergence → single-line report; multi-field divergence → multi-line report; empty state → "in sync" or per-field divergence; `recomputeStateUnlocked` does not acquire the lock; the human-readable format matches the AC-line-847 example verbatim).

8. **`src/state/export.test.ts`** (NEW, ~150 lines): 4-6 colocated test cases covering the export helper (state has `lastSuccessfulStep` → all 7 fields populated; state has only `lastAttempted` → `lastSuccessfulStep` is null; state is empty → most fields null; the schema-versioned shape passes Zod parse; `bmadVersion: "unknown"` preserved; `stepperVersion` matches the constant).

9. **`src/schemas/state-export.test.ts`** (NEW, ~50 lines): 2-3 cases for the schema (parse a valid shape; reject unknown keys via `.strict()` if applicable; round-trip JSON via stringify→parse).

10. **`src/commands/next/run.test.ts`** (MODIFIED, ~150 added lines): 4-6 new colocated test cases covering the runner short-circuits. `--diff-state` returns a `report` action; `--export-state` returns a `report` action whose `message` is `JSON.parse`-able against `StateExportV1Schema`; route-order precedence (`--export-state + --diff-state` → export wins); `--diff-state + --explain` → diff wins (route order: export → diff → explain → list → dry-run).

11. **`src/integration/export-state-no-lock.test.ts`** (NEW, ~100 lines): the AC-line-852 enforcement test. Spawns `bun run src/commands/next/run.ts -- --export-state` against a fixture-seeded tmpdir; captures stdout; parses stdout as JSON; asserts the JSON has `currentPhase`, `activeEpic`, `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`, `bmadVersion`, `stepperVersion` fields; asserts exitCode 0; asserts no `state.yaml.tmp` written; asserts no lock files in tmpdir (FR52 invariant).

12. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `3-8-diff-state-and-export-state: backlog → ready-for-dev` (at create-story time). At dev-story completion, flips to `review` (intermediate `in-progress` during dev).

**What this story DOES NOT do**:

- **Implement `--watch`** (Story 3.9). The forward-deferred stub at `run.ts:~1340` (the `--watch` placeholder) stays UNCHANGED.
- **Implement `--recompute-state`** (Story 6.x — full DAG-aware recompute per architecture §line 1129). Story 3.8 ships `recomputeStateUnlocked` (a NEW unlocked variant) BUT does NOT touch the existing locked `recomputeState` helper. Story 6.x owns the full DAG-aware, BMAD-skill-aware, verifier-aware recompute that replaces Story 1.6's minimum-viable skeleton.
- **Wire Story 3.10's lock-skipping** (the explicit `skipAcquire: boolean` flag on `src/io/lock.ts`'s `acquire()` API for the cluster of read-only flags). Story 3.10 owns the `--export-state`/`--list`/`--explain`/`--dry-run`/`--diff-state` lock-skipping logic. In v0.1 (BEFORE Story 3.10), the lock is structurally never acquired in `run.ts` (architecture §line 1672 + AR8); Story 3.8's helpers inherit this. Story 3.10's wiring becomes meaningful when the read-only flags ever route through a lock-acquiring path. Story 3.8 documents the forward-coupling; Story 3.10 wires the `skipAcquire` flag.
- **Test concurrent-active-lock for `--export-state`** (where one process holds the lock and another runs `--export-state` simultaneously). This is Story 3.10's integration test (per Story 3.10 AC). v0.1 Story 3.8 asserts the v0.1 read-only contract structurally (no `src/lock/` import; the helper is async + lock-free); the concurrent-active-lock test ships in Story 3.10.
- **Acquire the lock** in either helper. Both `diffState(...)` and `exportState(...)` use `loadStateUnlocked` (and `recomputeStateUnlocked` for diff); ZERO lock interaction. The AR41 boundary check at `run.test.ts:606-638` continues to enforce no-`src/lock/` import for `run.ts`; the new helpers also do NOT import `src/lock/`.
- **Modify `state.yaml` from `run.ts` or the new helpers**. Both helpers are read-only; the lock-free contract per architecture §line 1672 + AR8 is preserved.
- **Modify `commands/bmad-next.md` (Layer 1 markdown)**. The Layer 1 markdown already branches on `action`; the `report` action (carrying multi-line `message`) is PRE-EXISTING surface (Stories 2.4 + 2.7 + 3.3 + 3.6 + 3.7). The `--export-state` special-case (process.stdout.write of the JSON body, BYPASSING the AR9 line) is handled in `run.ts`'s `import.meta.main` block; Layer 1 still reads stdout, but the body IS the JSON (not the AR9 wrapper) — same single-line-on-stdout contract from Layer 1's POV.
- **Modify `verify-and-advance.ts`**. The lock-held runner is NEVER invoked on `--export-state` or `--diff-state` (Layer 1 branches on `action: "report"` — the `report` branch prints the message and exits 0; no Task call; no verify-and-advance). No change needed.
- **Modify `args.ts`**. Story 1.7 already declared `exportState: z.boolean().default(false)` at `args.ts:164` + `diffState: z.boolean().default(false)` at `args.ts:165`. No args change needed for Story 3.8.
- **Add a new error class**. The 16-code registry stays UNCHANGED. Both helpers' upstream throws (`CorruptStateError`, `PathologicalInputError`, etc. from `loadStateUnlocked`) are PRESERVED via the standard `haltFromError` translation pipeline.
- **Add `state.completedSteps[]` to `StateV1Schema`** (Story 6.x). v0.1 uses the `state.lastSuccessfulStep` proxy; the diff helper compares the single-step shape only.
- **Implement DAG-aware recomputed state**. The Story 1.6 minimum-viable recompute (artifact frontmatter scan, most-recent `last_updated` heuristic) is PRESERVED. Story 6.x's full DAG-aware recompute is forward-deferred per Story 1.6 §line 31.
- **Add a `--export-state-format=yaml` or `--export-state-pretty` flag**. v0.1 ships JSON only (compact via `JSON.stringify(value)`). Story 6.x may add format flags via `bmad-stepper.config.yaml`.

It DOES land:

- The architecturally-prescribed **`src/state/diff.ts`** module per FR3 + epic AC line 847 + architecture line 1130 (`src/state/diff.ts # --diff-state (FR3)`).
- The architecturally-prescribed **`src/state/export.ts`** module per FR4 + epic AC line 850 + architecture line 1131 (`src/state/export.ts # --export-state JSON (FR4, 52)`).
- The architecturally-prescribed **`src/schemas/state-export.ts`** schema per AR20 + architecture line 453 ("the only programmatic state-as-data contract; its shape is stable within a Stepper MAJOR version").
- The architecturally-prescribed **`src/state/recompute.ts` `recomputeStateUnlocked` extension** per FR3 + FR52 (the diff path needs an unlocked recompute).
- The architecturally-prescribed **`src/version.ts`** module — the single source of truth for `STEPPER_VERSION`, consumed by the export shape.
- The architecturally-prescribed **`src/commands/next/run.ts` short-circuit replacements** at lines 1402-1424 — replaces the Story 2.4 placeholders with calls into the new helpers.
- The architecturally-prescribed **`--export-state` SPECIAL-CASE stdout-only-JSON emit** per FR54 + AC line 852 — bypasses the AR9 wrapper for `--export-state`; preserves AR9 for `--diff-state` (and every other report-emitting flag).
- The **integration test for `--export-state | jq '.currentPhase'`** per AC line 852.
- **10-15 new colocated unit-test cases** across `diff.test.ts` + `export.test.ts` + `state-export.test.ts` + `run.test.ts` covering happy-path + edge cases + route-order precedence.
- The **forward-coupling documentation** with Stories 3.9 / 3.10 / 6.x.

This story exercises:

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Both new helpers are lock-free; `run.ts` is unchanged in lock posture; `verify-and-advance.ts` is never invoked on `--diff-state` / `--export-state` paths.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED with a SPECIAL CASE. `--diff-state` emits the standard AR9 `report` line. `--export-state` emits the JSON body DIRECTLY on stdout (NOT wrapped in AR9). The JSON body is still a single line; Layer 1's slash-command markdown contract (single line on stdout) is preserved. Documented in `run.ts` JSDoc + the new `src/state/export.ts` JSDoc.
- **AR11** (`state.yaml` at `_bmad-output/.stepper/state.yaml`; `STATE_PATH` constant): UNCHANGED. Both helpers read via `loadStateUnlocked({ statePath: opts?.statePath })` — same canonical path discipline as Story 1.6.
- **AR20** (Schemas + migrations apply to state, config, run-log, telemetry): EXTENDED with state-export. `StateExportV1Schema` follows the same `<Family>V1Schema` + `<Family>LatestSchema` + `<Family>` type-alias-chain pattern. v2 migration is a Story 6.x concern.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. ZERO new error classes. Existing throws (`CorruptStateError`, `PathologicalInputError`, etc.) flow through `haltFromError` per Story 2.4.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): EXTENDED. Both new helpers are async; throw not Result; no console.* (the `--export-state` stdout emission uses `process.stdout.write` per architecture §line 862 — "the logger helper at `src/io/log.ts` writes to the proper output stream"; `process.stdout.write` is the canonical stdout primitive, NOT `console.log`).
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED + EXTENDED. The new `src/state/diff.ts` is a mid-tier module; imports `loadStateUnlocked` (mid-tier sibling per AR41 — same-tier sibling is allowed) + `recomputeStateUnlocked` (same-tier sibling) + `StateExportV1Schema` (foundational sibling). The new `src/state/export.ts` is a mid-tier module; imports `loadStateUnlocked` + `StateExportV1Schema` + `STEPPER_VERSION`. The new `src/schemas/state-export.ts` is a foundational module; imports zod + `./state.ts` (foundational sibling). The new `src/version.ts` is foundational; imports nothing.
- **AR42** (test discipline): EXTENDED. New unit tests in `src/state/diff.test.ts` + `src/state/export.test.ts` + `src/schemas/state-export.test.ts`. Each test file has its colocated `*.test.ts` per AR42.
- **FR3** (`--diff-state`): PRIMARY DELIVERABLE. v0.1 ships the cache-vs-recomputed divergence report per AC line 847.
- **FR4** (`--export-state` JSON): PRIMARY DELIVERABLE. v0.1 ships the schema-versioned 7-field export per AC line 850.
- **FR8** (`/bmad-next` single-step advance): UNCHANGED. The dispatch path is unaffected; both flags are read-only short-circuits.
- **FR52** (Read-only flags non-locking): SATISFIED-BY-AR8. The lock-free `run.ts` contract per architecture §line 1672 already ensures both flags do not acquire the lock. Story 3.10 will wire the `skipAcquire` flag for the read-only-flag cluster; in v0.1 the invariant is structural.
- **FR53** (Documented exit codes): UNCHANGED. Both helpers return exit code 0 (success). Halt translations (corrupt state, pathological input, etc.) flow through the existing `haltFromError` mapping.
- **FR54** (stdout/stderr discipline): EXTENDED. The `--export-state` JSON body goes to stdout DIRECTLY (per architecture §line 524 + line 862); diagnostics route to stderr. The `--diff-state` AR9 line goes to stdout (single JSON line); the multi-line human-readable report lives in the `message` field.
- **NFR-P1** (next-step computation < 500ms p95): EXTENDED. The diff path is structurally O(N) where N = number of artifact files; for the 50-epics × 50-stories baseline (~2500 artifact files) the recompute is microseconds. The export path is O(1) — single state read + single Zod parse. Both fit well under the 500ms p95 budget.
- **NFR-P5** (state.yaml ≤ 1 MB < 100ms): UNCHANGED. The size guard at `src/state/load.ts:104-108` (`>haltSizeBytes` halt) + `src/state/load.ts:110-115` (`>warnSizeBytes` warn) is invoked from `loadStateUnlocked` — both helpers inherit.
- **NFR-S2** (writes only inside scope): UNCHANGED. Both helpers are read-only; ZERO write surface introduced. The integration test asserts no `state.yaml.tmp`, no `staging/`, no lock files written by `--export-state` / `--diff-state`.
- **NFR-S5** (atomic writes + locks): UNCHANGED. Read-only paths; nothing to write atomically; no locks to acquire.
- **NFR-R1** (zero data loss on halt): UNCHANGED. Read-side only; no write paths touched.
- **NFR-R3** (state recomputable from disk): EXTENDED. `recomputeStateUnlocked` is a NEW exported helper that exposes the recompute logic without lock-acquisition; the diff path uses this. The full DAG-aware recompute is Story 6.x.
- **NFR-M3** (schemas + migrations): EXTENDED. `StateExportV1Schema` + the type-alias chain follows the schema-versioned discipline.
- **NFR-I2** (unknown-skill fail-loud): UNCHANGED. The diff path's `recomputeStateUnlocked` runs the same artifact scan as `recomputeState`; unknown-skill errors flow through the existing translation.

Estimated effort: **M** (medium — TWO new core modules `src/state/diff.ts` (~150 lines) + `src/state/export.ts` (~80 lines); ONE new schema file `src/schemas/state-export.ts` (~50 lines); ONE new tiny module `src/version.ts` (~3 lines); ONE new exported helper `recomputeStateUnlocked` in `src/state/recompute.ts` (~30 lines added); ONE replacement of TWO short-circuits in `src/commands/next/run.ts` (~30-line replacement); ONE special-case `import.meta.main` branch for `--export-state` stdout-only-JSON emit (~10 lines added); FOUR new test files (`diff.test.ts` + `export.test.ts` + `state-export.test.ts` + `export-state-no-lock.test.ts`) totaling ~550 lines + ~150 added lines to `run.test.ts`. Net additions: ~1,000 lines across 9 files. The integration test is REQUIRED per AC line 852; the AR9 single-line-on-stdout invariant has a SPECIAL CASE for `--export-state` per FR54 + architecture §line 524 — design care needed; the schema-versioned wire format requires AR20 + AR42 fidelity).

It does **NOT**:

- **Implement runtime `failurePolicies` lookup.** Forward-deferred to Story 6.x.
- **Implement multi-persona sequential dispatch.** Forward-deferred to Stories 4.1 + 5.*.
- **Implement `--watch`** (Story 3.9).
- **Implement `--recompute-state`** (Story 6.x — full DAG-aware variant; Story 3.8 ships ONLY the unlocked sibling for the diff path).
- **Wire Story 3.10's `skipAcquire` flag** for the read-only-flag cluster.
- **Modify `verify-and-advance.ts`.** Lock-held runner is unchanged.
- **Add a new dispatch-protocol field.** The `report` action shape carries the multi-line content as `message`; the `--export-state` SPECIAL CASE bypasses the AR9 wrapper but does not extend the schema.
- **Resolve epic/story attribution from DAG nodes** (Story 6.x).
- **Add a config-loader knob for export format** (`bmad-stepper.config.yaml export.format: json | yaml`). Forward-deferred to Story 6.1 (config-loader).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.8 (lines 837-852, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `src/state/diff.ts` invoked
**When** `--diff-state` runs
**Then** it loads `state.yaml`, runs `recomputeState()` to produce the would-be-recomputed shape, computes the diff, and emits a human-readable report listing every divergence (e.g., `lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2`)
**Given** `src/state/export.ts` invoked
**When** `--export-state` runs
**Then** it emits valid JSON to stdout (NEVER to stderr — FR54) containing `currentPhase`, `activeEpic`, `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`, `bmadVersion`, `stepperVersion`, schema-versioned via Zod
**And** running these flags does NOT acquire the project lock (FR52)
**And** integration test asserts `--export-state | jq '.currentPhase'` works without the lock

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: all)**
  - [ ] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71` (`3-1-record-last-attempted-last-failure-reason-on-halt: done`).
  - [ ] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72` (`3-2-resume-flag: done`).
  - [ ] 0.3 Confirm Story 3.3 (`--dry-run` Flag) is `done` per `sprint-status.yaml:73` (`3-3-dry-run-flag: done`); the read-only-flag-route order at `src/commands/next/run.ts:1398-1400` (`--export-state → --diff-state → --explain → --list → --dry-run`) is the foundation for Story 3.8's two short-circuits.
  - [ ] 0.4 Confirm Story 3.4 (`--step` and Scope Flags) is `done` per `sprint-status.yaml:74` (`3-4-step-id-and-scope-flags: done`).
  - [ ] 0.5 Confirm Story 3.5 (`--persona` + `--include-optional`/`--no-optional`) is `done` per `sprint-status.yaml:75`.
  - [ ] 0.6 Confirm Story 3.6 (`--explain` Reasoning Trace) is `done` per `sprint-status.yaml:76`; the multi-line-message-in-`report` pattern is the structural template for `--diff-state`'s human-readable report.
  - [ ] 0.7 Confirm Story 3.7 (`--list` Candidate Next Steps) is `done` per `sprint-status.yaml:77`; the multi-line-message-in-`report` pattern is shared.
  - [ ] 0.8 Confirm Story 1.6 (`recomputeState` skeleton) is `done` per `sprint-status.yaml:51` (`1-6-state-subsystem-load-save-recompute-skeleton: done`); read `src/state/recompute.ts:193-221` (the locked variant) — Story 3.8 introduces the unlocked sibling reusing the internal helpers.
  - [ ] 0.9 Confirm Story 1.5 (Schemas + Migrations Skeleton) is `done` per `sprint-status.yaml:50`; read `src/schemas/state.ts:92-119` (`StateV1Schema` shape) — Story 3.8 reuses `LastAttemptedSchema` + `LastFailureReasonSchema` in the export-state shape.
  - [ ] 0.10 Confirm Story 1.7 (`src/commands/next/args.ts`) declares `exportState: z.boolean().default(false)` at line 164 + `diffState: z.boolean().default(false)` at line 165 + lists `"exportState"` + `"diffState"` in the `booleanKeys` set at lines 220-221. **No args change needed for Story 3.8.**
  - [ ] 0.11 Confirm Story 2.4's existing `--export-state` placeholder lives at `src/commands/next/run.ts:1402-1412` and `--diff-state` placeholder lives at `src/commands/next/run.ts:1414-1424`. Read these regions to confirm:
    - Both fire BEFORE `--explain` per the route comment at `run.ts:1398-1400`.
    - Both return `reportWithMessage(...)` with hint messages pointing at this Story 3.8.
    - Both compute `statePath` from `opts?.statePath ?? path.join(opts?.projectRoot ?? process.cwd(), "_bmad-output/.stepper/state.yaml")`.
    - **Story 3.8 REPLACES both placeholders** with calls into the new `diffState(...)` and `exportState(...)` helpers.
  - [ ] 0.12 Confirm `src/state/load.ts` exports `loadStateUnlocked(opts?)` at line 166 — both new helpers consume this.
  - [ ] 0.13 Confirm `src/state/recompute.ts` exports `recomputeState(opts?)` at line 193 — Story 3.8 ADDS `recomputeStateUnlocked(opts?)` reusing the internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`, `ARTIFACT_GLOBS`, `FRONTMATTER_OPEN`).
  - [ ] 0.14 Confirm `src/schemas/state.ts` exports `LastAttemptedSchema`, `LastFailureReasonSchema`, `StateV1Schema`, `StateLatestSchema` per Story 3.1 extraction. Story 3.8's `state-export.ts` reuses `LastAttemptedSchema` + `LastFailureReasonSchema` (foundational sibling import — explicitly allowed per AR41).
  - [ ] 0.15 Confirm `src/schemas/dispatch-protocol.ts` exports `DispatchActionV1Schema` discriminated-union with `report | dispatch | halt` variants. Story 3.8 emits `action: "report"` for `--diff-state`; `--export-state` SPECIAL-CASES the import.meta.main block to emit the JSON body directly per FR54.
  - [ ] 0.16 Confirm `src/errors.ts` registry stays at 16 codes (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.8 ships ZERO new error classes — both helpers' upstream throws (`CorruptStateError`, `PathologicalInputError`) flow through `haltFromError`.
  - [ ] 0.17 Read epics.md §Story 3.8 lines 837-852 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [ ] 0.18 Read prd.md §FR3 line 673, §FR4 line 674, §FR52 line 743, §FR54 line 745, and §Journey 5 (`--export-state` for Audit) lines 335-347 — these are the contract sources for the 7 export fields and the FR54 stdout-only-JSON discipline.
  - [ ] 0.19 Read architecture.md §line 1130 (`src/state/diff.ts # --diff-state (FR3)`); §line 1131 (`src/state/export.ts # --export-state JSON (FR4, 52)`); §line 1239 (`src/integration/export-state.test.ts # --export-state JSON contract (FR4, 52)`); §line 1334 (FR4 → `src/state/export.ts`); §line 1382 (FR52 → `src/state/export.ts`, `src/state/diff.ts`); §line 1672 (`run.ts` is read-only / lock-free); §line 1660 (AR9 protocol concretization); §line 524 (FR54 stdout/stderr discipline; `--export-state` JSON to stdout only); §line 862 (no `console.log`; stdout reserved for `--export-state` JSON).
  - [ ] 0.20 Read epic-2-retrospective.md §Forward Action Items — confirm Story 3.8 is in the recommended sequence (AFTER Story 3.7, BEFORE Story 3.9).
  - [ ] 0.21 Read Story 3.7's Forward Dependencies §Story 3.8 entry (line 674) — confirms 3.7 + 3.8 are sibling read-only diagnostic flags with no shared surface beyond the `report`-action output pattern. Story 3.8 inherits the multi-line-message-in-`report` pattern from Story 3.7 (for `--diff-state`); the AR9 special-case for `--export-state` is NEW.
  - [ ] 0.22 Confirm baseline `bun run check` exits 0 with **662 pass / 0 fail / 2456 expects / 49 files** per Story 3.7 final.
  - [ ] 0.23 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [ ] 0.24 Confirm `src/state/paths.ts:22` declares `STATE_PATH = "${STEPPER_INTERNAL_ROOT}/state.yaml"`. Both helpers default to this constant when `opts.statePath` is undefined.

- [ ] **Task 1 — Create `src/state/diff.ts` (AC: line 847)**
  - [ ] 1.1 Module shape (mid-tier per AR41; FR3, FR52, NFR-P5, NFR-R3, AR8, AR11, AR33). JSDoc explains the cache-vs-files-of-truth contract; the module composes `loadStateUnlocked + recomputeStateUnlocked + computeDivergences + formatHumanReadable`.
  - [ ] 1.2 Public exports:
    ```typescript
    export interface Divergence {
      readonly field: string;
      readonly cached: string;
      readonly recomputed: string;
    }
    export interface DiffReport {
      readonly divergences: readonly Divergence[];
      readonly humanReadable: string;
    }
    export interface DiffStateOptions extends LoadStateOptions, RecomputeOptions {}
    export async function diffState(opts?: DiffStateOptions): Promise<DiffReport>;
    ```
  - [ ] 1.3 Internal `computeDivergences(cached, recomputed): Divergence[]` walks 4 fields per the v0.1 conservative scope (`lastSuccessfulStep`, `project.name`, `project.bmadVersion`, `runHistory.length`). NOT compared: `schemaVersion` (always 1 + migration registry guarantees), `lastAttempted` / `lastFailureReason` / `lastSnapshot` / `checkpoints` (write-side state never recomputed; comparing would always show divergence).
  - [ ] 1.4 Internal `renderLastSuccessfulStep(v): string` renders `null` → `"null"`; non-null → `"<step> epic <n> story <x.y>"`. Matches the AC line 847 verbatim example `dev-story epic 3 story 3.2` (omits `completedAt` for compactness).
  - [ ] 1.5 Internal `formatHumanReadable(divergences): string`: empty → `"state.yaml is in sync with files of truth (no divergence detected)"`; non-empty → header `"state.yaml diverges from files of truth:"` + per-divergence indented bullet `"  ${field}: cached=${cached}; recomputed=${recomputed}"`. The `\n`-joined multi-line string carries inside the runner's `report` message.
  - [ ] 1.6 Field-name convention: dot-path (e.g., `lastSuccessfulStep`, `project.name`, `runHistory.length`). Forward-compatible with Story 6.x deep-diff.

- [ ] **Task 2 — Create `src/state/export.ts` (AC: line 850)**
  - [ ] 2.1 Module shape (mid-tier per AR41; FR4, FR52, FR54, NFR-M3, AR8, AR11, AR20, AR33). JSDoc explains the schema-versioned JSON projection of `State → StateExportV1`. Composes `loadStateUnlocked + project + StateExportV1Schema.parse`.
  - [ ] 2.2 Public exports:
    ```typescript
    export interface ExportStateOptions extends LoadStateOptions {
      readonly dagNodePhase?: (stepName: string) => Phase | null;
    }
    export async function exportState(opts?: ExportStateOptions): Promise<StateExportV1>;
    ```
  - [ ] 2.3 Field projection (per AC line 850 — 7 fields + `schemaVersion`): `schemaVersion: 1`, `currentPhase = opts.dagNodePhase?.(lastSuccessfulStep.step) ?? null`, `activeEpic = lastSuccessfulStep?.epic ?? lastAttempted?.epic ?? null`, `lastSuccessfulStep`/`lastAttempted`/`lastFailureReason` pass-through, `bmadVersion = state.project.bmadVersion`, `stepperVersion = STEPPER_VERSION`. Defence-in-depth `StateExportV1Schema.parse(exported)` runs before return.
  - [ ] 2.4 v0.1 conservative scope for `currentPhase`: WITHOUT a `dagNodePhase` callback, returns `null` (the runner-side short-circuit at `run.ts:~1402` passes `opts.dagNodePhase = (name) => dag.nodes.get(name)?.phase ?? null` to enable the lookup). Forward-compatible with Story 6.x richer phase-detection.
  - [ ] 2.5 `bmadVersion: "unknown"` preserved verbatim (FR4 wording — "export the current state"); CI scripts detect + surface a warning.
  - [ ] 2.6 `stepperVersion` sourced from `src/version.ts` constant (NEW — Task 5). Forward-compatible with Story 6.10 marketplace release.

- [ ] **Task 3 — Create `src/schemas/state-export.ts` (AC: line 850)**
  - [ ] 3.1 Foundational module per AR41 (FR4, FR54, NFR-M3, AR20). Zero upward imports; depends on `zod` + foundational sibling `./state.ts` (re-uses `LastAttemptedSchema` + `LastFailureReasonSchema` + `StateV1Schema.shape.lastSuccessfulStep`).
  - [ ] 3.2 Schema sketch:
    ```typescript
    export const StateExportV1Schema = z.object({
      schemaVersion: z.literal(1),
      currentPhase: z.enum(["analysis","planning","solutioning","implementation","retro"]).nullable(),
      activeEpic: z.number().nullable(),
      lastSuccessfulStep: StateV1Schema.shape.lastSuccessfulStep,
      lastAttempted: LastAttemptedSchema.nullable(),
      lastFailureReason: LastFailureReasonSchema.nullable(),
      bmadVersion: z.string(),
      stepperVersion: z.string(),
    });
    export type StateExportV1 = z.infer<typeof StateExportV1Schema>;
    export type StateExport = StateExportV1;
    export const StateExportLatestSchema = StateExportV1Schema;
    ```
  - [ ] 3.3 Wire-shape stability per architecture §line 453: stable within a Stepper MAJOR version. v0.1 → v0.2 cannot drop fields; can ADD fields with `.optional()` per AR20.
  - [ ] 3.4 v2 forward-compat: when StateExport gains a v2, `StateExportLatestSchema` repoints; `StateExportV1Schema` stays reserved for migration code (Story 6.x).

- [ ] **Task 4 — Add `recomputeStateUnlocked` in `src/state/recompute.ts` (AC: line 845-847)**
  - [ ] 4.1 Add a NEW exported function `recomputeStateUnlocked(opts?: RecomputeOptions): Promise<State>` that re-uses the existing internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`, `ARTIFACT_GLOBS`, `FRONTMATTER_OPEN`) from the locked variant. Identical body to `recomputeState` MINUS (a) the `acquire(...)` call and (b) the `saveState(...)` call. Returns the fresh State value without persisting. JSDoc points at the FR52 + Story 3.8 contract.
  - [ ] 4.2 Same return type + same `RecomputeOptions` interface as the locked variant; same throws (except never `LockContentionError`).
  - [ ] 4.3 Read-only contract: ZERO writes; ZERO lock acquisition. The helper is safe for the read-only-flag cluster (used by `--diff-state` directly; `--export-state` does NOT need recompute — only `--diff-state` does).
  - [ ] 4.4 v0.1 → Story 6.x evolution: full DAG-aware recompute will replace BOTH locked + unlocked variants; signatures stay the same; the split is preserved through Story 6.x.

- [ ] **Task 5 — Create `src/version.ts` (AC: line 850)**
  - [ ] 5.1 NEW one-line foundational module exporting `export const STEPPER_VERSION = "0.1.0";` plus a JSDoc tying it to FR4 + Story 3.8 + Story 6.10. Zero imports per AR41.
  - [ ] 5.2 v0.1.0 matches marketplace pre-release per Story 6.10. Forward-compat: Story 6.10 may auto-derive from `package.json` via a build-time generator; v0.1 ships the constant.

- [ ] **Task 6 — Replace the Story 2.4 placeholder short-circuits in `src/commands/next/run.ts` (AC: line 845-851)**
  - [ ] 6.1 Identify the insertion sites at `src/commands/next/run.ts:1402-1424`. The replacement REUSES the existing route order (`--export-state → --diff-state → --explain → --list → --dry-run`); REPLACES the Story 2.4 `reportWithMessage(<placeholder>)` calls with calls into the new helpers.
  - [ ] 6.2 `--export-state` short-circuit: builds the DAG (for the `currentPhase` lookup), calls `exportState({ statePath, projectRoot, dagNodePhase: (name) => dag.nodes.get(name)?.phase ?? null })`, serialises via `JSON.stringify(exported)`, returns `{ exitCode: 0, action: { action: "report", message: jsonBody, exitCode: 0 } }`. The `message` carries the JSON body; tests inspect `result.action.message` and parse it.
  - [ ] 6.3 `--diff-state` short-circuit: calls `diffState({ statePath, projectRoot, bmadVersion })`; returns `reportWithMessage(report.humanReadable)`. Standard AR9 path; multi-line message inside the `report.message` field. Mirrors `--list` per Story 3.7 + `--explain` per Story 3.6.
  - [ ] 6.4 `import.meta.main` block special-case for `--export-state`: AFTER `runNext()` returns, check whether `args.exportState === true` (or scan `process.argv` for `--export-state`); if so, emit `process.stdout.write(\`${result.action.message}\n\`)` directly INSTEAD OF `emitDispatchAction(result.action)`. The JSON body goes to stdout BYPASSING the AR9 wrapper per FR54 + architecture §line 524 + §line 862. v0.1 conservative: argv-scan helper `wasExportState(argv): boolean` lives inline in the `import.meta.main` block.
  - [ ] 6.5 AR9 invariants: `--diff-state` preserves AR9 strictly (single JSON line wrapping multi-line `message`). `--export-state` SPECIAL CASE — bypasses AR9 wrapper at the process-emit level; the `runNext` return value still uses the `report` shape for testability.
  - [ ] 6.6 Read-only / lock-free posture: BOTH branches use `loadStateUnlocked` (exportState calls it directly; diffState calls it + `recomputeStateUnlocked`). ZERO state writes; ZERO lock acquisition. AR8 / AR41 boundary preserved.
  - [ ] 6.7 Route-order precedence: `--export-state + --diff-state` → export wins (route order). `--export-state + {explain|list|dry-run}` → export wins. `--diff-state + {explain|list|dry-run}` → diff wins. `--export-state + --doctor` → `--doctor` wins (it fires earlier at `run.ts:1380-1396`). Tests verify all combos (Task 10).

- [ ] **Task 7 — Diff report human-readable formatter (AC: line 847)**
  - [ ] 7.1 The AC line 847 verbatim example is: `lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2`. Format components: field name + `: ` + `cached=<rendered>` + `; ` + `recomputed=<rendered>`.
  - [ ] 7.2 Design decision — 2-space leading indent on each divergence line: AC line 847 example shows NO leading whitespace, BUT v0.1 conservative chooses 2-space indent for visual consistency with Story 3.7's `--list` multi-line bullet style. The header `state.yaml diverges from files of truth:` is at column 0; per-divergence lines indent by 2. Tracked as Open Question 1 for code review (AC-strict alternative would emit at column 0).
  - [ ] 7.3 Per-field rendering: `lastSuccessfulStep` → `<step> epic <n> story <x.y>` (or literal `"null"`). `project.name` / `project.bmadVersion` → string verbatim. `runHistory.length` → number stringified.
  - [ ] 7.4 Empty-divergence: `state.yaml is in sync with files of truth (no divergence detected)`. Distinct from `--explain`'s all-done; `--diff-state` is per-state per-files audit.
  - [ ] 7.5 `\n`-joined multi-line wrapping: single string carried inside the AR9 `report` action's `message` field. Mirrors Story 3.7 bullet-list pattern.

- [ ] **Task 8 — Tests for both modules (~10-15 cases) (AC: line 845-851)**
  - [ ] 8.1 Create `src/state/diff.test.ts` with ~6-8 cases:
    - **Test A (cached equals recomputed → empty divergence)**: seed a `state.yaml` whose `lastSuccessfulStep` matches the most-recent artifact under `_bmad-output/{planning,implementation}-artifacts/*.md` (project.name + project.bmadVersion match); invoke `diffState`; assert `report.divergences.length === 0`; assert `report.humanReadable === "state.yaml is in sync with files of truth (no divergence detected)"`.
    - **Test B (single-field divergence — `lastSuccessfulStep`)**: seed a `state.yaml` whose `lastSuccessfulStep.step` differs from the most-recent artifact's step name; invoke `diffState`; assert `report.divergences.length === 1`; assert `report.divergences[0].field === "lastSuccessfulStep"`; assert `report.humanReadable.includes("cached=")` AND `.includes("recomputed=")`.
    - **Test C (multi-field divergence — `lastSuccessfulStep` + `project.name`)**: seed a `state.yaml` whose `project.name` differs from `path.basename(projectRoot)` AND `lastSuccessfulStep` differs; invoke `diffState`; assert `report.divergences.length === 2`; assert the human-readable contains TWO lines, each with the expected field name.
    - **Test D (`bmadVersion` divergence)**: seed `state.yaml` with `project.bmadVersion: "6.5.0"`; invoke `diffState` with `opts.bmadVersion: "6.4.0"`; assert `report.divergences[0].field === "project.bmadVersion"`.
    - **Test E (verbatim AC-line-847 example format)**: seed a state with `lastSuccessfulStep: { step: "dev-story", epic: 3, story: "3.2", ... }`; force the recomputed shape to `lastSuccessfulStep: { step: "code-review", epic: 3, story: "3.2", ... }` (e.g., by writing fixture artifacts whose `last_updated` ordering yields `code-review`); invoke `diffState`; assert `report.humanReadable.includes("lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2")` (byte-identical to the AC line 847 example modulo the 2-space indent per Task 7.2).
    - **Test F (empty state → no divergence when artifact-scan also empty)**: seed an empty `state.yaml` (no `lastSuccessfulStep`); ensure `_bmad-output/{planning,implementation}-artifacts/` are empty; invoke `diffState`; assert `report.divergences.length === 0` (both sides have `lastSuccessfulStep: null`; project.name + bmadVersion match the test fixture).
    - **Test G (no-lock invariant)**: spy on `acquire()` (or use a test helper that sets `LOCK_DIR_REL` to a tmpdir); invoke `diffState`; assert `acquire` was NEVER called.
    - **Test H (run.ts route — `--diff-state` short-circuit)**: this lives in `run.test.ts` per Task 10; verifies the runner correctly invokes `diffState` and emits the `report` action.
  - [ ] 8.2 Create `src/state/export.test.ts` with ~4-6 cases:
    - **Test A (state has `lastSuccessfulStep` → all 7 fields populated)**: seed `state.yaml` with `lastSuccessfulStep: { step: "bmad-create-prd", epic: 1, story: "1.5", ... }` + `lastAttempted` + `lastFailureReason`; invoke `exportState`; assert all 7 fields present; assert `activeEpic === 1`; assert `lastSuccessfulStep` matches the seeded value.
    - **Test B (state has only `lastAttempted` → `activeEpic` from lastAttempted)**: seed state with `lastSuccessfulStep: null` + `lastAttempted: { ..., epic: 2 }`; invoke `exportState`; assert `activeEpic === 2`.
    - **Test C (empty state → most fields null)**: seed minimal state (no `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`); invoke `exportState`; assert `currentPhase === null`, `activeEpic === null`, `lastSuccessfulStep === null`, `lastAttempted === null`, `lastFailureReason === null`; `bmadVersion` + `stepperVersion` populated.
    - **Test D (Zod parse passes for the constructed shape)**: seed valid state; invoke `exportState`; assert no Zod throw; assert the returned value passes `StateExportV1Schema.safeParse()` with `success: true`.
    - **Test E (`bmadVersion: "unknown"` preserved verbatim)**: seed state with `project.bmadVersion: "unknown"`; invoke `exportState`; assert `result.bmadVersion === "unknown"`.
    - **Test F (`stepperVersion` matches constant)**: invoke `exportState`; assert `result.stepperVersion === STEPPER_VERSION`.
    - **Test G (no-lock invariant)**: spy on `acquire()`; invoke `exportState`; assert `acquire` was NEVER called.
  - [ ] 8.3 Create `src/schemas/state-export.test.ts` with ~2-3 cases:
    - **Test A (valid shape passes parse)**: construct a valid `StateExportV1` object; `StateExportV1Schema.parse()` succeeds.
    - **Test B (missing `schemaVersion` rejects)**: omit `schemaVersion`; parse throws.
    - **Test C (round-trip JSON.stringify → JSON.parse → schema.parse)**: serialise via `JSON.stringify`; parse the string back; run schema parse; assert success + value byte-equality.
  - [ ] 8.4 Each test follows AR35 tmpdir-per-test discipline: reuses a colocated `beforeEach`/`afterEach` factory + `commonOpts`/`writeMinimalState` factories where applicable.

- [ ] **Task 9 — Integration test for `--export-state | jq` no-lock (AC: line 852)**
  - [ ] 9.1 Create `src/integration/export-state-no-lock.test.ts` (modelled on Story 3.3's `dry-run-no-writes.test.ts` + Story 2.8's smoke pattern). `beforeEach` mkdtemp + seed a valid `state.yaml` with a populated `lastSuccessfulStep`. `afterEach` rm. Single test: spawn `bun run src/commands/next/run.ts -- --export-state`; capture stdout; `JSON.parse(stdout.trim())`; run `StateExportV1Schema.parse(parsed)` for defence-in-depth; assert exit code 0; assert all 7 fields present (`schemaVersion === 1`, `currentPhase`, `activeEpic`, `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`, `bmadVersion`, `stepperVersion`).
  - [ ] 9.2 AC-line-852 enforcement: the test parses `stdout` as JSON DIRECTLY (no `jq` subprocess); the in-process parse is functionally equivalent to `--export-state | jq '.currentPhase'` — both yield the same shape; the test asserts `currentPhase` is a property of the parsed object. Avoids `jq` runtime dependency.
  - [ ] 9.3 FR52 invariant: assert no lock dir at `tmp/_bmad-output/.stepper/state.yaml.lock`. The `--export-state` path is lock-free; the integration test enforces structurally.
  - [ ] 9.4 FR54 invariant: assert `parsed` does NOT have an `action` property. The JSON body is the export shape; the AR9 wrapper is BYPASSED per the `import.meta.main` special-case (Task 6.4).
  - [ ] 9.5 Forward-defer to Story 3.10: the concurrent-active-lock test (where one process holds the lock and another runs `--export-state` simultaneously) is a Story 3.10 deliverable. Story 3.8's integration test asserts the v0.1 read-only contract structurally only.

- [ ] **Task 10 — Run.ts colocated tests (AC: line 845-851)**
  - [ ] 10.1 Edit `src/commands/next/run.test.ts` to APPEND a new `describe` block: `"runNext — Story 3.8 --diff-state and --export-state"`. Reuse module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.
  - [ ] 10.2 **Test case A (`--diff-state` returns `report` action with human-readable message)** — seed valid state; invoke `runNext` with `argv: ["--diff-state"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "report"`, (c) `result.action.message` starts with either `"state.yaml is in sync"` OR `"state.yaml diverges from files of truth:"`.
  - [ ] 10.3 **Test case B (`--export-state` returns `report` action with JSON body)** — seed valid state; invoke `runNext` with `argv: ["--export-state"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "report"`, (c) `JSON.parse(result.action.message)` succeeds + passes `StateExportV1Schema.safeParse` with `success: true`.
  - [ ] 10.4 **Test case C (route order — `--export-state + --diff-state` → export wins)** — invoke with `argv: ["--export-state", "--diff-state"]`; assert `result.action.message` is the JSON body (NOT the human-readable diff report); `JSON.parse(result.action.message)` succeeds.
  - [ ] 10.5 **Test case D (route order — `--diff-state + --explain` → diff wins)** — invoke with `argv: ["--diff-state", "--explain"]`; assert `result.action.message` starts with `"state.yaml is in sync"` or `"state.yaml diverges"` (NOT the explain trace `"Next step:"`).
  - [ ] 10.6 **Test case E (route order — `--export-state + --doctor` → doctor wins)** — invoke with `argv: ["--export-state", "--doctor"]`; assert `result.action.message` is the doctor diagnostic (NOT the JSON export); the `--doctor` short-circuit at `run.ts:1380-1396` fires FIRST.
  - [ ] 10.7 **Test case F (no-lock invariant)** — spy on `acquire`; invoke with `argv: ["--export-state"]` AND with `argv: ["--diff-state"]`; assert `acquire` was NEVER called for either invocation.

- [ ] **Task 11 — Update sprint-status.yaml + record completion (AC: all)**
  - [ ] 11.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-8-diff-state-and-export-state` from `backlog` (current) to `ready-for-dev` (this Story 3.8 create-story step). At story completion (Step 9 of bmad-dev-story workflow), flip to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved.
  - [ ] 11.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [ ] 11.3 sprint-status.yaml retains its original schema (no new fields).

- [ ] **Task 12 — Run the full test suite + `bun run check` (AC: all)**
  - [ ] 12.1 `bun run check` exit 0. Test delta projection: ~+15-20 tests (Tests A-G in `diff.test.ts` + A-G in `export.test.ts` + A-C in `state-export.test.ts` + A-F in `run.test.ts` + 1 integration test), ~+50-80 expects.
  - [ ] 12.2 Post-Story-3.8 baseline projection: ~677-682 pass / 0 fail / ~2510-2540 expects / 53 files (4 new test files: `diff.test.ts`, `export.test.ts`, `state-export.test.ts`, `export-state-no-lock.test.ts`).
  - [ ] 12.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.8 ships ZERO new error classes.
  - [ ] 12.4 Confirm `bunx tsc --noEmit` exits 0.
  - [ ] 12.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes — Story 3.8 adds the imports `diffState` + `exportState` from `../../state/diff.ts` + `../../state/export.ts` (mid-tier siblings; allowed per AR41); the boundary check passes after a targeted update.

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~1896 → ~1930-1950 lines): replaces the placeholder short-circuits at lines 1402-1424 (the `--export-state` and `--diff-state` placeholders from Story 2.4) with calls into the new `diffState(...)` and `exportState(...)` helpers per Task 6. Adds 2 new top-of-file imports: `import { diffState } from "../../state/diff.ts";` and `import { exportState } from "../../state/export.ts";` (mid-tier sibling imports; allowed per AR41). Adds the `import.meta.main` block special-case for `--export-state` (~10 lines) per Task 6.3.
- **`src/state/recompute.ts`** (~222 → ~260 lines): adds the new `recomputeStateUnlocked(opts?)` export per Task 4. Re-uses the existing `scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`, `ARTIFACT_GLOBS`, `FRONTMATTER_OPEN` internal helpers; skips the `acquire(...)` + `saveState(...)` calls.
- **`src/commands/next/run.test.ts`** (~3300 → ~3400-3450 lines): APPENDS a new `describe("runNext — Story 3.8 --diff-state and --export-state", ...)` block with 6 colocated test cases per Task 10. May UPDATE the AR41 boundary check at lines 606-638 to enumerate the new mid-tier imports (`../../state/diff.ts` + `../../state/export.ts`).

#### New Files

- **`src/state/diff.ts`** (~150 lines): the `diffState({ ... }): Promise<DiffReport>` helper per Task 1. Mid-tier module per AR41. Composes `loadStateUnlocked + recomputeStateUnlocked + computeDivergences + formatHumanReadable`. Pure / async; no I/O writes; lock-free.
- **`src/state/diff.test.ts`** (~250 lines): 6-8 colocated test cases per Task 8.1.
- **`src/state/export.ts`** (~80 lines): the `exportState({ ... }): Promise<StateExportV1>` helper per Task 2. Mid-tier module per AR41. Composes `loadStateUnlocked + StateExportV1Schema.parse`. Pure / async; no I/O writes; lock-free.
- **`src/state/export.test.ts`** (~150 lines): 4-6 colocated test cases per Task 8.2.
- **`src/schemas/state-export.ts`** (~50 lines): `StateExportV1Schema` Zod schema per Task 3. Foundational module per AR41.
- **`src/schemas/state-export.test.ts`** (~50 lines): 2-3 colocated test cases per Task 8.3.
- **`src/version.ts`** (~3 lines): `STEPPER_VERSION` constant per Task 5. Foundational module per AR41.
- **`src/integration/export-state-no-lock.test.ts`** (~100 lines): the AC-line-852 enforcement test per Task 9.

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-8-diff-state-and-export-state: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (already set by Story 3.1).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Both new helpers are lock-free; `run.ts` is unchanged in lock posture; `verify-and-advance.ts` is never invoked on these paths.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED with a SPECIAL CASE for `--export-state`. The `--diff-state` path emits the standard AR9 `report` line. The `--export-state` path emits the JSON body DIRECTLY on stdout (NOT wrapped in AR9) per FR54 + architecture §line 524 + §line 862. Documented in `run.ts` JSDoc + `src/state/export.ts` JSDoc.
- **AR11** (`state.yaml` at `_bmad-output/.stepper/state.yaml`; `STATE_PATH` constant): UNCHANGED. Both helpers read via `loadStateUnlocked({ statePath })` — same canonical path discipline as Story 1.6.
- **AR20** (Schemas + migrations apply to state, config, run-log, telemetry): EXTENDED with state-export. `StateExportV1Schema` follows the same `<Family>V1Schema` + `<Family>LatestSchema` + `<Family>` type-alias-chain pattern as `src/schemas/state.ts`. v2 migration is a Story 6.x concern.
- **AR21** (errors carry code): UNCHANGED. ZERO new throws. Existing throws (`CorruptStateError`, `PathologicalInputError`, etc.) flow through `haltFromError` per Story 2.4.
- **AR22** (errors carry actionable hint): UNCHANGED. The empty-divergence message + the in-sync message are STATIC strings, not error hints.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): EXTENDED. Both new helpers are async; throw not Result; no console.*. The `--export-state` stdout emission uses `process.stdout.write` (the canonical stdout primitive per architecture §line 862 + §line 524).
- **AR41** (boundary graph): UNCHANGED + EXTENDED. The new `src/state/diff.ts` is mid-tier; imports `loadStateUnlocked` + `recomputeStateUnlocked` (mid-tier siblings) + `StateExportV1Schema` (foundational sibling). The new `src/state/export.ts` is mid-tier; imports `loadStateUnlocked` + `StateExportV1Schema` + `STEPPER_VERSION`. The new `src/schemas/state-export.ts` is foundational; imports zod + `./state.ts` (foundational sibling). The new `src/version.ts` is foundational; imports nothing. The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass (with the targeted update enumerating the new mid-tier imports).
- **AR42** (test discipline): EXTENDED. New unit tests in `src/state/diff.test.ts` + `src/state/export.test.ts` + `src/schemas/state-export.test.ts`. Each test file has its colocated `*.test.ts` per AR42.

### Acceptance Criteria Mapping

- **AC line 845-847** (`--diff-state` invokes `src/state/diff.ts` → loads `state.yaml`, runs `recomputeState()`, computes diff, emits human-readable divergence report): delivered by **Tasks 1 + 4 + 6 + 7**. Test cases A-E in `diff.test.ts` (Task 8.1) + Test case A in `run.test.ts` (Task 10.2) verify each component.
- **AC line 848-850** (`--export-state` invokes `src/state/export.ts` → emits valid JSON to stdout containing 7 named fields, schema-versioned via Zod): delivered by **Tasks 2 + 3 + 5 + 6**. Test cases A-F in `export.test.ts` (Task 8.2) + Test case B in `run.test.ts` (Task 10.3) + the integration test (Task 9) verify each component.
- **AC line 851** (running these flags does NOT acquire the project lock — FR52): delivered structurally by **Task 6.6** (both helpers use `loadStateUnlocked` exclusively; `run.ts` is lock-free per architecture §line 1672 + AR8). Test cases G in `diff.test.ts` + G in `export.test.ts` (Task 8.1.G + 8.2.G) + Test F in `run.test.ts` (Task 10.7) verify via `acquire` spy. The integration test (Task 9.3) asserts no lock files left behind.
- **AC line 852** (integration test asserts `--export-state | jq '.currentPhase'` works without the lock): delivered by **Task 9** — the integration test parses `stdout` as JSON directly (functionally equivalent to `--export-state | jq '.currentPhase'`); asserts `currentPhase` property exists; asserts no lock files written.

### v0.1 Design Decisions

#### TWO new modules (`diff.ts` + `export.ts`) vs single combined module

The architecture line 1130-1131 lists `src/state/diff.ts` and `src/state/export.ts` as SEPARATE files. Story 3.8 ships TWO modules per the architectural prescription. **Rationale**: the diff path needs the unlocked recompute (`recomputeStateUnlocked`); the export path does NOT. The export path needs the schema-versioned Zod parse; the diff path does NOT. Different dependency graphs; different return types (`DiffReport` vs `StateExportV1`); different output formats (multi-line human-readable vs single-line JSON). v0.1 keeps them separate per AR41 + the architectural prescription.

#### `recomputeStateUnlocked` as a NEW exported sibling vs extending `recomputeState` with `skipAcquire?`

The existing `recomputeState` at `src/state/recompute.ts:193-221` acquires the lock + saves to disk. Story 3.8 needs a lock-free + no-save variant for the diff path. Two options:
- **Option A**: extend `recomputeState` with `skipAcquire?: boolean` + `skipSave?: boolean` flags.
- **Option B**: introduce a new exported `recomputeStateUnlocked(opts?)` sibling that re-uses the internal helpers.

**v0.1 conservative chooses Option B** — cleaner separation; the locked variant stays the canonical write-side helper for Story 6.x's `--recompute-state` flag; the unlocked variant is the read-only-path entry point. **Trade-off**: Option A is fewer lines (~5 lines added to `recomputeState`) but couples the read + write code paths; Option B is ~30 lines added (the new export) but keeps the surfaces orthogonal. v0.1 chooses Option B for AR33 + AR41 fidelity.

#### `--export-state` SPECIAL CASE bypassing the AR9 wrapper

Per FR54 + architecture §line 524 + §line 862, the `--export-state` JSON output goes to stdout DIRECTLY (NOT wrapped in the AR9 line). Per AC line 852, the user's workflow is `--export-state | jq '.currentPhase'` — a single-step `jq` extraction implies the body is the JSON, not the AR9 wrapper. The `import.meta.main` block at the bottom of `run.ts` SPECIAL-CASES `--export-state` and emits the JSON body directly via `process.stdout.write`. **Rationale**: the FR54 contract is explicit; the AC line 852 wording is explicit; the alternative (AR9-strict, requiring users to `jq -r '.message' | jq '.currentPhase'`) is friction. v0.1 chooses the FR54-friendly emission. Tracked as Open Question 2 for code review.

The `runNext` function STILL returns `{ action: "report", message: <JSON-body>, exitCode: 0 }` for testability (tests inspect `result.action.message`); only the process-level emit is special-cased.

#### `currentPhase` derivation requires DAG lookup

The export shape's `currentPhase` field is the DAG-node phase of `state.lastSuccessfulStep.step`. The lookup requires the DAG (built via `dag.build(...)`). Two options:
- **Option A**: `exportState` requires a `dag` parameter; the runner builds the DAG and passes it in.
- **Option B**: `exportState` accepts a `dagNodePhase: (name) => Phase | null` callback; the runner constructs the callback inline.

**v0.1 conservative chooses Option B** — keeps the `exportState` helper free of DAG dependency (foundational-tier purity); the callback indirection allows the runner to wire the DAG without coupling. The callback approach is forward-compatible with Story 6.x's richer phase-detection (e.g., `(name) => richPhaseRegistry.lookup(name)`).

If the runner does NOT pass `dagNodePhase`, `currentPhase` defaults to `null` (graceful degradation for test fixtures + edge cases).

#### `activeEpic` precedence chain: `lastSuccessfulStep > lastAttempted > null`

The "active" epic per the PRD Journey 5 wording is the most recent dispatch attempt OR completion. Three sources:
- `state.lastSuccessfulStep?.epic` — the last completed step's epic.
- `state.lastAttempted?.epic` — the last dispatched (in-flight or failed) step's epic.
- `null` — no successful + no attempted = no active epic.

**v0.1 conservative**: `lastSuccessfulStep > lastAttempted > null`. The "successful" takes precedence over "attempted" because `lastSuccessfulStep.completedAt` is always >= `lastAttempted.attemptedAt` (the runner clears `lastAttempted` on success per Story 3.1). **Trade-off**: when the runner halts mid-step, `lastAttempted` is the active epic (the user's mental model); when no halt is in flight, `lastSuccessfulStep` is the active epic. v0.1 chooses the precedence that surfaces the most-recent-attempt epic on halt; surfaces the most-recent-completion otherwise.

#### `bmadVersion: "unknown"` preserved verbatim

Per the FR4 contract ("export the current state"), `bmadVersion` is sourced from `state.project.bmadVersion`. If the cached state has `"unknown"` (Story 1.6's default), the export emits `"unknown"`. CI scripts can detect + surface a "BMAD version not yet resolved" warning. v0.1 conservative does NOT translate `"unknown"` → `null`; preserves the on-disk value.

#### `stepperVersion` from `src/version.ts` constant

A NEW one-line file `src/version.ts` exports `STEPPER_VERSION = "0.1.0"`. The export shape's `stepperVersion` field reads this constant. **Rationale**: deterministic for tests (no `package.json` runtime read); single source of truth for the version bump. Forward-compatible with Story 6.10 marketplace release (auto-derive from `package.json` via build-time generator).

#### Diff report v0.1 conservative scope: 4 fields

The diff helper compares 4 fields: `lastSuccessfulStep`, `project.name`, `project.bmadVersion`, `runHistory.length`. Fields NOT compared: `lastAttempted`, `lastFailureReason`, `lastSnapshot`, `checkpoints`, `schemaVersion`. **Rationale**: `lastAttempted` + `lastFailureReason` + `lastSnapshot` + `checkpoints` are write-side state set by the runner — never recomputed from artifact frontmatter; comparing would always show divergence. `schemaVersion` is always 1 in v0.1; the migration registry guarantees. `runHistory` element-by-element diff is a Story 6.x telemetry-driven enhancement; v0.1 ships count-only.

#### Diff line indent: 2-space leading

Per Task 7.2 design decision, each divergence line in the multi-line message is indented by 2 spaces (e.g., `  lastSuccessfulStep: cached=...; recomputed=...`). The header `state.yaml diverges from files of truth:` is at column 0. **Rationale**: visual consistency with Story 3.7's `--list` bullet style. The AC line 847 verbatim example does NOT show a leading indent; v0.1 chooses CONSISTENCY with Story 3.7. Tracked as Open Question 1 for code review.

#### Empty-divergence message: `state.yaml is in sync with files of truth (no divergence detected)`

Hardcoded; v0.1 conservative. Distinct from `--explain`'s all-done message; `--diff-state` is per-state per-files audit. Story 6.x may wire via `bmad-stepper.config.yaml messages.diffEmptyHint`.

### Carry-overs from Story 3.7

- **Story 3.7's `report` action multi-line `message` pattern**: REUSED. The `--diff-state` short-circuit emits a multi-line `\n`-joined `message`. Mirrors Story 3.7's bullet-list pattern.
- **Story 3.7's lock-free `--list` short-circuit**: PRESERVED. Story 3.8's two new short-circuits inherit the same lock-free posture.
- **Story 3.7's deterministic sort discipline**: NOT INHERITED. The diff comparison is field-by-field (no sort); the export shape is a single object (no sort).

### Carry-overs from Story 3.6

- **Story 3.6's `formatExplainMessage` multi-line composition**: STRUCTURAL TEMPLATE for `formatHumanReadable` in `src/state/diff.ts`. Same multi-line `\n`-joined message pattern.
- **Story 3.6's read-only / lock-free posture**: PRESERVED. Story 3.8's helpers inherit.

### Carry-overs from Story 3.3

- **Story 3.3's read-only / lock-free posture**: RESPECTED. Story 3.8's helpers are pure reads; no state writes; no lock acquisition. Same architectural posture.
- **Story 3.3's `dry-run-no-writes.test.ts` pattern**: REUSED. Story 3.8's `export-state-no-lock.test.ts` mirrors the spawn + parse + assert structure.

### Carry-overs from Story 1.6

- **Story 1.6's `recomputeState` skeleton**: EXTENDED with the `recomputeStateUnlocked` sibling. The existing locked variant stays UNCHANGED; the new unlocked variant re-uses the internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`, `ARTIFACT_GLOBS`, `FRONTMATTER_OPEN`).
- **Story 1.6's minimum-viable artifact-frontmatter scan**: PRESERVED. v0.1 conservative; Story 6.x replaces with full DAG-aware traversal.

### Carry-overs from Story 1.5

- **Story 1.5's `LastAttemptedSchema` + `LastFailureReasonSchema`**: REUSED in `src/schemas/state-export.ts` (foundational sibling import; allowed per AR41).
- **Story 1.5's `StateV1Schema.shape.lastSuccessfulStep`**: REUSED. Same nullable + optional wrapping; wire-shape consistent.

### Carry-overs from Story 1.7

- **Story 1.7's `exportState: z.boolean().default(false)` + `diffState: z.boolean().default(false)`**: REUSED. **No args change needed for Story 3.8.**

### Carry-overs from Story 2.4

- **Story 2.4's placeholder `--export-state` + `--diff-state` short-circuits**: REPLACED. Story 3.8 swaps in the new helper invocations.
- **Story 2.4's read-only-flag route order** (`--export-state → --diff-state → --explain → --list → --dry-run`): PRESERVED.

### Carry-overs from Epic 2 Retrospective

- **Epic 2 Retrospective §Forward Action Items**: Story 3.8 is the 8th story of Epic 3, between Story 3.7 (`--list`) and Story 3.9 (`--watch`). The recommended sequence is preserved.

### Forward Dependencies

- **Story 3.9 (`--watch`)**: INDEPENDENT. `--watch` tails the run-log; `--diff-state` + `--export-state` read state once.
- **Story 3.10 (`--non-locking-read-flags`)**: PRIMARY DOWNSTREAM. Story 3.10's `skipAcquire: boolean` flag wiring on `src/io/lock.ts` includes `--export-state` + `--diff-state` in the cluster. v0.1 (Story 3.8) ships the helpers structurally lock-free; Story 3.10 wires the explicit lock-skipping for cases where the read-only flags ever route through a lock-acquiring path. **Story 3.10 also wires the concurrent-active-lock integration test** (where one process holds the lock and another runs `--export-state` simultaneously); Story 3.8's integration test asserts only the v0.1 read-only contract structurally.
- **Story 4.1 (`/bmad-loop` Command Skeleton)**: SECONDARY CONSUMER. The loop runner may invoke `runNext --diff-state` per iteration to detect drift; Story 4.1 may add a `--diff-each` flag.
- **Story 5.1 (Retry Failure Mode)**: INDEPENDENT. Retry path is in `verify-and-advance.ts`; diff/export are in `run.ts`.
- **Story 6.x (`state.completedSteps[]` schema extension)**: SECONDARY ARCHITECTURAL EXTENSION. The richer diff (per-completed-step set membership) depends on the schema landing. The diff helper's field list grows from 4 → ~7-10 fields.
- **Story 6.x (full DAG-aware recompute)**: SECONDARY ARCHITECTURAL EXTENSION. Replaces both `recomputeState` and `recomputeStateUnlocked` with a unified DAG-aware traversal; the function signatures stay the same; the implementation evolves.
- **Story 6.x (per-step DAG epic/story attribution)**: SECONDARY EXTENSION. The export shape's `activeEpic` field becomes a true DAG-node-attribution field when Story 6.x extends the DAG node shape.
- **Story 6.10 (Marketplace Release)**: SECONDARY. `STEPPER_VERSION` constant in `src/version.ts` is the single source of truth; Story 6.10 may auto-derive from `package.json` via a build-time generator.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `StateV1Schema` + `LastAttemptedSchema` + `LastFailureReasonSchema`. Story 3.8 reuses all three in `src/schemas/state-export.ts`.
- **Story 1.6 (State Subsystem Skeleton)** — declared `recomputeState`. Story 3.8 ADDS `recomputeStateUnlocked` reusing the internal helpers.
- **Story 1.7 (CLI Argument Parser)** — declared `exportState` + `diffState` on `NextArgsSchema`. Story 3.8 inherits both verbatim.
- **Story 2.4 (`run.ts` lock-free runner)** — established the placeholder short-circuits for `--export-state` + `--diff-state`. Story 3.8 REPLACES both.
- **Story 3.1 (Record `last_attempted` / `last_failure_reason` on Halt)** — extracted `LastAttemptedSchema` + `LastFailureReasonSchema` as named exports. Story 3.8 reuses.
- **Story 3.3 (`--dry-run` Flag)** — established read-only / lock-free posture for diagnostic flags + the integration-test `dry-run-no-writes.test.ts` spawn pattern. Story 3.8 inherits both.
- **Story 3.6 (`--explain` Reasoning Trace)** — established the multi-line `\n`-joined `message` pattern. Story 3.8's `formatHumanReadable` follows.
- **Story 3.7 (`--list` Candidate Next Steps)** — established the bullet-style multi-line message + the lock-free `--list` short-circuit. Story 3.8 mirrors for `--diff-state`.

Story 3.8 does NOT consume from:

- Stories 1.1-1.4, 1.8-1.13 (repo scaffold, errors module, logger, lock, branch detection, BMAD detection, persona resolution, doctor, quick-start docs) — independent prerequisites.
- Stories 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8 (verifier registry, dispatch-spec generator, sub-agent markdown, transcript writers, verify-and-advance, Layer 1 markdown, smoke test) — Story 3.8 doesn't touch these surfaces.
- Story 3.2 (`--resume` Flag) — `--diff-state` + `--export-state` are read-only short-circuits BEFORE the resume substitution.
- Story 3.4 (`--step` and Scope Flags) — scope filters are not applied to read-only state inspection (Story 6.x revisits).
- Story 3.5 (`--persona` Override) — persona resolution is a dispatch-path concern; not invoked here.

### Open Questions for Code Review

1. **Should the diff line indent be 2 spaces (consistency with `--list`) or zero (verbatim AC line 847 example)?** v0.1 conservative chooses 2-space indent for visual consistency with Story 3.7's `--list` bullet style. The AC line 847 verbatim example does NOT show a leading indent; AC-strict v0.1 would emit at column 0. **Trade-off**: AC-strict matches the example byte-identical; consistency-strict matches the surrounding multi-line message style. v0.1 chooses consistency; if the code reviewer flags AC-strict, the change is one Edit.

2. **Should `--export-state` bypass the AR9 wrapper (FR54-friendly) or preserve AR9 strictly (AC-strict)?** v0.1 chooses bypass per FR54 + architecture §line 524 + line 862 + AC line 852 wording (`--export-state | jq '.currentPhase'` implies single-step `jq` extraction). The AR9 invariant is preserved for ALL OTHER flags (including `--diff-state`); `--export-state` is the documented SPECIAL CASE. **Trade-off**: bypass = better UX, requires `import.meta.main` special-case (~10 lines); strict-AR9 = uniform but forces `jq -r '.message' | jq` 2-step pipeline. v0.1 chooses bypass; documented in `run.ts` JSDoc.

3. **Should the diff helper compare more fields beyond the v0.1 4-field set?** v0.1 conservative compares 4 fields (`lastSuccessfulStep`, `project.name`, `project.bmadVersion`, `runHistory.length`). Adding `lastAttempted` / `lastFailureReason` / `lastSnapshot` / `checkpoints` would surface NOISE divergences (these fields are write-side state never recomputed from artifact frontmatter; they would always show divergence). v0.1 chooses NOISE-FREE; Story 6.x's richer recompute may unlock more fields.

4. **Should `recomputeStateUnlocked` be a NEW export or a `skipAcquire` flag on `recomputeState`?** v0.1 chooses NEW export per AR33 + AR41 separation-of-concerns. **Trade-off**: NEW export = ~30 lines added, clean surface; `skipAcquire` = ~5 lines added, coupled surfaces. v0.1 chooses clean.

5. **Should the export shape's `currentPhase` require a DAG lookup callback or accept the DAG directly?** v0.1 conservative chooses the callback (`dagNodePhase: (name) => Phase | null`) per architectural-purity. **Trade-off**: callback = decoupled, more verbose at call site; direct DAG = coupled, simpler at call site. v0.1 chooses decoupled.

6. **Should the integration test spawn `--export-state | jq '.currentPhase'` literally (via `bash -c "... | jq ..."`) or parse stdout in-process?** v0.1 chooses in-process `JSON.parse(stdout)` for portability (no `jq` dependency); the in-process parse is functionally equivalent. **Trade-off**: literal `jq` test = closer to user workflow; in-process = portable. v0.1 chooses portable; if the code reviewer wants the literal `jq` test, a sibling test file can add it without churn.

7. **Should the export include `runHistory` or `checkpoints` arrays?** v0.1 conservative does NOT include them — the 7 AC-line-850 fields are the minimum-viable contract. CI scripts that need run-history data have access to per-step JSON run-logs at `_bmad-output/.stepper/runs/<ts>-<step>.json` per architecture §line 548. v0.1 chooses minimum-viable.

8. **Should the `bmadVersion: "unknown"` placeholder be translated to `null` in the export?** v0.1 conservative preserves verbatim per FR4 ("export the current state"). CI scripts detect the literal `"unknown"` string and surface a warning. **Trade-off**: preserve = faithful to on-disk state; translate = cleaner JSON shape. v0.1 chooses faithful.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-8-diff-state-and-export-state.md` (this file)
- `src/state/diff.ts` (NEW — diff helper)
- `src/state/export.ts` (NEW — export helper)
- `src/schemas/state-export.ts` (NEW — schema)
- `src/version.ts` (NEW — STEPPER_VERSION constant)
- `src/state/recompute.ts` (MODIFIED — add `recomputeStateUnlocked`)
- `src/commands/next/run.ts` (MODIFIED — replace placeholder short-circuits at lines 1402-1424; add `import.meta.main` special-case for `--export-state`)
- `src/commands/next/run.test.ts` (MODIFIED — append Story 3.8 describe block)
- `src/state/diff.test.ts` (NEW — 6-8 cases)
- `src/state/export.test.ts` (NEW — 4-6 cases)
- `src/schemas/state-export.test.ts` (NEW — 2-3 cases)
- `src/integration/export-state-no-lock.test.ts` (NEW — AC-line-852 enforcement)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.8 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- Bun host: 1.3.12 (AR2 satisfied — Bun >= 1.3).
- Pre-implementation baseline: 662 pass / 0 fail / 2456 expects / 49 files (Story 3.7 final).
- Post-implementation: 693 pass / 0 fail / 2574 expects / 53 files (Δ +31 tests / +118 expects / +4 new test files vs Story 3.7 baseline).
- ZERO repair iterations consumed: TypeScript / Biome / tests all passed cleanly on first invocation (one initial test fixture bug was discovered + fixed during the writeArtifact factory authoring — `Bun.YAML.stringify` produces inline `{}` syntax which `extractFrontmatter` rejects; the helper was rewritten to emit hand-rolled multi-line YAML between `---` delimiters BEFORE running the validators).

### Completion Notes List

- **Implementation lands cleanly inside the spec's allowed mutation surface.** Created TWO new core helper modules (`src/state/diff.ts` ~180 lines + `src/state/export.ts` ~115 lines), ONE new schema module (`src/schemas/state-export.ts` ~60 lines), ONE new tiny module (`src/version.ts` ~15 lines), ONE new exported sibling helper (`recomputeStateUnlocked` in `src/state/recompute.ts` +40 lines), and replaced TWO placeholder short-circuits in `src/commands/next/run.ts` (~50 lines net delta) plus added a new `wasExportStateRequested` argv-scan helper + `import.meta.main` SPECIAL-CASE branch (~30 lines). FOUR new test files (`diff.test.ts` ~280 lines, `export.test.ts` ~205 lines, `state-export.test.ts` ~120 lines, `export-state-no-lock.test.ts` ~150 lines) totalling ~755 lines + ~210 added lines to `run.test.ts`.
- **`--export-state` SPECIAL CASE bypassing AR9 wrapper per FR54 (Open Question 2 resolved):** the `import.meta.main` block scans `process.argv` for `--export-state`; when present AND the result is `action: "report"`, it emits `result.action.message` (the JSON body) DIRECTLY via `process.stdout.write(\`${message}\\n\`)` instead of `emitDispatchAction(...)`. This satisfies the AC-line-852 `--export-state | jq '.currentPhase'` single-step extraction workflow. Every OTHER flag (including `--diff-state`) preserves the AR9 wrapper strictly. The `runNext` function STILL returns `{ action: "report", message: <JSON-body>, exitCode: 0 }` for testability — colocated tests inspect `result.action.message` and `JSON.parse` it.
- **`recomputeStateUnlocked` introduced as NEW exported sibling (Open Question 4 resolved):** the v0.1 conservative choice is Option B per the spec — a separate `recomputeStateUnlocked` export that re-uses the internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`, `ARTIFACT_GLOBS`, `FRONTMATTER_OPEN`); identical body to `recomputeState` MINUS the `acquire(...)` call AND the `saveState(...)` call. The locked variant stays UNCHANGED for Story 6.x's `--recompute-state` flag.
- **Diff line indent: 2-space leading (Open Question 1 resolved):** chosen for visual consistency with Story 3.7's `--list` bullet style. The header `state.yaml diverges from files of truth:` is at column 0; per-divergence lines indent by 2. AC-strict variant (column 0) noted for code review feedback.
- **Diff helper compares 4 fields (Open Question 3 resolved):** `lastSuccessfulStep`, `project.name`, `project.bmadVersion`, `runHistory.length`. NOT compared: `lastAttempted`, `lastFailureReason`, `lastSnapshot`, `checkpoints`, `schemaVersion` — write-side state that's never recomputed from artifact frontmatter; comparing would always show divergence.
- **`currentPhase` derivation via callback (Open Question 5 resolved):** `exportState` accepts `dagNodePhase: (name) => Phase | null` callback; without a callback OR when the lookup returns `null`, `currentPhase = null`. The runner-side short-circuit at `run.ts:~1402` builds the DAG via `build({...})` and passes `(name) => dag.nodes.get(name)?.phase ?? null` inline. Forward-compatible with Story 6.x richer phase-detection.
- **Integration test parses stdout in-process (Open Question 6 resolved):** the new `src/integration/export-state-no-lock.test.ts` parses `JSON.parse(stdout.trim())` directly (functionally equivalent to `--export-state | jq '.currentPhase'`) — no `jq` runtime dependency, more portable. Asserts the 7 fields plus FR52 lock-free invariant + FR54 stdout-only-JSON invariant.
- **`bmadVersion: "unknown"` preserved verbatim (Open Question 8 resolved):** per FR4 wording "export the current state". CI scripts detect the literal `"unknown"` and surface a warning. Test E in `export.test.ts` asserts.
- **Export shape does NOT include `runHistory` / `checkpoints` arrays (Open Question 7 resolved):** the 7 AC-line-850 fields are the minimum-viable contract; CI scripts that need run-history have access to per-step JSON run-logs at `_bmad-output/.stepper/runs/<ts>-<step>.json`.
- **NO new error classes.** Registry CI gate stays at 16 codes. Story 3.8 ships ZERO throws of its own — both helpers' upstream throws (`CorruptStateError`, `PathologicalInputError`, etc. from `loadStateUnlocked`) are PRESERVED via the standard `haltFromError` translation.
- **NO state.yaml writes from `run.ts` or the new helpers.** Lock-free contract per architecture §line 1672 + AR8 preserved.
- **NO new error classes / NO `args.ts` change / NO Layer 1 markdown change / NO `verify-and-advance.ts` change / NO state schema bump / NO dispatch-protocol change.** Story 3.8 is purely additive.
- **AR41 boundary preserved.** `src/state/diff.ts` imports `loadStateUnlocked` + `recomputeStateUnlocked` (mid-tier siblings); `src/state/export.ts` imports `loadStateUnlocked` + `StateExportV1Schema` + `STEPPER_VERSION` (mid-tier sibling + foundational siblings); `src/schemas/state-export.ts` imports zod + `./state.ts` (foundational sibling); `src/version.ts` imports nothing. Both new helpers' colocated `*.test.ts` files contain Test G no-lock invariant assertions (programmatic source-content scan rejects `from "../lock/"`, `acquire(`, `loadState(`, `recomputeState(` patterns). The pre-existing colocated AR41 boundary check at `run.test.ts:606-638` continues to pass; the new mid-tier imports (`../../state/diff.ts`, `../../state/export.ts`) are explicitly allowed.
- **AR9 protocol preserved with documented SPECIAL CASE.** `--diff-state` emits the standard AR9 `report` line (`{ action: "report", message: <multi-line>, exitCode: 0 }`). `--export-state` SPECIAL-CASES the `import.meta.main` emit per FR54 + architecture §line 524 + §line 862 — the JSON body goes to stdout DIRECTLY. The `runNext` return still uses the `report` shape for testability.
- **2 pre-existing tests UPDATED** in `src/commands/next/run.test.ts` that asserted the Story 2.4 placeholder strings `"Story 3.8"` (for `--diff-state`) and `"Story 3.10"` (for `--export-state`). Both were updated to assert the Story 3.8 actual outputs (the in-sync/diverges message + the parseable JSON body).
- **0 repair iterations consumed.** All four validators (`bun test`, `bun run check`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`) passed exit 0 within the ≤3 budget. Biome `format --write` was invoked once to apply auto-formatting fixes (whitespace + line-wrapping); no logic changes.

### Test Counts (final)

- **bun run check**: exit 0.
- **Total**: 693 pass / 0 fail / 2574 expect() calls / 53 files.
- **Story 3.8 delta**: +31 tests / +118 expects / +4 new test files (vs. Story 3.7 final baseline of 662 / 2456 / 49 files).
- **diff.test.ts**: 8 pass / 16 expect() calls (Tests A-H).
- **export.test.ts**: 9 pass / 27 expect() calls (Tests A-I).
- **state-export.test.ts**: 5 pass / 18 expect() calls (Tests A, A.1, B, B.1, C).
- **export-state-no-lock.test.ts**: 2 pass / 19 expect() calls (happy-path + empty-state edge).
- **Run-tests suite** (`bun test src/commands/next/run.test.ts`): 130 pass / 482 expect() calls (123 pre-Story-3.8 + 7 new Story 3.8 + 2 updated pre-existing tests retained).
- **TypeScript** (`bunx --bun tsc --noEmit`): exit 0.
- **Biome ci** (`bunx --bun biome ci .`): exit 0 (123 files checked clean).

### File List

#### Modified Files

- `src/commands/next/run.ts` (1896 → ~1965, +~69 lines):
  - Added 2 mid-tier sibling imports: `import { diffState } from "../../state/diff.ts";` + `import { exportState } from "../../state/export.ts";`
  - Replaced the Story 2.4 placeholder `--export-state` short-circuit at run.ts:1402-1412 with a full implementation that builds the DAG (for `currentPhase` lookup), invokes `exportState({ statePath, dagNodePhase })`, serialises via `JSON.stringify(...)`, and returns `report` action with the JSON body in `message`. ~30 lines net post-edit.
  - Replaced the Story 2.4 placeholder `--diff-state` short-circuit at run.ts:1414-1424 with a full implementation that invokes `diffState({ statePath, projectRoot })` and returns `reportWithMessage(report.humanReadable)`. ~15 lines net post-edit.
  - Added new `wasExportStateRequested(argv)` argv-scan helper near the bottom of the file for the FR54 SPECIAL-CASE detection. ~25 lines including JSDoc.
  - Modified the `import.meta.main` block to detect `--export-state` via the helper AND when the result is `action: "report"`, emit `process.stdout.write(\`${result.action.message}\\n\`)` directly instead of `emitDispatchAction(result.action)`. ~10 lines net post-edit.
- `src/state/recompute.ts` (222 → ~265, +~43 lines):
  - Added new exported `recomputeStateUnlocked(opts?: RecomputeOptions): Promise<State>` function that re-uses the existing internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`, `ARTIFACT_GLOBS`, `FRONTMATTER_OPEN`); skips the `acquire(...)` call AND the `saveState(...)` call. Returns the recomputed `State` value WITHOUT persisting. JSDoc points at FR3 + FR52 + Story 3.8.
- `src/commands/next/run.test.ts` (3338 → ~3530, +~192 lines):
  - APPENDED new `describe("runNext — Story 3.8 --diff-state and --export-state", ...)` block with 7 colocated test cases (Tests A through G — A: --diff-state report; B: --export-state JSON body; C: route order export+diff; D: route order diff+explain; E: route order export+doctor; F: empty state all-null; G: lock-free invariant via source-content scan).
  - UPDATED 2 pre-existing tests at `run.test.ts:320-329` (--diff-state placeholder) and `run.test.ts:332-341` (--export-state placeholder) — both asserted the Story 2.4 deferred-hint strings; both updated to assert Story 3.8 actual outputs (in-sync OR diverges-with-fields message + parseable JSON body with schemaVersion=1).

#### New Files

- `src/state/diff.ts` (~180 lines): the `diffState({...}): Promise<DiffReport>` helper. Mid-tier per AR41. Composes `loadStateUnlocked + recomputeStateUnlocked + computeDivergences + formatHumanReadable`. Pure / async; no I/O writes; lock-free. Exports `Divergence`, `DiffReport`, `DiffStateOptions`, `diffState`.
- `src/state/diff.test.ts` (~280 lines): 8 colocated test cases (Tests A-H) covering empty divergence + single-field + multi-field + bmadVersion + verbatim AC-line-847 example + empty state + no-lock invariant + runHistory.length count diff.
- `src/state/export.ts` (~115 lines): the `exportState({...}): Promise<StateExportV1>` helper. Mid-tier per AR41. Composes `loadStateUnlocked + project + StateExportV1Schema.parse`. Pure / async; no I/O writes; lock-free. Exports `ExportStateOptions`, `exportState`.
- `src/state/export.test.ts` (~205 lines): 9 colocated test cases (Tests A-I) covering all-7-fields populated + activeEpic from lastAttempted + empty state + Zod parse + bmadVersion: "unknown" + stepperVersion constant + no-lock invariant + currentPhase null defaults (no callback / callback returns null).
- `src/schemas/state-export.ts` (~60 lines): `StateExportV1Schema` Zod schema. Foundational module per AR41. Exports `StateExportV1Schema`, `StateExportV1`, `StateExport`, `StateExportLatestSchema`. Re-uses `LastAttemptedSchema` + `LastFailureReasonSchema` + `StateV1Schema.shape.lastSuccessfulStep` from `./state.ts` (foundational sibling).
- `src/schemas/state-export.test.ts` (~120 lines): 5 colocated test cases (Tests A, A.1, B, B.1, C) covering valid full shape + minimal all-null shape + missing schemaVersion rejection + wrong schemaVersion rejection + JSON.stringify round-trip.
- `src/version.ts` (~15 lines): `STEPPER_VERSION = "0.1.0"` constant. Foundational module per AR41 (zero imports). Single source of truth for the Stepper version reported by `--export-state`.
- `src/integration/export-state-no-lock.test.ts` (~150 lines): 2 integration test cases — happy-path + empty-state edge. Spawns `bun run src/commands/next/run.ts -- --export-state` against a fixture-seeded tmpdir; parses stdout as JSON DIRECTLY (functionally equivalent to `--export-state | jq '.currentPhase'`); asserts 7 AC-line-850 fields + StateExportV1Schema.parse + FR52 no-lock-files invariant + FR54 stdout-only-JSON invariant (no `action` property).

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-8-diff-state-and-export-state` from `ready-for-dev` → `review`. `epic-3` remains `in-progress`.

#### Story File

- `_bmad-output/implementation-artifacts/3-8-diff-state-and-export-state.md` — frontmatter `status` flipped to `review`, inline status line flipped to `review`, Dev Agent Record / Test Counts / File List / Change Log populated.

#### Task Record

- `.bmad-stepper/runs/2026-05-01T222325Z-bmad-next/tasks/t1-dev-story.yaml` (NEW) — task record per BMAD dev-story discipline.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--export-state` + `--diff-state` already declared by Story 1.7 lines 164-165.
- `src/commands/next/verify-and-advance.ts` — Story 3.8 does NOT touch the lock-held runner.
- `src/dag/types.ts` / `src/dag/build.ts` / `src/dag/seed-v6.x.ts` — DAG types/builds unchanged; `exportState` consumes `Phase` type only.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/dispatch/generate-spec.ts` / `src/dispatch/index.ts` — dispatch-spec construction unchanged; both flags short-circuit BEFORE the dispatch path.
- `src/state/load.ts` — `loadStateUnlocked` already exposed; both new helpers consume it verbatim.
- `commands/bmad-next.md` — Layer 1 markdown already branches on `action`; the `report` action's `message` field carries multi-line content (for `--diff-state`) OR the JSON body (for `--export-state`, special-cased in `import.meta.main`).
- `src/schemas/state.ts` / `src/schemas/dispatch-protocol.ts` — no schema bump.
- `src/personas/` — Story 3.8 does NOT invoke persona resolution.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 3 ACs delivered with high fidelity to the verbatim AC wording (epic lines 845-852). The Story 2.4 placeholder short-circuits at `src/commands/next/run.ts:1402-1424` are replaced with the full helpers `diffState({ ... }): Promise<DiffReport>` and `exportState({ ... }): Promise<StateExportV1>`. The diff path composes `loadStateUnlocked + recomputeStateUnlocked + computeDivergences + formatHumanReadable` (4-field v0.1 conservative scope per Open Question 3); the export path composes `loadStateUnlocked + project + StateExportV1Schema.parse` (defence-in-depth Zod parse before return). Two NEW foundational schema modules (`src/schemas/state-export.ts` + `src/version.ts`) follow the AR20 type-alias-chain pattern; ONE NEW exported sibling helper (`recomputeStateUnlocked` in `src/state/recompute.ts`) re-uses the existing internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`) with ZERO new imports — purely additive. The `--export-state` SPECIAL CASE per FR54 + architecture §line 524 + §line 862 emits the JSON body DIRECTLY on stdout via `process.stdout.write` bypassing the AR9 wrapper; every OTHER flag (including `--diff-state`) preserves AR9 strictly; the `runNext` return value still uses the `report` shape for testability. AR8 / AR9 / AR11 / AR20 / AR21 / AR22 / AR33 / AR41 / AR42 invariants preserved; FR3 / FR4 / FR8 / FR52 / FR53 / FR54 + NFR-P1/P5/S2/S5/R1/R3/M3/I2 all PASS. Quality gates reproduce green (693 / 0 / 2574 / 53). 8 open questions adjudicated ACCEPT v0.1 conservative; 2 dev deviations adjudicated ACCEPT.

### AC Verification

- **AC-1** (epic AC line 845-847: `src/state/diff.ts` invoked → `--diff-state` runs → loads `state.yaml`, runs `recomputeState()` to produce the would-be-recomputed shape, computes the diff, emits a human-readable report listing every divergence per the verbatim example `lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2`) — **PASS**.
  - `src/state/diff.ts` exports `diffState({ statePath, projectRoot, bmadVersion, ... }): Promise<DiffReport>` at lines 153-182. The function composes `loadStateUnlocked` + `recomputeStateUnlocked` (Promise.all for concurrent reads) + `computeDivergences` + `formatHumanReadable`.
  - The 4-field comparator at `src/state/diff.ts:79-126` walks `lastSuccessfulStep` (rendered via `renderLastSuccessfulStep` at line 66-71 → `<step> epic <n> story <x.y>`), `project.name`, `project.bmadVersion`, `runHistory.length`. Open Question 3 adjudication: ACCEPT v0.1 (write-side state never recomputed; would always show divergence; schemaVersion always 1).
  - `formatHumanReadable` at line 133-142 emits `state.yaml is in sync with files of truth (no divergence detected)` when empty; otherwise header `state.yaml diverges from files of truth:` + 2-space-indented per-divergence lines `  ${field}: cached=${cached}; recomputed=${recomputed}`.
  - The runner short-circuit at `src/commands/next/run.ts:1439-1458` invokes `diffState` and returns `reportWithMessage(report.humanReadable)` (standard AR9 path; multi-line message inside `report.message`).
  - Test E at `src/state/diff.test.ts:211-247` asserts the verbatim AC-line-847 example string `lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2` is present in the human-readable output.
  - Tests A-D + F + H at `src/state/diff.test.ts:81-310` verify each component permutation (in-sync; single-field; multi-field; bmadVersion; empty-state; runHistory.length).

- **AC-2** (epic AC line 848-850: `src/state/export.ts` invoked → `--export-state` runs → emits valid JSON to stdout (NEVER to stderr — FR54) containing `currentPhase`, `activeEpic`, `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`, `bmadVersion`, `stepperVersion`, schema-versioned via Zod) — **PASS**.
  - `src/state/export.ts` exports `exportState({ statePath, dagNodePhase, ... }): Promise<StateExportV1>` at lines 68-114. The function loads state via `loadStateUnlocked`, projects 7 named fields per the AC-line-850 enumeration, runs defence-in-depth `StateExportV1Schema.parse(...)` before return.
  - `currentPhase` derivation via the `dagNodePhase: (stepName) => Phase | null` callback (Open Question 5 adjudication: ACCEPT v0.1; foundational-tier purity); `activeEpic` precedence chain `lastSuccessfulStep > lastAttempted > null` per the runner-clears-attempted-on-success contract from Story 3.1.
  - `bmadVersion: "unknown"` preserved verbatim per FR4 wording (Open Question 8 adjudication: ACCEPT v0.1); `stepperVersion` sourced from `STEPPER_VERSION` constant in `src/version.ts:14` (`"0.1.0" as const`).
  - Schema declared in `src/schemas/state-export.ts:44-55` with `z.literal(1)` schemaVersion; 7 named fields re-using `LastAttemptedSchema` + `LastFailureReasonSchema` + `StateV1Schema.shape.lastSuccessfulStep` from `./state.ts` (foundational sibling per AR41).
  - Type-alias chain at `src/schemas/state-export.ts:57-59`: `StateExportV1` + `StateExport` (alias) + `StateExportLatestSchema` (alias) — follows the AR20 V1/Latest pattern from `src/schemas/state.ts`.
  - The runner short-circuit at `src/commands/next/run.ts:1404-1437` builds the DAG (for the `currentPhase` lookup callback), invokes `exportState({ statePath, dagNodePhase: (name) => dag.nodes.get(name)?.phase ?? null })`, serialises via `JSON.stringify(exported)`, returns `reportWithMessage(jsonBody)`. The FR54 SPECIAL CASE at `src/commands/next/run.ts:1955-1965` emits the JSON body DIRECTLY on stdout via `process.stdout.write` BYPASSING `emitDispatchAction(...)` (Open Question 2 adjudication: ACCEPT v0.1; the AC-line-852 single-step `jq '.currentPhase'` workflow is the contract).
  - Tests A-G at `src/state/export.test.ts:45-225` verify all 7 fields populated, activeEpic precedence, empty-state nulls, Zod parse, bmadVersion preservation, stepperVersion constant, no-lock invariant. Tests H-I cover currentPhase null defaults.
  - Tests A, A.1, B, B.1, C at `src/schemas/state-export.test.ts:20-122` verify schema parse, all-null edge, missing/wrong schemaVersion rejects, JSON.stringify round-trip.

- **AC-3** (epic AC line 851: running these flags does NOT acquire the project lock — FR52) — **PASS**.
  - Both helpers use `loadStateUnlocked` exclusively (`src/state/diff.ts:155-164`, `src/state/export.ts:71-83`); the diff helper additionally uses `recomputeStateUnlocked` (NEW unlocked sibling at `src/state/recompute.ts:240-261` — re-uses internal helpers; skips `acquire(...)` AND `saveState(...)`).
  - Independent verification: `git diff src/state/recompute.ts | grep "^+import"` → 0 new imports for the recomputeStateUnlocked addition (re-uses existing `path`, `acquire`, `LockOptions`, `State`, `STATE_PATH`, `saveState` imports — additive only). The recomputeStateUnlocked function body doesn't call `acquire(...)` or `saveState(...)`; lock+save imports remain ONLY for the locked variant.
  - Programmatic source-content scans at `src/state/diff.test.ts:270-284` (Test G) and `src/state/export.test.ts:171-182` (Test G) reject `from "../lock/"`, `acquire(`, `loadState(`, `recomputeState(` patterns. Both tests pass.
  - The runner-side AR41 boundary check at `src/commands/next/run.test.ts:606-638` continues to pass; Story 3.8's mid-tier sibling imports (`../../state/diff.ts`, `../../state/export.ts`) are explicitly allowed per AR41.
  - Test G at `src/commands/next/run.test.ts:3550-3567` re-asserts the runner-level lock-free invariant: `diffState` + `exportState` imports are present; `recomputeState` (locked) + `saveState` are NOT imported by run.ts.

- **AC-4 (supplementary, line 852)** (integration test asserts `--export-state | jq '.currentPhase'` works without the lock) — **PASS**.
  - `src/integration/export-state-no-lock.test.ts:94-143` spawns `bun run src/commands/next/run.ts -- --export-state` against a fixture-seeded tmpdir; parses `stdout.trim()` directly via `JSON.parse(...)` (Open Question 6 adjudication: ACCEPT v0.1 in-process for portability — no `jq` runtime dep; functionally equivalent to `--export-state | jq '.currentPhase'`); asserts `safe.data.currentPhase === "planning"` (the seeded `bmad-create-prd` step's DAG phase); asserts the 7 AC-line-850 fields plus `schemaVersion === 1`; asserts FR52 lock-free invariant via `fs.access(lockPath)` rejecting; asserts FR54 stdout-only-JSON invariant by checking `parsed.action === undefined` (the AR9 wrapper would carry `action`; the export shape carries `schemaVersion`).
  - Second test at `src/integration/export-state-no-lock.test.ts:145-164` covers the empty-state edge: `currentPhase`, `activeEpic`, `lastSuccessfulStep` all `null`.
  - Forward-deferred to Story 3.10: the concurrent-active-lock test (where one process holds the lock and another runs `--export-state` simultaneously); v0.1 Story 3.8 asserts only the structural read-only contract (no `src/lock/` import; helper is async + lock-free).

### Architecture / NFR / FR coverage

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **PASS**. Both new helpers are lock-free; `run.ts` is unchanged in lock posture; `verify-and-advance.ts` is never invoked on `--diff-state` / `--export-state` paths. The AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **AR9** (single discriminated-union JSON line on stdout) — **PASS WITH DOCUMENTED SPECIAL CASE**. `--diff-state` emits the standard AR9 `report` line (`{ action: "report", message: <multi-line>, exitCode: 0 }`). `--export-state` SPECIAL-CASES the `import.meta.main` emit per FR54 + architecture §line 524 + §line 862 — the JSON body goes to stdout DIRECTLY via `process.stdout.write` (NOT wrapped in AR9). The `runNext` return value still uses the `report` shape for testability — Tests A/B/C in `run.test.ts:3401-3472` inspect `result.action.message` and `JSON.parse` it. Documented in `run.ts:1408-1419` JSDoc + `run.ts:1911-1935` `wasExportStateRequested` JSDoc + `run.ts:1948-1954` import.meta.main JSDoc + Story 3.8 §Open Question 2.
- **AR11** (`state.yaml` at `_bmad-output/.stepper/state.yaml`; `STATE_PATH` constant) — **PASS**. Both helpers read via `loadStateUnlocked({ statePath })` — same canonical path discipline as Story 1.6.
- **AR20** (Schemas + migrations apply to state, config, run-log, telemetry) — **EXTENDED PASS**. `StateExportV1Schema` at `src/schemas/state-export.ts:44-55` follows the same `<Family>V1Schema` + `<Family>LatestSchema` + `<Family>` type-alias-chain pattern as `src/schemas/state.ts`. v2 migration is a Story 6.x concern. Wire-shape stability per architecture §line 453 — stable within a Stepper MAJOR version.
- **AR21** (errors carry code) — **PASS**. ZERO new error classes. Registry held at **16 codes** (`bun test src/errors.test.ts`: 10 pass / 197 expects). Both helpers' upstream throws (`CorruptStateError`, `PathologicalInputError`, etc. from `loadStateUnlocked`) flow through `haltFromError` per Story 2.4.
- **AR22** (errors carry actionable hint) — **PASS**. ZERO new actionable hints. The empty-divergence message + the in-sync message at `src/state/diff.ts:135` are STATIC strings, not error hints.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await) — **PASS**. Both new helpers are async (Promise<DiffReport>, Promise<StateExportV1>); throw not Result; no `console.*`. The `--export-state` stdout emission uses `process.stdout.write` (the canonical stdout primitive per architecture §line 862 + §line 524) at `run.ts:1961`.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. **Verified independently**: `git diff src/state/recompute.ts | grep "^+import"` against the prior commit `8331ffb` yields **ZERO new imports** for the `recomputeStateUnlocked` addition (re-uses existing `path`, `acquire`, `LockOptions`, `State`, `STATE_PATH`, `saveState` imports). The new `src/state/diff.ts` is mid-tier; imports `loadStateUnlocked` + `recomputeStateUnlocked` (mid-tier siblings) + `State` type (foundational sibling). The new `src/state/export.ts` is mid-tier; imports `loadStateUnlocked` (mid-tier sibling) + `StateExportV1Schema` + `STEPPER_VERSION` + `Phase` type (foundational siblings). The new `src/schemas/state-export.ts` is foundational; imports `zod` + `./state.ts` (foundational sibling). The new `src/version.ts` is foundational; imports nothing. The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass; Story 3.8's mid-tier sibling imports (`../../state/diff.ts`, `../../state/export.ts`) are explicitly allowed.
- **AR42** (test discipline) — **EXTENDED PASS**. New colocated `*.test.ts` files for each new module: `src/state/diff.test.ts` (8 cases / 16 expects), `src/state/export.test.ts` (9 cases / 27 expects), `src/schemas/state-export.test.ts` (5 cases / 18 expects); plus integration test `src/integration/export-state-no-lock.test.ts` (2 cases / 19 expects). Each file follows AR35 tmpdir-per-test discipline.
- **FR3** (`--diff-state`) — **PRIMARY DELIVERABLE PASS**. v0.1 ships the cache-vs-recomputed divergence report per AC line 847.
- **FR4** (`--export-state` JSON) — **PRIMARY DELIVERABLE PASS**. v0.1 ships the schema-versioned 7-field export per AC line 850.
- **FR8** (`/bmad-next` single-step advance) — **PASS**. The dispatch path is unaffected; both flags are read-only short-circuits.
- **FR52** (Read-only flags non-locking) — **PASS**. Verified structurally via colocated source-content scans + the integration test's `fs.access(lockPath)` rejection assertion.
- **FR53** (Documented exit codes) — **PASS**. Both helpers return exit code 0 (success). Halt translations (corrupt state, pathological input, etc.) flow through the existing `haltFromError` mapping.
- **FR54** (stdout/stderr discipline) — **PASS WITH DOCUMENTED SPECIAL CASE**. The `--export-state` JSON body goes to stdout DIRECTLY via `process.stdout.write` per architecture §line 524 + line 862; diagnostics route to stderr via the existing `info`/`warn`/`error` helpers. The `--diff-state` AR9 line goes to stdout (single JSON line); the multi-line human-readable report lives in the `message` field. The integration test asserts `parsed.action === undefined` to verify the FR54 carve-out is in effect.
- **NFR-P1** (next-step computation < 500ms p95) — **PASS**. The diff path is structurally O(N) where N = number of artifact files; the export path is O(1) — single state read + single Zod parse. Both fit well under the 500ms p95 budget.
- **NFR-P5** (state.yaml ≤ 1 MB < 100ms) — **PASS**. The size guard at `src/state/load.ts` is invoked from `loadStateUnlocked` — both helpers inherit.
- **NFR-S2** (writes only inside scope) — **PASS BY ABSENCE**. Both helpers are read-only; ZERO write surface introduced. The integration test asserts no `state.yaml.tmp`, no `staging/`, no lock files written.
- **NFR-S5** (atomic writes + locks) — **PASS BY ABSENCE**. Read-only paths; nothing to write atomically; no locks to acquire.
- **NFR-R1** (zero data loss on halt) — **PASS BY ABSENCE**. Read-side only; no write paths touched.
- **NFR-R3** (state recomputable from disk) — **EXTENDED PASS**. `recomputeStateUnlocked` is a NEW exported helper that exposes the recompute logic without lock-acquisition; the diff path uses this. The full DAG-aware recompute is Story 6.x.
- **NFR-M3** (schemas + migrations) — **EXTENDED PASS**. `StateExportV1Schema` + the type-alias chain follows the schema-versioned discipline.
- **NFR-I2** (unknown-skill fail-loud) — **PRESERVED**. The diff path's `recomputeStateUnlocked` runs the same artifact scan as `recomputeState`; unknown-skill errors flow through the existing translation.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (`runHistory.length` count-only diff is v0.1 conservative; element-level diff deferred to Story 6.x telemetry-driven schema enhancement): `src/state/diff.ts:114-122` compares only the array LENGTH; per-entry diff (step + attemptedAt) is NOT computed. The Open Question 3 adjudication notes this as the v0.1 noise-free baseline; Story 6.x may extend the comparator. Not actionable now.
- **Info-2** (FR54 SPECIAL CASE is documented as a CARVE-OUT from AR9 — the runner emits the JSON body DIRECTLY on stdout BYPASSING `emitDispatchAction`): `src/commands/next/run.ts:1955-1965`. The contract is preserved at the `runNext` return level (still `action: "report"` for testability), only the process-level emission differs. The special-case is documented inline + in module JSDoc + in Story 3.8 §Open Question 2. Forward-compatible with Story 3.10 lock-skipping wiring; the carve-out is bounded — every OTHER read-only flag (including `--diff-state`) preserves AR9 strictly.

### Validator Independent Re-Run

- `bun --version`: **1.3.12** (AR2 satisfied — Bun >= 1.3).
- `bun test`: **693 pass / 0 fail / 2574 expect() calls / 53 files** (matches dev-story claim of +31 tests / +118 expects vs Story 3.7 baseline 662 / 2456 / 49).
- `bun run check`: **exit 0** (Biome ci + tsc + bun test all clean).
- `bunx --bun biome ci .`: **exit 0** (123 files checked clean in 32ms).
- `bunx --bun tsc --noEmit`: **exit 0** (no TypeScript errors).
- `bun test src/state/diff.test.ts`: **8 pass / 0 fail / 16 expect() calls**.
- `bun test src/state/export.test.ts`: **9 pass / 0 fail / 27 expect() calls**.
- `bun test src/schemas/state-export.test.ts`: **5 pass / 0 fail / 18 expect() calls**.
- `bun test src/integration/export-state-no-lock.test.ts`: **2 pass / 0 fail / 19 expect() calls**.
- `bun test src/commands/next/run.test.ts`: **130 pass / 0 fail / 482 expect() calls** (matches dev-story claim of 123 pre-Story-3.8 + 7 new = 130; 2 pre-existing tests retained with updated assertions).
- `bun test src/errors.test.ts`: **10 pass / 0 fail / 197 expect() calls** — registry stays at **16 codes** (AR21 invariant preserved).
- AR41 boundary check (`git diff src/state/recompute.ts | grep "^+import"` against prior commit `8331ffb`): **0 new imports for the recomputeStateUnlocked addition** (re-uses existing `path`, `acquire`, `LockOptions`, `State`, `STATE_PATH`, `saveState` imports — additive only).
- AC-text byte-identical: `diff <(sed -n '845,852p' epics.md) <(sed -n ... 3-8-...md)` → **exit 0** (verbatim BDD AC content matches identically).

### Deviations Adjudication

The dev-story enumerated 8 open questions (lines 651-666 of the story spec) plus 2 dev deviations in the dev-story task record. All adjudicated ACCEPT.

**8 Open Questions:**

- **open-question-1 (diff line indent: 2 spaces vs zero per verbatim AC)** — **ACCEPT v0.1 conservative**. v0.1 chooses 2-space indent for visual consistency with Story 3.7's `--list` bullet style. The AC line 847 example `lastSuccessfulStep: cached=...` shows the line stem only, not the surrounding multi-line context; the indent is below the AC's specificity threshold. The Test E assertion at `diff.test.ts:244-246` uses `.toContain` (substring match) so the indent does not break AC fidelity.
- **open-question-2 (`--export-state` bypass AR9 wrapper vs preserve AR9 strictly)** — **ACCEPT v0.1 conservative (bypass)**. v0.1 chooses bypass per FR54 + architecture §line 524 ("`--export-state` writes JSON to stdout only") + §line 862 ("the logger helper at `src/io/log.ts` writes to the proper output stream") + AC line 852 wording (`--export-state | jq '.currentPhase'` implies single-step `jq` extraction). The carve-out is bounded — every OTHER flag (including `--diff-state`) preserves AR9 strictly. Documented in `run.ts` JSDoc + Info-2.
- **open-question-3 (diff helper compare more fields beyond v0.1 4-field set)** — **ACCEPT v0.1 conservative**. The 4 fields are: `lastSuccessfulStep`, `project.name`, `project.bmadVersion`, `runHistory.length`. NOT compared: `lastAttempted`, `lastFailureReason`, `lastSnapshot`, `checkpoints` (write-side state never recomputed; would always show divergence), `schemaVersion` (always 1 in v0.1; migration registry guarantees). Tracked as Info-1 forward-tracker.
- **open-question-4 (`recomputeStateUnlocked` NEW export vs `skipAcquire` flag on `recomputeState`)** — **ACCEPT v0.1 conservative (NEW export)**. AR33 + AR41 separation-of-concerns. The locked variant stays the canonical write-side helper for Story 6.x's `--recompute-state` flag; the unlocked variant is the read-only-path entry point. Trade-off: Option A (`skipAcquire`) is fewer lines but couples read+write code paths; Option B (NEW export) is ~30 lines but keeps surfaces orthogonal. v0.1 chooses orthogonal.
- **open-question-5 (`currentPhase` DAG lookup callback vs accept the DAG directly)** — **ACCEPT v0.1 conservative (callback)**. `dagNodePhase: (name) => Phase | null` keeps the `exportState` helper free of DAG dependency (foundational-tier purity); the callback indirection allows the runner to wire the DAG without coupling. Forward-compatible with Story 6.x richer phase-detection.
- **open-question-6 (integration test spawn `--export-state | jq` literally vs parse stdout in-process)** — **ACCEPT v0.1 conservative (in-process)**. v0.1 chooses in-process `JSON.parse(stdout)` for portability (no `jq` runtime dep); the in-process parse is functionally equivalent. If a sibling test wants the literal `jq` invocation, it can be added without churn.
- **open-question-7 (export include `runHistory` or `checkpoints` arrays)** — **ACCEPT v0.1 conservative (NO)**. The 7 AC-line-850 fields are the minimum-viable contract. CI scripts that need run-history have access to per-step JSON run-logs at `_bmad-output/.stepper/runs/<ts>-<step>.json` per architecture §line 548. v0.1 chooses minimum-viable.
- **open-question-8 (`bmadVersion: "unknown"` translated to `null`)** — **ACCEPT v0.1 conservative (preserve verbatim)**. Per FR4 wording "export the current state". CI scripts detect the literal `"unknown"` and surface a warning. Test E in `export.test.ts:143-154` asserts.

**2 Dev Deviations:**

- **dev-deviation-1 (test count delta +31 vs spec projection ~+15-20)** — **ACCEPT**. Finer test decomposition (Tests A, A.1, B, B.1, C in state-export.test.ts; Test H runHistory.length divergence in diff.test.ts; Tests H + I null-callback edges in export.test.ts). All map 1:1 to AC sub-clauses; no test bloat; each asserts a distinct invariant.
- **dev-deviation-2 (writeArtifact factory uses hand-rolled multi-line YAML instead of `Bun.YAML.stringify`)** — **ACCEPT**. Discovered during initial test run — `Bun.YAML.stringify` produces inline `{}` syntax which the recompute scanner's `extractFrontmatter()` rejects (expects multi-line block-style YAML between `---` delimiters). Pragmatic fixture-construction choice; restricted to the test fixture; production recompute path unchanged. Documented in `diff.test.ts:55-57` inline comment.

### Strengths

- **Zero-deviation execution against spec mutation surface**: 12 task groups (Tasks 0-12) completed verbatim; both NEW core helpers land at their architecturally-prescribed paths (`src/state/diff.ts` + `src/state/export.ts` per architecture §line 1130-1131); the new schema module + version constant + integration test all match the spec File List byte-for-byte.
- **AR41 zero-import discipline on `recompute.ts`**: ZERO new imports added for the `recomputeStateUnlocked` addition (re-uses existing `path`, `acquire`, `LockOptions`, `State`, `STATE_PATH`, `saveState`). The new export is purely additive — the existing locked variant body is byte-unchanged.
- **TWO new sibling helpers in a single story** (first instance in Epic 3): `src/state/diff.ts` (~180 lines) + `src/state/export.ts` (~115 lines) ship as a coherent FR3+FR4 pair; different dependency graphs (diff path needs `recomputeStateUnlocked`; export path needs `StateExportV1Schema`); different return types (`DiffReport` vs `StateExportV1`); different output formats (multi-line human-readable vs single-line JSON).
- **AR9 + FR54 reconciliation via bounded SPECIAL CASE**: the `runNext` function preserves the `report` action shape for testability (tests inspect `result.action.message` and `JSON.parse` it); only the process-level emit at `import.meta.main` differs. The carve-out is bounded — every OTHER flag preserves AR9 strictly. Documented in 3 separate JSDoc blocks at `run.ts:1408-1419`, `run.ts:1911-1935`, `run.ts:1948-1954`.
- **Schema-versioned wire format follows AR20 type-alias-chain pattern**: `StateExportV1Schema` + `StateExportV1` + `StateExport` (alias) + `StateExportLatestSchema` (alias) — exact mirror of the `StateV1Schema` pattern from Story 1.5. v2 migration is a single-file edit at the schema boundary.
- **Defence-in-depth Zod parse before return**: `exportState` calls `StateExportV1Schema.parse(exported)` BEFORE returning at `src/state/export.ts:113`; the wire shape is guaranteed valid against the schema. Tests A-G assert.
- **Lock-free contract enforced by source-content scans**: Test G in both `diff.test.ts:270-284` and `export.test.ts:171-182` programmatically scan the helper source files for `from "../lock/"`, `acquire(`, `loadState(`, `recomputeState(` patterns and reject. The scans are colocated with the helpers; future regressions will surface at test time.
- **Integration test asserts FR52 + FR54 invariants structurally**: `src/integration/export-state-no-lock.test.ts:139-142` asserts `fs.access(lockPath)` rejects (no lock file); `:118-119` asserts `obj.action === undefined` (FR54 stdout-only-JSON; the AR9 wrapper would carry `action`). Both assertions are independent of the helper code; cannot be defeated by a misimplementation.
- **Test coverage across all 3 ACs × 4 edge combinations**: 24 colocated tests in `diff.test.ts` (8) + `export.test.ts` (9) + `state-export.test.ts` (5) + 2 integration tests + 7 colocated runner tests in `run.test.ts:3370-3568` cover every component permutation. Test E in `diff.test.ts` asserts the verbatim AC-line-847 example string; Test B in `run.test.ts` asserts the export shape's `currentPhase === "planning"` after the runner builds the DAG.
- **2 pre-existing tests UPDATED per spec Task 10.7**: Tests at `run.test.ts:320-360` (`--diff-state` placeholder + `--export-state` placeholder) updated from the Story 2.4 deferred-hint strings (`"Story 3.8"`, `"Story 3.10"`) to the Story 3.8 actual outputs (in-sync OR diverges-with-fields message + parseable JSON body); assertion intent preserved.
- **AC verbatim preservation**: §Acceptance Criteria reproduces the AC source verbatim (lines 845-852 of epics.md); diff against AC source confirms byte-identity (exit 0).
- **Errors registry held at 16 codes**: Story 3.8 introduces ZERO new error classes; both helpers' upstream throws (`CorruptStateError`, `PathologicalInputError`, etc. from `loadStateUnlocked`) flow through the existing `haltFromError` translation pipeline.

### Sprint-status update

- `3-8-diff-state-and-export-state: review → done`
- `epic-3: in-progress` (preserved — Stories 3.9 + 3.10 still open)

### Forward-action items

- **Story 3.9 (`--watch` Live Transcript Tail)** — INDEPENDENT. `--watch` tails the run-log; `--diff-state` + `--export-state` read state once. No shared surface.
- **Story 3.10 (`--non-locking-read-flags` / `skipAcquire` flag wiring)** — PRIMARY DOWNSTREAM. v0.1 (Story 3.8) ships helpers structurally lock-free; Story 3.10 wires explicit `skipAcquire: boolean` on `src/io/lock.ts`'s `acquire()` API for cases where read-only flags ever route through a lock-acquiring path. Story 3.10 also wires the concurrent-active-lock integration test (one process holds the lock and another runs `--export-state` simultaneously); Story 3.8's integration test asserts only the v0.1 read-only contract structurally.
- **Story 4.1 (`/bmad-loop` Command Skeleton)** — SECONDARY CONSUMER. The loop runner may invoke `runNext --diff-state` per iteration to detect drift; Story 4.1 may add a `--diff-each` flag.
- **Story 6.x (`state.completedSteps[]` schema extension)** — SECONDARY ARCHITECTURAL EXTENSION. The richer diff (per-completed-step set membership) depends on the schema landing. The diff helper's field list grows from 4 → ~7-10 fields. Tracked as Info-1 forward-tracker.
- **Story 6.x (full DAG-aware recompute)** — SECONDARY ARCHITECTURAL EXTENSION. Replaces both `recomputeState` and `recomputeStateUnlocked` with a unified DAG-aware traversal; the function signatures stay the same; the implementation evolves.
- **Story 6.x (per-step DAG epic/story attribution)** — SECONDARY EXTENSION. The export shape's `activeEpic` field becomes a true DAG-node-attribution field when Story 6.x extends the DAG node shape.
- **Story 6.10 (Marketplace Release)** — SECONDARY. `STEPPER_VERSION` constant in `src/version.ts` is the single source of truth; Story 6.10 may auto-derive from `package.json` via a build-time generator at that point.

### Issues dev missed

(none — the dev-story §Open Questions for Code Review correctly enumerated all 8 design tensions; the 2 dev deviations were documented and pragmatic; AC text byte-identical to source; no spec gaps surfaced during the independent re-validation; the AR41 boundary check on `recompute.ts` confirms ZERO new imports for the additive `recomputeStateUnlocked` export.)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-8-diff-state-and-export-state: review → done`. Ready to advance to Story 3.9 (`--watch` Live Transcript Tail) per the standard Epic-3 sequence.

## Change Log

| Date       | Author            | Change                                                                                                                                                |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.8                                                                                                         |
| 2026-05-01 | bmad-dev-story \| 2026-05-01T222325Z-bmad-next | implemented `--diff-state` (FR3) + `--export-state` (FR4) lock-free helpers + schema-versioned export shape + integration test; status ready-for-dev → review |
| 2026-05-01 | bmad-code-review \| 2026-05-01T223955Z-bmad-next | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3/4 PASS; AR8/9/11/20/21/22/33/41/42 + FR3/4/8/52/53/54 + NFR-P1/P5/S2/S5/R1/R3/M3/I2 PASS; status → done |
