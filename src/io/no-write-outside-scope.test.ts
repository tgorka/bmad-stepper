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
 *
 * Story 1.6 Task 6.4 migrated the throw site from `PathologicalInputError`
 * to `ScopeViolationError`; assertions track the migration.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ScopeViolationError } from "../errors.ts";
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
  // Forbidden-path tests must use absolute paths that resolve OUTSIDE all
  // allowed roots (stepper internal, _bmad-output, os.tmpdir()). Using
  // relative paths here would resolve against process.cwd() — and on
  // Linux runners process.cwd() is the fauxProjectRoot which lives inside
  // os.tmpdir() (an allowed root), so the assertion would silently
  // succeed on macOS (where mkdtemp returns /private/var/folders/... but
  // os.tmpdir() returns /var/folders/...) yet fail on Linux (where both
  // collapse to /tmp). Using `originalCwd` (the actual repo root) anchors
  // the test paths outside tmpdir on every platform.
  it("rejects writes outside the project root and outside os.tmpdir()", async () => {
    await expect(
      atomicWrite("/etc/no-such-stepper-attempt-must-fail", "evil-contents"),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects writes under _bmad/ (read-only installed-files dir per AR42)", async () => {
    await expect(
      atomicWrite(
        path.join(originalCwd, "_bmad", "config.yaml"),
        "evil override",
      ),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects writes under ~/.claude/plugins/ (tilde literal, no expansion)", async () => {
    await expect(
      atomicWrite(path.join(originalCwd, "~/.claude/plugins/x.json"), "evil"),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects ../-traversal escapes after path.resolve()", async () => {
    // Construct an absolute path that, after `..` traversal, escapes
    // outside every allowed root. `originalCwd` (repo root) is not
    // inside tmpdir on any platform, so the resolved target lands in
    // a non-allowed location.
    await expect(
      atomicWrite(
        path.join(originalCwd, "_bmad-output", "..", "..", "etc", "passwd"),
        "evil",
      ),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });
});

describe("no-write-outside-scope — post-condition: nothing leaked outside scope", () => {
  it("after a forbidden write attempt, no file appears at the forbidden path", async () => {
    const forbiddenPath = path.join(originalCwd, "_bmad", "config.yaml");
    try {
      await atomicWrite(forbiddenPath, "evil");
    } catch {
      // expected
    }
    // The forbidden write must NOT have created a `.tmp` sidecar at the
    // attempted path. (We do not assert the canonical path is missing —
    // `_bmad/` exists in the repo as the read-only installed-files dir
    // per AR42 and may already contain `config.yaml` for other reasons.)
    expect(
      await fs
        .access(`${forbiddenPath}.tmp`)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });
});
