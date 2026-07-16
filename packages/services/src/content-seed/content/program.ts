import type { ProgramContent } from "../types.js";

// version_number and version_label are fixed here rather than computed at
// seed time, so a version's identity never depends on what else has been
// created before it.
export const PROGRAM_CONTENT: ProgramContent = {
  programKey: "founder-toolkit-v1",
  programName: "AI Catalyst Founder Toolkit",
  programDescription:
    "The single V1 Program: a skill-first founder workflow from raw idea to validation-ready plan.",
  versionNumber: 1,
  versionLabel: "v1-module-0-1",
  versionName: "Founder Toolkit V1 — Module 0 & 1",
  versionDescription:
    "Module 0 (Setup and Connection) and Module 1 (Pressure-Test My Idea) are fully specified and active. Modules 2-6 are draft placeholders pending their own workflow specs.",
  releaseNotes:
    "PR 1.4 seeds Module 0/1 structured content per docs/product/module-0-and-module-1-workflow.md. This Program Version does not yet include executable Workflow definitions (workflow_definitions/workflow_steps) — those are loaded and published by PR 2.8. Attempts cannot be created against this Program Version until then.",
};
