---
name: bmad-doctor
description: 'Run the Stepper diagnostic suite (BMAD detection, state, DAG validity). Invoke when user types /bmad-doctor (no flags in v0.2). Thin alias for /bmad-next --doctor.'
---

# /bmad-doctor

Thin alias for `/bmad-next --doctor`. Delegates to the same Layer 2
runner (`src/commands/doctor/run.ts`).

Per architecture line 1678, this command is functionally equivalent to
`/bmad-next --doctor` — both invoke `bun run <plugin-root>/src/commands/doctor/run.ts`.
Preserved as a single-token slash command for muscle memory.

Capture the flag string the user typed after `/bmad-doctor` (verbatim;
empty in v0.2). Run:

```bash
bun run src/commands/doctor/run.ts -- <captured-flags>
```

The script writes 5 diagnostic lines to stderr and exits with:

- 0 — all checks passed
- 1 — corrupt state.yaml (run /bmad-next --recompute-state)
- 2 — argument parse error
- 3 — BMAD missing or incompatible (run npx bmad-method install --tools claude-code, or /plugin install bmad@bmad-method)

## Tool restrictions

- **Bash** is restricted to `bun run <plugin-root>/...` invocations only.
  The skill MUST NOT invoke shell scripts, system binaries (`curl`,
  `git`, `npm`, `node`, `python`, etc.), or any non-Bun executable.

These prompt-layer guardrails replace the v0.1 `allowedTools`
frontmatter declaration (slash-command era). The architectural
enforcement at Layer 2 (`src/verifiers/scope.ts:assertWithinScope`)
remains unchanged.
