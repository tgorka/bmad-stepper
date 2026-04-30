/**
 * src/io/no-write-outside-scope.test.ts — Cross-module integration test
 * for the NFR-S2 / AR42 persistence boundary (AR36 release-blocker gate).
 *
 * This is the project's first cross-module integration test. It exercises
 * `atomicWrite` (which delegates to `assertWithinScope`) against both
 * allowed and forbidden roots, using a unique tmpdir as a faux project
 * root for the `_bmad-output/.stepper/**` and `_bmad-output/**` allowed
 * cases (so the real `_bmad-output/` is never touched per AR35).
 *
 * Per the user's task instruction this file lives at
 * `src/io/no-write-outside-scope.test.ts` (not `src/integration/`).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PathologicalInputError } from "../errors.ts";
import { atomicWrite } from "./atomic-write.ts";

let fauxProjectRoot: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  fauxProjectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "stepper-no-write-outside-scope-"),
  );
  process.chdir(fauxProjectRoot);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(fauxProjectRoot, { recursive: true, force: true });
});

describe("no-write-outside-scope — allowed roots", () => {
  it("allows writes under _bmad-output/.stepper/", async () => {
    await fs.mkdir("_bmad-output/.stepper", { recursive: true });
    await atomicWrite("_bmad-output/.stepper/state.yaml", "schemaVersion: 1\n");
    expect(await Bun.file("_bmad-output/.stepper/state.yaml").text()).toBe(
      "schemaVersion: 1\n",
    );
  });

  it("allows writes under _bmad-output/", async () => {
    await fs.mkdir("_bmad-output", { recursive: true });
    await atomicWrite("_bmad-output/foo.md", "# hello\n");
    expect(await Bun.file("_bmad-output/foo.md").text()).toBe("# hello\n");
  });

  it("allows writes inside the os.tmpdir() root", async () => {
    const tmpTarget = path.join(
      os.tmpdir(),
      `stepper-tmpdir-write-${Date.now()}.txt`,
    );
    try {
      await atomicWrite(tmpTarget, "tmp-allowed");
      expect(await Bun.file(tmpTarget).text()).toBe("tmp-allowed");
    } finally {
      await fs.unlink(tmpTarget).catch(() => {});
      await fs.unlink(`${tmpTarget}.bak`).catch(() => {});
    }
  });
});

describe("no-write-outside-scope — forbidden roots", () => {
  it("rejects writes outside the project root and outside os.tmpdir()", async () => {
    expect(
      atomicWrite("/etc/no-such-stepper-attempt-must-fail", "evil-contents"),
    ).rejects.toBeInstanceOf(PathologicalInputError);
  });

  it("rejects writes under _bmad/ (read-only installed-files dir per AR42)", async () => {
    expect(
      atomicWrite("_bmad/config.yaml", "evil override"),
    ).rejects.toBeInstanceOf(PathologicalInputError);
  });

  it("rejects writes under ~/.claude/plugins/ (tilde literal, no expansion)", async () => {
    expect(
      atomicWrite("~/.claude/plugins/x.json", "evil"),
    ).rejects.toBeInstanceOf(PathologicalInputError);
  });

  it("rejects ../-traversal escapes after path.resolve()", async () => {
    expect(
      atomicWrite("_bmad-output/../../etc/passwd", "evil"),
    ).rejects.toBeInstanceOf(PathologicalInputError);
  });
});

describe("no-write-outside-scope — post-condition: nothing leaked outside scope", () => {
  it("after a forbidden write attempt, no file appears at the forbidden path", async () => {
    try {
      await atomicWrite("_bmad/config.yaml", "evil");
    } catch {
      // expected
    }
    // Project root has no _bmad/ directory at all (faux project root is empty).
    expect(
      await fs
        .access(path.join(fauxProjectRoot, "_bmad", "config.yaml"))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });
});
