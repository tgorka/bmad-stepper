/**
 * src/telemetry/cli.test.ts — coverage for `main(argv)` (Story 6.7 — CLI_67_*).
 *
 * Tests the CLI entrypoint by:
 *   - Parsing argv directly via `parseArgv` (synchronous unit tests).
 *   - Running `main(argv)` with tmpdir-isolated cwd (AR35) for the
 *     happy-path + missing-file integration cases.
 *
 * AC mapping:
 *   - AC-1 wiring: CLI_67_HAPPY_*.
 *   - Argv guard: CLI_67_MISSING_PERIOD_*, CLI_67_INVALID_PERIOD_*.
 *   - Data error: CLI_67_MISSING_FILE_*.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { main, parseArgv } from "./cli.ts";

let tmpDir: string;
let prevCwd: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-cli-aggregate-"));
  prevCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(prevCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── parseArgv unit ─────────────────────────────────────────────────────

describe("parseArgv", () => {
  it("CLI_67_PARSE_VALID_1: --period 2026-05 → { period }", () => {
    const result = parseArgv([
      "bun",
      "src/telemetry/cli.ts",
      "--period",
      "2026-05",
    ]);
    expect(result).toEqual({ period: "2026-05" });
  });

  it("CLI_67_PARSE_MISSING_1: no flag → error", () => {
    const result = parseArgv(["bun", "src/telemetry/cli.ts"]);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("missing required --period");
    }
  });

  it("CLI_67_PARSE_INVALID_1: --period not-a-date → error", () => {
    const result = parseArgv([
      "bun",
      "src/telemetry/cli.ts",
      "--period",
      "not-a-date",
    ]);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("invalid period format");
    }
  });

  it("CLI_67_PARSE_FLAG_NO_VALUE_1: --period at end of argv → error", () => {
    const result = parseArgv(["bun", "src/telemetry/cli.ts", "--period"]);
    expect("error" in result).toBe(true);
  });
});

// ─── HAPPY: tmpdir cwd → markdown file produced ──────────────────────────

describe("main — CLI_67_HAPPY", () => {
  it("CLI_67_HAPPY_1: --period 2026-05 with fixture JSONL → exit 0 + markdown file", async () => {
    // Seed JSONL fixture under <cwd>/_bmad-output/.stepper/telemetry/2026-05.jsonl.
    const telemetryDir = path.join(
      tmpDir,
      "_bmad-output",
      ".stepper",
      "telemetry",
    );
    await fs.mkdir(telemetryDir, { recursive: true });
    const record = {
      schemaVersion: 1,
      ts: "2026-05-05T12:34:56.000Z",
      step: "bmad-create-story",
      phase: "planning",
      persona: "po",
      model: "sonnet",
      durationMs: 12345,
      verifierStatus: "pass",
      retries: 0,
      tokensIn: 1000,
      tokensOut: 500,
    };
    await fs.writeFile(
      path.join(telemetryDir, "2026-05.jsonl"),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );

    const exitCode = await main([
      "bun",
      "src/telemetry/cli.ts",
      "--period",
      "2026-05",
    ]);
    expect(exitCode).toBe(0);

    const md = await fs.readFile(path.join(telemetryDir, "2026-05.md"), "utf8");
    expect(md).toContain("# Telemetry Aggregate — 2026-05");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Per-step aggregates");
    expect(md).toContain("bmad-create-story");
  });
});

// ─── MISSING_PERIOD ─────────────────────────────────────────────────────

describe("main — CLI_67_MISSING_PERIOD", () => {
  it("CLI_67_MISSING_PERIOD_1: argv without --period → exit 1", async () => {
    const exitCode = await main(["bun", "src/telemetry/cli.ts"]);
    expect(exitCode).toBe(1);
  });
});

// ─── INVALID_PERIOD ─────────────────────────────────────────────────────

describe("main — CLI_67_INVALID_PERIOD", () => {
  it("CLI_67_INVALID_PERIOD_1: --period not-a-date → exit 1", async () => {
    const exitCode = await main([
      "bun",
      "src/telemetry/cli.ts",
      "--period",
      "not-a-date",
    ]);
    expect(exitCode).toBe(1);
  });
});

// ─── MISSING_FILE ───────────────────────────────────────────────────────

describe("main — CLI_67_MISSING_FILE", () => {
  it("CLI_67_MISSING_FILE_1: no JSONL fixture for period → exit 1", async () => {
    // Ensure no telemetry dir exists.
    const exitCode = await main([
      "bun",
      "src/telemetry/cli.ts",
      "--period",
      "2026-12",
    ]);
    expect(exitCode).toBe(1);
  });
});
