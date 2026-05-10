# Debugging BMAD Stepper

Forensic surfaces for diagnosing a stuck loop, a halt-with-actionable-error, or a "why did Stepper pick that step" surprise. Everything below is read-only — none of these tools mutate `state.yaml`.

## On-disk transcripts (the canonical forensic record)

Stepper writes a per-step transcript pair on every dispatch, success or fail:

| Path | Purpose |
|------|---------|
| `_bmad-output/.stepper/runs/<ts>-<step>.log`  | Markdown transcript — human-readable; includes State delta, Verifier result, Outcome sections. |
| `_bmad-output/.stepper/runs/<ts>-<step>.json` | JSON run-log validated against `RunLogV1Schema`; includes `runId`, `tokensIn`, `tokensOut`, `durationMs`, `verifierStatus`, `failureCode` (on halt), full `Error.stack` (on halt — kept OUT of the AR9 main-thread emission per NFR-M2). |

Per FR43 + FR44 the JSON is the load-bearing forensic format; the markdown is its rendered companion.

For loop runs, an additional aggregate transcript captures the loop-level exit reason:

```
_bmad-output/.stepper/runs/<loopStartedAt>-loop-exit.json
```

Contains `stopReason` (the discriminated union variant), `iterationCount`, `durationMs`, `snapshot` (Git branch + sha), and the composed Story 4.10 two-line message. A halted iteration's actionable hint surfaces under `stopReason.iterationMessage` — useful for diagnosing a halt without re-running the loop.

The `runs/` directory has a 90-day rolling retention (NFR-Sc4); older transcripts auto-archive to `runs/.archive/` on session start.

## State surfaces

`_bmad-output/.stepper/state.yaml` carries:

- `lastSuccessfulStep` — the most recently completed step.
- `lastAttempted` — the dispatched-but-not-yet-completed step (set on dispatch, cleared on success). Populated when a halt fires and is the load-bearing field for `--resume`.
- `lastFailureReason` — `{ code, message, hint, runId }` on halt; auto-cleared on the next successful step.
- `runHistory[]` — append-only per-attempt records: `{ runId, step, attemptNumber, outcome, failureCode, completedAt, tokensIn, tokensOut, skipped?, fixAttempt? }`.
- `checkpoints[]` — Git branch + sha snapshots written by `--checkpoint-each <type>`; FIFO-evicted at 50 entries (architecture line 405).
- `lastSnapshot` — the most recent branch/sha captured by `detectSnapshot()` (Story 1.8); used for the loop's exit-reason resume hint.

A `state.yaml.bak` lives next to `state.yaml` — the last-good rollback (atomic tmp+rename + `.bak` rotation per NFR-S5). When `state.yaml` is corrupt, restore from `.bak` or run `/bmad-next --recompute-state` (NFR-R3 — state.yaml is recomputable from disk).

## Read-only flags

| Flag | What it tells you |
|------|------|
| `/bmad-doctor` | Five-line stderr block: BMAD detected, project name, state file presence, step registry node count, suggestion. Exit 0 / 1 / 3 / 5 per FR53. |
| `/bmad-doctor --verbose` | Same five lines + a `Diagnostics (--verbose):` block listing detected install paths (cache + legacy), seed version, DAG node count, state file path, lock dir state, last 3 run-log entries. v0.2.0+. |
| `/bmad-next --doctor` | Identical to `/bmad-doctor`. |
| `/bmad-next --explain` | Reasoning trace for the next-step decision (which DAG nodes are ready, which are blocked, why). |
| `/bmad-next --list` | Full list of candidate next steps with their phase, persona, and dependency status. |
| `/bmad-next --diff-state` | Delta between `state.yaml` and `state.yaml.bak` — useful for "what just changed" before/after a step. |
| `/bmad-next --export-state` | Dumps `state.yaml` as JSON to stdout (the ONE AR9 carve-out per Story 3.10 — JSON goes directly to stdout, NOT wrapped in an AR9 envelope). Pipe through `jq` for analysis. |
| `/bmad-next --watch` | Tail the most recent `runs/<ts>-<step>.log` for an in-flight dispatch. |
| `/bmad-next --plan-first` | Dry-run the next-step decision without dispatching anything. |
| `/bmad-loop --plan-first` | Same, for the loop — emits the planned step sequence + first-stop-condition prediction. |

## STEPPER_TRACE — env-gated diagnostic stream

Set `STEPPER_TRACE=1` (or any non-empty, non-`0`/`false` value) to enable the `traceLog()` diagnostic stream. Lines route to **stderr** with a `[trace]` prefix; the AR9 stdout discipline (FR54) is preserved — exactly one JSON line on stdout per command invocation regardless of the env var.

```bash
STEPPER_TRACE=1 bun run src/commands/next/run.ts -- --doctor 2>&1 | grep '\[trace\]'
```

Current trace sites:

| Subsystem | What it logs |
|-----------|--------------|
| `bmad-detect` | Detected install layout (`marketplace` / `legacy` / `none`) and the resolved plugin directory. |
| `dag` | Per-skill resolution tier (`seed/override` / `frontmatter`) when building the DAG. |

The trace is zero-overhead when off (the env-var check short-circuits before any string work). Add new sites freely on hot paths via `import { traceLog } from "src/io/log.ts"; traceLog("subsystem: msg");`.

## Debug recipes

### "The loop halted on iter 1"

The no-progress detector fires when a `dispatch` action returns successfully but `state.lastSuccessfulStep` does not advance pre→post — almost always means the per-iteration Task subagent did not actually run (a v0.1 SKELETON limitation in some skill bodies). Inspect:

1. `_bmad-output/.stepper/runs/<latest>-loop-exit.json` — `stopReason.code === "no-progress-detected"` confirms the fire site.
2. The per-iteration `_bmad-output/.stepper/runs/<latest>-<step>.json` — does the JSON show `verifierStatus: "pass"` despite no state advance? Inspect `runHistory[]` to see whether `lastSuccessfulStep` was supposed to advance.
3. `staging/<runId>/dispatch-spec.json` — was a real spec emitted? If yes but no Task ran, the issue is in the slash-command skill body's Task dispatch step.

### "The halt says EXIT_3 — BMAD not installed but I have BMAD installed"

The detector reads `~/.claude/plugins/installed_plugins.json` first (marketplace install) and falls back to scanning `~/.claude/plugins/bmad-method-*` (legacy npx layout). With `STEPPER_TRACE=1` enabled, the `[trace] bmad-detect: layout=...` line tells you which path the detector resolved — or `layout=none` if neither was found.

`/bmad-doctor --verbose` lists the detected directories under both layout roots, so you can spot a typo or a missing marketplace install at a glance.

### "I want to roll back the last state.yaml change"

`state.yaml.bak` is the last-good rollback (single-slot, written atomically via tmp+rename per NFR-S5). To restore:

```bash
cp _bmad-output/.stepper/state.yaml.bak _bmad-output/.stepper/state.yaml
```

If `.bak` itself is corrupt, run `/bmad-next --recompute-state` (NFR-R3 — state is recomputable from disk; the `recompute.ts` subsystem reads project files and rebuilds the cache).

### "Where's the run log for sub-agent X?"

Per-step transcripts live at `_bmad-output/.stepper/runs/<ts>-<step>.{log,json}`. To find the most recent:

```bash
ls -t _bmad-output/.stepper/runs/*.log | head -3
```

Or use `/bmad-next --watch` to tail an in-flight run.

The run-log JSON validates against `RunLogV1Schema` (`src/schemas/run-log.ts`) — if a JSON file fails to parse, the schema migration tool can tell you which field drifted from the contract.

### "The loop is spending all my tokens"

Every `runHistory[]` entry carries `tokensIn` / `tokensOut`. To see cumulative usage:

```bash
/bmad-next --export-state | jq '[.runHistory[] | (.tokensIn + .tokensOut)] | add'
```

Then re-invoke the loop with `--token-budget N` to cap (Story 4.5; the budget halts cleanly with a `token-budget-reached` stop reason at the cap; an 80% warning fires once on stderr).

### "Why did Stepper pick THAT step?"

`/bmad-next --explain` shows the DAG resolution trace: which nodes were considered, which were ready, which were blocked, and which won the tie-break. For a deeper view, `STEPPER_TRACE=1 /bmad-next --explain` adds the per-skill `tier=seed/override` / `tier=frontmatter` decisions — useful when an `overrides:` block in `bmad-stepper.config.yaml` is mis-shadowing a seed entry.

## Network discipline

Stepper makes ZERO main-thread network calls except inside `src/upgrade/` (the GitHub Releases version-check). The integration sweep at `src/integration/no-network-on-main.test.ts` enforces this — if you see unexpected network activity from a non-upgrade code path, it's a bug.

## See also

- [`docs/exit-codes.md`](exit-codes.md) — FR53 exit-code catalog with verbatim remediation hints.
- [`docs/configuration.md`](configuration.md) — `bmad-stepper.config.yaml` schema; the `failurePolicies:` block is the per-step retry/skip/route-to-fixer/escalate policy.
- [`docs/bmad-compatibility.md`](bmad-compatibility.md) — per-Stepper-release BMAD compat history; covers detector behavior under both install layouts.
- [`docs/architecture.md`](architecture.md) — three-layer execution model, AR9 stdout discipline, AR41 module boundary graph.
