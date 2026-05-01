# bmad-step-runner smoke fixture

Manual / dev-iteration scaffolding for the Layer-3 sub-agent definition at
`agents/bmad-step-runner.md` (Story 2.3).

This fixture is **NOT** an automated CI gate. Layer 3 sub-agents require a
live Claude `Task` invocation, which `bun test` cannot provide. The canonical
end-to-end smoke for the agent ships in Story 2.8 (the `/bmad-next` happy
path). This fixture exists so a developer can manually verify the agent
definition produces an artifact at the declared output path before Story 2.8
lands.

## Files

- `dispatch-spec.json` — minimal valid `DispatchSpecV1` (matches the schema in
  `src/schemas/dispatch-spec.ts`). Targets a fake `runId` of `test-run`.
- `inputs/topic.md` — single-line topic input file referenced by
  `taskSpec.context[0].path`.
- `README.md` — these instructions.

## Manual smoke procedure

1. Copy the fixture into a tmpdir so the agent's writes do not pollute the
   repo:

   ```bash
   tmpdir=$(mktemp -d -t bmad-step-runner-smoke-XXXX)
   mkdir -p "$tmpdir/staging/test-run/inputs" "$tmpdir/staging/test-run/outputs"
   cp tests/fixtures/bmad-step-runner/dispatch-spec.json "$tmpdir/staging/test-run/dispatch-spec.json"
   cp tests/fixtures/bmad-step-runner/inputs/topic.md "$tmpdir/staging/test-run/inputs/topic.md"
   cd "$tmpdir"
   ```

2. Open a fresh Claude Code session at the tmpdir with the bmad-stepper
   plugin loaded. Confirm the agent is discoverable:

   ```
   /agents
   ```

   Look for `bmad-step-runner` in the list with the description
   `execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json`.

3. Invoke the agent against the fixture:

   ```
   Task(agent="bmad-step-runner", prompt="staging/test-run/dispatch-spec.json")
   ```

4. Verify the agent produced the artifact:

   ```bash
   ls -la staging/test-run/outputs/research.md
   head -10 staging/test-run/outputs/research.md
   ```

   Pass criteria:
   - The file `staging/test-run/outputs/research.md` exists.
   - The file has YAML frontmatter with `title:` matching the topic from
     `inputs/topic.md`.
   - The file body contains at least one paragraph of research content.
   - The agent emitted exactly one terminal summary line of the form
     `wrote staging/test-run/outputs/research.md (N bytes)`.

5. Confirm boundary discipline:
   - No file outside `staging/test-run/` was created or modified.
   - The agent did NOT invoke `Task` itself.
   - The agent did NOT call `bun run`.
   - The agent did NOT ask the user a question.

## Schema validation (optional)

To confirm the fixture remains valid as the schema evolves:

```bash
bun -e "import('./src/schemas/dispatch-spec.ts').then(({ DispatchSpecV1Schema }) => DispatchSpecV1Schema.parse(JSON.parse(require('node:fs').readFileSync('tests/fixtures/bmad-step-runner/dispatch-spec.json', 'utf8'))))"
```

The command should exit 0 with no output (Zod parse succeeded). If the
schema bumps in a future story, update the fixture to match.
