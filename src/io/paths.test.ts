/**
 * src/io/paths.test.ts — `assertWithinScope` allow + violation cases (AC-2).
 *
 * Pure path-string assertions; no IO. Uses `os.tmpdir()` for the third
 * allowed-root check (AR35 — tests use unique tmpdirs in real IO tests).
 */

import { describe, expect, it } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { PathologicalInputError } from "../errors.ts";
import { assertWithinScope } from "./paths.ts";

describe("assertWithinScope — allowed roots", () => {
  it("allows _bmad-output/.stepper/state.yaml (Stepper internal)", () => {
    expect(() =>
      assertWithinScope("_bmad-output/.stepper/state.yaml"),
    ).not.toThrow();
  });

  it("allows _bmad-output/planning-artifacts/architecture.md", () => {
    expect(() =>
      assertWithinScope("_bmad-output/planning-artifacts/architecture.md"),
    ).not.toThrow();
  });

  it("allows nested paths under os.tmpdir()", () => {
    const tmpTarget = path.join(os.tmpdir(), "stepper-scope-allow", "foo.yaml");
    expect(() => assertWithinScope(tmpTarget)).not.toThrow();
  });

  it("allows the os.tmpdir() root itself", () => {
    expect(() => assertWithinScope(os.tmpdir())).not.toThrow();
  });

  it("allows the _bmad-output root itself", () => {
    expect(() => assertWithinScope("_bmad-output")).not.toThrow();
  });
});

describe("assertWithinScope — forbidden roots", () => {
  it("rejects /etc/passwd (system path, outside all allowed roots)", () => {
    expect(() => assertWithinScope("/etc/passwd")).toThrow(
      PathologicalInputError,
    );
  });

  it("rejects _bmad/config.yaml (BMAD installed-files dir is read-only per AR42)", () => {
    expect(() => assertWithinScope("_bmad/config.yaml")).toThrow(
      PathologicalInputError,
    );
  });

  it("rejects _bmad-output/../etc/passwd (..-traversal escape)", () => {
    expect(() => assertWithinScope("_bmad-output/../../etc/passwd")).toThrow(
      PathologicalInputError,
    );
  });

  it("rejects ~/.claude/plugins/x.json (tilde literal, no expansion)", () => {
    // path.resolve does not expand `~`; the literal `~` becomes a child of cwd
    // which is outside _bmad-output/ and outside os.tmpdir(), so this rejects.
    expect(() => assertWithinScope("~/.claude/plugins/foo.json")).toThrow(
      PathologicalInputError,
    );
  });

  it("thrown error carries PATHOLOGICAL_INPUT code (registered SCOPE_VIOLATION-class)", () => {
    try {
      assertWithinScope("/etc/passwd");
      throw new Error("expected assertWithinScope to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PathologicalInputError);
      const stepperErr = err as PathologicalInputError;
      expect(stepperErr.code).toBe("PATHOLOGICAL_INPUT");
      expect(stepperErr.exitCode).toBe(5);
      expect(stepperErr.message).toMatch(/SCOPE_VIOLATION/);
    }
  });
});
