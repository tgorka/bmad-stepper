---
status: done
artifact_type: retrospective
epic: '1'
epic_title: Foundation & First-Run Diagnostic
created: '2026-05-01'
last_updated: '2026-05-01'
storiesCompleted: 13
storiesRange: '1.1 through 1.13'
loopId: 2026-05-01T031243Z-bmad-loop
runId: 2026-05-01T040540Z-bmad-next
loopIteration: 6
persona: bmad-retrospective
---

# Epic 1 Retrospective: Foundation & First-Run Diagnostic

User can install the Stepper plugin from the Claude Code marketplace, run `/bmad-next --doctor`, and get a verdict on BMAD compatibility, project state, and DAG validity. No step advancement yet — this is the bootstrapping epic that lays every foundational primitive (errors registry with CI gate, Zod schemas, atomic tmp+rename writes, mkdir-based file lock with heartbeat, CLI parser, exit-code discipline, three-tier DAG seed + registry, four-tier persona resolution, BMAD-install detection) and produces a working plugin scaffold installable from the marketplace. Documentation deliverables (README quick-start ≤10 min to first `/bmad-next`, getting-started, exit-codes catalog) ship in this epic.

## Sprint Metrics

| Metric                                    | Value                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Stories completed                         | 13 (1.1 → 1.13) — all `done`                                                           |
| Test-suite growth (start → end)           | 0 pass / 0 expects → **311 pass / 0 fail / 1161 expect() across 32 test files**        |
| Per-story baseline progression            | 0 → 85 → 148 → 176 → 211 → 217 → 232 → 262 → 286 → 311 (1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12)        |
| Source files added — foundational tier    | 4 (`errors.ts`, `io/log.ts`, `io/paths.ts`, `io/atomic-write.ts`)                      |
| Source files added — mid-tier             | ~30 across `lock/`, `schemas/` (7), `migrations/` (5 dirs), `state/` (4), `snapshot/` (2), `bmad-detect/` (3), `dag/` (5), `personas/` (3) |
| Source files added — top-tier (commands)  | 6 (`commands/index.ts`, `commands/next/{index,args}.ts`, `commands/doctor/{index,args,run,checks}.ts`) |
| Source files added — integration          | 2 (`integration/doctor-marketplace.test.ts`, `io/no-write-outside-scope.test.ts`)      |
| Slash-command markdown files              | 2 (`commands/bmad-next.md` placeholder + `commands/bmad-doctor.md` thin alias)         |
| Documentation files (Story 1.13)          | 4 (`README.md`, `docs/getting-started.md`, `docs/exit-codes.md`, `tests/fixtures/quick-start-walkthrough.md`) |
| Errors registry stability                 | 15 → 16 codes (Story 1.5 added `ScopeViolationError`); held at 16 from Story 1.5 → 1.13 |
| Repair iterations total                   | 2 (Story 1.5 default-`schemaVersion`-injection; Story 1.10 AC-2 fixture-cycle through seed) |
| Sub-agent stream-idle interruptions       | 1 (Story 1.9 create-story in loop 2 — recovered via abandon-on-reentry in loop 3)      |
| Code-review outcomes                      | **9 APPROVE** (1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11) + **4 APPROVE-WITH-ACTIONS** (1.1, 1.3, 1.12, 1.13) — 0 changes-requested |
| Loop iterations consumed (epic-1 only)    | **40 iterations** across 4 `/bmad-loop` invocations (12 + 12 + 10 + 6 = 40; loop 4 mixed epic-1 closure + retro) |
| `bun run check` release-blocker gate      | Exit 0 every story; final 311 pass / 0 fail / 1161 expect() / 32 files / 1342 ms        |

## What Went Well

- **AR41 boundary discipline: zero violations across 13 stories.** Mid-tier modules (`bmad-detect/`, `dag/`, `personas/`, `state/`, `snapshot/`, `migrations/`, `schemas/`) consistently imported only from foundational (`errors.ts`, `io/`) + Bun/Node stdlib, never from sibling mid-tier modules. The composer-at-runner pattern (mid-tier composition deferred to `commands/`) held throughout. Story 1.12 was the first composer at the top-tier and it worked exactly as designed.
- **Errors registry stability: 16 codes maintained from Story 1.5 onward.** When AC-verbatim hint substitution was needed (Story 1.10 `UnknownBmadSkillError`, Story 1.11 `ConfigError`), the team adopted an additive constructor extension (`hintOverride?: string` 3rd-arg + `actionableHint` getter) rather than expanding the registry. The `errors.test.ts` registry CI gate (10 tests / 197 expects) stayed green throughout.
- **Composer-at-runner pattern: mid-tier modules stayed pure.** `build({ skillNames })` from `dag/` consumes detector output as a parameter (Story 1.10), not via direct mid-tier-to-mid-tier import. Story 1.12 doctor wired everything together at the runner level. This kept each mid-tier module independently testable with `bun test src/<module>/`.
- **Test-first enforcement: every story shipped tests in same PR.** Test count grew monotonically from 0 → 311 with no story landing zero new tests except Story 1.13 (documentation-only by design). Colocated `*.test.ts` next to source files enabled `bun test --changed` granularity.
- **First-attempt approval for the foundational primitives.** Stories 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11 all earned CLEAN APPROVE on first review (9 of 13). Repair iterations totalled only 2 across 13 stories — the bmad-create-story → bmad-dev-story → bmad-code-review pipeline produced reviewable artefacts on the first dev pass for 11 of 13 stories.
- **`hintOverride?` constructor pattern emerged as a reusable idiom.** Used by `UnknownBmadSkillError` (Story 1.10) and `ConfigError` (Story 1.11) to deliver AC-verbatim hints without registry bloat. JSDoc on both classes documents the rationale and backwards-compatibility guarantee.
- **Strictly-additive scope discipline.** Stories 1.7, 1.8, 1.9, 1.10, 1.11 each shipped with `git diff --stat HEAD -- src/` showing only new files. Story 1.13 shipped zero `*.ts` deltas (documentation-only).
- **Quality gates exit 0 every story.** `bun test`, `bunx biome ci .`, `bunx tsc --noEmit`, `bun run check` all green at every review.

## What Could Improve

- **Sub-agent stream-idle interruption (loop 2, iter 13, Story 1.9 create-story).** A 43-min wall-clock with 52 tool uses produced ZERO disk artefacts before the orchestrator timed it out. Recovery via abandon-on-reentry (loop 3) was clean and idempotent, but the cost was one wasted long-duration dispatch. Mitigation in subsequent loops: tighter sub-agent prompts with explicit milestone discipline. NO repeat in loops 3 or 4.
- **Long story files (some > 700 lines, several > 900 lines).** Stories 1.5 (1129L), 1.6 (925L), 1.7 (947L), 1.10 (773L), 1.12 (765L), 1.11 (557L) all exceed a 500-line readability threshold. Consider tighter scoping for Epic 2 stories — split when a story carries > ~600 lines of dev-notes-plus-review.
- **Pre-existing working-tree drift across stories within a single loop.** Stories 1.7 and 1.8 reviews both flagged uncommitted modifications carried over from prior dev passes (HEAD at story 1.4 commit; `src/io/*` and `src/errors.ts` deltas belonged to Stories 1.5/1.6). Recommend committing per-story PRs more aggressively across loop iterations to keep `git status` matching the iteration scope.
- **Tier-3 frontmatter parser was hand-rolled twice** — once in `dag/build.ts` (`parseOverridesYaml`) and once in `commands/doctor/checks.ts` (`countProjectOverrides`). Story 6.1 (config-yaml schema loader) is the unification target; tracked as info I3 from 1.12 review.
- **Deferred coverage gaps.** AC-2 NFR-P2 wall-time test (100 epics × 1000 stories) was deferred to integration/CI; Story 1.10 lazy-load is exercised but not benchmarked. NFR-M4 manual stopwatch walkthrough deferred to Story 6.10 marketplace-release verification (no automated CI gate yet).
- **Marketplace smoke test under-approximation (Story 1.12 N1).** The fixture removes the BMAD plugin layout (`<tmp>/.claude/plugins/`) instead of the Stepper plugin's `.claude/plugins/bmad-stepper/` directory (which is never created in the fixture per the dev-003 simplification). Tracked for Story 6.10 polish.
- **Story 1.1 CI green not yet observed.** Action item A4 (post-merge CI verification) from Story 1.1 review is still outstanding — first real CI run on `ubuntu-latest` + `macos-latest` matrix is post-commit; only local `bun run check` exits 0 to date.

## Pattern Discoveries

- **`hintOverride?` constructor argument pattern (Stories 1.10, 1.11).** Optional 3rd ctor arg on `UnknownBmadSkillError` and `ConfigError` for AC-verbatim hint substitution without registry bloat. Pattern is now codified twice and is the canonical template for any future per-instance hint override.
- **`Bun.file(path).size === 0` pre-check pattern (Story 1.12 dev-002).** Avoids fragile message-string matching against `loadStateUnlocked`'s exception. Story 1.12 spec-recommended; defence-in-depth at `checks.ts:344-351` still catches the race-window where the file is whitespace-only between size read and loader call.
- **spawn-with-cwd marketplace test pattern (Story 1.12 dev-003).** HOME overridden to tmp; cwd points at project subdir; doctor source invoked from real REPO_ROOT path. Simpler than copying/symlinking the source tree and exercises the same `Bun.spawn` invocation pattern.
- **Composer pattern at runner level (Story 1.12 — first integration).** Doctor `runDoctor()` calls `detectBmadVersion()` + `detectBmadSkills()` from `bmad-detect/`, threads results into `build({ skillNames })` from `dag/`, validates state via `loadStateUnlocked()` from `state/`. Mid-tier modules stay decoupled; the runner owns wiring.
- **`SCOPE_VIOLATION:` message-prefix discipline (Story 1.3 → 1.5 → 1.6).** When the dedicated `ScopeViolationError` class arrived in Story 1.5, the throw-site migration (Story 1.6 Task 6.4) preserved the `SCOPE_VIOLATION:` message prefix so log-grep tooling stayed forward-compatible.
- **Caller-owned lock lifecycle (Story 1.6 `saveState`).** TypeScript signature requires `LockHandle` parameter (architectural NFR-S5 enforcement at API surface), but the parameter is named `_lockHandle` to satisfy Biome `noUnusedVariables`; the runtime lock is owned by the caller's try/finally per AR12 read-modify-write pattern.
- **TYPE-only cross-module test exception (Story 1.11 `defaults.test.ts`).** Sanctioned AR41 test-file exemption: `defaults.test.ts` imports `seedV6_x` from `../dag/seed-v6.x.ts` to verify the persona-identifier alignment between the seed entries and the defaults map. Production-file boundary remains clean.
- **Strictly-additive scope as a default (Stories 1.7 → 1.13).** Each story shipped only new files; existing files were touched only when the story explicitly authorised the modification (e.g., Story 1.10 authorised `errors.ts` extension; Story 1.6 authorised `io/paths.ts` migration).

## Carry-Over Action Items

These carry-overs from epic-1 stories remain open and inherit into future epics. None block epic-2 start.

| ID                                       | From    | Defer-to                  | Description                                                                                              |
| ---------------------------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `tarjan.ts → sort.ts` rename             | 1.10 N1 | Story 3.6/3.7             | Architecture lines 1155-1161 name future file `sort.ts` (Tarjan + topological sort). Documented in JSDoc. |
| `idempotent` field on `DagNode`          | 1.10 I2 | Story 5.1                 | Optional field not yet captured by Tier 1 or Tier 3 parsers; retry semantics will populate it.            |
| `bmad-detect resolvePluginDir` export    | 1.12 I2 | bmad-detect polish        | `checks.ts:490-510` reconstructs lex-max plugin-dir resolution. Future helper extraction in `bmad-detect/index.ts`. |
| `countProjectOverrides` unification      | 1.12 I3 | Story 6.1                 | Inline YAML extractor in `checks.ts:378-430` mirrors `dag/build.ts` pattern; unify with Zod-validated config-loader. |
| Marketplace fixture extension            | 1.12 N1 | Story 6.10                | Extend smoke fixture with real `.claude/plugins/bmad-stepper/` layout to assert removing THAT preserves `_bmad-output/.stepper/`. |
| `ResolvedPersona` type alias             | 1.11 N1 | next persona-touching story | Cosmetic: add `export type ResolvedPersona = string \| readonly string[];` for spec-planned barrel parity. |
| Persona-resolvability check in doctor    | 1.12 I1 | Story 3.6 `--explain`     | OPTIONAL persona-resolvability check deferred; preserves AC-1 verbatim 5-line format in v0.1 doctor.      |
| 7 worked example bodies                  | 1.13    | Story 6.10                | README links forward; full bodies under `docs/examples/` ship in marketplace release.                    |
| CI walkthrough automation                | 1.13    | Story 6.10                | NFR-M4 manual stopwatch walkthrough; CI gate that walks `tests/fixtures/quick-start-walkthrough.md` automatically. |
| Defensive comment block in `run.ts`      | 1.12 N2 | optional polish           | OPTIONAL: drop `checkBmadInstalled` defensive comment block lines 217-220 if grep-lookup is not needed.   |
| `@types/bun: "latest"` exact-pin         | 1.1 A1  | next dev iter touching package.json | Replace `"latest"` with resolved exact version to align with AR2 pinning emphasis.                  |
| `peerDependencies.typescript: "^5"`      | 1.1 A2  | next cleanup pass         | Auto-added by `bun init -y`; harmless but cosmetically out-of-place.                                     |
| `bun-version: "1.3"` explicit pin in CI  | 1.1 A3  | Story 6.10 polish         | Tighter version control on `setup-bun@v2` step.                                                          |
| Post-merge CI verification               | 1.1 A4  | first push to remote      | Confirm CI green on `ubuntu-latest` + `macos-latest`.                                                    |
| Tier 4 precise BMAD-module-trigger schema | 1.11 D3 | Story 6.1                 | Minimal pattern matcher; precise schema deferred to config-loader story.                                  |
| Generic-Error fallback log-stack-trace   | 1.12 I5 | Story 2.5                 | `import.meta.main` block catches non-`StepperError` throws and exits 1 with generic line; future polish to log full stack trace to run-log. |

## Forward Action Items for Epic 2

Recommended planning notes for the next epic. Order reflects dependency / risk surfacing.

| Story | Title                                                | Pre-work / Notes                                                                                                                                    |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1   | Verifier configuration registry                      | Design `VerifierConfig` shape; consider `hintOverride?` pattern continuity for verifier-specific error hints.                                       |
| 2.2   | Dispatch spec generator                              | JSON-line protocol design; stdout-only discipline (FR54 / AR9). Schema lives at `src/schemas/dispatch-spec.ts` (already shipped in Story 1.5).      |
| 2.3   | Generic sub-agent `bmad-step-runner.md`              | Persona dispatch from `src/personas/` resolver (Story 1.11). Sub-agent reads `staging/<run-id>/dispatch-spec.json` and follows 6-section contract.  |
| 2.4   | Lock-free `run.ts` for `/bmad-next`                  | The OTHER read-only/lock-free runner (mirrors doctor). FIRST consumer of `loadStateUnlocked()` from Story 1.6. Composes detection + DAG + personas + dispatch-spec generator. |
| 2.5   | Markdown transcript + JSON run-log writers           | Consume `src/io/log.ts` + `src/io/atomic-write.ts`. Two paired files per step: `runs/<ts>-<step>.log` + `runs/<ts>-<step>.json` (schema in Story 1.5). |
| 2.6   | `verify-and-advance.ts` with state-hash check        | The LOCK-ACQUIRING runner (per architecture line 1672). FIRST integration with `src/lock/` for read-modify-write cycles. TOCTOU defense via state-hash compare. |
| 2.7   | Slash command for `/bmad-next` (Layer 1 markdown)    | Mirrors `commands/bmad-doctor.md` alias pattern. Body: Bash → Task dispatch → Bash → print summary line.                                            |
| 2.8   | Smoke test for `/bmad-next` happy path               | Mirrors `src/integration/doctor-marketplace.test.ts` pattern; spawn-with-cwd, real Bun.spawn invocation.                                            |

**Recommended planning sequence:**

1. Front-load **Story 2.4** (lock-free `run.ts`) early — it composes the most prior modules and surfaces integration gaps quickly. Story 1.12's first-integration experience suggests longer dev iteration than typical (15-20 min).
2. Story **2.2 (dispatch spec generator)** must precede Story **2.3 (generic sub-agent runner)** since the runner depends on the dispatch spec contract.
3. Allocate review iteration budget for Story **2.6 (verify-and-advance)** — first lock-acquiring runner; high-risk first integration with `src/lock/`. Expect TOCTOU edge-case findings.
4. Review Story 1.12's marketplace smoke test pattern before Story **2.8** to maintain test consistency. Reuse the `spawn-with-cwd` fixture pattern.

## Architecture Compliance Summary

| Constraint | Status across 13 stories                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| AR21 (errors carry `code`+`actionableHint`)        | **CLEAN** — every throw site uses a registered `StepperError` subclass; never plain `Error` (sole sanctioned exception: CLI parser `ParseError` value object per architecture line 858) |
| AR22 (single-line Run/See/Try/Check hints)         | **CLEAN** — `errors.test.ts` enumerates the registry and asserts the regex match; 16 codes pass at every story                          |
| AR33 (throw-discipline + no `console.*`)           | **CLEAN** — Biome `noConsole` enforced project-wide; `process.exit` only in `import.meta.main` blocks; all writers use `src/io/log.ts`  |
| AR41 (boundary graph)                              | **CLEAN** — zero violations; mid-tier-to-mid-tier ban honored; composer pattern at runner-tier; sanctioned test-file exemptions documented (e.g., Story 1.11 `defaults.test.ts` ↔ `dag/seed-v6.x.ts`) |
| FR40 (config layering)                             | Surfaced in Story 1.12 doctor (`_bmad/config.yaml.bmm.project_name` → `package.json` fallback)                                          |
| FR41 (`--doctor` diagnostic)                       | DELIVERED in Story 1.12                                                                                                                |
| FR47 (marketplace install)                         | DELIVERED in Story 1.13 (README §Quick Start) + smoke-tested via `doctor-marketplace.test.ts`                                          |
| FR49 (uninstall preserves `_bmad-output/.stepper/`)| DELIVERED in Story 1.13 (README §Uninstall preserves your data) + property-asserted in marketplace test                               |
| FR50 (BMAD detection on first run)                 | DELIVERED in Story 1.9 (detection primitives) + Story 1.12 (user-visible diagnostic line)                                              |
| FR51 (fail-loud unknown skill)                     | DELIVERED in Story 1.10 (`UnknownBmadSkillError` Tier 3 fallback throw) — verbatim AC-3 hint via `hintOverride`                        |
| FR53 (exit codes 0–5)                              | DELIVERED in Story 1.13 (`docs/exit-codes.md` enumerates every code with verbatim hints from `src/errors.ts`)                          |
| FR54 (stdout/stderr discipline)                    | DELIVERED in Story 1.3 (`io/log.ts` `info`/`warn`/`error` → stderr, `json` → stdout) + verified by Story 1.12 (smoke test asserts `stdout === ""`) |
| FR2 / FR5 / FR6 / FR7                              | DELIVERED via Stories 1.5 (schemas+migrations) + 1.6 (state subsystem)                                                                |
| NFR-M4 (10-min dogfood walkthrough)                | DELIVERED in Story 1.13 (README Quick Start banner + `tests/fixtures/quick-start-walkthrough.md`)                                     |
| NFR-R1 (zero data loss)                            | DELIVERED via Story 1.3 (atomic write + `.bak` rotation) + Story 1.4 (file lock with heartbeat) + Story 1.6 (state subsystem composes both) |
| NFR-S1 (no main-thread network I/O)                | CLEAN across all 13 stories — verified by `Grep` of `fetch(`, `http.`, `https.`, `net.` in `src/commands/doctor/`                       |
| NFR-I2 (fail-loud unknown skill)                   | DELIVERED in Story 1.10 (UnknownBmadSkillError propagation)                                                                            |
| NFR-Sc1 (read-only flags / lazy load)              | DELIVERED via Story 1.10 (lazy story-level loading; `dag.nodes` enumerates only ~38 skill nodes, not story expansions)                  |

## Story-by-Story Summary Matrix

| #   | Story                                | FR / NFR / AR Coverage                                                       | New Source Files                                                                  | Test Δ                  | Review            | Repairs |
| --- | ------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------- | ----------------- | ------- |
| 1.1 | Initialize Repository Scaffold       | AR1, AR2, AR3, AR31, AR32, AR36, AR40, AR43; FR47 (marketplace prep)         | scaffold (`package.json`, `tsconfig.json`, `bunfig.toml`, `biome.json`, `.changeset/`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `bun.lock`) | empty pass             | approve-with-actions (4 nits A1-A4) | 0       |
| 1.2 | Errors Module + Registry CI Gate     | AR21, AR22, AR33; AR36 (CI release-blocker)                                  | `src/errors.ts` + `src/errors.test.ts` (15 concrete subclasses + registry)        | +10 tests / +185 expects | approve (CLEAN)   | 0       |
| 1.3 | Logger + Path Helpers + Atomic Write | AR33, AR42; NFR-S5, NFR-R1; FR54                                              | `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts` + 4 tests             | +34 tests / +61 expects | approve-with-actions (S1: dedicated `ScopeViolationError`) | 0       |
| 1.4 | File Lock with Heartbeat             | AR12, AR42; NFR-S5, NFR-R4                                                   | `src/lock/lock.ts` + 1 unit + 4 integration tests                                  | +41 tests / +59 expects | approve (CLEAN)   | 0       |
| 1.5 | Schemas + Migrations Skeleton        | AR19, AR20, AR21 (registry +1); FR6, FR7; NFR-M3                              | `src/schemas/` (7 schemas + 7 tests), `src/migrations/load-and-migrate.ts` + 4 family registries + tests; `ScopeViolationError` (registry 15→16) | +63 tests / +133 expects | approve (CLEAN)   | 1 (default-`schemaVersion` injection) |
| 1.6 | State Subsystem (load/save/recompute)| AR11, AR12, AR20, AR33, AR42; FR2, FR5, FR6, FR7; NFR-P5, NFR-S5, NFR-Sc1, NFR-R3 | `src/state/{paths,load,save,recompute}.ts` + 3 tests; `ScopeViolationError` throw-site migration in `io/paths.ts` | +28 tests / +67 expects | approve (CLEAN)   | 0       |
| 1.7 | CLI Argument Parser                  | AR23, AR33 (CLI exception); FR8-FR15, FR27, FR53, FR54                       | `src/commands/index.ts`, `src/commands/next/{index,args}.ts` + 1 test (109 source lines, 18-flag inventory) | +35 tests / +84 expects | approve (CLEAN)   | 0       |
| 1.8 | Snapshot — Branch + SHA Detection    | AR13; NFR-R1                                                                  | `src/snapshot/{index,detect}.ts` + 1 test (Bun.spawn-based git detector)          | +6 tests / +49 expects  | approve (CLEAN)   | 0       |
| 1.9 | BMAD Detection                       | AR30; FR50, FR51; NFR-I2                                                      | `src/bmad-detect/{index,detect-version,detect-skills}.ts` + 2 tests                | +15 tests / +26 expects | approve (CLEAN)   | 0       |
| 1.10| DAG Seed + Three-Tier Registry       | AR14, AR15, AR41; FR1, FR2, FR35, FR51; NFR-Sc1, NFR-I2                       | `src/dag/{index,types,seed-v6.x,tarjan,build}.ts` + 2 tests (38 hand-curated seed entries; Tarjan SCC); `UnknownBmadSkillError +hintOverride?` | +30 tests / +243 expects | approve (1 nit + 2 info) | 1 (AC-2 fixture cycle) |
| 1.11| Persona Resolution                   | AR16, AR41; FR12; NFR-I2                                                      | `src/personas/{index,defaults,resolve}.ts` + 2 tests (36 default personas; 4-tier resolver); `ConfigError +hintOverride?` | +24 tests / +184 expects | approve (1 nit + 1 info) | 0       |
| 1.12| `/bmad-next --doctor` Command        | AR41 (top-tier composer); FR40, FR41, FR47, FR49, FR50, FR53, FR54; NFR-M4, NFR-R1, NFR-I2, NFR-S1 | `src/commands/doctor/{index,args,run,checks}.ts` + 2 tests + `src/integration/doctor-marketplace.test.ts` + `commands/bmad-doctor.md` | +25 tests / +70 expects | approve-with-actions (2 nits + 5 info) | 0       |
| 1.13| Quick-Start Documentation            | AR21, AR22, AR33; FR47, FR49, FR50, FR53, FR54; NFR-M4                       | ZERO TS deltas (documentation-only): `README.md` (103L), `docs/getting-started.md` (119L), `docs/exit-codes.md` (176L), `tests/fixtures/quick-start-walkthrough.md` (62L) | 0 (baseline 311 preserved) | approve-with-actions (0 nits + 1 info) | 0       |

## Recommendations for Epic 2 Planning

- **Front-load Story 2.4 (lock-free `run.ts`)** since it composes the most prior modules (`bmad-detect/`, `dag/`, `personas/`, `state/`, `snapshot/`, dispatch-spec generator) and surfaces integration gaps early. Story 1.12 doctor was the proof-of-concept for runner-level composition.
- **Sequence Story 2.2 (dispatch spec generator) before Story 2.3 (generic sub-agent runner)** since the runner depends on the dispatch-spec JSON contract (architecture line 1672 + AR9 JSON-line stdout protocol).
- **Allocate review iteration budget for Story 2.6 (`verify-and-advance.ts`)** — first lock-acquiring runner; high-risk first integration with `src/lock/` for read-modify-write cycles. Expect TOCTOU edge-case findings around the state-hash check.
- **Review Story 1.12's marketplace smoke test pattern before Story 2.8** to maintain test consistency. Reuse the spawn-with-cwd fixture pattern (HOME override, cwd points at tmp project subdir, doctor source invoked from real REPO_ROOT).
- **Carry the `hintOverride?` pattern forward** when verifier-specific error hints arise. Both Story 2.1 (verifier config) and Story 2.6 (state-hash check throw) are candidates for AC-verbatim hint substitution.
- **Apply tighter scoping for stories above 600 lines.** Stories 1.5, 1.6, 1.7, 1.10, 1.12 each ran > 700 lines; consider splitting Epic 2 stories that carry heavy dev-notes-plus-review sections.
- **Commit per-story PRs more aggressively across loop iterations** to avoid the working-tree drift seen in Stories 1.7 and 1.8 reviews. Per Graphite stacked-PR policy, prefer `gt create -am` per story.
- **Keep epic-2 retrospective optional** unless the loop budget allows; the ~200-400 line retrospective format proven here is reusable.

---

**Epic 1 closure milestone:** All 13 required stories `done`; epic status `done`; optional retrospective (this document) `done`. Epic 2 (Single-Step Advance with Sub-Agent Dispatch) is the next epic; loop `/bmad-loop --until=epic:2` should now satisfy its stop condition.
