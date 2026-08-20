import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactValidation } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";

import { loadArtifactDefinitionByKey } from "@ai-catalyst/services/artifact/internal/submission-load";
import {
  mapArtifactValidationRow,
  type ArtifactValidationRow,
} from "@ai-catalyst/services/artifact/internal/validation-writes";
import { normalizeArtifactKeyInput } from "@ai-catalyst/services/artifact/internal/normalize-input";

// Same reader-permission shape as storage assertGeneratedContentReader — kept local to avoid cross-module coupling.
function assertValidationReader(actor: ActorContext): void {
  if (
    actor.role === "founder" ||
    actor.role === "admin" ||
    actor.source === "system"
  ) {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}

/**
 * Reads the most recent artifact_validations row for (attemptId, artifactKey)
 * across all submission versions. Returns null when no validation has run yet.
 */
export async function getLatestValidation(
  actor: ActorContext,
  input: unknown,
): Promise<ArtifactValidation | null> {
  assertValidationReader(actor);
  const { attemptId: rawAttemptId, artifactKey } =
    normalizeArtifactKeyInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  const attemptLookup = await pool.query<{
    workspace_id: string;
    program_run_module_id: string;
  }>(
    `select workspace_id, program_run_module_id from module_attempts where id = $1`,
    [attemptId],
  );
  const attemptRow = attemptLookup.rows[0];
  if (!attemptRow) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  if (actor.role === "founder") {
    const workspace = await resolveFounderWorkspace(actor, pool);
    if (attemptRow.workspace_id !== workspace.id) {
      throw new ServiceError("NOT_FOUND", "Attempt not found.");
    }
  }

  const runModuleResult = await pool.query<{ module_definition_id: string }>(
    `select module_definition_id from program_run_modules where id = $1 and workspace_id = $2`,
    [attemptRow.program_run_module_id, attemptRow.workspace_id],
  );
  const moduleDefinitionId = runModuleResult.rows[0]?.module_definition_id;
  if (!moduleDefinitionId) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} has no owning program_run_module.`,
    );
  }

  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    moduleDefinitionId,
    artifactKey,
  );

  const result = await pool.query<ArtifactValidationRow>(
    `select v.id, v.artifact_submission_id, v.validation_number, v.validation_kind, v.status,
            v.validator_key, v.validator_version, v.triggered_via, v.checks, v.issues, v.warnings,
            v.summary, v.score, v.created_at
     from artifact_validations v
     join artifact_submissions s on s.id = v.artifact_submission_id
     where s.module_attempt_id = $1 and s.artifact_definition_id = $2
     order by v.created_at desc
     limit 1`,
    [attemptId, artifactDefinition.id],
  );

  const row = result.rows[0];
  return row ? mapArtifactValidationRow(row) : null;
}
