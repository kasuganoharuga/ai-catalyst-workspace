import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ModuleAttemptStatus, ModuleType } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";

import type { QueryExecutor } from "@ai-catalyst/services/artifact/internal/transaction";

const EDITABLE_ATTEMPT_STATUSES = ["draft", "in_progress"] as const;

export interface RunModuleRow {
  id: string;
  module_definition_id: string;
  program_run_id: string;
  program_run_branch_id: string;
  active_attempt_id: string | null;
  // Joined from module_definitions — used by runOfficialValidation's
  // setup-module bypass when no validator is configured.
  module_type: ModuleType;
}

// Deliberately its own narrow row shape (id, program_run_module_id,
// status only) rather than a reuse of attempt/internal/rows.ts's
// AttemptRow — every query below only ever selects these 3 columns, and
// nothing here ever maps to the public ModuleAttempt DTO, so pulling in
// that file's full ATTEMPT_COLUMNS/mapAttemptRow would be dead weight.
export interface AttemptRow {
  id: string;
  program_run_module_id: string;
  status: ModuleAttemptStatus;
}

export function assertEditableAttempt(status: ModuleAttemptStatus): void {
  if (
    !(EDITABLE_ATTEMPT_STATUSES as readonly ModuleAttemptStatus[]).includes(
      status,
    )
  ) {
    throw new ServiceError(
      "ATTEMPT_NOT_EDITABLE",
      `Attempt is "${status}" and can no longer be edited.`,
    );
  }
}

// Shared by both founder-scoped callers (saveArtifactSubmission,
// runDraftCheck) and the trusted system/admin caller
// (runOfficialValidation) below, via two thin wrappers — the row-locking
// logic itself (and the mandated program_run_modules-before-
// module_attempts lock order) is identical either way; only how the
// Workspace is resolved differs.
export async function resolveAttemptContext(
  workspaceId: string,
  attemptId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<{ runModule: RunModuleRow; attempt: AttemptRow }> {
  const lookupResult = await executor.query<{ program_run_module_id: string }>(
    `select program_run_module_id from module_attempts where id = $1 and workspace_id = $2`,
    [attemptId, workspaceId],
  );
  const runModuleId = lookupResult.rows[0]?.program_run_module_id;
  if (!runModuleId) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  const runModuleResult = await executor.query<RunModuleRow>(
    `select m.id, m.module_definition_id, m.program_run_id, m.program_run_branch_id,
            m.active_attempt_id, d.module_type
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     where m.id = $1 and m.workspace_id = $2
     ${options.forUpdate ? "for update of m" : ""}`,
    [runModuleId, workspaceId],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} has no owning program_run_module.`,
    );
  }

  const attemptResult = await executor.query<AttemptRow>(
    `select id, program_run_module_id, status from module_attempts
     where id = $1 and program_run_module_id = $2
     ${options.forUpdate ? "for update" : ""}`,
    [attemptId, runModule.id],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  return { runModule, attempt };
}

export async function resolveAttemptContextForFounder(
  actor: ActorContext,
  attemptId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<{
  workspaceId: string;
  runModule: RunModuleRow;
  attempt: AttemptRow;
}> {
  const workspace = await resolveFounderWorkspace(actor, executor);
  const { runModule, attempt } = await resolveAttemptContext(
    workspace.id,
    attemptId,
    executor,
    options,
  );
  return { workspaceId: workspace.id, runModule, attempt };
}

// No Workspace comparison at all — trusted for the same reason
// loadAuthorizedStorageObject's system branch and
// getGeneratedTextContent's system/admin branch have none: there is no
// "system's own Workspace" or "admin's own Workspace" to compare
// against. Only reachable after assertOfficialValidationAuthority.
export async function resolveAttemptContextTrusted(
  attemptId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<{
  workspaceId: string;
  runModule: RunModuleRow;
  attempt: AttemptRow;
}> {
  const lookupResult = await executor.query<{ workspace_id: string }>(
    `select workspace_id from module_attempts where id = $1`,
    [attemptId],
  );
  const workspaceId = lookupResult.rows[0]?.workspace_id;
  if (!workspaceId) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  const { runModule, attempt } = await resolveAttemptContext(
    workspaceId,
    attemptId,
    executor,
    options,
  );
  return { workspaceId, runModule, attempt };
}
