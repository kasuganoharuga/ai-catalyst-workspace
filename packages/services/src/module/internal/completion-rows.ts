import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ModuleCompletionMode, ModuleType } from "@ai-catalyst/shared";

import {
  ATTEMPT_COLUMNS,
  type AttemptRow,
} from "@ai-catalyst/services/attempt/internal/rows";

export async function loadAttemptRow(
  attemptId: string,
  workspaceId: string,
): Promise<AttemptRow | null> {
  const result = await pool.query<AttemptRow>(
    `select ${ATTEMPT_COLUMNS} from module_attempts where id = $1 and workspace_id = $2`,
    [attemptId, workspaceId],
  );
  return result.rows[0] ?? null;
}

export interface CompletionContextRow {
  run_module_id: string;
  module_definition_id: string;
  module_key: string;
  program_run_id: string;
  program_run_branch_id: string;
  sequence_index: number;
  module_type: ModuleType;
  completion_mode: ModuleCompletionMode;
  workspace_name: string;
  venture_name: string;
  program_run_name: string | null;
  run_number: number;
  branch_name: string;
  next_module_title: string | null;
}

// One read-only query for auto-complete branch and Module 0 setup summary — re-checked under lock before writes.
export async function loadCompletionContext(
  runModuleId: string,
  workspaceId: string,
): Promise<CompletionContextRow | null> {
  const result = await pool.query<CompletionContextRow>(
    `select
       m.id as run_module_id,
       m.module_definition_id,
       d.module_key,
       m.program_run_id,
       m.program_run_branch_id,
       m.sequence_index,
       d.module_type,
       d.completion_mode,
       w.name as workspace_name,
       v.name as venture_name,
       r.name as program_run_name,
       r.run_number,
       b.name as branch_name,
       (
         -- Filtered to module_definitions.status = 'active' so an
         -- archived-but-not-yet-reconciled-out-of-this-Run Module is
         -- never surfaced as "what's next" — see the living-V1 plan's
         -- progression query audit (module_definitions archival must not
         -- leak into this founder-facing string).
         select pnm.title_snapshot
         from program_run_modules pnm
         join module_definitions nd on nd.id = pnm.module_definition_id and nd.status = 'active'
         where pnm.program_run_branch_id = m.program_run_branch_id
           and pnm.sequence_index > m.sequence_index
         order by pnm.sequence_index
         limit 1
       ) as next_module_title
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     join program_runs r on r.id = m.program_run_id
     join program_run_branches b on b.id = m.program_run_branch_id
     join ventures v on v.id = r.venture_id
     join workspaces w on w.id = m.workspace_id
     where m.id = $1 and m.workspace_id = $2`,
    [runModuleId, workspaceId],
  );
  return result.rows[0] ?? null;
}

// Founder-visible AI client label from actor.provider (redirect host), not self-declared name.
export function resolveAiClientLabel(actor: ActorContext): string {
  if (actor.source === "web") {
    return "Founder Toolkit (Web)";
  }
  switch (actor.provider) {
    case "claude":
      return "Claude (Remote MCP)";
    case "openai":
      return "ChatGPT (Remote MCP)";
    default:
      return "AI assistant (Remote MCP)";
  }
}

export interface RunModuleLockRow {
  id: string;
  program_run_id: string;
  program_run_branch_id: string;
  sequence_index: number;
  status: string;
  active_attempt_id: string | null;
}
