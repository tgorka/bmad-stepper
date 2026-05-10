/**
 * src/upgrade/cli.test.ts — coverage for `main(argv)` CLI entrypoint
 * (Story 6.9 — CLI_69_*).
 *
 * AR35: tmpdir per `it(...)` block; cleanup in `afterEach`. Tests MUST
 * NOT touch `_bmad-output/` (the real project's output directory) and
 * MUST NOT mutate the real `process.cwd()`.
 *
 * Per OQ-13 sub-clause (a): cli.ts does NOT expose the fetch seam (it
 * invokes `runUpgradeCheck({})` with no override to mirror the Story
 * 6.7 cli.ts pattern). Tests MUTATE `globalThis.fetch` in `beforeEach`
 * and RESTORE in `afterEach` so the real fetch is never called.
 *
 * AC mapping:
 *   - AC-1 (success path): CLI_69_HAPPY_NEWER_AVAILABLE_*,
 *     CLI_69_UP_TO_DATE_*, CLI_69_USER_AGENT_FIXTURE_*.
 *   - AC-2 (failure path): CLI_69_NETWORK_FAILURE_EXIT_1_*.
 *   - NFR-S2 (no-write at CLI level): CLI_69_NO_WRITE_TO_PLUGIN_DIR_SWEEP_*.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as log from "../io/log.ts";
import { main } from "./cli.ts";

let tmpDir: string;
let originalCwd: string;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-upgrade-cli-"));
  originalCwd = process.cwd();
  originalFetch = globalThis.fetch;
  // Seed the manifest at <tmpDir>/.claude-plugin/plugin.json with the
  // default test fixture version 0.1.0 (overridable per-test via
  // overwrite).
  const dotDir = path.join(tmpDir, ".claude-plugin");
  await fs.mkdir(dotDir, { recursive: true });
  await fs.writeFile(
    path.join(dotDir, "plugin.json"),
    JSON.stringify({ name: "bmad-stepper", version: "0.1.0" }),
    "utf8",
  );
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

interface StubFetchOpts {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  throws?: unknown;
  recordHeaders?: { current: Record<string, string> | undefined };
}

function makeStubFetch(opts: StubFetchOpts = {}): typeof globalThis.fetch {
  return ((_input: unknown, init?: RequestInit) => {
    if (opts.recordHeaders) {
      opts.recordHeaders.current = init?.headers as
        | Record<string, string>
        | undefined;
    }
    if (opts.throws !== undefined) {
      return Promise.reject(opts.throws);
    }
    const status = opts.status ?? 200;
    const statusText = opts.statusText ?? "OK";
    const ok = opts.ok ?? (status >= 200 && status < 300);
    return Promise.resolve({
      ok,
      status,
      statusText,
      json: async () => opts.body,
    } as unknown as Response);
  }) as unknown as typeof globalThis.fetch;
}

const SAMPLE_BODY_WITH_BMAD =
  "## BMAD Compatibility — v6.5.x\n\nWhatever release notes go here.";

const AC_2_HINT =
  "Could not reach GitHub Releases. Check your network or try again later.";

const AC_1_HINT =
  "Run /plugin marketplace update tgorka/bmad-stepper to upgrade.";

// ─── CLI_69_HAPPY_NEWER_AVAILABLE ────────────────────────────────────────

describe("upgrade cli — AC-1 happy path", () => {
  it("CLI_69_HAPPY_NEWER_AVAILABLE_1: stdout contains H1 + AC-1 hint; exit 0", async () => {
    globalThis.fetch = makeStubFetch({
      body: {
        tag_name: "v0.2.0",
        html_url: "https://github.com/tgorka/bmad-stepper/releases/tag/v0.2.0",
        body: SAMPLE_BODY_WITH_BMAD,
      },
    });
    let captured = "";
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      captured +=
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as unknown as typeof process.stdout.write);
    try {
      const code = await main([]);
      expect(code).toBe(0);
      expect(captured).toContain("# Stepper Upgrade Check");
      expect(captured).toContain("- Current version: 0.1.0");
      expect(captured).toContain("- Latest version: 0.2.0");
      expect(captured).toContain(AC_1_HINT);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("CLI_69_UP_TO_DATE_1: stdout contains 'You are on the latest version'; exit 0", async () => {
    globalThis.fetch = makeStubFetch({
      body: {
        tag_name: "v0.1.0",
        html_url: "https://github.com/tgorka/bmad-stepper/releases/tag/v0.1.0",
        body: "",
      },
    });
    let captured = "";
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      captured +=
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as unknown as typeof process.stdout.write);
    try {
      const code = await main([]);
      expect(code).toBe(0);
      expect(captured).toContain("You are on the latest version (0.1.0).");
      expect(captured).not.toContain(AC_1_HINT);
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// ─── CLI_69_NETWORK_FAILURE_EXIT_1 ───────────────────────────────────────

describe("upgrade cli — AC-2 network failure", () => {
  it("CLI_69_NETWORK_FAILURE_EXIT_1_1: AC-2 hint emitted byte-identical; exit 1", async () => {
    globalThis.fetch = makeStubFetch({
      throws: new TypeError("fetch failed"),
    });
    const errorCalls: string[] = [];
    const errorSpy = spyOn(log, "error").mockImplementation((msg: string) => {
      errorCalls.push(msg);
    });
    try {
      const code = await main([]);
      expect(code).toBe(1);
      // Two error() calls: the upgrade-prefixed details + the AC-2 hint.
      expect(errorCalls.length).toBe(2);
      expect(errorCalls[1]).toBe(AC_2_HINT);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// ─── CLI_69_USER_AGENT_FIXTURE ───────────────────────────────────────────

describe("upgrade cli — User-Agent header", () => {
  it("CLI_69_USER_AGENT_FIXTURE_1: User-Agent equals bmad-stepper/<fixture-version>", async () => {
    const recordHeaders: { current: Record<string, string> | undefined } = {
      current: undefined,
    };
    globalThis.fetch = makeStubFetch({
      recordHeaders,
      body: {
        tag_name: "v0.1.0",
        html_url: "https://github.com/tgorka/bmad-stepper/releases/tag/v0.1.0",
        body: "",
      },
    });
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      (() => true) as unknown as typeof process.stdout.write,
    );
    try {
      const code = await main([]);
      expect(code).toBe(0);
      expect(recordHeaders.current?.["User-Agent"]).toBe("bmad-stepper/0.1.0");
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// ─── CLI_69_NO_WRITE_TO_PLUGIN_DIR_SWEEP (NFR-S2 at CLI level) ───────────

describe("upgrade cli — NFR-S2 no-write at CLI level", () => {
  it("CLI_69_NO_WRITE_TO_PLUGIN_DIR_SWEEP_1: zero fs write calls during main()", async () => {
    globalThis.fetch = makeStubFetch({
      body: {
        tag_name: "v0.2.0",
        html_url: "https://github.com/tgorka/bmad-stepper/releases/tag/v0.2.0",
        body: SAMPLE_BODY_WITH_BMAD,
      },
    });
    const writeFileSpy = spyOn(fs, "writeFile");
    const appendFileSpy = spyOn(fs, "appendFile");
    const copyFileSpy = spyOn(fs, "copyFile");
    const renameSpy = spyOn(fs, "rename");
    const unlinkSpy = spyOn(fs, "unlink");
    const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      (() => true) as unknown as typeof process.stdout.write,
    );
    try {
      const code = await main([]);
      expect(code).toBe(0);
      expect(writeFileSpy).not.toHaveBeenCalled();
      expect(appendFileSpy).not.toHaveBeenCalled();
      expect(copyFileSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
      expect(unlinkSpy).not.toHaveBeenCalled();
    } finally {
      writeFileSpy.mockRestore();
      appendFileSpy.mockRestore();
      copyFileSpy.mockRestore();
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });
});
