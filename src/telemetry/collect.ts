/**
 * src/telemetry/collect.ts — opt-in telemetry JSONL writer
 * (Story 6.6 — FR39, FR40, FR45; NFR-S3, NFR-R1, NFR-R6, NFR-M3,
 * NFR-S1; AR8, AR9, AR17, AR21, AR22, AR27, AR33, AR41, AR42).
 *
 * **MID-TIER MODULE per AR41** (architecture line 1283 — `src/telemetry/`
 * sits alongside `migrations/`, `state/`, `transcript/`, `upgrade/`).
 * Allowed imports = foundational only:
 *   - `../schemas/telemetry.ts` (Zod schema source-of-truth, Story 1.5).
 *   - `../io/paths.ts` (`assertWithinScope` AR42 + NFR-S2 boundary).
 *   - `node:fs/promises` + `node:path` (standard library).
 * Zero higher-tier or top-tier imports.
 *
 * **Closed-set field whitelist (AR17 + NFR-S3 anti-PII)**: every record is
 * passed through `TelemetryRecordV1Schema.parse(...)` defence-in-depth
 * BEFORE serialization. The schema is `.strict()` (Story 1.5 baseline at
 * `src/schemas/telemetry.ts:37`); extra fields throw a Zod `unrecognized
 * keys` error. AC-2 mechanism — CI tests verify rejection of synthetic
 * excess fields (TLM_66_COLLECT_REJECT_EXTRA_*).
 *
 * **JSONL append-mode (per OQ-2)**: records are appended to
 * `<telemetryRoot>/<YYYY-MM>.jsonl` via `fs.appendFile` (one JSON object
 * per line, terminated with `\n`). NOT atomicWrite (tmp+rename) — JSONL
 * is append-only; the atomicWrite pattern is for read-modify-write of
 * single-document files. Per-record atomicity follows from POSIX
 * `O_APPEND` semantics (writes < PIPE_BUF size are atomic; a
 * TelemetryRecord JSON line is well under 1 KB).
 *
 * **Public surface**:
 *   - `writeTelemetryRecord(record, opts?)` — async writer.
 *   - `WriteTelemetryOptions` — `{ telemetryRoot? }` test seam.
 *   - `WriteTelemetryResult` — `{ filePath }` (returned for caller introspection).
 *   - `DEFAULT_TELEMETRY_ROOT` — production default
 *     `_bmad-output/.stepper/telemetry/` (matches `src/config/defaults.ts:48`).
 *
 * Architecture cross-references:
 *   - architecture.md §line 549 (telemetry opt-in default off).
 *   - architecture.md §line 1283 (AR41 mid-tier placement).
 *   - architecture.md §line 1664 (telemetry "no PII" closed-set whitelist).
 *   - prd.md FR39, FR40, FR45 (telemetry functional requirements).
 *   - prd.md NFR-S3 (telemetry no PII), NFR-R6 (defence-in-depth Zod parse).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { assertWithinScope } from "../io/paths.ts";
import {
  type TelemetryRecord,
  TelemetryRecordV1Schema,
} from "../schemas/telemetry.ts";

/**
 * Default telemetry directory root. Matches `src/config/defaults.ts:48`
 * (the `paths.telemetry` default `_bmad-output/.stepper/telemetry/`).
 */
export const DEFAULT_TELEMETRY_ROOT = "_bmad-output/.stepper/telemetry/";

/**
 * Test seam options for `writeTelemetryRecord`. Production callers omit
 * this; the writer falls back to `DEFAULT_TELEMETRY_ROOT`. Tests pass a
 * tmpdir-isolated root via `mkdtemp(...)` per AR35.
 */
export interface WriteTelemetryOptions {
  /**
   * Story 6.6 — test seam: when supplied, overrides the telemetry
   * directory root. Production callers omit; the writer falls back to
   * `DEFAULT_TELEMETRY_ROOT` (`_bmad-output/.stepper/telemetry/`).
   */
  readonly telemetryRoot?: string;
}

/**
 * Result returned by `writeTelemetryRecord`. The `filePath` is the
 * absolute or project-relative path that was appended to (depending on
 * the supplied `telemetryRoot`).
 */
export interface WriteTelemetryResult {
  readonly filePath: string;
}

/**
 * Write a single TelemetryRecord to the monthly JSONL file.
 *
 * **Step 1 (AC-2 PRIMARY mechanism)** — `TelemetryRecordV1Schema.parse(record)`
 * defence-in-depth. The schema is `.strict()` (Story 1.5); extra fields
 * throw a Zod error with the unrecognized-key path. Caller (verify-and-
 * advance) wraps in try/catch + log.warn per OQ-8 best-effort discipline.
 *
 * **Step 2** — derive `YYYY-MM` from `record.ts` (e.g.,
 * `"2026-05-05T12:34:56Z"` → `"2026-05"`). The slice is timezone-naive
 * because `new Date().toISOString()` always returns UTC `Z`-suffix
 * (Forward-tracker I-48 — UTC discipline).
 *
 * **Step 3** — compute target file path: `<telemetryRoot>/<YYYY-MM>.jsonl`.
 * Pass through `assertWithinScope(...)` per AR42 + NFR-S2 (the default
 * telemetryRoot IS within `_bmad-output/.stepper/`).
 *
 * **Step 4** — `mkdir -p` parent directory (idempotent; the recursive
 * flag swallows EEXIST per Node fs/promises contract).
 *
 * **Step 5** — append `JSON.stringify(parsed) + "\n"` via `fs.appendFile`.
 * Per OQ-2, NOT atomicWrite (JSONL is append-only).
 *
 * AC mapping:
 *   - AC-1: this writer produces the JSONL line at the canonical path.
 *   - AC-2: Zod parse-on-write rejects extra fields (defence-in-depth).
 *   - AC-3: NOT enforced here — the caller (verify-and-advance) gates on
 *     `opts?.config?.telemetry?.enabled === true`. When disabled, this
 *     function is NEVER invoked → no file system writes.
 *
 * @param record - TelemetryRecord conforming to TelemetryRecordV1Schema.
 *                 Extra fields throw at parse time (AC-2 mechanism).
 * @param opts - Optional test seam (telemetryRoot override).
 * @returns WriteTelemetryResult with the appended file path.
 * @throws Zod ZodError when `record` has unrecognized keys or fails
 *         schema validation; bare Error when `record.ts` is not a
 *         well-formed ISO-8601 prefix; ScopeViolationError when the
 *         telemetryRoot resolves outside `_bmad-output/**` or
 *         `os.tmpdir()/**` (AR42 + NFR-S2).
 */
export async function writeTelemetryRecord(
  record: TelemetryRecord,
  opts?: WriteTelemetryOptions,
): Promise<WriteTelemetryResult> {
  // Step 1: defence-in-depth Zod parse (AC-2 mechanism — extra fields throw).
  const parsed = TelemetryRecordV1Schema.parse(record);

  // Step 2: derive YYYY-MM from ts (e.g., "2026-05-05T12:34:56Z" → "2026-05").
  const yearMonth = parsed.ts.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error(
      `telemetry: ts must be ISO-8601 starting with YYYY-MM-DD (got ${parsed.ts.slice(0, 10)})`,
    );
  }

  // Step 3: compute target file path within scope.
  const root = opts?.telemetryRoot ?? DEFAULT_TELEMETRY_ROOT;
  const filePath = path.join(root, `${yearMonth}.jsonl`);
  assertWithinScope(filePath);

  // Step 4: ensure parent dir exists (idempotent).
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Step 5: append JSON line + newline (JSONL standard).
  const line = `${JSON.stringify(parsed)}\n`;
  await fs.appendFile(filePath, line, "utf8");

  return { filePath };
}
