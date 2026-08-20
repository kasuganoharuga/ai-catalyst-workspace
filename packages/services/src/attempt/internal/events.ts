import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { insertModuleEventRow } from "@ai-catalyst/services/internal/module-events";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";

// Listed under "./attempt/internal/events" in package.json only so
// Turbopack can resolve this module's cross-file imports (see
// internal/slug.ts for why) — not part of the intended public API.
//
// Shared by start-or-resume.ts, save-response.ts, and submit.ts: every
// Attempt/Response state change those three record goes through this one
// insert, so the module_events row shape can't quietly drift between them.
export async function insertModuleEvent(
  client: PoolClient,
  input: {
    workspaceId: string;
    programRunId: string;
    programRunBranchId: string;
    programRunModuleId: string;
    moduleAttemptId: string;
    eventType:
      | "attempt_started"
      | "retry_started"
      | "response_saved"
      | "attempt_submitted";
    actor: ActorContext;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  // module_events is business-state history for Modules/Attempts/
  // Responses (per its own table comment) — a different thing from
  // apps/mcp's mcp_tool_audit_logs, and written directly by the Service
  // inside the same transaction as the state change it records, never as
  // a separate best-effort side channel.
  await insertModuleEventRow(client, {
    workspaceId: input.workspaceId,
    programRunId: input.programRunId,
    programRunBranchId: input.programRunBranchId,
    programRunModuleId: input.programRunModuleId,
    moduleAttemptId: input.moduleAttemptId,
    eventType: input.eventType,
    actorType: "user",
    actorUserId: input.actor.userId,
    sourceProvider: resolveInteractionProvider(input.actor),
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    metadata: input.metadata,
    actor: input.actor,
  });
}
