/**
 * src/runs/write-step.ts — Atomic dual writer for the markdown transcript +
 * JSON run-log pair (Story 2.5 AC-1 / AC-2 / AC-3 / AC-4; AR25, AR26,
 * NFR-P4, NFR-S5, NFR-R1, NFR-S2, NFR-M3, AR41).
 *
 * **MID-TIER module per AR41** (architecture lines 1278-1282). Allowed
 * imports:
 *   - foundational: `../io/atomic-write.ts`, `../io/paths.ts`,
 *     `../schemas/run-log.ts`.
 *   - intra-module siblings: `./build-run-log.ts`, `./render-markdown.ts`,
 *     `./types.ts`.
 *   - Node stdlib: `node:fs/promises` (mkdir), `node:path` (join).
 *
 * **FORBIDDEN** imports per AR25 NFR-P4 silence:
 *   - `../io/log.ts` (info/warn/error/json) — the writer is silent on
 *     stdout/stderr; the runner-tier caller (Story 2.6) emits the FR18
 *     summary line.
 *   - sibling mid-tier (`../state/`, `../lock/`).
 *   - higher-tier (`../dispatch/`, `../verifiers/`, `../failure-ux/`).
 *   - top-tier (`../commands/`).
 *
 * Algorithm (architecture §F line 547 + §line 1393 + §P5 lines 793-847):
 *   1. Derive filesystem-safe `<ts>` from runId leading prefix or nowIso.
 *   2. Sanitise stepName for filename safety.
 *   3. Compose markdown + JSON paths under `<runsRoot>/<ts>-<step>.{log,json}`.
 *   4. Render markdown (pure) + build run-log (pure).
 *   5. Defence-in-depth: `RunLogV1Schema.parse(runLog)` (NFR-M3).
 *   6. Ensure parent directory exists (Story 2.2 buildDispatchSpec precedent).
 *   7. atomicWrite(markdown) — tmp+rename + .bak rotation (NFR-S5).
 *   8. atomicWrite(JSON pretty-printed + trailing newline).
 *   9. Return { markdownPath, jsonPath, ts }.
 *
 * Error semantics (AR21, AR22, AR33):
 *   - ScopeViolationError (transitively from `assertWithinScope` inside
 *     `atomicWrite`) when caller passes a `runsRoot` outside allowed scope.
 *   - Filesystem errors (ENOENT/EACCES/EROFS) propagate from `atomicWrite`.
 *   - Zod ZodError from RunLogV1Schema.parse — UNREACHABLE in practice;
 *     defence-in-depth for schema drift.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { atomicWrite } from "../io/atomic-write.ts";
import { assertWithinScope, STEPPER_INTERNAL_ROOT } from "../io/paths.ts";
import { RunLogV1Schema } from "../schemas/run-log.ts";
import { buildRunLog } from "./build-run-log.ts";
import { renderTranscriptMarkdown } from "./render-markdown.ts";
import type {
  TranscriptInput,
  WriteStepTranscriptInput,
  WriteStepTranscriptResult,
} from "./types.ts";

/** Canonical runs directory under STEPPER_INTERNAL_ROOT (architecture §D7 line 347). */
const RUNS_ROOT = `${STEPPER_INTERNAL_ROOT}/runs`;

/** Story 2.2 runId convention: `<YYYY-MM-DDTHH-mm-ss>-<step>-<short-uuid>`. */
const RUNID_TS_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-/;

/**
 * Derives the filesystem-safe `<ts>` per AC-4 + architecture §line 365
 * (`YYYY-MM-DDTHH-mm-ss` UTC).
 *
 * Preference order:
 *   1. runId leading prefix when matching the Story 2.2 convention — keeps
 *      the audit trail aligned with the dispatch.
 *   2. input.nowIso (test-injected) → filesystem-safe form.
 *   3. new Date().toISOString() → filesystem-safe form.
 *
 * Filesystem-safe transformation: replace `:` with `-`; drop `.<ms>` suffix;
 * drop trailing `Z`. Result: `2026-04-29T10-15-00`.
 */
function deriveTimestamp(input: TranscriptInput): string {
  const runIdMatch = input.runId.match(RUNID_TS_PREFIX);
  if (runIdMatch) {
    return runIdMatch[1] as string;
  }
  const sourceIso = input.nowIso ?? new Date().toISOString();
  return sourceIso
    .replace(/:/g, "-")
    .replace(/\.\d+Z?$/, "")
    .replace(/Z$/, "");
}

/**
 * Strips filesystem-unsafe characters from the step name for filename use.
 * Lowercase + `[a-z0-9-]+` only; replaces any other char (including
 * uppercase, underscores, punctuation) with `-`. Collapses repeated
 * hyphens to a single hyphen and trims leading/trailing hyphens.
 *
 * The seed-v6.x.ts step names already conform (e.g., `bmad-create-prd`);
 * the helper is belt-and-suspenders for forward-compat / overrides.
 */
function sanitiseStepName(stepName: string): string {
  const lower = stepName.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9-]+/g, "-");
  const collapsed = replaced.replace(/-+/g, "-");
  return collapsed.replace(/^-+|-+$/g, "");
}

/**
 * Atomic dual writer for the markdown transcript + JSON run-log pair.
 *
 * Writes:
 *   - `<runsRoot>/<ts>-<step>.log`  — markdown transcript (AR25).
 *   - `<runsRoot>/<ts>-<step>.json` — JSON run log (AR26).
 *
 * Both writes use `atomicWrite` from Story 1.3 (tmp+rename + `.bak`
 * rotation per NFR-S5 + NFR-R1). The `runsRoot` defaults to
 * `${STEPPER_INTERNAL_ROOT}/runs` (architecture §D7 line 347); tests pass
 * tmpdir-rooted overrides which remain inside the assertWithinScope-allowed
 * scope.
 *
 * Returns the absolute markdown + JSON paths and the derived `<ts>` so the
 * runner-tier caller (Story 2.6) can record them in the FR18 summary line.
 */
export async function writeStepTranscript(
  input: WriteStepTranscriptInput,
): Promise<WriteStepTranscriptResult> {
  const ts = deriveTimestamp(input);
  const step = sanitiseStepName(input.stepName);
  const runsRoot = input.runsRoot ?? RUNS_ROOT;

  const markdownPath = path.join(runsRoot, `${ts}-${step}.log`);
  const jsonPath = path.join(runsRoot, `${ts}-${step}.json`);

  const markdown = renderTranscriptMarkdown(input);
  const runLog = buildRunLog(input);

  // Defence-in-depth (NFR-M3): catch schema drift before hitting disk.
  RunLogV1Schema.parse(runLog);

  // NFR-S2 scope check on the parent directory FIRST — before mkdir would
  // raise an EACCES on out-of-scope roots. atomicWrite re-checks each
  // target path transitively, but calling assertWithinScope on the
  // parent here surfaces the canonical ScopeViolationError before any
  // filesystem syscall.
  assertWithinScope(runsRoot);

  // Ensure parent directory exists (atomicWrite does NOT create parents per
  // Story 1.3 contract; mirrors Story 2.2 buildDispatchSpec precedent).
  await fs.mkdir(runsRoot, { recursive: true });

  // Streamed write per AR25 — atomicWrite uses Bun.write under the hood;
  // assertWithinScope is invoked transitively (NFR-S2). Markdown first.
  await atomicWrite(markdownPath, markdown);
  await atomicWrite(jsonPath, `${JSON.stringify(runLog, null, 2)}\n`);

  return { markdownPath, jsonPath, ts };
}
