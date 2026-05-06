/**
 * src/telemetry/aggregate.ts — Telemetry JSONL aggregator
 * (Story 6.7 — FR45, FR39, FR40; NFR-P6, NFR-S3, NFR-R1, NFR-S1, NFR-S2,
 * NFR-M3; AR41, AR42, AR21, AR33, AR8, AR9, AR17, AR27, AR35).
 *
 * **MID-TIER MODULE per AR41** (architecture line 1283 — `src/telemetry/`
 * sits alongside `migrations/`, `state/`, `transcript/`, `upgrade/`).
 * Allowed imports = foundational only:
 *   - `../schemas/telemetry.ts` (Zod schema source-of-truth, Story 1.5).
 *   - `../io/paths.ts` (`assertWithinScope` AR42 + NFR-S2 boundary).
 *   - `../io/log.ts` (single-line `warn` audit per AR21).
 *   - `node:fs/promises` + `node:path` (standard library).
 *   - sibling `./collect.ts` for `DEFAULT_TELEMETRY_ROOT` constant reuse.
 * Zero higher-tier or top-tier imports.
 *
 * **Closed-set field whitelist (AR17 + NFR-S3 anti-PII)**: every JSONL
 * line is REVALIDATED through `TelemetryRecordV1Schema.parse(...)` on
 * read — defence-in-depth mirroring the Story 6.6 write-side parse. The
 * schema is `.strict()` (Story 1.5 baseline at `src/schemas/telemetry.ts:37`);
 * extra fields are REJECTED on read and counted into `parseErrorCount`.
 * Per OQ-7, malformed lines do NOT halt the aggregator — they are SKIPPED
 * with a single-line `log.warn` audit and surfaced in the rendered Summary.
 *
 * **NFR-P6 performance contract** (architecture line 1395; AC-2 verbatim):
 * generation completes within 2 seconds for one week of run logs. The
 * implementation uses whole-file read + linear pass + Map<step, records[]>
 * grouping + mean/p95 helpers — O(n) in record count. Sizing analysis: a
 * TelemetryRecord JSON line is ~250 bytes; one week of high-velocity
 * dogfood telemetry is ~700 records × 250 bytes ≈ 175 KB; Bun's whole-file
 * read + JSON.parse + Zod parse is ~10 ms per 1000 records on commodity
 * hardware. The 2-second budget is comfortably 100x headroom.
 *
 * **AR8 lock-free top-tier preserved**: the aggregator runs OUTSIDE the
 * verify-and-advance lock — it is invoked manually via `bun run
 * aggregate-telemetry`. ZERO state.yaml mutation; ZERO interaction with
 * the dispatch/verify pipeline.
 *
 * **Public surface**:
 *   - `aggregateTelemetry(opts)` — async aggregator returning AggregateResult.
 *   - `AggregateOptions` — `{ period, telemetryRoot? }` (telemetryRoot test seam).
 *   - `AggregateResult` — typed shape with totals, perStep, verifierOutcomes,
 *     failurePatterns, parseErrorCount.
 *   - `PerStepAggregate` — per-step computation result (count, mean/p95
 *     duration, retry rate, verifier failure rate, mean tokens, errorCodeCounts).
 *
 * Architecture cross-references:
 *   - architecture.md §line 1375 (FR45 → src/telemetry/aggregate.ts).
 *   - architecture.md §line 1395 (NFR-P6 < 2 seconds enforcement).
 *   - architecture.md §line 1664 (no-PII closed-set transitive guarantee).
 *   - epics.md §Story-6.7 lines 1247-1259 (AC-1/AC-2/AC-3 verbatim).
 *
 * Forward-tracker: I-47 (errorCode aggregation) PRIMARY HONOURED + CLOSED
 * here at the failurePatterns table.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { warn } from "../io/log.ts";
import { assertWithinScope } from "../io/paths.ts";
import {
  type TelemetryRecord,
  TelemetryRecordV1Schema,
} from "../schemas/telemetry.ts";
import { DEFAULT_TELEMETRY_ROOT } from "./collect.ts";

/**
 * Test seam options for `aggregateTelemetry`. Production callers (the CLI
 * runner) supply `telemetryRoot` from `loadConfig()`'s `paths.telemetry`;
 * tests pass a tmpdir-isolated root via `mkdtemp(...)` per AR35.
 */
export interface AggregateOptions {
  /** Required period in `YYYY-MM` format. Validated against `^\d{4}-\d{2}$`. */
  readonly period: string;
  /**
   * Test seam: when supplied, overrides the telemetry directory root.
   * Production callers omit; the aggregator falls back to
   * `DEFAULT_TELEMETRY_ROOT` (`_bmad-output/.stepper/telemetry/`).
   */
  readonly telemetryRoot?: string;
}

/**
 * Per-step aggregate computation result. All fields are derived numerical
 * metrics — no source content per NFR-S3 closed-set whitelist.
 */
export interface PerStepAggregate {
  readonly count: number;
  /** Arithmetic mean of `record.durationMs`, rounded to nearest integer. */
  readonly meanDurationMs: number;
  /** 95th percentile via sorted-ascending nearest-rank. */
  readonly p95DurationMs: number;
  /** Arithmetic mean of `record.retries` (decimal). */
  readonly retryRate: number;
  /** Fraction of records where `verifierStatus === "fail"` (0..1). */
  readonly verifierFailureRate: number;
  /** Arithmetic mean of `record.tokensIn`, rounded to nearest integer. */
  readonly meanTokensIn: number;
  /** Arithmetic mean of `record.tokensOut`, rounded to nearest integer. */
  readonly meanTokensOut: number;
  /** `meanTokensIn + meanTokensOut`, rounded to nearest integer. */
  readonly meanTokensTotal: number;
  /** Per-errorCode counts (defined values only — I-47 honoured). */
  readonly errorCodeCounts: Record<string, number>;
}

/**
 * Aggregator result. Drives the rendered markdown report; all fields are
 * derived numerical metrics or schema-whitelisted enum/string surfaces.
 */
export interface AggregateResult {
  readonly period: string;
  /** Number of records that passed Zod parse. */
  readonly totalRecords: number;
  /** Number of JSONL lines that failed JSON.parse OR Zod parse (skipped). */
  readonly parseErrorCount: number;
  /** Earliest `ts` in the parsed records (lexicographic ISO-8601 sort). */
  readonly firstTs: string | undefined;
  /** Latest `ts` in the parsed records. */
  readonly lastTs: string | undefined;
  /** Number of distinct `step` values across the parsed records. */
  readonly distinctSteps: number;
  /** Per-step aggregates keyed by step name. */
  readonly perStep: Record<string, PerStepAggregate>;
  /** Verifier status counters (pass/fail/skip). */
  readonly verifierOutcomes: { pass: number; fail: number; skip: number };
  /** Global errorCode counts across all steps (union of perStep[*].errorCodeCounts). */
  readonly failurePatterns: Record<string, number>;
}

/**
 * Arithmetic mean of `numbers`. Returns 0 for an empty input (avoids
 * NaN on division-by-zero in the renderer).
 */
function mean(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  let total = 0;
  for (const n of numbers) {
    total += n;
  }
  return total / numbers.length;
}

/**
 * 95th percentile via sorted-ascending nearest-rank. Index is
 * `Math.ceil(0.95 * length) - 1`, clamped to `[0, length-1]`. Returns 0
 * for empty input. The input MUST already be sorted ascending — caller
 * responsibility (avoid re-sorting per call).
 */
function p95NearestRank(sorted: number[]): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1),
  );
  return sorted[idx] as number;
}

/**
 * Aggregates a monthly JSONL telemetry file into per-step summaries.
 *
 * **AC-1 mechanism** — reads `<telemetryRoot>/<period>.jsonl`, parses every
 * line through `TelemetryRecordV1Schema.parse(...)` defence-in-depth,
 * groups by `step`, computes per-step aggregates (count, mean/p95 duration,
 * retry rate, verifier failure rate, mean tokens, errorCodeCounts).
 *
 * **AC-2 mechanism (NFR-P6)** — whole-file read + O(n) linear pass; well
 * within the 2-second budget for one week of records (~700 records ≈ 10 ms).
 *
 * **AC-3 mechanism (NFR-S3)** — closed-set 12-field whitelist preserved
 * transitively. Records that fail Zod parse (extra fields, wrong types)
 * are SKIPPED and counted into `parseErrorCount` per OQ-7 (best-effort
 * with audit trail).
 *
 * @param opts - Required `period` (YYYY-MM) plus optional `telemetryRoot`
 *               test seam. Production callers (the CLI runner) supply
 *               `telemetryRoot` from `loadConfig()`'s `paths.telemetry`.
 * @returns AggregateResult with totals, perStep, verifierOutcomes,
 *          failurePatterns, parseErrorCount.
 * @throws Bare Error when (a) `period` does not match `^\d{4}-\d{2}$`;
 *         (b) the `<period>.jsonl` file does not exist (ENOENT — caller
 *         catches and surfaces single-line stderr + exit 1);
 *         ScopeViolationError when `telemetryRoot` resolves outside
 *         allowed write roots (AR42 + NFR-S2).
 */
export async function aggregateTelemetry(
  opts: AggregateOptions,
): Promise<AggregateResult> {
  // Step 1: validate period format.
  if (!/^\d{4}-\d{2}$/.test(opts.period)) {
    throw new Error(
      `telemetry: invalid period format ${opts.period}; expected YYYY-MM`,
    );
  }

  // Step 2: compute target file path within scope.
  const root = opts.telemetryRoot ?? DEFAULT_TELEMETRY_ROOT;
  const filePath = path.join(root, `${opts.period}.jsonl`);
  assertWithinScope(filePath);

  // Step 3: read file — ENOENT surfaces as a canonical bare Error message.
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `telemetry: no JSONL records found for period ${opts.period} at ${filePath}`,
      );
    }
    throw err;
  }

  // Step 4: parse line-by-line; SKIP malformed (per OQ-7).
  const records: TelemetryRecord[] = [];
  let parseErrorCount = 0;
  const lines = text.split("\n").filter((line) => line.length > 0);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      records.push(TelemetryRecordV1Schema.parse(obj));
    } catch (err) {
      parseErrorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      warn(`telemetry: skipping malformed JSONL line in ${filePath}: ${msg}`);
    }
  }

  // Step 5: group by step.
  const byStep = new Map<string, TelemetryRecord[]>();
  const verifierOutcomes = { pass: 0, fail: 0, skip: 0 };
  const failurePatterns: Record<string, number> = {};

  for (const rec of records) {
    let bucket = byStep.get(rec.step);
    if (!bucket) {
      bucket = [];
      byStep.set(rec.step, bucket);
    }
    bucket.push(rec);

    // verifier outcome counter (closed-set enum: pass/fail/skip).
    verifierOutcomes[rec.verifierStatus]++;

    // global failurePatterns (I-47 honoured).
    if (rec.errorCode !== undefined) {
      failurePatterns[rec.errorCode] =
        (failurePatterns[rec.errorCode] ?? 0) + 1;
    }
  }

  // Step 6: per-step aggregates.
  const perStep: Record<string, PerStepAggregate> = {};
  for (const [step, bucket] of byStep.entries()) {
    const durations = bucket.map((r) => r.durationMs);
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const tokensIn = bucket.map((r) => r.tokensIn);
    const tokensOut = bucket.map((r) => r.tokensOut);
    const retries = bucket.map((r) => r.retries);

    const failCount = bucket.filter((r) => r.verifierStatus === "fail").length;
    const meanIn = mean(tokensIn);
    const meanOut = mean(tokensOut);

    const errorCodeCounts: Record<string, number> = {};
    for (const r of bucket) {
      if (r.errorCode !== undefined) {
        errorCodeCounts[r.errorCode] = (errorCodeCounts[r.errorCode] ?? 0) + 1;
      }
    }

    perStep[step] = {
      count: bucket.length,
      meanDurationMs: Math.round(mean(durations)),
      p95DurationMs: Math.round(p95NearestRank(sortedDurations)),
      retryRate: mean(retries),
      verifierFailureRate: bucket.length === 0 ? 0 : failCount / bucket.length,
      meanTokensIn: Math.round(meanIn),
      meanTokensOut: Math.round(meanOut),
      meanTokensTotal: Math.round(meanIn + meanOut),
      errorCodeCounts,
    };
  }

  // Step 7: first/last ts via lexicographic ISO-8601 sort.
  let firstTs: string | undefined;
  let lastTs: string | undefined;
  if (records.length > 0) {
    const sortedTs = records.map((r) => r.ts).sort();
    firstTs = sortedTs[0];
    lastTs = sortedTs[sortedTs.length - 1];
  }

  return {
    period: opts.period,
    totalRecords: records.length,
    parseErrorCount,
    firstTs,
    lastTs,
    distinctSteps: byStep.size,
    perStep,
    verifierOutcomes,
    failurePatterns,
  };
}
