/**
 * src/state/save.ts — Canonical entry point for writing `state.yaml`
 * (FR5, AR11, AR12, AR41, AR42, NFR-S5, architecture §D10).
 *
 * Mid-tier module per AR41. First source-side consumer of:
 *   - `atomicWrite(...)` from `../io/atomic-write.ts` (Story 1.3).
 *   - `Bun.YAML.stringify(...)` for canonical YAML emission.
 *   - First source-side writer to `_bmad-output/.stepper/state.yaml`.
 *
 * Public API:
 *   - `saveState(state, lockHandle, opts?)` — atomic write under caller-held lock.
 *   - `SaveStateOptions`                    — test-only-but-exported escape.
 *
 * Algorithm (per architecture §D10 + NFR-S5):
 *   1. Validate the proposed state via `StateLatestSchema.parse(state)`.
 *      Defence-in-depth pre-write check — bytes do NOT hit disk if the
 *      shape is invalid (NFR-S5).
 *   2. Trust the caller's `LockHandle`. The function does NOT validate
 *      the handle is live — that responsibility lives with the caller's
 *      `try/finally` discipline (read-modify-write pattern per AR12).
 *   3. Serialise to YAML via `Bun.YAML.stringify(state, null, 2)` — Bun
 *      ships symmetric YAML emission. The `2` indent argument forces
 *      block-style output (multi-line, human-readable) rather than the
 *      default flow-style (single-line `{a: 1, b: 2}`). Key order =
 *      declaration order; no anchors.
 *   4. Ensure the parent directory exists via `fs.mkdir({ recursive: true })`
 *      (lazy creation on a fresh project — `_bmad-output/.stepper/` does not
 *      exist before the first save).
 *   5. Atomic write via `atomicWrite(path, yamlText)` — performs
 *      `assertWithinScope` (AR42) → `.bak` rotation → tmp+rename.
 *
 * Error semantics (AR33):
 *   - `CorruptStateError` — Zod validation failure on the input shape.
 *   - `ScopeViolationError` — propagated from `assertWithinScope` (out-of-
 *     scope `statePath`); production never sees this since `STATE_PATH`
 *     is hard-coded inside the allowed roots.
 *   - Any other filesystem error propagates to the caller verbatim.
 *
 * The `lockHandle` parameter is required (TypeScript signature) — the API
 * surface enforces NFR-S5 architecturally; lock-free writes against
 * `saveState` are uncompilable. The handle is currently unused at runtime
 * (the caller's `try/finally` owns the lifecycle); a future story (Story
 * 6.x) may add a `lockHandle.isLive()` runtime check.
 *
 * No `console.*` calls anywhere — errors are thrown.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CorruptStateError } from "../errors.ts";
import { atomicWrite } from "../io/atomic-write.ts";
import type { LockHandle } from "../lock/lock.ts";
import { type State, StateLatestSchema } from "../schemas/state.ts";
import { STATE_PATH } from "./paths.ts";

export interface SaveStateOptions {
  /** Override the canonical state.yaml path. Defaults to `STATE_PATH`. */
  readonly statePath?: string;
}

/**
 * Atomically writes a validated `State` to `state.yaml`. The caller MUST
 * hold the project lock (passes `LockHandle` from `acquire(...)`) — the API
 * surface enforces NFR-S5 architecturally.
 *
 * @throws {CorruptStateError}  if `StateLatestSchema.parse(state)` rejects.
 * @throws {ScopeViolationError} if the `statePath` resolves outside the
 *   allowed write roots (production never triggers this; tests do).
 */
export async function saveState(
  state: State,
  // The handle is part of the API contract (NFR-S5 enforcement) but is
  // currently unused at runtime — the caller's try/finally owns the
  // lifecycle. Underscore-prefix is the conventional "intentionally
  // unused" marker; Biome's `noUnusedVariables` accepts the underscore.
  _lockHandle: LockHandle,
  opts?: SaveStateOptions,
): Promise<void> {
  let validated: State;
  try {
    validated = StateLatestSchema.parse(state);
  } catch (err) {
    throw new CorruptStateError(
      "saveState: pre-write Zod validation failed",
      err instanceof Error ? err.message : String(err),
    );
  }

  const yamlText = Bun.YAML.stringify(validated, null, 2);
  const targetPath = opts?.statePath ?? STATE_PATH;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await atomicWrite(targetPath, yamlText);
}
