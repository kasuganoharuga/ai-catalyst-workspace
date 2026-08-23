import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactComment } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { assertValidBody } from "@ai-catalyst/services/artifact-comment/internal/validate";
import {
  mapComment,
  resolveOwnedComment,
  resolveUserDisplayName,
  type CommentRow,
} from "@ai-catalyst/services/artifact-comment/internal/rows";

export async function editArtifactComment(
  actor: ActorContext,
  input: { commentId: string; body: string },
): Promise<ArtifactComment> {
  const owned = await resolveOwnedComment(actor, input.commentId, pool);
  const body = assertValidBody(input.body);

  const result = await pool.query<CommentRow>(
    `update artifact_comments
     set body = $2, edited_at = now(), updated_at = now()
     where id = $1
     returning id, thread_id, author_user_id, author_role, body, written_on_version, edited_at, created_at`,
    [input.commentId, body],
  );
  const authorName = await resolveUserDisplayName(pool, owned.author_user_id);
  return { ...mapComment(result.rows[0]), authorName };
}

export async function softDeleteArtifactComment(
  actor: ActorContext,
  input: { commentId: string },
): Promise<void> {
  const owned = await resolveOwnedComment(actor, input.commentId, pool);

  const earliestResult = await pool.query<{ id: string }>(
    `select id from artifact_comments
     where thread_id = $1 and deleted_at is null
     order by created_at asc
     limit 1`,
    [owned.thread_id],
  );
  if (earliestResult.rows[0]?.id === input.commentId) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "The opening comment of a thread cannot be deleted — resolve the thread instead.",
    );
  }

  await pool.query(
    `update artifact_comments set deleted_at = now(), updated_at = now() where id = $1`,
    [input.commentId],
  );
}
