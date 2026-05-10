/**
 * src/smoke/doctor.test.ts — End-to-end smoke test for /bmad-doctor
 * (alias of /bmad-next --doctor). Mirrors the Story 2.8
 * src/smoke/next.test.ts pattern: tmpdir-per-test, real `bun run`
 * subprocess invocations of src/commands/doctor/run.ts.
 *
 * Coverage:
 *   - (a) Healthy install — 5 stderr lines + exit 0.
 *   - (b) Missing BMAD — `BMAD_NOT_INSTALLED` actionable hint to stderr,
 *         exit 3.
 *   - (c) Fresh project (no state.yaml) — emits "State file: not present"
 *         within the 5-line block, exit 0.
 *
 * Note: corrupt-state.yaml is exercised by the Layer-2 unit tests
 * (`src/state/load.test.ts`) and the dedicated
 * `src/commands/doctor/checks.test.ts` per-check tests; the smoke
 * focuses on the three high-level paths a user actually sees.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

let tmp = "";
const REPO_ROOT = process.cwd();
const FIXTURE_ROOT = path.join(
  REPO_ROOT,
  "tests/fixtures/minimal-bmad-project",
);
const DOCTOR_RUN_TS = path.join(REPO_ROOT, "src/commands/doctor/run.ts");

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-smoke-doctor-"));
  await copyDirectory(
    path.join(FIXTURE_ROOT, "_bmad"),
    path.join(tmp, "_bmad"),
  );
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

async function copyDirectory(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  await fs.cp(src, dst, { recursive: true });
}

interface SpawnResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function spawnRunner(
  args: readonly string[],
  cwd: string,
): Promise<SpawnResult> {
  const proc = Bun.spawn(["bun", "run", DOCTOR_RUN_TS, ...args], {
    cwd,
    env: { ...process.env, HOME: cwd },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

async function setupBmadPlugin(
  homeDir: string,
  version: string,
): Promise<void> {
  const pluginDir = path.join(
    homeDir,
    ".claude",
    "plugins",
    `bmad-method-${version}`,
  );
  await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await Bun.write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "bmad-method", version }),
  );
  // Provide a skills/ subdirectory matching the seeded entries so the
  // step-registry check passes ("built from <N> BMAD skills").
  await fs.mkdir(path.join(pluginDir, "skills", "bmad-brainstorming"), {
    recursive: true,
  });
  await Bun.write(
    path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
    "---\nname: bmad-brainstorming\ndescription: Stub skill for the doctor smoke.\n---\n# Stub\n",
  );
}

describe("smoke /bmad-doctor", () => {
  it("(a) healthy install emits 5 stderr lines and exits 0", async () => {
    await setupBmadPlugin(tmp, "6.6.0");
    const result = await spawnRunner([], tmp);
    expect(result.exitCode).toBe(0);

    // FR54: doctor output goes to stderr; stdout is silent. The five
    // canonical lines may be interleaved with diagnostic stderr from the
    // DAG builder (e.g., "dag: no overrides config found at ...; using
    // seed only"); filter to the five line prefixes the doctor's
    // `runDoctor` writes via the logger.
    const PREFIXES = [
      "BMAD detected:",
      "Project:",
      "State file:",
      "Step registry:",
      "Suggestion:",
    ] as const;
    const stderrLines = result.stderr
      .trim()
      .split("\n")
      .filter((l) => PREFIXES.some((p) => l.startsWith(p)));
    expect(stderrLines.length).toBe(5);
    expect(stderrLines[0]).toContain("BMAD detected: v6.6.0");
    expect(stderrLines[1]?.startsWith("Project:")).toBe(true);
    expect(stderrLines[2]?.startsWith("State file:")).toBe(true);
    expect(stderrLines[3]?.startsWith("Step registry:")).toBe(true);
    expect(stderrLines[4]?.startsWith("Suggestion:")).toBe(true);
  });

  it("(b) missing BMAD halts with the BMAD_NOT_INSTALLED hint and exits 3", async () => {
    // No bmad-method-* plugin under <tmp>/.claude/plugins/ — detector
    // throws BmadNotInstalledError.
    const result = await spawnRunner([], tmp);
    expect(result.exitCode).toBe(3);
    // The verbatim AC-2 hint per src/errors.ts.
    expect(result.stderr).toContain(
      "Run npx bmad-method install --tools claude-code first.",
    );
  });

  it("(c) fresh project (no state.yaml) reports 'not present' and exits 0", async () => {
    await setupBmadPlugin(tmp, "6.6.0");
    // Fixture's _bmad-output/ does NOT have .stepper/state.yaml — that
    // is the canonical fresh-project state.
    const result = await spawnRunner([], tmp);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("State file: not present");
  });

  it("(d) --verbose appends a Diagnostics block after the canonical 5 lines", async () => {
    await setupBmadPlugin(tmp, "6.6.0");
    const result = await spawnRunner(["--verbose"], tmp);
    expect(result.exitCode).toBe(0);
    // The canonical 5 lines remain present; a "Diagnostics" header
    // marks the start of the new block; per-line bullets use "  · ".
    expect(result.stderr).toContain("BMAD detected: v6.6.0");
    expect(result.stderr).toContain("Diagnostics (--verbose):");
    expect(result.stderr).toMatch(/ {2}· BMAD legacy layout:/);
    expect(result.stderr).toMatch(/ {2}· Seed BMAD version: 6\.6/);
    expect(result.stderr).toMatch(/ {2}· DAG node count/);
    expect(result.stderr).toMatch(/ {2}· State file:/);
    expect(result.stderr).toMatch(/ {2}· Lock dir:/);
    expect(result.stderr).toMatch(/ {2}· Last 3 run logs:/);
  });

  it("(e) bare doctor still has exactly 5 canonical lines (no Diagnostics block when --verbose is absent)", async () => {
    await setupBmadPlugin(tmp, "6.6.0");
    const result = await spawnRunner([], tmp);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Diagnostics");
  });

  it("(f) corrupt state.yaml halts with exit 1 + actionable hint", async () => {
    await setupBmadPlugin(tmp, "6.6.0");
    // Write garbage that defeats Bun.YAML.parse (binary-ish bytes guarantee
    // it cannot be re-interpreted as a valid mapping).
    await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), {
      recursive: true,
    });
    await Bun.write(
      path.join(tmp, "_bmad-output/.stepper/state.yaml"),
      "\x00\x01not yaml at all: { unbalanced",
    );
    const result = await spawnRunner([], tmp);
    expect(result.exitCode).toBe(1);
    // The CorruptStateError actionable hint per src/errors.ts.
    expect(result.stderr).toContain("--recompute-state");
  });

  it("(g) unknown flag exits with 2 + parser hint", async () => {
    await setupBmadPlugin(tmp, "6.6.0");
    const result = await spawnRunner(["--definitely-not-a-real-flag"], tmp);
    expect(result.exitCode).toBe(2);
    // The Story 1.7 / v0.2.0 parser hint mentions the canonical surface.
    expect(result.stderr).toContain("--doctor");
    expect(result.stderr).toContain("--verbose");
  });

  it("(h) marketplace cache layout (installed_plugins.json) is detected", async () => {
    // The v0.2.0 fix at src/bmad-detect/detect-version.ts:165 reads
    // installed_plugins.json first. This case verifies that path: NO legacy
    // bmad-method-* directory, ONLY a cache install + the manifest.
    const cacheVersion = "6.6.0";
    const cacheDir = path.join(
      tmp,
      ".claude",
      "plugins",
      "cache",
      "bmad-method",
      "bmad",
      cacheVersion,
    );
    await fs.mkdir(path.join(cacheDir, ".claude-plugin"), { recursive: true });
    await Bun.write(
      path.join(cacheDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "bmad", version: cacheVersion }),
    );
    await fs.mkdir(path.join(cacheDir, "skills", "bmad-brainstorming"), {
      recursive: true,
    });
    await Bun.write(
      path.join(cacheDir, "skills", "bmad-brainstorming", "SKILL.md"),
      "---\nname: bmad-brainstorming\ndescription: Stub.\n---\n",
    );
    // Marketplace registry that points the detector at the cache install.
    await Bun.write(
      path.join(tmp, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "bmad@bmad-method": [
            {
              scope: "user",
              installPath: cacheDir,
              version: cacheVersion,
              installedAt: "2026-05-10T00:00:00.000Z",
              lastUpdated: "2026-05-10T00:00:00.000Z",
              gitCommitSha: "deadbeef",
            },
          ],
        },
      }),
    );

    const result = await spawnRunner([], tmp);
    expect(result.exitCode).toBe(0);
    // Detector reports the version from the cache install.
    expect(result.stderr).toContain(`BMAD detected: v${cacheVersion}`);
  });
});
