/**
 * src/state/paths.ts — Canonical state-file paths (AR11, AR41, AR42).
 *
 * Mid-tier module per AR41: imports the foundational scope constant from
 * `../io/paths.ts` only. Per architecture line 179 (AR11), the canonical
 * `state.yaml` lives at `_bmad-output/.stepper/state.yaml`; the `.bak`
 * sibling is the post-rotation snapshot maintained by `atomicWrite` in
 * `src/io/atomic-write.ts` (Story 1.3).
 *
 * Both constants are **relative to `process.cwd()`**, not absolute. The
 * scope check inside `atomicWrite` (`assertWithinScope` from
 * `src/io/paths.ts`) resolves them against `process.cwd()`. This pattern
 * matches Story 1.4's `LOCK_DIR_REL` constant (also relative).
 *
 * No test file is needed for this module — the paths are pure constant
 * declarations and `src/io/paths.test.ts` already exercises
 * `STEPPER_INTERNAL_ROOT` end-to-end.
 */

import { STEPPER_INTERNAL_ROOT } from "../io/paths.ts";

export const STATE_PATH = `${STEPPER_INTERNAL_ROOT}/state.yaml`;
export const STATE_BAK_PATH = `${STEPPER_INTERNAL_ROOT}/state.yaml.bak`;
