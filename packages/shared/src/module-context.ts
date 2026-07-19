import type { ArtifactSubmissionStatus } from "./artifact-submission.js";
import type { ModuleAttempt, ModuleResponseStatus, ModuleResponseType } from "./module-attempt.js";
import type { RunModuleSummary } from "./run-module.js";

// One Question's definition, joined with the current Attempt's Response
// to it (if any) — the shape `get_module_context` (MCP) and PR 2.9's
// status UI both need to render "what's already confirmed" and "what's
// next" without a second round trip. `responseStatus: null` means this
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
