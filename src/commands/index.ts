/**
 * src/commands/index.ts — top-level command barrel (AR41 top-tier).
 *
 * Story 1.7 lands the `next` command's args parser as the first entry under
 * `src/commands/`. Per AR41 (architecture lines 1294–1302), `commands/` is
 * the top tier of the module-boundary graph: every other tier may be
 * imported from here, and nothing imports from `commands/`.
 *
 * The per-command sub-directory layout is prescribed by architecture lines
 * 1102–1123: each command directory contains an `index.ts` barrel plus
 * `args.ts`, `run.ts`, optional `verify-and-advance.ts`, and colocated test
 * files. Story 1.7 ships only the `next` command's args parser; subsequent
 * commands extend this barrel:
 *
 * - Story 1.12 will add `./doctor` (DoctorArgsSchema, doctor checks).
 * - Epic 4 will add `./loop` (LoopArgsSchema, /bmad-loop runner).
 *
 * Architecture cross-references:
 * - architecture.md §G — CLI Surface & Errors (lines 553–629).
 * - architecture.md §AR41 — Module boundary graph (line 236).
 * - architecture.md "Complete Project Directory Structure" (lines 1102–1123).
 */

export * as doctor from "./doctor/index.ts";
export * as next from "./next/index.ts";
