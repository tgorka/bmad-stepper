# Quick-Start Walkthrough Fixture

NFR-M4 timed walkthrough — confirms the [README Quick Start](../../README.md#quick-start) takes a fresh user from `/plugin marketplace add` to a successful `/bmad-next --doctor` invocation in under 10 minutes on a clean machine.

## Purpose

This file is the **canonical timing harness** for **NFR-M4** ("README quick-start ≤ 10 min to first `/bmad-next`"; PRD line 803; architecture line 1423). For v0.1, it is **prose-only** — a human reviewer walks the steps with a stopwatch and records the elapsed time below. Future Epic 6 Story 6.10 (marketplace release v0.1.0) adds CI automation that walks this fixture inside a clean container.

There is no test code in v0.1. The "test" is the manual stopwatch run.

## Setup assumptions

- A clean machine: no Bun, no BMAD, no Stepper installed.
- Reasonable network throughput (BMAD install dominates the timing).
- macOS or Linux shell. (Windows reviewers should run inside WSL2 per architecture line 1419.)

## Walkthrough checklist

Tick each step as you complete it; record the elapsed-time stamp. Targets are guidelines — the PASS criterion is the **total** elapsed time.

- [ ] **Step 1 — Install Bun** (target ≤ 1 min). `curl -fsSL https://bun.sh/install | bash` or `brew install oven-sh/bun/bun`.
- [ ] **Step 2 — Verify Bun version** (target ≤ 30 sec). `bun --version` returns 1.3.x or newer (AR2 / NFR-I5).
- [ ] **Step 3 — Install BMAD** (target ≤ 2 min, network-dependent). `npx bmad-method install --tools claude-code`. Expect plugin under `~/.claude/plugins/cache/bmad-method/bmad/<v>/` (cache layout) or `~/.claude/plugins/bmad-method-<v>/` (spec layout).
- [ ] **Step 4 — Add Stepper marketplace** (target ≤ 1 min). `/plugin marketplace add Tgorka/bmad-stepper`. Anthropic CLI fetches `Tgorka/bmad-stepper` to `~/.claude/plugins/bmad-stepper/`.
- [ ] **Step 5 — Run the diagnostic** (target ≤ 10 sec). `/bmad-next --doctor` (or `/bmad-doctor`). Per architecture line 1672 this is read-only and lock-free.
- [ ] **Step 6 — Verify exit code 0** (instant). The shell-visible exit code must be `0`. Anything else is a failure — see §Failure modes below.
- [ ] **Step 7 — Verify the 5-line stderr output** (target ≤ 30 sec — eyeball check). The block must match this **byte-for-byte**:

  ```text
  BMAD detected: v<version> (compatible)
  Project: <name>
  State file: not present (fresh project)
  Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles
  Suggestion: run /bmad-next to start the analysis phase.
  ```

  `<version>`, `<name>`, `<N>`, `<M>` are runner-substituted placeholders; the surrounding prose, punctuation, and whitespace must match.
- [ ] **Step 8 — Time check** (PASS / FAIL). Total elapsed time ≤ 10 minutes ⇒ PASS. NFR-M4 satisfied.

## Failure modes

The three most likely failure paths and the expected exit code:

1. **BMAD not installed.** Step 5 fails with exit `3` and the stderr line `Run npx bmad-method install --tools claude-code first.` Diagnosis: you skipped Step 3.
2. **Stepper marketplace install fails.** Step 4 fails with an Anthropic CLI surface error (network, auth, unknown repo). This is **not** a Stepper exit code — it surfaces inside Claude Code itself. Re-check the repo slug `Tgorka/bmad-stepper` and your network.
3. **5-line output mismatch.** Step 7 fails. Source-of-truth is `src/commands/doctor/checks.ts` (Story 1.12) — `checkBmadInstalled` (line 1), `checkProjectName` (line 2), `checkStateFile` (line 3), `checkStepRegistry` (line 4), and `runDoctor`'s static suggestion (line 5). File an issue if the runner output drifts from this fixture.

## Reporting template

Fill in after each walkthrough; attach to the Epic 1 retrospective.

```text
Reviewer:        ___________________________
Date (UTC):      ___________________________
Machine / OS:    ___________________________
Bun version:     ___________________________
BMAD version:    ___________________________
Total elapsed:   ___ min ___ sec
Result:          [ ] PASS    [ ] FAIL
Deviation notes: ___________________________
                 ___________________________
```
