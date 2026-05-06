/**
 * src/telemetry/cli.ts — `bun run aggregate-telemetry` CLI entrypoint
 * (Story 6.7 — FR45; NFR-S1, NFR-S2; AR21, AR33 EXCEPTION, AR41).
 *
 * **MID-TIER MODULE per AR41**. The CLI is the AR33 EXCEPTION — it is
 * allowed to call `process.exit` because it is the TOP of the call stack
 * (per OQ-9). The exported `main(argv)` is testable (returns exit code);
 * the `if (import.meta.main)` terminal block is the only `process.exit`
 * site.
 *
 * **Argv contract**: requires `--period <YYYY-MM>` flag. Validates the
 * format with the same regex Story 6.6 uses (`^\d{4}-\d{2}$`). Unknown
 * flags are tolerated (forward-compatible) but the period is REQUIRED.
 *
 * **Exit codes**:
 *   - 0 — success (markdown report written, single-line audit emitted).
 *   - 1 — usage error (missing/invalid period flag) OR data error
 *         (missing JSONL file). NOT exit 2 because this is NOT a
 *         CONFIG_ERROR.
 *
 * **Output**:
 *   - On success: writes `<paths.telemetry>/<period>.md`; emits one
 *     single-line `info()` audit notice on stderr per AR21.
 *   - On error: emits one single-line `error()` notice on stderr per AR21.
 *
 * **AR9 stdout JSON-line invariant preserved**: ZERO stdout writes. The
 * report is written to a FILE; audit and error messages go to stderr.
 */

import * as path from "node:path";
import { loadConfig } from "../config/index.ts";
import { error, info } from "../io/log.ts";
import { assertWithinScope } from "../io/paths.ts";
import { type AggregateResult, aggregateTelemetry } from "./aggregate.ts";
import { renderTelemetryReport } from "./render-report.ts";

/**
 * Parsed argv result. On success: `{ period }`. On failure: `{ error }`
 * with a single-line usage hint suitable for direct `error()` output.
 */
type ParseResult = { period: string } | { error: string };

/**
 * Parse argv into `{ period }` or an error hint. Tolerates extra flags
 * (forward-compatible) but the `--period <YYYY-MM>` flag is REQUIRED.
 *
 * Argv shape: `[bunBin, scriptPath, ...args]` per Bun.argv contract.
 * The parser searches for `--period` in `argv.slice(2)` to skip the
 * script header; tests can pass a synthetic argv directly.
 */
export function parseArgv(argv: string[]): ParseResult {
  const args = argv.slice(2);
  const idx = args.indexOf("--period");
  if (idx === -1 || idx === args.length - 1) {
    return {
      error:
        "telemetry: missing required --period <YYYY-MM> flag (Run `bun run aggregate-telemetry --period 2026-05`)",
    };
  }
  const period = args[idx + 1] as string;
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return {
      error: `telemetry: invalid period format ${period}; expected YYYY-MM (Run \`bun run aggregate-telemetry --period 2026-05\`)`,
    };
  }
  return { period };
}

/**
 * Main CLI entrypoint. Returns the process exit code.
 *
 * Steps:
 *   1. Parse argv → period (or error → exit 1).
 *   2. loadConfig() → resolve `paths.telemetry`.
 *   3. aggregateTelemetry({ period, telemetryRoot }) → catch ENOENT/etc.
 *   4. renderTelemetryReport(aggregate) → markdown string.
 *   5. assertWithinScope(outputPath); Bun.write(outputPath, markdown).
 *   6. info() single-line audit; return 0.
 *
 * @param argv - Process argv (`Bun.argv` in production).
 * @returns Exit code (0 success, 1 error).
 */
export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv);
  if ("error" in parsed) {
    error(parsed.error);
    return 1;
  }
  const { period } = parsed;

  let telemetryRoot: string;
  try {
    const config = await loadConfig();
    telemetryRoot = config.paths.telemetry;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`telemetry: failed to load config: ${msg}`);
    return 1;
  }

  let aggregate: AggregateResult;
  try {
    aggregate = await aggregateTelemetry({ period, telemetryRoot });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(msg);
    return 1;
  }

  const markdown = renderTelemetryReport(aggregate);
  const outputPath = path.join(telemetryRoot, `${period}.md`);
  try {
    assertWithinScope(outputPath);
    await Bun.write(outputPath, markdown);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`telemetry: failed to write report at ${outputPath}: ${msg}`);
    return 1;
  }

  info(
    `telemetry: aggregated ${aggregate.totalRecords} records → ${outputPath}`,
  );
  return 0;
}

// AR33 EXCEPTION (per OQ-9): CLI entrypoints ARE allowed to call
// process.exit because they are the top of the call stack. This is the
// ONLY process.exit site in the module.
if (import.meta.main) {
  main(Bun.argv).then((code) => {
    process.exit(code);
  });
}
