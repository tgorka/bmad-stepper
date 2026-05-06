# Security Policy

## Supported Versions

Stepper currently supports the latest minor version on the `main` branch. Older minor versions may receive security patches at the maintainer's discretion.

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Stepper, please report it privately by emailing the maintainer at `tomasz.jakub.gorka@gmail.com` with subject prefix `[bmad-stepper SECURITY]`.

Please include:

- A clear description of the vulnerability and its impact.
- Steps to reproduce (commands, file states, expected vs. observed behavior).
- Your suggested remediation if you have one.

The maintainer will acknowledge receipt within 7 days, propose a remediation timeline, and coordinate disclosure with you.

## Security Posture (Stepper-Specific)

Stepper enforces the following security invariants in v0.1+:

- **NFR-S1:** No main-thread network I/O except `--upgrade` and Claude Code marketplace operations. Sub-agents follow Claude Code's standard model API path (no Stepper code involvement).
- **NFR-S2:** Stepper writes only inside the project root and the user's `~/.claude/plugins/` directory (the latter only via marketplace operations Stepper does not initiate). NEVER writes to BMAD-installed files. CI-gated by `src/integration/no-write-outside-scope.test.ts`.
- **NFR-S3:** Telemetry contains no PII, no source code, and no file paths outside the project root. Local-only in v0.1; remote upload is not implemented. Telemetry is opt-in (`telemetry.enabled: true` in `bmad-stepper.config.yaml`); default OFF.
- **NFR-S4:** Sub-agent isolation enforces the declared context budget and tool restriction; sub-agents cannot escalate access to tools not declared in their `CONSTRAINTS` section.
- **NFR-S5:** State files have explicit read/write semantics: atomic tmp+rename for writes, file locks for read-modify-write cycles, halt on lock contention rather than retry-and-overwrite.
- **NFR-S6:** Stepper does NOT execute generated code from sub-agents as part of dispatch. Sub-agent output is artifact, not executable.

The integration test at `src/integration/no-write-outside-scope.test.ts` enforces NFR-S2 in CI. The cross-cutting NFR-S1 contract is enforced by code review against AGENTS.md + CONTRIBUTING.md (the `src/integration/no-network-on-main.test.ts` global-fetch-mock implementation is forward-deferred to post-v0.1).

## Vulnerability Disclosure Timeline

1. Day 0: Vulnerability reported privately.
2. Day 7: Maintainer acknowledgement + initial assessment.
3. Day 7-30: Remediation development.
4. Day 30+: Coordinated disclosure (private fix released, then public advisory after a reasonable upgrade window).

The maintainer reserves the right to extend the timeline for complex vulnerabilities and will communicate any extension to the reporter.
