import { pool } from "@ai-catalyst/db";
import type {
  ModuleCompletionMode,
  ModuleType,
  RunModuleSummary,
} from "@ai-catalyst/shared";

// program_run_modules read shape — shared by Founder (workflow) and Mentor paths.
// Authorization is the caller's responsibility.

// Joins module_definitions for module_type/completion_mode (not snapshotted on run modules).
export const RUN_MODULE_SUMMARY_COLUMNS = `
  m.id, m.workspace_id, m.program_run_id, m.program_run_branch_id, m.module_definition_id,
  m.module_key, m.title_snapshot, m.sequence_index, m.status,
  m.active_attempt_id, m.accepted_attempt_id, m.unlocked_at, m.started_at, m.completed_at,
  d.module_type, d.completion_mode, d.status as definition_status
`;

export interface RunModuleSummaryRow {
  id: string;
  workspace_id: string;
  program_run_id: string;
  program_run_branch_id: string;
  module_definition_id: string;
  module_key: string;
  title_snapshot: string;
  sequence_index: number;
  status: RunModuleSummary["status"];
  active_attempt_id: string | null;
  accepted_attempt_id: string | null;
  unlocked_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  module_type: ModuleType;
  completion_mode: ModuleCompletionMode;
  definition_status: string;
}

export function mapRunModuleSummaryRow(
  row: RunModuleSummaryRow,
): RunModuleSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    programRunId: row.program_run_id,
    programRunBranchId: row.program_run_branch_id,
    moduleDefinitionId: row.module_definition_id,
    moduleKey: row.module_key,
    title: row.title_snapshot,
    sequenceIndex: row.sequence_index,
    moduleType: row.module_type,
    completionMode: row.completion_mode,
    status: row.status,
    activeAttemptId: row.active_attempt_id,
    acceptedAttemptId: row.accepted_attempt_id,
    unlockedAt: row.unlocked_at?.toISOString() ?? null,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    isArchivedDefinition: row.definition_status === "archived",
  };
}

export interface WorkspaceRunContext {
  ventureId: string;
  runId: string;
  activeBranchId: string;
}

/**
 * Resolves a Workspace's current Run/Branch without active context.
 * Mentor path must not read/write user_active_contexts. Caller must authorize.
 */
export async function resolveWorkspaceRunContext(
  workspaceId: string,
): Promise<WorkspaceRunContext | null> {
  const result = await pool.query<{
    venture_id: string;
    id: string;
    active_branch_id: string | null;
  }>(
    `select r.venture_id, r.id, r.active_branch_id
     from program_runs r
     where r.workspace_id = $1 and r.status <> 'archived'
     order by r.created_at desc
     limit 1`,
    [workspaceId],
  );

  const run = result.rows[0];
  if (!run || !run.active_branch_id) {
    return null;
  }

  return {
    ventureId: run.venture_id,
    runId: run.id,
    activeBranchId: run.active_branch_id,
  };
}

/** All Modules of one Run/Branch in sequence order. Caller must authorize. */
export async function listRunModulesForBranch(
  branchId: string,
): Promise<RunModuleSummary[]> {
  const result = await pool.query<RunModuleSummaryRow>(
    `select ${RUN_MODULE_SUMMARY_COLUMNS}
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     where m.program_run_branch_id = $1
     order by m.sequence_index`,
    [branchId],
  );

  return result.rows.map(mapRunModuleSummaryRow);
}
