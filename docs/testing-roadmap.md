# Stepper testing roadmap

A frank account of what the test suite covers today + what is **deliberately out of scope** for `bun test` and would require a separate harness or epic-level work to reach.

## What's covered today (post v0.2.0 + PR #68)

| Layer | Surface | Coverage |
|-------|---------|----------|
| Layer 2 — TypeScript core | per-module units | colocated `<file>.test.ts` next to every `src/**/*.ts`; ~1670 tests including AR9 emit, dispatch spec, state load/save, lock acquire, schema migrations, DAG build/Tarjan, telemetry rotation, archival, persona resolver, failure-UX policies, upgrade flow. |
| Layer 2 — composers | `runNext`, `runLoop`, `runDoctor` | direct in-process unit tests that exercise the composer surfaces with `runNextOverride` / `stateOverride` / `tokensPerIter` / `signalOverride` / `interactiveStdinOverride` test seams. |
| Layer 2 — integration sweeps | cross-cutting invariants | `src/integration/*.test.ts` — no-write-outside-scope (NFR-S2), no-network-on-main (NFR-S1), escalate-actionable-hint regex (AR22), aggregate-telemetry-no-PII, doctor-marketplace, dry-run-no-writes, export-state-no-lock, halt-records-state, non-locking-read-flags, upgrade-no-plugin-write, watch-fresh-project, auto-archival-startup. |
| Layer 1 ↔ Layer 2 boundary | subprocess smoke | `src/smoke/*.test.ts` — spawns `bun run src/commands/<name>/run.ts` against a tmpdir + fake BMAD plugin; covers next happy-path, loop plan-first / time-budget / max-iters parse, doctor 8 cases (healthy / missing BMAD / fresh project / verbose / corrupt state / unknown flag / marketplace cache layout), loop StopReason matrix (6 variants in-process), skill executable contract (3 skills × bun run extraction + spawn). |
| SKILL.md frontmatter + body shape | text + executable contract | `tests/skills/skill-frontmatter.test.ts` (frontmatter sanity) + `src/smoke/skill-invocation.test.ts` (body grep) + `src/smoke/skill-executable-contract.test.ts` (script-path-resolves + spawnable + AR9 line discipline). |

CI: `.github/workflows/ci.yml` runs `bun run check` (= `biome ci . && bun test --pass-with-no-tests`) on `ubuntu-latest`. The weekly `bmad-compat.yml` job runs `/bmad-next --doctor` against the latest BMAD upstream and files an issue on regression. ~13 seconds for the full suite locally; comparable in CI.

## What's deliberately out of scope for `bun test`

Three categories. None are "we forgot"; each is a real architectural ceiling that warrants a separate harness or a dedicated epic.

### 1. True Layer 1 simulation (Claude reading the SKILL.md and acting)

The SKILL.md body is a markdown document Claude interprets at runtime — it picks the bash command, runs the Task tool, captures the response, and routes the AR9 line. `bun test` has no Claude API access (architecture §line 1265 + Story 2.7 line 794), so no test today covers:

- Whether Claude correctly resolves `<captured-flags>` from the user's typed message into the bash invocation.
- Whether Claude's interpretation of the AR9 four-step protocol body produces a Task call with the right agent + dispatch-spec path + model parameter.
- Whether Claude's response-handling routes the JSON line's `action` through the documented branching (dispatch → Task → verify-and-advance vs report → print vs halt → exit).
- Whether the SKILL.md prose (e.g., "Print the message field VERBATIM") survives being summarized or paraphrased by Claude under context pressure.

**What would close this gap:**
- A separate test harness invoking the Claude API (or Claude Code in a controlled scripted mode) with the SKILL.md as input + a stub Task tool that records dispatch parameters. Run as a nightly cron (not blocking PR CI — would be slow + costly). Out of scope for the v0.2 release; track as Epic 7 candidate.
- Alternative: a contract test that drives a deterministic mini-LLM (e.g., a regex-based interpreter) against the SKILL.md to assert the body's instructions are unambiguous enough for a faithful reader. Cheaper but weaker.

### 2. End-to-end multi-iteration loop with real Task dispatch

The `/bmad-loop` happy path is "N iterations of Bash → Task subagent → verify → state advance." `runLoop` cannot invoke Task (architecture §line 1265 — Layer 2 forbidden from Task), so existing tests stub the per-iter result via `runNextOverride`. No test exercises:

- The full per-iter ATR9 cycle including a real (or recorded) sub-agent producing a real artifact that the verifier consumes.
- Cumulative state evolution over N iterations: per-iter state.yaml writes + lock acquire/release + transcript pair appends + checkpoint append.
- Failure-policy interaction across iterations: retry exhausting → escalate → loop halt; `--continue-on-error` allowing iter 2 to proceed past iter 1's halt; `--auto-fix` route-to-fixer round-tripping into the next iter's artifact.

**What would close this gap:**
- A "Task-recording fixture" — a sub-agent that reads its dispatch-spec, writes a fixed deterministic artifact, and records the request/response into a JSON ledger. The harness runs `runLoop({ runNextOverride: undefined })` against a tmpdir with this fixture installed; assertions check state.yaml diffs + transcript pair shapes + checkpoint count after N iters. Doable in `bun test` IF the Task tool can be replaced via a recorded-cassette pattern (no Claude API). Track as Story 6.x.
- Cheaper alternative: extend the existing `runNextOverride` matrix with a synthetic per-iter side effect (e.g., a stub that mutates a fake state object) so `runLoop` walks N iterations with realistic state evolution. Doesn't catch real verifier behaviour but does catch loop control-flow regressions.

### 3. Real BMAD upstream + real `tgorka/bmad-plugin` install

The smoke tests use a fake BMAD plugin under `<tmp>/.claude/plugins/bmad-method-6.6.0/` with a single stub skill. No test exercises:

- The full real BMAD plugin (102 skills) under either the legacy spec layout or the marketplace cache layout.
- The dispatch-spec produced for a real BMAD persona (e.g., `bmad-dev-story` with a real story spec).
- A real BMAD verifier consuming a real sub-agent artifact.

The weekly `bmad-compat.yml` job partially covers this — it runs `/bmad-next --doctor` against the actual BMAD upstream and files an issue on failure. But it does NOT run any dispatch path against a real BMAD plugin.

**What would close this gap:**
- Extend `bmad-compat.yml` to run `/bmad-next --plan-first` against the real BMAD install (read-only path; no dispatch); assert the planner accepts every real BMAD skill name without throwing UnknownBmadSkillError. Cheap, weekly cadence, low risk.
- Track a longer-running Epic 6 deliverable: a "real BMAD smoke" CI job that installs `tgorka/bmad-plugin@6.6.0`, dispatches `bmad-brainstorming` (a low-cost analysis step), and asserts the artifact shape. Costs Claude API tokens; gate behind a manual workflow_dispatch initially.

## Determinism & flake risk audit

`src/smoke/loop-stop-conditions.test.ts` from PR #67 still uses `--time-budget 1ms` to fire the time-budget stop condition via subprocess. This is the most likely flake source today. PR #68's `src/smoke/loop-matrix.test.ts` superseded the most fragile subprocess assertions with deterministic in-process equivalents; the subprocess version remains as belt-and-suspenders coverage of the parser path. If we observe flakes in CI, drop the subprocess time-budget case.

Other potential flake sources:
- Subprocess startup latency under load (the smoke tests spawn `bun run` ~10× total; on a busy CI runner each spawn is ~50–200ms). Mitigated by `bun test` parallelism + tmpdir-per-test isolation.
- File system race on `fs.cp` of the fixture (no concurrent access; safe).
- AR9 stdout discipline assertion expecting EXACTLY one line (defensive: filter empty lines before counting; already implemented).

## Cadence + ownership

| Track | Cadence | Owner | Trigger |
|-------|---------|-------|---------|
| `bun run check` (units + integration + smoke) | Per PR + per push | CI gate | mandatory pre-merge |
| `bmad-compat.yml` doctor sweep | Weekly + workflow_dispatch | CI cron | files issue on failure |
| Layer 1 simulation harness | TBD (Epic 7?) | Maintainer | nightly cron once built |
| Multi-iter Task-recording fixture | TBD (Story 6.x) | Maintainer | per PR after build-out |
| Real BMAD compat-plus dispatch | TBD (Epic 6+) | Maintainer | weekly + manual |

Open this doc when adding a new test surface — extend the relevant section so the architectural gaps stay visible.
