/**
 * src/upgrade/cli.ts — `bun run upgrade` CLI entrypoint
 * (Story 6.9 — FR48; NFR-S1 EXCEPTION; NFR-S2; AR21, AR33 EXCEPTION,
 * AR41).
 *
 * **MID-TIER MODULE per AR41**. The CLI is the AR33 EXCEPTION — it is
 * allowed to call `process.exit` because it is the TOP of the call
 * stack (per OQ-6 + Story 6.7 OQ-9 precedent). The exported `main(argv)`
 * is testable (returns exit code); the `if (import.meta.main)` terminal
 * block is the only `process.exit` site.
 *
 * **Argv contract**: parameterless. The upgrade check is fully
 * self-contained — it reads `.claude-plugin/plugin.json` from the
 * project root (cwd) and calls the GitHub Releases API. Future flags
 * (e.g., `--upgrade --release-channel beta`, `--upgrade --pin <tag>`)
 * are forward-deferred per Story 6.9 spec "What is NOT in scope".
 *
 * **Exit codes**:
 *   - 0 — success (markdown report written to stdout).
 *   - 1 — failure (network unreachable, rate limit, timeout, missing
 *         plugin manifest, malformed plugin manifest, malformed release
 *         response). The AC-2 verbatim hint is emitted on stderr.
 *
 * **Output**:
 *   - On success: writes the upgrade report to STDOUT via
 *     `process.stdout.write` (per OQ-5 — the AR9 carve-out for
 *     `--upgrade` routes the report to STDOUT directly, mirroring
 *     Story 3.8 `--export-state` and Story 3.9 `--watch` precedents).
 *   - On failure: emits one single-line `error("upgrade: <details>")`
 *     followed by one single-line `error("Could not reach GitHub
 *     Releases. Check your network or try again later.")` (the AC-2
 *     verbatim hint) on STDERR per AR21 single-line discipline.
 *
 * **AR9 stdout JSON-line invariant — third documented carve-out**:
 *   - Story 3.8 `--export-state` (JSON body to stdout).
 *   - Story 3.9 `--watch` (raw transcript to stdout).
 *   - Story 6.9 `--upgrade` (markdown report to stdout). The
 *     standalone `bun run upgrade` script does NOT emit an AR9 line —
 *     it is a CLI tool, not a runner-tier dispatch step.
 *
 * **NFR-S2 read-only guarantee**: the CLI invokes `runUpgradeCheck`
 * which never writes to disk. Enforced by
 * `src/integration/upgrade-no-plugin-write.test.ts`.
 */

import { error } from "../io/log.ts";
import { runUpgradeCheck, type UpgradeCheckResult } from "./check.ts";
import { renderUpgradeReport } from "./render.ts";

/**
 * Main CLI entrypoint. Returns the process exit code.
 *
 * Steps:
 *   1. `runUpgradeCheck({})` — reads plugin manifest + calls GH API +
 *      compares; throws on any failure.
 *   2. On thrown Error: emit `error("upgrade: <message>")` + emit the
 *      AC-2 verbatim hint via `error(...)`; return 1.
 *   3. On success: render via `renderUpgradeReport(result)`; write to
 *      stdout via `process.stdout.write`; return 0.
 *
 * The `argv` parameter is currently unused (the upgrade check is
 * parameterless in v0.1) but retained on the signature for parity with
 * Story 6.7 `src/telemetry/cli.ts` and to anticipate future flags.
 *
 * @param _argv - Process argv (`Bun.argv` in production; unused in v0.1).
 * @returns Exit code (0 success, 1 failure).
 */
export async function main(_argv: string[]): Promise<number> {
  let result: UpgradeCheckResult;
  try {
    result = await runUpgradeCheck({});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`upgrade: ${msg}`);
    // AC-2 verbatim hint per epics.md line 1292 — byte-identical.
    error(
      "Could not reach GitHub Releases. Check your network or try again later.",
    );
    return 1;
  }
  const report = renderUpgradeReport(result);
  process.stdout.write(report);
  return 0;
}

// AR33 EXCEPTION (per OQ-6 + Story 6.7 OQ-9 precedent): CLI entrypoints
// ARE allowed to call `process.exit` because they are the top of the
// call stack. This is the ONLY `process.exit` site in the module.
if (import.meta.main) {
  main(Bun.argv).then((code) => {
    process.exit(code);
  });
}
