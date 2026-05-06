/**
 * src/startup/archival-trigger.ts — runArchivalAtStartup() orchestrator
 * (Story 6.8 — AC-1/AC-2/AC-3/AC-4; AR41 mid-tier; AR21 single-line;
 * AR33 async + never console.*; NFR-Sc4 + NFR-Sc5).
 *
 * **NEW MID-TIER DIRECTORY per AR41**. The orchestrator imports from
 * sibling mid-tier modules `runs/` and `telemetry/`, plus foundational
 * `io/` and `schemas/`. Per OQ-11, the orchestrator does NOT belong in
 * either `src/runs/` or `src/telemetry/` (both are unaware of the cross-
 * coupling); a new directory keeps the AR41 boundary clean.
 *
 * Allowed imports:
 *   - `../runs/archive.ts` (sibling mid-tier).
 *   - `../telemetry/rotate.ts` (sibling mid-tier).
 *   - `../io/log.ts` (foundational — info + warn).
 *   - `../schemas/config.ts` (foundational type-only Config).
 * ZERO higher-tier or top-tier imports.
 *
 * **Closure-private once-per-session marker (per OQ-3 + Story 4.9 SIGINT
 * pattern)**: a module-level singleton tracks whether archival has fired
 * in the CURRENT Bun process. Within a single `bun run` invocation,
 * archival runs at most once. Across separate invocations (separate Bun
 * processes), each process re-fires; the threshold filter naturally
 * short-circuits already-moved files.
 *
 * **Non-blocking via fire-and-forget (per OQ-2 + AC-4 verbatim)**: AC-4
 * says "archival never blocks the user's command — runs in the
 * background". The runner-tier callers (next/run.ts, loop/run.ts) do
 * `void runArchivalAtStartup({config}).catch(...)` so the user's command
 * proceeds concurrently.
 *
 * **Error isolation (per OQ-9)**: each archive call is wrapped in an
 * INDEPENDENT try/catch. An `archiveOldRuns` failure does NOT prevent
 * `rotateOldTelemetry` from running, and vice versa. Each independent
 * failure is logged via `warn()`.
 *
 * **AC-3 idempotency layered defence**: (1) `oncePerSessionRef` short-
 * circuits within a single session; (2) the threshold filter on mtime
 * naturally re-skips already-moved files; (3) `.archive/` is hard-skipped
 * at the entry-loop level. `ref.fired = true` is set BEFORE the archive
 * calls so an exception during one of them does NOT cause a re-run on
 * the next call within the same session.
 *
 * **AC-4 audit notice (per AR21 + OQ-14)**: ONE single-line `info()` is
 * emitted on the FIRST invocation per session WHEN ANY work was done
 * (`archivedRuns + rotatedTelemetry > 0`). When BOTH counts are 0, the
 * notice is SUPPRESSED (no spam — the most common case is "fresh
 * project, nothing to archive").
 *
 * Architecture cross-references:
 *   - architecture.md §lines 1413-1414 — NFR-Sc4 + NFR-Sc5 PRIMARY.
 *   - epics.md §lines 1269-1276 — AC-1/AC-2/AC-3/AC-4 verbatim.
 */

import { info, warn } from "../io/log.ts";
import { archiveOldRuns, RUNS_AGE_THRESHOLD_MS_90D } from "../runs/archive.ts";
import type { Config } from "../schemas/config.ts";
import {
  rotateOldTelemetry,
  TELEMETRY_AGE_THRESHOLD_MS_12M,
} from "../telemetry/rotate.ts";

/**
 * Closure-private flag mirroring Story 4.9 SIGINT
 * `shutdownRequested`/`shutdownReceivedAt` pattern. Mutable; production
 * callers omit `oncePerSessionRef` from opts so the module-level
 * singleton tracks the lifetime of the Bun process.
 */
export interface OncePerSessionRef {
  fired: boolean;
}

const DEFAULT_ONCE_PER_SESSION_REF: OncePerSessionRef = { fired: false };

export interface RunArchivalAtStartupOptions {
  /**
   * Production callers thread `opts.config` from the
   * `import.meta.main loadConfig()` site (next/run.ts and loop/run.ts).
   * Tests pass a synthetic Config-shape stub. Typed as a Pick so the
   * orchestrator only sees the two top-level fields it consumes.
   */
  readonly config: Pick<Config, "paths" | "telemetry">;
  /**
   * Test seam: when supplied, overrides the module-level singleton.
   * Tests inject a fresh `{ fired: false }` ref-cell for isolation.
   */
  readonly oncePerSessionRef?: OncePerSessionRef;
  /** Test seam: overrides `config.paths.runs`. */
  readonly runsRootOverride?: string;
  /** Test seam: overrides `config.paths.telemetry`. */
  readonly telemetryRootOverride?: string;
  /** Test seam: overrides the 90-day runs threshold. */
  readonly ageThresholdRunsMs?: number;
  /** Test seam: overrides the 12-month telemetry threshold. */
  readonly ageThresholdTelemetryMs?: number;
}

export interface RunArchivalAtStartupResult {
  /** Count of runs files moved to `runs/.archive/<YYYY-MM>/`. */
  readonly archivedRuns: number;
  /** Count of telemetry files moved to `telemetry/.archive/`. */
  readonly rotatedTelemetry: number;
  /**
   * `true` when the once-per-session marker was already set; the
   * archival modules are NOT invoked. Production callers ignore;
   * tests assert this for the within-session idempotency case.
   */
  readonly alreadyFired: boolean;
}

/**
 * Orchestrator for the Story 6.8 auto-archival pair (runs > 90d +
 * telemetry > 12m). Fires once per Bun-process session; non-blocking;
 * idempotent; emits a single-line audit notice only when work was done.
 *
 * Production callers (next/run.ts and loop/run.ts) invoke as
 * `void runArchivalAtStartup({config: opts.config}).catch(...)` —
 * fire-and-forget per AC-4.
 *
 * @param opts injected dependencies; production callers pass only `config`.
 * @returns aggregate counts + alreadyFired sentinel for test introspection.
 */
export async function runArchivalAtStartup(
  opts: RunArchivalAtStartupOptions,
): Promise<RunArchivalAtStartupResult> {
  const ref = opts.oncePerSessionRef ?? DEFAULT_ONCE_PER_SESSION_REF;

  // Step 1: once-per-session short-circuit (within-session idempotency).
  if (ref.fired === true) {
    return { archivedRuns: 0, rotatedTelemetry: 0, alreadyFired: true };
  }

  // Step 2: set the flag BEFORE invoking archive modules — per OQ-3, an
  // exception in one of them MUST NOT cause a re-run on the next call
  // within the same session.
  ref.fired = true;

  // Step 3: runs archival (independent try/catch per OQ-9).
  let archivedRuns = 0;
  try {
    const r = await archiveOldRuns({
      runsRoot: opts.runsRootOverride ?? opts.config.paths.runs,
      ...(opts.ageThresholdRunsMs !== undefined
        ? { ageThresholdMs: opts.ageThresholdRunsMs }
        : { ageThresholdMs: RUNS_AGE_THRESHOLD_MS_90D }),
    });
    archivedRuns = r.archivedCount;
  } catch (err) {
    warn(
      `archival: runs archival failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Step 4: telemetry rotation gated on telemetry.enabled per AC-2 verbatim.
  let rotatedTelemetry = 0;
  if (opts.config.telemetry.enabled === true) {
    try {
      const r = await rotateOldTelemetry({
        telemetryRoot:
          opts.telemetryRootOverride ?? opts.config.paths.telemetry,
        ...(opts.ageThresholdTelemetryMs !== undefined
          ? { ageThresholdMs: opts.ageThresholdTelemetryMs }
          : { ageThresholdMs: TELEMETRY_AGE_THRESHOLD_MS_12M }),
      });
      rotatedTelemetry = r.rotatedCount;
    } catch (err) {
      warn(
        `archival: telemetry rotation failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Step 5: single-line audit notice (per AR21 + OQ-14). Suppress when
  // both counts are 0 (no spam on fresh projects).
  if (archivedRuns + rotatedTelemetry > 0) {
    info(
      `archival: archived ${archivedRuns} runs older than 90 days, ${rotatedTelemetry} telemetry files older than 12 months`,
    );
  }

  return { archivedRuns, rotatedTelemetry, alreadyFired: false };
}
