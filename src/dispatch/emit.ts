/**
 * src/dispatch/emit.ts — emitDispatchAction() JSON-line stdout writer
 * (AC-5; FR54; AR9; AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports:
 *   - foundational: `../io/log.ts` (json() — the canonical stdout writer
 *     per Story 1.3 + architecture line 862),
 *     `../schemas/dispatch-protocol.ts` (DispatchActionV1Schema +
 *     DispatchActionV1 — defence-in-depth Zod parse before stdout write).
 *
 * Per FR54 + architecture line 862:
 *   - `info()` / `warn()` / `error()` route to stderr (line-delimited human-readable).
 *   - `json()` routes to stdout (line-delimited JSON; reserved for AR9
 *     dispatch-action + Story 1.3 `--export-state`).
 *
 * This is the SECOND stdout writer in the project (the FIRST was Story
 * 1.3's `--export-state` JSON path). Together they reserve stdout for two
 * clean channels: (a) the AR9 dispatch-action protocol (Story 2.2),
 * (b) the `--export-state` JSON (Story 1.3). All other diagnostics MUST
 * route to stderr — verified by integration tests in Story 2.4.
 *
 * Architecture references:
 *   - §line 862 (no console.log; src/io/log.ts discipline).
 *   - §line 1460 (AR9 stdout JSON-line emit).
 *   - §line 1660 (AR9 protocol concretization — exit-code constraints).
 *   - prd.md FR54 line 745 (stdout/stderr discipline).
 */

import { json } from "../io/log.ts";
import {
  type DispatchActionV1,
  DispatchActionV1Schema,
} from "../schemas/dispatch-protocol.ts";

/**
 * Writes one AR9-compliant JSON line to stdout. Validates the action
 * against the discriminated-union schema first; on validation failure
 * the underlying `ZodError` propagates to the caller (caller bug — should
 * NEVER happen at runtime).
 *
 * The validated literal is then handed to `json()` from `src/io/log.ts`,
 * which writes a line-delimited JSON record to stdout (and only to stdout —
 * FR54 invariant).
 *
 * Sync semantics mirror `json()` itself (Story 1.3 — `process.stdout.write`).
 *
 * v0.2.1 — the schema gained an `invoke-skill` variant alongside the
 * three v0.1 variants (`dispatch`, `report`, `halt`). This function
 * accepts the whole discriminated union, so no new helper is needed:
 * callers construct the appropriate literal and pass it through. The
 * schema's `.parse()` enforces the per-variant shape (e.g.,
 * `invoke-skill` requires `skillName: string`).
 */
export function emitDispatchAction(action: DispatchActionV1): void {
  const validated = DispatchActionV1Schema.parse(action);
  json(validated);
}
