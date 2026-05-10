/**
 * src/upgrade/check.ts — `--upgrade` flow GitHub Releases check
 * (Story 6.9 — FR48; FR47; NFR-S1 EXCEPTION; NFR-S2; NFR-M3; NFR-R1;
 * AR41, AR42, AR21, AR22, AR33, AR8, AR9, AR17, AR27, AR35).
 *
 * **MID-TIER MODULE per AR41** (architecture line 1219-1222 pre-listing
 * instantiated; line 1283 mid-tier graph alongside `migrations/`,
 * `state/`, `transcript/`, `telemetry/`, `runs/`, `startup/`).
 * Allowed imports = foundational + node:* + zod ONLY:
 *   - `zod` (defence-in-depth at the network + filesystem boundaries).
 *   - `node:fs/promises` + `node:path` (standard library).
 * Zero higher-tier or top-tier imports. ZERO `src/io/log.ts` import (the
 * checker returns a typed result; logging happens at the consumer cli.ts
 * + the runner-tier wiring at next/run.ts per OQ-13).
 *
 * **NFR-S1 EXCEPTION (architecture line 646-657 D14 + line 1396 + AC-1
 * verbatim)**: this is the ONLY main-thread network I/O permitted by the
 * Stepper architecture. Every other code path is network-free. The
 * `runUpgradeCheck` function calls `Bun.fetch(<GH releases URL>)` exactly
 * once per invocation with a 10s `AbortController` timeout (per OQ-8).
 *
 * **NFR-S2 (architecture line 1397; PRD line 765; AC-1 verbatim)**:
 * Stepper NEVER writes to `~/.claude/plugins/` from this code path. The
 * function ONLY reads `.claude-plugin/plugin.json` (one `fs.readFile`)
 * and calls `fetch` (one network read). ZERO `fs.writeFile` /
 * `fs.appendFile` / `fs.copyFile` / `fs.rename` / `fs.unlink` calls. The
 * NFR-S2 guarantee is enforced by the integration test
 * `src/integration/upgrade-no-plugin-write.test.ts`.
 *
 * **AR42 schema-first**: NEW Zod schemas `PluginManifestSchema` and
 * `GitHubReleaseSchema` validate both boundaries (filesystem + network).
 * Both use `.passthrough()` per OQ-3 — these are THIRD-PARTY shapes
 * (Anthropic's plugin manifest spec + GitHub's REST API response); future
 * additions by Anthropic / GitHub MUST NOT break the upgrade flow. The
 * closed-set discipline (NFR-S3 anti-PII) applies ONLY to Stepper-OWNED
 * persisted shapes — the plugin manifest is read for its `version` field
 * only; the GH release body is regex-scanned for the BMAD compatibility
 * heading (NEVER surfaces raw body content beyond the captured version).
 *
 * **AR8 lock-free top-tier preserved**: the upgrade modules NEVER touch
 * `state.yaml` or `state.yaml.lock/`. The runner-tier wiring at
 * `src/commands/next/run.ts` Step 0a fires BEFORE any state read.
 *
 * **AR21 audit discipline**: the checker does NOT emit audit notices
 * (it returns a typed result; the consumer handles user-facing output).
 * AR22 (actionable-hint regex) is N/A — Story 6.9 ships ZERO new error
 * classes per OQ-10; bare Error throws on usage / network paths; the
 * AC-2 verbatim hint is surfaced by the orchestrator at the catch site.
 *
 * **Public surface**:
 *   - `runUpgradeCheck(opts)` — async function returning `UpgradeCheckResult`.
 *   - `UpgradeCheckResult` — discriminated union (`upgrade-available` |
 *     `up-to-date`).
 *   - `RunUpgradeCheckOptions` — test seams: `pluginManifestPath?`,
 *     `fetch?`, `timeoutMs?`, `releasesUrl?`.
 *   - `RELEASES_URL_DEFAULT` — `"https://api.github.com/repos/tgorka/bmad-stepper/releases/latest"`.
 *   - `UPGRADE_FETCH_TIMEOUT_MS` — `10_000` (10 seconds; not configurable
 *     in v0.1 per OQ-8).
 *   - `PluginManifestSchema` / `GitHubReleaseSchema` — exported for
 *     test/consumer reuse (both `.passthrough()` per OQ-3).
 *
 * Architecture cross-references:
 *   - architecture.md §D14 lines 645-660 (read-only `--upgrade` design).
 *   - architecture.md §line 1219-1222 (`src/upgrade/` pre-listing).
 *   - architecture.md §line 1396 (NFR-S1 mapping — upgrade exception).
 *   - architecture.md §line 1264 (Layer 2 network allow — upgrade only).
 *   - epics.md §Story-6.9 lines 1284-1292 (AC-1/AC-2 verbatim).
 *   - prd.md §FR47-FR48 lines 735-736; §NFR-S1-S2 lines 764-765.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────

/**
 * Anthropic plugin manifest shape — third-party schema using
 * `.passthrough()` per OQ-3 (Stepper does not OWN this spec; future
 * Anthropic additions MUST NOT break the upgrade flow). The upgrade
 * checker needs only the `name` and `version` fields; other fields are
 * tolerated and ignored.
 */
export const PluginManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+/),
  })
  .passthrough();

/**
 * GitHub Releases REST API response shape (per
 * https://docs.github.com/en/rest/releases/releases#get-the-latest-release).
 * Third-party schema using `.passthrough()` per OQ-3 — GitHub may add
 * fields to the response over time; the upgrade flow MUST not break on
 * forward-compat additions. The checker consumes `tag_name`, `html_url`,
 * and `body`.
 */
export const GitHubReleaseSchema = z
  .object({
    tag_name: z.string().min(1),
    html_url: z.string().url(),
    body: z.string().nullable().default(""),
  })
  .passthrough();

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * Default GitHub Releases API endpoint per AC-1 verbatim + architecture
 * §D14 line 646-657. The URL hard-codes the `tgorka/bmad-stepper`
 * repository (the Stepper's canonical home); future stories may add a
 * `--repo <owner/name>` override.
 */
export const RELEASES_URL_DEFAULT =
  "https://api.github.com/repos/tgorka/bmad-stepper/releases/latest";

/**
 * Default `AbortController` timeout for the fetch call per OQ-8. Not
 * configurable in v0.1 — a fixed budget keeps the contract simple and
 * the AC-1 wording does not mention configurability. Future stories
 * may add `--upgrade --timeout <seconds>` for slow networks.
 */
export const UPGRADE_FETCH_TIMEOUT_MS = 10_000;

/** Default plugin manifest path relative to the project root. */
const PLUGIN_MANIFEST_PATH_DEFAULT = ".claude-plugin/plugin.json";

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * Discriminated union returned by `runUpgradeCheck`. The consumer
 * (cli.ts and the runner-tier wiring) routes on `kind`:
 *   - `upgrade-available`: a newer release is available; the renderer
 *     emits a markdown report with version diff + CHANGELOG link + BMAD
 *     compat info + the AC-1 verbatim hint.
 *   - `up-to-date`: current version matches OR exceeds the latest
 *     release tag (per OQ-3 — local-ahead falls into this branch; e.g.,
 *     a developer building from source past the latest tag).
 *
 * The result is structurally exhaustive — no `unknown` / `error` variant
 * (errors throw; the orchestrator catches and surfaces the AC-2 hint).
 */
export type UpgradeCheckResult =
  | {
      readonly kind: "upgrade-available";
      readonly currentVersion: string;
      readonly latestVersion: string;
      readonly changelogUrl: string;
      readonly bmadCompat: string | undefined;
    }
  | {
      readonly kind: "up-to-date";
      readonly currentVersion: string;
      readonly latestVersion: string;
    };

/**
 * Test-injection options for `runUpgradeCheck`. Production callers omit
 * all fields and let the defaults resolve from `process.cwd()` + the
 * global `fetch`. Tests inject deterministic stubs per AR35 (tmpdir +
 * fetch-seam pattern per OQ-13).
 */
export interface RunUpgradeCheckOptions {
  /** Test seam: overrides the plugin manifest path (default: `<cwd>/.claude-plugin/plugin.json`). */
  readonly pluginManifestPath?: string;
  /** Test seam: overrides the global `fetch` (per OQ-13). */
  readonly fetch?: typeof globalThis.fetch;
  /** Test seam: overrides the default 10s timeout (per OQ-8). */
  readonly timeoutMs?: number;
  /** Test seam: overrides the GitHub releases URL. */
  readonly releasesUrl?: string;
}

// ─── Private helpers ──────────────────────────────────────────────────────

/**
 * Compare two semver-shaped strings element-wise on `[major, minor, patch]`
 * INTEGER tuples. NOT a lexicographic STRING comparison — `"0.10.0"` vs
 * `"0.9.0"` would yield wrong result if compared as strings. Throws
 * `Error("upgrade: invalid semver string: <value>")` on tokenize failure
 * (e.g., NaN in any segment, missing segment). Pre-release suffixes are
 * NOT supported in v0.1 — the helper tolerates only `^\d+\.\d+\.\d+(.\d+)?`
 * shape (additional `.<digit>` segments after patch are ignored). The
 * GitHub `releases/latest` endpoint excludes pre-release tags so the
 * v0.1 contract is consistent with the API contract.
 *
 * @returns `-1` (current < latest), `0` (equal), `+1` (current > latest).
 */
function compareVersions(current: string, latest: string): number {
  const tokenize = (value: string): readonly number[] => {
    const parts = value.split(".").map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
      throw new Error(`upgrade: invalid semver string: ${value}`);
    }
    return parts;
  };
  const a = tokenize(current);
  const b = tokenize(latest);
  for (let i = 0; i < 3; i++) {
    const av = a[i] as number;
    const bv = b[i] as number;
    if (av !== bv) {
      return Math.sign(av - bv);
    }
  }
  return 0;
}

/**
 * Extract the BMAD-compatibility version from a GitHub release body
 * markdown blob via the canonical heading regex (per OQ-4):
 *   `(?:^|\n)#{1,6}\s+BMAD Compatibility\s+[—\-]\s+(v?\d+\.\d+\.[\d.x]+)/i`
 * Matches H1-H6 markdown headings, tolerates em-dash OR hyphen as
 * separator, captures the version (allowing `v` prefix and `x` placeholder
 * for the patch segment per the canonical "v6.5.x" convention). When the
 * regex does not match, returns `undefined` and the renderer surfaces
 * `(BMAD compat info not present in release notes)`. The helper does NOT
 * surface raw body content — only the captured version segment.
 */
function extractBmadCompat(releaseBody: string): string | undefined {
  const re =
    /(?:^|\n)#{1,6}\s+BMAD Compatibility\s+[—-]\s+(v?\d+\.\d+\.[\d.x]+)/i;
  const match = re.exec(releaseBody);
  return match?.[1];
}

/**
 * Strip a leading `v` from a GitHub `tag_name` per OQ-7. GitHub releases
 * conventionally use `v<version>` (e.g., `v0.1.0`); the
 * `.claude-plugin/plugin.json:version` field is conventionally bare
 * (e.g., `"0.1.0"`). The helper normalizes the GH tag to the bare form
 * before passing to `compareVersions`.
 */
function stripLeadingV(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

// ─── Public surface ───────────────────────────────────────────────────────

/**
 * `--upgrade` flow primary entrypoint per AC-1 verbatim. Reads
 * `.claude-plugin/plugin.json` for `currentVersion`; calls the GitHub
 * Releases API for the latest release; compares; returns a typed
 * `UpgradeCheckResult` discriminated union. Throws bare `Error` on any
 * failure (network unreachable, rate limit, timeout, missing or malformed
 * plugin manifest, malformed release response). The orchestrator
 * (cli.ts + runner-tier wiring) catches and surfaces the AC-2 verbatim
 * hint (per OQ-10).
 *
 * **AR41 mid-tier**: this function is foundational + sibling-mid-tier
 * imports only. ZERO higher-tier or top-tier imports.
 *
 * **NFR-S1 EXCEPTION**: this is the ONLY main-thread network I/O
 * permitted by the Stepper architecture. The fetch is bounded by a
 * 10-second `AbortController` timeout per OQ-8.
 *
 * **NFR-S2 read-only**: ZERO writes anywhere on disk. The function only
 * reads `.claude-plugin/plugin.json` and calls `fetch`. The integration
 * test `src/integration/upgrade-no-plugin-write.test.ts` enforces this
 * at both the API level (write spy) and the path level (synthetic
 * `~/.claude/plugins/` snapshot before/after).
 *
 * @param opts - Test-injection options (production omits all fields).
 * @returns A typed `UpgradeCheckResult` discriminated union.
 * @throws `Error` on network failure, rate limit, timeout, missing
 *   plugin manifest, malformed plugin manifest, or malformed release
 *   response. The caller is expected to catch and surface the AC-2
 *   verbatim hint `Could not reach GitHub Releases. Check your network
 *   or try again later.`
 */
export async function runUpgradeCheck(
  opts: RunUpgradeCheckOptions = {},
): Promise<UpgradeCheckResult> {
  // Step 1: Resolve test seams (production passes none).
  const pluginManifestPath =
    opts.pluginManifestPath ??
    path.join(process.cwd(), PLUGIN_MANIFEST_PATH_DEFAULT);
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? UPGRADE_FETCH_TIMEOUT_MS;
  const releasesUrl = opts.releasesUrl ?? RELEASES_URL_DEFAULT;

  // Step 2: Read the plugin manifest. Bare Error on read failure (the
  // orchestrator surfaces the AC-2 hint at the catch site per OQ-10).
  let raw: string;
  try {
    raw = await fs.readFile(pluginManifestPath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `upgrade: failed to read plugin manifest at ${pluginManifestPath}: ${msg}`,
    );
  }

  // Step 3: Parse + Zod-validate the manifest. JSON.parse SyntaxError
  // and ZodError surface to caller (bare throws per OQ-10).
  const obj: unknown = JSON.parse(raw);
  const manifest = PluginManifestSchema.parse(obj);

  // Step 4: Construct AbortController + timeout per OQ-8. The timer is
  // cleared in finally regardless of fetch outcome.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  // Step 5: Call the GitHub Releases API. The User-Agent header per
  // OQ-9 (GitHub's REST API documentation REQUIRES User-Agent;
  // unauthenticated requests without it are rejected with 403). The
  // Stepper version is embedded for audit visibility on the GitHub
  // API logs.
  let response: Response;
  try {
    response = await fetchFn(releasesUrl, {
      signal: ac.signal,
      headers: {
        "User-Agent": `bmad-stepper/${manifest.version}`,
        Accept: "application/vnd.github+json",
      },
    });
  } finally {
    clearTimeout(timer);
  }

  // Step 6: Validate the HTTP response status. Covers 403 rate limit,
  // 404 (defensive — should not happen for the canonical repo), 5xx
  // server errors. Throws bare Error per OQ-10.
  if (!response.ok) {
    throw new Error(
      `upgrade: GitHub API responded ${response.status} ${response.statusText}`,
    );
  }

  // Step 7: Parse + Zod-validate the response body. Defence-in-depth
  // at the network boundary per AR42.
  const body: unknown = await response.json();
  const release = GitHubReleaseSchema.parse(body);

  // Step 8: Compute the latest version (strip leading "v" per OQ-7) +
  // compare against the manifest version (numeric semver compare per
  // OQ-3 — NOT lexicographic string compare).
  const latestVersion = stripLeadingV(release.tag_name);
  const cmp = compareVersions(manifest.version, latestVersion);

  // Step 9: Branch on compare result. The "up-to-date" branch covers
  // both equal (cmp === 0) and local-ahead (cmp > 0) per OQ-3.
  if (cmp < 0) {
    return {
      kind: "upgrade-available",
      currentVersion: manifest.version,
      latestVersion,
      changelogUrl: release.html_url,
      bmadCompat: extractBmadCompat(release.body ?? ""),
    };
  }
  return {
    kind: "up-to-date",
    currentVersion: manifest.version,
    latestVersion,
  };
}
