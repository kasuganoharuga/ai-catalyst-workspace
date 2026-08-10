import type { RunModuleSummary } from "./run-module.js";
import type { WorkspaceStatus } from "./workspace.js";

// Mentor supervision DTOs — JSON-safe ISO timestamps. Mentors see progress and deliverables, not raw module_responses or failed Attempt history.

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
