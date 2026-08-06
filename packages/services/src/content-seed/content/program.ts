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
  versionNumber: 6,
  versionLabel: "v6-interview-notes-source-of-truth",
  versionName: "Founder Toolkit — Interview notes as Module 4's source of truth",
  versionDescription:
    "Same five active Modules and the same three Module 4 Artifact Definitions as v5, with Interview-Notes.md moved to sequence_index 1 (it is the first thing that happens in Module 4). evidence_facilitator moves to v4 and evidence_artifact_generator to v2: the saved Interview-Notes.md becomes the Module's source of truth for what customers said, rather than a write-once archive read only by later Modules.",
  releaseNotes:
    "program_versions v6 under founder-toolkit-v1. Module 4 previously saved Interview-Notes.md in Block 1 and then graded the rest of the Module from `evidence_additions`, which the facilitator itself describes as a deliberately lossy set of extracts. A Module resumed in a new chat a week later therefore had no complete copy of the interviews left. v6 inverts that: the file is the record, the extracts are an index into it. evidence_facilitator v4 orders the save ahead of every Response (readable notes -> normalise -> save_artifact -> confirm success -> save_founder_input), stops the Module if that save fails rather than continuing from the conversation copy, requires every later block and every resume to re-read the file with get_artifact, and warns that Interview-Notes.md needs this Module's own attemptId while Module 3's Problem-Interview-Guide.md needs Module 3's — the two rules are opposites and were easy to conflate. evidence_artifact_generator v2 reads the file back before generating, so quotations come from the record. Artifact Definition change: interview_notes moves to sequence_index 1 and the two graded outputs to 2 and 3, so sequence order describes when each artefact happens; what a Module is summarised by is now its first *required* Artifact (apps/web's headlineArtifact), not its first row. Applies only to newly created Runs — a Run binds its program_version at creation, so in-flight v5 Runs keep v5's prompts and ordering and are not rolled over. Published v1-module-0-1, v2-module-1-interview-flow, v3-modules-2-3-4, v4-interview-notes-artefact and v5-facilitator-prompt-fidelity remain immutable for their in-flight Runs.",
};
