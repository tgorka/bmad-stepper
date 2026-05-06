/**
 * src/dispatch/generate-spec.ts — buildDispatchSpec() orchestrator
 * (FR16, FR18, NFR-P3, NFR-S4, NFR-R1, NFR-S1, AR7, AR21, AR22, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports:
 *   - foundational: `../errors.ts` (ConfigError + hintOverride? per Story 1.11),
 *     `../io/log.ts` (info() — stderr discipline FR54),
 *     `../io/paths.ts` (STAGING_PATH constant — added in Story 2.2 Task 1),
 *     `../io/atomic-write.ts` (atomicWrite — NFR-R1 + .bak rotation),
 *     `../schemas/dispatch-spec.ts` (DispatchSpecV1Schema — defence-in-depth Zod parse),
 *     `../schemas/state.ts` (State type for input).
 *   - intra-module siblings: `./types.ts`.
 *   - Bun stdlib: none directly (atomicWrite handles Bun.write internally).
 *   - Node stdlib: `node:fs/promises` (mkdir), `node:path` (join),
 *     `node:crypto` (randomUUID for the runId entropy suffix).
 *
 * **FORBIDDEN** imports:
 *   - sibling higher-tier (`../verifiers/`, `../failure-ux/`).
 *   - top-tier (`../commands/`).
 *   - `node:child_process` (use `Bun.spawn` if ever needed; v0.1 has no
 *     subprocess work).
 *   - any new external runtime dep beyond `zod` (transitively pulled by
 *     `../schemas/dispatch-spec.ts`).
 *
 * Algorithm (architecture §P5 lines 864-917 + Story 2.2 §Tasks 5):
 *   1. Resolve options: stagingRoot defaults to STAGING_PATH; nowIso
 *      defaults to new Date().toISOString().
 *   2. Generate runId per architecture §P5 line 871 example:
 *      `<YYYY-MM-DDTHH-mm-ss>-<stepName>-<5-char-random>`.
 *   3. Resolve epic/story/phase (defensive defaults; phase not in V1 schema
 *      — see dev-001 deviation in Story 2.2 Completion Notes).
 *   4. Construct stagingDir + create staging/<runId>/{inputs/, outputs/}.
 *   5. Construct DispatchSpecV1 literal with v0.1-conservative defaults
 *      (empty context[], generic task text, generic successCriteria[],
 *      AR-mandated constraints.allowedTools + scopeLimits).
 *   6. Defence-in-depth Zod validation: DispatchSpecV1Schema.parse().
 *   7. Atomic write to staging/<runId>/dispatch-spec.json.
 *   8. Return { runId, dispatchSpec, stagingDir, dispatchSpecPath }.
 *
 * Error handling:
 *   - Empty/whitespace stepName → ConfigError with AC-aligned hintOverride.
 *   - Schema-parse failure → ConfigError wrapping the Zod issue.
 *   - Filesystem errors propagate to caller.
 *
 * Story 6.3 (`models:` per-step config consumer wiring):
 *   - The `model` field (DispatchSpecV1Schema.model: z.string()) is
 *     populated from `input.modelOverride ?? "sonnet"` at Step 5. The
 *     caller (src/commands/next/run.ts) sources `modelOverride` from
 *     `opts.config?.models?.[stepName]` (Story 6.1 typed Config.models).
 *   - The Step 8 info() log line includes the resolved model substring
 *     `(model ${dispatchSpec.model})` per AC-3. Single-line preserved.
 *   - The DispatchSpecV1Schema.model remains `z.string()` (open shape) at
 *     the dispatch-spec.json file boundary — validation is at the
 *     LOADER layer per AR42 (forward-tracker I-40).
 *
 * Story 6.4 (`budgets:` per-step config consumer wiring):
 *   - The `budget.contextTokens` + `budget.timeoutMs` fields are populated
 *     from `input.budgetOverride?.{contextTokens,timeoutMs} ?? {60_000,300_000}`
 *     at Step 5. The caller sources `budgetOverride` from
 *     `opts.config?.budgets?.[stepName]` (Story 6.1 typed Config.budgets).
 *   - The Step 8 info() log line ADDITIONALLY includes the budget substring
 *     `(model X, budget <ctxTokens>/<timeoutMs>ms)` ONLY when the resolved
 *     budget differs from defaults (60_000 / 300_000) per AC-3. When at
 *     defaults, the log line stays at the Story 6.3 shape (no budget
 *     substring) — minimises log noise for the common case. Full audit
 *     trail is in the markdown transcript Section 2 (Story 6.3 baseline)
 *     + JSON run log (Story 2.5 baseline).
 *   - Single-line constraint preserved (template literal concatenation; no
 *     `\n`/`\r` per AR21+22 progress-log discipline).
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ConfigError } from "../errors.ts";
import { atomicWrite } from "../io/atomic-write.ts";
import { info } from "../io/log.ts";
import { STAGING_PATH } from "../io/paths.ts";
import {
  type DispatchSpecV1,
  DispatchSpecV1Schema,
} from "../schemas/dispatch-spec.ts";
import type { DispatchSpecInput, Phase } from "./types.ts";

/**
 * Input shape for buildDispatchSpec(). Extends DispatchSpecInput with
 * test-injection escape hatches (stagingRoot, nowIso) and v0.1
 * dev-001-deviation OPTIONAL epic/story/phase fields (the State shape
 * exposes epic + story but NOT phase, so callers may pass phase
 * explicitly or accept the "implementation" default).
 *
 * Story 2.4 carry-over closure (Story 2.2 senior dev info-3): the
 * OPTIONAL `contextRefs` + `requiredSections` fields below allow Story
 * 2.4's runner (`src/commands/next/run.ts`) to populate
 * `taskSpec.context[]` (from the resolved DAG node's `after[]` list +
 * canonical artifact-path mapping) and
 * `taskSpec.outputFormat.requiredSections` (from Story 2.1's verifier
 * registry via `getVerifierConfig(stepName).requiredFrontmatterSections`).
 * Both are additive optional fields — when not supplied, the v0.1
 * empty-array defaults are preserved (Story 2.2's existing tests
 * continue to pass without modification).
 */
export interface BuildDispatchSpecInput extends DispatchSpecInput {
  /** Tmpdir override for tests; defaults to STAGING_PATH. */
  readonly stagingRoot?: string;
  /** Injectable timestamp for deterministic test runs. */
  readonly nowIso?: string;
  /**
   * v0.1 dev-001 deviation: optional epic/story/phase override. The State
   * shape (Story 1.5/1.6) exposes epic + story via lastSuccessfulStep /
   * lastAttempted, but NOT phase. Callers (Story 2.4 run.ts) may pass
   * phase explicitly; defaults derived from State or fall through to
   * "implementation".
   */
  readonly epic?: number;
  readonly story?: string;
  readonly phase?: Phase;
  /**
   * Optional context-references list to populate `taskSpec.context[]`.
   * Each entry pairs an artifact path (relative to project root) with a
   * human-readable label. When omitted, defaults to `[]` (Story 2.2 v0.1
   * conservative default). The `label` field is optional; when omitted
   * the path is used as the label.
   *
   * Story 2.4 populates this from the resolved DAG node's `after[]`
   * prerequisite list, mapping each prerequisite step name to its
   * canonical artifact path under `_bmad-output/`.
   */
  readonly contextRefs?: ReadonlyArray<{
    readonly path: string;
    readonly label?: string;
  }>;
  /**
   * Optional required-sections list to populate
   * `taskSpec.outputFormat.requiredSections`. When omitted, defaults to
   * `[]` (Story 2.2 v0.1 conservative default).
   *
   * Story 2.4 populates this from Story 2.1's verifier registry via
   * `getVerifierConfig(stepName).requiredFrontmatterSections`.
   */
  readonly requiredSections?: readonly string[];
}

export interface BuildDispatchSpecResult {
  readonly runId: string;
  readonly dispatchSpec: DispatchSpecV1;
  /** Absolute path to staging/<runId>/. */
  readonly stagingDir: string;
  /** Absolute path to staging/<runId>/dispatch-spec.json. */
  readonly dispatchSpecPath: string;
}

/**
 * Builds the dispatch spec, creates the staging directory tree, and writes
 * the spec atomically. Returns the populated result for the caller (Story
 * 2.4 run.ts) to consume.
 *
 * Throws:
 *   - `ConfigError` (CONFIG_ERROR, exitCode 2) if `stepName` is empty/whitespace.
 *   - `ConfigError` (CONFIG_ERROR, exitCode 2) if the constructed spec fails
 *     `DispatchSpecV1Schema.parse()` (defence-in-depth caller-bug guard).
 *   - `ScopeViolationError` (SCOPE_VIOLATION, exitCode 5) propagates
 *     transitively from `assertWithinScope` (called inside `atomicWrite`).
 */
export async function buildDispatchSpec(
  input: BuildDispatchSpecInput,
): Promise<BuildDispatchSpecResult> {
  // Step 0: validate stepName (AR21/AR22 — actionable hint).
  if (
    typeof input.stepName !== "string" ||
    input.stepName.trim().length === 0
  ) {
    throw new ConfigError(
      `dispatch: stepName is empty or whitespace`,
      `received: ${JSON.stringify(input.stepName)}`,
      "Add the step name to the bmad-stepper.config.yaml steps: block.",
    );
  }

  // Step 1: resolve options.
  const stagingRoot = input.stagingRoot ?? STAGING_PATH;
  const nowIso = input.nowIso ?? new Date().toISOString();

  // Step 2: generate runId.
  // Architecture §P5 line 871 example: `2026-04-29T10-15-00-dev-story-abc12`.
  // Strip milliseconds + Z, replace `:` with `-` so the runId is filesystem-safe.
  const tsPart = nowIso.replace(/\.\d{3}Z$/, "").replace(/:/g, "-");
  // node:crypto.randomUUID() returns 36-char hex with dashes; slice first 5
  // hex chars (excluding dashes by replacing them first) for the entropy
  // suffix per the architecture example.
  const entropy = randomUUID().replace(/-/g, "").slice(0, 5);
  const runId = `${tsPart}-${input.stepName}-${entropy}`;

  // Step 3: resolve epic/story/phase from state with defensive defaults.
  // Story 2.2 dev-001 deviation: phase is NOT in the State shape, so the
  // caller may pass phase explicitly OR accept the "implementation" default.
  const epicFromState =
    input.state?.lastAttempted?.epic ?? input.state?.lastSuccessfulStep?.epic;
  const storyFromState =
    input.state?.lastAttempted?.story ?? input.state?.lastSuccessfulStep?.story;
  const epic = input.epic ?? epicFromState ?? 0;
  const story = input.story ?? storyFromState ?? "0.0";
  const phase: Phase = input.phase ?? "implementation";

  // Step 4: construct staging directory tree.
  const stagingDir = path.join(stagingRoot, runId);
  const inputsDir = path.join(stagingDir, "inputs");
  const outputsDir = path.join(stagingDir, "outputs");
  await fs.mkdir(inputsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  // Step 5: construct DispatchSpecV1 literal with v0.1-conservative defaults.
  // The `phase` field is documented in the human-readable task text but
  // NOT a strict schema field (Story 2.2 dev-001 + AC drift note).
  const dispatchSpec: DispatchSpecV1 = {
    schemaVersion: 1,
    runId,
    step: input.stepName,
    epic,
    story,
    model: input.modelOverride ?? "sonnet",
    budget: {
      contextTokens: input.budgetOverride?.contextTokens ?? 60_000,
      timeoutMs: input.budgetOverride?.timeoutMs ?? 300_000,
    },
    taskSpec: {
      persona: input.persona,
      context:
        input.contextRefs?.map(({ path: refPath, label }) => ({
          path: refPath,
          label: label ?? refPath,
        })) ?? [],
      task: `Execute BMAD step ${input.stepName} (phase ${phase}) per the dispatch-spec contract.`,
      outputFormat: {
        fileLocation: `staging/${runId}/outputs/${input.stepName}.md`,
        requiredSections: input.requiredSections ?? [],
      },
      successCriteria: [
        `Artifact at staging/${runId}/outputs/${input.stepName}.md exists and passes verifier.`,
      ],
      constraints: {
        allowedTools: ["Read", "Write", "Edit", "Grep", "Bash"],
        scopeLimits: `Only files inside staging/${runId}/ may be written.`,
      },
    },
  };

  // Step 6: defence-in-depth Zod validation.
  try {
    DispatchSpecV1Schema.parse(dispatchSpec);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ConfigError(
      `dispatch: constructed DispatchSpecV1 failed schema validation`,
      detail,
      "Run /bmad-next --doctor to diagnose the malformed state.yaml or step registry.",
    );
  }

  // Step 7: atomic write.
  const dispatchSpecPath = path.join(stagingDir, "dispatch-spec.json");
  await atomicWrite(dispatchSpecPath, JSON.stringify(dispatchSpec, null, 2));

  // Step 8: progress log to stderr (FR54).
  // Story 6.3 AC-3 — extended single-line info() log includes the model
  // resolved by Step 5 (config.models[step] ?? "sonnet" — wired by the
  // runner via input.modelOverride). Single-line preserved (template
  // literal; no `\n`/`\r` per AR21+22 progress-log discipline).
  // Story 6.4 AC-3 — additionally surfaces the budget substring
  // `, budget <ctxTokens>/<timeoutMs>ms` ONLY when the resolved budget
  // differs from defaults (60_000 / 300_000) — minimises log noise for
  // the common case. Full audit in markdown transcript + JSON run log.
  const isDefaultBudget =
    dispatchSpec.budget.contextTokens === 60_000 &&
    dispatchSpec.budget.timeoutMs === 300_000;
  const budgetSubstring = isDefaultBudget
    ? ""
    : `, budget ${dispatchSpec.budget.contextTokens}/${dispatchSpec.budget.timeoutMs}ms`;
  info(
    `dispatch: built spec for step ${input.stepName} (model ${dispatchSpec.model}${budgetSubstring}) at ${dispatchSpecPath}`,
  );

  return { runId, dispatchSpec, stagingDir, dispatchSpecPath };
}
