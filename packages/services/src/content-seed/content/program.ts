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
  versionNumber: 5,
  versionLabel: "v5-facilitator-prompt-fidelity",
  versionName: "Founder Toolkit — Prompt fidelity fixes",
  versionDescription:
    "Same five active Modules and Artifact Definitions as v4. evidence_facilitator moves to v3, a doc-only fix: removes a stale line claiming interview notes are never on the platform (v2 already made the facilitator save them as Interview-Notes.md), and spells out the two-call get_module_context -> get_artifact sequence needed to read Module 3's Problem-Interview-Guide.md, since Module 4's own attemptId does not resolve a different Module's Artifact.",
  releaseNotes:
    "program_versions v5 under founder-toolkit-v1: evidence_facilitator v3 fixes two inaccuracies left over from v4's interview-notes change, found on a read-through of the Module 3 -> 4 handoff. First, \"Assembling the inventory\" step 3 still said Module 3's interview notes \"are not in the platform\" — true before v2, contradicted by v2's own new instruction to save them as Interview-Notes.md, never updated when that landed. Second, step 4's \"read Problem-Interview-Guide.md via get_artifact\" named the wrong tool count: get_artifact takes an attemptId, and Module 4's own attemptId resolves to Module 4's Artifacts, not Module 3's — the facilitator must first call get_module_context with moduleKey: \"module-03-problem-statement\" to read displayAttempt.id, then get_artifact with that attemptId. No schema, Artifact Definition, or Module content changed. Applies only to newly created Runs — a Run binds its program_version at creation, so in-flight v4 Runs keep v4's prompt and are not rolled over. Published v1-module-0-1, v2-module-1-interview-flow, v3-modules-2-3-4 and v4-interview-notes-artefact remain immutable for their in-flight Runs.",
};
