import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ModuleAttemptStatus } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  getArtifactSubmission,
  saveArtifactSubmission,
} from "@ai-catalyst/services/artifact";
import { renderSetupSummaryMarkdown } from "@ai-catalyst/services/module/internal/setup-summary";
import {
  resolveAiClientLabel,
  type CompletionContextRow,
  type RunModuleLockRow,
} from "@ai-catalyst/services/module/internal/completion-rows";
import { insertCompletionEvent } from "@ai-catalyst/services/module/internal/completion-events";

// Module 0 setup summary via founder-scoped save — idempotent if submission already exists.
export async function ensureSetupSummarySubmission(
  actor: ActorContext,
  attemptId: string,
  moduleDefinitionId: string,
  context: CompletionContextRow,
): Promise<void> {
  const requiredArtifactsResult = await pool.query<{ artifact_key: string }>(
    `select artifact_key from artifact_definitions
     where module_definition_id = $1 and is_required = true and status <> 'archived'
     order by sequence_index`,
    [moduleDefinitionId],
  );

  const programRunLabel = context.program_run_name
    ? `${context.program_run_name} (Run #${context.run_number})`
    : `Run #${context.run_number}`;

  for (const { artifact_key: artifactKey } of requiredArtifactsResult.rows) {
    const existing = await getArtifactSubmission(actor, {
      attemptId,
      artifactKey,
    });
    if (existing) {
      continue;
    }
    const content = renderSetupSummaryMarkdown({
      workspaceName: context.workspace_name,
      ventureName: context.venture_name,
      programRunLabel,
      branchName: context.branch_name,
      aiClientLabel: resolveAiClientLabel(actor),
      checkedAtIso: new Date().toISOString(),
      storageVerified: true,
      nextModuleTitle: context.next_module_title,
    });
    await saveArtifactSubmission(actor, { attemptId, artifactKey, content });
  }
}

export interface NextModuleUnlocked {
  id: string;
  moduleKey: string;
  title: string;
}

// Lock run_module then attempt; re-verify ready_for_review under lock — founder confirms, not system.
export async function completeSystemModule(
  client: PoolClient,
  actor: ActorContext,
  workspaceId: string,
  runModuleId: string,
  attemptId: string,
): Promise<NextModuleUnlocked | null> {
  const runModuleResult = await client.query<RunModuleLockRow>(
    `select id, program_run_id, program_run_branch_id, sequence_index, status, active_attempt_id
     from program_run_modules
     where id = $1 and workspace_id = $2
     for update`,
    [runModuleId, workspaceId],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }
  if (runModule.status !== "in_progress") {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `program_run_module ${runModule.id} is "${runModule.status}", expected "in_progress".`,
    );
  }

  const attemptResult = await client.query<{
    id: string;
    status: ModuleAttemptStatus;
  }>(
    `select id, status from module_attempts where id = $1 and program_run_module_id = $2 for update`,
    [attemptId, runModule.id],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  if (attempt.status !== "ready_for_review") {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attempt.id} is "${attempt.status}", expected "ready_for_review" after a passing official validation.`,
    );
  }

  await client.query(
    `update module_attempts
     set status = 'accepted', accepted_at = now(), accepted_by_user_id = $2, updated_at = now()
     where id = $1`,
    [attempt.id, actor.userId],
  );

  await client.query(
    `update program_run_modules
     set status = 'completed', completed_at = now(), completed_by_user_id = $3,
         accepted_attempt_id = $1, active_attempt_id = null, updated_at = now()
     where id = $2`,
    [attempt.id, runModule.id, actor.userId],
  );

  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: runModule.id,
    moduleAttemptId: attempt.id,
    eventType: "attempt_accepted",
    actor,
    fromStatus: "ready_for_review",
    toStatus: "accepted",
  });
  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: runModule.id,
    moduleAttemptId: attempt.id,
    eventType: "module_completed",
    actor,
    fromStatus: runModule.status,
    toStatus: "completed",
  });

  // Joined to module_definitions.status = 'active' so a Module whose
  // definition has been archived (removed from the living content
  // constants) is never treated as "next" here — it must neither be
  // unlocked nor block the *following* still-active Module from being
  // found. This is the same "archived definitions exit the active
  // progression chain" invariant reconcileRunModules enforces when it
  // moves an orphaned row's sequence_index past every active Module's;
  // this query is the other half of that invariant, on the read side.
  const nextModuleResult = await client.query<{
    id: string;
    module_key: string;
    title_snapshot: string;
    status: string;
  }>(
    `select pnm.id, pnm.module_key, pnm.title_snapshot, pnm.status
     from program_run_modules pnm
     join module_definitions nd on nd.id = pnm.module_definition_id and nd.status = 'active'
     where pnm.program_run_branch_id = $1 and pnm.sequence_index > $2
     order by pnm.sequence_index
     limit 1
     for update of pnm`,
    [runModule.program_run_branch_id, runModule.sequence_index],
  );
  const nextModule = nextModuleResult.rows[0];
  // No next (active-definition) Module (this was the last one, or every
  // Module after it has been archived), or it's already
  // available/in_progress/completed/inherited from an earlier run of this
  // same completion (idempotent replay) — either way, nothing to unlock.
  if (!nextModule || nextModule.status !== "locked") {
    return null;
  }

  await client.query(
    `update program_run_modules
     set status = 'available', unlocked_at = now(), updated_at = now()
     where id = $1`,
    [nextModule.id],
  );

  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: nextModule.id,
    moduleAttemptId: null,
    eventType: "module_unlocked",
    actor,
    fromStatus: "locked",
    toStatus: "available",
    metadata: { unlocked_module_key: nextModule.module_key },
  });

  return {
    id: nextModule.id,
    moduleKey: nextModule.module_key,
    title: nextModule.title_snapshot,
  };
}
