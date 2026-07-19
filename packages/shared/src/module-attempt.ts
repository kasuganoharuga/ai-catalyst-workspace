// Mirrors the `module_attempts.status` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql.
export type ModuleAttemptStatus =
  | "draft"
  | "in_progress"
  | "submitted"
  | "validation_failed"
  | "ready_for_review"
  | "accepted"
  | "rejected"
  | "cancelled";

// Mirrors the `module_attempts.attempt_type` check constraint.
export type ModuleAttemptType = "initial" | "retry";

// Mirrors the `module_attempts.started_via` check constraint. Distinct
// from `module_responses.source_provider`, which has no "system" value —
// see packages/services/src/attempt/internal/interaction-provider.ts.
export type ModuleAttemptStartedVia = "website" | "claude" | "openai" | "system";

// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as `ProgramRun`/`Venture`. Mapped once at the Service
// boundary (packages/services/src/attempt).
export interface ModuleAttempt {
  id: string;
  programRunModuleId: string;
  attemptNumber: number;
  attemptType: ModuleAttemptType;
  status: ModuleAttemptStatus;
  basedOnAttemptId: string | null;
  startedVia: ModuleAttemptStartedVia;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Mirrors the `module_responses.response_type` check constraint. Only
// `short_text` / `long_text` / `single_choice` are validated by
// saveFounderResponse in this PR — the remaining values exist in the
// schema for later content, same reasoning as ProgramRunStatus.
export type ModuleResponseType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "number"
  | "date"
  | "url"
  | "structured";

// Mirrors the `module_responses.response_status` check constraint.
export type ModuleResponseStatus =
  | "answered"
  | "skipped"
  | "not_applicable"
  | "needs_follow_up";

// Mirrors the `module_responses.captured_via` check constraint.
export type ModuleResponseCapturedVia =
  | "direct_response"
  | "ai_extraction"
  | "website_edit"
  | "import";

export interface ModuleResponse {
  id: string;
  moduleAttemptId: string;
  questionKey: string;
  sequenceIndex: number;
  questionTextSnapshot: string;
  responseType: ModuleResponseType;
  responseStatus: ModuleResponseStatus;
  answerText: string | null;
  answerData: unknown;
  capturedVia: ModuleResponseCapturedVia;
  updatedAt: string;
}
