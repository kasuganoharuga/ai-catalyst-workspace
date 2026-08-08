export type InterviewRecordStatus = "draft" | "completed";
export type InterviewEvidenceStatus = "draft" | "confirmed";

export interface InterviewQuestionSnapshot {
  index: number;
  text: string;
}

export interface InterviewActivity {
  id: string;
  workspaceId: string;
  programRunId: string;
  sourceModuleAttemptId: string;
  questions: InterviewQuestionSnapshot[];
  evidenceStatus: InterviewEvidenceStatus;
  evidenceConfirmedAt: string | null;
  confirmedMarkdown: string | null;
  confirmedSourceRecordIds: string[];
  confirmedArtifactSubmissionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewRecord {
  id: string;
  activityId: string;
  sequenceIndex: number;
  intervieweeName: string;
  company: string;
  role: string;
  interviewedAt: string | null;
  answers: Record<string, string>;
  keyQuote: string | null;
  currentWorkaround: string | null;
  status: InterviewRecordStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewProgress {
  completedCount: number;
  recommendedCount: number;
  requirementMet: boolean;
  evidenceStatus: InterviewEvidenceStatus;
  draftCount: number;
  totalCount: number;
}

export const INTERVIEW_RECOMMENDED_COUNT = 5;
export const INTERVIEW_EVIDENCE_ARTIFACT_KEY = "interview_evidence";
export const MODULE_3_KEY = "module-03-problem-statement";
export const MODULE_4_KEY = "module-04-evidence-of-unmet-need";
