import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactComment } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { loadLatestSubmission } from "@ai-catalyst/services/artifact/internal/submission-load";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { insertCommentModuleEvent } from "@ai-catalyst/services/artifact-comment/internal/events";
import {
  assertValidBody,
  authorRoleForActor,
} from "@ai-catalyst/services/artifact-comment/internal/validate";
import {
  mapComment,
  resolveRunModuleAndArtifactKeyForThread,
  resolveThreadContext,
  resolveUserDisplayName,
  type CommentRow,
} from "@ai-catalyst/services/artifact-comment/internal/rows";

export interface ReplyToArtifactCommentThreadInput {
  threadId: string;
  body: string;
}

export async function replyToArtifactCommentThread(
  actor: ActorContext,
  input: ReplyToArtifactCommentThreadInput,
): Promise<ArtifactComment> {
  const threadRow = await resolveThreadContext(actor, input.threadId, pool);
  const body = assertValidBody(input.body);
  const authorRole = authorRoleForActor(actor);

  const submission = await loadLatestSubmission(
    pool,
    threadRow.module_attempt_id,
    threadRow.artifact_definition_id,
    { forUpdate: false },
  );
  // A thread can only exist if a submission existed when it was created;
  // that submission is superseded/deleted only by a newer confirmed save,
  // never removed outright — this is an invariant violation, not a normal
  // "nothing to reply to" outcome.
  if (!submission) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Thread ${input.threadId} has no resolvable Artifact submission.`,
    );
  }

  return withTransaction(async (client) => {
    const commentResult = await client.query<CommentRow>(
      `insert into artifact_comments (
         workspace_id, thread_id, author_user_id, author_role, body, written_on_version
       ) values ($1, $2, $3, $4, $5, $6)
       returning id, thread_id, author_user_id, author_role, body, written_on_version, edited_at, created_at`,
      [
        threadRow.workspace_id,
        input.threadId,
        actor.userId,
        authorRole,
        body,
        submission.version_number,
      ],
    );

    await client.query(
      `update artifact_comment_threads set updated_at = now() where id = $1`,
      [input.threadId],
    );

    await client.query(
      `insert into artifact_comment_reads (thread_id, user_id, last_read_at)
       values ($1, $2, now())
       on conflict (thread_id, user_id) do update set last_read_at = now()`,
      [input.threadId, actor.userId],
    );

    const { runModule, artifactKey } =
      await resolveRunModuleAndArtifactKeyForThread(client, threadRow);

    await insertCommentModuleEvent(client, {
      workspaceId: threadRow.workspace_id,
      runModule,
      moduleAttemptId: threadRow.module_attempt_id,
      eventType: "artifact_comment_added",
      actor,
      threadId: input.threadId,
      artifactKey,
      anchorKind: threadRow.anchor_kind,
    });

    const authorName = await resolveUserDisplayName(client, actor.userId);
    return { ...mapComment(commentResult.rows[0]), authorName };
  });
}
