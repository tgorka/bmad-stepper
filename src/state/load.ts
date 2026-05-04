/**
 * src/state/load.ts — Canonical entry point for reading `state.yaml`
 * (FR5, FR6, FR7, NFR-P5, AR11, AR12, AR20, AR33, AR41, AR42).
 *
 * Mid-tier module per AR41. First source-side consumer of:
 *   - `acquire(...)` from `../lock/lock.ts` (Story 1.4).
 *   - `loadAndMigrate(raw, registry)` from `../migrations/load-and-migrate.ts`
 *     (Story 1.5).
 *   - `Bun.file(path).text()` + `Bun.YAML.parse(...)` for state YAML reads.
 *
 * Public API:
 *   - `loadState(opts?)`         → locked variant; canonical for production.
 *   - `loadStateUnlocked(opts?)` → read-only variant for Epic 3 flags
 *     (`--export-state`, `--diff-state`, `--list`, `--explain`) and Story
 *     2.4's lock-free `run.ts` (architecture line 1672 — "run.ts is read-only").
 *   - `LoadStateOptions`         → test-only-but-exported escape hatch
 *     (Story 1.4 LockOptions pattern reapplied).
 *
 * Algorithm (per architecture §D7 + §D8 + AR12):
 *   1. Resolve options against defaults.
 *   2. Acquire the project lock (locked variant only). `try/finally` ensures
 *      release on every code path — including throws from steps 3 onwards.
 *   3. Read the file size via `Bun.file(statePath).size`. Size === 0 means
 *      missing or empty: throw `CorruptStateError`.
 *   4. Size guards (NFR-P5):
 *        - size > haltSizeBytes  → throw `PathologicalInputError`.
 *        - size > warnSizeBytes  → emit warning to stderr; proceed.
 *   5. Read text + parse YAML via `Bun.YAML.parse`. Wrap parse errors as
 *      `CorruptStateError`.
 *   6. Migrate via `loadAndMigrate(raw, stateMigrationRegistry)`. The
 *      function may throw `CorruptStateError`, `StateTooNewError`, or
 *      `MigrationFailureError` (Story 1.5 contracts) — propagated verbatim.
 *   7. Return the typed `State` value. Lock release happens in `finally`.
 *
 * Error semantics (AR33):
 *   - `LockContentionError`   — from `acquire(...)` (locked variant).
 *   - `CorruptStateError`     — missing / empty / malformed YAML, or the
 *                                migration function deemed the input invalid.
 *   - `StateTooNewError`      — `schemaVersion > registry.current`.
 *   - `MigrationFailureError` — registered migration threw or is missing.
 *   - `PathologicalInputError`— size > 50 MB.
 *
 * No `console.*` calls anywhere — uses the injected (or default) logger's
 * `warn` method per `src/io/log.ts` discipline.
 */

import { CorruptStateError, PathologicalInputError } from "../errors.ts";
import { warn } from "../io/log.ts";
import { acquire, type LockOptions } from "../lock/lock.ts";
import { loadAndMigrate } from "../migrations/load-and-migrate.ts";
import { stateMigrationRegistry } from "../migrations/state/index.ts";
import type { State } from "../schemas/state.ts";
import { STATE_PATH } from "./paths.ts";

export const DEFAULT_WARN_SIZE_BYTES = 1 * 1024 * 1024;
export const DEFAULT_HALT_SIZE_BYTES = 50 * 1024 * 1024;

export interface LoadStateOptions {
  /** Override the canonical state.yaml path. Defaults to `STATE_PATH`. */
  readonly statePath?: string;
  /** Override the warn threshold in bytes. Defaults to 1 MB. */
  readonly warnSizeBytes?: number;
  /** Override the halt threshold in bytes. Defaults to 50 MB. */
  readonly haltSizeBytes?: number;
  /** Lock options forwarded to `acquire(...)` (locked variant only). */
  readonly lockOptions?: LockOptions;
  /** Logger override. Defaults to `{ warn }` from `src/io/log.ts`. */
  readonly logger?: { warn(message: string): void };
}

interface ResolvedLoadOptions {
  readonly statePath: string;
  readonly warnSizeBytes: number;
  readonly haltSizeBytes: number;
  readonly lockOptions: LockOptions | undefined;
  readonly logger: { warn(message: string): void };
}

const defaultLogger: { warn(message: string): void } = { warn };

function resolveOptions(opts?: LoadStateOptions): ResolvedLoadOptions {
  return {
    statePath: opts?.statePath ?? STATE_PATH,
    warnSizeBytes: opts?.warnSizeBytes ?? DEFAULT_WARN_SIZE_BYTES,
    haltSizeBytes: opts?.haltSizeBytes ?? DEFAULT_HALT_SIZE_BYTES,
    lockOptions: opts?.lockOptions,
    logger: opts?.logger ?? defaultLogger,
  };
}

/**
 * Reads + size-guards + parses + migrates `state.yaml`. Pure function shared
 * by both the locked and unlocked variants — performs no lock IO.
 */
async function readStateAt(config: ResolvedLoadOptions): Promise<State> {
  const file = Bun.file(config.statePath);
  const size = file.size;

  if (size === 0) {
    throw new CorruptStateError(
      "state.yaml is missing or empty",
      `Path: ${config.statePath}`,
    );
  }

  if (size > config.haltSizeBytes) {
    throw new PathologicalInputError(
      `state.yaml size ${size} bytes exceeds halt threshold ${config.haltSizeBytes} bytes`,
      `Path: ${config.statePath}`,
    );
  }

  if (size > config.warnSizeBytes) {
    config.logger.warn(
      `state.yaml size ${size} bytes exceeds 1 MB warn threshold`,
    );
  }

  const text = await file.text();

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(text);
  } catch (err) {
    throw new CorruptStateError(
      "state.yaml YAML parse failure",
      err instanceof Error ? err.message : String(err),
    );
  }

  return loadAndMigrate(raw, stateMigrationRegistry);
}

/**
 * Acquires the project lock, reads `state.yaml`, releases the lock in
 * `try/finally`. The canonical entry point for production state-reading
 * call sites.
 *
 * @throws {LockContentionError}    if another live process holds the lock.
 * @throws {CorruptStateError}      if the file is missing/empty/malformed
 *                                  or `loadAndMigrate` rejects the shape.
 * @throws {StateTooNewError}       if `schemaVersion > registry.current`.
 * @throws {MigrationFailureError}  if a registered migration threw.
 * @throws {PathologicalInputError} if `state.yaml` is larger than 50 MB.
 */
export async function loadState(opts?: LoadStateOptions): Promise<State> {
  const config = resolveOptions(opts);
  const handle = await acquire(config.lockOptions);
  try {
    return await readStateAt(config);
  } finally {
    await handle.release();
  }
}

/**
 * Reads `state.yaml` WITHOUT acquiring the project lock. For Epic 3
 * read-only flags (`--export-state`, `--diff-state`, `--list`, `--explain`)
 * and Story 2.4's lock-free `run.ts` (architecture line 1672). State-mutating
 * call sites MUST use `loadState` (locked) — this variant is for read-only
 * paths only.
 *
 * @throws same error set as `loadState`, except never `LockContentionError`
 *   (the function does not interact with the lock at all).
 */
export async function loadStateUnlocked(
  opts?: LoadStateOptions,
): Promise<State> {
  const config = resolveOptions(opts);
  return await readStateAt(config);
}
