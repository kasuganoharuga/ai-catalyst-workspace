import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { insertModuleEventRow } from "@ai-catalyst/services/internal/module-events";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";

export type CompletionEventType =
  | "attempt_accepted"
  | "module_completed"
  | "module_unlocked"
  | "attempt_cancelled";

// System events need actor_type='system' — attempt/events hardcodes 'user'.
export async function insertCompletionEvent(
  client: PoolClient,
  input: {
    workspaceId: string;
    programRunId: string;
    programRunBranchId: string;
    programRunModuleId: string;
    moduleAttemptId: string | null;
    eventType: CompletionEventType;
    actor: ActorContext;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const actorType = input.actor.source === "system" ? "system" : "user";
  await insertModuleEventRow(client, {
    workspaceId: input.workspaceId,
    programRunId: input.programRunId,
    programRunBranchId: input.programRunBranchId,
    programRunModuleId: input.programRunModuleId,
    moduleAttemptId: input.moduleAttemptId,
    eventType: input.eventType,
    actorType,
    actorUserId: input.actor.userId,
    sourceProvider: resolveInteractionProvider(input.actor),
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    metadata: input.metadata,
    actor: input.actor,
  });
}
