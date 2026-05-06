/**
 * src/telemetry/rotate.test.ts — `rotateOldTelemetry` Story 6.8 coverage.
 *
 * AR35 tmpdir-per-test discipline. Tests cover: AC-2 (12-month threshold),
 * AC-3 (idempotency), edge cases (foreign-file skip per OQ-7,
 * paired jsonl+md, no-dir, age-override, scope-violation, best-effort).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as log from "../io/log.ts";
import {
  rotateOldTelemetry,
  TELEMETRY_AGE_THRESHOLD_MS_12M,
} from "./rotate.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-rotate-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

async function writeFileWithMtime(
  filePath: string,
  content: string,
  mtime: Date,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  const sec = mtime.getTime() / 1000;
  await fs.utimes(filePath, sec, sec);
}

describe("rotateOldTelemetry — ROTATE_68_BASIC_1 (AC-2)", () => {
  it("moves jsonl + md files older than 12 months to .archive/", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    // Files older than 12m.
    const oldMtime = new Date("2024-04-01T00:00:00Z");
    // Files younger than 12m.
    const newMtime = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    await writeFileWithMtime(path.join(root, "2024-04.jsonl"), "{}", oldMtime);
    await writeFileWithMtime(
      path.join(root, "2024-04.md"),
      "# old report",
      oldMtime,
    );
    await writeFileWithMtime(path.join(root, "2026-04.jsonl"), "{}", newMtime);

    const result = await rotateOldTelemetry({ telemetryRoot: root, now });

    expect(result.rotatedCount).toBe(2);
    await expect(
      fs.access(path.join(root, ".archive", "2024-04.jsonl")),
    ).resolves.toBeNull();
    await expect(
      fs.access(path.join(root, ".archive", "2024-04.md")),
    ).resolves.toBeNull();
    await expect(
      fs.access(path.join(root, "2026-04.jsonl")),
    ).resolves.toBeNull();
  });
});

describe("rotateOldTelemetry — ROTATE_68_PAIRED_1", () => {
  it("rotates both jsonl and md for the same period when both old", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    const oldMtime = new Date("2024-01-01T00:00:00Z");

    await writeFileWithMtime(path.join(root, "2024-01.jsonl"), "{}", oldMtime);
    await writeFileWithMtime(path.join(root, "2024-01.md"), "# x", oldMtime);

    const result = await rotateOldTelemetry({ telemetryRoot: root, now });

    expect(result.rotatedCount).toBe(2);
  });
});

describe("rotateOldTelemetry — ROTATE_68_FOREIGN_FILE_SKIP_1 (OQ-7)", () => {
  it("does NOT move foreign files like notes.txt even when old", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    const oldMtime = new Date("2024-01-01T00:00:00Z");

    await writeFileWithMtime(path.join(root, "notes.txt"), "x", oldMtime);
    await writeFileWithMtime(path.join(root, ".DS_Store"), "y", oldMtime);

    const result = await rotateOldTelemetry({ telemetryRoot: root, now });

    expect(result.rotatedCount).toBe(0);
    // Foreign files left alone.
    await expect(fs.access(path.join(root, "notes.txt"))).resolves.toBeNull();
  });
});

describe("rotateOldTelemetry — ROTATE_68_THRESHOLD_1", () => {
  it("uses strict `>` threshold (file at exactly 12m is NOT moved)", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    const exactMtime = new Date(now.getTime() - TELEMETRY_AGE_THRESHOLD_MS_12M);

    await writeFileWithMtime(
      path.join(root, "2025-05.jsonl"),
      "{}",
      exactMtime,
    );

    const result = await rotateOldTelemetry({ telemetryRoot: root, now });

    expect(result.rotatedCount).toBe(0);
  });
});

describe("rotateOldTelemetry — ROTATE_68_IDEMPOTENT_1 (AC-3)", () => {
  it("is idempotent — second call rotates 0 files", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    const oldMtime = new Date("2024-01-01T00:00:00Z");

    await writeFileWithMtime(path.join(root, "2024-01.jsonl"), "{}", oldMtime);
    await writeFileWithMtime(path.join(root, "2024-01.md"), "x", oldMtime);

    const first = await rotateOldTelemetry({ telemetryRoot: root, now });
    const second = await rotateOldTelemetry({ telemetryRoot: root, now });

    expect(first.rotatedCount).toBe(2);
    expect(second.rotatedCount).toBe(0);
  });
});

describe("rotateOldTelemetry — ROTATE_68_SKIP_ARCHIVE_DIR_1", () => {
  it("does NOT recurse into .archive/", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    const oldMtime = new Date("2024-01-01T00:00:00Z");

    await writeFileWithMtime(
      path.join(root, ".archive", "2024-01.jsonl"),
      "{}",
      oldMtime,
    );

    const result = await rotateOldTelemetry({ telemetryRoot: root, now });

    expect(result.rotatedCount).toBe(0);
    // The pre-archived file is left in place.
    await expect(
      fs.access(path.join(root, ".archive", "2024-01.jsonl")),
    ).resolves.toBeNull();
  });
});

describe("rotateOldTelemetry — ROTATE_68_NO_DIR_1", () => {
  it("returns no-op when telemetryRoot does not exist", async () => {
    const result = await rotateOldTelemetry({
      telemetryRoot: path.join(tmp, "missing"),
    });
    expect(result).toEqual({ rotatedCount: 0, rotatedFiles: [] });
  });
});

describe("rotateOldTelemetry — ROTATE_68_AGE_OVERRIDE_1", () => {
  it("honours custom ageThresholdMs (test seam)", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    const fiveSecondsAgo = new Date(now.getTime() - 5_000);

    await writeFileWithMtime(
      path.join(root, "2026-04.jsonl"),
      "{}",
      fiveSecondsAgo,
    );

    const result = await rotateOldTelemetry({
      telemetryRoot: root,
      now,
      ageThresholdMs: 1_000,
    });

    expect(result.rotatedCount).toBe(1);
  });
});

describe("rotateOldTelemetry — ROTATE_68_OUT_OF_SCOPE_1", () => {
  it("returns no-op when telemetryRoot is outside any allowed scope (no-dir)", async () => {
    const result = await rotateOldTelemetry({
      telemetryRoot: "/etc/stepper-rotate-out-of-scope",
    });
    expect(result.rotatedCount).toBe(0);
  });
});

describe("rotateOldTelemetry — ROTATE_68_BEST_EFFORT_1", () => {
  it("continues loop when one rename fails (best-effort)", async () => {
    const root = path.join(tmp, "telemetry");
    const now = new Date("2026-04-30T12:00:00Z");
    const oldMtime = new Date("2024-01-01T00:00:00Z");

    await writeFileWithMtime(path.join(root, "2024-01.jsonl"), "{}", oldMtime);
    await writeFileWithMtime(path.join(root, "2024-02.jsonl"), "{}", oldMtime);

    const warnSpy = spyOn(log, "warn");

    // Pre-create destination dir-as-file conflict for 2024-01.jsonl.
    const destA = path.join(root, ".archive", "2024-01.jsonl");
    await fs.mkdir(destA, { recursive: true });
    await fs.writeFile(path.join(destA, "sentinel"), "x");

    const result = await rotateOldTelemetry({ telemetryRoot: root, now });

    // One file fails; the other succeeds.
    expect(result.rotatedCount).toBe(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
