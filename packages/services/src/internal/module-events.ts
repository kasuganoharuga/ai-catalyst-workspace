import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

/**
 * Shared insert shape for `module_events`. Callers still own actor_type /
 * source_provider mapping (those domains differ per Service module); this
 * only centralises the expanded column list (status, correlation, entity,
 * metadata) so PR2 field-contract changes land once.
 */
export type ModuleEventInsert = {
  workspaceId: string;
  programRunId: string;
  programRunBranchId: string;
  programRunModuleId: string;
  moduleAttemptId: string | null;
  eventType: string;
  actorType: string;
  actorUserId: string | null;
  sourceProvider: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  metadata?: Record<string, unknown>;
  entityType?: string | null;
  entityId?: string | null;
  actor: ActorContext;
};

export async function insertModuleEventRow(
  client: PoolClient,
  input: ModuleEventInsert,
): Promise<void> {
  await client.query(
    `insert into module_events (
       workspace_id, program_run_id, program_run_branch_id, program_run_module_id,
       module_attempt_id, event_type, actor_type, actor_user_id, source_provider,
       from_status, to_status, metadata, trace_id, request_id, entity_type, entity_id
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12::jsonb, $13, $14, $15, $16
     )`,
    [
      input.workspaceId,
      input.programRunId,
      input.programRunBranchId,
      input.programRunModuleId,
      input.moduleAttemptId,
      input.eventType,
      input.actorType,
      input.actorUserId,
      input.sourceProvider,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.actor.traceId ?? null,
      input.actor.requestId ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
    ],
  );
}
