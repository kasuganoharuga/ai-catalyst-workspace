import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactValidation,
  ModuleAttemptStatus,
} from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { resolveValidator } from "@ai-catalyst/services/artifact/internal/validators/registry";
import { resolveValidationTriggeredVia } from "@ai-catalyst/services/artifact/internal/triggered-via";

import type { ArtifactServiceDependencies } from "@ai-catalyst/services/artifact/internal/dependencies";
import { resolveAttemptContextTrusted } from "@ai-catalyst/services/artifact/internal/attempt-context";
import {
  loadLatestSubmission,
  loadRequiredArtifactDefinitions,
  loadResponses,
  type ArtifactDefinitionRow,
  type LatestSubmissionRow,
} from "@ai-catalyst/services/artifact/internal/submission-load";
import { insertArtifactModuleEvent } from "@ai-catalyst/services/artifact/internal/module-events";
import {
  insertArtifactValidation,
  mapArtifactValidationRow,
} from "@ai-catalyst/services/artifact/internal/validation-writes";
import { withTransaction } from "@ai-catalyst/services/artifact/internal/transaction";
import type { ValidationRunResult } from "@ai-catalyst/services/artifact/internal/validators/types";

function normalizeAttemptIdInput(input: unknown): { attemptId: string } {
  if (typeof input !== "object" || input === null || !("attemptId" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId is required.");
  }
  const { attemptId } = input as { attemptId: unknown };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId must be a non-blank string.",
    );
  }
  return { attemptId };
}

// Only system or admin may trigger official validation — Founders and MCP actors cannot.
function assertOfficialValidationAuthority(actor: ActorContext): void {
  if (actor.source === "system" || actor.role === "admin") {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}

export interface RunOfficialValidationResult {
  attemptId: string;
  status: ModuleAttemptStatus;
  passed: boolean;
  // Required artifacts with no submission — recorded only on validation_failed event metadata.
  missingArtifactKeys: string[];
  validations: ArtifactValidation[];
}

interface ArtifactRunOutcome {
  artifactDefinition: ArtifactDefinitionRow;
  submission: LatestSubmissionRow | null;
  result: ValidationRunResult | null;
}

/**
 * Authoritative validation for every required artifact on an Attempt — all must pass to advance.
 * On failure clears active_attempt_id for Retry; never completes the module itself.
 */
export async function runOfficialValidation(
  actor: ActorContext,
  input: unknown,
  deps: ArtifactServiceDependencies = {},
): Promise<RunOfficialValidationResult> {
  assertOfficialValidationAuthority(actor);
  const { attemptId: rawAttemptId } = normalizeAttemptIdInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  // Phase 1: idempotent short-circuit and gather validator inputs.
  const precheck = await resolveAttemptContextTrusted(attemptId, pool, {
    forUpdate: false,
  });
  if (
    precheck.attempt.status === "ready_for_review" ||
    precheck.attempt.status === "validation_failed"
  ) {
    return {
      attemptId,
      status: precheck.attempt.status,
      passed: precheck.attempt.status === "ready_for_review",
      missingArtifactKeys: [],
      validations: [],
    };
  }
  if (precheck.attempt.status !== "submitted") {
    throw new ServiceError(
      "ATTEMPT_NOT_AWAITING_VALIDATION",
      `Attempt is "${precheck.attempt.status}" and is not awaiting official validation.`,
    );
  }

  const requiredArtifacts = await loadRequiredArtifactDefinitions(
    pool,
    precheck.runModule.module_definition_id,
  );
  const responseRows = await loadResponses(pool, attemptId);
  const responses = responseRows.map((row) => ({
    questionKey: row.question_key,
    responseStatus: row.response_status,
    answerText: row.answer_text,
    answerData: row.answer_data,
  }));

  // Phase 2: read content and run each validator outside any transaction.
  const outcomes: ArtifactRunOutcome[] = [];
  for (const artifactDefinition of requiredArtifacts) {
    const submission = await loadLatestSubmission(
      pool,
      attemptId,
      artifactDefinition.id,
      {
        forUpdate: false,
      },
    );
    if (!submission || !submission.primary_storage_object_id) {
      outcomes.push({ artifactDefinition, submission: null, result: null });
      continue;
    }
    if (!artifactDefinition.validator_key) {
      // Setup modules may omit validator_key — operational checks, not schema validators.
      if (precheck.runModule.module_type === "setup") {
        outcomes.push({
          artifactDefinition,
          submission,
          result: {
            checks: [],
            issues: [],
            warnings: [],
            passed: true,
            score: 100,
          },
        });
        continue;
      }
      throw new ServiceError(
        "VALIDATOR_NOT_CONFIGURED",
        `Artifact "${artifactDefinition.artifact_key}" has no validator_key configured.`,
      );
    }
    const validator = resolveValidator(
      artifactDefinition.validator_key,
      deps.validators,
    );
    const content = await getGeneratedTextContent(
      actor,
      submission.primary_storage_object_id,
    );
    const result = validator.runOfficialCheck({
      content,
      responses,
      validationConfig: artifactDefinition.validation_config,
    });
    outcomes.push({ artifactDefinition, submission, result });
  }

  const missingArtifactKeys = outcomes
    .filter((outcome) => outcome.submission === null)
    .map((outcome) => outcome.artifactDefinition.artifact_key);
  const allPassed =
    missingArtifactKeys.length === 0 &&
    outcomes.every((outcome) => outcome.result?.passed === true);

  // Phase 3: re-verify under lock, then commit attempt/submission transitions.
  return withTransaction(async (client) => {
    const locked = await resolveAttemptContextTrusted(attemptId, client, {
      forUpdate: true,
    });

    if (
      locked.attempt.status === "ready_for_review" ||
      locked.attempt.status === "validation_failed"
    ) {
      // Raced with another official validation — idempotent short-circuit.
      return {
        attemptId,
        status: locked.attempt.status,
        passed: locked.attempt.status === "ready_for_review",
        missingArtifactKeys: [],
        validations: [],
      };
    }
    if (locked.attempt.status !== "submitted") {
      throw new ServiceError(
        "ATTEMPT_NOT_AWAITING_VALIDATION",
        `Attempt is "${locked.attempt.status}" and is not awaiting official validation.`,
      );
    }

    const runModuleEventBase = {
      workspaceId: locked.workspaceId,
      programRunId: locked.runModule.program_run_id,
      programRunBranchId: locked.runModule.program_run_branch_id,
      programRunModuleId: locked.runModule.id,
      moduleAttemptId: attemptId,
      actor,
    };

    const fromStatus = locked.attempt.status;
    await insertArtifactModuleEvent(client, {
      ...runModuleEventBase,
      eventType: "validation_started",
      fromStatus,
      toStatus: fromStatus,
    });

    const validations: ArtifactValidation[] = [];
    for (const outcome of outcomes) {
      if (
        !outcome.submission ||
        !outcome.result ||
        !outcome.artifactDefinition.validator_key
      ) {
        continue;
      }
      const validator = resolveValidator(
        outcome.artifactDefinition.validator_key,
        deps.validators,
      );
      const row = await insertArtifactValidation(client, {
        workspaceId: locked.workspaceId,
        artifactSubmissionId: outcome.submission.id,
        validationKind: "official",
        validatorKey: validator.validatorKey,
        validatorVersion: validator.validatorVersion,
        triggeredVia: resolveValidationTriggeredVia(actor),
        triggeredByUserId: actor.userId,
        ruleSnapshot: outcome.artifactDefinition.validation_config,
        result: outcome.result,
      });
      validations.push(mapArtifactValidationRow(row));
    }

    if (allPassed) {
      for (const outcome of outcomes) {
        if (!outcome.submission) {
          continue;
        }
        await client.query(
          `update artifact_submissions
           set status = 'submitted', submitted_at = now(), updated_at = now()
           where id = $1`,
          [outcome.submission.id],
        );
      }
      await client.query(
        `update module_attempts set status = 'ready_for_review', updated_at = now() where id = $1`,
        [attemptId],
      );
      await insertArtifactModuleEvent(client, {
        ...runModuleEventBase,
        eventType: "validation_passed",
        fromStatus,
        toStatus: "ready_for_review",
      });
      await insertArtifactModuleEvent(client, {
        ...runModuleEventBase,
        eventType: "attempt_ready_for_review",
        fromStatus,
        toStatus: "ready_for_review",
      });
    } else {
      await client.query(
        `update module_attempts set status = 'validation_failed', updated_at = now() where id = $1`,
        [attemptId],
      );
      // Clear active_attempt_id so Retry can start — required by startOrResumeAttempt.
      await client.query(
        `update program_run_modules set active_attempt_id = null, updated_at = now() where id = $1`,
        [locked.runModule.id],
      );
      await insertArtifactModuleEvent(client, {
        ...runModuleEventBase,
        eventType: "validation_failed",
        fromStatus,
        toStatus: "validation_failed",
        metadata:
          missingArtifactKeys.length > 0 ? { missingArtifactKeys } : undefined,
      });
    }

    return {
      attemptId,
      status: allPassed ? "ready_for_review" : "validation_failed",
      passed: allPassed,
      missingArtifactKeys,
      validations,
    };
  });
}
