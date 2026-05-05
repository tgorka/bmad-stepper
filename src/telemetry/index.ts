/**
 * src/telemetry/index.ts — barrel for the telemetry mid-tier module
 * (Story 6.6 — FR39, FR40, FR45; NFR-S3, AR41).
 *
 * Mid-tier per AR41 (architecture line 1283). Allowed importers: top-tier
 * `src/commands/**` (e.g., `verify-and-advance.ts`). Foundational schema
 * re-export is a convenience for callers that need both the writer and
 * the canonical record shape (the schema source-of-truth lives at
 * `src/schemas/telemetry.ts`).
 */

export {
  type TelemetryRecord,
  TelemetryRecordV1Schema,
} from "../schemas/telemetry.ts";
export {
  type AggregateOptions,
  type AggregateResult,
  aggregateTelemetry,
  type PerStepAggregate,
} from "./aggregate.ts";
export {
  DEFAULT_TELEMETRY_ROOT,
  type WriteTelemetryOptions,
  type WriteTelemetryResult,
  writeTelemetryRecord,
} from "./collect.ts";
export { renderTelemetryReport } from "./render-report.ts";
export {
  type RotateOldTelemetryOptions,
  type RotateOldTelemetryResult,
  rotateOldTelemetry,
  TELEMETRY_AGE_THRESHOLD_MS_12M,
} from "./rotate.ts";
