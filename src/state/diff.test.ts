/**
 * src/state/diff.test.ts — colocated tests for `diffState` per Story 3.8
 * Task 8.1 (FR3, FR52, AR42, AR41).
 *
 * Coverage map (Tests A-G):
 *   - Test A: cached equals recomputed → empty divergence + in-sync message.
 *   - Test B: single-field divergence (lastSuccessfulStep) → 1 line.
 *   - Test C: multi-field divergence (lastSuccessfulStep + project.name) → 2 lines.
 *   - Test D: project.bmadVersion divergence.
 *   - Test E: verbatim AC-line-847 example format.
 *   - Test F: empty state + empty artifact-scan → no divergence.
 *   - Test G: no-lock invariant (source-content scan; the helper file does
 *             not import from `src/lock/`).
 *
 * AR35 tmpdir-per-test discipline.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { diffState } from "./diff.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-diff-state-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

interface ArtifactFrontmatter {
  readonly title: string;
  readonly status: "complete" | "done" | "review";
  readonly story_id?: string;
  readonly story_key?: string;
  readonly epic?: number;
  readonly step?: string;
  readonly last_updated: string;
}

async function writeArtifact(
  tier: "planning" | "implementation",
  filename: string,
  fm: ArtifactFrontmatter,
): Promise<string> {
  const dir = path.join(tmp, `_bmad-output/${tier}-artifacts`);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  // Hand-rolled multi-line YAML — Bun.YAML.stringify produces inline `{}`
  // syntax which the recompute scanner's `extractFrontmatter` rejects
  // (expects multi-line block-style YAML between `---` delimiters).
  const lines: string[] = ["---"];
  lines.push(`title: ${JSON.stringify(fm.title)}`);
  lines.push(`status: ${fm.status}`);
  if (fm.story_id !== undefined)
    lines.push(`story_id: ${JSON.stringify(fm.story_id)}`);
  if (fm.story_key !== undefined) lines.push(`story_key: ${fm.story_key}`);
  if (fm.epic !== undefined) lines.push(`epic: ${fm.epic}`);
  if (fm.step !== undefined) lines.push(`step: ${fm.step}`);
  lines.push(`last_updated: ${JSON.stringify(fm.last_updated)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${fm.title}`);
  await Bun.write(filePath, lines.join("\n"));
  return filePath;
}

async function writeState(stateValue: unknown): Promise<string> {
  const statePath = path.join(tmp, "state.yaml");
  await Bun.write(statePath, Bun.YAML.stringify(stateValue));
  return statePath;
}

describe("diffState — Story 3.8 Task 8.1", () => {
  it("Test A — cached equals recomputed → empty divergence + in-sync message", async () => {
    // Single artifact under planning-artifacts/ with status: done; the
    // recomputed shape will surface this as `lastSuccessfulStep`.
    await writeArtifact("planning", "bmad-create-prd.md", {
      title: "PRD",
      status: "done",
      step: "bmad-create-prd",
      epic: 1,
      story_id: "1.1",
      last_updated: "2026-04-30T12:00:00Z",
    });
    const projectName = path.basename(tmp);
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: projectName, bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.1",
        completedAt: "2026-04-30T12:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });

    const report = await diffState({
      statePath,
      projectRoot: tmp,
      bmadVersion: "6.5.0",
    });

    expect(report.divergences.length).toBe(0);
    expect(report.humanReadable).toBe(
      "state.yaml is in sync with files of truth (no divergence detected)",
    );
  });

  it("Test B — single-field divergence (lastSuccessfulStep step name)", async () => {
    await writeArtifact("implementation", "code-review-3-2.md", {
      title: "code-review",
      status: "done",
      step: "code-review",
      epic: 3,
      story_id: "3.2",
      last_updated: "2026-04-30T12:30:00Z",
    });
    const projectName = path.basename(tmp);
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: projectName, bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "dev-story",
        epic: 3,
        story: "3.2",
        completedAt: "2026-04-30T12:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });

    const report = await diffState({
      statePath,
      projectRoot: tmp,
      bmadVersion: "6.5.0",
    });

    expect(report.divergences.length).toBe(1);
    expect(report.divergences[0]?.field).toBe("lastSuccessfulStep");
    expect(report.humanReadable).toContain("cached=");
    expect(report.humanReadable).toContain("recomputed=");
    expect(report.humanReadable.startsWith("state.yaml diverges")).toBe(true);
  });

  it("Test C — multi-field divergence (lastSuccessfulStep + project.name)", async () => {
    await writeArtifact("implementation", "code-review.md", {
      title: "review",
      status: "done",
      step: "code-review",
      epic: 3,
      story_id: "3.2",
      last_updated: "2026-04-30T12:30:00Z",
    });
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: "different-name", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "dev-story",
        epic: 3,
        story: "3.2",
        completedAt: "2026-04-30T12:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });

    const report = await diffState({
      statePath,
      projectRoot: tmp,
      bmadVersion: "6.5.0",
    });

    expect(report.divergences.length).toBe(2);
    const fields = report.divergences.map((d) => d.field).sort();
    expect(fields).toEqual(["lastSuccessfulStep", "project.name"]);
    // Multi-line: header + 2 indented lines.
    const lines = report.humanReadable.split("\n");
    expect(lines.length).toBe(3);
  });

  it("Test D — project.bmadVersion divergence", async () => {
    const projectName = path.basename(tmp);
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: projectName, bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    });

    const report = await diffState({
      statePath,
      projectRoot: tmp,
      bmadVersion: "6.4.0",
    });

    expect(report.divergences.length).toBe(1);
    expect(report.divergences[0]?.field).toBe("project.bmadVersion");
    expect(report.divergences[0]?.cached).toBe("6.5.0");
    expect(report.divergences[0]?.recomputed).toBe("6.4.0");
  });

  it("Test E — verbatim AC-line-847 example format", async () => {
    // Recomputed: code-review epic 3 story 3.2.
    await writeArtifact("implementation", "code-review-3-2.md", {
      title: "review",
      status: "done",
      step: "code-review",
      epic: 3,
      story_id: "3.2",
      last_updated: "2026-04-30T12:30:00Z",
    });
    const projectName = path.basename(tmp);
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: projectName, bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "dev-story",
        epic: 3,
        story: "3.2",
        completedAt: "2026-04-30T11:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });

    const report = await diffState({
      statePath,
      projectRoot: tmp,
      bmadVersion: "6.5.0",
    });

    // The AC-line-847 example is verbatim modulo the 2-space leading indent
    // chosen for visual consistency with Story 3.7's --list bullet style
    // (Open Question 1).
    expect(report.humanReadable).toContain(
      "lastSuccessfulStep: cached=dev-story epic 3 story 3.2; recomputed=code-review epic 3 story 3.2",
    );
  });

  it("Test F — empty state + empty artifact-scan → no divergence", async () => {
    const projectName = path.basename(tmp);
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: projectName, bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    });

    const report = await diffState({
      statePath,
      projectRoot: tmp,
      bmadVersion: "6.5.0",
    });

    expect(report.divergences.length).toBe(0);
    expect(report.humanReadable).toBe(
      "state.yaml is in sync with files of truth (no divergence detected)",
    );
  });

  it("Test G — no-lock invariant (programmatic source-content scan)", async () => {
    const source = await Bun.file(path.join(import.meta.dir, "diff.ts")).text();
    // Forbidden import — diff.ts must not import from src/lock/.
    expect(source).not.toMatch(/from\s+["']\.\.\/lock\//);
    // Forbidden call — diff.ts must not invoke acquire(.
    const code = source
      .split("\n")
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join("\n");
    expect(code).not.toMatch(/\bacquire\(/);
    // Forbidden — must not call the locked loadState variant.
    expect(code).not.toMatch(/\bloadState\(/);
    // Forbidden — must not call the locked recomputeState variant.
    expect(code).not.toMatch(/\brecomputeState\(/);
  });

  it("Test H — runHistory.length divergence (count-only diff per v0.1)", async () => {
    const projectName = path.basename(tmp);
    const statePath = await writeState({
      schemaVersion: 1,
      project: { name: projectName, bmadVersion: "6.5.0" },
      // runHistory has 2 entries; recomputed always yields [].
      // Story 5.1: entries must validate against RunHistoryEntrySchema
      // (typed) — supplying the 8 required fields per AC line 1062.
      runHistory: [
        {
          runId: "r-a",
          step: "a",
          epic: 1,
          story: "1.1",
          attemptNumber: 1,
          outcome: "pass",
          failureCode: null,
          completedAt: "2026-04-30T10:00:00Z",
        },
        {
          runId: "r-b",
          step: "b",
          epic: 1,
          story: "1.2",
          attemptNumber: 1,
          outcome: "pass",
          failureCode: null,
          completedAt: "2026-04-30T11:00:00Z",
        },
      ],
      checkpoints: [],
    });

    const report = await diffState({
      statePath,
      projectRoot: tmp,
      bmadVersion: "6.5.0",
    });

    const runHistoryDiv = report.divergences.find(
      (d) => d.field === "runHistory.length",
    );
    expect(runHistoryDiv).toBeDefined();
    expect(runHistoryDiv?.cached).toBe("2");
    expect(runHistoryDiv?.recomputed).toBe("0");
  });
});
