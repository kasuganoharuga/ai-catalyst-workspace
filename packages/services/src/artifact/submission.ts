import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactSubmission } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  createPendingGeneratedObject,
  getGeneratedTextContent,
  writeGeneratedTextContent,
} from "@ai-catalyst/services/storage";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";
import { resolveValidator } from "@ai-catalyst/services/artifact/internal/validators/registry";
import { resolveSubmissionCreatedVia } from "@ai-catalyst/services/artifact/internal/created-via";

import type { ArtifactServiceDependencies } from "@ai-catalyst/services/artifact/internal/dependencies";
import {
  assertEditableAttempt,
  resolveAttemptContextForFounder,
} from "@ai-catalyst/services/artifact/internal/attempt-context";
import {
  loadArtifactDefinitionByKey,
  loadLatestSubmission,
  loadResponses,
  mapArtifactSubmissionRow,
} from "@ai-catalyst/services/artifact/internal/submission-load";
import { insertArtifactModuleEvent } from "@ai-catalyst/services/artifact/internal/module-events";
import { normalizeArtifactKeyInput } from "@ai-catalyst/services/artifact/internal/normalize-input";
import { withTransaction } from "@ai-catalyst/services/artifact/internal/transaction";

// --- saveArtifactSubmission ---

function normalizeSaveArtifactSubmissionInput(input: unknown): {
  attemptId: string;
  artifactKey: string;
  content: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId, artifactKey, and content are required.",
    );
  }
  const { attemptId, artifactKey, content } = input as {
    attemptId?: unknown;
    artifactKey?: unknown;
    content?: unknown;
  };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId must be a non-blank string.",
    );
  }
  if (typeof artifactKey !== "string" || artifactKey.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "artifactKey must be a non-blank string.",
    );
  }
  if (typeof content !== "string") {
    throw new ServiceError("VALIDATION_ERROR", "content must be a string.");
  }
  return { attemptId, artifactKey, content };
}

/**
 * Saves a new Artifact version for a Founder. Hash-idempotent: identical content returns the existing latest; changes create a new draft version.
 * Runs validator draft check before Storage write when validator_key is configured.
 */
export async function saveArtifactSubmission(
  actor: ActorContext,
  input: unknown,
  deps: ArtifactServiceDependencies = {},
): Promise<ArtifactSubmission> {
  assertRole(actor, ["founder"]);
  const {
    attemptId: rawAttemptId,
    artifactKey,
    content,
  } = normalizeSaveArtifactSubmissionInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");
  const contentHash = sha256(Buffer.from(content, "utf8"));

  // Phase 1: fail fast and short-circuit identical resubmissions (MCP retry idempotency).
  const precheckContext = await resolveAttemptContextForFounder(
    actor,
    attemptId,
    pool,
    {
      forUpdate: false,
    },
  );
  assertEditableAttempt(precheckContext.attempt.status);
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    precheckContext.runModule.module_definition_id,
    artifactKey,
  );
  const precheckExisting = await loadLatestSubmission(
    pool,
    attemptId,
    artifactDefinition.id,
    {
      forUpdate: false,
    },
  );
  if (precheckExisting && precheckExisting.content_sha256 === contentHash) {
    return mapArtifactSubmissionRow(precheckExisting);
  }

  if (artifactDefinition.validator_key) {
    const validator = resolveValidator(
      artifactDefinition.validator_key,
      deps.validators,
    );
    const responses = await loadResponses(pool, attemptId);
    const draftResult = validator.runDraftCheck({
      content,
      responses: responses.map((row) => ({
        questionKey: row.question_key,
        responseStatus: row.response_status,
        answerText: row.answer_text,
        answerData: row.answer_data,
      })),
      validationConfig: artifactDefinition.validation_config,
    });
    if (!draftResult.passed) {
      const detail =
        draftResult.issues.length > 0
          ? draftResult.issues.join(" ")
          : `Draft check "${draftResult.checks
              .filter((check) => !check.passed)
              .map((check) => check.key)
              .join(", ")}" failed.`;
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Artifact content failed the locked-schema draft check: ${detail}`,
      );
    }
  }

  // Phase 2: Storage I/O outside any transaction.
  const filename = artifactDefinition.required_filename ?? `${artifactKey}.txt`;
  const pendingObject = await createPendingGeneratedObject(actor, {
    workspaceId: precheckContext.workspaceId,
    filename,
  });
  const storageObject = await writeGeneratedTextContent(actor, {
    storageObjectId: pendingObject.id,
    content,
  });

  // Phase 3: re-verify under lock, then commit the version change.
  return withTransaction(async (client) => {
    const { workspaceId, runModule, attempt } =
      await resolveAttemptContextForFounder(actor, attemptId, client, {
        forUpdate: true,
      });
    assertEditableAttempt(attempt.status);

    const lockedArtifactDefinition = await loadArtifactDefinitionByKey(
      client,
      runModule.module_definition_id,
      artifactKey,
    );
    const existing = await loadLatestSubmission(
      client,
      attemptId,
      lockedArtifactDefinition.id,
      {
        forUpdate: true,
      },
    );
    if (existing && existing.content_sha256 === contentHash) {
      // Concurrent identical save during Storage I/O — idempotent no-op.
      return mapArtifactSubmissionRow(existing);
    }

    if (existing && existing.status === "draft") {
      await client.query(
        `update artifact_submissions
         set status = 'superseded', superseded_at = now(), updated_at = now()
         where id = $1`,
        [existing.id],
      );
    }

    const versionResult = await client.query<{ next: number }>(
      `select coalesce(max(version_number), 0) + 1 as next
       from artifact_submissions where module_attempt_id = $1 and artifact_definition_id = $2`,
      [attemptId, lockedArtifactDefinition.id],
    );
    const versionNumber = versionResult.rows[0].next;
    const createdVia = resolveSubmissionCreatedVia(actor);

    const insertedResult = await client.query<{ id: string; created_at: Date }>(
      `insert into artifact_submissions (
         workspace_id, module_attempt_id, program_run_module_id, module_definition_id,
         artifact_definition_id, version_number, status, created_via, created_by_user_id
       )
       values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)
       returning id, created_at`,
      [
        workspaceId,
        attemptId,
        runModule.id,
        runModule.module_definition_id,
        lockedArtifactDefinition.id,
        versionNumber,
        createdVia,
        actor.userId,
      ],
    );
    const submissionId = insertedResult.rows[0].id;

    await client.query(
      `insert into artifact_files (
         workspace_id, artifact_submission_id, storage_object_id, file_role, format,
         sequence_index, is_primary
       )
       values ($1, $2, $3, 'source', $4, 1, true)`,
      [
        workspaceId,
        submissionId,
        storageObject.id,
        lockedArtifactDefinition.output_format,
      ],
    );

    await insertArtifactModuleEvent(client, {
      workspaceId,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptId,
      eventType: "artifact_uploaded",
      actor,
      metadata: {
        artifact_key: lockedArtifactDefinition.artifact_key,
        version: versionNumber,
      },
      entityType: "artifact_submission",
      entityId: submissionId,
    });

    return {
      id: submissionId,
      moduleAttemptId: attemptId,
      artifactDefinitionId: lockedArtifactDefinition.id,
      versionNumber,
      status: "draft",
      createdVia,
      createdAt: insertedResult.rows[0].created_at.toISOString(),
      submittedAt: null,
      supersededAt: null,
    };
  });
}

export interface ArtifactSubmissionWithContent {
  submission: ArtifactSubmission;
  // null only when primary file has no storage row yet — never via saveArtifactSubmission.
  content: string | null;
}

/**
 * Reads an Attempt's latest Artifact Submission and its stored content
 * (via StorageService) — the read backing MCP's `get_artifact` tool.
 * Returns null when nothing has been saved yet (normal during drafting).
 */
export async function getArtifactSubmission(
  actor: ActorContext,
  input: unknown,
): Promise<ArtifactSubmissionWithContent | null> {
  assertRole(actor, ["founder"]);
  const { attemptId: rawAttemptId, artifactKey } =
    normalizeArtifactKeyInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  const context = await resolveAttemptContextForFounder(
    actor,
    attemptId,
    pool,
    {
      forUpdate: false,
    },
  );
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
  if (!submission) {
    return null;
  }
  const content = submission.primary_storage_object_id
    ? await getGeneratedTextContent(actor, submission.primary_storage_object_id)
    : null;
  return { submission: mapArtifactSubmissionRow(submission), content };
}
