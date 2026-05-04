/**
 * src/migrations/telemetry/index.ts — Telemetry JSONL migration registry
 * (FR6, FR7, NFR-R6, NFR-S3, AR20, AR27, AR41).
 *
 * Mid-tier module per AR41: imports only the foundational v1 schema and
 * the sibling `load-and-migrate.ts` type. The telemetry schema is
 * `.strict()` (closed-set anti-PII enforcement); the registry is
 * type-compatible with strict schemas because `ZodObject<...>.strict()`
 * is still a `ZodType`.
 */

import {
  type TelemetryRecord,
  TelemetryRecordV1Schema,
} from "../../schemas/telemetry.ts";
import type { MigrationRegistry } from "../load-and-migrate.ts";

export const telemetryMigrationRegistry: MigrationRegistry<TelemetryRecord> = {
  familyName: "telemetry",
  current: 1,
  versions: {
    1: TelemetryRecordV1Schema,
  },
  migrations: {},
} as const;
