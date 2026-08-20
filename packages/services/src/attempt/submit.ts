import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ModuleAttempt,
  ModuleResponseStatus,
  ModuleResponseType,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { insertModuleEvent } from "@ai-catalyst/services/attempt/internal/events";
import {
  ATTEMPT_COLUMNS,
  mapAttemptRow,
  type AttemptRow,
} from "@ai-catalyst/services/attempt/internal/rows";

function normalizeSubmitAttemptInput(input: unknown): { attemptId: string } {
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

/**
 * Submit attempt: snapshot responses, status submitted. Idempotent only for submitted/ready_for_review.
 */
export async function submitAttempt(
  actor: ActorContext,
  input: unknown,
): Promise<ModuleAttempt> {
  assertRole(actor, ["founder"]);
  const normalized = normalizeSubmitAttemptInput(input);
  const attemptId = parseEntityIdOrNotFound(
    normalized.attemptId,
    "Attempt not found.",
  );

  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);

    const lookupResult = await client.query<{ program_run_module_id: string }>(
      `select program_run_module_id from module_attempts
       where id = $1 and workspace_id = $2`,
      [attemptId, workspace.id],
    );
    const runModuleId = lookupResult.rows[0]?.program_run_module_id;
    if (!runModuleId) {
      throw new ServiceError("NOT_FOUND", "Attempt not found.");
    }

    // Lock ordering: run_module before attempt (see start-or-resume.ts's
    // lock-ordering comment) — this path never writes a run_module
    // column, but stays consistent so it can never deadlock against
    // startOrResumeAttempt.
    const runModuleResult = await client.query<{
      id: string;
      program_run_id: string;
      program_run_branch_id: string;
    }>(
      `select id, program_run_id, program_run_branch_id
       from program_run_modules
       where id = $1 and workspace_id = $2
       for update`,
      [runModuleId, workspace.id],
    );
    const runModule = runModuleResult.rows[0];
    if (!runModule) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `Attempt ${attemptId} has no owning program_run_module.`,
      );
    }

    const attemptResult = await client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from module_attempts
       where id = $1 and program_run_module_id = $2
       for update`,
      [attemptId, runModule.id],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      throw new ServiceError("NOT_FOUND", "Attempt not found.");
    }

    if (
      attempt.status === "submitted" ||
      attempt.status === "ready_for_review"
    ) {
      await client.query("commit");
      return mapAttemptRow(attempt);
    }

    if (attempt.status !== "draft" && attempt.status !== "in_progress") {
      throw new ServiceError(
        "ATTEMPT_NOT_SUBMITTABLE",
        `Attempt is "${attempt.status}" and cannot be submitted.`,
      );
    }

    const responsesResult = await client.query<{
      question_key: string;
      question_text_snapshot: string;
      response_type: ModuleResponseType;
      response_status: ModuleResponseStatus;
      answer_text: string | null;
      answer_data: unknown;
    }>(
      `select question_key, question_text_snapshot, response_type,
              response_status, answer_text, answer_data
       from module_responses
       where module_attempt_id = $1
       order by sequence_index`,
      [attempt.id],
    );
    const responseSnapshot = responsesResult.rows.map((row) => ({
      questionKey: row.question_key,
      questionText: row.question_text_snapshot,
      responseType: row.response_type,
      responseStatus: row.response_status,
      answerText: row.answer_text,
      answerData: row.answer_data,
    }));

    await client.query(
      `insert into module_review_context_snapshots (
         workspace_id, module_attempt_id, response_snapshot
       )
       values ($1, $2, $3::jsonb)`,
      [workspace.id, attempt.id, JSON.stringify(responseSnapshot)],
    );

    const updatedResult = await client.query<AttemptRow>(
      `update module_attempts
       set status = 'submitted', submitted_at = now(), updated_at = now()
       where id = $1
       returning ${ATTEMPT_COLUMNS}`,
      [attempt.id],
    );

    await insertModuleEvent(client, {
      workspaceId: workspace.id,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attempt.id,
      eventType: "attempt_submitted",
      actor,
      fromStatus: attempt.status,
      toStatus: "submitted",
    });

    await client.query("commit");
    return mapAttemptRow(updatedResult.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
