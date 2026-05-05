/**
 * src/integration/auto-archival-startup.test.ts — Story 6.8 PRIMARY
 * integration test for AC-1/AC-2/AC-3/AC-4 (epics.md lines 1269-1276).
 *
 * Mirrors the placement of `aggregate-telemetry-no-pii.test.ts`.
 *
 * Cross-link: AC-1 (epics.md line 1271); AC-2 (line 1274); AC-3 (line
 * 1275); AC-4 (line 1276); NFR-Sc4 (architecture line 1413); NFR-Sc5
 * (architecture line 1414).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Config } from "../schemas/config.ts";
import { runArchivalAtStartup } from "../startup/archival-trigger.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-archival-int-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

async function writeFileWithMtime(
  filePath: string,
  content: string,
  mtime: Date,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  const sec = mtime.getTime() / 1000;
  await fs.utimes(filePath, sec, sec);
}

async function listInventory(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full);
      out.push(rel);
      if (e.isDirectory()) {
        await walk(full);
      }
    }
  }
  await walk(root);
  return out.sort();
}

function makeConfig(args: {
  runsRoot: string;
  telemetryRoot: string;
  telemetryEnabled: boolean;
}): Pick<Config, "paths" | "telemetry"> {
  return {
    paths: {
      state: path.join(args.runsRoot, "..", "state.yaml"),
      runs: args.runsRoot,
      staging: path.join(args.runsRoot, "..", "staging"),
      telemetry: args.telemetryRoot,
    },
    telemetry: { enabled: args.telemetryEnabled },
  };
}

describe("auto-archival startup integration — AC-1/AC-2/AC-3/AC-4", () => {
  it("archives old runs + telemetry; new files stay; idempotent on second call", async () => {
    const runsRoot = path.join(tmp, "runs");
    const telemetryRoot = path.join(tmp, "telemetry");

    // Setup: 3 OLD paired run files (.log + .json) + 2 NEW run files.
    const oldRuns = new Date("2026-01-15T10:00:00Z"); // > 90d ago
    const newRuns = new Date(); // now → fresh
    const oldTel = new Date("2024-01-01T00:00:00Z"); // > 12m ago
    const newTel = new Date();

    // Old paired files (3).
    for (const ts of ["2026-01-15T10-00-00", "2026-01-15T11-00-00"]) {
      await writeFileWithMtime(
        path.join(runsRoot, `${ts}-create-story.log`),
        "log",
        oldRuns,
      );
      await writeFileWithMtime(
        path.join(runsRoot, `${ts}-create-story.json`),
        "{}",
        oldRuns,
      );
    }
    // One more old file unpaired.
    await writeFileWithMtime(
      path.join(runsRoot, "2026-01-20T08-00-00-dev-story.log"),
      "log",
      oldRuns,
    );

    // 2 new runs files.
    await writeFileWithMtime(
      path.join(runsRoot, "2026-04-30T11-00-00-create-story.log"),
      "log",
      newRuns,
    );
    await writeFileWithMtime(
      path.join(runsRoot, "2026-04-30T11-00-00-create-story.json"),
      "{}",
      newRuns,
    );

    // Old telemetry (jsonl + md).
    await writeFileWithMtime(
      path.join(telemetryRoot, "2024-01.jsonl"),
      "{}",
      oldTel,
    );
    await writeFileWithMtime(
      path.join(telemetryRoot, "2024-01.md"),
      "# old report",
      oldTel,
    );
    // New telemetry.
    await writeFileWithMtime(
      path.join(telemetryRoot, "2026-04.jsonl"),
      "{}",
      newTel,
    );

    const config = makeConfig({
      runsRoot,
      telemetryRoot,
      telemetryEnabled: true,
    });
    const ref = { fired: false };

    // FIRST INVOCATION.
    const first = await runArchivalAtStartup({
      config,
      oncePerSessionRef: ref,
    });

    // AC-1: 5 old runs files moved.
    expect(first.archivedRuns).toBe(5);
    // AC-2: 2 old telemetry files moved.
    expect(first.rotatedTelemetry).toBe(2);
    expect(first.alreadyFired).toBe(false);

    // AC-1 verify: old runs moved to .archive/<YYYY-MM>/.
    await expect(
      fs.access(
        path.join(
          runsRoot,
          ".archive",
          "2026-01",
          "2026-01-15T10-00-00-create-story.log",
        ),
      ),
    ).resolves.toBeNull();
    await expect(
      fs.access(
        path.join(
          runsRoot,
          ".archive",
          "2026-01",
          "2026-01-15T10-00-00-create-story.json",
        ),
      ),
    ).resolves.toBeNull();

    // AC-1 verify: new runs stay.
    await expect(
      fs.access(path.join(runsRoot, "2026-04-30T11-00-00-create-story.log")),
    ).resolves.toBeNull();

    // AC-2 verify: old telemetry moved to flat .archive/.
    await expect(
      fs.access(path.join(telemetryRoot, ".archive", "2024-01.jsonl")),
    ).resolves.toBeNull();
    await expect(
      fs.access(path.join(telemetryRoot, ".archive", "2024-01.md")),
    ).resolves.toBeNull();
    // AC-2 verify: new telemetry stays.
    await expect(
      fs.access(path.join(telemetryRoot, "2026-04.jsonl")),
    ).resolves.toBeNull();

    // AC-3: snapshot inventory before second call; assert byte-identical
    // after second call.
    const beforeRuns = await listInventory(runsRoot);
    const beforeTel = await listInventory(telemetryRoot);

    // SECOND INVOCATION (within same ref) — no fs mutation expected.
    const second = await runArchivalAtStartup({
      config,
      oncePerSessionRef: ref,
    });

    expect(second.alreadyFired).toBe(true);
    expect(second.archivedRuns).toBe(0);
    expect(second.rotatedTelemetry).toBe(0);

    const afterRuns = await listInventory(runsRoot);
    const afterTel = await listInventory(telemetryRoot);

    expect(afterRuns).toEqual(beforeRuns);
    expect(afterTel).toEqual(beforeTel);

    // AC-4 (audit notice + non-blocking): the function returned a
    // Promise; it resolved with the result object. The audit notice was
    // emitted to stderr by the orchestrator (verified in unit test
    // TRIGGER_68_AUDIT_NOTICE_FORMAT_1).
  });

  it("third call with FRESH ref also archives 0 (across-session no-op)", async () => {
    const runsRoot = path.join(tmp, "runs");
    const telemetryRoot = path.join(tmp, "telemetry");

    const oldRuns = new Date("2026-01-15T10:00:00Z");
    await writeFileWithMtime(path.join(runsRoot, "old.log"), "x", oldRuns);

    const config = makeConfig({
      runsRoot,
      telemetryRoot,
      telemetryEnabled: false,
    });

    const first = await runArchivalAtStartup({
      config,
      oncePerSessionRef: { fired: false },
    });
    expect(first.archivedRuns).toBe(1);

    // Simulate a SEPARATE Bun process (fresh ref).
    const second = await runArchivalAtStartup({
      config,
      oncePerSessionRef: { fired: false },
    });
    expect(second.alreadyFired).toBe(false);
    // The first call moved the file → second finds nothing left.
    expect(second.archivedRuns).toBe(0);
  });
});
