import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { RunModuleSummary } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { getActiveContext } from "@ai-catalyst/services/workspace/active-context";
import {
  RUN_MODULE_SUMMARY_COLUMNS,
  listRunModulesForBranch,
  mapRunModuleSummaryRow,
  type RunModuleSummaryRow,
} from "@ai-catalyst/services/internal/run-module";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";

// Backs MCP list_modules/get_module_status and module/context.ts. Never inserts.

export interface CurrentVentureRun {
  workspaceId: string;
  ventureId: string;
  runId: string;
  activeBranchId: string;
}

// Resolves current Venture Run via user_active_contexts.
async function resolveCurrentVentureRun(
  actor: ActorContext,
): Promise<CurrentVentureRun | null> {
  const activeContext = await getActiveContext(actor);
  if (!activeContext.workspaceId || !activeContext.ventureId) {
    return null;
  }

  const result = await pool.query<{
    id: string;
    active_branch_id: string | null;
  }>(
    `select id, active_branch_id from program_runs
     where venture_id = $1 and workspace_id = $2 and status <> 'archived'
     limit 1`,
    [activeContext.ventureId, activeContext.workspaceId],
  );
  const run = result.rows[0];
  if (!run || !run.active_branch_id) {
    return null;
  }

  return {
    workspaceId: activeContext.workspaceId,
    ventureId: activeContext.ventureId,
    runId: run.id,
    activeBranchId: run.active_branch_id,
  };
}

export interface ListRunModulesResult {
  // All null when no active Venture or Run yet — empty list, not an error.
  workspaceId: string | null;
  ventureId: string | null;
  runId: string | null;
  modules: RunModuleSummary[];
}

/**
 * Lists program_run_modules for the Founder's current Run/Branch in sequence order.
 */
export async function listRunModules(
  actor: ActorContext,
): Promise<ListRunModulesResult> {
  assertRole(actor, ["founder"]);
  const currentRun = await resolveCurrentVentureRun(actor);
  if (!currentRun) {
    return { workspaceId: null, ventureId: null, runId: null, modules: [] };
  }

  return {
    workspaceId: currentRun.workspaceId,
    ventureId: currentRun.ventureId,
    runId: currentRun.runId,
    modules: await listRunModulesForBranch(currentRun.activeBranchId),
  };
}

function normalizeModuleKeyInput(input: unknown): { moduleKey: string } {
  if (typeof input !== "object" || input === null || !("moduleKey" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "moduleKey is required.");
  }
  const { moduleKey } = input as { moduleKey: unknown };
  if (typeof moduleKey !== "string" || moduleKey.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "moduleKey must be a non-blank string.",
    );
  }
  return { moduleKey };
}

/**
 * Reads one program_run_modules row by moduleKey for the Founder's current Run/Branch.
 */
export async function getRunModuleByKey(
  actor: ActorContext,
  input: unknown,
): Promise<RunModuleSummary> {
  assertRole(actor, ["founder"]);
  const { moduleKey } = normalizeModuleKeyInput(input);
  const currentRun = await resolveCurrentVentureRun(actor);
  if (!currentRun) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }

  const result = await pool.query<RunModuleSummaryRow>(
    `select ${RUN_MODULE_SUMMARY_COLUMNS}
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     where m.program_run_branch_id = $1 and m.module_key = $2`,
    [currentRun.activeBranchId, moduleKey],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }
  return mapRunModuleSummaryRow(row);
}

export interface AttemptRunContext {
  workspaceId: string;
  programRunId: string;
  programRunBranchId: string;
  programRunModuleId: string;
}

/**
 * Resolves Run/Branch/Module hierarchy for an Attempt — used by MCP audit logging
 * when the tool input is attemptId rather than programRunModuleId.
 */
export async function resolveAttemptRunContext(
  actor: ActorContext,
  attemptId: string,
): Promise<AttemptRunContext> {
  assertRole(actor, ["founder"]);
  const id = parseEntityIdOrNotFound(attemptId, "Attempt not found.");
  const workspace = await resolveFounderWorkspace(actor);

  const result = await pool.query<{
    program_run_module_id: string;
    program_run_id: string;
    program_run_branch_id: string;
  }>(
    `select a.program_run_module_id, m.program_run_id, m.program_run_branch_id
     from module_attempts a
     join program_run_modules m on m.id = a.program_run_module_id
     where a.id = $1 and a.workspace_id = $2`,
    [id, workspace.id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  return {
    workspaceId: workspace.id,
    programRunId: row.program_run_id,
    programRunBranchId: row.program_run_branch_id,
    programRunModuleId: row.program_run_module_id,
  };
}
