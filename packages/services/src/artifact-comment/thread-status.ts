import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "@ai-catalyst/services/errors";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { insertCommentModuleEvent } from "@ai-catalyst/services/artifact-comment/internal/events";
import {
  resolveRunModuleAndArtifactKeyForThread,
  resolveThreadContext,
} from "@ai-catalyst/services/artifact-comment/internal/rows";

async function setThreadStatus(
  actor: ActorContext,
  threadId: string,
  status: "open" | "resolved",
): Promise<void> {
  const threadRow = await resolveThreadContext(actor, threadId, pool);
  // Only the Mentor giving feedback (or an Admin) decides a thread is
  // addressed — the Founder can reply, but not close out their own
  // feedback loop. Within-scope-but-wrong-role, so FORBIDDEN, not
  // NOT_FOUND — same convention as resolveOwnedComment's author-only check.
  if (actor.role === "founder") {
    throw new ServiceError(
      "FORBIDDEN",
      "Only a Mentor or Admin can resolve or reopen a comment thread.",
    );
  }

  await withTransaction(async (client) => {
    if (status === "resolved") {
      await client.query(
        `update artifact_comment_threads
         set status = 'resolved', resolved_by_user_id = $2, resolved_at = now(), updated_at = now()
         where id = $1`,
        [threadId, actor.userId],
      );

      const { runModule, artifactKey } =
        await resolveRunModuleAndArtifactKeyForThread(client, threadRow);
      await insertCommentModuleEvent(client, {
        workspaceId: threadRow.workspace_id,
        runModule,
        moduleAttemptId: threadRow.module_attempt_id,
        eventType: "artifact_comment_resolved",
        actor,
        threadId,
        artifactKey,
        anchorKind: threadRow.anchor_kind,
      });
    } else {
      await client.query(
        `update artifact_comment_threads
         set status = 'open', resolved_by_user_id = null, resolved_at = null, updated_at = now()
         where id = $1`,
        [threadId],
      );
    }
  });
}

export async function resolveArtifactCommentThread(
  actor: ActorContext,
  input: { threadId: string },
): Promise<void> {
  await setThreadStatus(actor, input.threadId, "resolved");
}

export async function reopenArtifactCommentThread(
  actor: ActorContext,
  input: { threadId: string },
): Promise<void> {
  await setThreadStatus(actor, input.threadId, "open");
}
