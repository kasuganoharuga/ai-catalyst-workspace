import type { ArtifactSubmissionStatus } from "./artifact-submission.js";
import type { ModuleAttempt, ModuleResponseStatus, ModuleResponseType } from "./module-attempt.js";
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

// Metadata only — never the Artifact's stored content (that is
// `get_artifact`'s job, and only on request).
export interface ModuleContextArtifactSummary {
  artifactKey: string;
  name: string;
  isRequired: boolean;
  requiredFilename: string | null;
  latestSubmission: {
    versionNumber: number;
    status: ArtifactSubmissionStatus;
    submittedAt: string | null;
  } | null;
}

export interface ModuleContext {
  runModule: RunModuleSummary;
  activeAttempt: ModuleAttempt | null;
  // The first Question with no Response on the current Attempt yet —
  // null once every Question has one, or when the Module has none at all
  // (e.g. Module 0, which is `module_questions`-less by design).
  resumeQuestionKey: string | null;
  questions: ModuleContextQuestion[];
  artifacts: ModuleContextArtifactSummary[];
}
