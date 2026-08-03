import type { RunModuleSummary } from "./run-module.js";
import type { WorkspaceStatus } from "./workspace.js";

// External DTOs for the Mentor supervision surface — JSON-safe throughout
// (ISO string timestamps, never `Date`), same convention as RunModuleSummary.
//
// What is deliberately absent is as much the contract as what is present.
// A Mentor sees where a Founder has got to and what they produced; they do
// not see `module_responses` (the Founder's raw, unpolished answers inside
// their AI assistant) or failed/cancelled Attempt history. Supervision is
// not surveillance, and a Founder who felt watched mid-draft would start
// drafting somewhere else.

/** One supervised Founder, as shown on the Mentor's overview. */
export interface MentorFounderSummary {
  workspaceId: string;
  workspaceName: string;
  workspaceStatus: WorkspaceStatus;
  founderUserId: string;
  founderName: string | null;
  founderEmail: string;
  /**
   * Null when the Founder has not started a Programme Run yet — they have
   * accepted their invitation but never connected an AI assistant. Rendered
   * as "not started", not as zero progress.
   */
  totalModules: number | null;
  completedModules: number | null;
  /** Most recent module completion; null if nothing is finished yet. */
  lastCompletedAt: string | null;
}

/** One saved deliverable, without its body. */
export interface MentorArtefactSummary {
  moduleKey: string;
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  versionNumber: number;
  /** Official submit time when there is one, else the last write. */
  savedAt: string;
}

/** A single Founder's progress, as shown on the Mentor's detail page. */
export interface MentorFounderDetail {
  founder: MentorFounderSummary;
  modules: RunModuleSummary[];
  artefacts: MentorArtefactSummary[];
}

/** A saved deliverable together with its body, for the read-only view. */
export interface MentorArtefactDocument extends MentorArtefactSummary {
  moduleTitle: string;
  content: string;
}
