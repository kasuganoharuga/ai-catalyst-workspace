import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { withTransaction } from "@ai-catalyst/services/artifact/internal/transaction";
import { isModuleResetAllowed } from "@ai-catalyst/services/module/reset-allowed";

export { isModuleResetAllowed } from "@ai-catalyst/services/module/reset-allowed";

// Testing convenience: wipe one Module's progress — and every Module
// after it in the same Branch, since their availability depends on this
// one having been completed — back to "never started". Deleting only
// the target Module and leaving downstream Modules unlocked would leave
// a Founder able to work on a Module whose prerequisite no longer has
// an answer.
//
// Allowed unless APP_ENV is explicitly production. Gated here (defense
// in depth behind the website action). NODE_ENV cannot be the gate:
// Next.js production builds (including the staging image) set
// NODE_ENV=production, and the live staging task definition may omit
// APP_ENV because deploy-aws.yml only rewrites the image.

export interface ResetModuleProgressResult {
  resetModuleIds: string[];
  attemptsDeleted: number;
}

interface RunModuleRow {
  id: string;
  sequence_index: number;
}

export async function resetModuleProgress(
  actor: ActorContext,
  programRunModuleIdRaw: string,
): Promise<ResetModuleProgressResult> {
  if (!isModuleResetAllowed()) {
    throw new ServiceError(
      "FORBIDDEN",
      "Resetting a Module's progress is a testing tool and is disabled in production.",
    );
  }

  assertRole(actor, ["founder"]);
  const programRunModuleId = parseEntityIdOrNotFound(
    programRunModuleIdRaw,
    "Module not found.",
  );

  return withTransaction(async (client) => {
    const workspace = await resolveFounderWorkspace(actor, client);

    const target = await client.query<RunModuleRow>(
      `select id, sequence_index
       from program_run_modules
       where id = $1 and workspace_id = $2
       for update`,
      [programRunModuleId, workspace.id],
    );
    const targetRow = target.rows[0];
    if (!targetRow) {
      throw new ServiceError("NOT_FOUND", "Module not found.");
    }

    // This Module plus everything after it in the same Run — resolved via
    // program_run_id rather than program_run_branch_id, so resetting a
    // Module also resets its counterpart on any child Branch that
    // inherited past it.
    const downstream = await client.query<RunModuleRow>(
      `select pnm.id, pnm.sequence_index
       from program_run_modules pnm
       where pnm.workspace_id = $1
         and pnm.sequence_index >= $2
         and pnm.program_run_id = (
           select program_run_id from program_run_modules where id = $3
         )
       for update`,
      [workspace.id, targetRow.sequence_index, programRunModuleId],
    );
    const resetIds = downstream.rows.map((row) => row.id);

    // Detach before delete: active/accepted_attempt_id are NO ACTION FKs
    // into module_attempts, so they must be cleared first or the delete
    // below violates them.
    await client.query(
      `update program_run_modules
       set active_attempt_id = null, accepted_attempt_id = null
       where id = any($1::uuid[]) and workspace_id = $2`,
      [resetIds, workspace.id],
    );

    const attempts = await client.query<{ id: string }>(
      `select id from module_attempts
       where program_run_module_id = any($1::uuid[]) and workspace_id = $2`,
      [resetIds, workspace.id],
    );
    const attemptIds = attempts.rows.map((row) => row.id);

    if (attemptIds.length > 0) {
      // module_events and mcp_tool_audit_logs have no ON DELETE on
      // module_attempt_id — detach rather than delete, so the audit
      // trail survives the reset. Skipping the MCP audit detach is
      // what made Reset fail on staging after a real Claude session.
      await client.query(
        `update module_events
         set module_attempt_id = null
         where module_attempt_id = any($1::uuid[]) and workspace_id = $2`,
        [attemptIds, workspace.id],
      );
      await client.query(
        `update mcp_tool_audit_logs
         set module_attempt_id = null
         where module_attempt_id = any($1::uuid[])
           and (workspace_id = $2 or workspace_id is null)`,
        [attemptIds, workspace.id],
      );
      // Cascades to module_responses, module_review_context_snapshots,
      // artifact_submissions and its own children.
      await client.query(
        `delete from module_attempts
         where id = any($1::uuid[]) and workspace_id = $2`,
        [attemptIds, workspace.id],
      );
    }

    // Not attempt-scoped, so not cascaded by the delete above.
    await client.query(
      `delete from module_prep_documents
       where program_run_module_id = any($1::uuid[]) and workspace_id = $2`,
      [resetIds, workspace.id],
    );

    // The target Module becomes available again — whatever unlocked it
    // originally still holds, since nothing before it was touched. Every
    // Module after it goes back to locked: it was only available because
    // the target had been completed, which is no longer true.
    await client.query(
      `update program_run_modules
       set status = 'available', unlocked_at = now(), started_at = null,
           ready_to_unlock_at = null, completed_at = null,
           completed_by_user_id = null
       where id = $1 and workspace_id = $2`,
      [targetRow.id, workspace.id],
    );
    const strictlyDownstreamIds = resetIds.filter((id) => id !== targetRow.id);
    if (strictlyDownstreamIds.length > 0) {
      await client.query(
        `update program_run_modules
         set status = 'locked', unlocked_at = null, started_at = null,
             ready_to_unlock_at = null, completed_at = null,
             completed_by_user_id = null
         where id = any($1::uuid[]) and workspace_id = $2`,
        [strictlyDownstreamIds, workspace.id],
      );
    }

    return { resetModuleIds: resetIds, attemptsDeleted: attemptIds.length };
  });
}
