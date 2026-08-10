/**
 * Interview domain barrel — records, evidence confirmation, Module 4 pinning.
 * Package-path re-exports only (Turbopack cannot resolve relative ./x.js
 * from this entry).
 */
import { buildInterviewEvidenceMarkdown } from "@ai-catalyst/services/interview/evidence-markdown";
import {
  INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  INTERVIEW_MINIMUM_COUNT,
  INTERVIEW_RECOMMENDED_COUNT,
  MODULE_3_KEY,
  MODULE_4_KEY,
  type InterviewActivity,
  type InterviewEvidenceStatus,
  type InterviewProgress,
  type InterviewQuestionSnapshot,
  type InterviewRecord,
  type InterviewRecordStatus,
} from "@ai-catalyst/services/interview/types";

export {
  INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  INTERVIEW_MINIMUM_COUNT,
  INTERVIEW_RECOMMENDED_COUNT,
  MODULE_3_KEY,
  MODULE_4_KEY,
  buildInterviewEvidenceMarkdown,
};
export type {
  InterviewActivity,
  InterviewEvidenceStatus,
  InterviewProgress,
  InterviewQuestionSnapshot,
  InterviewRecord,
  InterviewRecordStatus,
};

export {
  createInterviewActivityFromGuide,
  loadGuideQuestionsForAttempt,
  getInterviewActivityForProgramRun,
  listInterviewRecords,
  getInterviewRecord,
  getInterviewProgress,
  addInterviewRecord,
  saveInterviewRecordDraft,
  completeInterviewRecord,
  reopenInterviewRecord,
} from "@ai-catalyst/services/interview/records";

export {
  submitInterviewSetForReview,
  buildEvidencePreview,
  confirmInterviewEvidence,
  reopenInterviewEvidence,
} from "@ai-catalyst/services/interview/evidence";

export {
  isModule4ClaudeReady,
  getPinnedInterviewEvidenceMarkdown,
  pinInterviewEvidenceForModule4Attempt,
} from "@ai-catalyst/services/interview/module4";
