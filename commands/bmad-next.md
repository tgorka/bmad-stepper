---
description: Compute and execute the next BMAD step (zero-config orchestrator).
argumentHint: "[--doctor | --upgrade | --resume | --dry-run | ...]"
allowedTools: ["Bash", "Task", "Read"]
---

# /bmad-next

Compute and execute the next BMAD step. Layer 1 orchestrator: Bash → AR9 JSON line → Task → Bash → summary.

## Usage examples

```
/bmad-next
/bmad-next --dry-run
/bmad-next --explain
/bmad-next --resume
/bmad-next --doctor
/bmad-next --list
/bmad-next --diff-state
/bmad-next --export-state
```

The `$ARGUMENTS` token below expands to the user's text after `/bmad-next` per
Claude Code's standard slash-command tail-string expansion. Flags are forwarded
verbatim to `src/commands/next/run.ts`'s argv (Story 1.7 `parseNextArgs`
consumes them).

## Behavior

### 1. Bash: invoke the lock-free pre-dispatch composer.

```bash
bun run src/commands/next/run.ts -- $ARGUMENTS
```

This invocation reads `state.yaml` (lock-free), computes the next step via the
DAG resolver, builds the dispatch spec at `staging/<run-id>/dispatch-spec.json`,
and emits exactly ONE JSON line on stdout describing the next action. Per
architecture §line 1672 + AR8, no project lock is acquired during this call
(the runner is read-only). Per FR54, all progress / warning / error logging
routes to stderr; only the AR9 JSON line goes to stdout.

Exit-code mapping for this Bash invoke per FR53 + Story 2.4:

- `0` — success (one of the three AR9 actions was emitted on stdout).
- `2` — argument parse error (configuration error).
- `3` — BMAD compatibility error.
- `5` — pathological input.
- Other non-zero codes propagate through the AR9 `action: "halt"` line.

### 2. Parse the single stdout JSON line.

The script emits EXACTLY ONE JSON line on stdout. The shape is one of three
discriminated variants per `src/schemas/dispatch-protocol.ts`
(`DispatchActionV1Schema`):

```
Variant 1 — dispatch:
  { "action": "dispatch", "runId": "<id>", "agent": "<agent-name>",
    "lastAttempted": { "step": "<name>", "epic": <n>, "story": "<key>",
      "attemptedAt": "<iso>" }?,
    "exitCode": 0 }

Variant 2 — report:
  { "action": "report", "message": "<human-readable text>", "exitCode": >= 0 }

Variant 3 — halt:
  { "action": "halt", "message": "<actionable hint>", "exitCode": >= 1 }
```

Story 3.1 extension: the `dispatch` variant carries an OPTIONAL `lastAttempted`
field with the planned `{ step, epic, story, attemptedAt }` payload. Layer 1
captures this field and forwards it to `verify-and-advance.ts` via the
`--last-attempted-json '<JSON>'` flag (Step 5 below). The field powers
`state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-
halt mutations per epic AC line 731. `verify-and-advance.ts` accepts the flag
optionally — older bmad-next.md bodies that don't forward it still work
(graceful degradation; `state.lastAttempted` is set to `null` on halt).

Parse the single line via JSON.parse. Do NOT inspect any other stdout content
— the runner is contractually bound to emit exactly ONE line per AR9 + FR54.
The shape is verified by Story 2.2's `emitDispatchAction` (calls
`DispatchActionV1Schema.parse()` before writing). The Layer 1 parse is
defence-in-depth — if the line is malformed, abort with a clear error rather
than attempt invalid actions.

### 3. Branch on action.

```
Case action == "dispatch":
  Invoke the Task tool with the agent name from the JSON line and the
  dispatch-spec path as the prompt:
    Task(
      agent  = <jsonLine.agent>,
      prompt = "staging/<jsonLine.runId>/dispatch-spec.json"
    )
  Then proceed to Step 4 (capture token counts).

Case action == "report":
  Print the `message` field DIRECTLY to the user. No Task dispatch. No
  second Bash invoke. Exit with the JSON line's exitCode (typically 0).

Case action == "halt":
  Print the `message` field DIRECTLY to the user (the actionable hint).
  No Task dispatch. No second Bash invoke. Exit with the JSON line's
  exitCode (>= 1 per FR53).

Default (unrecognised action):
  Print "ERROR: unrecognised AR9 action: <jsonLine.action>" and exit 1.
```

The agent name in the dispatch JSON line is canonical — Story 2.2's
`emitDispatchAction` writes `agent: "bmad-step-runner"` for v0.1 (per
`src/dispatch/emit.ts:48`). The slash-command body reads the field at runtime
rather than hardcoding the literal so a future renamed agent (Story 6.x) breaks
neither the markdown nor the code path. This is the AR9 triple-binding integrity
documented in `agents/bmad-step-runner.md` line 84.

On `report` and `halt`, print the `message` field VERBATIM. Do NOT embellish
with prefixes like "Stepper says:" or status icons. The `message` is already
FR18-conformant (single human-readable line) and FR46-conformant (single-line
actionable hint on errors). Embellishment breaks the contract.

On `halt`, exit with the JSON line's `exitCode` (>= 1). Do NOT continue to
Step 4 — the dispatch was not performed and there is nothing to verify.

### 4. Capture Task tool's response token counts.

Per architecture Critical Gap Resolution 6 line 1677, the Task tool's response
object exposes token counts:

```
response.tokens_in   — input tokens consumed by the sub-agent
response.tokens_out  — output tokens emitted by the sub-agent
```

Capture these as integers for the next step. If the Task response does not
include token counts (e.g., a future Claude Code runtime change), fall back
to `0 / 0` — `verify-and-advance.ts` accepts non-negative integers via
`parseVerifyAndAdvanceArgs` (Story 2.6 Task 4) and writes them into the
run-log JSON + `state.runHistory[]` entry.

Token-count threading is the architecture's documented integration boundary
between Layer 1 (which has access to Claude Code's Task response object) and
Layer 2 (which has no Task awareness). The positional `--tokens-in <n>
--tokens-out <n>` flags are the contract per architecture line 1677 + Story
2.6 `parseVerifyAndAdvanceArgs`. The captured counts flow into BOTH the
run-log JSON `tokensIn` / `tokensOut` fields (Story 2.5 surface) AND the
`runHistory[]` entry on `state.yaml` (Story 2.6 surface). Story 6.7's
telemetry aggregation later sums across `runHistory[]` for the
`--token-budget` Story 4.5 stop condition.

### 5. Bash: invoke the lock-acquiring post-dispatch runner.

```bash
bun run src/commands/next/verify-and-advance.ts -- --run-id <runId> --tokens-in <tokensIn> --tokens-out <tokensOut> --last-attempted-json '<lastAttemptedJson>'
```

where `<runId>` is the value from Step 2's parsed JSON line (`jsonLine.runId`),
and `<tokensIn>` / `<tokensOut>` are from Step 4's Task response object.

Story 3.1: `<lastAttemptedJson>` is the JSON-encoded `lastAttempted` object
captured from Step 2's parsed dispatch line (`JSON.stringify(jsonLine
.lastAttempted)`). The flag is OPTIONAL — when absent (e.g., the dispatch
line omitted the field, or this Layer 1 markdown body has not been updated
to capture it), `verify-and-advance.ts` sets `state.lastAttempted` to `null`
on the halt path (graceful degradation per the Story 3.1 design decision).
On the success path, `state.lastAttempted` is cleared to `null` regardless of
the flag's presence.

This second invocation acquires the project lock, re-reads `state.yaml`,
performs the state-hash TOCTOU check (per architecture §line 1673), runs the
verifier on the sub-agent's output, atomically promotes the artifact to its
canonical path, atomically updates `state.yaml` with `.bak` rotation
(NFR-S5), writes the markdown transcript + JSON run log via Story 2.5's
writers, and releases the lock in `finally` per AR8.

The two Bash invokes are SEPARATE PROCESSES with FRESH Bun runtimes. The
lock-free → lock-held boundary is the **process boundary** between `run.ts`
and `verify-and-advance.ts` — the (5+ minute) sub-agent run between them does
NOT hold the project lock.

Exit-code mapping for the second Bash invoke per FR53 + Story 2.6:

- `0` — verifier passed; artifact promoted; state advanced.
- `1` — `STATE_CHANGED_DURING_DISPATCH` (TOCTOU mismatch — state advanced
  during dispatch) OR verifier failure.
- `2` — argument parse error.
- `4` — lock contention.
- `5` — pathological input.

### 6. Print the FR18 one-line summary.

Read the second AR9 JSON line (the `verify-and-advance` output). The
`message` field is the FR18 single-line summary in one of two shapes:

```
On success (action = "report"):
  "✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"

On failure (action = "halt"):
  "<actionable hint>" — e.g., "Run /bmad-next --diff-state to see what
  changed and /bmad-next --resume to retry from the current state."
```

Print the `message` field VERBATIM. Exit with the JSON line's `exitCode`.

This is the canonical FR18 main-thread output — one human-readable line per
step. The line is composed by `verify-and-advance.ts` per Story 2.6 Task 8.7
+ the architecture line 1480 contract. Layer 1 just prints it.

After Step 6, `/bmad-next` returns control to the user. The transcript pair
(`<ts>-<step>.{log,json}` under `_bmad-output/.stepper/runs/`) is on disk
for `/bmad-next --watch` (Story 3.9), `/bmad-next --diff-state` (Story 3.8),
and `/bmad-next --export-state` (Story 3.10) to consume.

## Tool restrictions

- **Bash** is restricted to `bun run <plugin-root>/...` invocations only. The
  slash command MUST NOT invoke shell scripts, system binaries (`curl`, `git`,
  `npm`, `node`, `python`, etc.), or any non-Bun executable.
- **Task** is restricted to plugin-declared agents (those defined under
  `agents/` in this plugin). For v0.1 the only declared agent is
  `bmad-step-runner`. Future agents (e.g., `bmad-step-fixer` from Epic 5
  Story 5.3) will be declared in the same directory.
- **No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`.**
  The `Read` tool may inspect any project file (read-only); `Write` and
  `Edit` are NOT in `allowedTools` (per the frontmatter declaration).

These restrictions are documented in the markdown body for human readers +
Claude (Layer 1) as prompt-layer enforcement. The architectural enforcement
lives at Layer 2 (verifier scope check, `assertWithinScope` per Story 1.3) —
but the markdown declaration is the FIRST line of defence.

Claude Code's runtime restricts the slash command to the three tools in
`allowedTools: ["Bash", "Task", "Read"]`. The body's tool-restriction section
narrows the Bash and Task surfaces further (per the verbiage above) — these
are PROMPT-LAYER constraints Claude honors at the orchestration layer.

## Error handling

Every error surfaces as a single-line actionable hint via the AR9
`action: "halt"` JSON line. The `message` field is already AR22-conformant
(single-line "Run/See/Try/Check"-prefixed actionable hint per
`src/errors.ts` registry). Layer 1 prints the hint VERBATIM and exits with
the JSON line's `exitCode` (>= 1 per FR53).

DO NOT:

- Append a stack trace (errors are AR21-conformant; Layer 2's try/catch
  translates throw → halt with no stack on the main thread).
- Embellish with prefixes ("Stepper says:", "ERROR:", etc.).
- Run a third Bash or Task on the halt path.
- Retry automatically (Stories 5.1-5.4 own the retry / skip /
  route-to-fixer / escalate engine).

DO:

- Print the `message` field as-is (one line).
- Exit with the `exitCode` field.
- Surface the FR53 exit-code mapping to the user IF they ask "what does
  exit code N mean" — the canonical mapping is documented in
  `prd.md` FR53 line 744.

The transcript pair is STILL written on every halt path (Story 2.6 finally
block). Users can run `/bmad-next --watch` (Story 3.9) or inspect
`_bmad-output/.stepper/runs/<ts>-<step>.{log,json}` directly for forensic
detail per FR43 + FR44.

Per architecture §line 862 + FR54, `runVerifyAndAdvance` writes ALL
diagnostic output to stderr (info / warn / error) and ONE AR9 JSON line to
stdout. Layer 1 should treat stderr as logs (don't display verbatim to the
user; let Claude Code's runtime handle stderr per its standard convention)
and stdout as the AR9 protocol channel.

---

This Layer 1 orchestrator mirrors architecture §A.D1 (three-layer execution
model — main thread, Bun core, sub-agents), §A.D2 (sub-agent dispatch via
Task tool), §P6 (slash-command markdown patterns — frontmatter shape + body
pattern + tool restrictions), §line 1443-1485 (Layer 1↔2↔3 sequence
diagram), §line 1660 (AR9 protocol), §line 1677 (token-count positional
flag threading), and PRD FR1, FR16, FR17, FR18, FR32, FR46, FR53, FR54.

For the lock-free pre-dispatch composer, see `src/commands/next/run.ts`
(Story 2.4). For the lock-acquiring post-dispatch runner, see
`src/commands/next/verify-and-advance.ts` (Story 2.6). For the canonical
sub-agent definition, see `agents/bmad-step-runner.md` (Story 2.3). For
the AR9 JSON-line schema, see `src/schemas/dispatch-protocol.ts` (Story
2.2). The end-to-end happy-path smoke test is Story 2.8 deliverable.
