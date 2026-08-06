import type { ProgramContent } from "../types.js";

// version_number and version_label are fixed here rather than computed at
// seed time, so a version's identity never depends on what else has been
// created before it.
//
// This is a program_versions row under program_key "founder-toolkit-v1"
// (content revision). It is not a second overall product Program — a future
// product-line V2 would be a new programs.program_key.
export const PROGRAM_CONTENT: ProgramContent = {
  programKey: "founder-toolkit-v1",
  programName: "AI Catalyst Founder Toolkit",
  programDescription:
    "The single V1 Program: a skill-first founder workflow from raw idea to validation-ready plan.",
  versionNumber: 3,
  versionLabel: "v3-modules-2-3-4",
  versionName: "Founder Toolkit — Ideal Customer Avatar, Problem Statement, Evidence of Unmet Need",
  versionDescription:
    "Modules 0 and 1 unchanged. Module 2 (Ideal Customer Avatar), Module 3 (Problem Statement & Five Whys) and Module 4 (Evidence of Unmet Need) activate, each with a generic rule-driven Validator (structured_markdown_v1). module-02-hmw, module-03-icp, and module-04-problem-statement are retired; module-05-solution-options and module-06-validation-plan remain draft placeholders.",
  releaseNotes:
    "program_versions v3 under founder-toolkit-v1: Module 2 narrows a beachhead customer into one locked-schema Ideal Customer Avatar (13 fields, 8 blocks). Module 3 drives that customer's problem to a root cause via a 3-5 rung Five Whys ladder and prepares a 5-question Problem Interview Guide — it never runs the interviews or reads their results. Module 4 grades the resulting evidence (including Module 3's interview notes, which arrive through evidence_additions) against a 5-level maturity scale that is never capped by an earlier module's historical status, then plans a 2-3 experiment 30-day roadmap. Applies only to newly created Runs — workflow/index.ts returns an existing non-archived Run before resolving a version, so founders with an existing v2 Run are unchanged and do not gain Modules 2-4; a separate rollover is required for that. Published v1-module-0-1 and v2-module-1-interview-flow remain immutable for in-flight runs.",
};
