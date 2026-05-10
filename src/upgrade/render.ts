/**
 * src/upgrade/render.ts — `--upgrade` flow report renderer
 * (Story 6.9 — FR48; AR41, AR21, AR33).
 *
 * **MID-TIER MODULE per AR41**. Pure renderer — ZERO IO; returns a
 * markdown-style human-readable string. The consumer (cli.ts +
 * runner-tier wiring at next/run.ts) writes the output to STDOUT.
 *
 * **Two layouts** per AC-1 verbatim:
 *   - `kind: "upgrade-available"` → emits H1 + version diff + CHANGELOG
 *     link + BMAD compatibility line + the AC-1 verbatim hint.
 *   - `kind: "up-to-date"` → emits H1 + a single confirmation line; no
 *     hint (no upgrade action needed).
 *
 * **AC-1 verbatim hint string** (epics.md line 1288 — byte-identical):
 *   `Run /plugin marketplace update tgorka/bmad-stepper to upgrade.`
 *
 * **BMAD compat fallback** (per OQ-4): when `bmadCompat === undefined`,
 * the renderer emits `(BMAD compat info not present in release notes)`
 * so the user sees a deterministic placeholder instead of a missing line.
 *
 * **AR21 audit-notice carve-out**: this is a USER-FACING REPORT (per
 * OQ-5 — the AR9 carve-out routes the report to STDOUT directly), NOT
 * an audit notice. AR21 governs single-line audit notices; this renderer
 * deliberately emits a multi-line markdown-style document.
 *
 * **Deterministic**: same input always yields the same output (no
 * timestamps, no random values, no sort-instability). Tests verify this
 * via `RENDER_69_DETERMINISTIC_*`.
 *
 * Architecture cross-references:
 *   - architecture.md §D14 lines 645-660 (read-only `--upgrade` design).
 *   - epics.md §Story-6.9 lines 1284-1292 (AC-1 verbatim hint).
 */

import type { UpgradeCheckResult } from "./check.ts";

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * AC-1 verbatim hint per epics.md line 1288. BYTE-IDENTICAL — this
 * string is asserted via `RENDER_69_HINT_BYTE_IDENTICAL_*` and
 * `UPGRADE_69_RUN_SHORT_CIRCUIT_*`. Any drift here is a regression.
 */
const UPGRADE_HINT =
  "Run /plugin marketplace update tgorka/bmad-stepper to upgrade.";

/**
 * Fallback rendered for the BMAD compatibility line when the GitHub
 * release body does NOT contain a `## BMAD Compatibility — vX.Y.x`
 * heading (per OQ-4). The string is deterministic so tests can assert
 * byte-identical content.
 */
const BMAD_COMPAT_MISSING_TEXT =
  "(BMAD compat info not present in release notes)";

// ─── Public surface ───────────────────────────────────────────────────────

/**
 * Pure renderer for the `--upgrade` flow report. Returns a
 * markdown-style human-readable string with a trailing newline.
 *
 * **Upgrade-available layout** (AC-1):
 * ```
 * # Stepper Upgrade Check
 *
 * - Current version: <currentVersion>
 * - Latest version: <latestVersion>
 * - CHANGELOG: <changelogUrl>
 * - BMAD compatibility (latest): <bmadCompat OR fallback>
 *
 * Run /plugin marketplace update tgorka/bmad-stepper to upgrade.
 * ```
 *
 * **Up-to-date layout**:
 * ```
 * # Stepper Upgrade Check
 *
 * You are on the latest version (<currentVersion>).
 * ```
 *
 * Both layouts end with a single trailing `\n`.
 *
 * @param input - The `UpgradeCheckResult` discriminated union.
 * @returns A markdown-style human-readable string.
 */
export function renderUpgradeReport(input: UpgradeCheckResult): string {
  if (input.kind === "upgrade-available") {
    const bmadCompatText = input.bmadCompat ?? BMAD_COMPAT_MISSING_TEXT;
    return [
      "# Stepper Upgrade Check",
      "",
      `- Current version: ${input.currentVersion}`,
      `- Latest version: ${input.latestVersion}`,
      `- CHANGELOG: ${input.changelogUrl}`,
      `- BMAD compatibility (latest): ${bmadCompatText}`,
      "",
      UPGRADE_HINT,
      "",
    ].join("\n");
  }
  return [
    "# Stepper Upgrade Check",
    "",
    `You are on the latest version (${input.currentVersion}).`,
    "",
  ].join("\n");
}
