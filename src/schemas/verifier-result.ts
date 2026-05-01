/**
 * src/schemas/verifier-result.ts — Zod schema for verifier results v1
 * (FR6, FR7, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * Verifier results land in `_bmad-output/.stepper/runs/<runId>/verifier.json`
 * and `<runId>/checks/<name>.json` (architecture §P5 lines 901–914). The
 * `status` enum is `pass | fail | skip` — used to gate verify-and-advance.
 *
 * Public surface:
 *   - VerifierResultV1Schema     — Zod schema for v1.
 *   - VerifierResultV1           — `z.infer<typeof VerifierResultV1Schema>`.
 *   - VerifierResult             — application-code alias.
 *   - VerifierResultLatestSchema — schema alias for the current version.
 */

import { z } from "zod";

export const VerifierResultV1Schema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["pass", "fail", "skip"]),
  checks: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["pass", "fail", "skip"]),
      detail: z.string(),
    }),
  ),
  promotedTo: z.string().nullable(),
});

export type VerifierResultV1 = z.infer<typeof VerifierResultV1Schema>;
export type VerifierResult = VerifierResultV1;
export const VerifierResultLatestSchema = VerifierResultV1Schema;
