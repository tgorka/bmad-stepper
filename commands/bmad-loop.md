---
description: Run /bmad-next in a bounded loop with stop conditions
argumentHint: "[--max-iters N] [--until-epic-end] [--until-story X.Y] [--next-story] [--phase-end] [--time-budget MS] [--token-budget N] [--stop-on-error|--continue-on-error] [--plan-first] [--checkpoint-each analysis|planning|solutioning|implementation|retro] [--interactive] [--auto-fix]"
allowedTools: ["Bash", "Task", "Read"]
---

# /bmad-loop

Run `/bmad-next` repeatedly inside a bounded loop until a stop condition
fires. Layer 1 orchestrator: Bash → AR9 JSON line → (per-iteration Task →
Bash verify-and-advance) → final-summary report.

Story 4.1 wired `--max-iters` (with a default-50 cap added in Story 4.4);
Stories 4.2 + 4.3 wired the four condition flags `--until-epic-end`,
`--until-story X.Y`, `--next-story`, `--phase-end`. Story 4.5 wired the
two budget flags (`--time-budget MS`, `--token-budget N`); Story 4.6
wired the failure-policy flags (`--stop-on-error`, `--continue-on-error`);
Story 4.7 wired `--plan-first` (dry-run preview); Story 4.8 wired
`--checkpoint-each <step-type>` (per-iteration checkpoint snapshot per
AR13 Layer 1); Story 4.9 wired SIGINT graceful exit (FR24, NFR-R5 — Ctrl-C
halts cleanly within 30 seconds); Story 4.10 wired the unified loop-exit-
reason emission format (FR26 — every loop exit emits a human-readable
reason + state-snapshot pointer + `/bmad-next --resume` hint, plus a
structured JSON transcript under `runs/`).

## Usage examples

```
/bmad-loop --max-iters 1
/bmad-loop --max-iters 50
/bmad-loop --until-epic-end          # Story 4.2 — runtime-wired
/bmad-loop --until-story 4.5         # Story 4.2 — runtime-wired
/bmad-loop --next-story              # Story 4.3 — runtime-wired
/bmad-loop --phase-end               # Story 4.3 — runtime-wired
/bmad-loop --time-budget 7200000 --token-budget 200000  # Story 4.5
/bmad-loop --plan-first              # Story 4.7 — RUNTIME-WIRED in 4.7
/bmad-loop --checkpoint-each implementation  # Story 4.8 — RUNTIME-WIRED in 4.8
/bmad-loop --interactive             # Story 5.5 — pause-between-steps
/bmad-loop --auto-fix                # Story 5.3 — RUNTIME-WIRED in 5.3 (route-to-fixer)
```

The `$ARGUMENTS` token below expands to the user's text after `/bmad-loop`
per Claude Code's standard slash-command tail-string expansion. Flags are
forwarded verbatim to `src/commands/loop/run.ts`'s argv (Story 4.1
`parseLoopArgs` consumes them).

## Behavior

`/bmad-loop` runs in one of two modes, selected by the presence of
`--plan-first` in `$ARGUMENTS`:

- **Default mode (Layer-1 driver loop)** — repeats the `/bmad-next`
  Bash + Task + Bash + summary cycle up to `--max-iters` times, with
  Claude (the slash-command Layer-1 LLM) driving the iteration. This
  is the v0.1.x production path: it can fire the `Task` tool per
  iteration, so `state.lastSuccessfulStep` advances and the loop makes
  real progress. Other stop-condition flags (`--until-X`,
  `--time-budget`, `--token-budget`, `--checkpoint-each`,
  `--interactive`, `--auto-fix`, `--stop-on-error`) are recognised by
  the underlying TypeScript code but are NOT yet wired in this driver
  loop — only `--max-iters` (with the FR25 default-50 cap) controls
  the iteration count for now. Future stories will lift these into the
  driver.
- **Plan-first mode (`--plan-first`)** — delegates to the read-only
  TypeScript loop runner at `src/commands/loop/run.ts`. The runner
  resolves the planned step sequence (no dispatch, no Task), emits a
  single AR9 `report` JSON line, and exits. Layer 1 prints the message
  verbatim and exits.

### 0. Mode selection.

If `$ARGUMENTS` contains `--plan-first`, jump to the **plan-first
delegation** subsection (Step 4 below — the original single-Bash-
invocation flow). Otherwise, run the **Layer-1 driver loop** described
in Steps 1-3.

### 1. Setup — parse `--max-iters` and initialise iteration state.

Parse `--max-iters N` from `$ARGUMENTS`. When absent, default to `50`
(per FR25 — prevents accidental infinite loops on a fresh project).
Initialise:

```
iter_count   = 0
max_iters    = <parsed N or 50>
```

Forward the rest of `$ARGUMENTS` (everything except `--max-iters` and
its value) verbatim to each per-iteration `bun run
src/commands/next/run.ts` call as `$NEXT_ARGS` (so e.g. `--resume`,
`--skip`, `--auto-fix`, `--explain`, etc., still flow through to
`/bmad-next`'s parser).

### 2. Per-iteration body: Bash → JSON line read → Task → Bash → summary.

Repeat the following sub-steps until either `iter_count == max_iters`
(max-iters exit, see Step 3) OR an early break fires from a `report`
or `halt` action (sub-steps 2d / 2e):

#### 2a. Bash — invoke the lock-free pre-dispatch composer.

```bash
bun run src/commands/next/run.ts -- $NEXT_ARGS
```

This is the SAME entry-point the standalone `/bmad-next` slash command
uses (`commands/bmad-next.md` Step 1). It reads `state.yaml` (lock-
free), computes the next step, builds `staging/<runId>/dispatch-spec.json`,
and emits exactly ONE AR9 JSON line on stdout.

#### 2b. Parse the single stdout JSON line as `jsonLine`.

Per `src/schemas/dispatch-protocol.ts` (`DispatchActionV1Schema`), the
shape is one of three discriminated variants — `dispatch`, `report`,
or `halt`. See `commands/bmad-next.md` Step 2 for the full schema
reference. Increment `iter_count`.

#### 2c. `jsonLine.action == "dispatch"` — execute the step end-to-end.

Mirrors `commands/bmad-next.md` Steps 3-6 verbatim:

1. **Task** — invoke the sub-agent with the dispatch spec and the
   configured per-step model:
   ```
   Task(
     agent  = <jsonLine.agent>,
     prompt = "staging/<jsonLine.runId>/dispatch-spec.json",
     model  = <dispatchSpec.model>     # read from staging/<runId>/dispatch-spec.json's `model` field
   )
   ```
2. **Capture token counts** from the Task response object
   (`response.tokens_in`, `response.tokens_out`). Fall back to `0 / 0`
   when the runtime does not surface them.
3. **Bash verify-and-advance** — lock-acquiring post-dispatch runner:
   ```bash
   bun run src/commands/next/verify-and-advance.ts -- \
     --run-id <jsonLine.runId> \
     --tokens-in <tokens_in> \
     --tokens-out <tokens_out> \
     --last-attempted-json '<JSON.stringify(jsonLine.lastAttempted)>'
   ```
4. **Parse the second AR9 JSON line.** If its `action == "halt"`,
   print the `message` field VERBATIM and exit with the line's
   `exitCode` (≥ 1) — `halt-on-error`. Do NOT continue the loop.
5. **Print the FR18 one-line summary** (the second AR9 line's
   `message` field) verbatim. Then continue to the next iteration
   (back to sub-step 2a) — do NOT exit.

#### 2d. `jsonLine.action == "report"` — graceful exit.

- When `jsonLine.awaitInput == true`, the next step is flagged
  `interactive: true` and `runNext` has written a questions stub at
  `jsonLine.awaitInputPath`. Print `jsonLine.message` verbatim and
  exit `0` (`await-input` stop reason). The user (or this Layer-1
  LLM) fills the stub by replacing each `<!-- FILL_ME -->` marker
  with an answer, then re-invokes `/bmad-loop` (or
  `/bmad-next --resume`).
- Otherwise (no `awaitInput` field), the report is the all-steps-
  complete short-circuit ("All BMAD steps for this project are
  complete..."). Print `jsonLine.message` verbatim and exit `0`.
- In BOTH cases, do NOT continue the iteration loop.

#### 2e. `jsonLine.action == "halt"` — actionable error.

Print `jsonLine.message` verbatim and exit with `jsonLine.exitCode`
(≥ 1). Do NOT continue the loop. The dispatch was not performed —
there is nothing to verify.

### 3. Loop-exit summary — `--max-iters` reached.

When the iteration body completes `max_iters` times without an early
break, emit the unified Story 4.10 two-line exit summary:

```
Loop exited: max-iters (<N>) reached.
Snapshot: <state.yaml.lastSnapshot.sha>. Resume: /bmad-next --resume.
```

When `state.lastSnapshot` is null/absent (non-Git project per Story
1.8), emit only the first line. Exit code `0` per FR53 (clean exit;
the user-supplied cap was respected).

### 4. Plan-first delegation (`--plan-first` only).

When `$ARGUMENTS` contains `--plan-first`, the Layer-1 driver loop
above is BYPASSED and Layer 1 invokes the read-only TypeScript loop
runner unchanged:

```bash
bun run src/commands/loop/run.ts -- $ARGUMENTS
```

The runner parses `$ARGUMENTS` via `parseLoopArgs` (Story 4.1), validates
the 13-field surface via `LoopArgsSchema.strict()`, and enters the
iteration loop. Each iteration:

1. Evaluates the stop-condition gate (`shouldStop(iterCount, args)`).
   Story 4.1 wired `--max-iters`; Story 4.4 added the `--max-iters=50`
   default cap (FR25); Stories 4.2 + 4.3 wired four more flags
   (`--until-epic-end`, `--until-story X.Y`, `--next-story`,
   `--phase-end`); Story 4.5 wired two budget flags (`--time-budget MS`,
   `--token-budget N`); Stories 4.6-4.10 will wire the remaining flags.
2. If stop-condition fires, breaks with the StopReason (one of
   `max-iters-reached`, `halt-on-error`, OR any of the seven
   Story-4.2/4.3/4.5/4.6 variants `epic-end-reached` /
   `until-story-reached` / `next-story-reached` / `phase-end-reached` /
   `time-budget-reached` / `token-budget-reached` / `error-stop`).
2.5. When `--plan-first` is supplied (Story 4.7), the runner short-
   circuits BEFORE the iteration body — emits a single AR9 `"report"`
   JSON line carrying the planned step sequence and exits 0 without
   dispatching anything. The StopReason variants do not apply in
   plan-mode.
3. Else, invokes `runNext` once via in-process function call.
4. Captures the per-iteration result into an `IterationRecord`
   (`{ iterCount, runId, action, exitCode, durationMs, startedAt }`).
5. On `runNext` halt (non-zero exitCode OR `action === "halt"`),
   short-circuits with `halt-on-error`.
5.5. When `--checkpoint-each <step-type>` is supplied (Story 4.8), the
   per-iteration `verify-and-advance.ts` post-step state save APPENDS a
   `state.checkpoints[]` entry IF the just-completed step's phase
   matches the supplied step-type. The append is silent (no AR9 / no
   stderr emission); the user observes the checkpoint via `state.yaml`
   inspection or via the exit-reason resume hint (Story 4.10 forward
   dependency).
6. SIGINT (Ctrl-C, Story 4.9) on a running loop sets a `shutdownRequested`
   flag; the in-flight sub-agent finishes its current write; the loop halts
   BEFORE the next iteration's stop-condition check. Total SIGINT-to-clean-
   exit time is under 30 seconds (NFR-R5). Exit message: composed by Story
   4.10 unified `formatLoopExitLines`: `Loop exited: manual (SIGINT) —
   partial work committed; --resume available.\nSnapshot: <sha>. Resume:
   /bmad-next --resume.`. Exit code: `0` (clean exit per FR53; the user
   requested the halt). The Story 4.9 AC-3 substrings (`manual (SIGINT)`,
   `partial work committed`, `--resume available`) are preserved by the
   Story 4.10 unified format.

After the loop exits, the runner emits a SINGLE AR9 JSON line of the
form:

```
{ "action": "report", "message": "<exit reason summary>", "exitCode": <0|1> }
```

Per AR9 + FR54, no project lock is acquired during the loop runner
itself (the runner is read-only at the top tier; per-iteration
`verify-and-advance.ts` invocations are unchanged and acquire/release
their own locks).

Exit-code mapping per FR53 + Story 4.1:

- `0` — clean exit (one of `max-iters-reached`, `epic-end-reached`,
  `until-story-reached`, `next-story-reached`, `phase-end-reached`,
  `time-budget-reached`, `token-budget-reached`,
  `all-steps-complete`, `no-progress-detected`, `await-input`).
- `1` — `halt-on-error` OR `error-stop` (Story 4.6 — verifier failure
  under default `--stop-on-error` policy). Both variants surface exit
  code `1` per FR53 `halt-with-actionable-error`; the AR22-conformant
  message text is the differentiator (the `error-stop` variant emits
  `error (verifier failure on <step>) — see <run-log-path>` per AC-1;
  `halt-on-error` retains the v0.1 generic-halt message format for
  non-verifier halts).
- `2` — argument parse error (configuration error per FR53).

**Interactive-step pre-flight halt** (`await-input`): when the next
resolved step is flagged `interactive: true` in the DAG seed (e.g.,
`bmad-brainstorming`, `bmad-create-prd`, `bmad-create-architecture`),
the underlying BMAD skill needs user dialogue before it can produce a
useful artifact. `runNext` short-circuits the dispatch: it writes a
questions stub at `_bmad-output/.stepper/pending-input/<step>.md` and
emits an AR9 `report` with `awaitInput: true`. The loop halts with
the `await-input` StopReason on iter 1 (or whenever the interactive
step is reached) and exit code `0`. The user (or this loop's Layer 1
LLM) fills the stub by replacing each `<!-- FILL_ME -->` marker with
the answer, then re-invokes `/bmad-loop` (or `/bmad-next --resume`).
On the re-invocation, the runner detects the filled file and includes
it in the dispatch's `taskSpec.context[]` so the sub-agent has the
user's answers and runs non-interactively.

**No-progress detector**: when an iteration's `dispatch` action
succeeds but `state.lastSuccessfulStep` does not advance pre→post,
the per-iteration Task subagent did not run (the v0.1 SKELETON
limitation flagged in §4 below — the loop runner is a single Bun
process and cannot invoke the Task tool, which is a Layer 1
capability). The runner halts on iter 1 with the `no-progress-detected`
StopReason and the AR9 message
`no-progress detected (dispatched <step> but state did not advance) —
run /bmad-next to execute the dispatched step`. Exit code `0` (clean
exit; the user is steered toward `/bmad-next` rather than allowed to
spin to `--max-iters` producing 50 wasted staging dirs for the same
step).

Plan-mode (`--plan-first`) ALWAYS maps to exit code `0` (clean exit;
the dry-run is the success path per Story 4.7 AC-1).

#### 4a. Plan-first runner: parse the single stdout JSON line.

The runner emits EXACTLY ONE JSON line on stdout — the loop's exit
summary. The shape is the AR9 `report` variant per
`src/schemas/dispatch-protocol.ts`:

```
{ "action": "report",
  "message": "<exit reason summary, e.g. 'max-iters (50) reached'>",
  "exitCode": <number> }
```

Parse the single line via `JSON.parse`. Do NOT inspect any other stdout
content — the runner is contractually bound to emit exactly ONE line
per AR9 + FR54.

#### 4b. Plan-first runner: print the FR18 one-line summary.

Print the `message` field VERBATIM as a single human-readable line. Do
NOT embellish with prefixes ("Stepper says:", "ERROR:", etc.) — the
message is already FR18-conformant. Exit with the JSON line's
`exitCode` (per the FR53 mapping above).

After this, `/bmad-loop` returns control to the user. The
per-iteration transcripts (`<ts>-<step>.{log,json}` under
`_bmad-output/.stepper/runs/`) are on disk for `/bmad-next --watch`
(Story 3.9), `/bmad-next --diff-state` (Story 3.8), and
`/bmad-next --export-state` (Story 3.10) to consume.

#### 4c. Plan-first runner: per-iteration AR34 pattern (replayed INSIDE the runner).

For every iteration the runner internally repeats the four-step AR34
pattern that the standalone `/bmad-next` slash-command markdown
prescribes:

1. **Bash** (in-process equivalent): the runner calls `runNext` directly.
2. **JSON line read**: the runner reads the AR9 line from `runNext`'s
   structured return value (NOT stdout — in-process invocation).
3. **Task** (per-iteration dispatch): when `runNext` returns a `dispatch`
   action, the dispatch is recorded in the iteration record. The Bun
   loop runner DOES NOT actually invoke the Task tool from inside the
   iteration — the per-iteration Task→verify-and-advance flow is owned
   by the slash-command Layer-1 driver loop documented in Steps 1-3 above
   (default mode) and by the standalone `/bmad-next` slash-command path
   (single-step mode). Story 4.1's loop runner is therefore consulted
   only for plan-first / dry-run preview today: when used with the
   test-injection stub, it asserts call counts; when used in production
   via `bun run src/commands/loop/run.ts --plan-first`, the runner
   resolves the planned step sequence without dispatching anything.
   In default `/bmad-loop` mode the Layer-1 driver above replaces this
   path entirely.

   Story 6.3 — when the future Task-per-iteration wiring lands, the
   per-iteration Task invocation MUST forward the `model` parameter
   from the dispatch-spec.json's `model` field (e.g.,
   `Task(agent=<jsonLine.agent>, prompt="staging/<runId>/dispatch-spec.json",
   model=<dispatchSpec.model>)`) so the configured per-step model
   (`config.models[step] ?? "sonnet"`) routes the sub-agent to the
   requested Anthropic Claude tier. Best-effort caveat (`where supported`):
   if the runtime does not honour the `model` parameter, fall back to
   default behaviour. Stepper records the configured model in the
   dispatch-spec.json + transcript markdown + JSON run log for audit
   purposes (the configured model is the user's INTENT; runtime
   acceptance is best-effort). See `commands/bmad-next.md` for the
   canonical Task-with-model invocation shape and `docs/configuration.md`
   `models:` section for configuration syntax.

   Story 6.4 — the dispatch-spec.json's `budget.timeoutMs` field carries
   the configured per-step timeout cap (default 300000ms / 5min;
   `budget.contextTokens` defaults to 60000). The Claude Code Task tool
   runtime is responsible for enforcing the cap and surfacing a TIMEOUT
   condition if exceeded. Best-effort caveat (`where supported`):
   runtime acceptance of the `timeoutMs` cap is tool-internal; the
   Task tool does NOT accept a per-call `timeoutMs` parameter. Stepper
   records the cap in the dispatch-spec.json + transcript markdown +
   JSON run log for audit purposes (the configured cap is the user's
   INTENT; runtime enforcement is best-effort). If the runtime exceeds
   the cap, the slash-command markdown forwards `--error-code TIMEOUT`
   to `verify-and-advance.ts` which constructs `TimeoutError` (registry
   code TIMEOUT, exitCode 1, single-line hint). See
   `docs/configuration.md` `budgets:` section for configuration syntax.
4. **Bash verify-and-advance** (per-iteration): when the per-iteration
   `runNext` returns a `dispatch` action, the post-dispatch Bash
   `verify-and-advance.ts` invocation is owned by the slash-command
   Layer-1 driver loop (sub-step 2c above) — the Bun loop runner itself does
   NOT spawn the second Bash process. In plan-first mode there is no
   dispatch and therefore no verify-and-advance to run.

The per-iteration AR9 lines from `runNext` are CAPTURED in-process via
the structured return value — they do NOT stream to stdout per-iteration
(per Story 4.1 §Open Question 4 "buffered vs streamed" — v0.1 chooses
final emission for cleaner AR9 invariant). The per-iteration outcome is
recorded in `IterationRecord[]` and folded into the final AR9 summary.

## Stop conditions

Story 4.1 wired `--max-iters` (with the default-50 cap added in Story
4.4); Stories 4.2 + 4.3 wired the four condition flags. The full
13-field surface is parsed by `LoopArgsSchema`; only the wired flags
drive runtime branching:

| Flag                   | Story    | Status                              |
|------------------------|----------|-------------------------------------|
| `--max-iters N`        | 4.1+4.4  | RUNTIME-WIRED + DEFAULT 50 in 4.4   |
| `--until-epic-end`     | 4.2      | RUNTIME-WIRED in 4.2                |
| `--until-story X.Y`    | 4.2      | RUNTIME-WIRED in 4.2                |
| `--next-story`         | 4.3      | RUNTIME-WIRED in 4.3                |
| `--phase-end`          | 4.3      | RUNTIME-WIRED in 4.3                |
| `--time-budget MS`     | 4.5      | RUNTIME-WIRED in 4.5                |
| `--token-budget N`     | 4.5      | RUNTIME-WIRED in 4.5                |
| `--stop-on-error`      | 4.6      | RUNTIME-WIRED in 4.6                |
| `--continue-on-error`  | 4.6      | RUNTIME-WIRED in 4.6                |
| `--plan-first`         | 4.7      | RUNTIME-WIRED in 4.7                |
| `--checkpoint-each X`  | 4.8      | RUNTIME-WIRED in 4.8                |
| `(SIGINT)`             | 4.9      | RUNTIME-WIRED in 4.9 (OS signal — no CLI flag) |
| `--interactive`        | 5.5      | RUNTIME-WIRED in 5.5                |
| `--auto-fix`           | 5.3      | parsed only                         |

### `--max-iters N` (Story 4.1, default-cap in 4.4)

Caps the loop's iteration count. After the Nth successful iteration the
loop exits with reason `max-iters (N) reached`.

```
/bmad-loop --max-iters 10
```

**Default cap (Story 4.4)**: when NO stop condition is supplied (no
`--max-iters`, no `--until-epic-end`, no `--until-story X.Y`, no
`--next-story`, no `--phase-end`), the runner injects `--max-iters=50`
automatically per FR25 — preventing accidental infinite loops. When the
user supplies an explicit condition WITHOUT `--max-iters`, NO default
cap is applied (the explicit condition controls the loop's lifetime).

Exit message: `max-iters (N) reached`. Exit code: `0`.

### `--until-epic-end` (Story 4.2)

Halts the loop after the current epic's last story is shipped (and the
optional retrospective is filed if applicable). Emits a state-snapshot
pointer + `--resume` hint to **stderr** on exit (per AC-1). Use for
overnight runs scoped to a single epic.

```
/bmad-loop --until-epic-end
```

Behaviour: after each iteration's `runNext` returns success, the loop
loads `state.yaml` + `sprint-status.yaml` and checks: are ALL stories in
the current epic `done`? Is the `epic-N-retrospective` either `done` or
`optional`? When both conditions hold, the loop exits with
`stopReason.code === "epic-end-reached"` and `exitCode === 0`.

### `--until-story X.Y` (Story 4.2)

Halts the loop when the just-completed iteration's story matches `X.Y`
OR the iteration overshoots into a story past `X.Y`. Format:
`<epic>.<story>` (e.g., `3.2` for epic 3 story 2). The numeric-segment
comparator correctly orders `4.0 > 3.10` (not lexicographic).

```
/bmad-loop --until-story 3.2
```

Exit message: `story 3.2 reached` (verbatim per AC-2). When the loop
overshoots (e.g., the iteration advanced to story 3.3 before the
predicate could fire on 3.2), the structured `StopReason.currentStory`
field captures the overshoot context for tooling consumers.

### `--next-story` (Story 4.3)

Halts the loop when the just-completed iteration's story DIFFERS from
the story at loop entry. Useful for chaining partial work without
committing to a full epic. The baseline story is captured BEFORE the
first iteration; subsequent iterations' completed-story is compared
against the baseline via `compareStoryIds`.

```
/bmad-loop --next-story
```

Exit message: `next-story boundary reached`. Exit code: `0`. The
structured `StopReason` carries `startStory` (the loop-entry baseline)
and `currentStory` (the post-iteration value) for tooling consumers;
the AR9 summary line embeds both for human readers
(`next-story boundary reached (3.2 → 3.3)`).

Edge case: when the loop starts with no prior successful step
(`state.lastSuccessfulStep === null`), the FIRST iteration's resulting
story is captured as the baseline; subsequent iterations fire on
transition.

### `--phase-end` (Story 4.3)

Halts the loop when the just-completed iteration's BMAD phase
(`analysis`, `planning`, `solutioning`, `implementation`, `retro`)
DIFFERS from the phase at loop entry. The baseline phase is looked up
from the DAG (`dag.nodes.get(state.lastSuccessfulStep.step).phase`)
before the first iteration; subsequent iterations' completed-step phase
is compared against the baseline.

```
/bmad-loop --phase-end
```

Exit message: `phase-end (transition <from>→<to>) reached` (e.g.,
`phase-end (transition planning→implementation) reached`). The arrow is
the unicode RIGHTWARDS ARROW (U+2192). Exit code: `0`.

Note: requires the DAG to be loaded; the runner builds the DAG only
when `--phase-end` is supplied (zero-cost otherwise). On graceful DAG-
load failure (rare — defensive only), the predicate short-circuits and
the loop continues with other stop conditions.

### `--time-budget MS` (Story 4.5)

Halts the loop when the wall-clock elapsed time reaches or exceeds the
budget (in milliseconds). At 80% of the budget the loop emits a
single-shot warning to **stderr**; at 100% the loop exits cleanly with
reason `time-budget (Xh) reached, partial work committed`. The unit
suffix (`Xh` / `Xm` / `Xs` / `Xms`) is computed by `formatTimeBudget`
via cascade — the largest unit that exactly divides the millisecond
value (e.g., `7_200_000 → "2h"`, `5_400_000 → "90m"`, `1_500 → "1500ms"`).

```
/bmad-loop --time-budget 7200000   # 2 hours
```

Source: `Bun.nanoseconds()` snapshot at loop entry; per-iteration check
`(Bun.nanoseconds() - startedAtNs) / 1_000_000`. Monotonic — resistant
to system-clock adjustments mid-loop.

Exit message: `time-budget (2h) reached, partial work committed`
(byte-identical to AC-1; epics.md line 966). Exit code: `0`.
Constraint: positive integer only (Zod schema rejects zero / negative).

### `--token-budget N` (Story 4.5)

Halts the loop when the cumulative `tokensIn + tokensOut` reaches or
exceeds the budget. At 80% of the budget the loop emits a single-shot
warning to **stderr**; at 100% the loop exits cleanly with reason
`token-budget (N) reached, used X tokensIn + Y tokensOut`.

```
/bmad-loop --token-budget 200000
```

Token-flow per AR10: Task tool's response carries `usage.input_tokens` /
`usage.output_tokens`; Layer 1 markdown captures them as
`--tokens-in/--tokens-out` flags; `verify-and-advance.ts` writes them
into `state.runHistory[].{tokensIn, tokensOut}` (per Story 2.6); the
loop runner reads the latest entry per-iteration via `loadStateUnlocked`
and accumulates into `LoopMetrics.{tokensIn, tokensOut}`.

Exit message: `token-budget (N) reached, used X tokensIn + Y tokensOut`
where `N` is the budget and `X` / `Y` are the cumulative usage stats at
halt time (per AC-2 "the exit reason includes the actual usage stats").
Exit code: `0`. Constraint: positive integer only (Zod schema rejects
zero / negative).

### `--stop-on-error` (Story 4.6)

The DEFAULT failure policy. When any per-iteration `runNext` halts
because a verifier returned `status: "fail"`, the loop exits cleanly
with reason `error (verifier failure on <step>) — see <run-log-path>`
where `<step>` is `state.lastAttempted.step` and `<run-log-path>` is
`_bmad-output/.stepper/runs/<runId>/`. The flag is OPTIONAL — supplying
it explicitly is a no-op affirmation per UX symmetry with
`--continue-on-error`.

```
/bmad-loop --stop-on-error --max-iters 50    # explicit affirmation
/bmad-loop --max-iters 50                    # implicit default — same
```

Exit message: `error (verifier failure on <step>) — see <run-log-path>`
(byte-identical to AC-1 verbatim per epics.md line 982; em-dash is
U+2014). Exit code: `1` (per FR53 `halt-with-actionable-error`).

Stderr emission per FR26: BEFORE the loop's final AR9 line on stdout,
the runner emits the AC-1 message line + the `state.lastFailureReason.hint`
line on stderr — analogous to Story 4.2's `--until-epic-end` state-
snapshot pointer. Tooling consumers should consult
`_bmad-output/.stepper/runs/<runId>/` for forensic detail (per FR43 +
FR44).

Non-verifier halts (e.g., `LOCK_CONTENTION`, `BMAD_INCOMPATIBLE`)
preserve the v0.1 `halt-on-error` semantics — the differentiator is
`state.lastFailureReason.code`. The two variants coexist in the
StopReason union: tooling consumers branching on `halt-on-error`
continue to work unchanged.

### `--continue-on-error` (Story 4.6)

Opt INTO continuation past per-iteration verifier failures. When
supplied, every halt iteration is logged to stderr (`Warning:
iteration N halted with <failureCode>; continuing per
--continue-on-error.`) but the loop CONTINUES — the next iteration's
`runNext` is invoked normally. Exit code is `0` when the loop exits
via a stop condition AFTER continuing past halts (e.g., a
`--max-iters` cap).

```
/bmad-loop --continue-on-error --max-iters 10
```

Per-iteration `IterationRecord` STILL carries `action: "halt"` +
`exitCode: 1` for forensic visibility — tooling consumers can inspect
`result.iterations[]` to see all halt records, even when the loop
ultimately exited via a non-error stop condition.

**Unbounded-iteration warning**: when `--continue-on-error` is supplied
WITHOUT any other stop condition, the loop has no natural exit. The
runner emits a single-line stderr warning at loop entry alerting the
user to combine with `--max-iters` or another stop condition for
safety:

```
Warning: --continue-on-error supplied without any stop condition; the loop may run indefinitely. Combine with --max-iters or another stop condition for safety.
```

The warning fires AT MOST ONCE per loop run (loop-entry; no per-
iteration repetition). When `--continue-on-error` is combined with
ANY other stop condition (`--max-iters`, `--until-epic-end`,
`--until-story X.Y`, `--next-story`, `--phase-end`, `--time-budget`,
`--token-budget`), the warning does NOT fire.

When NEITHER `--max-iters` nor any other stop condition is supplied,
the loop runner injects `--max-iters=50` as a DEFAULT cap per FR25,
preventing accidental infinite loops (Story 4.4 AC-1). When the user
supplies an explicit stop condition (e.g., `--until-epic-end`,
`--until-story X.Y`, `--next-story`, `--phase-end`, `--time-budget MS`,
`--token-budget N`, `--stop-on-error`, `--continue-on-error`,
`--plan-first`) WITHOUT `--max-iters`, NO default cap is applied — the
explicit condition controls the loop's lifetime. Note: `--plan-first`
is technically NOT a stop condition (it's a pre-flight mode), but for
the purposes of the default-cap suppression it behaves like one.

### `--plan-first` (Story 4.7)

Preview the loop's planned step sequence WITHOUT dispatching anything.
Plan-mode short-circuits BEFORE the iteration body — performs THREE
one-shot read-only loads (state, sprint-status, DAG), computes the
planned step sequence by walking the DAG until the first declared stop
condition would fire (best-effort, since failures may divert), emits a
single AR9 `"report"` JSON line carrying the human-readable plan in
its `message` field, and exits 0 without dispatching anything.

```
/bmad-loop --plan-first
/bmad-loop --plan-first --until-epic-end --max-iters 50
```

Use `--plan-first` before any nightly unattended run to verify your
assumptions about the planned step sequence — by convention, the
overnight-run pattern checks the plan first to avoid starting an
unattended run on a wrong assumption.

**Plan output shape**: a multi-line human-readable text body in the
AR9 `"report"` action's `message` field. The body includes:

- A summary header (`Plan: <N> steps planned (first stop: <code> — <message>)`).
- Total estimated steps + total estimated tokens (Story 6.3 forward
  dependency — v0.1 renders `<unknown — Story 6.3 \`models:\` config required>`
  for the totals; Story 6.3 will replace the stub with a config-driven
  lookup).
- The numbered steps list with `step-name [phase] (epic E, story S) —
  persona — ~tokens in / ~tokens out`.
- Checkpoints section (Story 4.8 forward dependency — when
  `--checkpoint-each <type>` is supplied, plan-mode SURFACES the planned
  checkpoint locations; when not supplied, renders `(none —
  --checkpoint-each not supplied)`).
- A trailing `First stop condition: <code> — <message>` line.

**AR9 stdout discipline**: a SINGLE `"report"` JSON line per command
invocation. The `message` field is a multi-line human-readable string
where embedded newlines are JSON-escaped — the OUTER JSON line stays a
single stdout line per AR9 + FR54.

**Exit code**: ALWAYS `0` (clean exit; the dry-run is the success path
per Story 4.7 AC-1). ZERO tokens are spent on Task subagents; ZERO
state.yaml writes; ZERO checkpoint snapshots.

**Reproducibility (AC-3)**: the plan output is byte-identical across
invocations on the same state. `computePlan` + `formatPlan` are PURE
FUNCTIONS over their inputs — no `Bun.nanoseconds()`, no `new Date()`,
no random IDs. The DAG iteration order is deterministic per `Map`
insertion-order (Story 1.10 invariant). The `PlanResult` wrapper carries
`startedAt` / `completedAt` / `durationMs` for observability — but
those fields are NOT included in `formattedPlan`; reproducibility is
asserted on `formattedPlan` only.

**Forward dependencies**:

- Story 6.3 (`models:` per-step config): replaces the v0.1
  `lookupModelTokens` stub with a config-driven lookup; the formatter
  already accommodates the eventual non-null return path.
- Story 4.8 (`--checkpoint-each <type>` runtime): wires the actual
  snapshot creation at iteration time; plan-mode's checkpoint
  enumeration becomes shared with Story 4.8's runtime path.

**Graceful fallback**: when state.yaml cannot be read OR the DAG build
fails, plan-mode emits a single-line `Plan unavailable — <reason>. Run
/bmad-loop --doctor to diagnose.` message and exits 0. The fallback
preserves AC-1's "exits 0 without dispatching anything" wording.

### `--checkpoint-each <step-type>` (Story 4.8)

Force a Git branch+sha snapshot + state.yaml `.bak` rotation after every
iteration whose just-completed step's `phase` matches `<step-type>`. Per
AR13 Layer 1, the loop appends a `state.yaml.checkpoints[]` entry of
shape `{ branch, sha, takenAt, stepType }` after each matching iteration.
The entries are FIFO-evicted at 50 (architecture line 405 + line 769).

```
/bmad-loop --checkpoint-each implementation       # most common
/bmad-loop --checkpoint-each analysis --max-iters 10
/bmad-loop --checkpoint-each implementation --until-epic-end
```

**Legal step-type values (AC-3)**: `analysis`, `planning`, `solutioning`,
`implementation`, `retro` — the 5 `Phase` literal-union values from
`src/dag/types.ts:30-35`. Any other value is rejected at argv parse time
with PARSE_ERROR (FR53 exit code 2).

**Runtime semantics**: the checkpoint write happens INSIDE
`src/commands/next/verify-and-advance.ts` (lock-held mid-tier) — NOT
inside `runLoop` (lock-free top-tier per AR8). The runner threads
`args.checkpointEach` through `RunNextOptions.checkpointEach` so the
per-iteration `verify-and-advance.ts` can match the just-completed
step's phase against the supplied step-type. The append is silent
(no AR9 / no stderr); the user observes the checkpoint via
`state.yaml` inspection or via the exit-reason resume hint
(Story 4.10 forward dependency).

**AR13 Layer 1 reference** (architecture lines 389-407): Git branch+sha
captured via `detectSnapshot()` (Story 1.8); ISO-8601 takenAt; FIFO-
evicted at 50 entries. The literal string `"HEAD"` is recorded for
detached-HEAD repos.

**AR13 Layer 2 reference**: the `.bak` rotation rides on the existing
`saveState`/`atomicWrite` path (Story 1.6) — ZERO new write sites.

**Non-Git fallback** (Story 4.8 OQ-7): when `detectSnapshot()` returns
null (non-Git work-tree) OR throws (empty repo / git binary missing),
the checkpoint append is SKIPPED gracefully — the iteration completes
successfully and the loop continues. The Story 1.8 stderr warning
("snapshot: not a git repository, lastSnapshot=null") fires once,
providing diagnostic feedback.

**Default-cap interaction** (Story 4.8 OQ-1): `--checkpoint-each` is NOT
a stop-condition. Supplying `--checkpoint-each` ALONE without any stop-
condition flag triggers the default 50-iter cap (the user wants
checkpoints WITH a bounded loop). This contrasts with the 9 stop-
condition flags (which suppress the default-cap when supplied alone).

**Exit code mapping**: unchanged from FR53. Snapshot capture failures
during a successful step do NOT halt the loop (graceful degradation per
OQ-7).

### SIGINT (Ctrl-C) — graceful exit (Story 4.9)

Press Ctrl-C on a running `/bmad-loop` to halt cleanly within 30 seconds (NFR-R5).
The runner installs a `process.on('SIGINT', handler)` listener at `runLoop` entry that
sets a `shutdownRequested` flag; the in-flight sub-agent dispatch is ALLOWED to finish
its current write (no cancellation, no partial-write risk per NFR-R1); upon the in-flight
Task's natural return, the loop halts BEFORE the next iteration's stop-condition check.

**Behaviour timeline** (typical iteration-body SIGINT):

1. User presses Ctrl-C.
2. Signal handler sets `shutdownRequested = true` (idempotent — second SIGINT is a no-op in v0.1).
3. The in-flight `await runNextFn(...)` continues; the sub-agent finishes its current write.
4. Promise resolves; runner records the just-completed `IterationRecord` for forensic visibility.
5. Runner detects `shutdownRequested === true` at the iteration boundary; constructs a
   `manual-sigint` StopReason; breaks out of the iteration loop.
6. Loop-final AR9 line emits `{ "action": "report", "message": "manual (SIGINT) — partial
   work committed; --resume available", "exitCode": 0 }`.

**Setup-phase SIGINT** (Ctrl-C before any iteration starts):

Clean exit happens IMMEDIATELY. The runner installs the handler BEFORE args resolution
so SIGINT during the args parse / plan-mode read / loop-entry baseline capture also halts
cleanly. The SIGINT-to-halt latency in setup-phase is bounded by the time of a single
`await` call — typically under 100 ms.

**Exit message** (AC-3 verbatim): `manual (SIGINT) — partial work committed; --resume
available`. The em-dash is U+2014 (consistent with other AR-2 messages from Story 4.6).

**Exit code**: `0` (per FR53 — clean exit; the user requested the halt deliberately).
NOT `1` — SIGINT is NOT a halt-with-actionable-error.

**Lock release**: OWNED by the existing `verify-and-advance.ts` try/finally pattern
(Story 1.4 lock contract). The `runLoop` does NOT acquire the lock and does NOT add
lock-release code (per AR8 lock-free top-tier).

**Multiple SIGINT presses**: idempotent in v0.1 — second SIGINT is a no-op (the flag is
already set). Future Story 6.x may make the SECOND SIGINT a force-quit (OQ-6 tracker).

**30-second NFR-R5 bound**: best-effort. The runner halts PROMPTLY after the in-flight
Task returns; the bound is upper-bounded by the typical sub-agent stream-active completion
time. If the Task hangs longer than 30 seconds, press Ctrl-C a second time (no-op in v0.1)
and rely on OS SIGKILL (Ctrl-\) — future Story 6.x may add SIGINT-to-SIGKILL escalation.

**No CLI flag for SIGINT**: SIGINT is OS-level — there is no `--sigint` or `--no-sigint`
flag. The signal handler is always-on for `/bmad-loop` invocations.

**`/bmad-next` SIGINT**: out of scope for v0.1. SIGINT on a non-loop dispatch invocation
falls back to OS default (immediate `process.exit`); per FR24 the SIGINT graceful behaviour
is bound to "running loop" only.

### Loop exit-reason + `--resume` hint format (Story 4.10)

Every loop exit (any of the 8 stop conditions OR `manual (SIGINT)`) emits a
unified two-line message in the AR9 final-emission `message` field per FR26
+ the AC-mandated text:

```
Loop exited: <reason>.
Snapshot: <state.yaml.lastSnapshot.sha>. Resume: /bmad-next --resume.
```

Where `<reason>` is the per-variant first-line text composed by
`formatExitReason(stopReason)` (e.g., `max-iters (5) reached`,
`next-story boundary reached (4.5 → 4.6)`, `manual (SIGINT) — partial
work committed; --resume available`).

**Snapshot-null fallback**: when the project is non-Git (Story 1.8 AC-3)
OR the state load fails OR `state.lastSnapshot.sha` is empty, the second
line is OMITTED. The message field is the FIRST LINE ONLY:

```
Loop exited: <reason>.
```

**Final transcript log entry under `runs/`**: the exit reason + snapshot +
iteration count + duration are ALSO written to a structured JSON file at:

```
_bmad-output/.stepper/runs/<loopStartedAtTs>-loop-exit.json
```

The JSON shape (schemaVersion 1, kind "loop-exit"):

```json
{
  "schemaVersion": 1,
  "kind": "loop-exit",
  "loopStartedAt": "2026-05-04T08:51:46Z",
  "loopCompletedAt": "2026-05-04T09:12:00Z",
  "stopReason": { "code": "max-iters-reached", "maxIters": 5, "iterCount": 5 },
  "exitCode": 0,
  "iterationCount": 5,
  "durationMs": 1214000,
  "snapshot": { "sha": "abc123...", "branch": "main", "takenAt": "..." },
  "message": "Loop exited: max-iters (5) reached.\nSnapshot: abc123.... Resume: /bmad-next --resume."
}
```

The transcript writer is BEST-EFFORT: failure to write does NOT mask the
AR9 exit emission. The user always gets the canonical AR9 line + the
canonical exit code; the JSON file is forensic / telemetry-bound (Story
6.x telemetry aggregator may consume).

**`--resume` hint references `/bmad-next --resume`** — NOT `/bmad-loop
--resume`. The `--resume` flag is wired on `/bmad-next` per Epic 3 Story
3.2 (resume the in-flight halted run). For loop re-entry, the user can
run either `/bmad-next --resume` (single step) OR re-invoke `/bmad-loop`
with the same flags as before (the loop will pick up from the current
state automatically).

**Format byte-identity**: the exit-line format is byte-identical across
all 10 StopReason variants × {snapshot-null, snapshot-present} = 20
combinations, verified by SWEEP_410 in `src/commands/loop/run.test.ts`.

### Failure-UX modes — retry (Story 5.1)

Story 5.1 lands the FIRST of four per-step failure-UX policies (FR31).
When a step's resolved policy is `retry` AND the verifier fails, the
SAME dispatch spec is re-run up to `maxRetries` times (default `2` →
3 total attempts: 1 original + 2 retries) before escalating per the
escalate policy (Story 5.4). Stories 5.2 / 5.3 / 5.5 land the other
three policies (skip / route-to-fixer / interactive) + their
corresponding CLI flags (`--skip`, `--auto-fix`, `--interactive`).
Story 5.6 wires the `failurePolicies:` config block (per-step opt-in).

**v0.1 default**: `escalate` per architecture line 499 — when no
per-step policy is set in config, the verifier-failure halts the
iteration immediately (the existing Story 4.6 halt-on-error
short-circuit behaviour). Story 5.1 introduces the policy-resolver
skeleton (`src/failure-ux/index.ts`) but does NOT change the default
behaviour for production callers.

**Retry semantics** (when policy resolves to `retry`):

- The SAME `staging/<run-id>/dispatch-spec.json` is re-read by the
  sub-agent on each attempt (byte-identical input). The sub-agent has
  NO awareness of attempt number; it is dispatched fresh and reads the
  same spec.
- The sub-agent overwrites the prior attempt's output at
  `staging/<run-id>/outputs/<artifact>` on each attempt. The variation
  in outcome comes from LLM sampling non-determinism — attempt N+1
  may succeed where attempt N failed.
- The verifier is invoked anew on the new output. Each attempt = one
  verifier invocation = one `runHistory[]` entry with `attemptNumber`
  metadata (1 = original, 2 = first retry, 3 = second retry).
- After `maxRetries + 1` attempts without a passing verifier, the
  policy ESCALATES — `verify-and-advance.ts` re-throws
  `VerifierFailureError` with the LAST attempt's failure context.
  Story 4.6 halt-on-error short-circuit catches this at the iteration
  boundary, producing the existing `error-stop` StopReason variant
  (no NEW StopReason variant per Story 5.1 OQ-1). The
  `formatLoopExitLines` (Story 4.10) emits the canonical two-line
  exit message.

**runHistory[] attempt metadata**: each per-attempt entry carries
`{ runId, step, epic, story, attemptNumber, outcome, failureCode,
completedAt }` per the new `RunHistoryEntrySchema` (Story 5.1
schema-tightening — `state.runHistory[]` is now typed). The
`attemptNumber` field is the load-bearing addition for Epic 6
telemetry consumption (Story 6.6/6.7 will aggregate retry counts per
step from this field). The legacy fields (`tokensIn`, `tokensOut`,
`durationMs`, `verifierStatus`, `promotedTo`, `ts`) are preserved as
OPTIONAL on the schema for backwards compat with the Story 4.5 token
accumulator + Story 4.x plan-walk completion check.

**SIGINT cooperation** (Story 4.9 §I-2 forward-tracker honoured):
when SIGINT arrives mid-retry, the retry loop checks
`shutdownRequested` BEFORE re-dispatching the next attempt; on
shutdown the loop halts cleanly with the LAST attempt's failure
context. The loop runner's signal handler then emits `manual-sigint`
StopReason (NOT a partial retry-exhausted state). Tests RT_51_VA_8 +
RT_51_LOOP_5 verify this.

**No CLI flag for retry mode**: Story 5.1 has no new CLI flag — the
per-step opt-in is via the `failurePolicies:` config block (wired in
Story 5.6). The retry policy is read from a `LoopOpts.failurePolicyOverride`
test-injection seam OR (in production v0.1) defaults to `escalate`
per architecture line 499. Skip / auto-fix / interactive flags arrive
in Stories 5.2 / 5.3 / 5.5 respectively.

**Forward-trackers**: backoff between retries (OQ-6 — none in v0.1;
Story 6.x backoff strategy); verifier-vs-dispatch error distinction
(OQ-7 — verifier-only in v0.1); recursive Task dispatch protocol
(OQ-8 — v0.1 relies on test-injection seams, production retry path
requires Layer 1 protocol coordination per Story 6.x).

### Failure-UX modes — escalate (Story 5.4 — Epic 5 default policy)

Story 5.4 lands the FORMAL `escalateHandler` at
`src/failure-ux/escalate.ts` — completing the four-handler module group
(`retry` + `skip` + `route-to-fixer` + `escalate`) with ZERO stub
fallthrough. `escalate` is the **DEFAULT** per-step failure-UX policy
per architecture line 499 — when no per-step `failurePolicies:` config
entry is set (Story 5.6 forward dependency), the verifier-failure halts
the iteration immediately via the existing Story 4.6 halt-on-error
short-circuit. NO new CLI flag is needed; `escalate` fires automatically.

**The actionable-hint regex contract** is the load-bearing AC line 1113
contract: every escalate path's `actionableHint` MUST match
`/^.*(Run|See|Try|Check) /`. The `escalateHandler` enriches the in-flight
`FailureContext.hint` to satisfy this regex via either PASS-THROUGH
(common case — all 17 existing `StepperError` class hints already match)
OR a SHAPE default safety-net for FUTURE non-matching hints. The
canonical loop-runner cooperation per Story 4.6 short-circuit + Story
4.10 unified format: the actionable hint shaped by the escalate handler
flows through `formatLoopExitLines` and surfaces in the two-line exit
emission. SIGINT cooperation per Story 4.9 §I-2 is preserved — the
escalate path's `lastFailureReason` write rides the existing atomic
tmp+rename contract per NFR-S5; SIGINT mid-escalate halts cleanly with
the partial state recorded.

For the full escalate-mode reference (regex contract, four throw sites,
PASS-THROUGH vs SHAPE enrichment, NFR-M2 enforcement), see
`commands/bmad-next.md` § "Failure modes — escalate (Story 5.4 — Epic 5
default policy)". Story 5.6 will wire the `failurePolicies:` config block
which may include explicit `escalate` policy declarations alongside
`retry` / `skip` / `route-to-fixer` (no behaviour change — explicit
`escalate` matches the v0.1 default).

## Tool restrictions

- **Bash** is restricted to `bun run <plugin-root>/...` invocations only.
  The slash command MUST NOT invoke shell scripts, system binaries
  (`curl`, `git`, `npm`, `node`, `python`, etc.), or any non-Bun
  executable.
- **Task** is restricted to plugin-declared agents (those defined under
  `agents/` in this plugin). For v0.1 the only declared agent is
  `bmad-step-runner`. Future agents (e.g., `bmad-step-fixer` from Epic 5
  Story 5.3) will be declared in the same directory.
- **No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`.**
  The `Read` tool may inspect any project file (read-only); `Write` and
  `Edit` are NOT in `allowedTools` (per the frontmatter declaration).

These restrictions are documented in the markdown body for human readers
+ Claude (Layer 1) as prompt-layer enforcement. The architectural
enforcement lives at Layer 2 (verifier scope check, `assertWithinScope`
per Story 1.3) — but the markdown declaration is the FIRST line of
defence.

## Error handling

Every error surfaces as a single-line actionable hint via the AR9
`action: "halt"` JSON line OR via the per-iteration `IterationRecord`
folded into the final summary. The `message` field is already
AR22-conformant (single-line "Run/See/Try/Check"-prefixed actionable
hint per `src/errors.ts` registry). Layer 1 prints the hint VERBATIM and
exits with the JSON line's `exitCode`.

DO NOT:

- Append a stack trace (errors are AR21-conformant; the loop runner's
  try/catch translates throw → halt with no stack on the main thread).
- Embellish with prefixes ("Stepper says:", "ERROR:", etc.).
- Run a second Bash on the halt path (the loop runner already emitted
  its summary line).
- Retry automatically (Stories 5.1-5.4 own the retry / skip /
  route-to-fixer / escalate engine; the loop runner stops on first
  error per AC-1's "exits cleanly" wording).

DO:

- Print the `message` field as-is (one line).
- Exit with the `exitCode` field.
- Surface the FR53 exit-code mapping to the user IF they ask "what does
  exit code N mean".

### --auto-fix flag (Story 5.3 — Epic 5 route-to-fixer mode)

`/bmad-loop --auto-fix` overrides the per-step failure policy for ALL
iterations of the loop run to `route-to-fixer` per architecture line 499
("Loop-level `--auto-fix` flag overrides per-step policy to `route-to-fixer`
for one run") + FR29. The override is unconditional — when `--auto-fix` is
supplied, every iteration's verifier failure triggers the route-to-fixer
path (NOT retry, NOT skip, NOT escalate, regardless of any per-step
config).

The per-iteration semantics mirror `/bmad-next --auto-fix`: on verifier
failure inside a loop iteration, the runner dispatches the
`bmad-step-fixer` sub-agent (via the AR34 four-step pattern) with the
verifier-result + the original artifact in the CONTEXT section; the
sub-agent writes a corrected artifact to a fresh
`staging/<run-id>-fix/outputs/<artifact>`; the original verifier re-runs
on the fixer's output. On post-fix pass the iteration succeeds (the
corrected artifact is promoted to canonical location with `runHistory[]
.fixAttempt: true` marker). On post-fix fail the iteration HALTS with
`VerifierFailureError` carrying both failure codes, which Story 4.6
`halt-on-error` short-circuit catches at the iteration boundary; the
loop exits with the standard `halt-on-error` StopReason emission via
`formatLoopExitLines` (Story 4.10).

SIGINT cooperation: the per-iteration `shutdownRequested` poll inside
`verify-and-advance.ts` is checked BEFORE invoking the fixer dispatch;
on SIGINT the iteration halts cleanly with the original verifier-fail
context (no fix attempt is started). The loop runner's SIGINT handler
(Story 4.9) then surfaces `manual-sigint` as the loop exit reason.

Forensic record per AC line 1099: BOTH `staging/<run-id>/` (original)
AND `staging/<run-id>-fix/` (fixer attempt) staging dirs are
preserved on disk; both `verifier-result.json` files are preserved (the
original at `staging/<run-id>/verifier-result.json`, the post-fix at
`staging/<run-id>-fix/verifier-result.json`). On escalate, two
`runHistory[]` entries are appended (one for the original verifier-fail,
one for the post-fix verifier-fail with `fixAttempt: true` marker).

See `commands/bmad-next.md` §`--auto-fix` flag (Story 5.3 — Epic 5
route-to-fixer mode) for the full per-step reference: dispatch contract
(fixer's dispatch-spec at `staging/<run-id>-fix/dispatch-spec.json` with
verifier-result + original-artifact in CONTEXT), the
`bmad-step-fixer` sub-agent contract (file-in / file-out only), and the
`runHistory[].fixAttempt: true` forensic marker.

### failurePolicies: config block (Story 5.6 — per-step policy)

`bmad-stepper.config.yaml` may declare a `failurePolicies:` block that
maps each BMAD step ID to one of the four per-step failure-UX policies
per FR31. The block is consumed by every `/bmad-loop` iteration and
every `/bmad-next` invocation; the resolved policy controls the post-
verifier-failure path for that step (NFR-M2 errors-as-primary-UX).

**Schema shape** (canonical reference at `src/schemas/config.ts`
`FailurePoliciesSchema`):

```yaml
failurePolicies:
  bmad-dev-story: retry
  bmad-code-review: route-to-fixer
  bmad-create-story: skip
  bmad-retrospective: escalate
```

**The four valid policy values**:

| Value             | Semantics                                                                                  | Story  |
| ----------------- | ------------------------------------------------------------------------------------------ | ------ |
| `retry`           | Retry up to 2 additional attempts (3 total) before escalating.                              | 5.1    |
| `skip`            | Skip the failed step and advance to the next-eligible step.                                 | 5.2    |
| `route-to-fixer`  | Dispatch the `bmad-step-fixer` sub-agent to repair the artifact, then re-run the verifier.  | 5.3    |
| `escalate`        | Halt the iteration with an actionable error (the **plugin default** — Story 5.4).           | 5.4    |

**Absent-step fallback**: when a step is NOT listed in
`failurePolicies:`, the resolver falls back to the plugin default
`escalate` per architecture line 499 ("escalate is the safest fallback
when no per-step policy is set"). This is the conservative behaviour —
the user opts in to the non-default modes per step.

**Priority order at the dispatch site** (codified in
`src/commands/loop/run.ts`, `src/commands/next/run.ts`, and
`src/commands/next/verify-and-advance.ts` per OQ-5):

1. `--auto-fix` flag → `route-to-fixer` (overrides everything; one-run scope per AC line 1144 verbatim).
2. `config.failurePolicies[step]` (the `failurePolicies:` block lookup; this section's responsibility).
3. plugin default `escalate` (resolver fallback when no entry is set).

The `--auto-fix` priority is unconditional — when the user supplies
`/bmad-loop --auto-fix`, every iteration's verifier failure routes to
the fixer regardless of any per-step `failurePolicies:` entry.
Subsequent invocations without `--auto-fix` revert to the per-step
config (the override is NEVER persisted to `state.yaml` per AR8 + AR13).

**Per-step ID format**: BMAD step IDs verbatim (e.g.,
`bmad-create-story`, `bmad-dev-story`, `bmad-code-review`,
`bmad-retrospective`); case-sensitive lookup per OQ-4. The user is
responsible for matching the exact step ID per the BMAD method
documentation. A typo in the step ID falls through silently to the
escalate plugin default (no warning — the resolver assumes the user
intends "no opt-in" for keys that do not match a real step).

**Invalid policy values handling** (per OQ-10): when the user authors
an invalid policy string (e.g., `failurePolicies: { dev-story: nonsense-policy }`),
the Zod parse REJECTS the config with a structured `ConfigError`:

> See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema.

The user-facing failure mode: edit `bmad-stepper.config.yaml` with a
typo → `/bmad-next` or `/bmad-loop` EXIT IMMEDIATELY with the
ConfigError → user fixes the typo → loop resumes. Explicit failure
mode > silent fallback (typos surface immediately, not at the next
verifier failure).

**Example config block**:

```yaml
# bmad-stepper.config.yaml
schemaVersion: 1
paths:
  state: _bmad-output/.stepper/state.yaml
  runs: _bmad-output/.stepper/runs
  staging: _bmad-output/.stepper/staging
  telemetry: _bmad-output/.stepper/telemetry
telemetry:
  enabled: false
failurePolicies:
  bmad-dev-story: retry          # implementation: retry up to 3 attempts
  bmad-code-review: route-to-fixer  # critique: dispatch fixer on failure
  bmad-test-design: skip         # tolerate: skip if verifier fails
  # All other steps fall through to the escalate plugin default.
```

**Story 6.1 cross-story coordination**: the `failurePolicies:` config
block is RESOLVED by `src/failure-ux/resolve-policy.ts` (Story 5.6
SCHEMA + RESOLVER). The FILE LOADER that reads
`bmad-stepper.config.yaml` from disk lands in Story 6.1 (the FIRST
story of Epic 6). Until Story 6.1 lands, production callers invoke
the resolver with `undefined` config → escalate-default for every step.
Tests pass synthetic config objects directly via the
`LoopOpts.config` / `RunNextOptions.config` /
`RunVerifyAndAdvanceOptions.config` test seams.

**Cross-references**: FR31 (per-step failure policy) + FR32
(actionable-error contract) + FR46 (single-line main-thread output) +
NFR-M2 (errors-as-primary-UX). See `src/failure-ux/index.ts` for the
`FailurePolicy` closed union; `src/schemas/config.ts` for
`FailurePolicySchema` + `FailurePoliciesSchema`; `src/failure-ux/resolve-policy.ts`
for the resolver's pure-function semantics.

### Configuration file (Story 6.1 — full schema reference)

Story 6.1 ships the file LOADER that reads `bmad-stepper.config.yaml`
from disk and validates the result against `ConfigV1Schema`. The full
configuration model — including all 9 top-level keys (`personas`,
`overrides`, `verifiers`, `failurePolicies`, `models`, `budgets`,
`paths`, `telemetry`, `schemaVersion`), the three-layer resolution rule
(project > user > defaults), per-key examples, and the schema-
versioning model — is documented in `docs/configuration.md`.

The `failurePolicies:` block above is one of those nine keys; consult
`docs/configuration.md` for the complete reference, including the user-
config layer (`~/.config/bmad-stepper/config.yaml`) and the deep-merge
semantics that govern how the layers compose.

### --interactive flag (Story 5.5 — per-step pause)

`/bmad-loop --interactive` enables a per-step supervisory pause. The
user approves EACH iteration before dispatch — the supervisor confirms
that the planned step should run, then types `y` to proceed (anything
else halts). The flag is `/bmad-loop`-ONLY per AC line 1123 verbatim
(epics.md); `/bmad-next` does NOT accept `--interactive` (the per-
iteration `runNext` invocations inside the loop do NOT receive the
flag; the slash-command `/bmad-next` argv parser is unchanged).

**Prompt-emit + read mechanism**: BEFORE each iteration's dispatch (and
AFTER the SIGINT top-of-while check + the shouldStop call so stop
conditions like `--max-iters` take priority), the runner emits a single
AR9 `"report"` JSON line to stdout:

```
{"action":"report","message":"Continue? [y/N]","exitCode":0}
```

Then reads ONE LINE from stdin via `Bun.stdin` (Bun-native async iterator;
interruptible by SIGINT per OQ-1 + OQ-3). Tests inject the response via
the `interactiveStdinOverride` LoopOpts seam (mirrors Story 4.9
`signalOverride` pattern).

**Response parsing** (per OQ-4 case-insensitive strict-`y`):
- `y`, `Y`, ` y `, ` Y ` (with optional surrounding whitespace) → continue
  to runNextFn dispatch.
- ANYTHING ELSE — `n`, `N`, empty (just Enter), blank/whitespace,
  multi-character like `yes`, garbage like `hello` — halts with the new
  `manual-interactive-halt` StopReason. The recorded `response` field
  preserves the user's literal input (pre-trim) for forensic visibility.

**Exit message** (per AC-3 + Story 4.10 unified two-line format):

```
Loop exited: manual (interactive halt) — --resume available.
Snapshot: <sha>. Resume: /bmad-next --resume.
```

The em-dash in `manual (interactive halt) — --resume available` is
U+2014 (consistent with Story 4.6 `error-stop` and Story 4.9
`manual-sigint` precedents). When the project has no snapshot
(`state.lastSnapshot === null` — non-Git per Story 1.8), only the
first line is emitted (snapshot-null fallback per Story 4.10).

**Exit code**: `0` (clean exit per FR53 — the user requested the halt
deliberately; this is NOT a failure path).

**SIGINT cooperation per AC-4** (per OQ-3 decision):
- SIGINT BEFORE prompt → top-of-while SIGINT check at run.ts:1089
  catches; surfaces `manual-sigint`.
- SIGINT DURING prompt → Bun.stdin async iterator interrupts; the
  runner's post-stdin SIGINT re-check catches and surfaces
  `manual-sigint` (NOT `manual-interactive-halt`).
- SIGINT AFTER `y` response → existing iteration-body SIGINT short-
  circuit fires.
- SIGINT AFTER N response → loop has already broken via
  `manual-interactive-halt`; further SIGINT is moot.

**Interaction with other flags**:
- `--auto-fix` (Story 5.3): does NOT re-prompt for fixer dispatches in
  v0.1 (the fixer is part of the same iteration; the user is prompted
  ONCE per main-step). Forward-tracker for Story 6.x: optional
  `--interactive=fixer` to also gate fixer dispatches.
- `--plan-first` (Story 4.7): short-circuits BEFORE the iteration body;
  `--interactive` is a no-op in plan-mode (no iterations dispatch).
- `--max-iters` / `--time-budget` / `--token-budget` / `--until-*` /
  `--next-story` / `--phase-end` / `--epic-end` (Stories 4.1-4.10):
  these stop conditions take PRIORITY over the interactive prompt
  (the prompt fires AFTER shouldStop so a max-iters cap fires natively
  without prompting one extra time). When the user keeps responding
  `y`, the loop exits via the natural stop condition.
- `--continue-on-error` (Story 4.6): the prompt fires BEFORE dispatch,
  so the failure-policy override (continue vs stop) is orthogonal.

**Claude Code chat adaptation** (per OQ-2 decision; Story 6.x
forward-tracker): v0.1 implements the SINGLE-PROCESS-LOOP variant where
the runner internally awaits stdin via `Bun.stdin`. This works
correctly in true terminal contexts (CI runners, shell scripts that
pipe input via `echo "y" | /bmad-loop --interactive`). The Claude Code
chat-adaptation pattern — where the slash-command markdown surfaces the
prompt + accepts the user's chat response + re-invokes the runner with
the response — requires additional state-stash + resume-from-prompt
machinery (where do we persist the in-flight loop state across Bash
invocations?) and is DEFERRED to Story 6.x for design alongside
telemetry + config consolidation. v0.1 Claude Code users see the prompt
JSON-line emit on stdout but the slash-command's markdown does not (in
v0.1) capture the user's chat response and pipe it back. Use
`/bmad-loop --interactive` from a true terminal context for v0.1.

Cross-references: FR30 (`--interactive` per-step pause/control),
NFR-R5 (graceful exit on user input), AR9 (single AR9 stdout JSON line
per command invocation), AR34 (slash-command markdown protocol
extended). For the new `manual-interactive-halt` StopReason variant,
see `src/commands/loop/run.ts` (Story 5.5). For the
`interactiveStdinOverride` test seam, see the LoopOpts interface.

### Skip failure mode (`--skip` is `/bmad-next`-only — Story 5.2)

`/bmad-loop` does NOT accept the `--skip <step>` flag. Skip is a
`/bmad-next`-only flag for advancing past a persistently-failing step
when the user wants to give up on it (per FR28 + epic AC line 1075-
1077). The user invokes:

```
/bmad-next --skip <step> --resume
```

`/bmad-loop` continues to halt on verifier failure per the existing
failure-policy resolution (default `escalate` until Story 5.6 wires
the per-step `failurePolicies:` config block). When Story 5.6 lands,
configuring `failurePolicies: { <step>: skip }` in
`bmad-stepper.config.yaml` will trigger automatic skip behaviour for
the matched step inside the `/bmad-loop` runner — but for v0.1 the
loop runner has no skip logic.

See `commands/bmad-next.md` §`--skip` flag (Story 5.2 — Epic 5 skip
mode) for the full skip-mode reference: cross-validation contract
(`--skip` requires `--resume`), state mutation semantic
(`runHistory[].skipped: true` + lastSuccessfulStep advance +
lastAttempted clear), SIGINT cooperation, and idempotent re-skip
protection per OQ-7.

The transcript pair is STILL written on every per-iteration halt path
(Story 2.6 finally block via `verify-and-advance.ts`). Users can run
`/bmad-next --watch` (Story 3.9) or inspect
`_bmad-output/.stepper/runs/<ts>-<step>.{log,json}` directly for forensic
detail per FR43 + FR44.

Per architecture §line 862 + FR54, the runner writes ALL diagnostic
output to stderr (info / warn / error) and ONE AR9 JSON line to
stdout. Layer 1 should treat stderr as logs (don't display verbatim to
the user; let Claude Code's runtime handle stderr per its standard
convention) and stdout as the AR9 protocol channel.

---

This Layer 1 orchestrator mirrors architecture §A.D1 (three-layer
execution model — main thread, Bun core, sub-agents), §P6 (slash-command
markdown patterns — frontmatter shape + body pattern + tool
restrictions), §AR34 (Bash → JSON line read → Task → Bash
verify-and-advance pattern, EXTENDED for the loop wrapper per AC-3 of
Story 4.1), §line 1660 (AR9 protocol), and PRD FR1, FR8, FR9, FR19, FR24,
FR26, FR28, FR29, FR30, FR31, FR32, FR53, FR54, NFR-M2 (Story 5.4 —
actionable hint, no stack trace on main thread), NFR-P1, NFR-S2, NFR-S5,
NFR-R1, NFR-R2, NFR-R4, NFR-R5 (Story 5.5 — `--interactive` graceful
exit on user input), NFR-R8 (Story 5.4 completes 4-of-4 failure-UX
modes integration test coverage).

For the lock-free pre-dispatch composer used per iteration, see
`src/commands/next/run.ts` (Story 2.4). For the lock-acquiring
post-dispatch runner used per iteration, see
`src/commands/next/verify-and-advance.ts` (Story 2.6). For the canonical
sub-agent definition, see `agents/bmad-step-runner.md` (Story 2.3). For
the AR9 JSON-line schema, see `src/schemas/dispatch-protocol.ts`
(Story 2.2). For the loop runner's argument schema + parser, see
`src/commands/loop/args.ts` + `src/commands/loop/run.ts` (Story 4.1).
