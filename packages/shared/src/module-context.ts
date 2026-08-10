import type { ArtifactSubmissionStatus } from "./artifact-submission.js";
import type { WorkbookFormat } from "./module-catalog.js";
import type {
  ModuleAttempt,
  ModuleResponseStatus,
  ModuleResponseType,
} from "./module-attempt.js";
import type { RunModuleSummary } from "./run-module.js";

// Question + current attempt response for module context UI.
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

// Metadata and locked template only — submission content is get_artifact.
export interface ModuleContextArtifactSummary {
  artifactKey: string;
  name: string;
  isRequired: boolean;
  requiredFilename: string | null;
  /** Locked templateMarkdown for exact heading copy; null when none. */
  templateMarkdown: string | null;
  latestSubmission: {
    versionNumber: number;
    status: ArtifactSubmissionStatus;
    /** Set when the submission is officially submitted; null while still draft. */
    submittedAt: string | null;
    /** Last write time (draft save or later update) — use for "Saved …" UI. */
    updatedAt: string;
  } | null;
  /** Renderer configured — catalog fact; workbookAvailable needs confirmed submission. */
  workbookSupported: boolean;
  /** workbookSupported plus confirmed version — separate flags for different UI copy. */
  workbookAvailable: boolean;
  workbookFormat: WorkbookFormat | null;
}

// Bound prompt content for the AI client (Facilitator / Artifact Generator).
export interface ModuleContextPrompt {
  purpose: string;
  promptKey: string;
  versionNumber: number;
  content: string;
}

export interface ModuleContext {
  runModule: RunModuleSummary;
  // Active attempt for writes; null after validation_failed clears it for retry.
  activeAttempt: ModuleAttempt | null;
  // Responses/artifacts shown when active is null or a fresh empty retry.
  displayAttempt: ModuleAttempt | null;
  // First unanswered question on write attempt; null when all answered or no questions.
  resumeQuestionKey: string | null;
  questions: ModuleContextQuestion[];
  artifacts: ModuleContextArtifactSummary[];
  prompts: ModuleContextPrompt[];
}
