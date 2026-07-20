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
  versionNumber: 2,
  versionLabel: "v2-module-1-interview-flow",
  versionName: "Founder Toolkit — Module 1 interview flow",
  versionDescription:
    "Module 0 unchanged. Module 1 uses collect-only Q&A, batch save after summary confirm, locked verdict schema with separate AI Recommendation vs Founder Decision, and unlock-any-decision completion.",
  releaseNotes:
    "program_versions v2 under founder-toolkit-v1: interview-style collect-only Module 1, end-of-six summary confirm before save, pressure_test_verdict_v2 template, founder_decision (no initial/final loop), no Pivot auto-retry. Published v1-module-0-1 remains immutable for in-flight runs.",
};
