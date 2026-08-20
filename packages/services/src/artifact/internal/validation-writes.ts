import type { PoolClient } from "pg";

import type {
  ArtifactValidation,
  ArtifactValidationCheck,
  ArtifactValidationKind,
  ArtifactValidationStatus,
  ArtifactValidationTriggeredVia,
} from "@ai-catalyst/shared";

import type { ValidationRunResult } from "@ai-catalyst/services/artifact/internal/validators/types";

export interface ArtifactValidationRow {
  id: string;
  artifact_submission_id: string;
  validation_number: number;
  validation_kind: ArtifactValidationKind;
  status: ArtifactValidationStatus;
  validator_key: string;
  validator_version: string;
  triggered_via: ArtifactValidationTriggeredVia;
  checks: unknown;
  issues: unknown;
  warnings: unknown;
  summary: string | null;
  score: string | null;
  created_at: Date;
}

export function mapArtifactValidationRow(
  row: ArtifactValidationRow,
): ArtifactValidation {
  return {
    id: row.id,
    artifactSubmissionId: row.artifact_submission_id,
    validationNumber: row.validation_number,
    validationKind: row.validation_kind,
    status: row.status,
    validatorKey: row.validator_key,
    validatorVersion: row.validator_version,
    triggeredVia: row.triggered_via,
    checks: Array.isArray(row.checks)
      ? (row.checks as ArtifactValidationCheck[])
      : [],
    issues: Array.isArray(row.issues) ? (row.issues as string[]) : [],
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    summary: row.summary,
    // numeric(5,2) comes back from `pg` as a string — parsed here at the
    // DTO boundary, same convention as storage/index.ts's sizeBytes.
    score: row.score === null ? null : Number(row.score),
    createdAt: row.created_at.toISOString(),
  };
}

// Shared by runDraftCheck and runOfficialValidation. Always inserts a
// terminal status (`passed`/`failed`) with both timestamps stamped "now"
// — validators are synchronous pure functions today, so there is no real
// `pending`/`running` interval. `summary` is left null for now.
export async function insertArtifactValidation(
  client: PoolClient,
  input: {
    workspaceId: string;
    artifactSubmissionId: string;
    validationKind: ArtifactValidationKind;
    validatorKey: string;
    validatorVersion: string;
    triggeredVia: ArtifactValidationTriggeredVia;
    triggeredByUserId: string;
    ruleSnapshot: Record<string, unknown>;
    result: ValidationRunResult;
  },
): Promise<ArtifactValidationRow> {
  // Locks the minimal serialization unit (the submission row itself, not
  // run_module/attempt) before allocating validation_number — two
  // concurrent draft checks against the same submission would otherwise
  // both compute the same max()+1 and collide on
  // artifact_validations_number_unique.
  await client.query(
    `select id from artifact_submissions where id = $1 for update`,
    [input.artifactSubmissionId],
  );

  const numberResult = await client.query<{ next: number }>(
    `select coalesce(max(validation_number), 0) + 1 as next
     from artifact_validations where artifact_submission_id = $1`,
    [input.artifactSubmissionId],
  );
  const validationNumber = numberResult.rows[0].next;
  const status: ArtifactValidationStatus = input.result.passed
    ? "passed"
    : "failed";

  const result = await client.query<ArtifactValidationRow>(
    `insert into artifact_validations (
       workspace_id, artifact_submission_id, validation_number, validation_kind,
       status, validator_key, validator_version, triggered_via, triggered_by_user_id,
       rule_snapshot, checks, issues, warnings, score, started_at, completed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, now(), now())
     returning id, artifact_submission_id, validation_number, validation_kind, status,
       validator_key, validator_version, triggered_via, checks, issues, warnings, summary,
       score, created_at`,
    [
      input.workspaceId,
      input.artifactSubmissionId,
      validationNumber,
      input.validationKind,
      status,
      input.validatorKey,
      input.validatorVersion,
      input.triggeredVia,
      input.triggeredByUserId,
      JSON.stringify(input.ruleSnapshot),
      JSON.stringify(input.result.checks),
      JSON.stringify(input.result.issues),
      JSON.stringify(input.result.warnings),
      input.result.score,
    ],
  );
  return result.rows[0];
}
