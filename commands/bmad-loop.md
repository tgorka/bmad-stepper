---
description: Run /bmad-next in a bounded loop with stop conditions
argumentHint: "[--max-iters N] [--until-epic-end] [--until-story X.Y] [--next-story] [--phase-end] [--time-budget MS] [--token-budget N] [--stop-on-error|--continue-on-error] [--plan-first] [--checkpoint-each story|epic|phase] [--interactive] [--auto-fix]"
allowedTools: ["Bash", "Task", "Read"]
---

# /bmad-loop

Run `/bmad-next` repeatedly inside a bounded loop until a stop condition
fires. Layer 1 orchestrator: Bash → AR9 JSON line → (per-iteration Task →
Bash verify-and-advance) → final-summary report.

Story 4.1 wired `--max-iters` (with a default-50 cap added in Story 4.4);
Stories 4.2 + 4.3 wired the four condition flags `--until-epic-end`,
`--until-story X.Y`, `--next-story`, `--phase-end`. Story 4.5 wired the
two budget flags (`--time-budget MS`, `--token-budget N`); Stories 4.6+
will wire the remaining flags (`--stop-on-error`, `--continue-on-error`,
`--plan-first`).

## Usage examples

```
/bmad-loop --max-iters 1
/bmad-loop --max-iters 50
/bmad-loop --until-epic-end          # Story 4.2 — runtime-wired
/bmad-loop --until-story 4.5         # Story 4.2 — runtime-wired
/bmad-loop --next-story              # Story 4.3 — runtime-wired
/bmad-loop --phase-end               # Story 4.3 — runtime-wired
/bmad-loop --time-budget 7200000 --token-budget 200000  # Story 4.5
/bmad-loop --plan-first              # Story 4.7 — dry-run preview
/bmad-loop --checkpoint-each story   # Story 4.8 — per-iteration snapshot
/bmad-loop --interactive             # Story 5.5 — pause-between-steps
/bmad-loop --auto-fix                # Story 5.3 — route-to-fixer
```

The `$ARGUMENTS` token below expands to the user's text after `/bmad-loop`
per Claude Code's standard slash-command tail-string expansion. Flags are
forwarded verbatim to `src/commands/loop/run.ts`'s argv (Story 4.1
`parseLoopArgs` consumes them).

## Behavior

The `/bmad-loop` runner manages the iteration loop INTERNALLY as a single
Bun process. The slash-command markdown's Bash step invokes the runner
ONCE; the runner internally invokes `runNext` per iteration via in-process
function call (NOT subprocess spawn — that would defeat AR9 + add ~30ms
overhead per iteration). The loop runner's OWN `import.meta.main` block
emits a SINGLE AR9 JSON line at exit summarising the loop outcome.

This is a critical distinction from `/bmad-next` (which dispatches ONE
step per invocation): `/bmad-loop` invokes the runner ONCE; the runner
loops internally; the four-step AR34 pattern (Bash → JSON line read →
Task → Bash verify-and-advance) is replayed PER ITERATION inside the
runner.

### 1. Bash: invoke the bounded-loop runner.

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
   `max-iters-reached`, `halt-on-error`, OR any of the six
   Story-4.2/4.3/4.5 variants `epic-end-reached` / `until-story-reached` /
   `next-story-reached` / `phase-end-reached` / `time-budget-reached` /
   `token-budget-reached`).
3. Else, invokes `runNext` once via in-process function call.
4. Captures the per-iteration result into an `IterationRecord`
   (`{ iterCount, runId, action, exitCode, durationMs, startedAt }`).
5. On `runNext` halt (non-zero exitCode OR `action === "halt"`),
   short-circuits with `halt-on-error`.

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
  `time-budget-reached`, `token-budget-reached`).
- `1` — `halt-on-error` (per-iteration runNext halt; failureCode
  encoded in the iteration record).
- `2` — argument parse error (configuration error per FR53).

### 2. Parse the single stdout JSON line.

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

### 3. Print the FR18 one-line summary.

Print the `message` field VERBATIM as a single human-readable line. Do
NOT embellish with prefixes ("Stepper says:", "ERROR:", etc.) — the
message is already FR18-conformant. Exit with the JSON line's
`exitCode` (per the FR53 mapping above).

After Step 3, `/bmad-loop` returns control to the user. The
per-iteration transcripts (`<ts>-<step>.{log,json}` under
`_bmad-output/.stepper/runs/`) are on disk for `/bmad-next --watch`
(Story 3.9), `/bmad-next --diff-state` (Story 3.8), and
`/bmad-next --export-state` (Story 3.10) to consume.

### 4. Per-iteration AR34 pattern (replayed INSIDE the runner).

For every iteration the runner internally repeats the four-step AR34
pattern that the standalone `/bmad-next` slash-command markdown
prescribes:

1. **Bash** (in-process equivalent): the runner calls `runNext` directly.
2. **JSON line read**: the runner reads the AR9 line from `runNext`'s
   structured return value (NOT stdout — in-process invocation).
3. **Task** (per-iteration dispatch): when `runNext` returns a `dispatch`
   action, the dispatch is recorded in the iteration record. v0.1
   conservative: the loop runner DOES NOT actually invoke the Task tool
   from inside the iteration — the per-iteration Task→verify-and-advance
   flow is owned by the standard `/bmad-next` slash-command path. Story
   4.1's loop runner is a SKELETON: when used with the test-injection
   stub, it asserts call counts; when used in production via
   `bun run src/commands/loop/run.ts`, the per-iteration `runNext`
   completes synchronously without a Task dispatch (the production
   wiring of Task-per-iteration lands in subsequent Epic 4 + Epic 5
   stories that integrate Layer 1's Task tool with the loop runner).
4. **Bash verify-and-advance** (per-iteration): when the per-iteration
   `runNext` returns a `dispatch` action (production-wiring path), the
   runner is responsible for invoking
   `bun run src/commands/next/verify-and-advance.ts` after the Task
   returns. v0.1 SKELETON does NOT yet wire this path.

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
| `--stop-on-error`      | 4.6      | parsed only                         |
| `--continue-on-error`  | 4.6      | parsed only                         |
| `--plan-first`         | 4.7      | parsed only                         |
| `--checkpoint-each X`  | 4.8      | parsed only                         |
| `--interactive`        | 5.5      | parsed only                         |
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

When NEITHER `--max-iters` nor any other stop condition is supplied,
the loop runner injects `--max-iters=50` as a DEFAULT cap per FR25,
preventing accidental infinite loops (Story 4.4 AC-1). When the user
supplies an explicit stop condition (e.g., `--until-epic-end`,
`--until-story X.Y`, `--next-story`, `--phase-end`, `--time-budget MS`,
`--token-budget N`) WITHOUT `--max-iters`, NO default cap is applied —
the explicit condition controls the loop's lifetime.

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
Story 4.1), §line 1660 (AR9 protocol), and PRD FR1, FR8, FR9, FR19,
FR53, FR54, NFR-P1, NFR-S2, NFR-S5, NFR-R1, NFR-R4.

For the lock-free pre-dispatch composer used per iteration, see
`src/commands/next/run.ts` (Story 2.4). For the lock-acquiring
post-dispatch runner used per iteration, see
`src/commands/next/verify-and-advance.ts` (Story 2.6). For the canonical
sub-agent definition, see `agents/bmad-step-runner.md` (Story 2.3). For
the AR9 JSON-line schema, see `src/schemas/dispatch-protocol.ts`
(Story 2.2). For the loop runner's argument schema + parser, see
`src/commands/loop/args.ts` + `src/commands/loop/run.ts` (Story 4.1).
