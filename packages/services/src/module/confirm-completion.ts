import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { loadAttemptRow } from "@ai-catalyst/services/module/internal/completion-rows";
import {
  completeSystemModule,
  type NextModuleUnlocked,
} from "@ai-catalyst/services/module/internal/complete-system-module";

// programRunModuleId not moduleKey — auth by workspace id, not active context navigation.
function normalizeConfirmInput(input: unknown): { programRunModuleId: string } {
  if (
    typeof input !== "object" ||
    input === null ||
    !("programRunModuleId" in input)
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "programRunModuleId is required.",
    );
  }
  const { programRunModuleId } = input as { programRunModuleId: unknown };
  if (
    typeof programRunModuleId !== "string" ||
    programRunModuleId.trim().length === 0
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "programRunModuleId must be a non-blank string.",
    );
  }
  return { programRunModuleId };
}

export interface ConfirmModuleCompletionResult {
  programRunModuleId: string;
  // False only on the idempotent replay path, where the Module was
  // already completed before this call.
  justConfirmed: boolean;
  nextModuleUnlocked: NextModuleUnlocked | null;
}

/**
 * Founder confirms on website — completes module and unlocks next.
 * MCP complete_module stops at ready_for_review so they sign off before advancing.
 */
export async function confirmModuleCompletion(
  actor: ActorContext,
  input: unknown,
): Promise<ConfirmModuleCompletionResult> {
  assertRole(actor, ["founder"]);
  const { programRunModuleId: rawId } = normalizeConfirmInput(input);
  const programRunModuleId = parseEntityIdOrNotFound(
    rawId,
    "Module not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const runModuleResult = await pool.query<{
    id: string;
    status: string;
    active_attempt_id: string | null;
  }>(
    `select id, status, active_attempt_id
     from program_run_modules
     where id = $1 and workspace_id = $2`,
    [programRunModuleId, workspace.id],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }

  if (runModule.status === "completed") {
    return {
      programRunModuleId,
      justConfirmed: false,
      nextModuleUnlocked: null,
    };
  }

  if (!runModule.active_attempt_id) {
    throw new ServiceError(
      "MODULE_NOT_READY_FOR_CONFIRMATION",
      "There's nothing to confirm on this module yet.",
    );
  }

  const attempt = await loadAttemptRow(
    runModule.active_attempt_id,
    workspace.id,
  );
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  if (attempt.status !== "ready_for_review") {
    throw new ServiceError(
      "MODULE_NOT_READY_FOR_CONFIRMATION",
      "This module's output hasn't passed its checks yet, so there's nothing to confirm.",
    );
  }

  // Defense in depth: ready_for_review should already imply every required
  // Artifact exists, but never complete/unlock when a required output is
  // still missing on this attempt (e.g. stale UI / raced state).
  const missingRequired = await pool.query<{ artifact_key: string }>(
    `select d.artifact_key
     from artifact_definitions d
     join program_run_modules m
       on m.module_definition_id = d.module_definition_id
      and m.workspace_id = $2
     where m.id = $1
       and d.is_required = true
       and d.status <> 'archived'
       and not exists (
         select 1
         from artifact_submissions s
         where s.module_attempt_id = $3
           and s.artifact_definition_id = d.id
           and s.status not in ('superseded', 'deleted')
       )
     order by d.sequence_index`,
    [programRunModuleId, workspace.id, attempt.id],
  );
  if (missingRequired.rows.length > 0) {
    throw new ServiceError(
      "MODULE_NOT_READY_FOR_CONFIRMATION",
      "This module is missing a required document, so there's nothing to confirm yet.",
    );
  }

  const nextModuleUnlocked = await withTransaction((client) =>
    completeSystemModule(client, actor, workspace.id, runModule.id, attempt.id),
  );

  return { programRunModuleId, justConfirmed: true, nextModuleUnlocked };
}
