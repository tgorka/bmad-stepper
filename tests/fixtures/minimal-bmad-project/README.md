# tests/fixtures/minimal-bmad-project/

Minimal BMAD project layout used by `src/smoke/next.test.ts` (Story 2.8 —
canonical end-to-end smoke for `/bmad-next` happy path) and
`src/integration/no-write-outside-scope.test.ts` (NFR-S2 enforcement smoke).

The fixture supplies ONLY the `_bmad/` subtree (project config + `bmm` stanza
per Story 1.9 detector convention). Everything under `_bmad-output/` is
created by the smoke test itself in a tmpdir copy of this fixture (per AR35
tmpdir-per-test discipline).

Per epic Story 2.8 AC line 711: "fresh `_bmad/`, no `state.yaml`, an empty
`_bmad-output/`".

The smoke test:
  1. Copies `_bmad/` to `<tmp>/_bmad/`.
  2. Creates an empty `<tmp>/_bmad-output/` directory.
  3. Seeds a minimal `state.yaml` at `<tmp>/_bmad-output/.stepper/state.yaml`
     (dev-002 deviation: the runner's `loadStateUnlocked` requires state to
     exist; "no state.yaml" in the AC is honored as "no pre-baked state in
     the fixture itself").
  4. Invokes `bun run src/commands/next/run.ts -- --step bmad-brainstorming`
     against the tmpdir.
  5. Mocks the Task tool by writing the expected artifact to
     `<tmp>/_bmad-output/.stepper/staging/<runId>/outputs/<step>.md`.
  6. Invokes `bun run src/commands/next/verify-and-advance.ts -- --run-id
     <id> --tokens-in 100 --tokens-out 50`.
  7. Asserts state advance + canonical promotion + transcript existence
     + no out-of-scope writes.

The fixture is **READ-ONLY** at runtime — the smoke test copies `_bmad/`
into a tmpdir before running anything. The fixture should NEVER be mutated
by tests; if a test needs to seed additional content, it does so in the
tmpdir copy.
