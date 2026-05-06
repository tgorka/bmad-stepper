/**
 * src/upgrade/check.test.ts — coverage for `runUpgradeCheck`
 * (Story 6.9 — AC-1 + AC-2 — UPGRADE_69_*).
 *
 * AR35: tmpdir per `it(...)` block; cleanup in `afterEach`. Tests MUST
 * NOT touch `_bmad-output/` (the real project's output directory).
 *
 * AC mapping:
 *   - AC-1 (calls Bun.fetch GH endpoint + reads currentVersion + compares
 *     + returns discriminated union): UPGRADE_69_HAPPY_NEWER_*,
 *     UPGRADE_69_UP_TO_DATE_*, UPGRADE_69_LOCAL_AHEAD_*,
 *     UPGRADE_69_USER_AGENT_SET_*, UPGRADE_69_BMAD_COMPAT_*,
 *     UPGRADE_69_TAG_NAME_*, UPGRADE_69_COMPARE_VERSIONS_*.
 *   - AC-2 (failure → throws bare Error; orchestrator surfaces the AC-2
 *     hint): UPGRADE_69_NETWORK_FAILURE_*, UPGRADE_69_RATE_LIMIT_*,
 *     UPGRADE_69_TIMEOUT_*, UPGRADE_69_MISSING_PLUGIN_JSON_*,
 *     UPGRADE_69_MALFORMED_PLUGIN_JSON_*,
 *     UPGRADE_69_MALFORMED_RELEASE_RESPONSE_*.
 *   - NFR-S2 (no-write): UPGRADE_69_NO_PLUGIN_DIR_WRITE_*.
 *
 * Per OQ-13: every test injects `opts.fetch` to avoid real network
 * calls (mandatory for CI determinism + offline development).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  RELEASES_URL_DEFAULT,
  type RunUpgradeCheckOptions,
  runUpgradeCheck,
  UPGRADE_FETCH_TIMEOUT_MS,
  type UpgradeCheckResult,
} from "./check.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-upgrade-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Write a `.claude-plugin/plugin.json` fixture under `dir` with the
 * given version. Returns the absolute path to the manifest.
 */
async function writeManifest(
  dir: string,
  version: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const dotDir = path.join(dir, ".claude-plugin");
  await fs.mkdir(dotDir, { recursive: true });
  const manifestPath = path.join(dotDir, "plugin.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ name: "bmad-stepper", version, ...extra }),
    "utf8",
  );
  return manifestPath;
}

/**
 * Stub fetch matching the global `fetch` signature. Returns a synthetic
 * Response with `ok` / `status` / `statusText` / `json()` derived from
 * `opts`. When `opts.throws` is set the stub rejects with that error.
 * When `opts.delayMs` is set the stub waits that long before resolving
 * (for timeout tests; the AbortController.signal also cancels via the
 * `signal.aborted` event).
 */
interface StubFetchOpts {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  throws?: unknown;
  delayMs?: number;
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
    const fulfil = (): Response => {
      const status = opts.status ?? 200;
      const statusText = opts.statusText ?? "OK";
      const ok = opts.ok ?? (status >= 200 && status < 300);
      return {
        ok,
        status,
        statusText,
        json: async () => opts.body,
      } as unknown as Response;
    };
    if (opts.delayMs !== undefined) {
      const delayMs = opts.delayMs;
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(fulfil()), delayMs);
        // Honour AbortController signal: when aborted, reject with an
        // AbortError-like rejection (matches the runtime fetch contract).
        const signal = init?.signal;
        if (signal !== undefined && signal !== null) {
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("aborted", "AbortError"));
          });
        }
      });
    }
    return Promise.resolve(fulfil());
  }) as unknown as typeof globalThis.fetch;
}

const SAMPLE_BODY_WITH_BMAD =
  "## BMAD Compatibility — v6.5.x\n\nWhatever release notes go here.";

const SAMPLE_BODY_NO_BMAD =
  "## What's changed\n\n- Some bug fix\n- Some new feature\n";

// ─── UPGRADE_69_HAPPY_NEWER ───────────────────────────────────────────────

describe("runUpgradeCheck — AC-1 happy path", () => {
  it("UPGRADE_69_HAPPY_NEWER_1: returns upgrade-available with full result shape", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "v0.2.0",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0",
          body: SAMPLE_BODY_WITH_BMAD,
        },
      }),
    });
    expect(result.kind).toBe("upgrade-available");
    if (result.kind !== "upgrade-available") return;
    expect(result.currentVersion).toBe("0.1.0");
    expect(result.latestVersion).toBe("0.2.0");
    expect(result.changelogUrl).toBe(
      "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0",
    );
    expect(result.bmadCompat).toBe("v6.5.x");
  });

  it("UPGRADE_69_UP_TO_DATE_1: returns up-to-date when versions match", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "v0.1.0",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.1.0",
          body: SAMPLE_BODY_WITH_BMAD,
        },
      }),
    });
    expect(result.kind).toBe("up-to-date");
    expect(result.currentVersion).toBe("0.1.0");
    expect(result.latestVersion).toBe("0.1.0");
  });

  it("UPGRADE_69_LOCAL_AHEAD_1: returns up-to-date when current > latest (per OQ-3)", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "v0.0.9",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.0.9",
          body: SAMPLE_BODY_NO_BMAD,
        },
      }),
    });
    expect(result.kind).toBe("up-to-date");
    expect(result.currentVersion).toBe("0.1.0");
    expect(result.latestVersion).toBe("0.0.9");
  });
});

// ─── UPGRADE_69_NETWORK_FAILURE / RATE_LIMIT / TIMEOUT ────────────────────

describe("runUpgradeCheck — AC-2 failure paths", () => {
  it("UPGRADE_69_NETWORK_FAILURE_1: stubbed fetch TypeError throws Error", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const opts: RunUpgradeCheckOptions = {
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({ throws: new TypeError("fetch failed") }),
    };
    await expect(runUpgradeCheck(opts)).rejects.toThrow("fetch failed");
  });

  it("UPGRADE_69_RATE_LIMIT_1: stubbed fetch 403 throws Error with status", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const opts: RunUpgradeCheckOptions = {
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        ok: false,
        status: 403,
        statusText: "rate limit exceeded",
        body: { message: "API rate limit exceeded" },
      }),
    };
    await expect(runUpgradeCheck(opts)).rejects.toThrow(
      "GitHub API responded 403",
    );
  });

  it("UPGRADE_69_TIMEOUT_1: AbortController fires before fetch resolves", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    await expect(
      runUpgradeCheck({
        pluginManifestPath: manifestPath,
        fetch: makeStubFetch({ delayMs: 1000, body: {} }),
        timeoutMs: 50,
      }),
    ).rejects.toThrow();
  });
});

// ─── UPGRADE_69_MISSING / MALFORMED ──────────────────────────────────────

describe("runUpgradeCheck — input validation", () => {
  it("UPGRADE_69_MISSING_PLUGIN_JSON_1: missing manifest throws Error", async () => {
    const missing = path.join(tmpDir, "nonexistent", "plugin.json");
    await expect(
      runUpgradeCheck({
        pluginManifestPath: missing,
        fetch: makeStubFetch({ body: {} }),
      }),
    ).rejects.toThrow("failed to read plugin manifest");
  });

  it("UPGRADE_69_MALFORMED_PLUGIN_JSON_1: invalid JSON throws SyntaxError", async () => {
    const dir = path.join(tmpDir, ".claude-plugin");
    await fs.mkdir(dir, { recursive: true });
    const manifestPath = path.join(dir, "plugin.json");
    await fs.writeFile(manifestPath, "{not valid json", "utf8");
    await expect(
      runUpgradeCheck({
        pluginManifestPath: manifestPath,
        fetch: makeStubFetch({ body: {} }),
      }),
    ).rejects.toThrow();
  });

  it("UPGRADE_69_MALFORMED_RELEASE_RESPONSE_1: missing tag_name throws ZodError", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    await expect(
      runUpgradeCheck({
        pluginManifestPath: manifestPath,
        fetch: makeStubFetch({ body: { no_tag_name: "x" } }),
      }),
    ).rejects.toThrow();
  });
});

// ─── UPGRADE_69_USER_AGENT_SET / TAG_NAME / BMAD_COMPAT ──────────────────

describe("runUpgradeCheck — request shape + extraction helpers", () => {
  it("UPGRADE_69_USER_AGENT_SET_1: User-Agent header equals bmad-stepper/<version>", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const recordHeaders: { current: Record<string, string> | undefined } = {
      current: undefined,
    };
    await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        recordHeaders,
        body: {
          tag_name: "v0.1.0",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.1.0",
          body: "",
        },
      }),
    });
    const headers = recordHeaders.current;
    expect(headers).toBeDefined();
    expect(headers?.["User-Agent"]).toBe("bmad-stepper/0.1.0");
    expect(headers?.Accept).toBe("application/vnd.github+json");
  });

  it("UPGRADE_69_BMAD_COMPAT_EXTRACTED_1: extracts v6.5.x from release body", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "v0.2.0",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0",
          body: SAMPLE_BODY_WITH_BMAD,
        },
      }),
    });
    expect(result.kind).toBe("upgrade-available");
    if (result.kind !== "upgrade-available") return;
    expect(result.bmadCompat).toBe("v6.5.x");
  });

  it("UPGRADE_69_BMAD_COMPAT_MISSING_1: returns undefined when heading absent", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "v0.2.0",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0",
          body: SAMPLE_BODY_NO_BMAD,
        },
      }),
    });
    expect(result.kind).toBe("upgrade-available");
    if (result.kind !== "upgrade-available") return;
    expect(result.bmadCompat).toBeUndefined();
  });

  it("UPGRADE_69_TAG_NAME_STRIP_V_1: tag_name 'v0.2.0' → latestVersion '0.2.0'", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "v0.2.0",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0",
          body: "",
        },
      }),
    });
    if (result.kind !== "upgrade-available") {
      throw new Error("expected upgrade-available");
    }
    expect(result.latestVersion).toBe("0.2.0");
  });

  it("UPGRADE_69_TAG_NAME_NO_V_1: tag_name '0.2.0' (no v) → latestVersion '0.2.0'", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "0.2.0",
          html_url: "https://github.com/Tgorka/bmad-stepper/releases/tag/0.2.0",
          body: "",
        },
      }),
    });
    if (result.kind !== "upgrade-available") {
      throw new Error("expected upgrade-available");
    }
    expect(result.latestVersion).toBe("0.2.0");
  });
});

// ─── UPGRADE_69_NO_PLUGIN_DIR_WRITE (NFR-S2 unit-level sweep) ────────────

describe("runUpgradeCheck — NFR-S2 no-write at unit level", () => {
  it("UPGRADE_69_NO_PLUGIN_DIR_WRITE_1: zero fs write calls during check", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const writeFileSpy = spyOn(fs, "writeFile");
    const appendFileSpy = spyOn(fs, "appendFile");
    const copyFileSpy = spyOn(fs, "copyFile");
    const renameSpy = spyOn(fs, "rename");
    const unlinkSpy = spyOn(fs, "unlink");
    try {
      await runUpgradeCheck({
        pluginManifestPath: manifestPath,
        fetch: makeStubFetch({
          body: {
            tag_name: "v0.2.0",
            html_url:
              "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0",
            body: SAMPLE_BODY_WITH_BMAD,
          },
        }),
      });
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
    }
  });
});

// ─── UPGRADE_69_COMPARE_VERSIONS (indirect via up-to-date / upgrade-available) ──

describe("runUpgradeCheck — semver compare correctness", () => {
  // Tests below exercise compareVersions transitively through the
  // public surface — the helper is module-private. Each test fixes
  // one corner of the integer-tuple compare contract.
  it("UPGRADE_69_COMPARE_VERSIONS_1A: 0.1.0 vs 0.2.0 → upgrade-available (-1)", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "0.2.0",
          html_url: "https://github.com/Tgorka/bmad-stepper/releases/tag/0.2.0",
          body: "",
        },
      }),
    });
    expect(result.kind).toBe("upgrade-available");
  });

  it("UPGRADE_69_COMPARE_VERSIONS_1B: 0.1.0 vs 0.1.0 → up-to-date (0)", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "0.1.0",
          html_url: "https://github.com/Tgorka/bmad-stepper/releases/tag/0.1.0",
          body: "",
        },
      }),
    });
    expect(result.kind).toBe("up-to-date");
  });

  it("UPGRADE_69_COMPARE_VERSIONS_1C: 1.0.0 vs 0.9.0 → up-to-date (+1)", async () => {
    const manifestPath = await writeManifest(tmpDir, "1.0.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "0.9.0",
          html_url: "https://github.com/Tgorka/bmad-stepper/releases/tag/0.9.0",
          body: "",
        },
      }),
    });
    expect(result.kind).toBe("up-to-date");
  });

  it("UPGRADE_69_COMPARE_VERSIONS_1D: 0.10.0 vs 0.9.0 → up-to-date (numeric not string)", async () => {
    // String compare of "0.10.0" vs "0.9.0" would yield "0.10.0" < "0.9.0"
    // (lexicographic), which is WRONG. The numeric compare yields
    // 10 > 9 → up-to-date (current > latest).
    const manifestPath = await writeManifest(tmpDir, "0.10.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch({
        body: {
          tag_name: "0.9.0",
          html_url: "https://github.com/Tgorka/bmad-stepper/releases/tag/0.9.0",
          body: "",
        },
      }),
    });
    expect(result.kind).toBe("up-to-date");
  });
});

// ─── Constants exposed for the integration test + cli.ts ────────────────

describe("module constants", () => {
  it("RELEASES_URL_DEFAULT points to the canonical Tgorka/bmad-stepper repo", () => {
    expect(RELEASES_URL_DEFAULT).toBe(
      "https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest",
    );
  });

  it("UPGRADE_FETCH_TIMEOUT_MS is 10 seconds (per OQ-8)", () => {
    expect(UPGRADE_FETCH_TIMEOUT_MS).toBe(10_000);
  });
});

// ─── UpgradeCheckResult discriminated union — type-only verification ───

describe("UpgradeCheckResult discriminated union", () => {
  it("compiles narrow on kind (upgrade-available vs up-to-date)", () => {
    const sample: UpgradeCheckResult = {
      kind: "up-to-date",
      currentVersion: "0.1.0",
      latestVersion: "0.1.0",
    };
    expect(sample.kind).toBe("up-to-date");
  });
});
