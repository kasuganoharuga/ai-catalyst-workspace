import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactComment,
  ArtifactCommentAnchor,
  ArtifactCommentAnchorKind,
  ArtifactCommentAuthorRole,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import {
  resolveAttemptContext,
  type RunModuleRow,
} from "@ai-catalyst/services/artifact/internal/attempt-context";
import { listHeadings } from "@ai-catalyst/services/artifact/internal/markdown-sections";
import {
  loadArtifactDefinitionByKey,
  loadLatestSubmission,
} from "@ai-catalyst/services/artifact/internal/submission-load";
import type { QueryExecutor } from "@ai-catalyst/services/internal/transaction";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { insertModuleEventRow } from "@ai-catalyst/services/internal/module-events";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { assertMentorOwnsWorkspace } from "@ai-catalyst/services/mentor";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";

// Founder <-> Mentor discussion on one confirmed Artifact — see
// infra/database/migrations/0022_artifact_comments.sql for the schema
// rationale (anchored by heading, not offset; keyed on
// (module_attempt_id, artifact_definition_id), not a submission version).
//
// Authorization: any Founder, Mentor, or Admin may read their own scope —
// MENTOR_SEES_ALL_FOUNDERS already makes every Mentor able to read every
// Founder's Artifacts, and this feature's product decision is that the
// same Mentors may comment. Reading is not quite symmetric either: a
// Founder's listArtifactCommentThreads silently drops resolved threads —
// once a Mentor closes one out there's nothing further for the Founder to
// do with it, so it just stops appearing rather than moving to a resolved
// section. Writing is asymmetric too: only a Mentor or Admin opens a *new*
// thread (createArtifactCommentThread rejects a Founder actor outright);
// the Founder's only write path is replying to a thread a Mentor already
// opened, and resolving/reopening is likewise Mentor/Admin-only
// (setThreadStatus). Scope violations resolve NOT_FOUND, never FORBIDDEN,
// matching mentor/index.ts's enumeration-safety convention — the
// Founder-cannot-write checks are role capability, not scope, so they're
// the one thing here that legitimately answers FORBIDDEN. This is the one
// write path a Mentor has onto Founder data (see the header comment on
// mentor/index.ts) — it still never advances or rolls back Founder
// progress.

// --- own actor_type / source_provider mapping ---
// Deliberately not a reuse of artifact/internal/triggered-via.ts's
// resolvers — see that file's own module-events writer comment: each
// Service module maps its own actor_type/source_provider so one module's
// domain can evolve without quietly changing another's audit shape, even
// where the logic looks identical today.

type CommentEventActorType = "user" | "mcp" | "system" | "admin";
type CommentEventSourceProvider =
  "website" | "claude" | "openai" | "other" | "system";

function resolveCommentEventActorType(
  actor: ActorContext,
): CommentEventActorType {
  if (actor.role === "admin") return "admin";
  if (actor.source === "system") return "system";
  if (actor.source === "mcp") return "mcp";
  return "user";
}

function resolveCommentEventSourceProvider(
  actor: ActorContext,
): CommentEventSourceProvider {
  if (actor.source === "system") return "system";
  if (actor.source === "mcp") return resolveMcpProviderTag(actor);
  return "website";
}

async function insertCommentModuleEvent(
  client: PoolClient,
  input: {
    workspaceId: string;
    runModule: RunModuleRow;
    moduleAttemptId: string;
    eventType: "artifact_comment_added" | "artifact_comment_resolved";
    actor: ActorContext;
    threadId: string;
    artifactKey: string;
    anchorKind: ArtifactCommentAnchorKind;
  },
): Promise<void> {
  await insertModuleEventRow(client, {
    workspaceId: input.workspaceId,
    programRunId: input.runModule.program_run_id,
    programRunBranchId: input.runModule.program_run_branch_id,
    programRunModuleId: input.runModule.id,
    moduleAttemptId: input.moduleAttemptId,
    eventType: input.eventType,
    actorType: resolveCommentEventActorType(input.actor),
    actorUserId: input.actor.userId,
    sourceProvider: resolveCommentEventSourceProvider(input.actor),
    // Redacted facts only — never the comment body (same discipline as the
    // MCP audit wrapper's resultMetadata convention).
    metadata: { artifactKey: input.artifactKey, anchorKind: input.anchorKind },
    entityType: "artifact_comment_thread",
    entityId: input.threadId,
    actor: input.actor,
  });
}

/**
 * NOT_FOUND for any scope violation, never FORBIDDEN — same enumeration-
 * safety convention as mentor/index.ts's assertMentorOwnsWorkspace.
 * Admin has platform-wide access, same allowance as
 * storage/index.ts's assertGeneratedContentReader.
 */
async function assertActorCanAccessWorkspace(
  actor: ActorContext,
  workspaceId: string,
  client: QueryExecutor,
): Promise<void> {
  assertRole(actor, ["founder", "mentor", "admin"]);
  if (actor.role === "founder") {
    const workspace = await resolveFounderWorkspace(actor, client);
    if (workspace.id !== workspaceId) {
      throw new ServiceError("NOT_FOUND", "Artifact not found.");
    }
    return;
  }
  if (actor.role === "mentor") {
    await assertMentorOwnsWorkspace(actor, workspaceId);
    return;
  }
  // admin: no further scope check.
}

async function resolveWorkspaceIdForAttempt(
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

async function resolveScopedAttempt(
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

interface ThreadWorkspaceRow {
  workspace_id: string;
  module_attempt_id: string;
  artifact_definition_id: string;
  program_run_module_id: string;
  anchor_kind: ArtifactCommentAnchorKind;
}

async function resolveThreadContext(
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
async function resolveRunModuleAndArtifactKeyForThread(
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

async function resolveUserDisplayName(
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

// --- listArtifactCommentThreads ---

interface ThreadRow {
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

interface CommentRow {
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

function mapComment(row: CommentRow): ArtifactComment {
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

function assembleThread(
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

// --- createArtifactCommentThread ---

export interface CreateArtifactCommentThreadInput {
  attemptId: string;
  artifactKey: string;
  anchor: {
    kind: ArtifactCommentAnchorKind;
    heading?: string | null;
    headingLevel?: number | null;
    quote?: string | null;
  };
  body: string;
}

function assertValidBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "Comment body cannot be empty.");
  }
  if (trimmed.length > 4000) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Comment body cannot exceed 4000 characters.",
    );
  }
  return trimmed;
}

function assertValidAnchor(
  anchor: CreateArtifactCommentThreadInput["anchor"],
  markdown: string,
): { heading: string | null; headingLevel: number | null } {
  if (anchor.kind === "document") {
    if (anchor.heading != null || anchor.headingLevel != null) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "A document-anchored thread cannot carry a heading.",
      );
    }
    return { heading: null, headingLevel: null };
  }

  if (!anchor.heading || anchor.headingLevel == null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "A section-anchored thread requires both heading and headingLevel.",
    );
  }
  const exists = listHeadings(markdown).some(
    (candidate) =>
      candidate.level === anchor.headingLevel &&
      candidate.heading.toLowerCase() === anchor.heading!.toLowerCase(),
  );
  if (!exists) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Heading "${anchor.heading}" was not found in the current Artifact.`,
    );
  }
  return { heading: anchor.heading, headingLevel: anchor.headingLevel };
}

function authorRoleForActor(actor: ActorContext): ArtifactCommentAuthorRole {
  if (
    actor.role === "founder" ||
    actor.role === "mentor" ||
    actor.role === "admin"
  ) {
    return actor.role;
  }
  // assertRole already excludes every other role before this is reached.
  throw new ServiceError(
    "INTERNAL_INVARIANT_ERROR",
    `Unexpected actor role "${actor.role}" reached authorRoleForActor.`,
  );
}

/** Opens a new thread and writes its first comment in the same transaction. */
export async function createArtifactCommentThread(
  actor: ActorContext,
  input: CreateArtifactCommentThreadInput,
): Promise<ArtifactCommentThread> {
  // Only a Mentor or Admin opens a new thread — the Founder can reply (see
  // replyToArtifactCommentThread) but doesn't start feedback on their own
  // artefact. A role capability, not a scope check, so it's safe to reject
  // before resolving scope: it reveals nothing about which attempts exist.
  if (actor.role === "founder") {
    throw new ServiceError(
      "FORBIDDEN",
      "Only a Mentor or Admin can open a new comment thread.",
    );
  }

  const { workspaceId, runModule } = await resolveScopedAttempt(
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
  const submission = await loadLatestSubmission(
    pool,
    attemptId,
    artifactDefinition.id,
    { forUpdate: false },
  );
  if (!submission?.primary_storage_object_id) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Artifact "${input.artifactKey}" has no saved content to comment on.`,
    );
  }

  const markdown = await getGeneratedTextContent(
    actor,
    submission.primary_storage_object_id,
  );
  const body = assertValidBody(input.body);
  const anchor = assertValidAnchor(input.anchor, markdown);
  const authorRole = authorRoleForActor(actor);

  return withTransaction(async (client) => {
    const threadResult = await client.query<{ id: string; created_at: Date }>(
      `insert into artifact_comment_threads (
         workspace_id, module_attempt_id, program_run_module_id, module_definition_id,
         artifact_definition_id, anchor_kind, anchor_heading_level, anchor_heading,
         anchor_quote, opened_on_version, created_by_user_id
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id, created_at`,
      [
        workspaceId,
        attemptId,
        runModule.id,
        runModule.module_definition_id,
        artifactDefinition.id,
        input.anchor.kind,
        anchor.headingLevel,
        anchor.heading,
        input.anchor.quote ?? null,
        submission.version_number,
        actor.userId,
      ],
    );
    const thread = threadResult.rows[0];

    const commentResult = await client.query<CommentRow>(
      `insert into artifact_comments (
         workspace_id, thread_id, author_user_id, author_role, body, written_on_version
       ) values ($1, $2, $3, $4, $5, $6)
       returning id, thread_id, author_user_id, author_role, body, written_on_version, edited_at, created_at`,
      [
        workspaceId,
        thread.id,
        actor.userId,
        authorRole,
        body,
        submission.version_number,
      ],
    );

    await client.query(
      `insert into artifact_comment_reads (thread_id, user_id, last_read_at)
       values ($1, $2, now())`,
      [thread.id, actor.userId],
    );

    await insertCommentModuleEvent(client, {
      workspaceId,
      runModule,
      moduleAttemptId: attemptId,
      eventType: "artifact_comment_added",
      actor,
      threadId: thread.id,
      artifactKey: input.artifactKey,
      anchorKind: input.anchor.kind,
    });

    const authorName = await resolveUserDisplayName(client, actor.userId);
    const comment: ArtifactComment = {
      ...mapComment(commentResult.rows[0]),
      authorName,
    };

    return assembleThread(
      {
        id: thread.id,
        anchor_kind: input.anchor.kind,
        anchor_heading_level: anchor.headingLevel,
        anchor_heading: anchor.heading,
        anchor_quote: input.anchor.quote ?? null,
        opened_on_version: submission.version_number,
        status: "open",
        resolved_by_user_id: null,
        resolved_by_name: null,
        resolved_at: null,
        created_at: thread.created_at,
        last_read_at: null,
      },
      [comment],
      actor.userId,
    );
  });
}

// --- replyToArtifactCommentThread ---

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

// --- resolve / reopen ---

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

// --- edit / delete (author-only) ---

interface CommentOwnershipRow {
  thread_id: string;
  author_user_id: string;
  created_at: Date;
}

async function resolveOwnedComment(
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

// --- read tracking ---

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
