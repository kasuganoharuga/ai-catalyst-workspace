import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactComment,
  ArtifactCommentAnchorKind,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  loadArtifactDefinitionByKey,
  loadLatestSubmission,
} from "@ai-catalyst/services/artifact/internal/submission-load";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { insertCommentModuleEvent } from "@ai-catalyst/services/artifact-comment/internal/events";
import {
  assertValidAnchor,
  assertValidBody,
  authorRoleForActor,
} from "@ai-catalyst/services/artifact-comment/internal/validate";
import {
  assembleThread,
  mapComment,
  resolveScopedAttempt,
  resolveUserDisplayName,
  type CommentRow,
} from "@ai-catalyst/services/artifact-comment/internal/rows";

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
