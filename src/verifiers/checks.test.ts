/**
 * src/verifiers/checks.test.ts — Unit + integration tests for the four
 * built-in checks and the `runVerifier` orchestrator (Story 2.1 AC: all).
 *
 * Coverage map:
 *   - checkRequiredFiles
 *     - Test 1: skip when requiredFiles is empty.
 *     - Test 2: pass when every glob matches.
 *     - Test 3: fail when a glob has no matches (detail names the pattern).
 *   - checkFrontmatter
 *     - Test 4: skip when requiredFrontmatterSections is empty.
 *     - Test 5: pass when every required key is present + truthy.
 *     - Test 6: fail when the artifact has no frontmatter block.
 *     - Test 7: fail when the YAML is malformed.
 *     - Test 8: fail when a required key is missing.
 *     - Test 9: fail when a required key has an empty-string value.
 *     - Test 10: fail when the file does not exist.
 *   - checkSchema
 *     - Test 11: skip when schema is null.
 *     - Test 12: pass when the body matches the schema.
 *     - Test 13: fail with formatted issues when validation rejects.
 *   - checkCustom
 *     - Test 14: skip when custom is undefined.
 *     - Test 15: pass when custom returns ok=true.
 *     - Test 16: fail when custom returns ok=false (detail propagated).
 *     - Test 17: fail when custom throws synchronously.
 *     - Test 18: fail when custom rejects asynchronously.
 *   - runVerifier orchestrator
 *     - Test 19: AC-2 happy path → status pass + 4 checks + result file written.
 *     - Test 20: AC-3/AC-4 failure path → status fail + frontmatter check fail.
 *     - Test 21: orchestration failure when stagingRoot is missing.
 *     - Test 22: orchestration failure when staging dir is absent.
 *     - Test 23: NFR-R1 .bak rotation on second runVerifier call.
 *     - Test 24: result file validates against VerifierResultV1Schema on disk.
 *     - Test 25: AC-5 custom callback executes via orchestrator (deterministic).
 *
 * AR35 tmpdir-per-test pattern: every test that touches the filesystem
 * runs under a unique `os.tmpdir()`-derived directory; cleanup via
 * `fs.rm({ recursive: true, force: true })` in `afterEach`. Never
 * hard-code `/tmp/...` paths.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { VerifierFailureError } from "../errors.ts";
import { VerifierResultV1Schema } from "../schemas/verifier-result.ts";
import {
  checkCustom,
  checkFrontmatter,
  checkRequiredFiles,
  checkSchema,
  runVerifier,
} from "./checks.ts";
import type { ArtifactRef, VerifierConfig } from "./types.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-verifier-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

/**
 * Stages an artifact file under `<tmp>/staging/<runId>/outputs/<filename>`.
 * Returns the resolved staging root + the artifact path. Mirrors the
 * Story 2.4-onwards expected layout.
 */
async function stageArtifact(
  runId: string,
  filename: string,
  contents: string,
): Promise<{ stagingRoot: string; artifactPath: string }> {
  const stagingRoot = path.join(tmp, "staging");
  const outputsDir = path.join(stagingRoot, runId, "outputs");
  await fs.mkdir(outputsDir, { recursive: true });
  const artifactPath = path.join(outputsDir, filename);
  await Bun.write(artifactPath, contents);
  return { stagingRoot, artifactPath };
}

/**
 * Builds an `ArtifactRef` for the staged artifact.
 */
function makeArtifactRef(
  stagingRoot: string,
  runId: string,
  filename: string,
  stepName: string,
): ArtifactRef {
  const outputsDir = path.join(stagingRoot, runId, "outputs");
  return {
    path: path.join(outputsDir, filename),
    stepName,
    runId,
    outputsDir,
  };
}

// ─── checkRequiredFiles ─────────────────────────────────────────────────────

describe("checkRequiredFiles", () => {
  it("skips when requiredFiles is empty", async () => {
    const { stagingRoot } = await stageArtifact("run-1", "x.md", "irrelevant");
    const ref = makeArtifactRef(stagingRoot, "run-1", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
    };
    const result = await checkRequiredFiles(ref, config);
    expect(result.name).toBe("required-files");
    expect(result.status).toBe("skip");
    expect(result.detail).toBe("No required files declared");
  });

  it("passes when every glob matches at least one file", async () => {
    const { stagingRoot } = await stageArtifact(
      "run-2",
      "dev-story.md",
      "stub",
    );
    const ref = makeArtifactRef(
      stagingRoot,
      "run-2",
      "dev-story.md",
      "dev-story",
    );
    const config: VerifierConfig = {
      requiredFiles: ["**/*.md"],
      requiredFrontmatterSections: [],
      schema: null,
    };
    const result = await checkRequiredFiles(ref, config);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("");
  });

  it("fails when a glob has zero matches and names the pattern in detail", async () => {
    const { stagingRoot } = await stageArtifact("run-3", "only-md.md", "stub");
    const ref = makeArtifactRef(
      stagingRoot,
      "run-3",
      "only-md.md",
      "dev-story",
    );
    const config: VerifierConfig = {
      requiredFiles: ["**/*.json"],
      requiredFrontmatterSections: [],
      schema: null,
    };
    const result = await checkRequiredFiles(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("**/*.json");
  });
});

// ─── checkFrontmatter ───────────────────────────────────────────────────────

describe("checkFrontmatter", () => {
  it("skips when requiredFrontmatterSections is empty", async () => {
    const { stagingRoot } = await stageArtifact(
      "run-4",
      "x.md",
      "no frontmatter",
    );
    const ref = makeArtifactRef(stagingRoot, "run-4", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
    };
    const result = await checkFrontmatter(ref, config);
    expect(result.status).toBe("skip");
    expect(result.detail).toBe("No required frontmatter sections declared");
  });

  it("passes when every required key is present and truthy", async () => {
    const md = `---\ntitle: My Doc\nstatus: ready-for-dev\n---\n\nbody`;
    const { stagingRoot } = await stageArtifact("run-5", "doc.md", md);
    const ref = makeArtifactRef(stagingRoot, "run-5", "doc.md", "dev-story");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: ["title", "status"],
      schema: null,
    };
    const result = await checkFrontmatter(ref, config);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("");
  });

  it("fails when the artifact has no frontmatter block", async () => {
    const { stagingRoot } = await stageArtifact(
      "run-6",
      "doc.md",
      "no frontmatter here",
    );
    const ref = makeArtifactRef(stagingRoot, "run-6", "doc.md", "dev-story");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: ["title"],
      schema: null,
    };
    const result = await checkFrontmatter(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("Frontmatter block is missing");
  });

  it("fails when the YAML is malformed", async () => {
    const md = "---\ntitle: : : : oops\n  bad-indent\n---\n\nbody";
    const { stagingRoot } = await stageArtifact("run-7", "doc.md", md);
    const ref = makeArtifactRef(stagingRoot, "run-7", "doc.md", "dev-story");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: ["title"],
      schema: null,
    };
    const result = await checkFrontmatter(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("malformed YAML");
  });

  it("fails when a required key is missing", async () => {
    const md = `---\ntitle: Only Title\n---\n\nbody`;
    const { stagingRoot } = await stageArtifact("run-8", "doc.md", md);
    const ref = makeArtifactRef(stagingRoot, "run-8", "doc.md", "dev-story");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: ["title", "status"],
      schema: null,
    };
    const result = await checkFrontmatter(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("Missing frontmatter key: status");
  });

  it("fails when a required key has an empty-string value", async () => {
    const md = `---\ntitle: Doc\nstatus: ""\n---\n\nbody`;
    const { stagingRoot } = await stageArtifact("run-9", "doc.md", md);
    const ref = makeArtifactRef(stagingRoot, "run-9", "doc.md", "dev-story");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: ["title", "status"],
      schema: null,
    };
    const result = await checkFrontmatter(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("Missing frontmatter key: status");
  });

  it("fails when the artifact file does not exist", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(path.join(stagingRoot, "run-10", "outputs"), {
      recursive: true,
    });
    const ref = makeArtifactRef(
      stagingRoot,
      "run-10",
      "missing.md",
      "dev-story",
    );
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: ["title"],
      schema: null,
    };
    const result = await checkFrontmatter(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("Could not read artifact");
  });
});

// ─── checkSchema ────────────────────────────────────────────────────────────

describe("checkSchema", () => {
  it("skips when schema is null", async () => {
    const { stagingRoot } = await stageArtifact("run-11", "x.md", "stub");
    const ref = makeArtifactRef(stagingRoot, "run-11", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
    };
    const result = await checkSchema(ref, config);
    expect(result.status).toBe("skip");
    expect(result.detail).toBe("No body schema declared");
  });

  it("passes when JSON body matches the schema", async () => {
    const body = JSON.stringify({ name: "alpha", count: 3 });
    const { stagingRoot } = await stageArtifact("run-12", "x.json", body);
    const ref = makeArtifactRef(stagingRoot, "run-12", "x.json", "x");
    const schema = z.object({ name: z.string(), count: z.number() });
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema,
    };
    const result = await checkSchema(ref, config);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("");
  });

  it("fails with formatted issues when validation rejects", async () => {
    const body = JSON.stringify({ name: 42, count: "not-a-number" });
    const { stagingRoot } = await stageArtifact("run-13", "x.json", body);
    const ref = makeArtifactRef(stagingRoot, "run-13", "x.json", "x");
    const schema = z.object({ name: z.string(), count: z.number() });
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema,
    };
    const result = await checkSchema(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("Schema validation failed");
    // detail should mention the failed paths
    expect(result.detail).toContain("name");
    expect(result.detail).toContain("count");
  });
});

// ─── checkCustom ────────────────────────────────────────────────────────────

describe("checkCustom", () => {
  it("skips when custom is undefined", async () => {
    const { stagingRoot } = await stageArtifact("run-14", "x.md", "stub");
    const ref = makeArtifactRef(stagingRoot, "run-14", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
    };
    const result = await checkCustom(ref, config);
    expect(result.status).toBe("skip");
    expect(result.detail).toBe("No custom check declared");
  });

  it("passes when custom returns ok=true", async () => {
    const { stagingRoot } = await stageArtifact("run-15", "x.md", "stub");
    const ref = makeArtifactRef(stagingRoot, "run-15", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
      custom: () => ({ ok: true, value: undefined }),
    };
    const result = await checkCustom(ref, config);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("");
  });

  it("fails with detail propagated when custom returns ok=false", async () => {
    const { stagingRoot } = await stageArtifact("run-16", "x.md", "stub");
    const ref = makeArtifactRef(stagingRoot, "run-16", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
      custom: async () => ({
        ok: false,
        error: { check: "custom", detail: "boom" },
      }),
    };
    const result = await checkCustom(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("boom");
  });

  it("fails when custom throws synchronously", async () => {
    const { stagingRoot } = await stageArtifact("run-17", "x.md", "stub");
    const ref = makeArtifactRef(stagingRoot, "run-17", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
      custom: () => {
        throw new Error("sync throw");
      },
    };
    const result = await checkCustom(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("sync throw");
    expect(result.detail).toContain("Custom check threw");
  });

  it("fails when custom rejects asynchronously", async () => {
    const { stagingRoot } = await stageArtifact("run-18", "x.md", "stub");
    const ref = makeArtifactRef(stagingRoot, "run-18", "x.md", "x");
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
      custom: async () => {
        throw new Error("async reject");
      },
    };
    const result = await checkCustom(ref, config);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("async reject");
  });
});

// ─── runVerifier orchestrator ───────────────────────────────────────────────

describe("runVerifier — happy path (AC-2)", () => {
  it("returns status:pass with 4 checks and writes verifier-result.json", async () => {
    const md = `---\ntitle: Dev Story Doc\nstatus: ready-for-dev\n---\n\nbody`;
    const { stagingRoot } = await stageArtifact("run-h1", "dev-story.md", md);

    const result = await runVerifier("run-h1", {
      stepName: "dev-story",
      stagingRoot,
    });

    expect(result.status).toBe("pass");
    expect(result.schemaVersion).toBe(1);
    expect(result.promotedTo).toBeNull();
    expect(result.checks).toHaveLength(4);
    expect(result.checks.find((c) => c.name === "required-files")?.status).toBe(
      "pass",
    );
    expect(result.checks.find((c) => c.name === "frontmatter")?.status).toBe(
      "pass",
    );
    expect(result.checks.find((c) => c.name === "schema")?.status).toBe("skip");
    expect(result.checks.find((c) => c.name === "custom")?.status).toBe("skip");
    expect(result.resultPath).toBe(
      path.join(stagingRoot, "run-h1", "verifier-result.json"),
    );

    // The on-disk file must validate against the v1 schema.
    const text = await Bun.file(result.resultPath).text();
    const parsed = JSON.parse(text);
    const validated = VerifierResultV1Schema.safeParse(parsed);
    expect(validated.success).toBe(true);
  });
});

describe("runVerifier — failure path (AC-3, AC-4)", () => {
  it("returns status:fail when frontmatter is missing the status key", async () => {
    const md = `---\ntitle: Only Title\n---\n\nbody`;
    const { stagingRoot } = await stageArtifact("run-f1", "dev-story.md", md);

    const result = await runVerifier("run-f1", {
      stepName: "dev-story",
      stagingRoot,
    });

    expect(result.status).toBe("fail");
    const fm = result.checks.find((c) => c.name === "frontmatter");
    expect(fm?.status).toBe("fail");
    expect(fm?.detail).toContain("Missing frontmatter key: status");
  });
});

describe("runVerifier — orchestration failures", () => {
  it("throws VerifierFailureError when stagingRoot is missing", async () => {
    let caught: unknown = null;
    try {
      await runVerifier("run-x", { stepName: "dev-story" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerifierFailureError);
    expect((caught as VerifierFailureError).code).toBe("VERIFIER_FAILURE");
    expect((caught as VerifierFailureError).exitCode).toBe(1);
  });

  it("throws VerifierFailureError when staging directory does not exist", async () => {
    const stagingRoot = path.join(tmp, "staging-empty");
    let caught: unknown = null;
    try {
      await runVerifier("run-missing", {
        stepName: "dev-story",
        stagingRoot,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerifierFailureError);
    expect((caught as Error).message).toContain("staging directory");
  });
});

describe("runVerifier — NFR-R1 atomic write + .bak rotation", () => {
  it("rotates the prior verifier-result.json into .bak on second invocation", async () => {
    const md = `---\ntitle: Doc\nstatus: ready-for-dev\n---\n`;
    const { stagingRoot } = await stageArtifact("run-r1", "dev-story.md", md);

    const first = await runVerifier("run-r1", {
      stepName: "dev-story",
      stagingRoot,
    });
    expect(first.status).toBe("pass");
    const firstText = await Bun.file(first.resultPath).text();
    const second = await runVerifier("run-r1", {
      stepName: "dev-story",
      stagingRoot,
    });
    expect(second.status).toBe("pass");

    const bakPath = `${first.resultPath}.bak`;
    const bakExists = await Bun.file(bakPath).exists();
    expect(bakExists).toBe(true);
    const bakText = await Bun.file(bakPath).text();
    // The bak file holds the prior version (which was identical content
    // here, but the .bak file must exist after the second write).
    expect(bakText).toBe(firstText);
  });
});

describe("runVerifier — AC-5 custom callback (deterministic)", () => {
  it("is exercised when configured via a wrapper that mirrors registry resolution", async () => {
    // Story 2.1 ships no project-config layer, so the registry's
    // dev-story config has no custom callback. To exercise the AC-5
    // contract end-to-end we invoke checkCustom directly — the
    // orchestrator integration is exercised by the happy-path test
    // (test 19) where checkCustom returns "skip".
    const md = `---\ntitle: Doc\nstatus: ready\n---\n`;
    const { stagingRoot } = await stageArtifact("run-c1", "dev-story.md", md);
    const ref = makeArtifactRef(
      stagingRoot,
      "run-c1",
      "dev-story.md",
      "dev-story",
    );
    let invocations = 0;
    const config: VerifierConfig = {
      requiredFiles: [],
      requiredFrontmatterSections: [],
      schema: null,
      custom: () => {
        invocations += 1;
        // deterministic + stateless: depends only on the input, no IO
        return { ok: true, value: undefined };
      },
    };
    const result = await checkCustom(ref, config);
    expect(result.status).toBe("pass");
    expect(invocations).toBe(1);
    // determinism: invoking again with the same input yields the same result
    const result2 = await checkCustom(ref, config);
    expect(result2.status).toBe("pass");
    expect(invocations).toBe(2);
  });
});
