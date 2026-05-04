/**
 * src/commands/doctor/run.test.ts — Orchestrator integration tests for
 * `runDoctor` (AC-1, AC-2, AC-3, AC-4 of Story 1.12).
 *
 * Coverage map:
 *   - AC-1 happy path (fresh project): 5 lines, exit 0, verbatim format.
 *   - AC-1 with present state: line 3 reads "State file: present
 *     (schemaVersion 1)" instead of fresh.
 *   - AC-2 BMAD missing: exit 3, error.line includes verbatim hint.
 *   - AC-3 corrupt state: exit 1, error.line includes recompute hint.
 *   - AC-4 DAG cycle: exit 3 (DAG_CYCLE bucket).
 *   - AC-4 lock-free contract: doctor never raises LockContentionError
 *     even with a held lock file in the fixture.
 *
 * Tests target the testable `runDoctor()` export — NOT the
 * `import.meta.main` entrypoint (covered by the marketplace smoke
 * test in `src/integration/doctor-marketplace.test.ts`).
 *
 * Tests use AR35 tmpdir-per-test pattern.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runDoctor } from "./run.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-doctor-run-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

async function setupFakeBmadPlugin(
  homeDir: string,
  version: string,
  skills: string[],
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
    JSON.stringify({ name: "bmad-method", version, description: "Test" }),
  );
  for (const skill of skills) {
    await fs.mkdir(path.join(pluginDir, "skills", skill), { recursive: true });
  }
}

async function setupProjectName(
  projectRoot: string,
  name: string,
): Promise<void> {
  await fs.mkdir(path.join(projectRoot, "_bmad"), { recursive: true });
  await Bun.write(
    path.join(projectRoot, "_bmad/config.yaml"),
    `bmm:\n  project_name: ${name}\n`,
  );
}

describe("runDoctor — AC-1 happy path (fresh project)", () => {
  it("returns exit 0 with the canonical 5-line stderr output", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    await setupProjectName(tmp, "stepper-test");

    const result = await runDoctor({
      projectRoot: tmp,
      homeDir: tmp,
      statePath: path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.results.length).toBe(5);

    expect(result.results[0]?.line).toBe(
      "BMAD detected: v6.5.0.1 (compatible)",
    );
    expect(result.results[1]?.line).toBe("Project: stepper-test");
    expect(result.results[2]?.line).toBe(
      "State file: not present (fresh project)",
    );
    expect(result.results[3]?.line).toMatch(
      /^Step registry: built from \d+ BMAD skills \+ 0 project overrides; DAG validated; no cycles$/,
    );
    expect(result.results[4]?.line).toBe(
      "Suggestion: run /bmad-next to start the analysis phase.",
    );
  });
});

describe("runDoctor — AC-1 with present state file", () => {
  it("renders 'State file: present (schemaVersion 1)' when state.yaml exists", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    await setupProjectName(tmp, "stepper-test");

    const statePath = path.join(tmp, "_bmad-output/.stepper/state.yaml");
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await Bun.write(
      statePath,
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0.1" },
        runHistory: [],
        checkpoints: [],
      }),
    );

    const result = await runDoctor({
      projectRoot: tmp,
      homeDir: tmp,
      statePath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.results[2]?.line).toBe(
      "State file: present (schemaVersion 1)",
    );
  });
});

describe("runDoctor — AC-2 BMAD missing", () => {
  it("returns exit 3 with the verbatim BMAD_NOT_INSTALLED hint", async () => {
    // No plugin layout under tmp/.claude/plugins.
    const result = await runDoctor({
      projectRoot: tmp,
      homeDir: tmp,
    });

    expect(result.exitCode).toBe(3);
    const last = result.results[result.results.length - 1];
    expect(last?.status).toBe("error");
    expect(last?.line).toBe(
      "Run npx bmad-method install --tools claude-code first.",
    );
    expect(last?.error?.code).toBe("BMAD_NOT_INSTALLED");
  });
});

describe("runDoctor — AC-3 corrupt state", () => {
  it("returns exit 1 with the verbatim CORRUPT_STATE hint when state.yaml is malformed", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    const statePath = path.join(tmp, "_bmad-output/.stepper/state.yaml");
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await Bun.write(statePath, "this: : not valid yaml :::: at all");

    const result = await runDoctor({
      projectRoot: tmp,
      homeDir: tmp,
      statePath,
    });

    expect(result.exitCode).toBe(1);
    const last = result.results[result.results.length - 1];
    expect(last?.status).toBe("error");
    expect(last?.line).toBe(
      "Run /bmad-next --recompute-state to rebuild the cache from project files.",
    );
    expect(last?.error?.code).toBe("CORRUPT_STATE");
  });
});

describe("runDoctor — AC-4 exit code mapping (FR53)", () => {
  it("returns exit 3 when overrides form a DAG cycle", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    await Bun.write(
      path.join(tmp, "bmad-stepper.config.yaml"),
      `overrides:
  bmad-product-brief:
    after: [bmad-create-prd]
  bmad-create-prd:
    after: [bmad-product-brief]
`,
    );

    const result = await runDoctor({
      projectRoot: tmp,
      homeDir: tmp,
      statePath: path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    });

    expect(result.exitCode).toBe(3);
    const last = result.results[result.results.length - 1];
    expect(last?.status).toBe("error");
    expect(last?.error?.code).toBe("DAG_CYCLE");
  });
});

describe("runDoctor — lock-free contract (architecture line 1672)", () => {
  it("does NOT raise LockContentionError even with a held lock file in the fixture", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    await setupProjectName(tmp, "stepper-test");

    // Simulate a held lock file under the canonical lock directory.
    // doctor's loadStateUnlocked path never touches this file, so no
    // LockContentionError should arise.
    const lockDir = path.join(tmp, "_bmad-output/.stepper/state.yaml.lock");
    await fs.mkdir(lockDir, { recursive: true });
    await Bun.write(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid: 99999,
        heartbeatTs: new Date().toISOString(),
      }),
    );

    const result = await runDoctor({
      projectRoot: tmp,
      homeDir: tmp,
      statePath: path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.results.length).toBe(5);
  });
});
