# Worked Example 3: Overnight Bounded Loop

**Scenario:** You want to run the rest of the current epic overnight. You want a plan-first preview before committing. You want a token budget so the loop stops gracefully if it runs long. You want a checkpoint after every implementation step.

**Command:**

```text
/bmad-loop --until-epic-end --plan-first --token-budget 200k --checkpoint-each implementation
```

**Expected output (stderr; plan-first preview phase):**

```text
Plan-first preview for /bmad-loop --until-epic-end:
  Epic 4 / Story 4.1: code-review (next)
  Epic 4 / Story 4.2: dev-story → code-review
  Epic 4 / Story 4.3: dev-story → code-review
  ... [10 steps total; estimated 65k tokens / 25 minutes]
Stop conditions: --until-epic-end (epic-4-end); --token-budget (200000 tokens); --max-iters (50, default cap).
Continue? (y/n): y

[...10 dispatches roll over the next 25 minutes; per-step checkpoints written to state.yaml.checkpoints[]; transcript streams to _bmad-output/.stepper/runs/...]

Loop exited: epic-end (epic 4 complete).
Snapshot: <branch>:<sha>. Resume: /bmad-next --resume.
```

**Narrative:** `/bmad-loop` is the bounded autonomous-execution surface. The `--plan-first` flag prints the planned dispatches WITHOUT executing them; the user reviews and confirms. The `--token-budget` flag halts the loop when 200k tokens are consumed (with an 80% warning latch — see Story 4.5 design). The `--checkpoint-each implementation` flag writes a snapshot to `state.yaml.checkpoints[]` after every step of type `implementation` (FIFO eviction at 50 entries).

The loop exits cleanly with a two-line message (per FR26): the exit reason + the resume hint. SIGINT during the loop triggers a graceful exit within 30 seconds (NFR-R5).

The eight stop conditions are documented in `skills/bmad-loop/SKILL.md`: `--until-epic-end`, `--until-story-end`, `--until=<step>`, `--until=epic:<n>`, `--token-budget`, `--max-iters` (default 50), `--time-budget`, and SIGINT.

**Why this matters:** Bounded autonomy with the safety net intact (NFR-R1 zero data loss; NFR-R5 graceful SIGINT; FR22 per-step-type checkpoint) is the core differentiation from unbounded ralph-style PRD-to-code loops. The author's nightly loop on `makistack` is the canonical use case.

**Related:** [`halt-recovery.md`](halt-recovery.md), [`skip-on-failure.md`](skip-on-failure.md).
