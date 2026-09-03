import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactComment,
  ArtifactCommentAnchorKind,
  ArtifactCommentAuthorRole,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  resolveAttemptContext,
  type RunModuleRow,
} from "@ai-catalyst/services/artifact/internal/attempt-context";
import type { QueryExecutor } from "@ai-catalyst/services/internal/transaction";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { assertActorCanAccessWorkspace } from "@ai-catalyst/services/artifact-comment/internal/authorization";

export async function resolveWorkspaceIdForAttempt(
  client: QueryExecutor,
  attemptId: string,
): Promise<string> {
  const result = await client.query<{ workspace_id: string }>(
    `select workspace_id from module_attempts where id = $1`,
    [attemptId],
  );
  const workspaceId = result.rows[0]?.workspace_id;
  if (!workspaceId) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  return workspaceId;
}

export async function resolveScopedAttempt(
  actor: ActorContext,
  rawAttemptId: string,
  client: QueryExecutor,
): Promise<{ workspaceId: string; runModule: RunModuleRow }> {
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");
  const workspaceId = await resolveWorkspaceIdForAttempt(client, attemptId);
  await assertActorCanAccessWorkspace(actor, workspaceId, client);
  const { runModule } = await resolveAttemptContext(
    workspaceId,
    attemptId,
    client,
    { forUpdate: false },
  );
  return { workspaceId, runModule };
}

export interface ThreadWorkspaceRow {
  workspace_id: string;
  module_attempt_id: string;
  artifact_definition_id: string;
  program_run_module_id: string;
  anchor_kind: ArtifactCommentAnchorKind;
}

export async function resolveThreadContext(
  actor: ActorContext,
  rawThreadId: string,
  client: QueryExecutor,
): Promise<ThreadWorkspaceRow> {
  const threadId = parseEntityIdOrNotFound(rawThreadId, "Thread not found.");
  const result = await client.query<ThreadWorkspaceRow>(
    `select workspace_id, module_attempt_id, artifact_definition_id, program_run_module_id, anchor_kind
     from artifact_comment_threads where id = $1`,
    [threadId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Thread not found.");
  }
  await assertActorCanAccessWorkspace(actor, row.workspace_id, client);
  return row;
}

/** Shared by replyToArtifactCommentThread and setThreadStatus's resolve branch — both need the run module (for module_events' FK columns) and artifact_key (for its metadata) from a thread row already in hand. */
export async function resolveRunModuleAndArtifactKeyForThread(
  client: PoolClient,
  threadRow: ThreadWorkspaceRow,
): Promise<{ runModule: RunModuleRow; artifactKey: string }> {
  const runModuleResult = await client.query<RunModuleRow>(
    `select m.id, m.module_definition_id, m.program_run_id, m.program_run_branch_id,
            m.active_attempt_id, d.module_type
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     where m.id = $1`,
    [threadRow.program_run_module_id],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Thread's program_run_module ${threadRow.program_run_module_id} could not be resolved.`,
    );
  }

  const artifactKeyResult = await client.query<{ artifact_key: string }>(
    `select artifact_key from artifact_definitions where id = $1`,
    [threadRow.artifact_definition_id],
  );

  return {
    runModule,
    artifactKey: artifactKeyResult.rows[0]?.artifact_key ?? "unknown",
  };
}

export async function resolveUserDisplayName(
  client: QueryExecutor,
  userId: string,
): Promise<string> {
  const result = await client.query<{ name: string }>(
    `select coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email) as name
     from users u
     left join user_profiles p on p.user_id = u.id
     where u.id = $1`,
    [userId],
  );
  return result.rows[0]?.name ?? "Unknown";
}

export interface ThreadRow {
  id: string;
  anchor_kind: ArtifactCommentAnchorKind;
  anchor_heading_level: number | null;
  anchor_heading: string | null;
  anchor_quote: string | null;
  opened_on_version: number;
  status: "open" | "resolved";
  resolved_by_user_id: string | null;
  resolved_by_name: string | null;
  resolved_at: Date | null;
  created_at: Date;
  last_read_at: Date | null;
}

export interface CommentRow {
  id: string;
  thread_id: string;
  author_user_id: string;
  author_role: ArtifactCommentAuthorRole;
  author_name: string;
  body: string;
  written_on_version: number;
  edited_at: Date | null;
  created_at: Date;
}

export function mapComment(row: CommentRow): ArtifactComment {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorUserId: row.author_user_id,
    authorRole: row.author_role,
    authorName: row.author_name,
    body: row.body,
    writtenOnVersion: row.written_on_version,
    editedAt: row.edited_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function assembleThread(
  row: ThreadRow,
  comments: ArtifactComment[],
  viewerUserId: string,
): ArtifactCommentThread {
  const unreadCount = comments.filter(
    (comment) =>
      comment.authorUserId !== viewerUserId &&
      (row.last_read_at === null ||
        new Date(comment.createdAt) > row.last_read_at),
  ).length;

  return {
    id: row.id,
    anchor: {
      kind: row.anchor_kind,
      headingLevel: row.anchor_heading_level,
      heading: row.anchor_heading,
      quote: row.anchor_quote,
    },
    openedOnVersion: row.opened_on_version,
    status: row.status,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedByName: row.resolved_by_name,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    comments,
    unreadCount,
  };
}

export interface CommentOwnershipRow {
  thread_id: string;
  author_user_id: string;
  created_at: Date;
}

export async function resolveOwnedComment(
  actor: ActorContext,
  rawCommentId: string,
  client: QueryExecutor,
): Promise<CommentOwnershipRow & { workspace_id: string }> {
  const commentId = parseEntityIdOrNotFound(rawCommentId, "Comment not found.");
  const result = await client.query<
    CommentOwnershipRow & { workspace_id: string }
  >(
    `select c.thread_id, c.author_user_id, c.created_at, t.workspace_id
     from artifact_comments c
     join artifact_comment_threads t on t.id = c.thread_id
     where c.id = $1 and c.deleted_at is null`,
    [commentId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Comment not found.");
  }
  await assertActorCanAccessWorkspace(actor, row.workspace_id, client);
  if (row.author_user_id !== actor.userId) {
    throw new ServiceError(
      "FORBIDDEN",
      "You can only edit or delete your own comments.",
    );
  }
  return row;
}
