import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";
import type { ModuleAttemptStatus } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";

const log = loggerForService(SERVICE_NAMES.services);
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import {
  completeModuleAttempt,
  confirmModuleCompletion,
  type NextModuleUnlocked,
} from "@ai-catalyst/services/module/completion";

// Completes setup Module (Module 0) server-side — real Attempt path, no Founder round trip.
// Never throws for recoverable states; runs inline on "open my programme".

export type AutoSetupResult =
  // Completed by this call.
  | {
      status: "completed";
      programRunModuleId: string;
      nextModuleUnlocked: NextModuleUnlocked | null;
    }
  // Already completed — common case after first visit.
  | { status: "already_completed"; programRunModuleId: string }
  // No setup Module in this Program Version.
  | { status: "not_applicable" }
  // Failed — reason is for logs, not user-facing copy.
  | { status: "failed"; reason: string; code: string | null };

export interface AutoCompleteSetupModuleInput {
  programRunId: string;
}

interface SetupRunModuleRow {
  id: string;
  status: string;
  active_attempt_id: string | null;
}

// Terminal Attempt statuses — no further progress without a new Attempt.
const TERMINAL_ATTEMPT_STATUSES: ReadonlySet<ModuleAttemptStatus> = new Set([
  "accepted",
  "rejected",
  "cancelled",
  "validation_failed",
]);

// Active Branch only — covers getOrCreateProgramRun window before active_branch_id is set.
async function loadSetupRunModule(
  programRunId: string,
  workspaceId: string,
): Promise<SetupRunModuleRow | null> {
  const result = await pool.query<SetupRunModuleRow>(
    `select m.id, m.status, m.active_attempt_id
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     join program_runs r on r.id = m.program_run_id
     where m.program_run_id = $1
       and m.workspace_id = $2
       and d.module_type = 'setup'
       and d.status = 'active'
       and (r.active_branch_id is null or m.program_run_branch_id = r.active_branch_id)
     order by m.sequence_index
     limit 1`,
    [programRunId, workspaceId],
  );
  return result.rows[0] ?? null;
}

async function loadAttemptStatus(
  attemptId: string,
  workspaceId: string,
): Promise<ModuleAttemptStatus | null> {
  const result = await pool.query<{ status: ModuleAttemptStatus }>(
    `select status from module_attempts where id = $1 and workspace_id = $2`,
    [attemptId, workspaceId],
  );
  return result.rows[0]?.status ?? null;
}

/**
 * Completes setup Module without Founder involvement. Idempotent — safe for refresh/double-click.
 */
export async function autoCompleteSetupModule(
  actor: ActorContext,
  input: AutoCompleteSetupModuleInput,
): Promise<AutoSetupResult> {
  assertRole(actor, ["founder"]);
  const programRunId = parseEntityIdOrNotFound(
    input.programRunId,
    "Program Run not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const runModule = await loadSetupRunModule(programRunId, workspace.id);
  if (!runModule) {
    return { status: "not_applicable" };
  }
  if (runModule.status === "completed") {
    return { status: "already_completed", programRunModuleId: runModule.id };
  }
  // locked/inherited on sequence-0 means Run was not created by getOrCreateProgramRun.
  if (runModule.status !== "available" && runModule.status !== "in_progress") {
    return {
      status: "failed",
      reason: `Setup module is "${runModule.status}", which cannot be started.`,
      code: "RUN_MODULE_NOT_AVAILABLE",
    };
  }

  try {
    let attemptId = runModule.active_attempt_id;
    let attemptStatus = attemptId
      ? await loadAttemptStatus(attemptId, workspace.id)
      : null;

    // No live Attempt — startOrResumeAttempt handles first attempt and retry.
    if (
      attemptId === null ||
      attemptStatus === null ||
      TERMINAL_ATTEMPT_STATUSES.has(attemptStatus)
    ) {
      const started = await startOrResumeAttempt(actor, {
        programRunModuleId: runModule.id,
      });
      attemptId = started.attempt.id;
      attemptStatus = started.attempt.status;
    }

    // ready_for_review — skip completeModuleAttempt, go straight to confirm.
    if (attemptStatus !== "ready_for_review") {
      const completion = await completeModuleAttempt(actor, { attemptId });
      if (!completion.passed) {
        const detail = [
          ...completion.missingArtifactKeys.map(
            (key) => `missing artifact "${key}"`,
          ),
          ...completion.validationErrors.map((error) => error.message),
        ].join("; ");
        return {
          status: "failed",
          reason: detail || "Setup checks did not pass.",
          code: "VALIDATION_ERROR",
        };
      }
    }

    const confirmation = await confirmModuleCompletion(actor, {
      programRunModuleId: runModule.id,
    });
    return {
      status: "completed",
      programRunModuleId: runModule.id,
      nextModuleUnlocked: confirmation.nextModuleUnlocked,
    };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { status: "failed", reason: error.message, code: error.code };
    }
    // Unexpected failure — log with context; caller degrades gracefully.
    log.error({
      event: "setup_module_auto_complete_failed",
      message: "autoCompleteSetupModule failed unexpectedly",
      program_run_id: programRunId,
      program_run_module_id: runModule.id,
      trace_id: actor.traceId,
      request_id: actor.requestId,
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return {
      status: "failed",
      reason: "Setup could not be completed automatically.",
      code: null,
    };
  }
}
