import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactValidation } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { resolveValidator } from "@ai-catalyst/services/artifact/internal/validators/registry";
import { resolveValidationTriggeredVia } from "@ai-catalyst/services/artifact/internal/triggered-via";

import type { ArtifactServiceDependencies } from "@ai-catalyst/services/artifact/internal/dependencies";
import {
  assertEditableAttempt,
  resolveAttemptContextForFounder,
} from "@ai-catalyst/services/artifact/internal/attempt-context";
import {
  loadArtifactDefinitionByKey,
  loadLatestSubmission,
  loadResponses,
} from "@ai-catalyst/services/artifact/internal/submission-load";
import { insertArtifactModuleEvent } from "@ai-catalyst/services/artifact/internal/module-events";
import {
  insertArtifactValidation,
  mapArtifactValidationRow,
} from "@ai-catalyst/services/artifact/internal/validation-writes";
import { normalizeArtifactKeyInput } from "@ai-catalyst/services/artifact/internal/normalize-input";
import { withTransaction } from "@ai-catalyst/services/artifact/internal/transaction";

function draftRuleSnapshot(
  validationConfig: Record<string, unknown>,
): Record<string, unknown> {
  return {
    draftRules: (validationConfig as { draftRules?: unknown }).draftRules ?? [],
  };
}

/**
 * Non-authoritative draft self-check — never gates completion; each call appends history.
 */
export async function runDraftCheck(
  actor: ActorContext,
  input: unknown,
  deps: ArtifactServiceDependencies = {},
): Promise<ArtifactValidation> {
  assertRole(actor, ["founder"]);
  const { attemptId: rawAttemptId, artifactKey } =
    normalizeArtifactKeyInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  // Phase 1: resolve context and load submission.
  const context = await resolveAttemptContextForFounder(
    actor,
    attemptId,
    pool,
    {
      forUpdate: false,
    },
  );
  assertEditableAttempt(context.attempt.status);
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    context.runModule.module_definition_id,
    artifactKey,
  );
  const submission = await loadLatestSubmission(
    pool,
    attemptId,
    artifactDefinition.id,
    {
      forUpdate: false,
    },
  );
  if (!submission || !submission.primary_storage_object_id) {
    throw new ServiceError(
      "NOT_FOUND",
      "No Artifact submission found to check.",
    );
  }
  if (!artifactDefinition.validator_key) {
    throw new ServiceError(
      "VALIDATOR_NOT_CONFIGURED",
      `Artifact "${artifactKey}" has no validator_key configured.`,
    );
  }
  const validator = resolveValidator(
    artifactDefinition.validator_key,
    deps.validators,
  );

  // Phase 2: read content and run validator.
  const content = await getGeneratedTextContent(
    actor,
    submission.primary_storage_object_id,
  );
  const responses = await loadResponses(pool, attemptId);
  const result = validator.runDraftCheck({
    content,
    responses: responses.map((row) => ({
      questionKey: row.question_key,
      responseStatus: row.response_status,
      answerText: row.answer_text,
      answerData: row.answer_data,
    })),
    validationConfig: artifactDefinition.validation_config,
  });

  // Phase 3: re-verify under lock, write event + validation row.
  return withTransaction(async (client) => {
    const { workspaceId, runModule, attempt } =
      await resolveAttemptContextForFounder(actor, attemptId, client, {
        forUpdate: true,
      });
    assertEditableAttempt(attempt.status);

    await insertArtifactModuleEvent(client, {
      workspaceId,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptId,
      eventType: "validation_started",
      actor,
    });

    const validationRow = await insertArtifactValidation(client, {
      workspaceId,
      artifactSubmissionId: submission.id,
      validationKind: "draft_check",
      validatorKey: validator.validatorKey,
      validatorVersion: validator.validatorVersion,
      triggeredVia: resolveValidationTriggeredVia(actor),
      triggeredByUserId: actor.userId,
      ruleSnapshot: draftRuleSnapshot(artifactDefinition.validation_config),
      result,
    });

    await insertArtifactModuleEvent(client, {
      workspaceId,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptId,
      eventType: result.passed ? "validation_passed" : "validation_failed",
      actor,
    });

    return mapArtifactValidationRow(validationRow);
  });
}
