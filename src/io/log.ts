/**
 * src/io/log.ts — Stepper logger with stdout/stderr discipline (FR54, AR33).
 *
 * Foundational module per AR41: zero upward imports, zero `console.*` usage.
 * `info`/`warn`/`error` write diagnostic, human-readable output to stderr.
 * `json` writes machine-readable output to stdout (reserved for `--export-state`
 * per FR54, so diagnostics never leak into the JSON channel).
 *
 * Every record is line-delimited (trailing `\n`) so callers can pipe through
 * `jq` or read the channel line-by-line. The module body uses
 * `process.stdout.write` / `process.stderr.write` directly — Biome's
 * `suspicious.noConsole` rule blocks every `console.*` call project-wide
 * (the rule was renamed from `noConsoleLog` in Biome 2.3.x; see AC-1 note).
 */

export function info(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function error(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function json(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
