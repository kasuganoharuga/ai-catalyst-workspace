import { pool } from "@ai-catalyst/db";
import type {
  ModuleCompletionMode,
  ModuleType,
  RunModuleSummary,
} from "@ai-catalyst/shared";

// The program_run_modules read shape, shared by the Founder path
// (packages/services/src/workflow, which reaches a Run through the actor's
// own active context) and the Mentor path (packages/services/src/mentor,
// which is handed a Workspace id after an ownership check). Extracted here
// rather than duplicated so a column added for one is never silently missing
// from the other — the two surfaces are supposed to describe the same Run.
//
// Nothing in this module authorizes anything. Callers do that first.

// Joins module_definitions for module_type/completion_mode — those are
// content-level fields with no equivalent snapshot column on
// program_run_modules itself (only module_key/title_snapshot are
// snapshotted there).
export const RUN_MODULE_SUMMARY_COLUMNS = `
  m.id, m.workspace_id, m.program_run_id, m.program_run_branch_id, m.module_definition_id,
  m.module_key, m.title_snapshot, m.sequence_index, m.status,
  m.active_attempt_id, m.accepted_attempt_id, m.unlocked_at, m.started_at, m.completed_at,
  d.module_type, d.completion_mode
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
  };
}

export interface WorkspaceRunContext {
  ventureId: string;
  runId: string;
  activeBranchId: string;
}

/**
 * Resolves a Workspace's current Run/Branch without consulting anyone's
 * active context.
 *
 * The Founder path reaches the same Run through `user_active_contexts`,
 * which is the right answer for "the Run I am working in" but the wrong
 * question entirely for a Mentor: their own active context says nothing
 * about the Founder they are looking at, and writing to it (which
 * getActiveContext does) would be a side effect of a read.
 *
 * Returns null when the Workspace has no Venture yet, or no non-archived
 * Run — a Founder who accepted their invitation but never started. That is
 * a normal state to render, not an error.
 *
 * Authorization is the caller's responsibility: this takes a Workspace id,
 * not an actor, and will happily read any Workspace it is given.
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

/**
 * Every Module of one Run/Branch, in sequence order. Authorization is the
 * caller's responsibility — see resolveWorkspaceRunContext.
 */
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
