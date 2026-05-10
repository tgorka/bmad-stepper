/**
 * src/upgrade/render.test.ts — coverage for `renderUpgradeReport`
 * (Story 6.9 — RENDER_69_*).
 *
 * Pure-function tests; no IO; no AR35 tmpdir needed (the renderer does
 * not touch the filesystem). The renderer is deterministic — same input
 * yields byte-identical output.
 *
 * AC mapping:
 *   - AC-1 (version diff + CHANGELOG link + BMAD compat + hint):
 *     RENDER_69_LAYOUT_HEADERS_UPGRADE_AVAILABLE_*,
 *     RENDER_69_VERSION_DIFF_*, RENDER_69_CHANGELOG_LINK_*,
 *     RENDER_69_BMAD_COMPAT_*, RENDER_69_HINT_BYTE_IDENTICAL_*.
 *   - Anti-PII (defence-in-depth at the renderer): RENDER_69_NO_PII_*.
 *   - Determinism: RENDER_69_DETERMINISTIC_*.
 */

import { describe, expect, it } from "bun:test";
import type { UpgradeCheckResult } from "./check.ts";
import { renderUpgradeReport } from "./render.ts";

function makeUpgradeAvailable(
  overrides?: Partial<
    Extract<UpgradeCheckResult, { kind: "upgrade-available" }>
  >,
): UpgradeCheckResult {
  return {
    kind: "upgrade-available",
    currentVersion: "0.1.0",
    latestVersion: "0.2.0",
    changelogUrl: "https://github.com/tgorka/bmad-stepper/releases/tag/v0.2.0",
    bmadCompat: "v6.5.x",
    ...overrides,
  };
}

function makeUpToDate(
  overrides?: Partial<Extract<UpgradeCheckResult, { kind: "up-to-date" }>>,
): UpgradeCheckResult {
  return {
    kind: "up-to-date",
    currentVersion: "0.1.0",
    latestVersion: "0.1.0",
    ...overrides,
  };
}

// AC-1 verbatim hint per epics.md line 1288 — byte-identical assertion target.
const AC_1_HINT =
  "Run /plugin marketplace update tgorka/bmad-stepper to upgrade.";

const FORBIDDEN_PII_SUBSTRINGS = [
  "password",
  "apikey",
  "secret",
  "email",
  "token",
  "homedir",
];

describe("renderUpgradeReport — AC-1 LAYOUT_HEADERS (upgrade-available)", () => {
  it("RENDER_69_LAYOUT_HEADERS_UPGRADE_AVAILABLE_1: H1 + 4 bullet lines + hint in canonical order", () => {
    const out = renderUpgradeReport(makeUpgradeAvailable());
    const lines = out.split("\n");
    expect(lines[0]).toBe("# Stepper Upgrade Check");
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^- Current version: /);
    expect(lines[3]).toMatch(/^- Latest version: /);
    expect(lines[4]).toMatch(/^- CHANGELOG: /);
    expect(lines[5]).toMatch(/^- BMAD compatibility \(latest\): /);
    expect(lines[6]).toBe("");
    expect(lines[7]).toBe(AC_1_HINT);
  });
});

describe("renderUpgradeReport — LAYOUT_UP_TO_DATE", () => {
  it("RENDER_69_LAYOUT_UP_TO_DATE_1: H1 + confirmation line; hint NOT present", () => {
    const out = renderUpgradeReport(makeUpToDate({ currentVersion: "0.1.0" }));
    expect(out).toContain("# Stepper Upgrade Check");
    expect(out).toContain("You are on the latest version (0.1.0).");
    expect(out).not.toContain(AC_1_HINT);
  });
});

describe("renderUpgradeReport — VERSION_DIFF", () => {
  it("RENDER_69_VERSION_DIFF_1: both currentVersion and latestVersion appear", () => {
    const out = renderUpgradeReport(
      makeUpgradeAvailable({ currentVersion: "0.1.0", latestVersion: "0.2.0" }),
    );
    expect(out).toContain("- Current version: 0.1.0");
    expect(out).toContain("- Latest version: 0.2.0");
  });
});

describe("renderUpgradeReport — CHANGELOG_LINK", () => {
  it("RENDER_69_CHANGELOG_LINK_1: changelogUrl appears verbatim", () => {
    const url = "https://github.com/tgorka/bmad-stepper/releases/tag/v0.2.0";
    const out = renderUpgradeReport(
      makeUpgradeAvailable({ changelogUrl: url }),
    );
    expect(out).toContain(`- CHANGELOG: ${url}`);
  });
});

describe("renderUpgradeReport — BMAD_COMPAT", () => {
  it("RENDER_69_BMAD_COMPAT_PRESENT_1: bmadCompat 'v6.5.x' appears in BMAD compatibility line", () => {
    const out = renderUpgradeReport(
      makeUpgradeAvailable({ bmadCompat: "v6.5.x" }),
    );
    expect(out).toContain("- BMAD compatibility (latest): v6.5.x");
  });

  it("RENDER_69_BMAD_COMPAT_MISSING_1: undefined bmadCompat → fallback rendered", () => {
    const out = renderUpgradeReport(
      makeUpgradeAvailable({ bmadCompat: undefined }),
    );
    expect(out).toContain(
      "- BMAD compatibility (latest): (BMAD compat info not present in release notes)",
    );
  });
});

describe("renderUpgradeReport — HINT_BYTE_IDENTICAL", () => {
  it("RENDER_69_HINT_BYTE_IDENTICAL_1: AC-1 hint substring matches verbatim", () => {
    const out = renderUpgradeReport(makeUpgradeAvailable());
    expect(out).toContain(AC_1_HINT);
  });
});

describe("renderUpgradeReport — NO_PII", () => {
  it("RENDER_69_NO_PII_1: no forbidden PII substrings in upgrade-available output", () => {
    const out = renderUpgradeReport(makeUpgradeAvailable()).toLowerCase();
    for (const forbidden of FORBIDDEN_PII_SUBSTRINGS) {
      expect(out).not.toContain(forbidden);
    }
  });

  it("RENDER_69_NO_PII_2: no forbidden PII substrings in up-to-date output", () => {
    const out = renderUpgradeReport(makeUpToDate()).toLowerCase();
    for (const forbidden of FORBIDDEN_PII_SUBSTRINGS) {
      expect(out).not.toContain(forbidden);
    }
  });
});

describe("renderUpgradeReport — DETERMINISTIC", () => {
  it("RENDER_69_DETERMINISTIC_1: same input yields byte-identical output (upgrade-available)", () => {
    const input = makeUpgradeAvailable();
    expect(renderUpgradeReport(input)).toBe(renderUpgradeReport(input));
  });

  it("RENDER_69_DETERMINISTIC_2: same input yields byte-identical output (up-to-date)", () => {
    const input = makeUpToDate();
    expect(renderUpgradeReport(input)).toBe(renderUpgradeReport(input));
  });
});

describe("renderUpgradeReport — trailing newline", () => {
  it("RENDER_69_TRAILING_NEWLINE_1: output ends with single \\n (upgrade-available)", () => {
    const out = renderUpgradeReport(makeUpgradeAvailable());
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("RENDER_69_TRAILING_NEWLINE_2: output ends with single \\n (up-to-date)", () => {
    const out = renderUpgradeReport(makeUpToDate());
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});
