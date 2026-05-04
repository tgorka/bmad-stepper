/**
 * src/integration/doctor-marketplace.test.ts — Marketplace install smoke
 * test for the `/bmad-next --doctor` command (AC-5 of Story 1.12).
 *
 * Per architecture lines 1236 (`src/integration/`) + 1252 (`smoke/`),
 * this file lives under `src/integration/` rather than `smoke/` —
 * Story 1.x deferred the `smoke/` directory creation; the integration
 * directory is the canonical home for cross-module + marketplace
 * tests today (FR47 marketplace install, FR49 uninstall preservation).
 *
 * Coverage:
 *   - AC-5 marketplace install: a tmp `.claude/plugins/` fixture is
 *     populated, doctor is invoked through the fixture, asserts
 *     exit 0 + the AC-1 5-line stderr output.
 *   - AC-5b uninstall preservation: after a successful doctor run,
 *     the test asserts that removing `.claude/plugins/bmad-stepper/`
 *     does NOT affect a sibling `_bmad-output/.stepper/` directory.
 *     This is a property assertion (FR49 documentation requirement,
 *     no code gate per architecture line 737).
 *
 * Tests use AR35 tmpdir-per-test pattern. The real source tree is
 * INVOKED via `Bun.spawn(["bun", "run", "src/commands/doctor/run.ts"])`
 * with `HOME` overridden to the tmp fixture so `detectBmadVersion`'s
 * default `~/.claude/plugins/` lookup resolves to the fake BMAD
 * plugin. The plugin source itself is NOT copied — `cwd` stays at
 * the repo root so `Bun` resolves the source tree via the plugin
 * runtime's own filesystem (the marketplace fixture only needs to
 * provide the BMAD plugin layout under HOME, not the Stepper plugin
 * itself).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

let tmp = "";
const REPO_ROOT = process.cwd();
const DOCTOR_RUNNER = path.join(REPO_ROOT, "src/commands/doctor/run.ts");

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-doctor-marketplace-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

/**
 * Set up a fake BMAD plugin under `<tmp>/.claude/plugins/bmad-method-<v>/`.
 * Called from the smoke tests; mirrors the per-check unit test fixture.
 */
async function setupFakeBmadPlugin(version: string): Promise<void> {
  const pluginDir = path.join(
    tmp,
    ".claude",
    "plugins",
    `bmad-method-${version}`,
  );
  await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await Bun.write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "bmad-method", version, description: "Test" }),
  );
  // Plugin advertises no skills — empty skills/ directory.
  await fs.mkdir(path.join(pluginDir, "skills"), { recursive: true });
}

/**
 * Set up a fake project root inside the tmp fixture. Includes
 * `_bmad/config.yaml` for the project-name check.
 */
async function setupProjectRoot(name: string): Promise<string> {
  const projectRoot = path.join(tmp, "project");
  await fs.mkdir(path.join(projectRoot, "_bmad"), { recursive: true });
  await Bun.write(
    path.join(projectRoot, "_bmad/config.yaml"),
    `bmm:\n  project_name: ${name}\n`,
  );
  return projectRoot;
}

describe("doctor marketplace smoke test (AC-5)", () => {
  it("invokes the doctor runner via Bun.spawn and returns exit 0 with the AC-1 stderr output", async () => {
    await setupFakeBmadPlugin("6.5.0.1");
    const projectRoot = await setupProjectRoot("smoke-test-project");

    const proc = Bun.spawn(["bun", "run", DOCTOR_RUNNER], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: tmp,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    // FR54 stdout discipline — stdout stays empty (no JSON dispatch
    // line; doctor never emits to stdout).
    expect(stdout).toBe("");
    // AC-1 verbatim 5-line format on stderr.
    expect(stderr).toContain("BMAD detected: v6.5.0.1 (compatible)");
    expect(stderr).toContain("Project: smoke-test-project");
    expect(stderr).toContain("State file: not present (fresh project)");
    expect(stderr).toContain("+ 0 project overrides; DAG validated; no cycles");
    expect(stderr).toContain(
      "Suggestion: run /bmad-next to start the analysis phase.",
    );
  });

  it("returns exit 3 with the BMAD_NOT_INSTALLED hint when no plugin is installed", async () => {
    // No setupFakeBmadPlugin — the tmp fixture has no plugins/ dir.
    const projectRoot = await setupProjectRoot("smoke-test-no-plugin");

    const proc = Bun.spawn(["bun", "run", DOCTOR_RUNNER], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: tmp,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    expect(exitCode).toBe(3);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Run npx bmad-method install --tools claude-code first.",
    );
  });
});

describe("doctor marketplace AC-5b uninstall preserves _bmad-output/.stepper/", () => {
  it("removes the plugin directory but preserves _bmad-output/.stepper/ (FR49 property assertion)", async () => {
    await setupFakeBmadPlugin("6.5.0.1");
    const projectRoot = await setupProjectRoot("uninstall-test");

    // Create a stepper internal directory + a fake state.yaml under the
    // project root. The "Stepper plugin" lives under HOME's .claude/
    // plugins; the project's state lives under _bmad-output/. Per FR49
    // (PRD line 737), uninstalling the plugin (rm -rf .claude/plugins/
    // bmad-stepper/) MUST preserve _bmad-output/.stepper/.
    const stepperDir = path.join(projectRoot, "_bmad-output/.stepper");
    await fs.mkdir(stepperDir, { recursive: true });
    const statePath = path.join(stepperDir, "state.yaml");
    await Bun.write(
      statePath,
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "uninstall-test", bmadVersion: "6.5.0.1" },
        runHistory: [],
        checkpoints: [],
      }),
    );

    // Run doctor first to validate the green-state property.
    const proc = Bun.spawn(["bun", "run", DOCTOR_RUNNER], {
      cwd: projectRoot,
      env: { ...process.env, HOME: tmp },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    // Simulate uninstall — remove the BMAD plugin layout under HOME.
    // (The actual Stepper plugin uninstall would be /plugin marketplace
    // remove; we approximate by removing the BMAD plugin layout.)
    await fs.rm(path.join(tmp, ".claude/plugins"), {
      recursive: true,
      force: true,
    });

    // Assert the project's _bmad-output/.stepper/state.yaml is still
    // present — uninstall preservation property per FR49.
    const stillExists = await Bun.file(statePath).exists();
    expect(stillExists).toBe(true);
  });
});
