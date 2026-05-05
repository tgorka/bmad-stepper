/**
 * src/telemetry/render-report.ts — Pure markdown renderer for telemetry
 * aggregation report (Story 6.7 — FR45; NFR-S3, AR41, AR9, AR17).
 *
 * **MID-TIER MODULE per AR41**. Allowed imports: foundational only +
 * sibling type-only import. The renderer is PURE — no IO, no time
 * dependencies — `renderTelemetryReport(aggregate)` returns a markdown
 * STRING. Mirrors Story 2.5's `renderMarkdown(input)` separation of
 * concerns: the renderer produces a string; the CLI runner separately
 * writes via `Bun.write`.
 *
 * **Layout (5 H2 sections after H1)** in canonical order:
 *   1. `# Telemetry Aggregate — <period>` (H1).
 *   2. `## Summary` — record count, period range, distinct steps, parse error count.
 *   3. `## Per-step aggregates` — table: count, mean / p95 duration,
 *      retry rate, verifier-fail rate, mean tokens (in/out/total).
 *   4. `## Verifier outcomes` — per-status table (pass/fail/skip).
 *   5. `## Failure patterns` — per-errorCode table OR "None observed."
 *      when empty.
 *   6. `## Schema notes` — static block referencing TelemetryRecordV1Schema
 *      + NFR-S3 closed-set whitelist.
 *
 * **Determinism**: per-step rows ALPHABETIZED by step name; failurePatterns
 * sorted by count descending then errorCode ascending. The same input
 * always produces the same output (RPT_67_DETERMINISTIC_*).
 *
 * **AR9 stdout JSON-line invariant**: this function returns a string
 * (does NOT print). The caller (cli.ts) writes to a markdown FILE.
 *
 * **AR17 + NFR-S3 no-PII**: the renderer only consumes the AggregateResult
 * shape — derived numerical metrics + step / persona / model names +
 * verifier statuses + error codes. None of these are PII per the
 * closed-set definition. The integration test sweeps ~10 known-PII
 * surfaces against the rendered output for belt-and-braces verification.
 */

import type { AggregateResult, PerStepAggregate } from "./aggregate.ts";

/** Format a 0..1 rate as an integer percent ("8%"). */
function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Format a decimal rate (e.g., retry rate) with 2 decimal places. */
function fmtRate(value: number): string {
  return value.toFixed(2);
}

/**
 * Render the Summary H2 section. Bulleted list with record count, period
 * range, distinct steps, parse error count.
 */
function renderSummary(agg: AggregateResult): string {
  const lines: string[] = [];
  lines.push("## Summary");
  lines.push("");
  lines.push(
    `- Records: ${agg.totalRecords} (parsed) + ${agg.parseErrorCount} (skipped malformed)`,
  );
  if (agg.firstTs !== undefined && agg.lastTs !== undefined) {
    lines.push(`- Period range: ${agg.firstTs} → ${agg.lastTs}`);
  } else {
    lines.push("- Period range: (no records)");
  }
  lines.push(`- Distinct steps: ${agg.distinctSteps}`);
  return lines.join("\n");
}

/**
 * Render the Per-step aggregates H2 section. Table with 7 columns:
 * Step | Count | Mean ms | p95 ms | Retry rate | Verifier-fail rate |
 * Mean tokens (in/out/total). Rows alphabetized by step name.
 */
function renderPerStep(agg: AggregateResult): string {
  const lines: string[] = [];
  lines.push("## Per-step aggregates");
  lines.push("");
  lines.push(
    "| Step | Count | Mean ms | p95 ms | Retry rate | Verifier-fail rate | Mean tokens (in/out/total) |",
  );
  lines.push(
    "|------|------:|--------:|-------:|-----------:|-------------------:|---------------------------:|",
  );
  const entries = Object.entries(agg.perStep).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length === 0) {
    lines.push("| (none) | 0 | 0 | 0 | 0.00 | 0% | 0 / 0 / 0 |");
  } else {
    for (const [step, agg2] of entries) {
      lines.push(renderPerStepRow(step, agg2));
    }
  }
  return lines.join("\n");
}

function renderPerStepRow(step: string, agg: PerStepAggregate): string {
  return `| ${step} | ${agg.count} | ${agg.meanDurationMs} | ${agg.p95DurationMs} | ${fmtRate(agg.retryRate)} | ${fmtPct(agg.verifierFailureRate)} | ${agg.meanTokensIn} / ${agg.meanTokensOut} / ${agg.meanTokensTotal} |`;
}

/**
 * Render the Verifier outcomes H2 section. Per-status table (pass/fail/skip)
 * with count and percentage columns.
 */
function renderVerifierOutcomes(agg: AggregateResult): string {
  const { pass, fail, skip } = agg.verifierOutcomes;
  const total = pass + fail + skip;
  const pct = (n: number): string => (total === 0 ? "0%" : fmtPct(n / total));

  const lines: string[] = [];
  lines.push("## Verifier outcomes");
  lines.push("");
  lines.push("| Status | Count | Percentage |");
  lines.push("|--------|------:|-----------:|");
  lines.push(`| pass | ${pass} | ${pct(pass)} |`);
  lines.push(`| fail | ${fail} | ${pct(fail)} |`);
  lines.push(`| skip | ${skip} | ${pct(skip)} |`);
  return lines.join("\n");
}

/**
 * Render the Failure patterns H2 section. When `failurePatterns` is
 * empty, render "None observed." paragraph (no table). Otherwise a
 * per-errorCode table sorted by count desc then errorCode asc.
 */
function renderFailurePatterns(agg: AggregateResult): string {
  const lines: string[] = [];
  lines.push("## Failure patterns");
  lines.push("");
  const entries = Object.entries(agg.failurePatterns);
  if (entries.length === 0) {
    lines.push("None observed.");
    return lines.join("\n");
  }
  // Sort by count desc, errorCode asc.
  entries.sort(([a, ca], [b, cb]) => {
    if (cb !== ca) {
      return cb - ca;
    }
    return a.localeCompare(b);
  });
  const total = agg.totalRecords;
  lines.push("| Error code | Count | Rate (of records) |");
  lines.push("|------------|------:|------------------:|");
  for (const [code, count] of entries) {
    const rate = total === 0 ? "0%" : fmtPct(count / total);
    lines.push(`| ${code} | ${count} | ${rate} |`);
  }
  return lines.join("\n");
}

/** Render the Schema notes H2 section. Static block. */
function renderSchemaNotes(period: string): string {
  return [
    "## Schema notes",
    "",
    `Generated from \`${period}.jsonl\` records validated against`,
    "`TelemetryRecordV1Schema` (closed-set 12-field whitelist per NFR-S3).",
    "No PII, no source content.",
  ].join("\n");
}

/**
 * Render an AggregateResult to a structured markdown report.
 *
 * **Pure function**: no IO, deterministic per input. The same
 * AggregateResult always produces the same string (RPT_67_DETERMINISTIC_*).
 *
 * **Layout** in canonical order:
 *   1. `# Telemetry Aggregate — <period>` (H1).
 *   2. `## Summary`
 *   3. `## Per-step aggregates`
 *   4. `## Verifier outcomes`
 *   5. `## Failure patterns`
 *   6. `## Schema notes`
 *
 * Sections separated by `\n\n`. Trailing `\n` ensures POSIX-friendly line
 * termination on write.
 *
 * @param aggregate - AggregateResult from `aggregateTelemetry(...)`.
 * @returns Markdown string suitable for direct write to `<period>.md`.
 */
export function renderTelemetryReport(aggregate: AggregateResult): string {
  const sections = [
    `# Telemetry Aggregate — ${aggregate.period}`,
    renderSummary(aggregate),
    renderPerStep(aggregate),
    renderVerifierOutcomes(aggregate),
    renderFailurePatterns(aggregate),
    renderSchemaNotes(aggregate.period),
  ];
  return `${sections.join("\n\n")}\n`;
}
