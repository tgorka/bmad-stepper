/**
 * src/migrations/state/index.ts — `state.yaml` migration registry
 * (FR6, FR7, NFR-R6, AR20, AR41).
 *
 * Mid-tier module per AR41: imports only the foundational v1 schema and
 * the sibling `load-and-migrate.ts` type. v0.1 ships a single version
 * (`current: 1`) so the `migrations` record is intentionally empty. When
 * v2 is introduced (a future story), the dev adds `1: (data) => mig2(data)`
 * to `migrations` and bumps `current` to 2; the harness in
 * `migration.test.ts` automatically picks up the idempotency assertion.
 */

import { type State, StateV1Schema } from "../../schemas/state.ts";
import type { MigrationRegistry } from "../load-and-migrate.ts";

export const stateMigrationRegistry: MigrationRegistry<State> = {
  familyName: "state",
  current: 1,
  versions: {
    1: StateV1Schema,
  },
  migrations: {},
} as const;
