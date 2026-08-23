import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactCommentAnchorKind } from "@ai-catalyst/shared";

import { insertModuleEventRow } from "@ai-catalyst/services/internal/module-events";
import type { RunModuleRow } from "@ai-catalyst/services/artifact/internal/attempt-context";

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

export async function insertCommentModuleEvent(
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
