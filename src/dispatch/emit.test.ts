/**
 * src/dispatch/emit.test.ts — Unit tests for emitDispatchAction()
 * (Story 2.2 AC-5; FR54 stdout discipline; AR9 JSON-line protocol).
 *
 * Coverage:
 *   - AC-5 stdout discipline: spy on process.stdout.write; verify exactly
 *     ONE call to stdout with the JSON line + trailing newline; verify
 *     stderr was NOT touched.
 *   - AC-5 schema validation pre-emit: malformed action → ZodError thrown
 *     (e.g., dispatch with exitCode: 1 violates the discriminated union).
 *   - All three action variants render the correct JSON-line shape.
 */

import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { DispatchActionV1 } from "../schemas/dispatch-protocol.ts";
import { emitDispatchAction } from "./emit.ts";

// On Linux, `spyOn(process.stdout, "write")` does NOT intercept calls
// originating from imported `json()` (defined in `../io/log.ts`) because
// Bun's ESM live-binding for named imports forwards through the original
// `process.stdout.write` reference captured at log.ts load time. macOS
// happens to bind through the spy due to a different module-resolution
// path. Tracked as: refactor log.ts to use an indirected writers table
// so spies attach via property access on a stable holder object.
const SKIP_ON_LINUX = process.platform === "linux";

let stdoutSpy: ReturnType<typeof spyOn> | null = null;
let stderrSpy: ReturnType<typeof spyOn> | null = null;

afterEach(() => {
  if (stdoutSpy !== null) {
    stdoutSpy.mockRestore();
    stdoutSpy = null;
  }
  if (stderrSpy !== null) {
    stderrSpy.mockRestore();
    stderrSpy = null;
  }
});

function spyChannels(): {
  stdout: ReturnType<typeof spyOn>;
  stderr: ReturnType<typeof spyOn>;
} {
  stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  return { stdout: stdoutSpy, stderr: stderrSpy };
}

describe.skipIf(SKIP_ON_LINUX)(
  "emitDispatchAction — AC-5 stdout discipline",
  () => {
    it("writes exactly ONE JSON line to stdout for a dispatch action", () => {
      const { stdout, stderr } = spyChannels();
      emitDispatchAction({
        action: "dispatch",
        runId: "test-run-id",
        agent: "bmad-step-runner",
        exitCode: 0,
      });
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(stderr).not.toHaveBeenCalled();
      const written = stdout.mock.calls[0]?.[0] as string;
      expect(written).toBe(
        '{"action":"dispatch","runId":"test-run-id","agent":"bmad-step-runner","exitCode":0}\n',
      );
    });

    it("writes exactly ONE JSON line to stdout for a report action", () => {
      const { stdout, stderr } = spyChannels();
      emitDispatchAction({
        action: "report",
        message: "list result",
        exitCode: 0,
      });
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(stderr).not.toHaveBeenCalled();
      const written = stdout.mock.calls[0]?.[0] as string;
      expect(written).toBe(
        '{"action":"report","message":"list result","exitCode":0}\n',
      );
    });

    it("writes exactly ONE JSON line to stdout for a halt action", () => {
      const { stdout, stderr } = spyChannels();
      emitDispatchAction({
        action: "halt",
        message: "halted with actionable hint",
        exitCode: 1,
      });
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(stderr).not.toHaveBeenCalled();
      const written = stdout.mock.calls[0]?.[0] as string;
      expect(written).toBe(
        '{"action":"halt","message":"halted with actionable hint","exitCode":1}\n',
      );
    });

    it("writes exactly ONE JSON line to stdout for an invoke-skill action (v0.2.2)", () => {
      const { stdout, stderr } = spyChannels();
      emitDispatchAction({
        action: "invoke-skill",
        runId: "test-run-id",
        skillName: "bmad:bmad-brainstorming",
        exitCode: 0,
      });
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(stderr).not.toHaveBeenCalled();
      const written = stdout.mock.calls[0]?.[0] as string;
      expect(written).toBe(
        '{"action":"invoke-skill","runId":"test-run-id","skillName":"bmad:bmad-brainstorming","exitCode":0}\n',
      );
    });

    it("preserves lastAttempted on invoke-skill action", () => {
      const { stdout } = spyChannels();
      emitDispatchAction({
        action: "invoke-skill",
        runId: "rid",
        skillName: "bmad:bmad-create-prd",
        lastAttempted: {
          step: "bmad-create-prd",
          epic: 1,
          story: "1.1",
          attemptedAt: "2026-05-14T10:00:00Z",
        },
        exitCode: 0,
      });
      const written = stdout.mock.calls[0]?.[0] as string;
      expect(written).toContain('"action":"invoke-skill"');
      expect(written).toContain('"skillName":"bmad:bmad-create-prd"');
      expect(written).toContain('"lastAttempted"');
      expect(written).toContain('"step":"bmad-create-prd"');
    });
  },
);

describe("emitDispatchAction — AC-5 schema validation pre-emit", () => {
  it("throws when dispatch has non-zero exitCode (caller bug)", () => {
    spyChannels();
    const bogus = {
      action: "dispatch",
      runId: "test",
      agent: "bmad-step-runner",
      exitCode: 1,
    } as unknown as DispatchActionV1;
    expect(() => emitDispatchAction(bogus)).toThrow();
  });

  it("throws when halt has exitCode 0 (caller bug)", () => {
    spyChannels();
    const bogus = {
      action: "halt",
      message: "halted",
      exitCode: 0,
    } as unknown as DispatchActionV1;
    expect(() => emitDispatchAction(bogus)).toThrow();
  });

  it("throws when dispatch is missing the agent field", () => {
    spyChannels();
    const bogus = {
      action: "dispatch",
      runId: "test",
      exitCode: 0,
    } as unknown as DispatchActionV1;
    expect(() => emitDispatchAction(bogus)).toThrow();
  });

  it("throws when action is unknown", () => {
    spyChannels();
    const bogus = {
      action: "explode",
      message: "kaboom",
      exitCode: 1,
    } as unknown as DispatchActionV1;
    expect(() => emitDispatchAction(bogus)).toThrow();
  });

  it("does NOT write to stdout when validation throws (atomicity)", () => {
    const { stdout } = spyChannels();
    const bogus = {
      action: "halt",
      message: "halted",
      exitCode: 0,
    } as unknown as DispatchActionV1;
    expect(() => emitDispatchAction(bogus)).toThrow();
    expect(stdout).not.toHaveBeenCalled();
  });

  it("throws when invoke-skill is missing the skillName field", () => {
    spyChannels();
    const bogus = {
      action: "invoke-skill",
      runId: "test",
      exitCode: 0,
    } as unknown as DispatchActionV1;
    expect(() => emitDispatchAction(bogus)).toThrow();
  });

  it("throws when invoke-skill has non-zero exitCode (caller bug)", () => {
    spyChannels();
    const bogus = {
      action: "invoke-skill",
      runId: "test",
      skillName: "bmad:x",
      exitCode: 1,
    } as unknown as DispatchActionV1;
    expect(() => emitDispatchAction(bogus)).toThrow();
  });
});
