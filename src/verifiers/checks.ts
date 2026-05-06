/**
 * src/verifiers/checks.ts — Built-in check implementations + the
 * `runVerifier` orchestrator (FR17, FR38, NFR-M3, NFR-S6, NFR-R1, NFR-S1,
 * AR21, AR22, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports:
 *   - foundational: `../errors.ts` (`VerifierFailureError`),
 *     `../io/log.ts` (stderr logging discipline FR54),
 *     `../io/atomic-write.ts` (NFR-R1 atomic JSON write — also
 *     transitively imports `../io/paths.ts` for `assertWithinScope`),
 *     `../schemas/verifier-result.ts` (`VerifierResultV1Schema` for
 *     defence-in-depth Zod validation pre-write per Story 1.5 pattern).
 *   - Bun stdlib: `Bun.file`, `Bun.YAML`, `Bun.Glob`.
 *   - Node stdlib: `node:fs/promises`, `node:path`.
 *   - intra-module siblings: `./types.ts`, `./registry.ts`.
 *
 * **FORBIDDEN** imports:
 *   - sibling higher-tier (`../dispatch/`, `../failure-ux/`).
 *   - mid-tier (`../bmad-detect/`, `../dag/`, `../personas/`, `../state/`,
 *     `../snapshot/`) — v0.1 doesn't need them.
 *   - top-tier (`../commands/`).
 *   - `node:child_process` (use `Bun.spawn` if ever needed; v0.1 has no
 *     subprocess work).
 *   - any new external runtime dep beyond `zod` (transitively pulled by
 *     `../schemas/verifier-result.ts`).
 *
 * Architecture compliance:
 *   - §D9 lines 477-499 — verifier responsibilities + four check kinds
 *     (`required-files`, `frontmatter`, `schema`, `custom`). v0.1 ships
 *     **conservative deterministic checks only** per §line 1727 (LLM-as-
 *     judge `judge:` field deferred post-v0.1).
 *   - §P5 lines 901-915 — `verifier-result.json` shape; honored verbatim
 *     via `src/schemas/verifier-result.ts`'s `VerifierResultV1Schema`
 *     (Story 1.5 — already shipped). Defence-in-depth: pre-write Zod
 *     validation.
 *   - §line 858 — `Result<T, E>` sole-exception to AR33; honored by the
 *     `VerifierConfig.custom?` callback signature only. The orchestrator
 *     itself does NOT use `Result<T, E>` — it returns a structured
 *     `VerifierResult` shape and throws `StepperError` subclasses for
 *     orchestration-level failures (e.g., staging dir missing).
 *   - AR21 + AR22 — `VerifierFailureError` (existing class from Story 1.2
 *     registry, code `VERIFIER_FAILURE`, exitCode 1) is thrown ONLY for
 *     orchestration-level failures, NOT for per-check failures (per AC-3
 *     + AC-4: per-check failures are reported via `status: "fail"` in the
 *     returned struct). The error's registry hint is unchanged: "See
 *     _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier
 *     output; try /bmad-next --resume after fixing the underlying issue."
 *   - AR33 — `async` orchestrator; throws `StepperError` subclasses
 *     ONLY for orchestration-level failures; uses `Result<T, E>` only
 *     inside `custom?` callbacks; no `console.*` (uses
 *     `../io/log.ts:info` / `:error`).
 *   - AR35 — tests use tmpdir-per-test pattern (`mkdtemp(path.join(
 *     os.tmpdir(), "stepper-verifier-..."))`).
 *   - NFR-S1 — no main-thread network. The verifier reads from disk only.
 *   - NFR-S6 — no execution of sub-agent output. The verifier reads
 *     content via `Bun.file().text()` but never `eval`s, `require()`s,
 *     or `import`s it. Custom-callback signature receives `ArtifactRef`
 *     (path-handle), NOT the parsed body.
 *   - NFR-R1 — atomic write. `verifier-result.json` is written via
 *     `atomicWrite` (`.tmp` → rename), with `.bak` rotation on overwrite.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { VerifierFailureError } from "../errors.ts";
import { atomicWrite } from "../io/atomic-write.ts";
import { info } from "../io/log.ts";
import type { Verifiers } from "../schemas/config.ts";
import {
  type VerifierResult,
  VerifierResultV1Schema,
} from "../schemas/verifier-result.ts";
import { getVerifierConfig } from "./registry.ts";
import type {
  ArtifactRef,
  CheckResult,
  Result,
  VerifierConfig,
  VerifierError,
} from "./types.ts";

// ─── Built-in check implementations ─────────────────────────────────────────

/**
 * `required-files` check — for each glob in `config.requiredFiles`,
 * assert at least one matching file exists under
 * `staging/<runId>/outputs/`. The check is a pure filesystem read; no
 * external IO (NFR-S1 honored).
 *
 * Algorithm:
 *   1. If `config.requiredFiles` is empty → `skip`.
 *   2. For each pattern: enumerate matches via `Bun.Glob(pattern).scan(
 *      { cwd: artifact.outputsDir, onlyFiles: true })`.
 *   3. If any pattern yields zero matches → `fail` with the missing
 *      pattern in `detail`. Lists the FIRST missing pattern (future
 *      polish: list all missing patterns).
 *   4. All patterns matched → `pass`.
 */
export async function checkRequiredFiles(
  artifact: ArtifactRef,
  config: VerifierConfig,
): Promise<CheckResult> {
  if (config.requiredFiles.length === 0) {
    return {
      name: "required-files",
      status: "skip",
      detail: "No required files declared",
    };
  }
  for (const pattern of config.requiredFiles) {
    const glob = new Bun.Glob(pattern);
    let matched = false;
    for await (const _rel of glob.scan({
      cwd: artifact.outputsDir,
      onlyFiles: true,
    })) {
      matched = true;
      break;
    }
    if (!matched) {
      return {
        name: "required-files",
        status: "fail",
        detail: `No file matched pattern ${pattern}`,
      };
    }
  }
  return { name: "required-files", status: "pass", detail: "" };
}

/**
 * `frontmatter` check — parse the artifact's YAML frontmatter (the
 * `---\n...\n---` block at the file head) and assert each key in
 * `config.requiredFrontmatterSections` is present + truthy. Depth-1 only
 * (no dotted-path lookup) for v0.1.
 *
 * Algorithm:
 *   1. If `config.requiredFrontmatterSections` is empty → `skip`.
 *   2. Read the artifact via `Bun.file(artifact.path).text()`.
 *   3. Extract the frontmatter block via the regex `/^---\n([\s\S]*?)\n---/`.
 *   4. If absent → `fail` ("Frontmatter block is missing").
 *   5. Parse via `Bun.YAML.parse(block)`. Catch parse errors → `fail`
 *      ("Frontmatter block is malformed YAML: <message>").
 *   6. For each required key: assert `parsed[key] !== undefined &&
 *      parsed[key] !== null && parsed[key] !== ""`. First failure →
 *      `fail` ("Missing frontmatter key: <key>").
 *   7. All keys present + truthy → `pass`.
 *
 * The artifact is expected to be a markdown file. Non-markdown artifacts
 * (e.g., raw JSON) without a `---` frontmatter block fail at step 4.
 */
export async function checkFrontmatter(
  artifact: ArtifactRef,
  config: VerifierConfig,
): Promise<CheckResult> {
  if (config.requiredFrontmatterSections.length === 0) {
    return {
      name: "frontmatter",
      status: "skip",
      detail: "No required frontmatter sections declared",
    };
  }
  let text: string;
  try {
    text = await Bun.file(artifact.path).text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "frontmatter",
      status: "fail",
      detail: `Could not read artifact at ${artifact.path}: ${msg}`,
    };
  }
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (match === null || match[1] === undefined) {
    return {
      name: "frontmatter",
      status: "fail",
      detail: "Frontmatter block is missing",
    };
  }
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(match[1]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "frontmatter",
      status: "fail",
      detail: `Frontmatter block is malformed YAML: ${msg}`,
    };
  }
  if (parsed === null || typeof parsed !== "object") {
    return {
      name: "frontmatter",
      status: "fail",
      detail: "Frontmatter block did not parse as a YAML object",
    };
  }
  const fm = parsed as Record<string, unknown>;
  for (const key of config.requiredFrontmatterSections) {
    const value = fm[key];
    if (value === undefined || value === null || value === "") {
      return {
        name: "frontmatter",
        status: "fail",
        detail: `Missing frontmatter key: ${key}`,
      };
    }
  }
  return { name: "frontmatter", status: "pass", detail: "" };
}

/**
 * `schema` check — when `config.schema !== null`, parse the artifact
 * body (post-frontmatter content) via the provided Zod schema. v0.1
 * default configs all set `schema: null`, so this check returns
 * `status: "skip"` for every default; the implementation is in place
 * for Story 6.x per-artifact schemas.
 *
 * Algorithm:
 *   1. If `config.schema === null` → `skip`.
 *   2. Read the artifact body. For markdown: strip the frontmatter block
 *      (everything between the first two `---\n` markers, inclusive); the
 *      remainder is the prose body. For non-markdown (no frontmatter
 *      block detected): treat the whole content as the body and attempt
 *      `JSON.parse` first (so JSON artifacts can be validated); fall back
 *      to the raw text.
 *   3. `config.schema.safeParse(body)`. On success → `pass`. On failure →
 *      `fail` with the Zod error formatted message.
 */
export async function checkSchema(
  artifact: ArtifactRef,
  config: VerifierConfig,
): Promise<CheckResult> {
  if (config.schema === null) {
    return {
      name: "schema",
      status: "skip",
      detail: "No body schema declared",
    };
  }
  let text: string;
  try {
    text = await Bun.file(artifact.path).text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "schema",
      status: "fail",
      detail: `Could not read artifact at ${artifact.path}: ${msg}`,
    };
  }
  const fmMatch = text.match(/^---\n[\s\S]*?\n---\n?/);
  const body = fmMatch === null ? text : text.slice(fmMatch[0].length);
  let parsedBody: unknown = body;
  // Attempt to JSON-parse the body so JSON-shaped artifacts can be
  // validated against the Zod schema directly. If the body is not JSON,
  // pass the raw string through (the Zod schema may target a string
  // shape, e.g., for prose validators).
  try {
    parsedBody = JSON.parse(body);
  } catch {
    parsedBody = body;
  }
  const result = config.schema.safeParse(parsedBody);
  if (result.success) {
    return { name: "schema", status: "pass", detail: "" };
  }
  const issues = result.error.issues
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
  return {
    name: "schema",
    status: "fail",
    detail: `Schema validation failed: ${issues}`,
  };
}

/**
 * `custom` check — when `config.custom` is provided, invoke it with the
 * `ArtifactRef` (path-handle) and translate the
 * `Result<void, VerifierError>` into the structured check result.
 *
 * Algorithm:
 *   1. If `config.custom === undefined` → `skip`.
 *   2. Invoke `await config.custom(artifact)` (the callback may be sync
 *      or async per the type signature).
 *   3. On `result.ok === true` → `pass`.
 *   4. On `result.ok === false` → `fail` with `result.error.detail`.
 *
 * **AC-5 contract** (architecture §D9 line 490): the custom callback is
 * the project's own code (NOT the sub-agent's); the verifier MUST NOT
 * execute the artifact body. NFR-S6 is preserved by the type signature
 * alone — the callback receives an `ArtifactRef` (path), NOT the parsed
 * body. The deterministic-stateless contract (no Claude calls, no
 * network) is enforced by convention + JSDoc only for v0.1; runtime
 * sandboxing (lint-time `fetch(`/`http.`/`https.` scan) is a Story 6.5
 * follow-up.
 *
 * Defence in depth: if the callback throws synchronously OR rejects
 * asynchronously, the orchestrator catches the error and reports
 * `status: "fail"` with the error message in `detail` — the throw does
 * NOT propagate to the outer `runVerifier` (per AC-3 + AC-4: per-check
 * failures are reported via `status: "fail"`, NOT thrown).
 */
export async function checkCustom(
  artifact: ArtifactRef,
  config: VerifierConfig,
): Promise<CheckResult> {
  if (config.custom === undefined) {
    return {
      name: "custom",
      status: "skip",
      detail: "No custom check declared",
    };
  }
  let outcome: Result<void, VerifierError>;
  try {
    outcome = await Promise.resolve(config.custom(artifact));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "custom",
      status: "fail",
      detail: `Custom check threw: ${msg}`,
    };
  }
  if (outcome.ok) {
    return { name: "custom", status: "pass", detail: "" };
  }
  return {
    name: "custom",
    status: "fail",
    detail: outcome.error.detail,
  };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Options for {@link runVerifier}.
 */
export interface RunVerifierOptions {
  /**
   * BMAD step name (e.g., `"dev-story"`). v0.1 explicit; Story 2.2 will
   * supply this from `staging/<runId>/dispatch-spec.json`.
   */
  readonly stepName: string;
  /**
   * Overrides the staging directory root. Required for tests (per AR35
   * tmpdir pattern) and for callers that stage outputs outside the
   * canonical `_bmad-output/.stepper/staging/` location.
   *
   * v0.1 has no canonical staging path constant in `src/io/paths.ts`
   * (the canonical staging path lands in Story 2.2 alongside the
   * dispatch-spec generator). For now, this option is REQUIRED — the
   * orchestrator throws `VerifierFailureError` if it is missing.
   */
  readonly stagingRoot?: string;
  /**
   * Optional explicit artifact filename under
   * `staging/<runId>/outputs/`. Defaults to `<stepName>.md` — the
   * convention for markdown artifacts.
   */
  readonly artifactFilename?: string;
  /**
   * Story 6.5 — optional project-config `Verifiers` map; when supplied,
   * `getVerifierConfig` merges (or replaces) the per-step entry on top
   * of the plugin baseline per the entry's `mode` field. Production
   * callers (Story 6.5 `verify-and-advance.ts`) thread
   * `opts.config?.verifiers` from the typed `Config` returned by
   * `loadConfig()` (Story 6.1); tests pass synthetic `Verifiers` objects
   * directly. When omitted, behaviour is byte-identical to Story 2.1
   * baseline (no project-config layer).
   */
  readonly projectVerifiers?: Verifiers;
}

/**
 * Result of {@link runVerifier} — the structured `VerifierResultV1` plus
 * the absolute path to the written `verifier-result.json`. Story 2.6's
 * `verify-and-advance.ts` is the canonical consumer; Epic 5's
 * failure-UX engine reads the `status` + `checks[]` to decide
 * remediation.
 */
export interface RunVerifierResult extends VerifierResult {
  /** Absolute filesystem path to the written `verifier-result.json`. */
  readonly resultPath: string;
}

/**
 * Run all four checks against the staged artifact and write
 * `staging/<runId>/verifier-result.json` atomically.
 *
 * Algorithm:
 *   1. Resolve options: `stagingRoot` (REQUIRED — v0.1 has no canonical
 *      `STAGING_PATH` constant); `outputsDir = <stagingRoot>/<runId>/
 *      outputs`; `resultPath = <stagingRoot>/<runId>/verifier-result.json`.
 *   2. Verify the staging directory exists; throw `VerifierFailureError`
 *      otherwise (orchestration-level failure — AR21).
 *   3. Look up `config = getVerifierConfig(opts.stepName)`.
 *   4. Construct the `ArtifactRef`. Default artifact filename is
 *      `<stepName>.md` (markdown convention); caller can override via
 *      `opts.artifactFilename`.
 *   5. Run all four checks in order: `required-files`, `frontmatter`,
 *      `schema`, `custom`. Collect each `CheckResult` into a `checks[]`
 *      array.
 *   6. Aggregate the overall status: any `"fail"` → overall `"fail"`;
 *      otherwise `"pass"` (per architecture §P5 + AC-4 — `"skip"` is
 *      only a per-check status, never the aggregate).
 *   7. Construct the `VerifierResultV1` literal:
 *      `{ schemaVersion: 1, status, checks, promotedTo: null }`. The
 *      `promotedTo` field is always `null` from the verifier — it is
 *      populated by Story 2.6's `src/dispatch/promote.ts` AFTER the
 *      atomic copy.
 *   8. Validate the result against `VerifierResultV1Schema` for
 *      defence-in-depth (per Story 1.5 schema-validation pattern).
 *   9. Write atomically to `resultPath` via `atomicWrite` (NFR-R1 —
 *      `.tmp` → rename, `.bak` rotation on overwrite).
 *  10. Return `{ ...result, resultPath }`.
 *
 * **Per-check failures** (AC-3 + AC-4) are reported via `status: "fail"`
 * in the returned struct, NOT as thrown errors. **Orchestration-level
 * failures** (e.g., staging dir missing, `stagingRoot` not provided) are
 * thrown as `VerifierFailureError` (existing class from Story 1.2
 * registry, code `VERIFIER_FAILURE`, exitCode 1).
 *
 * @throws {VerifierFailureError} when the staging directory does not
 *   exist OR `stagingRoot` was not supplied.
 */
export async function runVerifier(
  runId: string,
  opts: RunVerifierOptions,
): Promise<RunVerifierResult> {
  if (opts.stagingRoot === undefined || opts.stagingRoot === "") {
    throw new VerifierFailureError(
      "runVerifier requires opts.stagingRoot (v0.1 has no canonical STAGING_PATH constant; Story 2.2 will supply one)",
      `runId=${runId}, stepName=${opts.stepName}`,
    );
  }
  const runDir = path.join(opts.stagingRoot, runId);
  const outputsDir = path.join(runDir, "outputs");
  const resultPath = path.join(runDir, "verifier-result.json");

  // Step 2 — verify the staging dir exists. The outputs/ subdir is
  // technically the load-bearing path for the checks, but the runDir
  // existence is the orchestration-level invariant (the run was created
  // by Story 2.4's run.ts before the verifier is invoked).
  let runDirExists = false;
  try {
    const stat = await fs.stat(runDir);
    runDirExists = stat.isDirectory();
  } catch {
    runDirExists = false;
  }
  if (!runDirExists) {
    throw new VerifierFailureError(
      `staging directory does not exist: ${runDir}`,
      `runId=${runId}, stepName=${opts.stepName}`,
    );
  }

  const config = getVerifierConfig(opts.stepName, opts.projectVerifiers);

  const artifactFilename = opts.artifactFilename ?? `${opts.stepName}.md`;
  const artifact: ArtifactRef = {
    path: path.join(outputsDir, artifactFilename),
    stepName: opts.stepName,
    runId,
    outputsDir,
  };

  info(`verifier: running ${opts.stepName} for run ${runId}`);

  const checks: CheckResult[] = [];
  checks.push(await checkRequiredFiles(artifact, config));
  checks.push(await checkFrontmatter(artifact, config));
  checks.push(await checkSchema(artifact, config));
  checks.push(await checkCustom(artifact, config));

  const aggregateStatus: "pass" | "fail" = checks.some(
    (c) => c.status === "fail",
  )
    ? "fail"
    : "pass";

  const result: VerifierResult = {
    schemaVersion: 1,
    status: aggregateStatus,
    checks: checks.map((c) => ({
      name: c.name,
      status: c.status,
      detail: c.detail,
    })),
    promotedTo: null,
  };

  // Defence-in-depth Zod validation per Story 1.5 schema-validation
  // pattern. A failure here would indicate a bug in this orchestrator
  // (the literal we constructed must match the schema we wrote it for).
  VerifierResultV1Schema.parse(result);

  await atomicWrite(resultPath, JSON.stringify(result, null, 2));

  return { ...result, resultPath };
}
