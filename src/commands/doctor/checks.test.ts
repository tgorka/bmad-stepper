/**
 * src/commands/doctor/checks.test.ts — Per-check unit tests for the
 * doctor diagnostic suite (AC-1, AC-2, AC-3, AC-4 of Story 1.12).
 *
 * Coverage map:
 *   - checkBmadInstalled
 *     - Test 1: happy path — returns "BMAD detected: v<version> (compatible)".
 *     - Test 2: missing plugin throws BmadNotInstalledError.
 *   - checkProjectName
 *     - Test 3: reads bmm.project_name from _bmad/config.yaml.
 *     - Test 4: falls back to package.json name field.
 *     - Test 5: warns when both sources are missing.
 *     - Test 6: ignores malformed _bmad/config.yaml gracefully.
 *   - checkStateFile
 *     - Test 7: fresh-project case returns "State file: not present (fresh project)".
 *     - Test 8: present case returns "State file: present (schemaVersion 1)".
 *     - Test 9: corrupt schemaVersion throws CorruptStateError or StateTooNewError.
 *     - Test 10: malformed YAML throws CorruptStateError.
 *   - checkStepRegistry
 *     - Test 11: happy path renders verbatim line shape.
 *     - Test 12: counts overrides from bmad-stepper.config.yaml.
 *     - Test 13: empty overrides file → 0 count.
 *     - Test 14: cycle in overrides throws DagCycleError.
 *
 * Tests use AR35 tmpdir-per-test pattern — every test runs under a
 * unique `os.tmpdir()`-derived directory; cleanup via
 * `fs.rm({ recursive: true, force: true })` in `afterEach`. NEVER
 * hard-code `/tmp/...` paths.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  BmadNotInstalledError,
  CorruptStateError,
  DagCycleError,
  StateTooNewError,
} from "../../errors.ts";
import {
  checkBmadInstalled,
  checkProjectName,
  checkStateFile,
  checkStepRegistry,
  type DoctorBmadDetection,
} from "./checks.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-doctor-checks-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

/**
 * Set up a fake BMAD plugin layout under `<homeDir>/.claude/plugins/
 * bmad-method-<version>/`. Mirrors the Story 1.9 detector test fixture.
 */
async function setupFakeBmadPlugin(
  homeDir: string,
  version: string,
  skills: string[],
): Promise<{ pluginDir: string }> {
  const pluginDir = path.join(
    homeDir,
    ".claude",
    "plugins",
    `bmad-method-${version}`,
  );
  const claudePluginDir = path.join(pluginDir, ".claude-plugin");
  await fs.mkdir(claudePluginDir, { recursive: true });
  await Bun.write(
    path.join(claudePluginDir, "plugin.json"),
    JSON.stringify({
      name: "bmad-method",
      version,
      description: "BMAD Method - Test fixture",
    }),
  );
  for (const skill of skills) {
    await fs.mkdir(path.join(pluginDir, "skills", skill), { recursive: true });
  }
  return { pluginDir };
}

describe("checkBmadInstalled", () => {
  it("returns ok with verbatim '(compatible)' suffix on happy path", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", ["bmad-create-prd"]);
    const result = await checkBmadInstalled({
      homeDir: tmp,
      projectRoot: tmp,
    });
    expect(result.status).toBe("ok");
    expect(result.line.startsWith("BMAD detected: v")).toBe(true);
    expect(result.line.endsWith("(compatible)")).toBe(true);
    expect(result.line).toBe("BMAD detected: v6.5.0.1 (compatible)");
  });

  it("throws BmadNotInstalledError when no plugin exists", async () => {
    await expect(
      checkBmadInstalled({ homeDir: tmp, projectRoot: tmp }),
    ).rejects.toBeInstanceOf(BmadNotInstalledError);
  });

  it("BmadNotInstalledError carries exit code 3 and the verbatim hint", async () => {
    try {
      await checkBmadInstalled({ homeDir: tmp, projectRoot: tmp });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BmadNotInstalledError);
      const e = err as BmadNotInstalledError;
      expect(e.code).toBe("BMAD_NOT_INSTALLED");
      expect(e.exitCode).toBe(3);
      expect(e.actionableHint).toBe(
        "Run npx bmad-method install --tools claude-code first.",
      );
    }
  });
});

describe("checkProjectName", () => {
  it("reads bmm.project_name from _bmad/config.yaml", async () => {
    await fs.mkdir(path.join(tmp, "_bmad"), { recursive: true });
    await Bun.write(
      path.join(tmp, "_bmad/config.yaml"),
      "bmm:\n  project_name: my-project\n",
    );
    const result = await checkProjectName({ projectRoot: tmp });
    expect(result.status).toBe("ok");
    expect(result.line).toBe("Project: my-project");
  });

  it("falls back to package.json name when _bmad/config.yaml is missing", async () => {
    await Bun.write(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "my-pkg", version: "0.0.1" }),
    );
    const result = await checkProjectName({ projectRoot: tmp });
    expect(result.status).toBe("ok");
    expect(result.line).toBe("Project: my-pkg");
  });

  it("returns warn when both _bmad/config.yaml and package.json are missing", async () => {
    const result = await checkProjectName({ projectRoot: tmp });
    expect(result.status).toBe("warn");
    expect(result.line).toContain("(unknown");
    expect(result.line).toContain("bmm.project_name");
  });

  it("falls through to package.json when _bmad/config.yaml is malformed", async () => {
    await fs.mkdir(path.join(tmp, "_bmad"), { recursive: true });
    await Bun.write(
      path.join(tmp, "_bmad/config.yaml"),
      "this is not\n: valid yaml :::\n",
    );
    await Bun.write(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "fallback-pkg" }),
    );
    const result = await checkProjectName({ projectRoot: tmp });
    expect(result.status).toBe("ok");
    expect(result.line).toBe("Project: fallback-pkg");
  });
});

describe("checkStateFile", () => {
  it("returns fresh when state.yaml is absent (verbatim AC-1 line)", async () => {
    const statePath = path.join(tmp, "_bmad-output/.stepper/state.yaml");
    const result = await checkStateFile({ statePath });
    expect(result.status).toBe("fresh");
    expect(result.line).toBe("State file: not present (fresh project)");
  });

  it("returns ok with schemaVersion when state.yaml is present and valid", async () => {
    const statePath = path.join(tmp, "state.yaml");
    const yaml = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0.1" },
      runHistory: [],
      checkpoints: [],
    });
    await Bun.write(statePath, yaml);
    const result = await checkStateFile({ statePath });
    expect(result.status).toBe("ok");
    expect(result.line).toBe("State file: present (schemaVersion 1)");
  });

  it("throws CorruptStateError when state.yaml YAML parse fails", async () => {
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(statePath, "this: : not valid yaml :::: at all");
    await expect(checkStateFile({ statePath })).rejects.toBeInstanceOf(
      CorruptStateError,
    );
  });

  it("throws StateTooNewError when schemaVersion exceeds the migration registry", async () => {
    const statePath = path.join(tmp, "state.yaml");
    const yaml = Bun.YAML.stringify({
      schemaVersion: 999,
      project: { name: "future-test", bmadVersion: "9.9.9" },
    });
    await Bun.write(statePath, yaml);
    try {
      await checkStateFile({ statePath });
      throw new Error("expected throw");
    } catch (err) {
      // Story 1.5/1.6 register schemaVersion 1 only; 999 raises
      // StateTooNewError.
      expect(err).toBeInstanceOf(StateTooNewError);
    }
  });

  it("CorruptStateError carries exit code 1 and the verbatim hint on parse failure", async () => {
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(statePath, "this: : not valid yaml :::: at all");
    try {
      await checkStateFile({ statePath });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CorruptStateError);
      const e = err as CorruptStateError;
      expect(e.code).toBe("CORRUPT_STATE");
      expect(e.exitCode).toBe(1);
      expect(e.actionableHint).toBe(
        "Run /bmad-next --recompute-state to rebuild the cache from project files.",
      );
    }
  });
});

describe("checkStepRegistry", () => {
  it("renders verbatim line on happy path with 0 overrides", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    const bmad: DoctorBmadDetection = {
      version: "6.5.0.1",
      skillNames: [],
      homeDir: tmp,
    };
    const result = await checkStepRegistry({ projectRoot: tmp }, bmad);
    expect(result.status).toBe("ok");
    expect(
      /^Step registry: built from \d+ BMAD skills \+ \d+ project overrides; DAG validated; no cycles$/.test(
        result.line,
      ),
    ).toBe(true);
    expect(result.line).toContain("+ 0 project overrides");
  });

  it("counts overrides declared in bmad-stepper.config.yaml", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    await Bun.write(
      path.join(tmp, "bmad-stepper.config.yaml"),
      // 3 override entries; sub-keys deeper-indented and ignored.
      `overrides:
  bmad-create-prd:
    phase: planning
  bmad-create-architecture:
    phase: solutioning
  bmad-product-brief:
    optional: true
`,
    );
    const bmad: DoctorBmadDetection = {
      version: "6.5.0.1",
      skillNames: [],
      homeDir: tmp,
    };
    const result = await checkStepRegistry({ projectRoot: tmp }, bmad);
    expect(result.status).toBe("ok");
    expect(result.line).toContain("+ 3 project overrides");
  });

  it("returns 0 overrides when bmad-stepper.config.yaml has no overrides block", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    await Bun.write(
      path.join(tmp, "bmad-stepper.config.yaml"),
      "personas:\n  bmad-create-prd: pm\n",
    );
    const bmad: DoctorBmadDetection = {
      version: "6.5.0.1",
      skillNames: [],
      homeDir: tmp,
    };
    const result = await checkStepRegistry({ projectRoot: tmp }, bmad);
    expect(result.status).toBe("ok");
    expect(result.line).toContain("+ 0 project overrides");
  });

  it("throws DagCycleError when overrides form a cycle", async () => {
    await setupFakeBmadPlugin(tmp, "6.5.0.1", []);
    // Construct a cycle by overriding two seed entries to depend on each
    // other. bmad-create-prd already exists in the seed; we add a Tier 2
    // override that makes bmad-product-brief depend on bmad-create-prd
    // and also redefine bmad-create-prd.after to point back at
    // bmad-product-brief — completing the cycle.
    await Bun.write(
      path.join(tmp, "bmad-stepper.config.yaml"),
      `overrides:
  bmad-product-brief:
    after: [bmad-create-prd]
  bmad-create-prd:
    after: [bmad-product-brief]
`,
    );
    const bmad: DoctorBmadDetection = {
      version: "6.5.0.1",
      skillNames: [],
      homeDir: tmp,
    };
    await expect(
      checkStepRegistry({ projectRoot: tmp }, bmad),
    ).rejects.toBeInstanceOf(DagCycleError);
  });
});
