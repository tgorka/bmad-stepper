/**
 * src/runs/types.ts — Public type surface for the runs (transcript) module
 * (FR18, FR43, FR44, FR46, FR54, AR25, AR26, AR41).
 *
 * **MID-TIER module per AR41** (architecture lines 1278-1282). Allowed
 * imports: foundational only — `../schemas/run-log.ts` for the typed
 * `RunLogV1` re-export. NO upward imports (no `dispatch/`, `verifiers/`,
 * `commands/`, `state/`, `dag/`, `personas/`, `failure-ux/`).
 *
 * Story 2.5 ships the canonical `TranscriptInput` shape — the structured
 * input both `renderTranscriptMarkdown()` and `buildRunLog()` consume — plus
 * the `WriteStepTranscriptInput` / `WriteStepTranscriptResult` writer-specific
 * shapes. Architecture references:
 *   - §F line 547 (markdown transcript shape).
 *   - §F line 548 (JSON run log shape — mirrors `RunLogV1Schema`).
 *   - §P5 lines 793-847 (worked example — JSON + markdown verbatim).
 *   - §line 365 (`<ts>` filesystem-safe convention `YYYY-MM-DDTHH-mm-ss`).
 */

/**
 * The canonical structured input both `renderTranscriptMarkdown()` and
 * `buildRunLog()` consume. The shape is the SUPERSET of fields needed by
 * the AR25 markdown sections and the AR26 JSON schema, partitioned to keep
 * the renderers pure (no IO, no time-of-call dependencies).
 */
export interface TranscriptInput {
  /** Stable run identifier from the dispatch (Story 2.2 — `<ts>-<step>-<short-uuid>`). */
  readonly runId: string;
  /** BMAD step name (e.g., "bmad-create-prd", "bmad-dev-story"). */
  readonly stepName: string;
  /** Optional epic number (e.g., 2). NULL when not applicable. */
  readonly epic: number | null;
  /** Optional story id (e.g., "2.5"). NULL when not applicable. */
  readonly story: string | null;
  /** BMAD phase (planning | implementation | analysis | …). NULL when not applicable. */
  readonly phase: string | null;
  /** Resolved persona (Story 1.11 — single string post-pickFirstPersona). */
  readonly persona: string | null;
  /** Model name from the dispatch spec (Story 2.2 — defaults to "sonnet"). */
  readonly model: string | null;
  /** Budget snapshot from the dispatch spec (Story 2.2 — { contextTokens, timeoutMs }). */
  readonly budget: {
    readonly contextTokens: number;
    readonly timeoutMs: number;
  } | null;
  /** Inputs passed to the sub-agent — list of {path, label} from the dispatch spec's taskSpec.context. */
  readonly inputs: ReadonlyArray<{
    readonly path: string;
    readonly label: string;
  }>;
  /** The 6-section sub-agent prompt rendered as a single string (architecture §P5 lines 824-830). */
  readonly subAgentPrompt: string;
  /** Sub-agent output excerpt — first 2,000 chars; renderer adds the truncation marker if longer. */
  readonly subAgentOutput: string;
  /** Verifier result snapshot (Story 2.1 / `VerifierResultV1` shape). */
  readonly verifierResult: {
    readonly status: "pass" | "fail" | "skip";
    readonly checks: ReadonlyArray<{
      readonly name: string;
      readonly status: "pass" | "fail" | "skip";
      readonly detail: string;
    }>;
    readonly promotedTo: string | null;
  };
  /** State snapshot before promotion. */
  readonly stateBefore: {
    readonly lastSuccessfulStep: string | null;
    readonly lastAttempted: string | null;
  };
  /** State snapshot after promotion. */
  readonly stateAfter: {
    readonly lastSuccessfulStep: string | null;
    readonly lastAttempted: string | null;
  };
  /** Outcome line for the markdown `## Outcome` section. */
  readonly outcome: string;
  /** Wall-clock duration of the dispatch in milliseconds. */
  readonly durationMs: number;
  /** Sub-agent input tokens. */
  readonly tokensIn: number;
  /** Sub-agent output tokens. */
  readonly tokensOut: number;
  /** Optional list of error records for the run-log JSON `errors[]` field (default []). */
  readonly errors?: ReadonlyArray<unknown>;
  /**
   * Optional ISO timestamp for `<ts>` derivation; defaults to runId's leading
   * prefix (when conforming) or `new Date().toISOString()`. Test-injected for
   * deterministic filenames.
   */
  readonly nowIso?: string;
}

/**
 * Writer-specific input. Extends TranscriptInput with a test-injection
 * escape hatch for the runs root directory (defaults to
 * `${STEPPER_INTERNAL_ROOT}/runs` per architecture §D7 line 347).
 */
export interface WriteStepTranscriptInput extends TranscriptInput {
  /** Override the canonical runs root for tests; defaults to `${STEPPER_INTERNAL_ROOT}/runs`. */
  readonly runsRoot?: string;
}

/**
 * Result of writeStepTranscript() — the canonical paths the caller (Story
 * 2.6) records into its FR18 summary line.
 */
export interface WriteStepTranscriptResult {
  /** Absolute path to the markdown transcript that was written. */
  readonly markdownPath: string;
  /** Absolute path to the JSON run log that was written. */
  readonly jsonPath: string;
  /** The `<ts>` segment derived for the filenames (YYYY-MM-DDTHH-mm-ss UTC). */
  readonly ts: string;
}
