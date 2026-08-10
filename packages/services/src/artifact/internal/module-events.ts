import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { insertModuleEventRow } from "@ai-catalyst/services/internal/module-events";
import {
  resolveArtifactEventActorType,
  resolveArtifactEventSourceProvider,
} from "@ai-catalyst/services/artifact/internal/triggered-via";

export type ArtifactModuleEventType =
  | "artifact_uploaded"
  | "validation_started"
  | "validation_failed"
  | "validation_passed";

// Deliberately its OWN module_events writer, not a reuse of
// attempt/internal's insertModuleEvent — that helper's eventType union is
// scoped to attempt/index.ts's own 4 event types, and (per the
// established "don't share mappers/helpers across Service modules"
// convention — see storage/index.ts's resolveStorageCreatedVia comment)
// this module maps its own actor_type/source_provider independently.
export async function insertArtifactModuleEvent(
  client: PoolClient,
  input: {
    workspaceId: string;
    programRunId: string;
    programRunBranchId: string;
    programRunModuleId: string;
    moduleAttemptId: string;
    eventType: ArtifactModuleEventType | "attempt_ready_for_review";
    actor: ActorContext;
    metadata?: Record<string, unknown>;
    fromStatus?: string | null;
    toStatus?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  },
): Promise<void> {
  await insertModuleEventRow(client, {
    workspaceId: input.workspaceId,
    programRunId: input.programRunId,
    programRunBranchId: input.programRunBranchId,
    programRunModuleId: input.programRunModuleId,
    moduleAttemptId: input.moduleAttemptId,
    eventType: input.eventType,
    actorType: resolveArtifactEventActorType(input.actor),
    actorUserId: input.actor.userId,
    sourceProvider: resolveArtifactEventSourceProvider(input.actor),
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    metadata: input.metadata,
    entityType: input.entityType,
    entityId: input.entityId,
    actor: input.actor,
  });
}
