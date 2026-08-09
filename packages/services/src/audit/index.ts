import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

const log = loggerForService(SERVICE_NAMES.services);

// Owns writes to `mcp_tool_audit_logs`. Called independently of business
// transactions — a failure here must not change the tool call outcome for
// the caller.

export type McpToolCallOutcome =
  "success" | "denied" | "validation_error" | "system_error";

// Which AI client made the call, carried on the ActorContext that
// verifyMcpBearerToken built (derived there from the OAuth client's
// registered redirect host — see mcpProviderForRedirectUris).
//
// This was hardcoded to "claude" while V1 had one AI client, which meant
// every ChatGPT tool call was recorded as Claude — the audit log could not
// answer "which assistant did this" at all. "other" is the honest default
// for a web/system actor or an unrecognised client, and is accepted by
// mcp_tool_audit_logs_provider_check as of migration 0008.
function auditProviderFor(actor: ActorContext): string {
  return actor.provider ?? "other";
}

export interface RecordMcpToolCallInput {
  // A fresh id per call *attempt* (apps/mcp's audit wrapper generates one
  // with randomUUID() before invoking the tool handler) —
  // mcp_tool_audit_logs_request_unique means this must never be reused
  // across a client-side retry expecting an upsert; each attempt gets
  // its own row, by design.
  requestId: string;
  actor: ActorContext;
  toolName: string;
  outcome: McpToolCallOutcome;
  durationMs: number;
  // Full Run/Branch/Module/Attempt hierarchy, when known — left null on
  // any call that failed before resolving that far (e.g. NOT_FOUND on a
  // cross-Workspace attemptId), which is still a fully valid, auditable
  // outcome. mcp_tool_audit_logs_context_hierarchy_check requires a
  // non-null child to have every non-null ancestor; callers must resolve
  // and pass the whole chain together, never a child alone.
  workspaceId?: string | null;
  programRunId?: string | null;
  programRunBranchId?: string | null;
  programRunModuleId?: string | null;
  moduleAttemptId?: string | null;
  // Redacted metadata only, per this table's own header comment ("Not
  // stored by default: Full chat history / Full Prompt / File content /
  // OAuth token / Presigned URL") — callers pass small identifiers (e.g.
  // { moduleKey } or { attemptId, artifactKey, versionNumber }), never a
  // Founder's answer text or an Artifact's content.
  requestMetadata?: Record<string, unknown>;
  resultMetadata?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/**
 * Writes one `mcp_tool_audit_logs` row. Deliberately swallows its own
 * failures (logging to stderr instead of throwing/rejecting) — an
 * audit-write failure must never turn a real tool result (success or a
 * normal business error) into an unrelated 500 for the MCP client. This
 * is the one Service function in this package that is allowed to fail
 * silently, and only for this reason.
 */
export async function recordMcpToolCall(
  input: RecordMcpToolCallInput,
): Promise<void> {
  try {
    // clientId/scopes/traceId have no dedicated columns on this table
    // (the real, already-merged 0001 baseline schema — this table
    // predates ActorContext's traceId field and is MCP-only in practice)
    // — folded into request_metadata instead of widening result_metadata,
    // which stays reserved for the tool's own outcome summary.
    const requestMetadata = {
      ...(input.requestMetadata ?? {}),
      clientId: input.actor.clientId ?? null,
      scopes: input.actor.scopes ?? [],
      traceId: input.actor.traceId ?? null,
    };

    await pool.query(
      `insert into mcp_tool_audit_logs (
         request_id, user_id, workspace_id, program_run_id, program_run_branch_id,
         program_run_module_id, module_attempt_id, provider, tool_name, outcome,
         duration_ms, request_metadata, result_metadata, error_code, error_message
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15)`,
      [
        input.requestId,
        input.actor.userId,
        input.workspaceId ?? null,
        input.programRunId ?? null,
        input.programRunBranchId ?? null,
        input.programRunModuleId ?? null,
        input.moduleAttemptId ?? null,
        auditProviderFor(input.actor),
        input.toolName,
        input.outcome,
        Math.max(0, Math.round(input.durationMs)),
        JSON.stringify(requestMetadata),
        JSON.stringify(input.resultMetadata ?? {}),
        input.errorCode ?? null,
        input.errorMessage ?? null,
      ],
    );
  } catch (error) {
    log.error({
      event: "mcp_tool_audit_write_failed",
      message: `Failed to record MCP tool audit log for "${input.toolName}"`,
      tool_name: input.toolName,
      request_id: input.requestId,
      trace_id: input.actor.traceId,
      error_name: error instanceof Error ? error.name : "unknown",
    });
  }
}
