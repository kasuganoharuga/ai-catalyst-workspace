import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactComment,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { loadArtifactDefinitionByKey } from "@ai-catalyst/services/artifact/internal/submission-load";
import { resolveScopedAttempt } from "@ai-catalyst/services/artifact-comment/internal/rows";
import {
  assembleThread,
  mapComment,
  type CommentRow,
  type ThreadRow,
} from "@ai-catalyst/services/artifact-comment/internal/rows";

export interface ListArtifactCommentThreadsInput {
  attemptId: string;
  artifactKey: string;
}

/** Every thread on one Artifact, oldest first, each with its full comment list. */
export async function listArtifactCommentThreads(
  actor: ActorContext,
  input: ListArtifactCommentThreadsInput,
): Promise<ArtifactCommentThread[]> {
  const { runModule } = await resolveScopedAttempt(
    actor,
    input.attemptId,
    pool,
  );
  const attemptId = parseEntityIdOrNotFound(
    input.attemptId,
    "Attempt not found.",
  );
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    runModule.module_definition_id,
    input.artifactKey,
  );

  // A Founder never sees a resolved thread — once the Mentor closes it out,
  // it drops off the Founder's list entirely rather than moving to a
  // "resolved" section, since the Founder can't reopen it or act on it any
  // further (see setThreadStatus). This is a static literal, not
  // interpolated user input, so it's safe to splice into the query text.
  const hideResolvedThreads = actor.role === "founder";
  const threadsResult = await pool.query<ThreadRow>(
    `select
       t.id, t.anchor_kind, t.anchor_heading_level, t.anchor_heading, t.anchor_quote,
       t.opened_on_version, t.status, t.resolved_by_user_id,
       coalesce(nullif(trim(concat_ws(' ', rp.first_name, rp.last_name)), ''), ru.email) as resolved_by_name,
       t.resolved_at, t.created_at, r.last_read_at
     from artifact_comment_threads t
     left join users ru on ru.id = t.resolved_by_user_id
     left join user_profiles rp on rp.user_id = ru.id
     left join artifact_comment_reads r on r.thread_id = t.id and r.user_id = $3
     where t.module_attempt_id = $1 and t.artifact_definition_id = $2
       ${hideResolvedThreads ? "and t.status = 'open'" : ""}
     order by t.created_at asc`,
    [attemptId, artifactDefinition.id, actor.userId],
  );

  if (threadsResult.rows.length === 0) {
    return [];
  }

  const threadIds = threadsResult.rows.map((row) => row.id);
  const commentsResult = await pool.query<CommentRow>(
    `select
       c.id, c.thread_id, c.author_user_id, c.author_role, c.body,
       c.written_on_version, c.edited_at, c.created_at,
       coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email) as author_name
     from artifact_comments c
     join users u on u.id = c.author_user_id
     left join user_profiles p on p.user_id = u.id
     where c.thread_id = any($1::uuid[]) and c.deleted_at is null
     order by c.thread_id, c.created_at asc`,
    [threadIds],
  );

  const commentsByThread = new Map<string, ArtifactComment[]>();
  for (const row of commentsResult.rows) {
    const comment = mapComment(row);
    const list = commentsByThread.get(comment.threadId) ?? [];
    list.push(comment);
    commentsByThread.set(comment.threadId, list);
  }

  return threadsResult.rows.map((row) =>
    assembleThread(row, commentsByThread.get(row.id) ?? [], actor.userId),
  );
}
