/**
 * src/version.ts — Stepper version constant (FR4, Story 3.8, Story 6.10).
 *
 * Foundational module per AR41: zero imports. Single source of truth for the
 * Stepper version reported by `--export-state` (`stepperVersion` field per
 * Story 3.8 spec) and any future surfaces (e.g., `--upgrade` Story 6.9 release
 * gate; `--doctor` Story 1.12 host-version display).
 *
 * Forward-compatible with Story 6.10's marketplace release (the bump becomes
 * a single-file edit; CI gates may auto-derive from `package.json` via a
 * build-time generator at that point).
 */

export const STEPPER_VERSION = "0.1.0" as const;
