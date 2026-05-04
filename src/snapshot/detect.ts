/**
 * src/snapshot/detect.ts — Branch + SHA detector via `Bun.spawn(["git", ...])`
 * (FR5, FR33, FR55, NFR-R1, NFR-S1, NFR-S2, AR13, AR33, AR41).
 *
 * Operationalises architecture §B D10 Layer 1 (snapshot/checkpoint mechanism,
 * lines 389-407) and AR13 (Snapshot two-layer — Git-aware branch+sha to
 * `state.yaml.lastSnapshot`; halt with BRANCH_SWITCH on mismatch; non-Git is
 * one-time warning, line 181).
 *
 * Public surface:
 *   - `Snapshot`               — `{ branch: string; sha: string; takenAt: string }`.
 *                                Field names match `StateV1Schema.lastSnapshot`
 *                                (`src/schemas/state.ts` lines 55-62) so the
 *                                orchestrator (Story 2.4) plugs the detector's
 *                                output directly into `state.lastSnapshot`
 *                                without remapping. Defined INDEPENDENTLY of
 *                                the schema per AR41 mid-tier-to-mid-tier
 *                                import ban.
 *   - `DetectSnapshotOptions`  — Test-only-but-exported escape hatch (Story 1.4
 *                                `LockOptions` pattern reapplied). All fields
 *                                optional; `cwd` defaults to `process.cwd()`,
 *                                `now` defaults to `() => new Date()`,
 *                                `logger` defaults to the `warn` export of
 *                                `../io/log.ts`.
 *   - `SnapshotLogger`         — Logger contract `{ warn(msg: string): void }`
 *                                used to inject capturing loggers in tests
 *                                without spying on stderr globally.
 *   - `detectSnapshot(opts?)`  — Public async function returning
 *                                `Promise<Snapshot | null>`. Returns `null`
 *                                when the cwd is not inside a Git work-tree
 *                                (emits one-time warning per AC-3). Throws a
 *                                system `Error` on unexpected git failure
 *                                (e.g., empty repo, branch capture failed
 *                                inside a confirmed work-tree). `Bun.spawn`
 *                                propagates `spawn ENOENT` verbatim if the
 *                                git binary is missing — the doctor command
 *                                (Story 1.12) detects that precondition
 *                                explicitly; this module does not pre-translate.
 *
 * Algorithm (architecture lines 393-397; AC-1 verbatim):
 *   1. `git rev-parse --is-inside-work-tree` — pre-check. Non-zero exit ⇒
 *      not a Git work-tree ⇒ emit warn, return `null`.
 *   2. `git rev-parse --abbrev-ref HEAD` — branch capture. Returns the literal
 *      string `"HEAD"` for detached-HEAD repos (the orchestrator (Story 2.4)
 *      decides whether detached-HEAD halts on branch-switch — it does not;
 *      the SHA still anchors the comparison).
 *   3. `git rev-parse HEAD` — SHA capture (40-char hex by Git's default). Fails
 *      with non-zero exit on empty repos (no commits) ⇒ throws system Error.
 *   4. Build `Snapshot` value. `takenAt` is an ISO-8601 string from
 *      `(opts?.now ?? () => new Date())().toISOString()`.
 *
 * AR33 (function & error semantics):
 *   - Async (Bun.spawn(...).exited is a Promise).
 *   - Bun.spawn ONLY (no `node:child_process`).
 *   - Throws system Errors verbatim on unexpected failures.
 *   - Non-Git is `null` (NOT throw) — the unknown-but-not-error pattern.
 *   - No `console.*` (Biome `noConsole` rule blocks it).
 *
 * AR41 (module boundary graph, line 1296):
 *   - `src/snapshot/` is mid-tier alongside `state/`, `migrations/`,
 *     `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`,
 *     `upgrade/`.
 *   - Allowed imports: foundational (`../errors.ts`, `../io/log.ts`,
 *     `../io/paths.ts` if needed), Bun stdlib (`Bun.spawn`).
 *   - Forbidden: `../state/`, `../schemas/`, `../lock/`, `../migrations/`,
 *     sibling mid-tier modules, `node:child_process`, external git-helper
 *     libraries (`simple-git`, `nodegit`, `isomorphic-git`).
 *
 * Story 1.8 does NOT throw `BranchSwitchError`. The comparator (Story 2.4)
 * compares the freshly detected `Snapshot` against `state.yaml.lastSnapshot`
 * and routes mismatch to `BranchSwitchError`. Story 1.8 provides the
 * detection half of the comparison only; AC-2's verbatim hint alignment is
 * deferred to Story 2.4 per the Story 1.4 / 1.6 precedent.
 */

import { warn as defaultWarn } from "../io/log.ts";

/**
 * Snapshot value object — Git-aware branch+SHA capture with ISO-8601 timestamp.
 *
 * Field names match `StateV1Schema.lastSnapshot` exactly (`src/schemas/state.ts`
 * lines 55-62) so the orchestrator (Story 2.4) plugs the detector's output
 * directly into `state.lastSnapshot` without remapping. Defined here
 * INDEPENDENTLY of the schema per AR41 mid-tier-to-mid-tier import ban.
 *
 * - `branch` — Git branch name (from `git rev-parse --abbrev-ref HEAD`). The
 *   literal string `"HEAD"` for detached-HEAD repos.
 * - `sha`    — 40-char lowercase hex SHA (from `git rev-parse HEAD`).
 * - `takenAt` — ISO-8601 timestamp (from `new Date().toISOString()` or
 *   injected `opts.now`). Always ends with `"Z"` (UTC).
 */
export interface Snapshot {
  readonly branch: string;
  readonly sha: string;
  readonly takenAt: string;
}

/**
 * Logger contract used by `detectSnapshot` for the non-Git one-time warning.
 *
 * Story 1.4's lock module establishes the same pattern (`LockLogger`) so
 * tests can inject capturing loggers without mocking the global stderr.
 * The default implementation routes through `../io/log.ts` `warn(...)`,
 * which writes to `process.stderr` per Story 1.3's stdout/stderr discipline.
 */
export interface SnapshotLogger {
  warn(message: string): void;
}

/**
 * Optional injection bag for `detectSnapshot`. All fields optional —
 * production callers pass none.
 *
 * - `cwd`    — Working directory for the `Bun.spawn` invocations. Defaults to
 *              `process.cwd()`. Tests inject tmpdir paths to keep detection
 *              isolated from the test runner's own repo.
 * - `now`    — Injectable clock for deterministic `takenAt` timestamps in
 *              tests. Defaults to `() => new Date()`.
 * - `logger` — Injectable logger for the non-Git path. Defaults to a logger
 *              that delegates to `warn` from `../io/log.ts` (writes to stderr).
 *              Tests inject a capturing logger to assert the warning content
 *              without spying on stderr.
 */
export interface DetectSnapshotOptions {
  readonly cwd?: string;
  readonly now?: () => Date;
  readonly logger?: SnapshotLogger;
}

const DEFAULT_LOGGER: SnapshotLogger = {
  warn(message: string): void {
    defaultWarn(message);
  },
};

const DEFAULT_NOW = (): Date => new Date();

/**
 * Public message emitted on the non-Git fallback path (AC-3). The orchestrator
 * (Story 2.4) tracks "first run" semantics for cross-invocation
 * deduplication; Story 1.8 emits one warning per call.
 */
export const NOT_A_GIT_REPO_WARNING =
  "snapshot: not a git repository, lastSnapshot=null";

/**
 * Capture the current Git branch+SHA via two `Bun.spawn(["git", "rev-parse", ...])`
 * invocations preceded by an `--is-inside-work-tree` pre-check.
 *
 * Returns `Promise<Snapshot | null>`:
 *   - `Snapshot` when the cwd is inside a Git work-tree.
 *   - `null` when the cwd is NOT inside a Git work-tree (emits one-time warning).
 *
 * Throws a system `Error` on unexpected failures inside a confirmed work-tree
 * (e.g., empty repo with no commits, branch capture failed). Throws `spawn
 * ENOENT` verbatim from `Bun.spawn` if the git binary is missing.
 */
export async function detectSnapshot(
  opts?: DetectSnapshotOptions,
): Promise<Snapshot | null> {
  const cwd = opts?.cwd ?? process.cwd();
  const now = opts?.now ?? DEFAULT_NOW;
  const logger = opts?.logger ?? DEFAULT_LOGGER;

  // Step 1: Detect Git work-tree.
  const insideWorkTreeProc = Bun.spawn(
    ["git", "rev-parse", "--is-inside-work-tree"],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  await insideWorkTreeProc.exited;
  if (insideWorkTreeProc.exitCode !== 0) {
    logger.warn(NOT_A_GIT_REPO_WARNING);
    return null;
  }

  // Step 2: Capture branch (literal "HEAD" for detached-HEAD repos).
  const branchProc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await branchProc.exited;
  if (branchProc.exitCode !== 0) {
    const stderrText = (await new Response(branchProc.stderr).text()).trim();
    throw new Error(
      `snapshot: failed to capture branch via 'git rev-parse --abbrev-ref HEAD' (exit ${branchProc.exitCode}): ${stderrText}`,
    );
  }
  const branch = (await new Response(branchProc.stdout).text()).trim();

  // Step 3: Capture SHA (fails on empty repo with no commits).
  const shaProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await shaProc.exited;
  if (shaProc.exitCode !== 0) {
    const stderrText = (await new Response(shaProc.stderr).text()).trim();
    throw new Error(
      `snapshot: failed to capture SHA via 'git rev-parse HEAD' (exit ${shaProc.exitCode}): ${stderrText}`,
    );
  }
  const sha = (await new Response(shaProc.stdout).text()).trim();

  // Step 4: Build Snapshot value.
  const takenAt = now().toISOString();
  return { branch, sha, takenAt };
}
