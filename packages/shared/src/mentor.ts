import type { RunModuleSummary } from "./run-module.js";
import type { WorkspaceStatus } from "./workspace.js";

/** One `#`-`######` heading, in document order — mirrors services' internal HeadingLine shape. */
export interface MentorArtefactHeading {
  level: number;
  heading: string;
  lineIndex: number;
}

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
   * True when this Founder's Workspace is assigned to the requesting
   * Mentor (workspaces.mentor_user_id). Mentors may see every Founder on
   * the platform (see MENTOR_SEES_ALL_FOUNDERS); this flag is how the UI
   * still distinguishes "mine" from "everyone else's".
   */
  isAssignedToMe: boolean;
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
  /** A confirmed submission exists and a renderer is configured — the fillable PDF download can render. */
  workbookAvailable: boolean;
}

/** A single Founder's progress, as shown on the Mentor's detail page. */
export interface MentorFounderDetail {
  founder: MentorFounderSummary;
  modules: RunModuleSummary[];
  artefacts: MentorArtefactSummary[];
}

/**
 * A Mentor's own founder-preview sandbox, as shown on /sandbox. Deliberately
 * not a MentorFounderSummary: a sandbox has no Founder to name, is never
 * assigned a Mentor (workspaces_sandbox_has_no_mentor), and is excluded from
 * every Founder-facing Mentor query by `kind = 'live'` — so it carries the
 * workspace's own identity instead of a person's.
 */
export interface FounderSandboxSummary {
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  /**
   * Null when the sandbox exists but has no Programme Run yet — created and
   * never entered. Rendered as "not started", not as zero progress, the same
   * way MentorFounderSummary treats it.
   */
  totalModules: number | null;
  completedModules: number | null;
  /** Distinct saved deliverables, on the same terms the Mentor's Founder pages count them. */
  artefactCount: number;
  /** Most recent module completion; null if nothing is finished yet. */
  lastCompletedAt: string | null;
  /**
   * The module the Mentor would continue with — the earliest non-setup one
   * that is `available` or `in_progress`, which is the Founder dashboard's
   * own definition of "current". Null once every module is complete.
   */
  nextModule: {
    moduleKey: string;
    title: string;
    sequenceIndex: number;
  } | null;
}

/**
 * A saved deliverable together with its body. The document itself is still
 * Founder-authored and read-only from the Mentor's side — a Mentor cannot
 * edit or advance it — but Artifact comment threads are a real, mutual
 * write surface on top of it; see packages/services/src/artifact-comment.
 */
export interface MentorArtefactDocument extends MentorArtefactSummary {
  moduleTitle: string;
  content: string;
  /** At least one GFM table exists in `content` — gates the Excel download option. */
  tablesAvailable: boolean;
  /** The Attempt this saved version belongs to — Artifact comment threads anchor against it. */
  attemptId: string;
  /** Every heading in `content`, offered as anchor choices when opening a new comment thread. */
  headings: MentorArtefactHeading[];
}
