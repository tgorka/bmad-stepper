/**
 * src/io/atomic-write.test.ts — first-write, second-write, third-write,
 * scope-check, and binary-contents assertions (AC-3, NFR-R1, NFR-S5).
 *
 * Tests use a unique tmpdir per `it(...)` block per AR35 and clean up in
 * `afterEach`. They MUST NOT touch `_bmad-output/` (the real project's
 * output directory). The integration test (separate file) covers the
 * project-root flow inside a faux project chdir.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PathologicalInputError } from "../errors.ts";
import { atomicWrite } from "./atomic-write.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-atomic-write-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("atomicWrite — first write (no prior file)", () => {
  it("creates the canonical file with the expected contents", async () => {
    const target = path.join(tmpDir, "foo.yaml");
    await atomicWrite(target, "schemaVersion: 1\n");
    expect(await Bun.file(target).text()).toBe("schemaVersion: 1\n");
  });

  it("does NOT create a .bak file (no prior file to back up)", async () => {
    const target = path.join(tmpDir, "foo.yaml");
    await atomicWrite(target, "first contents");
    expect(await pathExists(`${target}.bak`)).toBe(false);
  });

  it("does NOT leave a .tmp file behind", async () => {
    const target = path.join(tmpDir, "foo.yaml");
    await atomicWrite(target, "first contents");
    expect(await pathExists(`${target}.tmp`)).toBe(false);
  });
});

describe("atomicWrite — second write (existing file rotates to .bak)", () => {
  it("creates .bak holding the prior canonical contents", async () => {
    const target = path.join(tmpDir, "foo.yaml");
    await atomicWrite(target, "v1 contents");
    await atomicWrite(target, "v2 contents");

    expect(await Bun.file(target).text()).toBe("v2 contents");
    expect(await pathExists(`${target}.bak`)).toBe(true);
    expect(await Bun.file(`${target}.bak`).text()).toBe("v1 contents");
  });

  it("does NOT leave a .tmp file behind after the second write", async () => {
    const target = path.join(tmpDir, "foo.yaml");
    await atomicWrite(target, "v1 contents");
    await atomicWrite(target, "v2 contents");
    expect(await pathExists(`${target}.tmp`)).toBe(false);
  });
});

describe("atomicWrite — third write (.bak rotation kept for one cycle)", () => {
  it("overwrites the prior .bak (one-cycle retention only — NFR-R1)", async () => {
    const target = path.join(tmpDir, "foo.yaml");
    await atomicWrite(target, "v1 contents");
    await atomicWrite(target, "v2 contents");
    await atomicWrite(target, "v3 contents");

    expect(await Bun.file(target).text()).toBe("v3 contents");
    // .bak now holds v2 (the just-replaced version), NOT v1.
    expect(await Bun.file(`${target}.bak`).text()).toBe("v2 contents");
  });
});

describe("atomicWrite — scope-violation behaviour", () => {
  it("throws PathologicalInputError when target is outside allowed roots", async () => {
    expect(
      atomicWrite(
        "/etc/no-such-stepper-target-that-must-fail-scope-check",
        "evil",
      ),
    ).rejects.toBeInstanceOf(PathologicalInputError);
  });

  it("does NOT create any file when scope check rejects", async () => {
    try {
      await atomicWrite("/etc/no-such-target-2", "evil");
    } catch {
      // expected
    }
    expect(await pathExists("/etc/no-such-target-2")).toBe(false);
    expect(await pathExists("/etc/no-such-target-2.tmp")).toBe(false);
    expect(await pathExists("/etc/no-such-target-2.bak")).toBe(false);
  });
});

describe("atomicWrite — binary contents", () => {
  it("round-trips a Uint8Array via Bun.file().bytes()", async () => {
    const target = path.join(tmpDir, "foo.bin");
    const payload = new Uint8Array([1, 2, 3, 4, 250, 0, 99]);
    await atomicWrite(target, payload);

    const readBack = await Bun.file(target).bytes();
    expect(readBack.length).toBe(payload.length);
    for (const [index, expected] of payload.entries()) {
      expect(readBack[index]).toBe(expected);
    }
  });
});

describe("atomicWrite — atomicity smoke test", () => {
  it("immediately readable after await resolves with new contents", async () => {
    const target = path.join(tmpDir, "atomic-smoke.yaml");
    await atomicWrite(target, "after-rename-readable");
    // Reading right after the await — POSIX rename is atomic so the new
    // contents are visible immediately, not partially.
    expect(await Bun.file(target).text()).toBe("after-rename-readable");
  });
});
