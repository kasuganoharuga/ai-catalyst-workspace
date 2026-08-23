import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { resolveThreadContext } from "@ai-catalyst/services/artifact-comment/internal/rows";

export async function markArtifactCommentThreadRead(
  actor: ActorContext,
  input: { threadId: string },
): Promise<void> {
  const threadId = parseEntityIdOrNotFound(input.threadId, "Thread not found.");
  await resolveThreadContext(actor, threadId, pool);

  await pool.query(
    `insert into artifact_comment_reads (thread_id, user_id, last_read_at)
     values ($1, $2, now())
     on conflict (thread_id, user_id) do update set last_read_at = now()`,
    [threadId, actor.userId],
  );
}
