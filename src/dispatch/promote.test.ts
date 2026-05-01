/**
 * src/dispatch/promote.test.ts — colocated tests for `promote()` (Story 2.6
 * AC-2 + NFR-S5 + AR41 boundary).
 *
 * Test pattern per AR35: tmpdir-per-test isolation via `mkdtemp(path.join(
 * os.tmpdir(), "stepper-promote-"))`; cleanup via `afterEach rm({ recursive:
 * true, force: true })`. NEVER hard-coded `/tmp/...` paths.
 *
 * Coverage map (Story 2.6 Task 12):
 *   - 12.2 atomic copy succeeds (byte-identical destination + completion marker).
 *   - 12.3 NFR-S5 .bak rotation on overwrite.
 *   - 12.4 phase mapping (planning | implementation | analysis | retro).
 *   - 12.5 missing source artifact → VerifierFailureError.
 *   - 12.6 empty source artifact → VerifierFailureError.
 *   - 12.7 out-of-scope canonicalRoot → ScopeViolationError.
 *   - 12.8 idempotent completion-marker (second call overwrites first via .bak).
 *   - 12.9 custom artifactFilename test.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ScopeViolationError, VerifierFailureError } from "../errors.ts";
import { promote, resolvePhaseDir } from "./promote.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-promote-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

/**
 * Seed a sub-agent staged artifact under
 * `<tmp>/staging/<runId>/outputs/<filename>` with the given content.
 * Returns the resolved absolute source path.
 */
async function seedStagedArtifact(
  runId: string,
  filename: string,
  content: string,
): Promise<string> {
  const outputsDir = path.join(tmp, "staging", runId, "outputs");
  await fs.mkdir(outputsDir, { recursive: true });
  const sourcePath = path.join(outputsDir, filename);
  await Bun.write(sourcePath, content);
  return sourcePath;
}

// ─── 12.2: AC-2 atomic copy succeeds (byte-identical destination + marker) ─

describe("promote — AC-2 atomic copy succeeds", () => {
  it("copies the source artifact byte-identically to the canonical destination", async () => {
    const content = "# Sample PRD\n\nLorem ipsum dolor sit amet.\n";
    await seedStagedArtifact("run-1", "bmad-create-prd.md", content);

    const result = await promote({
      runId: "run-1",
      stepName: "bmad-create-prd",
      phase: "planning",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.promotedTo).toBe(
      path.join(tmp, "canonical", "planning-artifacts", "bmad-create-prd.md"),
    );
    expect(result.sourcePath).toBe(
      path.join(tmp, "staging", "run-1", "outputs", "bmad-create-prd.md"),
    );
    expect(result.bytes).toBe(content.length);

    const destText = await Bun.file(result.promotedTo).text();
    expect(destText).toBe(content);
  });

  it("writes the completion-marker.json under staging/<runId>/", async () => {
    await seedStagedArtifact("run-2", "bmad-create-prd.md", "# Marker test\n");

    const result = await promote({
      runId: "run-2",
      stepName: "bmad-create-prd",
      phase: "planning",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
      nowIso: "2026-05-01T08:30:00.000Z",
    });

    expect(result.markerPath).toBe(
      path.join(tmp, "staging", "run-2", "completion-marker.json"),
    );
    const markerText = await Bun.file(result.markerPath).text();
    const marker = JSON.parse(markerText);
    expect(marker.runId).toBe("run-2");
    expect(marker.step).toBe("bmad-create-prd");
    expect(marker.promotedTo).toBe(result.promotedTo);
    expect(marker.promotedAt).toBe("2026-05-01T08:30:00.000Z");
  });
});

// ─── 12.3: NFR-S5 .bak rotation test ──────────────────────────────────────

describe("promote — NFR-S5 .bak rotation on overwrite", () => {
  it("rotates the prior canonical content into <path>.bak when overwriting", async () => {
    // Seed a prior canonical artifact.
    const canonicalDir = path.join(tmp, "canonical", "planning-artifacts");
    await fs.mkdir(canonicalDir, { recursive: true });
    const priorContent = "# Prior content\n";
    await Bun.write(
      path.join(canonicalDir, "bmad-create-prd.md"),
      priorContent,
    );

    const newContent = "# New content\n";
    await seedStagedArtifact("run-3", "bmad-create-prd.md", newContent);

    const result = await promote({
      runId: "run-3",
      stepName: "bmad-create-prd",
      phase: "planning",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
    });

    // Destination has new content.
    expect(await Bun.file(result.promotedTo).text()).toBe(newContent);
    // .bak has the prior content.
    const bakPath = `${result.promotedTo}.bak`;
    expect(await Bun.file(bakPath).text()).toBe(priorContent);
  });
});

// ─── 12.4: phase mapping test ─────────────────────────────────────────────

describe("promote — phase mapping (resolvePhaseDir)", () => {
  it("maps planning → planning-artifacts", async () => {
    await seedStagedArtifact("rp", "bmad-create-prd.md", "# x\n");
    const result = await promote({
      runId: "rp",
      stepName: "bmad-create-prd",
      phase: "planning",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
    });
    expect(
      result.promotedTo.includes(`${path.sep}planning-artifacts${path.sep}`),
    ).toBe(true);
  });

  it("maps implementation → implementation-artifacts", async () => {
    await seedStagedArtifact("ri", "bmad-dev-story.md", "# x\n");
    const result = await promote({
      runId: "ri",
      stepName: "bmad-dev-story",
      phase: "implementation",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
    });
    expect(
      result.promotedTo.includes(
        `${path.sep}implementation-artifacts${path.sep}`,
      ),
    ).toBe(true);
  });

  it("maps analysis → planning-artifacts", async () => {
    await seedStagedArtifact("ra", "bmad-brainstorming.md", "# x\n");
    const result = await promote({
      runId: "ra",
      stepName: "bmad-brainstorming",
      phase: "analysis",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
    });
    expect(
      result.promotedTo.includes(`${path.sep}planning-artifacts${path.sep}`),
    ).toBe(true);
  });

  it("maps retro → implementation-artifacts", async () => {
    await seedStagedArtifact("rr", "bmad-retrospective.md", "# x\n");
    const result = await promote({
      runId: "rr",
      stepName: "bmad-retrospective",
      phase: "retro",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
    });
    expect(
      result.promotedTo.includes(
        `${path.sep}implementation-artifacts${path.sep}`,
      ),
    ).toBe(true);
  });

  it("resolvePhaseDir helper returns the expected mapping for known phases", () => {
    expect(resolvePhaseDir("planning")).toBe("planning-artifacts");
    expect(resolvePhaseDir("analysis")).toBe("planning-artifacts");
    expect(resolvePhaseDir("solutioning")).toBe("planning-artifacts");
    expect(resolvePhaseDir("implementation")).toBe("implementation-artifacts");
    expect(resolvePhaseDir("retro")).toBe("implementation-artifacts");
  });

  it("resolvePhaseDir defaults to implementation-artifacts for unknown phases", () => {
    expect(resolvePhaseDir("bogus-phase")).toBe("implementation-artifacts");
    expect(resolvePhaseDir("")).toBe("implementation-artifacts");
  });
});

// ─── 12.5: missing source artifact → VerifierFailureError ─────────────────

describe("promote — missing source artifact", () => {
  it("throws VerifierFailureError when the staged artifact does not exist", async () => {
    // Do NOT seed the artifact.
    let thrown: unknown;
    try {
      await promote({
        runId: "run-missing",
        stepName: "bmad-create-prd",
        phase: "planning",
        stagingRoot: path.join(tmp, "staging"),
        canonicalRoot: path.join(tmp, "canonical"),
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(VerifierFailureError);
    expect((thrown as VerifierFailureError).code).toBe("VERIFIER_FAILURE");
    expect((thrown as VerifierFailureError).message).toContain(
      "source artifact missing",
    );
  });
});

// ─── 12.6: empty source artifact → VerifierFailureError ──────────────────

describe("promote — empty source artifact", () => {
  it("throws VerifierFailureError when the staged artifact is empty", async () => {
    await seedStagedArtifact("run-empty", "bmad-create-prd.md", "");

    let thrown: unknown;
    try {
      await promote({
        runId: "run-empty",
        stepName: "bmad-create-prd",
        phase: "planning",
        stagingRoot: path.join(tmp, "staging"),
        canonicalRoot: path.join(tmp, "canonical"),
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(VerifierFailureError);
    expect((thrown as VerifierFailureError).code).toBe("VERIFIER_FAILURE");
    expect((thrown as VerifierFailureError).message).toContain("empty");
  });
});

// ─── 12.7: out-of-scope canonicalRoot → ScopeViolationError ──────────────

describe("promote — out-of-scope canonical destination", () => {
  it("throws ScopeViolationError when canonicalRoot is outside allowed scope", async () => {
    await seedStagedArtifact("run-oos", "bmad-create-prd.md", "# x\n");

    let thrown: unknown;
    try {
      await promote({
        runId: "run-oos",
        stepName: "bmad-create-prd",
        phase: "planning",
        stagingRoot: path.join(tmp, "staging"),
        // /etc/passwd-path is outside any allowed write root.
        canonicalRoot: "/etc/promote-test-out-of-scope",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ScopeViolationError);
    expect((thrown as ScopeViolationError).code).toBe("SCOPE_VIOLATION");
    expect((thrown as ScopeViolationError).exitCode).toBe(5);
  });
});

// ─── 12.8: idempotent completion-marker test ─────────────────────────────

describe("promote — idempotent completion-marker", () => {
  it("overwrites the completion-marker.json on a second call with the same runId", async () => {
    const content = "# Idempotent test\n";
    await seedStagedArtifact("run-idem", "bmad-create-prd.md", content);

    const first = await promote({
      runId: "run-idem",
      stepName: "bmad-create-prd",
      phase: "planning",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    const firstMarker = JSON.parse(await Bun.file(first.markerPath).text());
    expect(firstMarker.promotedAt).toBe("2026-05-01T08:00:00.000Z");

    const second = await promote({
      runId: "run-idem",
      stepName: "bmad-create-prd",
      phase: "planning",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
      nowIso: "2026-05-01T09:00:00.000Z",
    });

    expect(second.markerPath).toBe(first.markerPath);
    const secondMarker = JSON.parse(await Bun.file(second.markerPath).text());
    expect(secondMarker.promotedAt).toBe("2026-05-01T09:00:00.000Z");
  });
});

// ─── 12.9: custom artifactFilename test ──────────────────────────────────

describe("promote — custom artifactFilename", () => {
  it("uses the provided artifactFilename for both source and destination", async () => {
    const content = "# Custom name\n";
    await seedStagedArtifact("run-custom", "alternate-name.md", content);

    const result = await promote({
      runId: "run-custom",
      stepName: "bmad-create-prd",
      phase: "planning",
      stagingRoot: path.join(tmp, "staging"),
      canonicalRoot: path.join(tmp, "canonical"),
      artifactFilename: "alternate-name.md",
    });

    expect(result.sourcePath.endsWith("alternate-name.md")).toBe(true);
    expect(result.promotedTo.endsWith("alternate-name.md")).toBe(true);
    const destText = await Bun.file(result.promotedTo).text();
    expect(destText).toBe(content);
  });
});

// ─── AR41 boundary check (programmatic source-content scan) ──────────────

describe("promote — AR41 boundary + NFR-S1 no-network", () => {
  it("source file does not import forbidden node:* modules or network APIs", async () => {
    const source = await Bun.file(
      path.join(import.meta.dir, "promote.ts"),
    ).text();
    expect(source.includes('from "node:child_process"')).toBe(false);
    expect(source.includes('from "node:net"')).toBe(false);
    expect(source.includes('from "node:http"')).toBe(false);
    expect(source.includes('from "node:https"')).toBe(false);
    // No fetch/Bun.fetch usage (NFR-S1 — no main-thread network).
    expect(source.includes("fetch(")).toBe(false);
    // No upward (sibling higher-tier or top-tier) imports.
    expect(source.includes('from "../verifiers/')).toBe(false);
    expect(source.includes('from "../failure-ux/')).toBe(false);
    expect(source.includes('from "../commands/')).toBe(false);
  });
});
