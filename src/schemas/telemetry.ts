/**
 * src/schemas/telemetry.ts — Zod schema for telemetry JSONL records v1
 * (FR6, FR7, NFR-M3, NFR-S3, AR20, AR27, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * CRITICAL — closed-set field whitelist: this schema uses `.strict()` to
 * reject extra fields. The closed-set guarantee operationalises NFR-S3
 * anti-PII (architecture line 1664) — no field outside the whitelisted set
 * is ever serialised to telemetry JSONL. Anything else fails Zod
 * validation on collect.
 *
 * Public surface:
 *   - TelemetryRecordV1Schema     — Zod schema for v1 (strict).
 *   - TelemetryRecordV1           — `z.infer<typeof TelemetryRecordV1Schema>`.
 *   - TelemetryRecord             — application-code alias.
 *   - TelemetryRecordLatestSchema — schema alias for the current version.
 */

import { z } from "zod";

export const TelemetryRecordV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    ts: z.string(),
    step: z.string(),
    phase: z.string(),
    persona: z.string(),
    model: z.string(),
    durationMs: z.number(),
    verifierStatus: z.enum(["pass", "fail", "skip"]),
    retries: z.number(),
    tokensIn: z.number(),
    tokensOut: z.number(),
    errorCode: z.string().optional(),
  })
  .strict();

export type TelemetryRecordV1 = z.infer<typeof TelemetryRecordV1Schema>;
export type TelemetryRecord = TelemetryRecordV1;
export const TelemetryRecordLatestSchema = TelemetryRecordV1Schema;
