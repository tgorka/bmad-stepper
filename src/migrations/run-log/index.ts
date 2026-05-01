/**
 * src/migrations/run-log/index.ts — Run-log JSON migration registry
 * (FR6, FR7, NFR-R6, AR20, AR41).
 *
 * Mid-tier module per AR41: imports only the foundational v1 schema and
 * the sibling `load-and-migrate.ts` type.
 */

import { type RunLog, RunLogV1Schema } from "../../schemas/run-log.ts";
import type { MigrationRegistry } from "../load-and-migrate.ts";

export const runLogMigrationRegistry: MigrationRegistry<RunLog> = {
  familyName: "run-log",
  current: 1,
  versions: {
    1: RunLogV1Schema,
  },
  migrations: {},
} as const;
