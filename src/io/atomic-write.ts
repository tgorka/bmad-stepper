/**
 * src/io/atomic-write.ts — Atomic tmp+rename writer with .bak rotation
 * (NFR-S5, NFR-R1, AR42, architecture §D10).
 *
 * Foundational module per AR41. Allowed sibling import: `./paths.ts`. Allowed
 * `node:*` standard-library import: `node:fs/promises` for `fs.rename` /
 * `fs.unlink` / `fs.access`. Bun's native `Bun.write` is used for the tmp
 * write itself per AR33's "Bun-native APIs preferred".
 *
 * Algorithm (verbatim from architecture §D10 lines 399–403):
 *   1. assertWithinScope(targetPath) — fail loudly if outside allowed roots.
 *   2. Compute tmpPath = targetPath + ".tmp" and bakPath = targetPath + ".bak".
 *   3. If targetPath exists, rename(targetPath, bakPath) — `.bak` rotation
 *      kept for one cycle (the prior `.bak` is overwritten).
 *   4. Write contents to tmpPath via Bun.write.
 *   5. rename(tmpPath, targetPath) — atomic on POSIX (single filesystem).
 *   6. Leave `.bak` in place; the next call rotates it.
 */

import * as fs from "node:fs/promises";
import { assertWithinScope } from "./paths.ts";

/**
 * Writes `contents` to `targetPath` atomically. Throws
 * `PathologicalInputError` (via `assertWithinScope`) if the target is outside
 * the allowed roots. Filesystem errors propagate to the caller; the partial
 * `.tmp` file is removed best-effort on rename failure to avoid stale tmp
 * accumulation. The `.bak` file (if any) is intentionally left in place after
 * a successful write — that one-cycle retention is the safety buffer per
 * NFR-R1 / architecture §D10 line 403.
 */
export async function atomicWrite(
  targetPath: string,
  contents: string | Uint8Array,
): Promise<void> {
  assertWithinScope(targetPath);

  const tmpPath = `${targetPath}.tmp`;
  const bakPath = `${targetPath}.bak`;

  // Step 3: rotate the existing canonical file into .bak (overwriting any
  // prior .bak — one-cycle retention only). ENOENT is the first-write case
  // and is silently swallowed.
  try {
    await fs.rename(targetPath, bakPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw err;
    }
  }

  // Step 4: write contents to the .tmp sidecar.
  try {
    await Bun.write(tmpPath, contents);
  } catch (err) {
    // Best-effort cleanup of any partial tmp; ignore secondary failures.
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }

  // Step 5: atomic rename .tmp → canonical path.
  try {
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}
