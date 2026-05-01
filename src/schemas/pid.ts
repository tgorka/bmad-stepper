/**
 * src/schemas/pid.ts — Zod schema for the lock pid file v1
 * (FR6, FR7, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * The pid file lives at `_bmad-output/.stepper/locks/<lock-name>/pid` (per
 * Story 1.4's lock implementation; placement is `src/lock/lock.ts`'s
 * concern, not this schema's). Story 1.4's writer emits the shape:
 *
 *   { pid: number, hostname: string, acquiredAt: string,
 *     heartbeatIntervalMs: number }
 *
 * — without a `schemaVersion` field. The architecture (§D4 line 378)
 * documented the field name `heartbeatInterval` (seconds) but Story 1.4
 * shipped `heartbeatIntervalMs` (milliseconds). This schema accepts the
 * Story 1.4 actual shape verbatim and uses `.optional().default(1)` on
 * `schemaVersion` so legacy pid files (no `schemaVersion`) parse cleanly.
 *
 * Story 1.5 introduces no consumer of `PidFileV1Schema`. Story 1.12
 * (`/bmad-next --doctor`) is the first reader. Story 1.4's lock writer
 * is left byte-identical — the `.default(1)` is the forward-compatibility
 * contract between Story 1.4's writer and Story 1.5's reader.
 *
 * Public surface:
 *   - PidFileV1Schema     — Zod schema for v1.
 *   - PidFileV1           — `z.infer<typeof PidFileV1Schema>`.
 *   - PidFile             — application-code alias.
 *   - PidFileLatestSchema — schema alias for the current version.
 */

import { z } from "zod";

export const PidFileV1Schema = z.object({
  schemaVersion: z.literal(1).optional().default(1),
  pid: z.number(),
  hostname: z.string(),
  acquiredAt: z.string(),
  heartbeatIntervalMs: z.number(),
});

export type PidFileV1 = z.infer<typeof PidFileV1Schema>;
export type PidFile = PidFileV1;
export const PidFileLatestSchema = PidFileV1Schema;
