import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

const log = loggerForService(SERVICE_NAMES.services);

// Writes to mcp_tool_audit_logs — independent of business transactions; failures must not affect tool outcomes.

export type McpToolCallOutcome =
  "success" | "denied" | "validation_error" | "system_error";

// From ActorContext.provider (OAuth redirect host). "other" for web/system or unknown clients.
function auditProviderFor(actor: ActorContext): string {
  return actor.provider ?? "other";
}

export interface RecordMcpToolCallInput {
  // Fresh id per attempt — mcp_tool_audit_logs_request_unique; no upsert on retry.
  requestId: string;
  actor: ActorContext;
  toolName: string;
  outcome: McpToolCallOutcome;
  durationMs: number;
  // Run hierarchy when known; null when resolution failed early. Pass full chain together.
  workspaceId?: string | null;
  programRunId?: string | null;
  programRunBranchId?: string | null;
  programRunModuleId?: string | null;
  moduleAttemptId?: string | null;
  // Redacted metadata only — identifiers, never answer text or file content.
  requestMetadata?: Record<string, unknown>;
  resultMetadata?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/**
 * Writes one audit row. Swallows failures — audit must never turn a tool result into a 500.
 */
export async function recordMcpToolCall(
  input: RecordMcpToolCallInput,
): Promise<void> {
  try {
    // clientId/scopes/traceId folded into request_metadata — no dedicated columns on this table.
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
