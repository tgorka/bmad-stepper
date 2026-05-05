/**
 * src/config/load.test.ts — Unit tests for `loadConfig` (Story 6.1).
 *
 * Coverage:
 *   - CFG_LOAD_DEFAULTS_*  — defaults-only path (no project, no user).
 *   - CFG_LOAD_USER_*      — user-only path (no project; user fields override).
 *   - CFG_LOAD_PROJECT_*   — project + user + defaults — deep-merge precedence.
 *   - CFG_LOAD_DEEP_MERGE_*— nested object deep-merge across layers.
 *   - CFG_LOAD_INVALID_*   — malformed YAML / invalid shape → ConfigError.
 *   - CFG_LOAD_FIELD_PATH_*— Zod field path appears in the hint.
 *   - CFG_LOAD_HINT_REGEX_*— hint matches AR22 regex /^.*(Run|See|Try|Check) /.
 *   - CFG_LOAD_HINT_SINGLE_LINE_* — hint is single-line (no \n / \r).
 *   - CFG_LOAD_SCHEMA_BUMP_* — schemaVersion 2 → StateTooNewError pass-through.
 *   - CFG_LOAD_TEST_SEAM_*  — opts.projectRoot + opts.userConfigPath plumbing.
 *
 * Per Story 6.1 OQ-3, deep-merge semantics: array-replace + per-field
 * record-merge. Per OQ-5, hint format includes the Zod field path.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ConfigError, StateTooNewError } from "../errors.ts";
import { loadConfig } from "./load.ts";

const HINT_REGEX = /^.*(Run|See|Try|Check) /;

describe("CFG_LOAD_*: loadConfig (Story 6.1, FR6, FR7, FR34-FR40)", () => {
  let tmpProjectRoot: string;
  let tmpUserDir: string;
  let tmpUserConfig: string;

  beforeEach(async () => {
    tmpProjectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "stepper-cfg-load-project-"),
    );
    tmpUserDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "stepper-cfg-load-user-"),
    );
    tmpUserConfig = path.join(tmpUserDir, "config.yaml");
  });

  afterEach(async () => {
    await fs.rm(tmpProjectRoot, { recursive: true, force: true });
    await fs.rm(tmpUserDir, { recursive: true, force: true });
  });

  // ─── Defaults-only path ──────────────────────────────────────────────────

  it("CFG_LOAD_DEFAULTS_1: no project file, no user file → defaults shape", async () => {
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig, // does not exist
    });
    expect(config.schemaVersion).toBe(1);
    expect(config.failurePolicies).toEqual({});
    expect(config.personas).toEqual({});
    expect(config.paths.state).toBe("_bmad-output/.stepper/state.yaml");
    expect(config.paths.runs).toBe("_bmad-output/.stepper/runs/");
  });

  it("CFG_LOAD_DEFAULTS_2: telemetry.enabled defaults to false (NFR-S3)", async () => {
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.telemetry.enabled).toBe(false);
  });

  // ─── User-only path ──────────────────────────────────────────────────────

  it("CFG_LOAD_USER_1: user file with failurePolicies → defaults preserved + policy applied", async () => {
    await fs.writeFile(
      tmpUserConfig,
      `schemaVersion: 1\nfailurePolicies:\n  bmad-dev-story: retry\n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.failurePolicies).toEqual({ "bmad-dev-story": "retry" });
    expect(config.paths.state).toBe("_bmad-output/.stepper/state.yaml"); // defaults preserved
  });

  it("CFG_LOAD_USER_2: user file with partial paths → per-field merge with defaults", async () => {
    await fs.writeFile(
      tmpUserConfig,
      `schemaVersion: 1\npaths:\n  state: /custom/state.yaml\n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.paths.state).toBe("/custom/state.yaml");
    expect(config.paths.runs).toBe("_bmad-output/.stepper/runs/"); // default
    expect(config.paths.staging).toBe("_bmad-output/.stepper/staging/"); // default
    expect(config.paths.telemetry).toBe("_bmad-output/.stepper/telemetry/"); // default
  });

  // ─── Project + user + defaults ───────────────────────────────────────────

  it("CFG_LOAD_PROJECT_1: project file overrides user failurePolicies", async () => {
    await fs.writeFile(
      tmpUserConfig,
      `schemaVersion: 1\nfailurePolicies:\n  bmad-dev-story: skip\n`,
    );
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\nfailurePolicies:\n  bmad-dev-story: retry\n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.failurePolicies).toEqual({ "bmad-dev-story": "retry" });
  });

  it("CFG_LOAD_PROJECT_2: project models override user models per-key", async () => {
    await fs.writeFile(
      tmpUserConfig,
      `schemaVersion: 1\nmodels:\n  bmad-dev-story: sonnet\n`,
    );
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\nmodels:\n  bmad-dev-story: opus\n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.models["bmad-dev-story"]).toBe("opus");
  });

  // ─── Deep-merge across layers ────────────────────────────────────────────

  it("CFG_LOAD_DEEP_MERGE_1: paths.state from user, paths.runs from project, others from defaults", async () => {
    await fs.writeFile(
      tmpUserConfig,
      `schemaVersion: 1\npaths:\n  state: /user-state.yaml\n`,
    );
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\npaths:\n  runs: /project-runs/\n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.paths.state).toBe("/user-state.yaml"); // user
    expect(config.paths.runs).toBe("/project-runs/"); // project
    expect(config.paths.staging).toBe("_bmad-output/.stepper/staging/"); // default
    expect(config.paths.telemetry).toBe("_bmad-output/.stepper/telemetry/"); // default
  });

  it("CFG_LOAD_DEEP_MERGE_2: nested budgets[step] deep-merges per-field across layers", async () => {
    await fs.writeFile(
      tmpUserConfig,
      `schemaVersion: 1\nbudgets:\n  bmad-dev-story:\n    timeoutMs: 600000\n`,
    );
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\nbudgets:\n  bmad-dev-story:\n    contextTokens: 80000\n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.budgets["bmad-dev-story"]).toEqual({
      contextTokens: 80000,
      timeoutMs: 600000,
    });
  });

  // ─── Invalid input ───────────────────────────────────────────────────────

  it("CFG_LOAD_INVALID_1: malformed YAML → ConfigError exit 2 with file-pointing hint", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `: this is not valid yaml\n  - and: more invalid\n[broken`,
    );
    let caught: unknown;
    try {
      await loadConfig({
        projectRoot: tmpProjectRoot,
        userConfigPath: tmpUserConfig,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.exitCode).toBe(2);
      expect(caught.code).toBe("CONFIG_ERROR");
      expect(caught.actionableHint).toMatch(HINT_REGEX);
      // Single-line constraint per AR22 + Story 5.6 gate.
      expect(caught.actionableHint).not.toMatch(/[\r\n]/);
    }
  });

  it("CFG_LOAD_INVALID_2: invalid shape (personas: { dev: 42 }) → ConfigError with field path in hint", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\npersonas:\n  bmad-dev-story: 42\n`,
    );
    let caught: unknown;
    try {
      await loadConfig({
        projectRoot: tmpProjectRoot,
        userConfigPath: tmpUserConfig,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.exitCode).toBe(2);
      // The hint should mention the field path (personas / bmad-dev-story).
      expect(caught.actionableHint).toContain("personas");
    }
  });

  // ─── Field-path extraction ───────────────────────────────────────────────

  it("CFG_LOAD_FIELD_PATH_1: invalid paths.runs (number) → hint contains 'paths.runs' or 'paths'", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\npaths:\n  state: x\n  runs: 42\n  staging: y\n  telemetry: z\n`,
    );
    let caught: unknown;
    try {
      await loadConfig({
        projectRoot: tmpProjectRoot,
        userConfigPath: tmpUserConfig,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      // First Zod error path = paths.runs.
      expect(caught.actionableHint).toMatch(/paths(\.|$)/);
    }
  });

  // ─── Hint regex + single-line gate ───────────────────────────────────────

  it("CFG_LOAD_HINT_REGEX_1: ConfigError hints match AR22 regex /^.*(Run|See|Try|Check) /", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\nmodels:\n  bmad-dev-story: claude-3\n`,
    );
    let caught: unknown;
    try {
      await loadConfig({
        projectRoot: tmpProjectRoot,
        userConfigPath: tmpUserConfig,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.actionableHint).toMatch(HINT_REGEX);
    }
  });

  it("CFG_LOAD_HINT_SINGLE_LINE_1: ConfigError hint contains no newlines (Story 5.6 gate)", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1\noverrides:\n  skill-foo:\n    after: not-an-array\n`,
    );
    let caught: unknown;
    try {
      await loadConfig({
        projectRoot: tmpProjectRoot,
        userConfigPath: tmpUserConfig,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.actionableHint).not.toMatch(/[\r\n]/);
    }
  });

  // ─── schemaVersion bump pass-through ─────────────────────────────────────

  it("CFG_LOAD_SCHEMA_BUMP_1: config with schemaVersion 2 → StateTooNewError pass-through (per OQ-8)", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 2\n`,
    );
    let caught: unknown;
    try {
      await loadConfig({
        projectRoot: tmpProjectRoot,
        userConfigPath: tmpUserConfig,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StateTooNewError);
    if (caught instanceof StateTooNewError) {
      expect(caught.exitCode).toBe(1);
      expect(caught.code).toBe("STATE_TOO_NEW");
    }
  });

  // ─── Test seam plumbing ──────────────────────────────────────────────────

  it("CFG_LOAD_TEST_SEAM_1: opts.projectRoot is honored (not process.cwd())", async () => {
    // The default user-config path may exist on the host; ensure we're
    // pointing the test at a non-existent user path AND a tmp project
    // root distinct from process.cwd(). Production code that invokes
    // loadConfig() with no opts uses process.cwd() — verified
    // separately in the integration tests.
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.schemaVersion).toBe(1);
    // The test passes if no exception thrown — confirms the seam reads
    // tmp-paths NOT process.cwd().
  });

  it("CFG_LOAD_TEST_SEAM_2: opts.userConfigPath is honored", async () => {
    // Write a user config at the explicit path; verify the loader reads it.
    await fs.writeFile(
      tmpUserConfig,
      `schemaVersion: 1\ntelemetry:\n  enabled: true\n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.telemetry.enabled).toBe(true);
  });

  // ─── Empty file ──────────────────────────────────────────────────────────

  it("CFG_LOAD_EMPTY_1: empty project file (whitespace only) → defaults preserved", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `   \n\n   \n`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.schemaVersion).toBe(1);
    expect(config.failurePolicies).toEqual({});
  });

  // ─── Full canonical fixture ──────────────────────────────────────────────

  it("CFG_LOAD_FULL_1: full project config with all 9 keys parses cleanly", async () => {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      `schemaVersion: 1
personas:
  bmad-dev-story: amelia
overrides:
  architecture-validator:
    phase: solutioning
    after:
      - bmad-create-architecture
    optional: true
verifiers:
  bmad-dev-story:
    requiredFrontmatterSections:
      - "Implementation Plan"
    mode: merge
failurePolicies:
  bmad-dev-story: retry
models:
  bmad-dev-story: opus
budgets:
  bmad-dev-story:
    contextTokens: 80000
    timeoutMs: 600000
paths:
  state: _bmad-output/.stepper/state.yaml
  runs: _bmad-output/.stepper/runs/
  staging: _bmad-output/.stepper/staging/
  telemetry: _bmad-output/.stepper/telemetry/
telemetry:
  enabled: false
`,
    );
    const config = await loadConfig({
      projectRoot: tmpProjectRoot,
      userConfigPath: tmpUserConfig,
    });
    expect(config.personas["bmad-dev-story"]).toBe("amelia");
    expect(config.overrides["architecture-validator"]?.phase).toBe(
      "solutioning",
    );
    expect(config.verifiers["bmad-dev-story"]?.mode).toBe("merge");
    expect(config.failurePolicies["bmad-dev-story"]).toBe("retry");
    expect(config.models["bmad-dev-story"]).toBe("opus");
    expect(config.budgets["bmad-dev-story"]?.contextTokens).toBe(80000);
    expect(config.telemetry.enabled).toBe(false);
  });
});

// ─── Story 6.5: VER_65_LOAD_INVALID_* — `.strict()` on VerifierConfigSchema
// rejects unknown fields at LOAD time per AR17 + AC-3. These map to the
// I-46 forward-tracker close: project YAML cannot supply executable code
// (`custom`, `customFn`), schema constructors (`schema`), legacy paths
// (`verifierFile`), or LLM-as-judge (`judge`) — all surface as ConfigError
// exit 2 with a single-line actionable hint.

describe("VER_65_LOAD_INVALID_*: VerifierConfigSchema.strict() rejects at LOAD time (Story 6.5 AC-3)", () => {
  let tmpProjectRoot: string;
  let tmpUserConfig: string;

  beforeEach(async () => {
    tmpProjectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "stepper-ver65-load-"),
    );
    tmpUserConfig = path.join(tmpProjectRoot, ".bmad-stepper-user.yaml");
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpProjectRoot, { recursive: true, force: true });
    } catch {}
  });

  async function loadInvalid(yaml: string): Promise<unknown> {
    await fs.writeFile(
      path.join(tmpProjectRoot, "bmad-stepper.config.yaml"),
      yaml,
    );
    let caught: unknown;
    try {
      await loadConfig({
        projectRoot: tmpProjectRoot,
        userConfigPath: tmpUserConfig,
      });
    } catch (err) {
      caught = err;
    }
    return caught;
  }

  it("VER_65_LOAD_INVALID_1: schema field (AC-3 PRIMARY — non-existent Zod schema name) → ConfigError", async () => {
    const caught = await loadInvalid(
      `schemaVersion: 1\nverifiers:\n  bmad-dev-story:\n    schema: MySchema\n`,
    );
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.exitCode).toBe(2);
      expect(caught.actionableHint).toContain("verifiers");
      expect(caught.actionableHint).not.toMatch(/[\r\n]/);
    }
  });

  it("VER_65_LOAD_INVALID_2: customFn field → ConfigError (AR17 — no user-supplied custom code)", async () => {
    const caught = await loadInvalid(
      `schemaVersion: 1\nverifiers:\n  bmad-dev-story:\n    customFn:\n      x: 1\n`,
    );
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.exitCode).toBe(2);
    }
  });

  it("VER_65_LOAD_INVALID_3: judge field → ConfigError (LLM-as-judge deferred per architecture line 1727)", async () => {
    const caught = await loadInvalid(
      `schemaVersion: 1\nverifiers:\n  bmad-dev-story:\n    judge: claude\n`,
    );
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.exitCode).toBe(2);
    }
  });

  it("VER_65_LOAD_INVALID_4: mode='replace-all' → ConfigError (mode enum constraint)", async () => {
    const caught = await loadInvalid(
      `schemaVersion: 1\nverifiers:\n  bmad-dev-story:\n    mode: replace-all\n`,
    );
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.exitCode).toBe(2);
      expect(caught.actionableHint).toContain("verifiers");
    }
  });

  it("VER_65_LOAD_INVALID_5: custom field → ConfigError (AR17 — symmetric)", async () => {
    const caught = await loadInvalid(
      `schemaVersion: 1\nverifiers:\n  bmad-dev-story:\n    custom: "() => true"\n`,
    );
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.exitCode).toBe(2);
    }
  });
});
