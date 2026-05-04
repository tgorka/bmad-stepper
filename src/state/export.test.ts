/**
 * src/state/export.test.ts — colocated tests for `exportState` per Story 3.8
 * Task 8.2 (FR4, FR52, FR54, NFR-M3, AR42, AR41).
 *
 * Coverage map (Tests A-G):
 *   - Test A: state has lastSuccessfulStep → all 7 fields populated.
 *   - Test B: state has only lastAttempted → activeEpic from lastAttempted.
 *   - Test C: empty state → most fields null.
 *   - Test D: Zod parse passes for the constructed shape.
 *   - Test E: bmadVersion: "unknown" preserved verbatim.
 *   - Test F: stepperVersion matches the constant.
 *   - Test G: no-lock invariant (programmatic source-content scan).
 *
 * AR35 tmpdir-per-test discipline.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { StateExportV1Schema } from "../schemas/state-export.ts";
import { STEPPER_VERSION } from "../version.ts";
import { exportState } from "./export.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-export-state-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

async function writeState(stateValue: unknown): Promise<string> {
  const statePath = path.join(tmp, "state.yaml");
  await Bun.write(statePath, Bun.YAML.stringify(stateValue));
  return statePath;
}

describe("exportState — Story 3.8 Task 8.2", () => {
  it("Test A — state has lastSuccessfulStep → all 7 fields populated", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-30T12:00:00Z",
      },
      lastAttempted: {
        step: "bmad-create-architecture",
        epic: 1,
        story: "1.6",
        attemptedAt: "2026-04-30T12:30:00Z",
      },
      lastFailureReason: {
        code: "VERIFIER_FAILURE",
        message: "missing required-section: status",
        hint: "Add `status: complete` and re-run.",
        runId: "2026-04-30T12-25-00Z-bmad-next",
      },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({
      statePath,
      dagNodePhase: (name) => (name === "bmad-create-prd" ? "planning" : null),
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.currentPhase).toBe("planning");
    expect(result.activeEpic).toBe(1);
    expect(result.lastSuccessfulStep?.step).toBe("bmad-create-prd");
    expect(result.lastAttempted?.step).toBe("bmad-create-architecture");
    expect(result.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
    expect(result.bmadVersion).toBe("6.5.0");
    expect(result.stepperVersion).toBe(STEPPER_VERSION);
  });

  it("Test B — state has only lastAttempted → activeEpic from lastAttempted", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-30T13:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({ statePath });

    expect(result.activeEpic).toBe(2);
    expect(result.lastSuccessfulStep).toBeNull();
    expect(result.lastAttempted?.step).toBe("bmad-dev-story");
    expect(result.lastFailureReason).toBeNull();
  });

  it("Test C — empty state → most fields null", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({ statePath });

    expect(result.currentPhase).toBeNull();
    expect(result.activeEpic).toBeNull();
    expect(result.lastSuccessfulStep).toBeNull();
    expect(result.lastAttempted).toBeNull();
    expect(result.lastFailureReason).toBeNull();
    expect(result.bmadVersion).toBe("6.5.0");
    expect(result.stepperVersion).toBe(STEPPER_VERSION);
  });

  it("Test D — Zod parse passes for the constructed shape", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({ statePath });

    // Defence-in-depth: the function already runs `.parse()` internally;
    // the colocated test re-runs `safeParse` to assert the wire shape.
    const safe = StateExportV1Schema.safeParse(result);
    expect(safe.success).toBe(true);
  });

  it("Test E — bmadVersion: 'unknown' preserved verbatim", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "unknown" },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({ statePath });

    expect(result.bmadVersion).toBe("unknown");
  });

  it("Test F — stepperVersion matches the constant", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({ statePath });

    expect(result.stepperVersion).toBe(STEPPER_VERSION);
    // The constant has a fixed value in v0.1.
    expect(result.stepperVersion).toBe("0.1.0");
  });

  it("Test G — no-lock invariant (programmatic source-content scan)", async () => {
    const source = await Bun.file(
      path.join(import.meta.dir, "export.ts"),
    ).text();
    expect(source).not.toMatch(/from\s+["']\.\.\/lock\//);
    const code = source
      .split("\n")
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join("\n");
    expect(code).not.toMatch(/\bacquire\(/);
    expect(code).not.toMatch(/\bloadState\(/);
  });

  it("Test H — currentPhase is null when no dagNodePhase callback", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-30T12:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({ statePath });

    expect(result.currentPhase).toBeNull();
    expect(result.lastSuccessfulStep?.step).toBe("bmad-create-prd");
  });

  it("Test I — currentPhase is null when callback returns null", async () => {
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "unknown-step",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-30T12:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });

    const result = await exportState({
      statePath,
      dagNodePhase: () => null,
    });

    expect(result.currentPhase).toBeNull();
  });
});
