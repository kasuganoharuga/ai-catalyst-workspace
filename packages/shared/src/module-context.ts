import type { ArtifactSubmissionStatus } from "./artifact-submission.js";
import type { WorkbookFormat } from "./module-catalog.js";
import type {
  ModuleAttempt,
  ModuleResponseStatus,
  ModuleResponseType,
} from "./module-attempt.js";
import type { RunModuleSummary } from "./run-module.js";

// Question definition plus the current Attempt's Response (if any) for
// module context and status UI — responseStatus null means unanswered.
// Question has no Response yet on the current Attempt at all (never
// started, not merely skipped).
export interface ModuleContextQuestion {
  questionKey: string;
  sequenceIndex: number;
  questionText: string;
  responseType: ModuleResponseType;
  allowSkip: boolean;
  options: unknown;
  responseStatus: ModuleResponseStatus | null;
  answerText: string | null;
}

// Metadata plus the locked output template — never the Artifact's stored
// submission content (that is `get_artifact`'s job, and only on request).
export interface ModuleContextArtifactSummary {
  artifactKey: string;
  name: string;
  isRequired: boolean;
  requiredFilename: string | null;
  /** The Artifact Definition's locked `output_config.templateMarkdown`, so the
   *  AI client can copy its headings exactly instead of reconstructing them
   *  from prose in the bound prompt. Null when the Definition has none. */
  templateMarkdown: string | null;
  latestSubmission: {
    versionNumber: number;
    status: ArtifactSubmissionStatus;
    /** Set when the submission is officially submitted; null while still draft. */
    submittedAt: string | null;
    /** Last write time (draft save or later update) — use for "Saved …" UI. */
    updatedAt: string;
  } | null;
  /** A renderer is configured for this Artifact Definition — same fact as ModuleCatalogArtifact.workbookSupported, just also available at Attempt scope. */
  workbookSupported: boolean;
  /**
   * `workbookSupported` AND a confirmed (non-draft) version exists to build
   * one from. Two separate flags rather than one, because "no renderer for
   * this artefact" and "not confirmed yet" need different UI copy — a
   * single boolean derived from `rendererKey` alone would show a download
   * button that then 409s on a draft-only artefact.
   */
  workbookAvailable: boolean;
  workbookFormat: WorkbookFormat | null;
}

// Module-bound Prompt Version content returned so the AI client can follow
// the Facilitator / Artifact Generator without relying on pasted project
// instructions alone.
export interface ModuleContextPrompt {
  purpose: string;
  promptKey: string;
  versionNumber: number;
  content: string;
}

export interface ModuleContext {
  runModule: RunModuleSummary;
  // The Module's live active Attempt pointer (null after validation_failed
  // clears it so a Retry can start). Writes (save_founder_input /
  // save_artifact / complete_module) always target this Attempt when set.
  activeAttempt: ModuleAttempt | null;
  // Attempt whose Responses/Artefacts are surfaced on `questions` /
  // `artifacts` for reading. Prefer this over inventing state when
  // activeAttempt is null (failed Attempt still holds answers) or when
  // activeAttempt is a fresh empty Retry (then this is the based_on
  // Attempt so prior answers remain visible).
  displayAttempt: ModuleAttempt | null;
  // The first Question with no Response on the *write* Attempt (active
  // when set, otherwise display) — null once every Question has one, or
  // when the Module has none at all (e.g. Module 0).
  resumeQuestionKey: string | null;
  questions: ModuleContextQuestion[];
  artifacts: ModuleContextArtifactSummary[];
  prompts: ModuleContextPrompt[];
}
