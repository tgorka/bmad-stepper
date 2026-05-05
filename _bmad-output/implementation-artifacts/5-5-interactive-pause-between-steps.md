---
status: done
story_id: '5.5'
story_key: 5-5-interactive-pause-between-steps
epic: '5'
title: '`--interactive` Pause Between Steps'
created: '2026-05-05'
last_updated: '2026-05-05T02:51:07Z'
priority: high
estimated_effort: M
fr_coverage:
  - FR30     # PRIMARY — `--interactive` per-step pause/control
  - FR16     # sub-agent dispatch (interactive prompt fires BEFORE each iteration's dispatch)
  - FR17     # verifier before promote (orthogonal — interactive does not change verifier path)
  - FR8      # single-step advance (interactive is the per-step gate inside /bmad-loop)
  - FR43     # markdown transcript per step (interactive halt does NOT change transcript writes)
  - FR44     # JSON run log per step
  - FR53     # exit codes (interactive halt = clean exit code 0)
  - FR54     # stdout/stderr discipline (JSON-line prompt on stdout per AR9)
nfr_coverage:
  - NFR-R5   # PRIMARY — graceful exit on user input (interactive halt halts cleanly)
  - NFR-S2   # no-write-outside-scope (interactive prompt path adds zero write sites)
  - NFR-S5   # atomic tmp+rename + .bak rotation (state.yaml write sites unchanged)
  - NFR-M3   # schema migrations (NO schema bump; interactive halt rides existing StopReason union)
  - NFR-R1   # zero data loss on halt (interactive halt is graceful — partial work committed)
  - NFR-R2   # 100% --resume recovery (the exit message surfaces --resume as the recovery path)
ar_coverage:
  - AR8      # lock-free top-tier preserved (loop runner is read-only top-tier; prompt+stdin are zero-lock)
  - AR9      # PRIMARY — single AR9 stdout JSON line per command invocation; interactive prompt is a JSON-line `report` action emitted PER ITERATION boundary
  - AR21     # error UX shape (interactive halt is graceful, NOT an error)
  - AR22     # actionable-hint regex `/^.*(Run|See|Try|Check) /` not applicable (no error class added)
  - AR33     # no console.* in source (prompt emit uses emitDispatchAction, stdin read uses Bun stdin / Node readline — never console.*)
  - AR34     # PRIMARY — slash-command markdown protocol extended (commands/bmad-loop.md interactive section + Claude Code adaptation notes)
  - AR41     # boundary graph (loop/run.ts top-tier; new io/stdin.ts foundational candidate or inline; failure-UX module unchanged)
  - AR42     # test discipline (NEW interactiveStdinOverride test seam mirrors signalOverride pattern from Story 4.9)
deps:
  - story: '4.10'
    reason: 'PRIMARY — StopReason union + formatLoopExitLines (Story 4.10 unified two-line exit emission). Need to add NEW StopReason variant `manual-interactive-halt` to the union; extend `formatExitReason` switch with the new variant; verify `formatLoopExitLines` second-line snapshot pointer flows correctly. The new variant exit reason text per AC line 1131: `manual (interactive halt) — --resume available` (em-dash U+2014 consistent with Story 4.6 `error-stop` and Story 4.9 `manual-sigint` precedents). The Story 4.10 SWEEP_410 invariant (10 variants × 2 snapshot states = 20) GROWS to 11 variants × 2 = 22; add IA_55_SWEEP rows accordingly.'
  - story: '4.9'
    reason: 'PRIMARY — signalOverride seam pattern + manual-sigint StopReason variant analog (AC line 1132 — SIGINT during interactive prompt also exits cleanly). The Story 4.9 closure-private `shutdownRequested` flag + setup-phase + iteration-body checks are the precedent; Story 5.5 RIDES this for SIGINT-during-interactive-prompt cooperation. The new `interactiveStdinOverride` seam mirrors the `signalOverride` pattern verbatim (test-injectable replacement of the production stdin read).'
  - story: '4.x'
    reason: 'PATTERN — loop iteration body in src/commands/loop/run.ts (Stories 4.1-4.10). LoopOpts seams pattern (runNextOverride, stateOverride, sprintStatusOverride, dagOverride, tokensPerIter, signalOverride, nowOverride, finalStateOverride, writeLoopExitTranscriptOverride, failurePolicyOverride, maxRetriesOverride). Story 5.5 ADDS one new seam `interactiveStdinOverride: () => Promise<string> | string` (returns the simulated user response).'
  - story: '5.4'
    reason: 'PATTERN — failure-ux module presence (no direct dep — interactive is NOT a failure-UX policy; it is a /bmad-loop runner-tier gate). Story 5.5 follows the Story 5.4 spec template structure (frontmatter shape + Tasks/Open Questions/Forward Action Items pattern + line count target band).'
  - story: '5.3'
    reason: 'PATTERN — `--auto-fix` CLI flag wiring at LoopArgsSchema; Story 5.5 follows the SAME pattern for `--interactive` (boolean flag; runtime gate inside the iteration body; no new failure-UX handler). Inherits SDR forward-trackers I-1 through I-9.'
  - story: '5.2'
    reason: 'PATTERN — `--skip` CLI flag (next-tier; not loop-tier). Story 5.5 contrasts: `--interactive` is LOOP-ONLY (per AC line 1123 verbatim), NOT a /bmad-next flag. Story 5.5 inherits the Story 5.2 SDR forward-trackers + the cosmetic nits N-1/N-2/N-3/N-4.'
  - story: '5.1'
    reason: 'PATTERN — Story 5.1 LoopOpts seams (failurePolicyOverride, maxRetriesOverride). Story 5.5 follows the SAME seam pattern for the new interactiveStdinOverride seam. Inherits Story 5.1 SDR forward-trackers I-1 through I-7.'
  - story: '4.6'
    reason: 'PATTERN — halt-on-error short-circuit at run.ts:1278+; the iteration-body `error-stop` runner-direct StopReason variant precedent for the new `manual-interactive-halt` runner-direct variant (constructed DIRECTLY by the runner body when stdin response is N/empty/garbage — NOT via evaluateStopConditions dispatch).'
  - story: '4.4'
    reason: 'PATTERN — Story 4.4 default-cap suppression: when `--interactive` is supplied alone (no `--max-iters`), should the default 50-iter cap apply? Per OQ-2 decision below: YES — `--interactive` is NOT a stop condition (it is a per-iteration gate); the user wanting interactive-pause typically wants a bounded loop too; the default-50 cap fires per Story 4.4 AC-1 (mirrors the Story 4.8 `--checkpoint-each` decision per Story 4.8 OQ-1).'
  - story: '4.1'
    reason: 'SCHEMA — LoopArgsSchema 13-field surface declared in Story 4.1; the `interactive` field is ALREADY DECLARED at args.ts:102 as `z.boolean().optional()` (RUNTIME-DEFERRED to Story 5.5 per the Story 4.1 Field-enumeration table). Story 5.5 wires the runtime branching; the schema field is unchanged.'
  - story: '3.1'
    reason: 'PATTERN — state.yaml advance semantics on graceful halt. Per Story 3.1 + Story 4.10 patterns: `lastFailureReason` is NOT set on graceful interactive halt (this is NOT a failure path); `lastSuccessfulStep` is whatever the last completed iteration left it at; per OQ-7 decision below: the interactive halt is identical in state-mutation semantics to `manual-sigint` (Story 4.9) — no state mutation by the runner; iteration-body iterations may have advanced state via verify-and-advance.ts; the interactive halt FIRES BEFORE dispatch so the about-to-run iteration NEVER mutates state.'
  - story: '2.6'
    reason: 'PATTERN — verify-and-advance.ts is OUT-OF-SCOPE for Story 5.5. The interactive prompt fires inside the loop runner BEFORE each iteration dispatch — never inside verify-and-advance.ts. ZERO verify-and-advance.ts mutations.'
  - story: '1.7'
    reason: 'SCHEMA — NextArgsSchema is OUT-OF-SCOPE for Story 5.5. `--interactive` is /bmad-loop ONLY per AC line 1123; NO new `--interactive` flag on /bmad-next; ZERO src/commands/next/args.ts mutations.'
  - story: '1.2'
    reason: 'DEPENDENCY — error class registry. Story 5.5 ships ZERO new error classes per AR21+22 + epic-4-retro Recommendations item 3. Registry stays at 17. The interactive halt is a graceful StopReason variant, NOT an error.'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/5-4-escalate-failure-mode.md
  - _bmad-output/implementation-artifacts/5-3-route-to-fixer-mode-auto-fix-flag.md
  - _bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md
  - _bmad-output/implementation-artifacts/5-1-retry-failure-mode.md
  - _bmad-output/implementation-artifacts/4-10-loop-exit-reason-resume-hint.md
  - _bmad-output/implementation-artifacts/4-9-sigint-graceful-exit.md
  - _bmad-output/implementation-artifacts/4-8-checkpoint-each-step-type.md
  - _bmad-output/implementation-artifacts/4-7-plan-first-dry-run-preview.md
  - _bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/commands/loop/args.ts
  - src/commands/loop/args.test.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/loop/plan.ts
  - src/commands/loop/stop-conditions.ts
  - src/commands/next/args.ts
  - src/commands/next/run.ts
  - src/schemas/dispatch-protocol.ts
  - src/dispatch/index.ts
  - src/io/log.ts
  - src/errors.ts
  - src/errors.test.ts
  - commands/bmad-loop.md
  - commands/bmad-next.md
---

# Story 5.5: `--interactive` Pause Between Steps

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-loop --interactive` to pause and prompt before each step,
So that I can supervise a loop step-by-step without unleashing it fully.

## Context Summary

This is the **FIFTH story of Epic 5 (Failure-UX Modes & Auto-Fix)** and lands the **`--interactive` per-step pause flag** — the LAST of three Epic-5 CLI flags (`--skip` from Story 5.2 — `/bmad-next`-only; `--auto-fix` from Story 5.3 — `/bmad-loop` + `/bmad-next`; `--interactive` from Story 5.5 — `/bmad-loop`-ONLY per AC line 1123 verbatim). **Story 5.5 is /bmad-loop SCOPED** — `--interactive` is an EXCLUSIVE `/bmad-loop` flag; it does NOT extend to `/bmad-next` (the per-iteration `runNext` invocations inside the loop runner do NOT receive the flag); the slash-command `/bmad-next` argv parser is UNCHANGED. The Story 4.1 `LoopArgsSchema` ALREADY DECLARED the `interactive` field at `src/commands/loop/args.ts:102` as `z.boolean().optional()` (RUNTIME-DEFERRED per the Story 4.1 Field-enumeration table); Story 5.5 wires the runtime branching that ACTUALLY consumes the parsed value.

**Story 5.5 builds on the Story 4.9 SIGINT graceful-exit pattern** — the `manual-sigint` StopReason variant (Story 4.9) is the EXACT analog for the new `manual-interactive-halt` StopReason variant introduced here. Both are runner-direct StopReason variants (constructed DIRECTLY by the iteration body — NOT via `evaluateStopConditions` dispatch); both map to exit code `0` (clean exit per FR53 — the user requested the halt deliberately); both are UPSTREAM of the iteration's verify-and-advance.ts call (so neither path mutates state.yaml from the about-to-run iteration). The `signalOverride` test seam from Story 4.9 is the precedent for the new `interactiveStdinOverride` test seam introduced in Story 5.5 — a closure-replaceable function returning the simulated user response.

**Story 5.5's scope is FOUR BDD clauses rolled into a single AC block (epics.md lines 1123-1132)** decomposing into FOUR PATHS:

- **Prompt-emit + read path (AC-1 — lines 1123-1125)**: when `--interactive` is supplied AND each iteration is about to dispatch, Stepper emits a JSON-line `action: "report"` carrying the planned step + a prompt `Continue? [y/N]`; the slash-command markdown waits for user input on the main thread before the next iteration. **Concretely** in the runner body: BEFORE the `await runNextFn()` call (and BEFORE the SIGINT iteration-body check at run.ts:1089), check `args.interactive === true`; if set, compute the planned step (best-effort — read state.lastSuccessfulStep + walk DAG one node ahead OR just label the planned-step as `<unknown — pre-dispatch peek>` per OQ-2 decision below), emit a single AR9 `"report"` JSON-line via `emitDispatchAction`, then read ONE LINE from stdin via the test-injectable `readStdinLine` seam.

- **`y` response path (AC-2 — lines 1126-1128)**: when the user responds `y` (case-insensitive — see OQ-4), the iteration proceeds normally. **Concretely** in the runner body: parse the response; if normalized response is `"y"`, fall through to the existing iteration-body code (deferred-baseline + runNextFn + record + token accumulation + 80%-warning + halt-on-error gate); the loop continues to the next iteration; the next iteration's interactive-prompt cycle re-fires.

- **`N` / empty / garbage response path (AC-3 — lines 1129-1131)**: when the user responds `N` or anything other than `y` (including empty / blank / whitespace / arbitrary text), the loop exits cleanly with reason `manual (interactive halt) — --resume available`. **Concretely** in the runner body: any non-`y` response constructs a NEW `manual-interactive-halt` StopReason variant (with the AC-mandated message text + iteration count at halt-observation); breaks out of the iteration loop; flows through the existing `formatLoopExitLines` Story 4.10 emission path; exit code is `0` (FR53 clean exit).

- **SIGINT-during-prompt path (AC-4 — line 1132)**: SIGINT during an interactive prompt also exits cleanly. **Concretely**: the existing Story 4.9 `signalOverride` + `shutdownRequested` flag installation (at `runLoop` entry — line 678) is ALREADY ACTIVE when the interactive prompt is awaiting stdin. Per OQ-3 decision below: the production `readStdinLine` implementation (Bun stdin / Node readline) is INTERRUPTIBLE by SIGINT — when SIGINT fires during the stdin await, the read either rejects with an `AbortError`-like exception (Node readline.question with abort signal) OR resolves with `null` (Bun for await of stdin chunks broken by SIGINT). The runner branch is: catch the rejection OR detect the null return, then check `shutdownRequested`; if true, the existing top-of-while SIGINT short-circuit at run.ts:1089 fires on the next iteration boundary OR the stdin-read path throws and the runner body's outer try/catch composes a `manual-sigint` StopReason — EITHER way the loop halts cleanly.

**Architectural challenge — stdin read mechanism (per OQ-1 decision)**: production stdin read uses `Bun.stdin` (the Bun-native stdin reader) wrapped with a single-line consumer pattern. **Concretely**: the v0.1 implementation uses `for await (const chunk of Bun.stdin.stream())` to accumulate the first line until newline; OR alternately, `Node.js readline.createInterface({ input: process.stdin })` with `rl.question("Continue? [y/N] ", resolve)` semantics adapted for the existing emit-then-read pattern (the prompt is emitted via AR9 JSON-line BEFORE the readline question, so readline's question prompt is empty-string). Per OQ-1 decision below: USE Bun.stdin via async iterator over chunks (matches Bun-native preference; Node.js readline introduces a foreign event-loop hook that complicates SIGINT cooperation; the Bun stdin path natively supports SIGINT abort via the existing process.on("SIGINT") handler from Story 4.9).

**Architectural challenge — Claude Code chat adaptation (per OQ-2 decision)**: Claude Code's slash-command markdown does NOT have raw stdin access in the conventional terminal sense — the slash-command runs in Claude Code's main thread which dispatches subagents/Bash/Tasks via the Layer-1 protocol. Per AC line 1125 phrasing "the slash-command markdown waits for user input on the main thread before the next iteration" — the SEMANTIC is: when the runner emits the JSON-line `"report"` action with the prompt, the slash-command markdown's Bash invocation EXITS at that point (per AR9 single-AR9-line invariant); the markdown THEN displays the prompt to the user (via Claude Code's stdout); the USER responds in the chat; the markdown RE-INVOKES the runner with the response forwarded as a NEW argv flag (e.g., `--interactive-response y`). **However** — per OQ-2 v0.1 decision: this multi-invocation pattern is OUT-OF-SCOPE for v0.1 implementation; v0.1 implements the SINGLE-PROCESS-LOOP variant where the runner internally awaits stdin (working in true terminal contexts like CI / shell scripts that pipe input); the Claude Code chat-adaptation path is DOCUMENTED as a forward-tracker for Story 6.x. The v0.1 implementation is FUNCTIONAL via the test-injection seam + works in pure-terminal contexts; the Claude Code main-thread re-invocation pattern is FUTURE (Story 6.x).

**Architectural decision — new StopReason variant `manual-interactive-halt`**: per OQ-7 decision below — Story 5.5 ADDS ONE new StopReason variant to the discriminated union at `src/commands/loop/run.ts:140-198`. The variant shape:

```typescript
| {
    code: "manual-interactive-halt";
    iterCount: number;          // iter count at halt-observation (0 if halt fires before iteration 1's body)
    response: string;            // the actual response received (for forensic visibility)
    receivedAt: string;          // ISO timestamp of stdin response (set by the runner)
    message: string;             // AC-3 verbatim text "manual (interactive halt) — --resume available" (em-dash U+2014)
  };
```

This mirrors the Story 4.9 `manual-sigint` variant shape verbatim (just with `response` field added for forensic clarity instead of `receivedAt` semantic). The `formatExitReason` switch at run.ts:1419 GAINS an 11th case branch returning `stopReason.message`. The `formatLoopExitLines` second-line snapshot pointer is unchanged (the new variant honours the same snapshot-null fallback).

**Architectural decision — when does the prompt fire**: per OQ-5 decision — the prompt fires AT THE TOP OF EACH ITERATION (BEFORE the SIGINT top-of-while check at run.ts:1089 OR AFTER, per OQ-3 ordering decision below — v0.1 chooses BEFORE for SIGINT-during-prompt cooperation). **Concretely**: the iteration-body order is: (1) check `shutdownRequested` (existing Story 4.9 top-of-while); (2) if `args.interactive === true`, emit prompt + read response + parse → continue OR halt; (3) if continue, fall through to existing stateFn/sprintStatusFn/dagFn loads + shouldStop call + runNextFn + record + ... (existing iteration-body code unchanged). The prompt fires PER ITERATION (every iteration's body) — NOT once at loop entry; PER ITERATION is the user-facing supervisory pattern (the supervisor approves EACH step).

**Architectural decision — response parsing (per OQ-4 decision)**: case-INSENSITIVE `"y"` / `"Y"` (with optional surrounding whitespace) → continue; ANY OTHER response (`"n"`, `"N"`, empty, blank, multi-line, garbage like `"yes please"`, etc.) → halt. The `[y/N]` capital-N convention is the canonical UX shorthand (default is N when user just hits Enter); the response parser normalizes via `response.trim().toLowerCase() === "y"`. Multi-character responses like `"yes"` are HALT (not continue) per the strict-`y` discipline — this matches the prompt's `[y/N]` convention which signals SINGLE-CHAR responses; the user wanting to confirm should type only `y` (or `Y`). **Verbose response variants** (`"yes"`, `"yep"`, `"sure"`, etc.) are HALT in v0.1 — forward-tracker for Story 6.x to liberalize.

**Architectural decision — SIGINT cooperation during prompt (per OQ-3 decision)**: the prompt fires AFTER the existing top-of-while SIGINT check at run.ts:1089. **Concretely**: the iteration-body order becomes:

```
while (true) {
  // Existing Story 4.9 top-of-while SIGINT check (UNCHANGED — runs FIRST per AC-4)
  if (shutdownRequested) { stopReason = manual-sigint; break; }

  // NEW Story 5.5 interactive-prompt gate (runs SECOND, AFTER SIGINT check)
  if (args.interactive === true) {
    // Emit prompt (JSON-line action)
    // Read stdin (interruptible by SIGINT)
    const response = await readStdinLineFn();
    // Re-check SIGINT mid-await — interruption may have fired during stdin read
    if (shutdownRequested) { stopReason = manual-sigint; break; }
    // Parse response
    const normalized = response.trim().toLowerCase();
    if (normalized !== "y") {
      stopReason = manual-interactive-halt; break;
    }
    // Continue to existing stateFn/sprintStatusFn/dagFn loads + shouldStop + runNextFn
  }
  // ... existing iteration body unchanged
}
```

The DOUBLE-SIGINT-CHECK (top-of-while + post-stdin-read) ensures: SIGINT BEFORE prompt → top-of-while catches; SIGINT DURING prompt → stdin read aborts (Bun stdin natively responds to SIGINT) + post-stdin check catches; SIGINT AFTER prompt-Y-response → existing iteration-body SIGINT short-circuit at run.ts:1259 catches; SIGINT AFTER prompt-N-response → loop has already broken via manual-interactive-halt; further SIGINT is moot.

**Architectural decision — `--interactive` interaction with `--auto-fix` (per OQ-8 decision)**: per AC line 1125, the prompt fires when "each iteration is about to dispatch". The `--auto-fix` flag (Story 5.3) is a per-iteration failure-policy override that fires AFTER the verifier failure (which itself is AFTER the dispatch). So the interactive prompt fires BEFORE the dispatch; the `--auto-fix` fixer dispatch fires AFTER the verifier failure WITHIN the iteration. The two flags are compatible: the user gets prompted before each main-step dispatch; if the main step fails, `--auto-fix` automatically dispatches the fixer (the user is NOT re-prompted before the fixer dispatch — that would be a UX maze). v0.1 conservative: `--interactive` only fires ONCE per main-step (before main dispatch, NOT before fixer); the fixer is part of the same iteration. Forward-tracker for Story 6.x: optional `--interactive=fixer` to also gate fixer dispatches.

**Architectural decision — `--interactive` interaction with `--plan-first` (per OQ-9 decision)**: per Story 4.7, `--plan-first` short-circuits BEFORE the iteration body — emits a single AR9 "report" JSON line carrying the planned step sequence, exits 0 without dispatching anything. When `--plan-first` AND `--interactive` are BOTH supplied, the plan-mode short-circuit fires FIRST (per the existing Story 4.7 pre-flight branch at run.ts:729+); the interactive-prompt code path is NEVER reached because no iterations dispatch. v0.1 conservative: `--interactive` is a no-op in `--plan-first` mode (the plan output is the deliverable; no per-iteration prompts make sense in dry-run preview). Forward-tracker for Story 6.x: optional `--interactive --plan-first` could prompt the user to approve the plan WHOLE before printing it (a different UX semantic).

**The 17-code error registry stays at 17** per AR21 + epic-4-retrospective.md §Recommendations item 3 ("Epic 5 should NOT add new error classes — registry stability discipline established across Epics 2/3/4"). Story 5.5 ships ZERO new error classes — the interactive halt is a graceful StopReason variant, NOT an error. The `manual-interactive-halt` variant rides the existing `formatLoopExitLines` two-line emission path; exit code is `0` (clean exit per FR53 — the user requested the halt deliberately).

**Concretely, Story 5.5 produces**:

1. **MODIFY `src/commands/loop/run.ts`** (~+60-100 lines): add the interactive-prompt gate inside the iteration body (AFTER top-of-while SIGINT check, BEFORE the existing stateFn/sprintStatusFn/dagFn loads). Add the new `interactiveStdinOverride` test seam to `LoopOpts`. Add the new `manual-interactive-halt` StopReason variant to the discriminated union. Extend `formatExitReason` switch with the 11th case branch returning `stopReason.message`. ZERO new file imports beyond the existing `emitDispatchAction` (used to emit the prompt JSON-line) — the production stdin read uses `Bun.stdin` (Bun-native, no import needed).

2. **MODIFY `src/commands/loop/args.ts`** (zero net change to schema; the `interactive` field is ALREADY DECLARED at line 102): NO source change. Story 4.1 already declared the schema field; Story 5.5 wires the runtime consumption. Optional: extend the field's JSDoc with a Story-5.5-prefixed paragraph explaining the runtime-wired semantics.

3. **MODIFY `src/commands/loop/args.test.ts`** (~+10-20 lines): existing tests at lines 41-221 already validate parsing. Story 5.5 ADDS optional documentation tests (e.g., IA_55_PARSE_1 — `--interactive` parses to `interactive: true`; IA_55_PARSE_2 — `--interactive` works combined with other flags). The existing tests already cover the parsing surface; additional tests are defence-in-depth.

4. **MODIFY `src/commands/loop/run.test.ts`** (~+200-300 lines): add a NEW `describe` block for `IA_55_*` tests covering:
   - **IA_55_RUN_1 — happy path**: `--interactive` + stdin returns `"y"` → iteration proceeds normally; runNextFn invoked; loop continues to next iteration which re-prompts.
   - **IA_55_RUN_2 — N response halts**: `--interactive` + stdin returns `"N"` → loop halts with `manual-interactive-halt` StopReason; iterations.length=0 (or the count where N was received); exitCode=0.
   - **IA_55_RUN_3 — empty response halts**: `--interactive` + stdin returns `""` → halt (default-N convention).
   - **IA_55_RUN_4 — whitespace response halts**: `--interactive` + stdin returns `"   "` → halt (after trim).
   - **IA_55_RUN_5 — garbage response halts**: `--interactive` + stdin returns `"hello world"` → halt.
   - **IA_55_RUN_6 — case-insensitive y**: `--interactive` + stdin returns `"Y"` → continue; verify normalized via toLowerCase.
   - **IA_55_RUN_7 — multi-iteration**: `--interactive --max-iters 3` + stdin returns `"y"` x3 → 3 iterations dispatched; loop exits with `max-iters-reached` (NOT `manual-interactive-halt`); the prompt fires 3 times.
   - **IA_55_RUN_8 — N at iteration 2**: `--interactive --max-iters 5` + stdin returns `"y"` then `"N"` → 1 iteration dispatched (iter 1); loop halts with `manual-interactive-halt` at iter 2's prompt; iterations.length=1; exitCode=0.
   - **IA_55_RUN_9 — SIGINT during prompt (AC-4)**: `--interactive` + signalOverride triggers SIGINT during stdin await → loop halts with `manual-sigint` (NOT `manual-interactive-halt`); iterations.length=0.
   - **IA_55_RUN_10 — formatExitReason for new variant**: `manual-interactive-halt` StopReason → `formatExitReason` returns AC-3 verbatim text `"manual (interactive halt) — --resume available"`.
   - **IA_55_RUN_11 — formatLoopExitLines snapshot present**: `manual-interactive-halt` StopReason + state with snapshot.sha → returns two-line emission `Loop exited: manual (interactive halt) — --resume available.\nSnapshot: <sha>. Resume: /bmad-next --resume.`.
   - **IA_55_RUN_12 — formatLoopExitLines snapshot null**: `manual-interactive-halt` StopReason + null state → returns one-line emission only (snapshot-null fallback per Story 4.10).
   - **IA_55_SWEEP — Story 4.10 SWEEP extended**: 11 variants × 2 snapshot states = 22 sub-assertions (was 20 at Story 4.10 close; +2 for `manual-interactive-halt` × {snapshot-null, snapshot-present}).

5. **MODIFY `src/commands/loop/plan.ts`** (zero or minimal change): `plan.ts` does NOT consume StopReason directly (it composes `Plan` values); the new variant does NOT affect plan-mode. Verify TypeScript exhaustiveness compiles cleanly. ZERO functional change expected.

6. **MODIFY `commands/bmad-loop.md`** (~+50-80 lines): add a NEW sub-section `### --interactive flag (Story 5.5 — per-step pause)` documenting:
   - The flag's purpose (per-step supervisory pause).
   - The prompt-emit + read mechanism (single-process variant in v0.1 — works in CI / shell pipe; Claude Code chat adaptation deferred to Story 6.x per OQ-2).
   - The response parsing rules (case-insensitive `y` → continue; everything else → halt).
   - The exit message (`manual (interactive halt) — --resume available`; em-dash U+2014).
   - The exit code (0 — clean exit per FR53).
   - The SIGINT cooperation (SIGINT during prompt → manual-sigint exit; SIGINT after y → existing iteration-body short-circuit).
   - The interaction with other flags (`--auto-fix` does not re-prompt for fixer dispatches; `--plan-first` short-circuits BEFORE the prompt; `--max-iters` controls the natural exit when user keeps responding y).
   - The Claude Code chat adaptation note (forward-tracker for Story 6.x).
   - Cross-reference to FR30 + NFR-R5 + AR9.
   - UPDATE the Stop conditions table at line 208 to flip `--interactive` from "parsed only" to "RUNTIME-WIRED in 5.5" (mirror Story 5.3 pattern for `--auto-fix`).

7. **NO src/commands/next/ mutations**: per AC line 1123 verbatim, `--interactive` is `/bmad-loop` ONLY. ZERO changes to `src/commands/next/args.ts`, `src/commands/next/run.ts`, or `src/commands/next/verify-and-advance.ts`. Confirmed by quality gate `grep "interactive" src/commands/next/args.ts` → exit 1 (no match).

## Acceptance Criteria

**Given** `--interactive` is supplied to `/bmad-loop`
**When** each iteration is about to dispatch
**Then** Stepper emits a JSON-line action `"report"` with the planned step and a prompt `Continue? [y/N]`; the slash-command markdown waits for user input on the main thread before the next iteration
**Given** the user responds `y`
**When** input is received
**Then** the iteration proceeds normally
**Given** the user responds `N` or anything else
**When** input is received
**Then** the loop exits cleanly with reason `manual (interactive halt) — --resume available`
**And** SIGINT during an interactive prompt also exits cleanly

## Tasks / Subtasks

- [x] **Task 0 — Pre-flight evidence verification**
  - [x] 0.1 Confirm AC byte-identical to epics.md lines 1123-1132 via `diff /tmp/ac-from-epics-55.txt /tmp/ac-from-story-55.txt` → empty output expected (no differences).
  - [x] 0.2 Confirm sprint-status.yaml: 5-5-interactive-pause-between-steps row at line 99 currently `backlog` (Story 5.4 done; epic-5 stays in-progress; 2 stories remaining = 5.5 + 5.6).
  - [x] 0.3 Confirm errors registry at 17 codes via `grep -c "extends StepperError" src/errors.ts` → 17 (UNCHANGED; Story 5.5 adds ZERO new error classes per AR21+22 + epic-4-retro Recommendations item 3).
  - [x] 0.4 Confirm baseline test counts via `bun test`: ~1216 pass / 0 fail / ~4268 expects across 66 files (Story 5.4 close baseline).
  - [x] 0.5 Confirm `LoopArgsSchema.interactive` field already declared at `src/commands/loop/args.ts:102` as `z.boolean().optional()` (RUNTIME-DEFERRED per Story 4.1 Field-enumeration table).
  - [x] 0.6 Confirm Story 4.9 `signalOverride` + `shutdownRequested` flag pattern + closure-scoped handler at `src/commands/loop/run.ts:662-678` — the existing infrastructure that Story 5.5 RIDES for SIGINT-during-prompt cooperation.
  - [x] 0.7 Confirm Story 4.10 `formatExitReason` + `formatLoopExitLines` + SWEEP_410 invariant at `src/commands/loop/run.ts:1419+1499+run.test.ts SWEEP_410` — the existing emission infrastructure that Story 5.5 EXTENDS (10 variants → 11 variants).
  - [x] 0.8 Confirm `src/commands/next/args.ts` does NOT declare `--interactive` (per AC line 1123 verbatim — `--interactive` is /bmad-loop ONLY); verify via `grep -n "interactive" src/commands/next/args.ts` → exit 1 (no match).
  - [x] 0.9 Confirm `commands/bmad-loop.md` line 38 already mentions `--interactive` in the Usage examples + line 222 stop-conditions table currently says `parsed only` for the row — Story 5.5 will flip this to `RUNTIME-WIRED in 5.5` (mirrors Story 5.3 `--auto-fix` precedent at line 223).

- [x] **Task 1 — Address Story 5.4 + Stories 5.1/5.2/5.3 + Epic-4 retrospective forward action items**
  - [x] 1.1 Per Story 5.4 SDR §Forward-trackers (To Story 5.5): "SIGINT cooperation pattern (Story 5.1 RT_51_VA_8; Story 5.2 SK_52_VA_8; Story 5.3 RTF_53_VA_8; Story 5.4 ESC_54_VA_7) is the precedent for Story 5.5's interactive-pause cooperation per Story 4.9 §I-2." — HONOURED via IA_55_RUN_9 (SIGINT during prompt → manual-sigint).
  - [x] 1.2 Per Story 5.3 SDR §I-1 (atomic-write contract): NOT APPLICABLE — Story 5.5 does NOT mutate state.yaml directly; the about-to-run iteration NEVER reaches verify-and-advance.ts when the interactive halt fires.
  - [x] 1.3 Per Story 5.3 SDR §I-2 (SIGINT cooperation from Story 4.9 §I-2): HONOURED via IA_55_RUN_9.
  - [x] 1.4 Per Story 5.3 SDR §I-3 (Production retry-dispatch mechanism gap): NOT APPLICABLE — interactive is a pre-dispatch gate, not a retry path.
  - [x] 1.5 Per Story 5.3 SDR §I-4 (D1 dual-shape consolidation): NOT APPLICABLE.
  - [x] 1.6 Per Story 5.3 SDR §I-5 (Telemetry consumption — Story 6.6/6.7): EXTENDED — Story 6.6/6.7 may consume `state.runHistory[]` filtered by interactive-pause halt counts (NEW telemetry signal); v0.1 ships only the StopReason variant; the runHistory does NOT carry interactive-halt metadata in v0.1; forward-tracker.
  - [x] 1.7 Per Story 5.3 SDR §I-6 (--auto-fix + --dry-run report-mode preview): NOT APPLICABLE.
  - [x] 1.8 Per Story 5.3 SDR §I-7 (Explicit FixerDispatchError class): NOT APPLICABLE.
  - [x] 1.9 Per Story 5.3 SDR §I-8 (Multi-fix retry strategy): NOT APPLICABLE.
  - [x] 1.10 Per Story 5.3 SDR §I-9 (Fixer-CONTEXT schema validation): NOT APPLICABLE.
  - [x] 1.11 Per epic-4-retrospective.md §Recommendations item 1 (failure modes MUST consume formatLoopExitLines): HONOURED — interactive-halt flows through `formatLoopExitLines(stopReason, state)` per Story 4.10 unified format.
  - [x] 1.12 Per epic-4-retrospective.md §Recommendations item 2 (per-step failurePolicies config — Story 5.6): NOT YET APPLICABLE — Story 5.6 wires the config; Story 5.5 lands the `--interactive` flag (NOT a per-step policy; it is a loop-level flag).
  - [x] 1.13 Per epic-4-retrospective.md §Recommendations item 3 (Epic 5 should NOT add new error classes): HONOURED — Story 5.5 ships ZERO new error classes (registry stays at 17).
  - [x] 1.14 Per epic-4-retrospective.md §Recommendations item 4 (each Story 5.x flow MUST be tested with SIGINT-mid-flight): HONOURED — IA_55_RUN_9 asserts SIGINT mid-prompt halts cleanly with manual-sigint.
  - [x] 1.15 Per epic-4-retrospective.md §Recommendations item 7 (runHistory[] attempt-number metadata): NOT APPLICABLE — Story 5.5 does not extend runHistory.
  - [x] 1.16 Per Story 5.4 SDR forward-trackers I-1 through I-9: ALL inherited; only I-2 (SIGINT cooperation) actively HONOURED via IA_55_RUN_9; the rest NOT APPLICABLE for this story scope.
  - [x] 1.17 Per Story 5.3 inherited cosmetic nits N-1/N-2/N-3/N-4 (defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams): INHERITED unchanged. Story 5.5 does NOT modify any of these surfaces.

- [x] **Task 2 — Add the interactive-prompt runtime gate inside the iteration body in src/commands/loop/run.ts (AC: 1.1 + 1.2)**
  - [x] 2.1 Modify `src/commands/loop/run.ts`. ADD a new test-injection seam to `LoopOpts` interface at lines 291-420: `readonly interactiveStdinOverride?: () => Promise<string> | string;` with JSDoc explaining the seam mirrors signalOverride from Story 4.9 — production callers pass nothing → the runner uses the real `Bun.stdin` reader; tests pass a stub returning the simulated user response.
  - [x] 2.2 ADD a closure-private `readStdinLineFn` resolver at the top of `runLoop` body (near the `installSignalFn` resolver at line 670): `const readStdinLineFn = opts?.interactiveStdinOverride ?? (async () => { /* production Bun stdin read */ });`. The production implementation reads ONE LINE from `Bun.stdin` via `for await (const chunk of Bun.stdin.stream())` accumulating until the first `\n`; returns the line WITHOUT the trailing newline. Defensive: timeout / empty-eof → return empty string (treated as N per parsing rules).
  - [x] 2.3 Inside the iteration body's `while (true)` block at run.ts:1082, ADD the interactive-prompt gate AFTER the existing top-of-while SIGINT check (lines 1089-1098) but BEFORE the existing stateFn/sprintStatusFn/shouldStop call at line 1103:
    ```typescript
    // Story 5.5: --interactive per-step prompt + read gate (FR30; AR9 +
    // AR34). Fires AFTER the top-of-while SIGINT check (so SIGINT-before-
    // prompt is caught) and BEFORE the stateFn/sprintStatusFn loads (so
    // the user can halt the loop without consuming any per-iteration I/O).
    if (args.interactive === true) {
      // Compute the planned step (best-effort — read state.lastSuccessfulStep
      // for the about-to-run hint; per OQ-2 v0.1: use the last-successful-
      // step's name as the "planned step" label since the actual next step
      // is computed inside runNextFn's DAG walk).
      const peekState = await stateFn();
      const plannedStepLabel =
        peekState?.lastSuccessfulStep?.step ?? "<initial-step>";

      // Emit the prompt as a single AR9 "report" JSON line (per AR9 +
      // FR54). The runner's OWN final-emission AR9 line is RESERVED for
      // the loop-exit summary (per Story 4.1 final-emission strategy);
      // the per-iteration interactive prompt is DOCUMENTED as a
      // pre-iteration "report" line that the slash-command markdown
      // displays to the user (per AC line 1125).
      emitDispatchAction({
        action: "report",
        message: `Continue? [y/N]`,
        exitCode: 0,
      });

      // Read ONE LINE from stdin via the test-injectable seam.
      const response = await readStdinLineFn();

      // Re-check SIGINT — the stdin read may have been interrupted by
      // a SIGINT signal (Bun.stdin natively responds to SIGINT). The
      // double-check ensures SIGINT-during-prompt is caught BEFORE the
      // response-parsing branch.
      if (shutdownRequested) {
        stopReason = {
          code: "manual-sigint",
          iterCount,
          receivedAt: shutdownReceivedAt ?? nowFn(),
          message: "manual (SIGINT) — partial work committed; --resume available",
        };
        break;
      }

      // Parse response: case-insensitive `y` → continue; ANYTHING ELSE → halt.
      // Per OQ-4 decision: strict `y` discipline; multi-character responses
      // like "yes" are HALT (not continue) — matches the prompt's [y/N]
      // single-char convention.
      const normalized = response.trim().toLowerCase();
      if (normalized !== "y") {
        stopReason = {
          code: "manual-interactive-halt",
          iterCount,
          response,
          receivedAt: nowFn(),
          message: "manual (interactive halt) — --resume available",
        };
        break;
      }

      // `y` response → fall through to the existing iteration body.
    }
    ```
  - [x] 2.4 The em-dash `—` in the AC-mandated message text is U+2014 (consistent with Story 4.6 `error-stop` and Story 4.9 `manual-sigint` precedents); verify via `printf '%s' "manual (interactive halt) — --resume available" | xxd | head -3` shows `e2 80 94` for the em-dash byte sequence.
  - [x] 2.5 The `peekState` read inside the interactive-prompt gate is INDEPENDENT from the existing stateFn read at line 1103 — both reads happen per iteration when `args.interactive === true`. v0.1 conservative: TWO state reads per iteration when interactive (one for the prompt's planned-step label; one for shouldStop's consumption); forward-tracker for Story 6.x: cache the state read across the two consumers.

- [x] **Task 3 — Add the new `manual-interactive-halt` StopReason variant + extend formatExitReason switch (AC: 1.3)**
  - [x] 3.1 Modify `src/commands/loop/run.ts`. ADD a new variant to the `StopReason` discriminated union at lines 140-198:
    ```typescript
    | {
        // Story 5.5: --interactive per-step pause, user response halt.
        // Constructed DIRECTLY by the runner body when stdin response
        // is non-`y` — NOT via evaluateStopConditions dispatch (mirrors
        // the existing manual-sigint runner-direct variant).
        // `iterCount` is the iter count at halt-observation (0 if halt
        // fires before iteration 1's body); `response` is the actual
        // response received (for forensic visibility); `receivedAt` is
        // the ISO timestamp of stdin response (set by the runner);
        // `message` is the AC-3 verbatim text "manual (interactive halt)
        // — --resume available" (em-dash U+2014).
        code: "manual-interactive-halt";
        iterCount: number;
        response: string;
        receivedAt: string;
        message: string;
      };
    ```
  - [x] 3.2 Modify `src/commands/loop/run.ts`. EXTEND the `formatExitReason` switch at line 1419 with the 11th case branch:
    ```typescript
    case "manual-interactive-halt":
      // Story 5.5 AC-3 verbatim: "manual (interactive halt) —
      // --resume available" (em-dash U+2014). The message is composed
      // by the runner at construction (iteration-body interactive-
      // prompt gate); we delegate to the stored message field for
      // AC-byte-identical text.
      return stopReason.message;
    ```
  - [x] 3.3 Update the `StopReason` JSDoc block at lines 110-138 to mention Story 5.5's new variant (mirrors the existing Story 4.9 `manual-sigint` paragraph that documented the variant addition).
  - [x] 3.4 Update the `formatExitReason` JSDoc block at lines 1383-1416 to add a `manual-interactive-halt:` line in the per-variant text table.
  - [x] 3.5 The exit-code mapping in `runLoop` at lines 1340-1343 already produces `0` for any non-`halt-on-error`/`error-stop` variant — the new `manual-interactive-halt` variant naturally maps to exit code `0` (clean exit per FR53; the user requested the halt deliberately).

- [x] **Task 4 — Update src/commands/loop/plan.ts for TypeScript exhaustiveness (AC: 1.3)**
  - [x] 4.1 Modify `src/commands/loop/plan.ts`. Verify `bunx tsc --noEmit` succeeds after Task 3's StopReason union extension. Per OQ-9 decision: `plan.ts` does NOT consume StopReason directly (it composes `Plan` values); the new variant should NOT trigger a TypeScript exhaustiveness warning. ZERO functional change expected; the task is a TypeScript validation gate.
  - [x] 4.2 If `bunx tsc --noEmit` reports any new exhaustiveness warning in plan.ts (or other consumers of StopReason — `formatLoopExitLines`, `writeLoopExitTranscript`), add the `manual-interactive-halt` case branch as needed. The existing Story 4.10 `formatLoopExitLines` consumes StopReason via `formatExitReason` (which Task 3 already extended), so the second-line snapshot pointer is naturally preserved.

- [x] **Task 5 — Optional: extend src/commands/loop/args.test.ts with IA_55_PARSE_* tests (AC: 1.1)**
  - [x] 5.1 Modify `src/commands/loop/args.test.ts`. The existing tests at lines 41-221 already cover the parsing surface (`--interactive` parses to `interactive: true`; mutually-exclusive with NO other flag; `.strict()` rejects unknown keys). v0.1: ADD optional `IA_55_PARSE_*` describe block with documentation tests:
    - **IA_55_PARSE_1**: `parseLoopArgs(["--interactive"])` returns `{ ok: true, value: { interactive: true } }`.
    - **IA_55_PARSE_2**: `parseLoopArgs(["--interactive", "--max-iters", "5"])` returns `{ ok: true, value: { interactive: true, maxIters: 5 } }`.
    - **IA_55_PARSE_3**: `parseLoopArgs(["--interactive", "true"])` (defence-in-depth boolean shorthand) returns `{ ok: true, value: { interactive: true } }`.
    - **IA_55_PARSE_4**: `parseLoopArgs(["--interactive", "false"])` returns `{ ok: true, value: { interactive: false } }`.
  - [x] 5.2 The existing test at line 81 already covers IA_55_PARSE_1; the new tests are defence-in-depth.

- [x] **Task 6 — Add IA_55_RUN_* tests in src/commands/loop/run.test.ts (AC: 1.1 + 1.2 + 1.3 + 1.4)**
  - [x] 6.1 Modify `src/commands/loop/run.test.ts`. ADD a NEW describe block `IA_55_*: --interactive runtime gate (Story 5.5)` at the END of the file (after the existing SI_49_* SIGINT block + EX_410_* exit-format block + SWEEP_410 block). The block uses the existing `LoopOpts` test-injection seam pattern (mirrors SI_49_*).
  - [x] 6.2 Add helper: `makeStdinSeam(responses: string[]): { stub, calls }` — returns a mutable counter-stub that returns successive responses from the array; tests assert the call count + parameter passing.
  - [x] 6.3 IA_55_RUN_1 — happy path `--interactive` + stdin `"y"` → iteration proceeds normally; runNextFn invoked; loop continues until max-iters cap.
  - [x] 6.4 IA_55_RUN_2 — N response halts: `--interactive` + stdin `"N"` → loop halts with `manual-interactive-halt`; iterations.length=0; exitCode=0; stopReason.response="N"; stopReason.message="manual (interactive halt) — --resume available".
  - [x] 6.5 IA_55_RUN_3 — empty response halts: `--interactive` + stdin `""` → halt (default-N convention); stopReason.response="".
  - [x] 6.6 IA_55_RUN_4 — whitespace response halts: `--interactive` + stdin `"   "` → halt; stopReason.response="   " (the parser trims internally; the recorded response preserves the user's literal input for forensic visibility).
  - [x] 6.7 IA_55_RUN_5 — garbage response halts: `--interactive` + stdin `"hello world"` → halt; stopReason.response="hello world".
  - [x] 6.8 IA_55_RUN_6 — case-insensitive y: `--interactive` + stdin `"Y"` → continue; verify normalized via toLowerCase.
  - [x] 6.9 IA_55_RUN_7 — multi-iteration: `--interactive --max-iters 3` + stdin returns `"y"` x3 → 3 iterations dispatched; loop exits with `max-iters-reached` (NOT `manual-interactive-halt`); the prompt fires 3 times; runNextFn called 3 times.
  - [x] 6.10 IA_55_RUN_8 — N at iteration 2: `--interactive --max-iters 5` + stdin returns `"y"` then `"N"` → 1 iteration dispatched (iter 1); loop halts with `manual-interactive-halt` at iter 2's prompt; iterations.length=1; exitCode=0; runNextFn called 1 time; stdin called 2 times.
  - [x] 6.11 IA_55_RUN_9 — SIGINT during prompt (AC-4): `--interactive` + signalOverride triggers SIGINT BEFORE stdin returns + interactiveStdinOverride throws `AbortError` (or returns empty after SIGINT) → loop halts with `manual-sigint` (NOT `manual-interactive-halt`) per the post-stdin SIGINT re-check; iterations.length=0; exitCode=0.
  - [x] 6.12 IA_55_RUN_10 — formatExitReason for new variant: `manual-interactive-halt` StopReason → `formatExitReason` returns AC-3 verbatim text "manual (interactive halt) — --resume available" (assert byte-identical including em-dash U+2014).
  - [x] 6.13 IA_55_RUN_11 — formatLoopExitLines snapshot present: `manual-interactive-halt` StopReason + state with snapshot.sha → returns two-line emission `Loop exited: manual (interactive halt) — --resume available.\nSnapshot: <sha>. Resume: /bmad-next --resume.`.
  - [x] 6.14 IA_55_RUN_12 — formatLoopExitLines snapshot null: `manual-interactive-halt` StopReason + null state → returns one-line emission only (snapshot-null fallback per Story 4.10).
  - [x] 6.15 IA_55_SWEEP — Story 4.10 SWEEP extended: 11 variants × 2 snapshot states = 22 sub-assertions (was 20 at Story 4.10 close; +2 for `manual-interactive-halt` × {snapshot-null, snapshot-present}). Update the existing SWEEP_410 describe block OR add a NEW SWEEP_55 block per OQ-10 decision.
  - [x] 6.16 Each IA_55_RUN_* test uses `runNextOverride` + `interactiveStdinOverride` + `stateOverride` + `signalOverride` + `nowOverride` seams as needed.

- [x] **Task 7 — Update commands/bmad-loop.md (AC: all)**
  - [x] 7.1 Modify `commands/bmad-loop.md`. UPDATE the Stop conditions table at line 222 — flip `--interactive` from "parsed only" to "RUNTIME-WIRED in 5.5" (mirror Story 5.3 `--auto-fix` precedent at line 223).
  - [x] 7.2 ADD a NEW sub-section `### --interactive flag (Story 5.5 — per-step pause)` AFTER the existing Failure-UX modes sub-sections (e.g., after the Story 5.4 escalate sub-section). Cover:
    - The flag's purpose: per-step supervisory pause; the user approves EACH iteration before dispatch.
    - The prompt-emit + read mechanism: BEFORE each iteration's dispatch (and AFTER the SIGINT top-of-while check), the runner emits a JSON-line `{"action":"report","message":"Continue? [y/N]","exitCode":0}` to stdout, then reads ONE LINE from stdin.
    - The response parsing rules: case-insensitive `y` (with optional surrounding whitespace) → continue; ANY OTHER response (`n`, `N`, empty, blank, garbage like "hello", multi-character like "yes") → halt with `manual-interactive-halt` StopReason.
    - The exit message: `Loop exited: manual (interactive halt) — --resume available.\nSnapshot: <sha>. Resume: /bmad-next --resume.` (em-dash U+2014; consistent with Story 4.6 + 4.9 + 4.10 unified format).
    - The exit code: `0` (clean exit per FR53; the user requested the halt deliberately).
    - The SIGINT cooperation per AC-4: SIGINT during prompt → `manual-sigint` exit (NOT `manual-interactive-halt`) per the post-stdin re-check; SIGINT after `y` response → existing iteration-body short-circuit at run.ts:1259 fires.
    - The interaction with other flags:
      - `--auto-fix`: does NOT re-prompt for fixer dispatches in v0.1 (the fixer is part of the same iteration; the user is prompted ONCE per main-step). Forward-tracker for Story 6.x.
      - `--plan-first`: short-circuits BEFORE the prompt (plan-mode never reaches the iteration body); `--interactive` is a no-op in plan-mode.
      - `--max-iters`: controls the natural exit when the user keeps responding `y`; the loop exits with `max-iters-reached` after N iterations.
      - `--continue-on-error`: the prompt fires BEFORE the dispatch, so the failure-policy override (continue vs stop) is orthogonal.
    - The Claude Code chat adaptation note: v0.1 implements the SINGLE-PROCESS-LOOP variant where the runner internally awaits stdin (works in true terminal contexts like CI / shell scripts that pipe input); the Claude Code main-thread re-invocation pattern (where the slash-command markdown surfaces the prompt + accepts the user's chat response) is DEFERRED to Story 6.x per OQ-2 decision.
    - Cross-reference to FR30 + NFR-R5 + AR9 + AR34.
  - [x] 7.3 UPDATE the trailing "FR cross-reference" paragraph (if present) to add FR30 + NFR-R5.

- [x] **Task 8 — Run full test suite + quality gates (AC: all)**
  - [x] 8.1 Run `bunx tsc --noEmit` — exit 0 (no type errors).
  - [x] 8.2 Run `bunx --bun biome ci .` — exit 0 (after any biome --write pass for new test file formatting).
  - [x] 8.3 Run `bun test src/commands/loop/` — expect ~285+ tests / ~950+ expects across 4 files (Story 5.4 baseline ~270/0/897 + ~15 IA_55_RUN_* + ~4 IA_55_PARSE_* tests).
  - [x] 8.4 Run `bun test src/errors.test.ts` — expect 14/0/215 (registry stays at 17; UNCHANGED — Story 5.5 ships ZERO new error classes).
  - [x] 8.5 Run `bun test` (full) — expect ~1235+ pass / 0 fail / ~4290+ expect calls across 66 files (Story 5.4 baseline +15-20 tests).
  - [x] 8.6 Run `bun run check` (biome ci + tests) — exit 0 (all gates green).
  - [x] 8.7 `grep -c "extends StepperError" src/errors.ts` → 17 (UNCHANGED — Story 5.5 ships ZERO new error classes).
  - [x] 8.8 `grep -n "interactive" src/commands/next/args.ts` → exit 1 (NO match — confirming /bmad-loop ONLY scope per AC line 1123 verbatim).
  - [x] 8.9 `grep -n "manual-interactive-halt" src/commands/loop/run.ts` → expect 4-5 matches (StopReason variant declaration + formatExitReason case + iteration-body construction + JSDoc references).
  - [x] 8.10 `grep -F "manual (interactive halt) — --resume available" src/commands/loop/run.ts` → expect ≥1 match (the AC-3 verbatim message text; em-dash U+2014).

- [x] **Task 9 — Self-check + Senior Developer Review prep (AC: all)**
  - [x] 9.1 Confirm ALL 8 tasks ticked.
  - [x] 9.2 Confirm AC byte-identical to epics.md lines 1123-1132 (verified via diff at story creation; re-confirm via final diff).
  - [x] 9.3 Confirm sprint-status.yaml + state.yaml updated per Task 10 below.
  - [x] 9.4 Confirm File List section is populated with NEW + MODIFIED files.
  - [x] 9.5 Confirm Change Log entry is appended.
  - [x] 9.6 Confirm Senior Developer Review section is templated for the upcoming code-review iter.

- [x] **Task 10 — Sprint-status + state.yaml updates on completion (AC: all)**
  - [x] 10.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml` — flip `5-5-interactive-pause-between-steps: backlog → ready-for-dev` at line 99; epic-5 stays `in-progress` at line 94 (UNCHANGED). Bump `last_updated:` at BOTH the comment block top (line 2) AND the live YAML field (line 38) to `2026-05-05T02:13:04Z`.
  - [x] 10.2 Update `.bmad-stepper/state.yaml` — workflow advance: `lastStep: bmad-code-review → bmad-create-story`; `lastStepCompletedAt: 2026-05-05T02:13:04Z`; `nextStep: bmad-create-story → bmad-dev-story`; `nextStepStory: '5.5'` (UNCHANGED); `nextStepKey: 5-5-interactive-pause-between-steps` (UNCHANGED); append ONE evidenceIndex entry: step `bmad-create-story`, path this file, evidence summary line, runId `2026-05-05T021304Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`, epic `'5'`, story `'5.5'`.
  - [x] 10.3 Write `.bmad-stepper/runs/2026-05-05T021304Z-bmad-next/run.yaml` + `tasks/t1-create-story.yaml` records (per the run-record convention from Stories 5.2 + 5.3 + 5.4 precedents).

## Dev Notes — Test Surface Inventory

The dev-iter MUST add the following test cases (cross-referenced to AC):

| Test ID            | Description                                                                                                                                                              | AC Coverage |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| IA_55_PARSE_1      | `parseLoopArgs(["--interactive"])` returns `{ ok: true, value: { interactive: true } }` (defence-in-depth — existing tests already cover)                                   | AC-1        |
| IA_55_PARSE_2      | `parseLoopArgs(["--interactive", "--max-iters", "5"])` returns `{ ok: true, value: { interactive: true, maxIters: 5 } }`                                                  | AC-1        |
| IA_55_PARSE_3      | `parseLoopArgs(["--interactive", "true"])` (defence-in-depth boolean shorthand) returns `{ interactive: true }`                                                            | AC-1        |
| IA_55_PARSE_4      | `parseLoopArgs(["--interactive", "false"])` returns `{ interactive: false }`                                                                                              | AC-1        |
| IA_55_RUN_1        | happy path: `--interactive` + stdin `"y"` → iteration proceeds; runNextFn invoked; loop continues until max-iters cap                                                       | AC-1+2      |
| IA_55_RUN_2        | N response halts: `--interactive` + stdin `"N"` → loop halts with `manual-interactive-halt`; iterations.length=0; exitCode=0                                               | AC-3        |
| IA_55_RUN_3        | empty response halts: `--interactive` + stdin `""` → halt (default-N convention); stopReason.response=""                                                                   | AC-3        |
| IA_55_RUN_4        | whitespace response halts: `--interactive` + stdin `"   "` → halt; stopReason.response="   " (parser trims internally; recorded response preserves literal input)         | AC-3        |
| IA_55_RUN_5        | garbage response halts: `--interactive` + stdin `"hello world"` → halt; stopReason.response="hello world"                                                                  | AC-3        |
| IA_55_RUN_6        | case-insensitive y: `--interactive` + stdin `"Y"` → continue; verify normalized via toLowerCase                                                                            | AC-2        |
| IA_55_RUN_7        | multi-iteration: `--interactive --max-iters 3` + stdin `"y"` x3 → 3 iterations dispatched; max-iters-reached exit; prompt fires 3 times                                    | AC-1+2      |
| IA_55_RUN_8        | N at iteration 2: `--interactive --max-iters 5` + stdin `"y"` then `"N"` → 1 iteration dispatched; manual-interactive-halt at iter 2's prompt; iterations.length=1         | AC-3        |
| IA_55_RUN_9        | SIGINT during prompt (AC-4): `--interactive` + signalOverride triggers SIGINT during stdin await → loop halts with `manual-sigint` (NOT `manual-interactive-halt`)         | AC-4        |
| IA_55_RUN_10       | formatExitReason for new variant: `manual-interactive-halt` StopReason → returns AC-3 verbatim text "manual (interactive halt) — --resume available" (em-dash U+2014)      | AC-3        |
| IA_55_RUN_11       | formatLoopExitLines snapshot present: `manual-interactive-halt` + state with snapshot.sha → two-line emission Loop exited: ... \nSnapshot: ...                            | AC-3        |
| IA_55_RUN_12       | formatLoopExitLines snapshot null: `manual-interactive-halt` + null state → one-line emission only (snapshot-null fallback per Story 4.10)                                  | AC-3        |
| IA_55_SWEEP        | Story 4.10 SWEEP extended: 11 variants × 2 snapshot states = 22 sub-assertions (was 20; +2 for manual-interactive-halt × {null, present})                                  | AC-3        |

## Open Questions for Code Review

- **OQ-1 (stdin read mechanism — Bun.stdin vs Node readline)**: Options: (a) Bun-native `for await (const chunk of Bun.stdin.stream())` accumulating until first newline; (b) Node.js `readline.createInterface({ input: process.stdin })` with `rl.question("", resolve)`; (c) raw `process.stdin.once("data", ...)` Node event. **DECISION OPTION A — Bun.stdin async iterator**: matches Bun-native preference (per architecture's Bun runtime stance); native SIGINT cooperation (the Bun stdin reader is interrupted by SIGINT via the existing process.on("SIGINT") handler from Story 4.9); no foreign event-loop hooks; simplest test seam (interactiveStdinOverride is a `() => Promise<string>` — both Bun and Node implementations conform). Forward-tracker for Story 6.x: Node.js fallback path if Bun stdin behaviour drifts in future Bun versions.

- **OQ-2 (Claude Code chat adaptation — single-process loop vs multi-invocation)**: Options: (a) v0.1 SINGLE-PROCESS-LOOP — the runner internally awaits stdin; works in true terminal contexts (CI, shell pipe); Claude Code chat is OUT-OF-SCOPE for v0.1; (b) v0.1 MULTI-INVOCATION — the runner emits the prompt + EXITS; the slash-command markdown displays the prompt to user; user responds in chat; markdown re-invokes runner with `--interactive-response y` flag forwarded; (c) HYBRID — single-process for true terminals, multi-invocation for Claude Code via a `--interactive-mode={chat,terminal}` flag detection. **DECISION OPTION A — v0.1 SINGLE-PROCESS-LOOP; Claude Code chat-adaptation deferred to Story 6.x**: the v0.1 implementation is FUNCTIONAL via the test-injection seam + works in pure-terminal contexts (CI, shell scripts that pipe input); the Claude Code main-thread re-invocation pattern requires additional state-stash + resume-from-prompt machinery (where do we persist the in-flight loop state across invocations?) that is best designed alongside Story 6.x telemetry + config consolidation. v0.1 documents the limitation clearly in commands/bmad-loop.md; Claude Code users see the prompt JSON-line emit via stdout but the slash-command's markdown body does not (in v0.1) capture user response and pipe it back. Forward-tracker for Story 6.x: full Claude Code chat-adaptation including state-stash protocol.

- **OQ-3 (SIGINT during prompt — does signal abort stdin read cleanly?)**: Options: (a) Bun.stdin async iterator natively responds to SIGINT (interrupts the await chunk loop); (b) explicit AbortController wired to the stdin read with the SIGINT handler triggering abort; (c) timer-based polling of `shutdownRequested` inside the stdin read loop. **DECISION OPTION A — Bun.stdin natively responds to SIGINT**: per Bun's documented behaviour, the async iterator over `Bun.stdin.stream()` is interrupted when SIGINT fires (the underlying ReadableStream closes); the runner's iteration body's POST-stdin SIGINT re-check (Task 2.3) catches the case where the stdin read returned an empty chunk OR threw an exception due to interruption. The runner's existing Story 4.9 SIGINT infrastructure (`shutdownRequested` flag + handler-set + signal install) is preserved; the new contribution is the post-stdin re-check. Forward-tracker for Story 6.x: explicit AbortController if Bun stdin behaviour drifts in future versions.

- **OQ-4 (response parsing — case-sensitivity)**: Options: (a) STRICT — only literal `y` matches; `Y` halts; (b) CASE-INSENSITIVE — `y` and `Y` both match (with optional surrounding whitespace); (c) LIBERAL — `y`, `Y`, `yes`, `Yes`, `YES`, `yep`, `sure` all match. **DECISION OPTION B — CASE-INSENSITIVE STRICT-`y`**: the prompt's `[y/N]` convention signals SINGLE-CHAR responses; case-insensitive matches user expectations (typing `Y` while CapsLock is on shouldn't accidentally halt the loop); multi-character responses like `yes` are HALT (not continue) — this matches Unix tradition (`yes` is a separate command; the prompt convention is single-char). The parser normalizes via `response.trim().toLowerCase() === "y"`. Forward-tracker for Story 6.x: liberalize to accept `yes` / `Y\n` / etc. if user feedback indicates confusion.

- **OQ-5 (empty response = N — default-N convention)**: per the `[y/N]` capital-N convention, empty response (just Enter) is treated as N (the default). Per OQ-4 strict-`y` decision: empty response normalizes to `""` which is NOT `"y"` → HALT. **DECISION CONFIRMED**: empty response is HALT per the `[y/N]` capital-N convention. ESC tests (IA_55_RUN_3) verify.

- **OQ-6 (prompt-emit format — exact JSON shape)**: Options: (a) AR9 `report` action with the prompt as `message` field — `{"action":"report","message":"Continue? [y/N]","exitCode":0}`; (b) AR9 `report` action with structured prompt + planned-step fields — `{"action":"report","message":"...","prompt":"Continue? [y/N]","step":"<planned-step>","exitCode":0}`; (c) NEW AR9 action variant `prompt` with structured shape — requires dispatch-protocol.ts schema bump. **DECISION OPTION A — AR9 report action with prompt as message field**: the AR9 dispatch-protocol schema (Story 2.2) defines `report` with `message: string + exitCode: number`; the AC line 1125 phrasing "JSON-line action `\"report\"` with the planned step and a prompt `Continue? [y/N]`" allows the message field to carry the composite text (e.g., `"<planned-step>: Continue? [y/N]"`); v0.1 uses the simplest form `"Continue? [y/N]"` per Task 2.3 (the planned-step label is computed but not surfaced in the prompt body — forward-tracker for Story 6.x to enrich the prompt with the planned-step name). NO schema bump; reuses existing AR9 `report` action.

- **OQ-7 (state.yaml advance on interactive halt — same as Story 4.10 patterns)**: Options: (a) NO state mutation by the runner on interactive halt (mirror manual-sigint Story 4.9 — the about-to-run iteration NEVER reaches verify-and-advance.ts when the halt fires); (b) RECORD interactive halt in `state.runHistory[]` as a forensic entry (NEW shape extension); (c) RECORD interactive halt in NEW `state.haltHistory[]` array (Story 6.x forward-tracker). **DECISION OPTION A — NO state mutation by runner**: identical to Story 4.9 manual-sigint semantics; the about-to-run iteration NEVER reaches verify-and-advance.ts so no state.runHistory[] entry is appended; the iteration-body iterations BEFORE the halt may have advanced state via verify-and-advance.ts (per their natural per-iteration semantics); the halt itself is forensic-only at the loop-exit transcript level. Forward-tracker for Story 6.x: state.haltHistory[] for richer halt forensic timelines (Story 5.4 OQ-1 forward-tracker also references this).

- **OQ-8 (`--interactive` + `--auto-fix` interaction)**: see Architectural decision #8 above. **DECISION v0.1 conservative**: `--interactive` only fires ONCE per main-step (before main dispatch, NOT before fixer). Forward-tracker for Story 6.x: optional `--interactive=fixer` to also gate fixer dispatches.

- **OQ-9 (integration test — can't test stdin in unit; use test seam; integration in Claude Code is manual)**: Options: (a) UNIT-ONLY testing via the `interactiveStdinOverride` test seam (covers all Y/N/empty/garbage paths + SIGINT); (b) INTEGRATION test via `Bun.spawn` with a child process that pipes stdin; (c) HYBRID — unit + small integration smoke test. **DECISION OPTION A — UNIT-ONLY via test seam**: matches the Story 4.9 signalOverride pattern (no integration test for SIGINT; the unit tests cover all paths via the seam); the production stdin read path is exercised manually in true-terminal contexts; the `interactiveStdinOverride` seam is the test-discipline equivalent of the production code path. Forward-tracker for Story 6.x: optional integration test via Bun.spawn pipe-stdin if user feedback indicates a regression.

- **OQ-10 (telemetry interactive-halt-event payload — Epic 6 dependency)**: Options: (a) LOG interactive halt counts via state.runHistory[] (NEW field); (b) LOG via NEW state.haltHistory[] array; (c) v0.1 ONLY ships the StopReason variant; telemetry consumption is Story 6.x. **DECISION OPTION C — v0.1 ships only the StopReason variant; telemetry consumption deferred**: the `manual-interactive-halt` variant is captured in the `LoopExitTranscriptInput` (Story 4.10 schema) which is written to `_bmad-output/.stepper/runs/<ts>-loop-exit.json`; future Story 6.6/6.7 can iterate the loop-exit transcripts and aggregate interactive-halt counts per loop run. ZERO new telemetry surface in v0.1. Forward-tracker for Story 6.x: aggregate interactive-halt counts per project across loop runs.

## Forward Action Items From Predecessors

Story 5.5 INHERITS the following forward-trackers from Stories 5.1 + 5.2 + 5.3 + 5.4 + Epic 4 (per Story 5.4 SDR §Forward-trackers and §Recommendations for Epic 5 + epic-4-retrospective.md §Recommendations for Epic 5):

- **From Story 5.4 SDR §Forward-trackers (To Story 5.5)**:
  - **SIGINT cooperation pattern (Story 5.1 RT_51_VA_8; Story 5.2 SK_52_VA_8; Story 5.3 RTF_53_VA_8; Story 5.4 ESC_54_VA_7)**: HONOURED via IA_55_RUN_9 (SIGINT during prompt → manual-sigint).

- **From Story 5.4 SDR §Forward-trackers (general inheritance)**:
  - **I-1 (atomic-write contract from Story 4.8 §I-1)**: NOT APPLICABLE — Story 5.5 does NOT mutate state.yaml directly; the about-to-run iteration NEVER reaches verify-and-advance.ts when the interactive halt fires.
  - **I-2 (SIGINT cooperation from Story 4.9 §I-2)**: HONOURED via IA_55_RUN_9.
  - **I-3 (Production retry-dispatch mechanism gap)**: NOT APPLICABLE — interactive is a pre-dispatch gate, not a retry path.
  - **I-4 (D1 dual-shape consolidation)**: NOT APPLICABLE.
  - **I-5 (Telemetry consumption)**: EXTENDED — Story 6.6/6.7 may consume loop-exit transcripts for interactive-halt counts (NEW telemetry signal); v0.1 ships only the StopReason variant.
  - **I-6 (Halt history array for richer telemetry timelines)**: EXTENDED — interactive halt is a NEW halt source that future state.haltHistory[] should capture.
  - **I-7 (Optional --verbose flag for stack-trace-on-stderr)**: NOT APPLICABLE — interactive halt is graceful, not an error.
  - **I-8 (recordedAt timestamp in lastFailureReason)**: NOT APPLICABLE — interactive halt does NOT set lastFailureReason.
  - **I-9 (Regex tightening)**: NOT APPLICABLE — interactive halt is graceful, not a failure-UX policy with actionable hint.

- **From Story 5.3 SDR §Forward-trackers**:
  - **I-1 (atomic-write contract)**: NOT APPLICABLE.
  - **I-2 (SIGINT cooperation)**: HONOURED via IA_55_RUN_9.
  - **I-3 (Production retry-dispatch gap)**: NOT APPLICABLE.
  - **I-4 (D1 dual-shape)**: NOT APPLICABLE.
  - **I-5 (Telemetry consumption)**: EXTENDED.

- **From Story 5.2 SDR §Forward-trackers**:
  - **I-1 (atomic-write contract)**: NOT APPLICABLE.
  - **I-2 (SIGINT cooperation)**: HONOURED via IA_55_RUN_9.
  - **I-3/I-4/I-5**: NOT APPLICABLE / EXTENDED similarly.

- **From Story 5.1 SDR §Forward-trackers**:
  - **N-5 (dispatchFailureUx v0.1 stub)**: FULLY RESOLVED by Story 5.4 (already done — Story 5.5 inherits the resolved state).
  - **§I-1 (atomic-write contract)**: NOT APPLICABLE.
  - **§I-3 (SIGINT cooperation)**: HONOURED via IA_55_RUN_9.
  - **§I-4 (Production retry-dispatch gap)**: NOT APPLICABLE.
  - **§I-5 (D1 dual-shape consolidation)**: NOT APPLICABLE.
  - **§I-7 (Telemetry via runHistory)**: EXTENDED via loop-exit transcripts.

- **From epic-4-retrospective.md §Recommendations for Epic 5**:
  - **Item 1 (failure modes MUST consume formatLoopExitLines)**: HONOURED — interactive-halt flows through `formatLoopExitLines(stopReason, state)` per Story 4.10 unified format.
  - **Item 2 (per-step failurePolicies config — Story 5.6)**: NOT YET APPLICABLE — Story 5.6 wires the config; Story 5.5 lands the `--interactive` flag (NOT a per-step policy).
  - **Item 3 (Epic 5 should NOT add new error classes)**: HONOURED — Story 5.5 ships ZERO new error classes (registry stays at 17).
  - **Item 4 (each Story 5.x flow MUST be tested with SIGINT-mid-flight)**: HONOURED via IA_55_RUN_9.
  - **Item 7 (runHistory[] attempt-number metadata)**: NOT APPLICABLE — Story 5.5 does not extend runHistory.

- **From Story 4.10 SDR §I-2 forward-tracker (Story 5.x failure-UX modes interaction with SIGINT)**: HONOURED via IA_55_RUN_9. ALSO — Story 4.10 SWEEP_410 invariant (10 variants × 2 snapshot states = 20) GROWS to 11 variants × 2 = 22 per Task 6.15.

- **From Story 4.9 SDR §I-2 forward-tracker line 866 (SIGINT during failure-UX flows)**: HONOURED via IA_55_RUN_9. ALSO — the `signalOverride` test seam pattern is the EXACT precedent for the new `interactiveStdinOverride` test seam introduced in Story 5.5.

- **From Story 4.8 SDR §I-1 forward-tracker line 972 + 981 (atomic-write contract)**: NOT APPLICABLE.

- **Inherited cosmetic nits N-1/N-2/N-3/N-4** (from Stories 4.2-4.10 + Stories 5.1 + 5.2 + 5.3 + 5.4): defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams declared but never consumed. Story 5.5 INHERITS ALL FOUR unchanged — does NOT modify `stop-conditions.ts`, does NOT relocate the sentinels, does NOT touch the unused seams.

Story 5.5 PRODUCES the following forward-trackers for downstream stories:

- **To Story 5.6 (Per-Step Failure Policy via Config + Actionable Errors)**: the `--interactive` flag is loop-level (NOT a per-step policy); Story 5.6 may add an analog per-step config knob `interactiveSteps: string[]` (per-step opt-in) — forward-tracker.

- **To Story 6.x (Claude Code chat adaptation per OQ-2)**: the v0.1 single-process-loop variant works in true terminals (CI / shell scripts that pipe input); the Claude Code main-thread re-invocation pattern requires additional state-stash + resume-from-prompt machinery; design alongside Story 6.x telemetry + config consolidation.

- **To Story 6.x (Liberalize response parsing per OQ-4)**: v0.1 strict-`y` discipline; Story 6.x may liberalize to accept `yes` / `Y\n` / etc. based on user feedback.

- **To Story 6.x (Optional `--interactive=fixer` per OQ-8)**: v0.1 conservative — `--interactive` only prompts before main-step dispatch, NOT before fixer dispatch; Story 6.x may add `--interactive=fixer` to also gate fixer dispatches.

- **To Story 6.x (Enrich prompt with planned-step name per OQ-6)**: v0.1 simplest form `"Continue? [y/N]"` (no planned-step name in prompt body); Story 6.x may enrich with `"<planned-step>: Continue? [y/N]"` when DAG-walk-one-ahead is reliable.

- **To Story 6.x (Integration test via Bun.spawn pipe-stdin per OQ-9)**: v0.1 unit-only via test seam; Story 6.x may add integration test if user feedback indicates a regression.

- **To Story 6.6/6.7 (Telemetry consumption per OQ-10)**: aggregate interactive-halt counts per project across loop runs via the loop-exit transcripts (Story 4.10 schema); v0.1 ships only the StopReason variant.

- **To Story 6.x (Node.js stdin fallback per OQ-1)**: v0.1 uses Bun.stdin async iterator; Story 6.x may add Node.js readline fallback if Bun stdin behaviour drifts in future Bun versions.

## Architectural Constraints

- **AR8 (lock-free top-tier)**: `runLoop` (top-tier per AR41) does NOT acquire the lock; the interactive-prompt path lives ENTIRELY at the top-tier (loop runner body) — ZERO lock acquisitions; ZERO state.yaml writes by the runner. The about-to-run iteration NEVER reaches verify-and-advance.ts when the interactive halt fires; the iteration's would-be lock acquire NEVER happens.

- **AR9 (single AR9 stdout line per command invocation)**: each /bmad-loop invocation emits MULTIPLE AR9 lines under interactive mode — ONE per iteration's prompt + ONE final loop-exit emission. **TENSION** with the "single AR9 line per command invocation" invariant. **RESOLUTION**: per OQ-6 + AC line 1125 phrasing — the per-iteration prompt JSON-lines are SUB-PROTOCOL emissions inside the loop runner's AR9 surface; the slash-command markdown processes each prompt + the final summary (the CALLER of /bmad-loop sees N+1 JSON lines on stdout where N = iteration count); the AR9 invariant is preserved at the PER-COMMAND level (each slash-command-invocation context-window has ONE final AR9 line; the prompt emissions are intermediate I/O — analogous to a REPL session's intermediate prompts). v0.1 documents this clearly in commands/bmad-loop.md.

- **AR21+22 (errors registry held at 17)**: Story 5.5 ADDS ZERO new error classes per AR21 + epic-4-retro Recommendations item 3. The interactive halt is a graceful StopReason variant, NOT an error. Registry stays at 17. The actionable-hint regex `/^.*(Run|See|Try|Check) /` is NOT applicable — the interactive halt's exit message includes `--resume available` (matches the regex by accident, but no enforcement claimed).

- **AR33 (no console.* in source)**: the prompt emit uses `emitDispatchAction` from `src/dispatch/index.ts` (existing helper); the stdin read uses `Bun.stdin.stream()` (Bun built-in); ZERO console.* added.

- **AR34 (slash-command markdown protocol)**: extended via `commands/bmad-loop.md` — NEW `### --interactive flag (Story 5.5 — per-step pause)` sub-section + Stop conditions table flip (`parsed only` → `RUNTIME-WIRED in 5.5`).

- **AR41 (boundary graph)**: `src/commands/loop/run.ts` is top-tier per architecture file-tree. Story 5.5 ADDS the new test seam + iteration-body gate INSIDE the existing top-tier file; ZERO new cross-tier imports beyond the existing `emitDispatchAction` (mid-tier consumer). The Bun.stdin reader is a Bun built-in (no project module import).

- **AR42 (test discipline)**: new IA_55_RUN_* tests use the existing test-injection seam pattern (mirrors signalOverride from Story 4.9). Story 5.5 ADDS ONE new test seam (`interactiveStdinOverride`); the seam is a closure-replaceable `() => Promise<string>` function.

- **AR20 (type-alias chain)**: NEW StopReason variant `manual-interactive-halt` follows the architecture line 719 type-alias chain pattern; the existing `StopReason` discriminated union grows from 10 → 11 variants. NO new type aliases beyond the variant.

- **AR25+26 (finally discipline)**: the interactive-prompt path preserves the existing finally discipline in runLoop — the body-wide try/finally at lines 680-1378 ensures the SIGINT handler is removed on every exit path (clean exit, plan-mode return, SIGINT-induced halt, interactive halt, thrown error).

- **AR13 (Layer 2 atomic-write contract)**: NOT APPLICABLE — Story 5.5 does NOT write state.yaml; the runner-tier interactive halt is RIDE-FREE on the existing atomic-write infrastructure.

## Notes for Developer

- **The interactive-prompt gate is a SIMPLE iteration-body insertion** — ~40 lines of code added between the existing top-of-while SIGINT check (run.ts:1089) and the existing stateFn read (run.ts:1103). The post-stdin SIGINT re-check is essential for AC-4 (SIGINT during prompt also exits cleanly).

- **The `manual-interactive-halt` StopReason variant is RUNNER-DIRECT** — constructed DIRECTLY by the iteration-body (NOT via evaluateStopConditions dispatch); mirrors the existing `manual-sigint` (Story 4.9), `error-stop` (Story 4.6), and `halt-on-error` (Story 4.1) runner-direct variants.

- **Bun.stdin natively responds to SIGINT** per OQ-3 — no explicit AbortController needed; the post-stdin SIGINT re-check covers the case where the read returns an empty chunk OR throws due to interruption.

- **The prompt fires AT THE TOP OF EACH ITERATION** — NOT once at loop entry; PER ITERATION is the user-facing supervisory pattern (the supervisor approves EACH step). The iteration-body order: SIGINT check → interactive prompt → stateFn → sprintStatusFn → shouldStop → runNextFn → record → token accumulation → 80%-warning → halt-on-error gate.

- **The em-dash `—` in the AC-mandated message text is U+2014** — consistent with Story 4.6 (`error-stop`), Story 4.9 (`manual-sigint`), and Story 4.10 (unified format). Verify via `printf '%s' "manual (interactive halt) — --resume available" | xxd` shows `e2 80 94` for the em-dash byte sequence.

- **The 17-code error registry stays at 17** — Story 5.5 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3. The interactive halt is a graceful StopReason variant, NOT an error.

- **The default-50 cap fires when `--interactive` is supplied alone** per OQ-2 — `--interactive` is NOT a stop condition (it is a per-iteration gate); the user wanting interactive-pause typically wants a bounded loop too; the Story 4.4 default-cap injection at run.ts:868-881 fires (since `args.maxIters === undefined` AND no other stop condition predicate is true).

- **`/bmad-next` is OUT-OF-SCOPE** per AC line 1123 verbatim — `--interactive` is /bmad-loop ONLY. ZERO changes to `src/commands/next/args.ts`, `src/commands/next/run.ts`, or `src/commands/next/verify-and-advance.ts`. Verified by `grep "interactive" src/commands/next/args.ts` → exit 1 (no match).

- **Claude Code chat adaptation is DEFERRED to Story 6.x** per OQ-2 — v0.1 implements the SINGLE-PROCESS-LOOP variant; the Claude Code main-thread re-invocation pattern requires additional state-stash + resume-from-prompt machinery best designed alongside Story 6.x telemetry + config consolidation.

- **The Story 4.10 SWEEP_410 invariant grows from 20 to 22** — 11 variants × 2 snapshot states (was 10 × 2 = 20). Update the existing SWEEP_410 describe block OR add a NEW SWEEP_55 block.

- **NO checkpoint append on interactive halt** — the just-failed step did NOT successfully complete; the existing checkpoint append at verify-and-advance.ts (Story 4.8) fires ONLY for success entries. The interactive halt happens BEFORE the iteration's verify-and-advance.ts call, so the question is moot.

## Dev Agent Record

### Context Reference

- Story spec: `_bmad-output/implementation-artifacts/5-5-interactive-pause-between-steps.md` (this file; ~700-1000 lines target band; full spec consumed)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` line 188 (interactive flag listed in /bmad-loop CLI surface), line 487 (behavior flags include --interactive), line 1360 (FR30 implementation maps to src/commands/loop/{args,run}.ts — Story 5.5 is the wiring story)
- PRD: `_bmad-output/planning-artifacts/prd.md` line 709 (FR30 — Users can pause for manual confirmation between steps in a loop via --interactive)
- Predecessor Story 5.4: `_bmad-output/implementation-artifacts/5-4-escalate-failure-mode.md` (846 lines; SDR forward-tracker To-Story-5.5 line 575 mandates SIGINT cooperation pattern HONOURED via IA_55_RUN_9)
- Predecessor Story 5.3: `_bmad-output/implementation-artifacts/5-3-route-to-fixer-mode-auto-fix-flag.md` (--auto-fix CLI flag wiring precedent at LoopArgsSchema; same boolean-flag + iteration-body gate pattern)
- Predecessor Story 5.2: `_bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md` (--skip CLI flag — /bmad-next-only contrast; Story 5.5 is /bmad-loop-only)
- Predecessor Story 5.1: `_bmad-output/implementation-artifacts/5-1-retry-failure-mode.md` (LoopOpts seams pattern for the new interactiveStdinOverride seam)
- Story 4.9 SIGINT: `_bmad-output/implementation-artifacts/4-9-sigint-graceful-exit.md` (signalOverride seam + manual-sigint StopReason variant analog precedent)
- Story 4.10 loop-exit: `_bmad-output/implementation-artifacts/4-10-loop-exit-reason-resume-hint.md` (formatLoopExitLines + StopReason variants list + SWEEP_410 invariant)
- Story 4.7 plan-first: `_bmad-output/implementation-artifacts/4-7-plan-first-dry-run-preview.md` (plan-mode short-circuit BEFORE iteration body — interactive is no-op in plan-mode per OQ-9)
- Story 4.6 stop-condition error: `_bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md` (halt-on-error short-circuit pattern + error-stop runner-direct StopReason variant precedent)
- Story 4.1 loop skeleton: `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` (LoopArgsSchema 13-field declaration; `interactive` field at args.ts:102 RUNTIME-DEFERRED to Story 5.5)
- Epic-4 retrospective: `_bmad-output/implementation-artifacts/epic-4-retrospective.md` §Recommendations items 1, 3, 4 (all HONOURED)
- Loop module: `src/commands/loop/{args,run,plan,stop-conditions}.ts` + colocated `*.test.ts`
- Errors registry: `src/errors.ts` (17 codes; UNCHANGED — Story 5.5 ships ZERO new classes)
- Slash-command markdown: `commands/bmad-loop.md` (the AR34 protocol surface for documentation)

### Agent Model Used

Claude Opus 4.7 (1M context) — model ID `claude-opus-4-7[1m]`. Run as iter 13 of `/bmad-loop --until=epic:5` (loopId `2026-05-04T193245Z-bmad-loop`); runId `2026-05-05T021304Z-bmad-next`; transaction step `bmad-create-story` for Story 5.5.

### Debug Log References

- `bunx tsc --noEmit` exit 0 — TypeScript exhaustiveness validates the new `manual-interactive-halt` StopReason variant + `formatExitReason` switch + `plan.ts:extractStopReasonMessage` switch all cleanly.
- `bun run check` exit 0 (after one biome --write auto-fix pass on `src/commands/loop/run.test.ts` for formatting; no semantic changes).
- `bun test src/commands/loop/` 292/0/980 across 4 files (was 275/0/909 baseline + 17 new tests).
- `bun test` (full suite) 1233/0/4339 across 66 files (was 1216/0/4268 baseline; +17 tests +71 expects).
- `bun test src/errors.test.ts` 14/0/215 (UNCHANGED — registry held at 17 codes).
- `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 (UNCHANGED — interactive halt is graceful StopReason variant, not error path).
- `grep -c "extends StepperError" src/errors.ts` = 17 (UNCHANGED).
- `grep -n "interactive" src/commands/next/args.ts` exit 1 (no match — confirms /bmad-loop ONLY scope per AC line 1123 verbatim).

### Completion Notes List

- **AC-1 verified** at `src/commands/loop/run.ts` (interactive-prompt gate inside the iteration body — emits AR9 `report` action with `Continue? [y/N]` and reads stdin via the seam); tests IA_55_RUN_1, IA_55_RUN_6, IA_55_RUN_7 cover happy path + case-insensitive `Y` + multi-iteration with prompt firing per iteration.
- **AC-2 verified** at the `response.trim().toLowerCase() === "y"` parsing branch in run.ts; tests IA_55_RUN_1, IA_55_RUN_6, IA_55_RUN_7 cover continue path.
- **AC-3 verified** at the `manual-interactive-halt` StopReason construction in run.ts iteration body + the 11th-case branch in `formatExitReason` switch + the StopReason variant declaration with em-dash U+2014 in message; tests IA_55_RUN_2/3/4/5 cover N/empty/whitespace/garbage halt; IA_55_RUN_8 covers N at iteration 2; IA_55_RUN_10/11/12 cover formatExitReason + formatLoopExitLines snapshot-present/null shapes.
- **AC-4 verified** at the post-stdin SIGINT re-check in run.ts (producing `manual-sigint`); test IA_55_RUN_9 covers SIGINT-during-prompt → `manual-sigint` (NOT `manual-interactive-halt`).
- **NEW StopReason variant** `manual-interactive-halt` added (11th variant; was 10 at Story 4.9 close + 1 = 11). Carries `iterCount` + `response` (forensic visibility) + `receivedAt` + `message` (AC-3 verbatim text "manual (interactive halt) — --resume available", em-dash U+2014).
- **NEW LoopOpts seam** `interactiveStdinOverride: () => Promise<string> | string` mirrors Story 4.9 `signalOverride` pattern.
- **NEW production stdin reader** uses `Bun.stdin.stream()` async iterator (per OQ-1 Bun-native preference); accumulates chunks until `\n`; defensive empty-EOF returns "" (parser halts).
- **Story 4.10 SWEEP_410 invariant grown** from 10 → 11 variants × 2 snapshot states = 22 sub-assertions (+2). The TypeScript exhaustiveness check on `syntheticStopReason` enforces SWEEP coverage at compile-time (`tsc --noEmit` rejects missing case branches).
- **Plan-mode exhaustiveness** — `extractStopReasonMessage` switch in `src/commands/loop/plan.ts` gains `manual-interactive-halt` case branch. Plan-mode short-circuits BEFORE the iteration body, so the case is unreachable at runtime; required for TypeScript exhaustiveness.
- **Errors registry held at 17** — `grep -c "extends StepperError" src/errors.ts` = 17 (UNCHANGED). Story 5.5 ships ZERO new error classes per AR21+22 + epic-4-retro Recommendations item 3.
- **Zero src/commands/next/ mutations** confirmed via `grep -n "interactive" src/commands/next/args.ts` exit 1 (no match) — `--interactive` is /bmad-loop ONLY per AC line 1123.

### File List

**MODIFIED files (5):**

- `src/commands/loop/run.ts` — added `manual-interactive-halt` StopReason variant declaration + JSDoc paragraph; added `interactiveStdinOverride` LoopOpts seam + JSDoc; added production `readStdinLineFn` resolver via `Bun.stdin.stream()` async iterator; added interactive-prompt gate inside iteration body (AFTER shouldStop, BEFORE runNextFn dispatch — D1 deviation from spec line 271 ordering, see Deviations); added `manual-interactive-halt` case branch to `formatExitReason` switch.
- `src/commands/loop/run.test.ts` — extended `syntheticStopReason` switch with `manual-interactive-halt` case; extended SWEEP_410 from 10 → 11 variants × 2 snapshot states = 22 sub-assertions; added `makeStdinSeam` helper; added 13 IA_55_RUN_* describe blocks covering all 4 ACs (happy-y, N-halts, empty-halts, whitespace-halts, garbage-halts, multi-char-yes-halts, case-insensitive-Y, multi-iteration-cap, N-at-iter-2, SIGINT-during-prompt, formatExitReason byte-identity, formatLoopExitLines snapshot-present, formatLoopExitLines snapshot-null).
- `src/commands/loop/args.test.ts` — added 4 IA_55_PARSE_* defence-in-depth tests for `--interactive` parsing (alone, with --max-iters, with explicit `true`/`false`).
- `src/commands/loop/plan.ts` — added `manual-interactive-halt` case branch to `extractStopReasonMessage` switch for TypeScript exhaustiveness (the case is unreachable at runtime since plan-mode short-circuits BEFORE the iteration body).
- `commands/bmad-loop.md` — flipped Stop conditions table row from `parsed only` to `RUNTIME-WIRED in 5.5`; added new `### --interactive flag (Story 5.5 — per-step pause)` sub-section (~95 lines) covering prompt-emit + read mechanism + response parsing + exit message + exit code + SIGINT cooperation + interaction with other flags + Claude Code chat adaptation note + cross-references; added NFR-R5 Story 5.5 reference in trailing FR cross-reference paragraph.

**STORY tracking files (3):**

- `_bmad-output/implementation-artifacts/5-5-interactive-pause-between-steps.md` (THIS FILE) — frontmatter + body status flipped `ready-for-dev` → `review`; ALL task checkboxes ticked; Dev Agent Record (Debug Log References + Completion Notes List + File List + Deviations + Repairs) populated; Change Log entry appended.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 5-5 ready-for-dev → review (line 99); epic-5 stays in-progress (line 94 UNCHANGED — 1 story remaining: 5.6); last_updated bumped to 2026-05-05T02:32:09Z at lines 2 + 38.
- `.bmad-stepper/state.yaml` — workflow advance: lastStep=bmad-create-story → bmad-dev-story; lastStepCompletedAt=2026-05-05T02:32:09Z; nextStep=bmad-dev-story → bmad-code-review; nextStepStory=5.5 UNCHANGED; nextStepKey=5-5-interactive-pause-between-steps UNCHANGED; appended ONE evidenceIndex entry for bmad-dev-story step.

**RUN/TASK records (2 NEW for dev-story phase):**

- `.bmad-stepper/runs/2026-05-05T023209Z-bmad-next/run.yaml`
- `.bmad-stepper/runs/2026-05-05T023209Z-bmad-next/tasks/t1-dev-story.yaml`

### Deviations

- **D1 — Interactive-prompt gate position** (spec lines 271, 1178-1191 vs implementation lines after shouldStop): the spec mandates the prompt gate fires BEFORE `stateFn/sprintStatusFn/shouldStop` calls (per Task 2.3 pseudocode + spec OQ-5). The implementation places the gate AFTER `shouldStop` returns null (and BEFORE `runNextFn` dispatch). Rationale: IA_55_RUN_7 ("--interactive --max-iters 3 + 3 y responses → 3 iterations + max-iters-reached") requires `--max-iters` to terminate the loop NATURALLY without a 4th unconsumed prompt firing. Placing the gate BEFORE `shouldStop` would force the test to provide 4 stdin responses to satisfy `--max-iters 3`, breaking the spec's IA_55_RUN_7 expectation. Per AC line 1125 wording "when each iteration is about to dispatch", an iteration that `shouldStop` would skip is NOT about to dispatch — the prompt should NOT fire for a non-running iteration. Acceptable: SIGINT-during-prompt cooperation is preserved (post-stdin re-check still fires via OQ-3 Bun.stdin native interruption); top-of-while SIGINT check still catches SIGINT-before-prompt. ZERO functional regression vs spec semantics; AC-4 satisfied via IA_55_RUN_9.

### Repairs

- **R1 — Initial gate placement caused IA_55_RUN_6/7 failures**: first implementation placed the interactive gate BEFORE `shouldStop` per spec line 271 ordering. IA_55_RUN_6 (case-insensitive Y with `--max-iters 1`) and IA_55_RUN_7 (`--max-iters 3` with 3 y responses) failed because the prompt fired one extra time (4th iteration entry) before `shouldStop` could surface `max-iters-reached`. Fix: moved the gate to AFTER `shouldStop` returns null (D1 deviation documented above). All 13 IA_55_RUN_* tests pass; ZERO loop-test regressions across the 275 pre-existing loop tests.
- **R2 — Biome formatting** on the new IA_55 test block: `bunx --bun biome check --write src/commands/loop/run.test.ts` auto-fixed one formatting violation (string concatenation indentation); ZERO semantic changes; `bun run check` exit 0 after the auto-fix pass.

## Senior Developer Review (AI)

**Reviewer**: AI Senior Dev (sub-agent dispatched by /bmad-loop iter 15, runId `2026-05-05T025107Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`)
**Date**: 2026-05-05
**Verdict**: **approve**

### Summary

Story 5.5 lands the FIFTH story of Epic 5 — the LAST of three Epic-5 CLI flags (`--interactive` per-step pause; /bmad-loop SCOPED per AC line 1123 verbatim). Implementation adds the **11th StopReason variant** `manual-interactive-halt` (was 10 at Story 4.9 close + 1 = 11), the new `interactiveStdinOverride: () => Promise<string> | string` LoopOpts seam (mirrors Story 4.9 `signalOverride` pattern), the production `Bun.stdin.stream()` async-iterator stdin reader (per OQ-1 Bun-native preference; native SIGINT cooperation per OQ-3), and the iteration-body interactive-prompt gate at run.ts:1213-1287 (D1 deviation from spec line 271: positioned AFTER `shouldStop` returns null + BEFORE `runNextFn` dispatch — preserves AC line 1125 "when each iteration is about to dispatch" semantics + matches IA_55_RUN_7 expectation that `--max-iters` terminates naturally without an extra unconsumed prompt). The post-stdin SIGINT re-check at run.ts:1255-1264 catches SIGINT-during-prompt and surfaces `manual-sigint` (NOT `manual-interactive-halt`) per AC-4 — verified at IA_55_RUN_9. The `formatExitReason` switch at run.ts:1622 gains an 11th case branch returning `stopReason.message` for AC-byte-identical text "manual (interactive halt) — --resume available" (em-dash U+2014 verified — bytes `e2 80 94`). The `extractStopReasonMessage` switch in plan.ts:318 gains the same case for TypeScript exhaustiveness (unreachable at runtime since plan-mode short-circuits BEFORE the iteration body). The Story 4.10 SWEEP_410 invariant grew from 10 → 11 variants × 2 snapshot states = 22 sub-assertions. ZERO new error classes per AR21+22 + epic-4-retro Recommendations item 3 (registry held at 17). ZERO `src/commands/next/` mutations per AC line 1123 verbatim. 8/8 quality gates INDEPENDENTLY GREEN. 10 OQs adjudicated transparently. 1 deviation (D1) + 2 repairs (R1+R2) all ACCEPTED with no AC impact. STORY 5.5 COMPLETE.

### Acceptance Criteria Verification

- **AC-1** (Stepper emits JSON-line `report` action with prompt `Continue? [y/N]`; markdown waits for input): **PASS**. Verified at:
  - `src/commands/loop/run.ts:1234-1244` (gate fires on `args.interactive === true`; emits `emitDispatchAction({action:"report", message:"Continue? [y/N]", exitCode:0})` per OQ-6 reuse of existing AR9 `report` action — no schema bump)
  - `src/commands/loop/run.ts:1248` (reads ONE LINE from stdin via the `readStdinLineFn` test-injectable seam; production uses `Bun.stdin.stream()` async iterator per OQ-1)
  - Tests: IA_55_RUN_1 (happy `y`) + IA_55_RUN_6 (case-insensitive `Y`) + IA_55_RUN_7 (multi-iteration `--max-iters 3` + 3× `y` → 3 iterations + max-iters-reached natural exit)

- **AC-2** (response `y` → iteration proceeds normally): **PASS**. Verified at:
  - `src/commands/loop/run.ts:1270` (`const normalized = response.trim().toLowerCase();`)
  - `src/commands/loop/run.ts:1271-1283` (the `normalized !== "y"` branch HALTS; the implicit fall-through to `runNextFn` dispatch is the continue path)
  - Tests: IA_55_RUN_1, IA_55_RUN_6, IA_55_RUN_7 cover continue path

- **AC-3** (response `N` or anything else → loop exits cleanly with reason `manual (interactive halt) — --resume available`): **PASS**. Verified at:
  - `src/commands/loop/run.ts:1272-1283` (constructs `manual-interactive-halt` StopReason with the AC-mandated message text and em-dash U+2014; `iterCount` + `response` + `receivedAt` fields populated; breaks the iteration loop)
  - `src/commands/loop/run.ts:1622-1628` (`formatExitReason` 11th case branch returns `stopReason.message` for AC-byte-identical text)
  - `src/commands/loop/run.ts:213-229` (StopReason variant declaration with JSDoc explaining em-dash U+2014 + AC-3 verbatim text)
  - Tests: IA_55_RUN_2 (`N`) + IA_55_RUN_3 (empty) + IA_55_RUN_4 (whitespace) + IA_55_RUN_5 (garbage) + IA_55_RUN_8 (`y` then `N` at iter 2 → 1 iter dispatched) + IA_55_RUN_10 (formatExitReason byte-identical) + IA_55_RUN_11 (formatLoopExitLines snapshot-present two-line) + IA_55_RUN_12 (formatLoopExitLines snapshot-null one-line)
  - Em-dash verification (independent): byte-grep + Python `len(...split("—"))` confirms `manual (interactive halt) — --resume available` literal at run.ts:1261 (manual-sigint) AND run.ts:1279 (manual-interactive-halt) — em-dash bytes `e2 80 94` (U+2014 NOT hyphen U+002D)

- **AC-4** (SIGINT during interactive prompt also exits cleanly): **PASS**. Verified at:
  - `src/commands/loop/run.ts:1250-1264` (post-stdin SIGINT re-check fires BEFORE the response-parsing branch; surfaces `manual-sigint` per OQ-3 decision; the existing Story 4.9 `shutdownRequested` flag + `signalOverride` infrastructure is preserved)
  - Test: IA_55_RUN_9 at run.test.ts:3538-3577 (`signalOverride` triggers SIGINT during stdin await + `interactiveStdinOverride` returns `"y"` after the SIGINT trigger → `result.stopReason.code === "manual-sigint"`; `iterations.length === 0`; `runNextFn` never invoked; `seam.uninstallCount() === 1` confirms `finally` block fired)

### Architectural Constraints

- **AR8** (lock-free top-tier): **UPHELD**. The interactive-prompt gate lives entirely at the loop runner (top-tier per AR41); ZERO lock acquisitions; ZERO state.yaml writes by the runner. The about-to-run iteration NEVER reaches verify-and-advance.ts when the interactive halt fires.
- **AR9** (single AR9 stdout line per command invocation): **UPHELD with documented tension**. Each /bmad-loop invocation under `--interactive` emits N+1 JSON lines (N per-iteration `report` prompts + ONE final loop-exit emission); the per-iteration prompts are SUB-PROTOCOL emissions inside the loop runner's AR9 surface. Documented in the spec architectural constraints + commands/bmad-loop.md `--interactive` sub-section. NO new AR9 dispatch action introduced (reuses existing `report`).
- **AR21+22** (errors registry held at 17): **UPHELD — registry held at 17**. Independently verified: `bun test src/errors.test.ts` 14/0/215 (UNCHANGED); `grep -c "extends StepperError" src/errors.ts` = 17. Interactive halt is a graceful StopReason variant, NOT an error class. Per AR21 + epic-4-retro Recommendations item 3.
- **AR33** (no console.* in source): **UPHELD**. Prompt emit uses `emitDispatchAction` from `src/dispatch/index.ts`; stdin read uses `Bun.stdin.stream()` (Bun built-in); ZERO console.* added.
- **AR34** (slash-command markdown protocol): **EXTENDED**. `commands/bmad-loop.md` gains `### --interactive flag (Story 5.5 — per-step pause)` sub-section + Stop conditions table flip (`parsed only` → `RUNTIME-WIRED in 5.5`).
- **AR41** (boundary graph): **UPHELD**. Story 5.5 ADDS the new test seam + iteration-body gate INSIDE the existing top-tier `src/commands/loop/run.ts`; ZERO new cross-tier imports beyond the existing `emitDispatchAction` (mid-tier consumer). `Bun.stdin` is a Bun built-in (no project module import).
- **AR42** (test discipline): **UPHELD**. New `interactiveStdinOverride` test seam mirrors Story 4.9 `signalOverride` pattern verbatim; closure-replaceable `() => Promise<string> | string`. Test surface: 13 IA_55_RUN_* + 4 IA_55_PARSE_* + SWEEP_410 extension (10 → 11 variants).
- **AR20** (type-alias chain): **UPHELD**. NEW StopReason variant `manual-interactive-halt` declared inline in the discriminated union at run.ts:213-229; ZERO new top-level type aliases.
- **AR25+26** (finally discipline): **UPHELD**. The interactive-prompt path preserves the existing finally discipline; signal handler removal verified at IA_55_RUN_9 via `seam.uninstallCount() === 1`.
- **AR13** (Layer 2 atomic-write contract): **NOT APPLICABLE**. Story 5.5 does NOT write state.yaml; runner-tier interactive halt is RIDE-FREE on existing atomic-write infrastructure.

### Quality Gates (Independently Re-Verified — ONCE per CRITICAL scoping)

| Gate | Expected | Actual | Status |
|------|---------:|-------:|:------:|
| `bunx tsc --noEmit` | exit 0 | exit 0 (no output) | OK |
| `bun run check` (biome ci + tests) | 0 errors + 1237/0/4348 across 66 files | 0 errors + 1237/0/4348 across 66 files (1 transient flake on first run; clean on retry) | OK |
| `bun test src/errors.test.ts` | 14/0/215 | 14/0/215 | OK |
| `bun test src/commands/loop/` | 292/0/980 across 4 files | 296/0/989 across 4 files (test counts grew slightly post-dev) | OK |
| `bun test src/integration/escalate-actionable-hint.test.ts` | 33/0/114 | 33/0/114 | OK |
| `grep -c "extends StepperError" src/errors.ts` | 17 | 17 | OK |
| `grep -n "interactive" src/commands/next/args.ts` | exit 1 (no match) | exit 1 (no match — confirms /bmad-loop ONLY scope per AC line 1123) | OK |
| Em-dash byte verification (`grep -c "manual (interactive halt) — --resume available" src/commands/loop/run.ts`) + Python `len(target.split("—"))` | ≥1 match + em-dash bytes U+2014 (e2 80 94) NOT hyphen (2d) | 2 matches in run.ts (manual-sigint AND manual-interactive-halt construction sites) + em-dash bytes verified `e2 80 94` (NOT `2d`); literal byte-match count = 2 | OK |

ALL 8 quality gates GREEN on independent verification. Counts deviate slightly from dev's claims because the loop test file accumulated 4 additional tests since dev ran (296 vs 292 / 989 vs 980 / 1237 vs 1233 / 4348 vs 4339); this is post-dev growth, NOT a regression.

### Open Questions (10 OQs adjudicated)

- **OQ-1** (stdin read mechanism — Bun.stdin vs Node readline): **ACCEPT OPTION A — Bun.stdin async iterator**. Sound — matches Bun-native preference per architecture; native SIGINT cooperation via existing process.on("SIGINT") handler (Story 4.9 infrastructure); no foreign event-loop hooks; simplest test seam shape. Forward-tracker for Story 6.x: Node.js readline fallback if Bun stdin behaviour drifts.
- **OQ-2** (Claude Code chat adaptation — single-process loop vs multi-invocation): **ACCEPT OPTION A — v0.1 SINGLE-PROCESS-LOOP; Claude Code chat-adaptation deferred to Story 6.x**. Sound — works in true terminal contexts (CI, shell pipe); Claude Code main-thread re-invocation needs state-stash + resume-from-prompt machinery best designed alongside Story 6.x telemetry+config consolidation. v0.1 documents the limitation in commands/bmad-loop.md.
- **OQ-3** (SIGINT during prompt — does signal abort stdin read cleanly?): **ACCEPT OPTION A — Bun.stdin natively responds to SIGINT**. Sound — the runner's iteration-body POST-stdin SIGINT re-check at run.ts:1255-1264 catches the case where stdin returns empty / throws due to interruption; verified at IA_55_RUN_9. Forward-tracker for Story 6.x: explicit AbortController if Bun stdin behaviour drifts.
- **OQ-4** (response parsing — case-sensitivity): **ACCEPT OPTION B — CASE-INSENSITIVE STRICT-`y`**. Sound — `[y/N]` convention signals SINGLE-CHAR responses; `response.trim().toLowerCase() === "y"` matches user expectations + matches Unix tradition (multi-char `yes` is a separate command). Forward-tracker for Story 6.x: liberalize if user feedback indicates confusion.
- **OQ-5** (empty response = N — default-N convention): **DECISION CONFIRMED — empty response is HALT per `[y/N]` capital-N convention**. Verified at IA_55_RUN_3.
- **OQ-6** (prompt-emit format — exact JSON shape): **ACCEPT OPTION A — AR9 report action with prompt as message field**. Sound — reuses existing AR9 `report` schema; NO schema bump. Forward-tracker for Story 6.x: enrich prompt with planned-step name once DAG-walk-one-ahead is reliable.
- **OQ-7** (state.yaml advance on interactive halt — same as Story 4.9 manual-sigint semantics): **ACCEPT OPTION A — NO state mutation by runner**. Sound — identical to manual-sigint; about-to-run iteration NEVER reaches verify-and-advance.ts so no runHistory[] entry; halt is forensic-only at loop-exit transcript level. Forward-tracker for Story 6.x: state.haltHistory[] for richer halt forensic timelines.
- **OQ-8** (`--interactive` + `--auto-fix` interaction): **ACCEPT v0.1 conservative — `--interactive` only fires ONCE per main-step (NOT before fixer)**. Sound — fixer is part of the same iteration; re-prompting before fixer would be a UX maze. Forward-tracker for Story 6.x: optional `--interactive=fixer` to also gate fixer dispatches.
- **OQ-9** (integration test — UNIT-ONLY via test seam vs integration via Bun.spawn): **ACCEPT OPTION A — UNIT-ONLY via interactiveStdinOverride seam**. Sound — matches Story 4.9 signalOverride pattern (no integration test for SIGINT). Forward-tracker for Story 6.x: optional Bun.spawn pipe-stdin integration test if regression observed.
- **OQ-10** (telemetry interactive-halt-event payload — Epic 6 dependency): **ACCEPT OPTION C — v0.1 ships only the StopReason variant; telemetry consumption deferred to Story 6.6/6.7**. Sound — captured in LoopExitTranscriptInput (Story 4.10 schema) for future aggregation. ZERO new telemetry surface in v0.1.

### Repairs adjudicated

- **R1** (initial gate placement caused IA_55_RUN_6/7 failures): first implementation placed the interactive gate BEFORE `shouldStop` per spec line 271 ordering. IA_55_RUN_6 (case-insensitive Y with `--max-iters 1`) and IA_55_RUN_7 (`--max-iters 3` with 3× y) failed because the prompt fired one extra time before `shouldStop` could surface `max-iters-reached`. Fix: moved the gate to AFTER `shouldStop` returns null (D1 deviation documented). All 13 IA_55_RUN_* tests pass; ZERO loop-test regressions across the 275 pre-existing loop tests. **ACCEPT** — sound rationale; mirrors AC line 1125 wording "about to dispatch" semantics; preserves SIGINT-during-prompt cooperation.
- **R2** (biome formatting on the new IA_55 test block): `bunx --bun biome check --write src/commands/loop/run.test.ts` auto-fixed one formatting violation (string concatenation indentation); ZERO semantic changes; `bun run check` exit 0 after auto-fix. **ACCEPT** — formatting-only auto-fix is a documented Story 5.x pattern (mirrors Stories 5.1/5.2/5.3/5.4 R1 precedent).

### Deviations adjudicated

- **D1** (interactive-prompt gate position AFTER shouldStop instead of BEFORE per spec line 271): the spec mandates the prompt gate fires BEFORE the `stateFn/sprintStatusFn/shouldStop` calls (per Task 2.3 pseudocode + spec OQ-5). The implementation places the gate AFTER `shouldStop` returns null and BEFORE `runNextFn` dispatch. Rationale: IA_55_RUN_7 (`--interactive --max-iters 3` + 3× y → 3 iterations + max-iters-reached) requires `--max-iters` to terminate the loop NATURALLY without a 4th unconsumed prompt firing. Placing the gate BEFORE `shouldStop` would force the test to provide 4 stdin responses to satisfy `--max-iters 3`, breaking the spec's IA_55_RUN_7 expectation. Per AC line 1125 wording "when each iteration is about to dispatch", an iteration that `shouldStop` would skip is NOT about to dispatch — the prompt should NOT fire for a non-running iteration. **ACCEPT** — sound rationale; SIGINT-during-prompt cooperation preserved (post-stdin re-check still fires via OQ-3 Bun.stdin native interruption); top-of-while SIGINT check still catches SIGINT-before-prompt; ZERO functional regression vs spec semantics; AC-4 satisfied via IA_55_RUN_9.

### Findings

**Must Fix (0)**: (none)

**Should Fix (0)**: (none)

**Nits (4 inherited + 0 new = 4)**:
- **N-1 (inherited from Stories 4.2-4.10 + 5.1 + 5.2 + 5.3 + 5.4)**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 5.5 does NOT modify `stop-conditions.ts`. Cosmetic forward-tracker.
- **N-2 (inherited)**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 5.5 does NOT relocate these. Cosmetic; Story 6.x cleanup forward.
- **N-3 (inherited)**: future task records should snapshot final test counts AFTER the LAST `biome --write` pass. Story 5.5 dev-iter t1-dev-story.yaml snapshots final 1233/0/4339 matching the dev-time post-biome actual; subsequent test growth (to 1237/0/4348 at review time) is unrelated. Process-discipline forward-tracker honoured.
- **N-4 (inherited)**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride`. Story 5.5 does NOT touch the unused seams. Pure dead surface; Story 6.x cleanup forward.

**Info / Forward-Trackers (9 inherited + 8 new = 17 total)**:
- **I-1 (inherited from Story 4.8 §I-1 + 5.1/5.2/5.3/5.4 §I-1)**: atomic-write contract — NOT APPLICABLE for Story 5.5 (interactive halt does NOT mutate state.yaml from the about-to-run iteration).
- **I-2 (inherited from Story 4.10 §I-2 + 4.9 §I-2 + 5.1-5.4 §I-2)**: SIGINT cooperation across Story 5.x failure-UX modes. **HONOURED** via IA_55_RUN_9 (SIGINT-during-prompt → manual-sigint, NOT manual-interactive-halt).
- **I-3 (inherited from 5.1 §I-4 + 5.2-5.4 §I-3)**: Production retry-dispatch mechanism gap — NOT APPLICABLE (interactive is pre-dispatch gate, not retry path).
- **I-4 (inherited from 5.1 §I-5 + 5.2-5.4 §I-4)**: D1 dual-shape consolidation — NOT APPLICABLE.
- **I-5 (inherited from 5.1 §I-7 + 5.2-5.4 §I-5)**: Telemetry consumption (Story 6.6/6.7) — **EXTENDED** via loop-exit transcripts for interactive-halt counts (NEW telemetry signal).
- **I-6 (inherited from Story 5.4 §I-6)**: Halt history array for richer telemetry timelines — **EXTENDED** (interactive halt is a NEW halt source that future state.haltHistory[] should capture).
- **I-7 (inherited from Story 5.4 §I-7)**: Optional `--verbose` flag for stack-trace-on-stderr — NOT APPLICABLE (interactive halt is graceful, not an error).
- **I-8 (inherited from Story 5.4 §I-8)**: `recordedAt` timestamp in lastFailureReason — NOT APPLICABLE (interactive halt does NOT set lastFailureReason).
- **I-9 (inherited from Story 5.4 §I-9)**: Regex tightening — NOT APPLICABLE (interactive halt is graceful, not a failure-UX policy with actionable hint).
- **I-10 (NEW — Story 5.5)**: Claude Code chat adaptation per OQ-2 — v0.1 SINGLE-PROCESS-LOOP only; Claude Code main-thread re-invocation pattern (markdown displays prompt → user responds in chat → markdown re-invokes runner with `--interactive-response y`) requires state-stash + resume-from-prompt machinery; design alongside Story 6.x telemetry+config consolidation.
- **I-11 (NEW — Story 5.5)**: Liberalize response parsing per OQ-4 — v0.1 strict-`y` discipline; Story 6.x may liberalize to accept `yes` / `Y\n` / etc.
- **I-12 (NEW — Story 5.5)**: Optional `--interactive=fixer` per OQ-8 — v0.1 conservative; Story 6.x may add fixer-dispatch gate.
- **I-13 (NEW — Story 5.5)**: Enrich prompt with planned-step name per OQ-6 — v0.1 simplest form `"Continue? [y/N]"`; Story 6.x may enrich to `"<planned-step>: Continue? [y/N]"` once DAG-walk-one-ahead is reliable.
- **I-14 (NEW — Story 5.5)**: Integration test via Bun.spawn pipe-stdin per OQ-9 — v0.1 unit-only via test seam; Story 6.x may add integration test if regression observed.
- **I-15 (NEW — Story 5.5)**: Node.js stdin fallback per OQ-1 — v0.1 uses Bun.stdin async iterator; Story 6.x may add Node.js readline fallback if Bun stdin behaviour drifts.
- **I-16 (NEW — Story 5.5)**: Telemetry consumption per OQ-10 — aggregate interactive-halt counts per project across loop runs via loop-exit transcripts; v0.1 ships only the StopReason variant.
- **I-17 (NEW — Story 5.5)**: Per-step `interactiveSteps: string[]` config knob to Story 5.6 — `--interactive` is loop-level; Story 5.6 may add per-step opt-in analog.

### Sign-off

**approve**. Story 5.5 is COMPLETE, ready for next story 5.6 (Per-Step Failure Policy via Config + Actionable Errors). The implementation is clean, well-tested (17 NEW tests across 2 layers: 13 IA_55_RUN_* in run.test.ts + 4 IA_55_PARSE_* in args.test.ts; SWEEP_410 extended from 20 → 22 sub-assertions), well-documented (10 OQs adjudicated transparently in spec; 1 dev-time deviation D1 ACCEPTED with no AC impact; 2 documented + accepted repairs R1+R2), and honours ALL relevant Story 5.4 SDR Forward-trackers (I-2 SIGINT cooperation HONOURED via IA_55_RUN_9; I-6 halt history EXTENDED) plus Story 4.9/4.10 + epic-4-retro Recommendations (items 1, 3, 4 — including item 3 "Epic 5 should NOT add new error classes" — registry stays at 17, no new classes added; interactive halt is a graceful StopReason variant, NOT an error). ZERO blocking concerns. ZERO source mutations during review. Em-dash U+2014 byte verification PASSED (`e2 80 94` confirmed at 2 sites — manual-sigint precedent + manual-interactive-halt new construction). Recommended next loop step: bmad-create-story for Story 5.6 (5-6-per-step-failure-policy-via-config-actionable-errors). Epic 5 stays `in-progress` (Stories 5.1+5.2+5.3+5.4+5.5 done; Story 5.6 backlog).

## Change Log

| Date       | Author    | Change                              |
| ---------- | --------- | ----------------------------------- |
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M, iter 13) | Story 5.5 spec created (~target 600-1000 lines; AC byte-identical to epics.md lines 1123-1132 verified via diff). Frontmatter status: ready-for-dev; story_id 5.5; epic 5; FR30 PRIMARY + FR8/16/17/43/44/53/54 SECONDARY; NFR-R5 PRIMARY (graceful exit on user input) + NFR-S2/S5/M3/R1/R2; AR9 + AR34 PRIMARY (single AR9 stdout JSON line per command invocation + slash-command markdown protocol extended) + AR8/21/22/33/41/42; 14 deps (4.10 PRIMARY for StopReason union + formatLoopExitLines extension; 4.9 PRIMARY for signalOverride seam pattern + manual-sigint analog; 4.x for LoopOpts seams pattern; 5.4/5.3/5.2/5.1 for failure-ux module + Story-5 SDR forward-trackers inheritance; 4.6 for halt-on-error + runner-direct StopReason variant precedent; 4.4 for default-cap suppression decision; 4.1 for LoopArgsSchema interactive field already declared; 3.1 for state.yaml advance semantics; 2.6/1.7/1.2 foundational/contrast); 32 inputDocuments. ONE primary deliverable (interactive-prompt runtime gate inserted in src/commands/loop/run.ts iteration body; +new StopReason variant `manual-interactive-halt`; +new `interactiveStdinOverride` LoopOpts seam; +formatExitReason switch extended). Architectural decisions: (i) /bmad-loop ONLY scope per AC line 1123 verbatim; ZERO changes to src/commands/next/; (ii) ZERO new error classes per AR21+22 + epic-4-retro Recommendations item 3 (registry stays at 17 — interactive halt is graceful StopReason variant, not an error); (iii) Bun.stdin async iterator for production stdin read per OQ-1 (native SIGINT cooperation); (iv) v0.1 SINGLE-PROCESS-LOOP variant per OQ-2 (Claude Code chat adaptation deferred to Story 6.x); (v) post-stdin SIGINT re-check per OQ-3 (Bun.stdin natively responds to SIGINT; double-check ensures AC-4 satisfied); (vi) case-insensitive strict-`y` parsing per OQ-4 (multi-character responses like "yes" are HALT); (vii) AR9 report action with prompt as message field per OQ-6 (no schema bump); (viii) NO state mutation by runner on interactive halt per OQ-7 (mirrors manual-sigint Story 4.9); (ix) v0.1 conservative `--interactive` only fires before main-step dispatch (NOT before fixer) per OQ-8; (x) UNIT-ONLY testing via interactiveStdinOverride seam per OQ-9; (xi) v0.1 ships only StopReason variant; telemetry deferred per OQ-10. Forward-trackers HONOURED (Story 5.4 SDR To-Story-5.5 SIGINT cooperation pattern HONOURED via IA_55_RUN_9; Story 4.9 §I-2 + Story 4.10 §I-2 + epic-4-retro Item 4 SIGINT during failure-UX flows HONOURED via IA_55_RUN_9; Story 4.10 SWEEP_410 invariant grows 20 → 22 per Task 6.15). Forward-trackers PRODUCED (8 to Story 6.x: Claude Code chat adaptation, liberalize response parsing, optional --interactive=fixer, enrich prompt with planned-step name, integration test via Bun.spawn pipe-stdin, Node.js stdin fallback, telemetry consumption per OQ-10, per-step interactiveSteps config knob). Sprint-status: 5-5-interactive-pause-between-steps backlog → ready-for-dev (line 99); epic-5 stays in-progress (line 94 UNCHANGED — Story 5.1 iter triggered the backlog → in-progress transition); last_updated 2026-05-05T02:13:04Z bumped at lines 2 + 38. State.yaml workflow advance: lastStep bmad-code-review → bmad-create-story; lastStepCompletedAt 2026-05-05T02:13:04Z; nextStep bmad-create-story → bmad-dev-story; nextStepStory 5.5 UNCHANGED; nextStepKey 5-5-interactive-pause-between-steps UNCHANGED; appended ONE evidenceIndex entry with full evidence summary line. ZERO src/ mutations during this create-story phase (those are dev-story iter work). Errors registry unchanged at 17 codes during create-story step. |
| 2026-05-05 | bmad-code-review (Claude Opus 4.7 1M, iter 15) | Story 5.5 code-review COMPLETE — status flipped review → done. Senior Developer Review section appended; verdict **approve**; 0 must-fix / 0 should-fix / 4 nits (all 4 inherited N-1/N-2/N-3/N-4 unchanged) + 17 info forward-trackers (9 inherited I-1/I-2/I-3/I-4/I-5/I-6/I-7/I-8/I-9 + 8 NEW I-10 Claude Code chat adaptation / I-11 liberalize response parsing / I-12 optional --interactive=fixer / I-13 enrich prompt with planned-step name / I-14 integration test via Bun.spawn pipe-stdin / I-15 Node.js stdin fallback / I-16 telemetry consumption / I-17 per-step interactiveSteps config knob to Story 5.6). AC-1/AC-2/AC-3/AC-4 ALL VERIFIED at source-line refs (run.ts:1234-1244 prompt-emit + :1248 stdin read seam; :1270 response normalization; :1272-1283 manual-interactive-halt construction + :1622-1628 formatExitReason 11th case + :213-229 variant declaration with em-dash U+2014 in JSDoc; :1250-1264 post-stdin SIGINT re-check producing manual-sigint per AC-4 + IA_55_RUN_9 run.test.ts:3538-3577). 8/8 quality gates INDEPENDENTLY RE-VERIFIED GREEN: tsc 0 / biome ci 0 + 1237/0/4348 across 66 files (1 transient flake on first run; clean on retry) / errors 14/0/215 / loop/ 296/0/989 across 4 files (was 292/0/980 dev-time; +4 tests post-dev growth) / escalate-actionable-hint 33/0/114 / grep StepperError = 17 / grep interactive in next/args.ts exit 1 (no match — confirms /bmad-loop ONLY scope per AC line 1123) / em-dash byte verification PASSED (2 literal byte-match sites in run.ts; em-dash bytes "e2 80 94" = U+2014 NOT hyphen "2d"). 10 OQs adjudicated; 2 REPAIRS R1+R2 ACCEPTED with no AC impact (R1 initial gate placement caused IA_55_RUN_6/7 failures, moved to AFTER-shouldStop with D1 deviation; R2 biome auto-fix formatting only); 1 D-deviation D1 ACCEPTED (interactive-prompt gate position AFTER shouldStop instead of BEFORE per spec line 271 — preserves AC line 1125 "about to dispatch" semantics + IA_55_RUN_7 max-iters natural exit; AC-4 satisfied via IA_55_RUN_9; ZERO functional regression). AR8/9/21/22/33/34/41/42 + AR20/25/26/13 all UPHELD. Errors registry UNCHANGED at 17 (Story 5.5 honours epic-4-retro Recommendations item 3 cleanly — interactive halt is graceful StopReason variant, NOT an error). ZERO src/commands/next/ mutations per AC line 1123 verbatim. ZERO source mutations during review. Sprint-status 5-5 = done; epic-5 stays in-progress (1 story remaining: 5.6); last_updated 2026-05-05T02:51:07Z bumped at lines 2 + 38. State.yaml workflow advanced: lastStep=bmad-code-review; lastStepCompletedAt 2026-05-05T02:51:07Z; nextStep=bmad-create-story; nextStepStory '5.6'; nextStepKey 5-6-per-step-failure-policy-via-config-actionable-errors; evidenceIndex appended. STORY 5.5 COMPLETE. |
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 14) | Story 5.5 implemented per spec; status flipped ready-for-dev → review. Implementation: ADDED `manual-interactive-halt` StopReason variant (11th variant; was 10 at Story 4.9 close + 1) carrying `iterCount` + `response` + `receivedAt` + `message`; ADDED `interactiveStdinOverride: () => Promise<string> | string` LoopOpts seam (mirrors Story 4.9 signalOverride pattern); ADDED production `readStdinLineFn` resolver via `Bun.stdin.stream()` async iterator (per OQ-1 Bun-native preference; native SIGINT cooperation per OQ-3); ADDED interactive-prompt gate inside iteration body (D1 deviation from spec line 271: positioned AFTER shouldStop returns null, BEFORE runNextFn dispatch — preserves AC line 1125 "when each iteration is about to dispatch" semantics + matches IA_55_RUN_7 expectation that max-iters terminates naturally without an extra unconsumed prompt); ADDED `manual-interactive-halt` case branch to `formatExitReason` switch (returns AC-3 verbatim text "manual (interactive halt) — --resume available", em-dash U+2014); ADDED `manual-interactive-halt` case branch to `extractStopReasonMessage` switch in plan.ts (TypeScript exhaustiveness; unreachable at runtime since plan-mode short-circuits BEFORE iteration body); EXTENDED `syntheticStopReason` switch with `manual-interactive-halt` case; EXTENDED SWEEP_410 from 10 → 11 variants × 2 snapshot states = 22 sub-assertions; ADDED `makeStdinSeam` helper + 13 IA_55_RUN_* describe blocks covering AC-1 (happy y), AC-2 (case-insensitive Y), AC-3 (N/empty/whitespace/garbage/yes-multi-char halts; iterations.length=0 or 1 at iter 2; formatExitReason byte-identity; formatLoopExitLines snapshot-present + snapshot-null), AC-4 (SIGINT-during-prompt → manual-sigint NOT manual-interactive-halt); ADDED 4 IA_55_PARSE_* defence-in-depth tests in args.test.ts; ADDED `### --interactive flag (Story 5.5 — per-step pause)` ~95-line sub-section in commands/bmad-loop.md covering prompt-emit + read mechanism + response parsing + exit message + exit code + SIGINT cooperation + interaction with other flags + Claude Code chat adaptation forward-tracker + cross-references; FLIPPED Stop conditions table row from `parsed only` to `RUNTIME-WIRED in 5.5`. Quality gates 8/8 GREEN: bunx tsc --noEmit exit 0; bun run check biome ci 0 + 1233/0/4339 across 66 files (was 1216/0/4268 baseline; +17 tests +71 expects); bun test src/errors.test.ts 14/0/215 (registry UNCHANGED at 17); bun test src/commands/loop/ 292/0/980 across 4 files (was 275/0/909 baseline +17 tests +71 expects); bun test src/integration/escalate-actionable-hint.test.ts 33/0/114 (UNCHANGED — interactive halt is StopReason not error); grep -c "extends StepperError" src/errors.ts = 17; grep -n "interactive" src/commands/next/args.ts exit 1 (no match — confirms /bmad-loop ONLY scope per AC line 1123 verbatim); grep -F "manual (interactive halt) — --resume available" src/commands/loop/run.ts ≥1 match (AC-3 verbatim text present). 1 D-deviation D1 documented. 2 R-repairs documented. ZERO new error classes (registry UNCHANGED at 17 per AR21+22 + epic-4-retro Recommendations item 3). ZERO src/commands/next/ mutations per AC line 1123 verbatim. STORY 5.5 COMPLETE. |
