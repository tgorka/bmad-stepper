/**
 * src/state/diff.ts — `--diff-state` cache-vs-files-of-truth audit
 * (FR3, FR52, NFR-P5, NFR-R3, AR8, AR11, AR33, AR41).
 *
 * Mid-tier module per AR41. Composes `loadStateUnlocked +
 * recomputeStateUnlocked + computeDivergences + formatHumanReadable`. Pure /
 * async; no I/O writes; lock-free.
 *
 * The helper answers the question: "Does the cached `state.yaml` agree with
 * the would-be-recomputed shape derived from the project's files of truth
 * (`_bmad-output/{planning,implementation}-artifacts/*.md`)?" When the two
 * agree, the report says so; when they diverge, the report enumerates each
 * divergent field with a `cached=<rendered>; recomputed=<rendered>` line.
 *
 * v0.1 conservative scope: 4 fields are compared:
 *   - `lastSuccessfulStep` (rendered as `<step> epic <n> story <x.y>`).
 *   - `project.name`.
 *   - `project.bmadVersion`.
 *   - `runHistory.length` (number stringified).
 *
 * NOT compared (rationale: write-side state never recomputed from artifact
 * frontmatter; comparing would always show divergence):
 *   - `lastAttempted`, `lastFailureReason`, `lastSnapshot`, `checkpoints`.
 *   - `schemaVersion` (always 1 in v0.1; migration registry guarantees).
 *
 * Output format per the AC-line-847 verbatim example:
 *   `lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2`
 *
 * Header: `state.yaml diverges from files of truth:` (or, when in sync,
 * `state.yaml is in sync with files of truth (no divergence detected)`).
 * Per-divergence lines are indented by two spaces for visual consistency
 * with Story 3.7's `--list` bullet style (Open Question 1; AC-strict variant
 * would emit at column 0).
 *
 * Lock-free: ZERO interaction with `src/lock/`. Uses `loadStateUnlocked` +
 * `recomputeStateUnlocked` exclusively. AR8 + AR41 boundaries preserved.
 */

import type { State } from "../schemas/state.ts";
import { type LoadStateOptions, loadStateUnlocked } from "./load.ts";
import { type RecomputeOptions, recomputeStateUnlocked } from "./recompute.ts";

export interface Divergence {
  readonly field: string;
  readonly cached: string;
  readonly recomputed: string;
}

export interface DiffReport {
  readonly divergences: readonly Divergence[];
  readonly humanReadable: string;
}

export interface DiffStateOptions extends LoadStateOptions, RecomputeOptions {}

/**
 * Render a `lastSuccessfulStep` value for human-readable display. Matches
 * the AC-line-847 verbatim example modulo the `completedAt` field, which is
 * omitted for compactness.
 *
 * Examples:
 *   - `null` → `"null"`.
 *   - `{ step: "dev-story", epic: 3, story: "3.2", completedAt: "..." }` →
 *     `"dev-story epic 3 story 3.2"`.
 */
function renderLastSuccessfulStep(
  value: State["lastSuccessfulStep"] | null | undefined,
): string {
  if (value === null || value === undefined) return "null";
  return `${value.step} epic ${value.epic} story ${value.story}`;
}

/**
 * Walk the cached + recomputed state shapes side-by-side; for each field
 * that differs, append a `Divergence` record. v0.1 conservative scope:
 * 4 fields (`lastSuccessfulStep`, `project.name`, `project.bmadVersion`,
 * `runHistory.length`).
 */
function computeDivergences(cached: State, recomputed: State): Divergence[] {
  const out: Divergence[] = [];

  // 1. lastSuccessfulStep — rendered via the helper for both sides; the
  //    string equality is the divergence signal.
  const cachedLast = renderLastSuccessfulStep(cached.lastSuccessfulStep);
  const recomputedLast = renderLastSuccessfulStep(
    recomputed.lastSuccessfulStep,
  );
  if (cachedLast !== recomputedLast) {
    out.push({
      field: "lastSuccessfulStep",
      cached: cachedLast,
      recomputed: recomputedLast,
    });
  }

  // 2. project.name.
  if (cached.project.name !== recomputed.project.name) {
    out.push({
      field: "project.name",
      cached: cached.project.name,
      recomputed: recomputed.project.name,
    });
  }

  // 3. project.bmadVersion.
  if (cached.project.bmadVersion !== recomputed.project.bmadVersion) {
    out.push({
      field: "project.bmadVersion",
      cached: cached.project.bmadVersion,
      recomputed: recomputed.project.bmadVersion,
    });
  }

  // 4. runHistory.length (count-only; element-by-element diff is Story 6.x).
  const cachedRunHistoryLen = cached.runHistory.length;
  const recomputedRunHistoryLen = recomputed.runHistory.length;
  if (cachedRunHistoryLen !== recomputedRunHistoryLen) {
    out.push({
      field: "runHistory.length",
      cached: String(cachedRunHistoryLen),
      recomputed: String(recomputedRunHistoryLen),
    });
  }

  return out;
}

/**
 * Format a `Divergence[]` into a multi-line `\n`-joined human-readable
 * string. Empty input → in-sync message; non-empty → header + indented
 * per-divergence lines.
 */
function formatHumanReadable(divergences: readonly Divergence[]): string {
  if (divergences.length === 0) {
    return "state.yaml is in sync with files of truth (no divergence detected)";
  }
  const lines: string[] = ["state.yaml diverges from files of truth:"];
  for (const d of divergences) {
    lines.push(`  ${d.field}: cached=${d.cached}; recomputed=${d.recomputed}`);
  }
  return lines.join("\n");
}

/**
 * Produce a `DiffReport` describing the cache-vs-files-of-truth divergence
 * for the cached `state.yaml` at `opts.statePath` (default
 * `_bmad-output/.stepper/state.yaml`). Pure / async; lock-free.
 *
 * @throws same error set as `loadStateUnlocked` (CorruptStateError,
 *   StateTooNewError, MigrationFailureError, PathologicalInputError).
 *   NEVER LockContentionError (the helper never acquires the lock).
 */
export async function diffState(opts?: DiffStateOptions): Promise<DiffReport> {
  const [cached, recomputed] = await Promise.all([
    loadStateUnlocked({
      ...(opts?.statePath !== undefined ? { statePath: opts.statePath } : {}),
      ...(opts?.warnSizeBytes !== undefined
        ? { warnSizeBytes: opts.warnSizeBytes }
        : {}),
      ...(opts?.haltSizeBytes !== undefined
        ? { haltSizeBytes: opts.haltSizeBytes }
        : {}),
      ...(opts?.logger !== undefined ? { logger: opts.logger } : {}),
    }),
    recomputeStateUnlocked({
      ...(opts?.projectRoot !== undefined
        ? { projectRoot: opts.projectRoot }
        : {}),
      ...(opts?.bmadVersion !== undefined
        ? { bmadVersion: opts.bmadVersion }
        : {}),
    }),
  ]);

  const divergences = computeDivergences(cached, recomputed);
  const humanReadable = formatHumanReadable(divergences);

  return {
    divergences,
    humanReadable,
  };
}
