# Stepper testing roadmap

A frank account of what the test suite covers today + what is **deliberately out of scope** for `bun test` and would require a separate harness or epic-level work to reach.

## What's covered today (post v0.2.0 + PR #69)

| Layer | Surface | Coverage |
|-------|---------|----------|
| Layer 2 — TypeScript core | per-module units | colocated `<file>.test.ts` next to every `src/**/*.ts`; ~1700 tests including AR9 emit, dispatch spec, state load/save, lock acquire, schema migrations, DAG build/Tarjan, telemetry rotation, archival, persona resolver, failure-UX policies, upgrade flow. |
| Layer 2 — composers | `runNext`, `runLoop`, `runDoctor` | direct in-process unit tests that exercise the composer surfaces with `runNextOverride` / `stateOverride` / `tokensPerIter` / `signalOverride` / `interactiveStdinOverride` test seams. |
| Layer 2 — integration sweeps | cross-cutting invariants | `src/integration/*.test.ts` — no-write-outside-scope (NFR-S2), no-network-on-main (NFR-S1), escalate-actionable-hint regex (AR22), aggregate-telemetry-no-PII, doctor-marketplace, dry-run-no-writes, export-state-no-lock, halt-records-state, non-locking-read-flags, upgrade-no-plugin-write, watch-fresh-project, auto-archival-startup. |
| Layer 1 ↔ Layer 2 boundary | subprocess smoke | `src/smoke/*.test.ts` — spawns `bun run src/commands/<name>/run.ts` against a tmpdir + fake BMAD plugin; covers next happy-path, loop plan-first / time-budget / max-iters parse, doctor 8 cases (healthy / missing BMAD / fresh project / verbose / corrupt state / unknown flag / marketplace cache layout), loop StopReason matrix (6 variants in-process), skill executable contract (3 skills × bun run extraction + spawn). |
| SKILL.md frontmatter + body shape | text + executable contract | `tests/skills/skill-frontmatter.test.ts` (frontmatter sanity) + `src/smoke/skill-invocation.test.ts` (body grep) + `src/smoke/skill-executable-contract.test.ts` (script-path-resolves + spawnable + AR9 line discipline) + `src/smoke/skill-body-structure.test.ts` (PR #69 — structural invariants: Tool restrictions section, AR9 action discriminator documentation, declared-agent reference, no TODO/FIXME markers). |
| **Multi-iter pipeline (PR #69)** | Layer-1 simulation harness in-process | `src/smoke/multi-iter-pipeline.test.ts` — drives `runNext` → mock-Task → `runVerifyAndAdvance` for N iterations against a tmpdir + fake BMAD plugin. Asserts state.yaml.lastSuccessfulStep advance, runHistory[] accumulation, transcript pair writes. The closest `bun test` can reach to a true multi-iter end-to-end without Claude API access. |
| **Real BMAD upstream (PR #69)** | on merge to `main` | `.github/workflows/bmad-compat.yml` extended — runs `/bmad-next --doctor` AND `/bmad-loop --plan-first` AND the skill-frontmatter sanity sweep against the actual BMAD upstream on every merge to `main` + manual `workflow_dispatch`. |
| **Layer 1 Claude sim (PR #69)** | on merge to `main`, opt-in | `.github/workflows/layer1-sim.yml` + `tests/harness/layer1-claude-sim.test.ts` — sends each SKILL.md to the real Claude API and asserts Claude's intended bash invocation matches the prescribed Layer-2 entry point. Runs on every merge to `main` + manual `workflow_dispatch`. Skipped without `ANTHROPIC_API_KEY` (set as repo secret to enable). Costs ~$0.05 per run on Haiku. |

CI: `.github/workflows/ci.yml` runs `bun run check` (= `biome ci . && bun test --pass-with-no-tests`) on `ubuntu-latest` on every push + PR. The `bmad-compat.yml` job runs `/bmad-next --doctor` + `/bmad-loop --plan-first` against the latest BMAD upstream on every merge to `main` and files an issue on regression. The `layer1-sim.yml` job sends SKILL.md to the Claude API on every merge to `main` (opt-in via `ANTHROPIC_API_KEY` secret; skipped cleanly when absent). ~16 seconds for the full PR suite locally; comparable in CI.

## What's deliberately out of scope for `bun test`

Three categories of gaps were identified in the original roadmap. PR #69 closed substantial portions of all three; the remaining gaps are smaller and explicitly tracked below.

### 1. True Layer 1 simulation (Claude reading the SKILL.md and acting)

**PR #69 implemented two complementary mitigations**:

- **Static structural analyzer** at `src/smoke/skill-body-structure.test.ts` enforces invariants that any faithful reader (Claude or a deterministic interpreter) needs: the Tool restrictions section is present and lists the right tools, the AR9 action discriminator is documented, the body references at least one declared agent, no TODO/FIXME markers slip through, the prescribed `bun run` Layer-2 invocation is in a real bash code block. **17 passing tests**.
- **Claude API harness** at `tests/harness/layer1-claude-sim.test.ts` + `.github/workflows/layer1-sim.yml` sends each SKILL.md to the real Claude API (Haiku 4.5) and asserts Claude's intended bash invocation matches the prescribed entry point. **Skipped by default** (env-gated on `ANTHROPIC_API_KEY`); enable by setting the repo secret.

What's STILL not covered:
- Whether Claude's response-handling for the AR9 dispatch action correctly invokes the Task tool with the right agent + dispatch-spec path + model parameter (the harness asks Claude to DESCRIBE the bash command; not to execute the full four-step dance).
- Multi-turn conversational drift — the harness sends one message; production has Claude reading SKILL.md → invoking Bash → reading the JSON line → invoking Task → reading the response → invoking Bash again. Each turn is a chance to drift.
- Whether the SKILL.md prose survives Claude's summarization under context pressure (a long session may compress earlier turns including the SKILL.md body).

**Future work** (Epic 7 candidate):
- A multi-turn harness that simulates the full AR9 four-step Layer-1 dance with a recorded Task-tool stub. Same API key requirement; ~10× the per-run cost.

### 2. End-to-end multi-iteration loop with real Task dispatch

**PR #69 implemented the Layer-1 simulation harness** at `src/smoke/multi-iter-pipeline.test.ts`. It drives `runNext` → mock-Task (writes synthetic artifact) → `runVerifyAndAdvance` for N iterations against a tmpdir + fake BMAD plugin. Asserts state.yaml.lastSuccessfulStep advance, runHistory[] accumulation (with real token counts), per-iter transcript pair writes. **2 passing tests** covering the 3-iteration happy path and token-count accumulation.

What's STILL not covered:
- Real sub-agent dispatch with a real Claude model executing the BMAD persona's prompt. The harness writes synthetic artifacts; verifier behaviour against REAL sub-agent output is not exercised.
- Failure-policy interaction across iterations (retry → escalate → halt; `--continue-on-error` allowing iter 2 past iter 1 halt; `--auto-fix` route-to-fixer round-tripping into iter+1). The mock-Task always succeeds; testing failure round-trips requires the harness to vary its synthetic outputs.
- `--checkpoint-each <type>` end-to-end flow (snapshot creation, FIFO eviction at 50 entries).

**Future work** (Story 6.x):
- Extend the harness with a "Task-recording fixture" — a sub-agent that reads its dispatch-spec, writes a deterministic artifact, and records the request/response into a JSON ledger. Replay the ledger in tests for cross-environment reproducibility.
- Add failure-injection variants: `mockTaskDispatch` parameterized with `{ pass | fail-once-then-pass | fail-always }` modes to exercise retry / route-to-fixer / escalate end-to-end.

### 3. Real BMAD upstream + real `tgorka/bmad-plugin` install

**PR #69 extended `.github/workflows/bmad-compat.yml`** with three checks against the real BMAD upstream every Monday:
1. `/bmad-next --doctor` (existing).
2. `/bmad-loop --plan-first --max-iters 1` (NEW — read-only DAG resolution against all real skills).
3. The skill-frontmatter sanity sweep (NEW — guards against `Bun.YAML` API changes).

Issue body now reports which step failed for faster triage.

What's STILL not covered:
- A real dispatch path (e.g., `bmad-brainstorming` against `tgorka/bmad-plugin@6.6.0` with a real Claude sub-agent producing a real artifact). This costs Claude tokens and is gated behind a future workflow.

**Future work** (Epic 6+):
- A `real-bmad-dispatch.yml` workflow (manual `workflow_dispatch` trigger only) that installs `tgorka/bmad-plugin`, dispatches `bmad-brainstorming` via the real Layer-1 path, and asserts the artifact shape. Costs ~$0.20 per run on Sonnet; gate behind manual trigger initially.

## Determinism & flake risk audit

`src/smoke/loop-stop-conditions.test.ts` from PR #67 still uses `--time-budget 1ms` to fire the time-budget stop condition via subprocess. This is the most likely flake source today. PR #68's `src/smoke/loop-matrix.test.ts` superseded the most fragile subprocess assertions with deterministic in-process equivalents; the subprocess version remains as belt-and-suspenders coverage of the parser path. If we observe flakes in CI, drop the subprocess time-budget case.

Other potential flake sources:
- Subprocess startup latency under load (the smoke tests spawn `bun run` ~10× total; on a busy CI runner each spawn is ~50–200ms). Mitigated by `bun test` parallelism + tmpdir-per-test isolation.
- File system race on `fs.cp` of the fixture (no concurrent access; safe).
- AR9 stdout discipline assertion expecting EXACTLY one line (defensive: filter empty lines before counting; already implemented).

## Cadence + ownership

| Track | Cadence | Owner | Status |
|-------|---------|-------|--------|
| `bun run check` (units + integration + smoke) | Per PR + per push | CI gate | **active** — mandatory pre-merge |
| `bmad-compat.yml` doctor + plan-first + frontmatter sweep | On merge to `main` + `workflow_dispatch` | CI | **active** — files issue on failure (PR #69 extended) |
| `layer1-sim.yml` Claude API harness | On merge to `main` + `workflow_dispatch` | CI | **active opt-in** — set `ANTHROPIC_API_KEY` repo secret to enable; otherwise skips cleanly (PR #69 added) |
| Multi-iter pipeline harness | Per PR | CI gate | **active** — `src/smoke/multi-iter-pipeline.test.ts` runs in `bun run check` (PR #69 added) |
| Multi-turn Layer-1 harness (multi-step AR9 dance) | TBD | Maintainer | **future** (Epic 7 candidate) |
| Failure-injection multi-iter (retry / route-to-fixer / escalate end-to-end) | TBD | Maintainer | **future** (Story 6.x) |
| Real BMAD dispatch CI (`real-bmad-dispatch.yml`) | TBD | Maintainer | **future** (Epic 6+) — manual workflow_dispatch initially |

Open this doc when adding a new test surface — extend the relevant section so the architectural gaps stay visible.
