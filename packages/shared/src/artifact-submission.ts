// Mirrors the `artifact_submissions.status` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql.
export type ArtifactSubmissionStatus =
  "draft" | "submitted" | "superseded" | "deleted";

// Mirrors the `artifact_submissions.created_via` check constraint
// (0011 added 'other' for MCP clients that are neither Claude nor ChatGPT).
export type ArtifactSubmissionCreatedVia =
  "website" | "claude" | "openai" | "other" | "renderer" | "system" | "import";

// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as `ModuleAttempt`. Mapped once at the Service boundary
// (packages/services/src/artifact).
export interface ArtifactSubmission {
  id: string;
  moduleAttemptId: string;
  artifactDefinitionId: string;
  versionNumber: number;
  status: ArtifactSubmissionStatus;
  createdVia: ArtifactSubmissionCreatedVia;
  createdAt: string;
  submittedAt: string | null;
  supersededAt: string | null;
}

// Mirrors the `artifact_validations.validation_kind` check constraint.
export type ArtifactValidationKind = "draft_check" | "official";

// pending/running reserved for future async validators; sync validators use passed/failed only.
export type ArtifactValidationStatus =
  "pending" | "running" | "passed" | "failed" | "error" | "cancelled";

// Mirrors the `artifact_validations.triggered_via` check constraint.
export type ArtifactValidationTriggeredVia =
  "website" | "mcp" | "system" | "admin";

export interface ArtifactValidationCheck {
  key: string;
  passed: boolean;
  message?: string;
}

export interface ArtifactValidation {
  id: string;
  artifactSubmissionId: string;
  validationNumber: number;
  validationKind: ArtifactValidationKind;
  status: ArtifactValidationStatus;
  validatorKey: string;
  validatorVersion: string;
  triggeredVia: ArtifactValidationTriggeredVia;
  checks: ArtifactValidationCheck[];
  issues: string[];
  warnings: string[];
  summary: string | null;
  score: number | null;
  createdAt: string;
}
