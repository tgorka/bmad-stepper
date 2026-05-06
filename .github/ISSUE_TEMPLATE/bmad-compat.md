---
name: BMAD Compatibility Issue
about: Report a BMAD version that breaks Stepper or behaves unexpectedly
title: "[BMAD-COMPAT] "
labels: bmad-compat
---

## BMAD Version Affected

<!-- e.g., v6.5.0 — copy from `/bmad-next --doctor` output -->

## Stepper Version

<!-- run `bun pm pkg get version` -->

## Symptom

<!-- What happens when you run /bmad-next? What does --doctor report? -->

## Failing Skill (if applicable)

<!-- The skill name from BMAD's skills.yaml or the failure-loud halt's `unknown skill` hint. -->

## Workaround Attempted

- [ ] I tried adding the skill to `bmad-stepper.config.yaml:overrides` per docs/configuration.md.
- [ ] I ran `/bmad-next --recompute-state` after the BMAD upgrade.
- [ ] I ran `/bmad-next --doctor` and reviewed the diagnostic.

## Workaround Result

## Suggested Fix

<!-- E.g., "Add `<skill-name>` to the seed at `src/dag/seed-v6.x.ts` with phase=<phase>." -->
