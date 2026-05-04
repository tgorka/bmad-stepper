/**
 * src/errors.test.ts — Registry CI gate (AR22).
 *
 * Enumerates `errorRegistry`, instantiates each concrete subclass with a
 * synthetic message, and asserts:
 *   (a) every actionableHint is non-empty
 *   (b) every hint matches /^.*(Run|See|Try|Check) /
 *   (c) every code is unique
 *   (d) every exitCode ∈ {0,1,2,3,4,5}
 * plus the AC-2 fixed-list assertion (16 codes registered — the AC-2
 * baseline of 15 plus `SCOPE_VIOLATION` added in Story 1.5).
 *
 * This test is the FIRST source-code test of the project and the FIRST
 * release-blocker gate enforced by `bun run check` (AR36).
 */

import { describe, expect, it } from "bun:test";
import {
  errorRegistry,
  StepperError,
  type StepperErrorCode,
} from "./errors.ts";

const REQUIRED_CODES: ReadonlyArray<StepperErrorCode> = [
  "LOCK_CONTENTION",
  "BRANCH_SWITCH",
  "BMAD_INCOMPATIBLE",
  "BMAD_NOT_INSTALLED",
  "UNKNOWN_BMAD_SKILL",
  "DAG_CYCLE",
  "CORRUPT_STATE",
  "STATE_TOO_NEW",
  "STATE_CHANGED_DURING_DISPATCH",
  "VERIFIER_FAILURE",
  "PATHOLOGICAL_INPUT",
  "SCOPE_VIOLATION",
  "BUDGET_EXCEEDED",
  "TIMEOUT",
  "CONFIG_ERROR",
  "MIGRATION_FAILURE",
];

const HINT_REGEX = /^.*(Run|See|Try|Check) /;
const ALLOWED_EXIT_CODES: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5];

describe("errorRegistry", () => {
  const constructors = Object.values(errorRegistry);
  const instances = constructors.map((Ctor) => new Ctor("test message"));

  it("contains exactly 16 entries", () => {
    expect(constructors).toHaveLength(16);
  });

  it("registers all required codes (AC-2 fixed list)", () => {
    const codes = instances.map((e) => e.code).sort();
    expect(codes).toEqual([...REQUIRED_CODES].sort());
  });

  it("every actionableHint is non-empty (AC-1 a)", () => {
    for (const instance of instances) {
      expect(instance.actionableHint.trim().length).toBeGreaterThan(0);
    }
  });

  it("every hint starts with Run/See/Try/Check (AC-1 b — AR22 regex)", () => {
    for (const instance of instances) {
      expect(instance.actionableHint).toMatch(HINT_REGEX);
    }
  });

  it("every code is unique across the registry (AC-1 c)", () => {
    const codes = instances.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every exitCode is in {0, 1, 2, 3, 4, 5} (AC-1 d)", () => {
    for (const instance of instances) {
      expect(ALLOWED_EXIT_CODES).toContain(instance.exitCode);
    }
  });

  it("every instance is a StepperError and Error", () => {
    for (const instance of instances) {
      expect(instance).toBeInstanceOf(StepperError);
      expect(instance).toBeInstanceOf(Error);
    }
  });

  it("every instance carries its subclass name on Error.name", () => {
    for (const [index, instance] of instances.entries()) {
      const ctor = constructors[index];
      expect(ctor).toBeDefined();
      if (ctor) {
        expect(instance.name).toBe(ctor.name);
      }
    }
  });

  it("toJSON() returns the structured shape with all fields", () => {
    for (const instance of instances) {
      const json = instance.toJSON();
      expect(json.code).toBe(instance.code);
      expect(json.exitCode).toBe(instance.exitCode);
      expect(json.message).toBe("test message");
      expect(json.actionableHint).toBe(instance.actionableHint);
      expect(json.detail).toBeUndefined();
    }
  });

  it("constructor accepts an optional detail string", () => {
    const Ctor = errorRegistry.LockContentionError;
    const instance = new Ctor("primary message", "extra detail line");
    expect(instance.detail).toBe("extra detail line");
    expect(instance.toJSON().detail).toBe("extra detail line");
  });
});
