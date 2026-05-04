/**
 * src/migrations/config/index.ts — `bmad-stepper.config.yaml` migration
 * registry (FR6, FR7, NFR-R6, AR20, AR41).
 *
 * Mid-tier module per AR41: imports only the foundational v1 schema and
 * the sibling `load-and-migrate.ts` type.
 */

import { type Config, ConfigV1Schema } from "../../schemas/config.ts";
import type { MigrationRegistry } from "../load-and-migrate.ts";

export const configMigrationRegistry: MigrationRegistry<Config> = {
  familyName: "config",
  current: 1,
  versions: {
    1: ConfigV1Schema,
  },
  migrations: {},
} as const;
