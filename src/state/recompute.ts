/**
 * src/state/recompute.ts — `--recompute-state` skeleton (FR2, NFR-P2,
 * NFR-R3, NFR-Sc1, AR11, AR41, AR42, architecture line 1129).
 *
 * Mid-tier module per AR41. The full DAG-aware, BMAD-skill-aware,
 * verifier-aware recompute lands across Stories 1.9 (BMAD detect), 1.10
 * (DAG seed + registry), and Epic 3. Story 1.6 ships a **minimum-viable
 * skeleton** that satisfies AC-2 for a fresh project:
 *
 *   1. Acquire the project lock.
 *   2. Derive `project.name` from `path.basename(opts.projectRoot)`.
 *   3. Scan `_bmad-output/planning-artifacts/*.md` and
 *      `_bmad-output/implementation-artifacts/*.md` (top-level only — no
 *      `.archive/` recursion). Parse YAML frontmatter; record artifacts
 *      whose `status` is `complete` or `done`.
 *   4. Pick the artifact with the most recent `last_updated` as
 *      `lastSuccessfulStep` (heuristic; Story 1.10 will replace with
 *      DAG-aware traversal). When no artifacts qualify, the field is
 *      `null`.
 *   5. Build a fresh `State` (schemaVersion 1, empty runHistory + checkpoints,
 *      `bmadVersion: "unknown"` default — Story 1.9 owns real detection).
 *   6. Atomic-save via `saveState(...)`.
 *   7. Return the new `State` (lock released in `finally`).
 *
 * Pagination / scalability (NFR-P2 + NFR-Sc1): the artifact scan uses the
 * `Bun.Glob.scan(...)` async iterator, never materialising the full path
 * list as an array. Per artifact, the frontmatter substring is bounded by
 * the closing `---` delimiter so the YAML parse is incremental.
 *
 * Out of scope for this story (deferred per the dev plan):
 *   - DAG-aware step computation                 → Story 1.10.
 *   - Real `bmadVersion` detection from plugins  → Story 1.9.
 *   - Per-step verifier-aware status             → Stories 2.1+.
 *   - `lastAttempted` / `lastFailureReason`      → Story 2.5 (run-log writer).
 *   - `lastSnapshot` (Git introspection)         → Story 1.8.
 *
 * No `console.*` calls anywhere — errors are thrown.
 */

import * as path from "node:path";
import { acquire, type LockOptions } from "../lock/lock.ts";
import type { State } from "../schemas/state.ts";
import { STATE_PATH } from "./paths.ts";
import { saveState } from "./save.ts";

export interface RecomputeOptions {
  /** Override the project root used for artifact scanning + name derivation. */
  readonly projectRoot?: string;
  /** Override the detected `bmadVersion`. Defaults to `"unknown"` (Story 1.9). */
  readonly bmadVersion?: string;
  /** Override the canonical state.yaml path. Defaults to `STATE_PATH`. */
  readonly statePath?: string;
  /** Lock options forwarded to `acquire(...)`. */
  readonly lockOptions?: LockOptions;
}

interface ArtifactRecord {
  readonly step: string;
  readonly epic: number;
  readonly story: string;
  readonly completedAt: string;
}

const FRONTMATTER_OPEN = "---";
const ARTIFACT_GLOBS: ReadonlyArray<string> = [
  "_bmad-output/planning-artifacts/*.md",
  "_bmad-output/implementation-artifacts/*.md",
];

/**
 * Extracts the YAML frontmatter block from an `.md` file's text. Returns
 * `null` when the file does not start with `---\n` or the closing `---`
 * delimiter is missing — both cases mean "no frontmatter; skip this file".
 */
function extractFrontmatter(text: string): string | null {
  if (!text.startsWith(`${FRONTMATTER_OPEN}\n`) && text !== FRONTMATTER_OPEN) {
    return null;
  }
  const afterOpen = text.indexOf("\n", FRONTMATTER_OPEN.length);
  if (afterOpen === -1) {
    return null;
  }
  const closeIdx = text.indexOf(`\n${FRONTMATTER_OPEN}`, afterOpen + 1);
  if (closeIdx === -1) {
    return null;
  }
  return text.slice(afterOpen + 1, closeIdx);
}

/**
 * Parses a single `.md` artifact's frontmatter and decides whether it
 * qualifies as a `status: complete | done` record. Returns `null` when the
 * artifact does not qualify (no frontmatter, missing status, status is not
 * `complete | done`, or `last_updated` is missing/non-string).
 */
async function readArtifactRecord(
  filePath: string,
): Promise<ArtifactRecord | null> {
  let text: string;
  try {
    text = await Bun.file(filePath).text();
  } catch {
    return null;
  }
  const fm = extractFrontmatter(text);
  if (fm === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(fm);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const status = obj.status;
  if (status !== "complete" && status !== "done") {
    return null;
  }
  const lastUpdated = obj.last_updated;
  if (typeof lastUpdated !== "string") {
    return null;
  }
  const epicRaw = obj.epic;
  let epic = 0;
  if (typeof epicRaw === "number") {
    epic = epicRaw;
  } else if (typeof epicRaw === "string") {
    const parsedEpic = Number.parseInt(epicRaw, 10);
    if (Number.isFinite(parsedEpic)) {
      epic = parsedEpic;
    }
  }
  const story =
    typeof obj.story_id === "string"
      ? obj.story_id
      : typeof obj.story === "string"
        ? obj.story
        : "";
  const stepNameFromObj = obj.step;
  const stepNameFromKey = obj.story_key;
  const filenameStem = path.basename(filePath, ".md");
  const step =
    typeof stepNameFromObj === "string"
      ? stepNameFromObj
      : typeof stepNameFromKey === "string"
        ? stepNameFromKey
        : filenameStem;
  return {
    step,
    epic,
    story,
    completedAt: lastUpdated,
  };
}

/**
 * Walks `_bmad-output/{planning,implementation}-artifacts/*.md` under the
 * given project root and yields every qualifying `ArtifactRecord`. The
 * scan uses `Bun.Glob.scan(...)`'s async iterator so paths are streamed,
 * never materialised in memory at once (NFR-Sc1).
 */
async function* scanArtifacts(
  projectRoot: string,
): AsyncGenerator<ArtifactRecord> {
  for (const pattern of ARTIFACT_GLOBS) {
    const glob = new Bun.Glob(pattern);
    for await (const rel of glob.scan({ cwd: projectRoot })) {
      const filePath = path.join(projectRoot, rel);
      const record = await readArtifactRecord(filePath);
      if (record !== null) {
        yield record;
      }
    }
  }
}

/**
 * Recompute `state.yaml` from project artifacts. Acquires the lock,
 * builds a fresh `State`, atomic-saves, returns the new value.
 *
 * @throws {LockContentionError} if the lock cannot be acquired.
 * @throws {CorruptStateError}   if Zod validation in `saveState` rejects
 *                                the recomputed shape (should never happen
 *                                for this skeleton; included for forward
 *                                compatibility).
 * @throws {ScopeViolationError} if the `statePath` resolves outside the
 *   allowed write roots.
 */
export async function recomputeState(opts?: RecomputeOptions): Promise<State> {
  const projectRoot = opts?.projectRoot ?? process.cwd();
  const bmadVersion = opts?.bmadVersion ?? "unknown";
  const statePath = opts?.statePath ?? STATE_PATH;
  const handle = await acquire(opts?.lockOptions);
  try {
    const projectName = path.basename(projectRoot);

    let mostRecent: ArtifactRecord | null = null;
    for await (const record of scanArtifacts(projectRoot)) {
      if (mostRecent === null || record.completedAt > mostRecent.completedAt) {
        mostRecent = record;
      }
    }

    const fresh: State = {
      schemaVersion: 1,
      project: { name: projectName, bmadVersion },
      lastSuccessfulStep: mostRecent,
      runHistory: [],
      checkpoints: [],
    };

    await saveState(fresh, handle, { statePath });
    return fresh;
  } finally {
    await handle.release();
  }
}

/**
 * Recompute the would-be `State` shape from project artifacts WITHOUT
 * acquiring the lock and WITHOUT persisting (Story 3.8, FR3, FR52, NFR-R3).
 *
 * Re-uses the same internal helpers as `recomputeState` (`scanArtifacts`,
 * `extractFrontmatter`, `readArtifactRecord`, `ARTIFACT_GLOBS`,
 * `FRONTMATTER_OPEN`); skips the `acquire(...)` call AND skips the
 * `saveState(...)` call. The read-only contract is the foundation for the
 * `--diff-state` audit path.
 *
 * Story 6.x evolution: full DAG-aware, BMAD-skill-aware, verifier-aware
 * recompute will replace BOTH locked + unlocked variants; the function
 * signatures stay the same; the implementation evolves.
 *
 * @throws {Error} surfaces from filesystem reads (rare — `scanArtifacts`
 *   tolerates missing dirs by yielding zero records).
 */
export async function recomputeStateUnlocked(
  opts?: RecomputeOptions,
): Promise<State> {
  const projectRoot = opts?.projectRoot ?? process.cwd();
  const bmadVersion = opts?.bmadVersion ?? "unknown";
  const projectName = path.basename(projectRoot);

  let mostRecent: ArtifactRecord | null = null;
  for await (const record of scanArtifacts(projectRoot)) {
    if (mostRecent === null || record.completedAt > mostRecent.completedAt) {
      mostRecent = record;
    }
  }

  return {
    schemaVersion: 1,
    project: { name: projectName, bmadVersion },
    lastSuccessfulStep: mostRecent,
    runHistory: [],
    checkpoints: [],
  };
}
