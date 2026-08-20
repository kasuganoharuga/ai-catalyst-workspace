import type {
  ArtifactSubmission,
  ArtifactSubmissionCreatedVia,
  ArtifactSubmissionStatus,
  ModuleResponseStatus,
} from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";

import type { QueryExecutor } from "@ai-catalyst/services/artifact/internal/transaction";

const ACTIVE_SUBMISSION_EXCLUDED_STATUSES = ["superseded", "deleted"] as const;

export interface ArtifactDefinitionRow {
  id: string;
  module_definition_id: string;
  artifact_key: string;
  validator_key: string | null;
  renderer_key: string | null;
  output_format: string;
  required_filename: string | null;
  validation_config: Record<string, unknown>;
  is_required: boolean;
  sequence_index: number;
}

export interface LatestSubmissionRow {
  id: string;
  workspace_id: string;
  module_attempt_id: string;
  artifact_definition_id: string;
  version_number: number;
  status: ArtifactSubmissionStatus;
  created_via: ArtifactSubmissionCreatedVia;
  created_at: Date;
  submitted_at: Date | null;
  superseded_at: Date | null;
  // From the LEFT JOIN onto this submission's primary artifact_files row
  // and its storage_objects row — null only if the submission somehow
  // has no primary file yet, which never happens through this Service's
  // own saveArtifactSubmission (it always inserts exactly one primary
  // file in the same transaction as the submission row).
  primary_storage_object_id: string | null;
  content_sha256: string | null;
}

export function mapArtifactSubmissionRow(
  row: LatestSubmissionRow,
): ArtifactSubmission {
  return {
    id: row.id,
    moduleAttemptId: row.module_attempt_id,
    artifactDefinitionId: row.artifact_definition_id,
    versionNumber: row.version_number,
    status: row.status,
    createdVia: row.created_via,
    createdAt: row.created_at.toISOString(),
    submittedAt: row.submitted_at?.toISOString() ?? null,
    supersededAt: row.superseded_at?.toISOString() ?? null,
  };
}

export async function loadArtifactDefinitionByKey(
  executor: QueryExecutor,
  moduleDefinitionId: string,
  artifactKey: string,
): Promise<ArtifactDefinitionRow> {
  const result = await executor.query<ArtifactDefinitionRow>(
    `select id, module_definition_id, artifact_key, validator_key, renderer_key, output_format,
            required_filename, validation_config, is_required, sequence_index
     from artifact_definitions
     where module_definition_id = $1 and artifact_key = $2 and status <> 'archived'`,
    [moduleDefinitionId, artifactKey],
  );
  const row = result.rows[0];
  if (!row) {
    // Indistinguishable from the caller's perspective whether artifactKey
    // belongs to a different Module, doesn't exist at all, or has been
    // archived out of the living content constants — same
    // enumeration-safety convention as attempt/index.ts's question lookup.
    throw new ServiceError("NOT_FOUND", "Artifact not found.");
  }
  return row;
}

export async function loadRequiredArtifactDefinitions(
  executor: QueryExecutor,
  moduleDefinitionId: string,
): Promise<ArtifactDefinitionRow[]> {
  const result = await executor.query<ArtifactDefinitionRow>(
    `select id, module_definition_id, artifact_key, validator_key, output_format,
            required_filename, validation_config, is_required, sequence_index
     from artifact_definitions
     where module_definition_id = $1 and is_required = true and status <> 'archived'
     order by sequence_index`,
    [moduleDefinitionId],
  );
  return result.rows;
}

// The "latest non-superseded/deleted version" this Service treats as
// current everywhere (save idempotency comparison, draft_check target,
// official validation target) — `content_sha256`/`primary_storage_object_id`
// come from this version's primary artifact_files row (there is always
// exactly one — saveArtifactSubmission inserts submission + primary file
// together in the same transaction).
export async function loadLatestSubmission(
  executor: QueryExecutor,
  attemptId: string,
  artifactDefinitionId: string,
  options: { forUpdate: boolean },
): Promise<LatestSubmissionRow | null> {
  const result = await executor.query<LatestSubmissionRow>(
    `select s.id, s.workspace_id, s.module_attempt_id, s.artifact_definition_id,
            s.version_number, s.status, s.created_via, s.created_at, s.submitted_at,
            s.superseded_at, f.storage_object_id as primary_storage_object_id,
            so.checksum_sha256 as content_sha256
     from artifact_submissions s
     left join artifact_files f on f.artifact_submission_id = s.id and f.is_primary = true
     left join storage_objects so on so.id = f.storage_object_id
     where s.module_attempt_id = $1 and s.artifact_definition_id = $2
       and s.status not in (${ACTIVE_SUBMISSION_EXCLUDED_STATUSES.map((_, i) => `$${i + 3}`).join(", ")})
     order by s.version_number desc
     limit 1
     ${options.forUpdate ? "for update of s" : ""}`,
    [attemptId, artifactDefinitionId, ...ACTIVE_SUBMISSION_EXCLUDED_STATUSES],
  );
  return result.rows[0] ?? null;
}

export interface ValidationContextResponseRow {
  question_key: string;
  response_status: ModuleResponseStatus;
  answer_text: string | null;
  answer_data: unknown;
}

export async function loadResponses(
  executor: QueryExecutor,
  attemptId: string,
): Promise<ValidationContextResponseRow[]> {
  const result = await executor.query<ValidationContextResponseRow>(
    `select question_key, response_status, answer_text, answer_data
     from module_responses where module_attempt_id = $1`,
    [attemptId],
  );
  return result.rows;
}
