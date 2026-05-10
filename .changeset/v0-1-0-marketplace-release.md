---
"bmad-stepper": minor
---

Initial public release: v0.1.0 marketplace listing at `tgorka/bmad-stepper`.

Two slash commands ship: `/bmad-next` (zero-config single-step advance with full flag inventory per FR1-FR15 + FR27-FR32 + FR41-FR42 + FR50-FR54) and `/bmad-loop` (bounded loop with eight stop conditions, four failure-UX modes, SIGINT graceful exit per FR19-FR30).

State machine with atomic state on disk, file lock with PID heartbeat, branch+sha snapshot, schema-versioned + Zod-migrated; recovery from any halt via `--resume`. Sub-agent dispatch contract with verifier-before-promote gate. Failure-UX modes (retry/skip/route-to-fixer/escalate); per-step policy via `bmad-stepper.config.yaml`. Configuration surface, telemetry (opt-in), auto-archival, doctor diagnostic, upgrade flow.

BMAD Compatibility — v6.5.x: tested against the latest stable BMAD release at v0.1.0 release time.
