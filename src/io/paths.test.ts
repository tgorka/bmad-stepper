/**
 * src/io/paths.test.ts — `assertWithinScope` allow + violation cases (AC-2).
 *
 * Pure path-string assertions; no IO. Uses `os.tmpdir()` for the third
 * allowed-root check (AR35 — tests use unique tmpdirs in real IO tests).
 *
 * After Story 1.6 Task 6.4 the throw site routes through
 * `ScopeViolationError` (registered in Story 1.5); the assertions reflect
 * the migrated class + code.
 */

import { describe, expect, it } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { ScopeViolationError } from "../errors.ts";
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
    expect(() => assertWithinScope("/etc/passwd")).toThrow(ScopeViolationError);
  });

  it("rejects _bmad/config.yaml (BMAD installed-files dir is read-only per AR42)", () => {
    expect(() => assertWithinScope("_bmad/config.yaml")).toThrow(
      ScopeViolationError,
    );
  });

  it("rejects _bmad-output/../etc/passwd (..-traversal escape)", () => {
    expect(() => assertWithinScope("_bmad-output/../../etc/passwd")).toThrow(
      ScopeViolationError,
    );
  });

  it("rejects ~/.claude/plugins/x.json (tilde literal, no expansion)", () => {
    // path.resolve does not expand `~`; the literal `~` becomes a child of cwd
    // which is outside _bmad-output/ and outside os.tmpdir(), so this rejects.
    expect(() => assertWithinScope("~/.claude/plugins/foo.json")).toThrow(
      ScopeViolationError,
    );
  });

  it("thrown error carries SCOPE_VIOLATION code (Story 1.6 Task 6.4 migration)", () => {
    try {
      assertWithinScope("/etc/passwd");
      throw new Error("expected assertWithinScope to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ScopeViolationError);
      const stepperErr = err as ScopeViolationError;
      expect(stepperErr.code).toBe("SCOPE_VIOLATION");
      expect(stepperErr.exitCode).toBe(5);
      expect(stepperErr.message).toMatch(/SCOPE_VIOLATION/);
    }
  });
});
