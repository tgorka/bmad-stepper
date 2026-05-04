/**
 * src/migrations/load-and-migrate.ts — Cross-cutting persisted-file loader
 * (FR6, FR7, NFR-R6, AR20, AR33, AR41).
 *
 * Mid-tier module per AR41: imports only `zod` and `../errors.ts`. Every
 * persisted-file loader (Story 1.6 onwards) routes through this function:
 *
 *   const text = await Bun.file(STATE_PATH).text();
 *   const raw  = Bun.YAML.parse(text);     // caller owns parsing.
 *   const state = loadAndMigrate(raw, stateMigrationRegistry); // typed.
 *
 * Algorithm (per architecture §D8 lines 511–541):
 *   1. Read `raw.schemaVersion` (default 1 if absent).
 *   2. If `version > registry.current` → throw `StateTooNewError`.
 *   3. While `version < registry.current`: validate via `versions[v]`,
 *      apply `migrations[v]`, increment.
 *   4. Final-validate against `versions[current]`; return typed `L`.
 *
 * Three error classes (registered in `src/errors.ts`):
 *   - `StateTooNewError`     (exit 1) — `schemaVersion > current`.
 *   - `CorruptStateError`    (exit 1) — input is not an object, or any
 *                                       Zod validation step fails, or
 *                                       a registered validator is missing.
 *   - `MigrationFailureError`(exit 2) — a registered migration function
 *                                       threw, or a needed migration is
 *                                       not registered.
 *
 * The function is **synchronous**; the caller owns IO (`Bun.file(...)`,
 * `Bun.YAML.parse`, `JSON.parse`). This keeps the function pure and the
 * persistence boundary cleanly factored (AR42).
 *
 * Production callers MUST pass one of the four built-in registries from
 * `src/migrations/<family>/index.ts`. The generic `MigrationRegistry<L>`
 * type is exported to support testing and future schema families, not to
 * encourage ad-hoc registry construction.
 */

import type { ZodType } from "zod";
import {
  CorruptStateError,
  MigrationFailureError,
  StateTooNewError,
} from "../errors.ts";

export type Migration<From, To> = (data: From) => To;

export interface MigrationRegistry<Latest> {
  readonly familyName: string;
  readonly current: number;
  readonly versions: Record<number, ZodType>;
  readonly migrations: Record<number, Migration<unknown, unknown>>;
  // The `Latest` type parameter is structural; it appears in the return
  // type of `loadAndMigrate` and in the typed registry exports. The
  // declaration uses a phantom field so that TypeScript propagates the
  // type without runtime cost.
  readonly _latest?: Latest;
}

export function loadAndMigrate<L>(
  raw: unknown,
  registry: MigrationRegistry<L>,
): L {
  // Algorithm step 1 — defensive narrowing + read schemaVersion.
  if (raw === null || typeof raw !== "object") {
    throw new CorruptStateError(
      `${registry.familyName}: raw input is not an object`,
      `Received: ${typeof raw}`,
    );
  }
  const obj = raw as Record<string, unknown>;
  let version: number;
  // Per AC-1 wording, "default 1 if absent" — when `schemaVersion` is
  // missing from the top-level object, treat the input as version 1.
  // Inject the field into a shallow copy so downstream validation against
  // `versions[v]` (which declares `schemaVersion: z.literal(v)`) succeeds.
  let working: unknown;
  if (obj.schemaVersion === undefined) {
    version = 1;
    working = { ...obj, schemaVersion: 1 };
  } else if (typeof obj.schemaVersion === "number") {
    version = obj.schemaVersion;
    working = raw;
  } else {
    throw new CorruptStateError(
      `${registry.familyName}: schemaVersion is present but not a number`,
      `Received: ${typeof obj.schemaVersion}`,
    );
  }

  // Algorithm step 2 — schemaVersion > current → STATE_TOO_NEW.
  if (version > registry.current) {
    throw new StateTooNewError(
      `${registry.familyName}: schemaVersion ${version} > current ${registry.current}`,
      `Detected schemaVersion: ${version}; this Stepper supports up to ${registry.current}.`,
    );
  }

  // Algorithm step 3 — iterate validate → migrate → increment.
  while (version < registry.current) {
    const validator = registry.versions[version];
    if (!validator) {
      throw new CorruptStateError(
        `${registry.familyName}: no validator for version ${version}`,
        `Registry only registers versions: ${Object.keys(registry.versions).join(", ")}`,
      );
    }
    const validation = validator.safeParse(working);
    if (!validation.success) {
      throw new CorruptStateError(
        `${registry.familyName}: validation failed at version ${version}`,
        validation.error.message,
      );
    }
    const migration = registry.migrations[version];
    if (!migration) {
      throw new MigrationFailureError(
        `${registry.familyName}: no migration registered for ${version} → ${version + 1}`,
        `Registry migrations cover: ${Object.keys(registry.migrations).join(", ")}`,
      );
    }
    try {
      working = migration(validation.data);
    } catch (err) {
      throw new MigrationFailureError(
        `${registry.familyName}: migration ${version} → ${version + 1} threw`,
        err instanceof Error ? err.message : String(err),
      );
    }
    version += 1;
  }

  // Algorithm step 4 — final validate against versions[current].
  const finalValidator = registry.versions[registry.current];
  if (!finalValidator) {
    throw new CorruptStateError(
      `${registry.familyName}: no validator for current version ${registry.current}`,
      "Registry shape is broken; this is a project bug.",
    );
  }
  const finalValidation = finalValidator.safeParse(working);
  if (!finalValidation.success) {
    throw new CorruptStateError(
      `${registry.familyName}: final validation failed at version ${registry.current}`,
      finalValidation.error.message,
    );
  }
  return finalValidation.data as L;
}
