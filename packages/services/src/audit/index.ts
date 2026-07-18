import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

// Owns writes to `mcp_tool_audit_logs` — the only Service function
// apps/mcp calls purely for its own audit trail, never for business
// state. Per the iteration plan's risk 7 ("审计写入与业务事务被回滚"),
// this is always called independently of whatever business transaction
// the same MCP tool call already ran (never inside the same Postgres
// transaction), and a failure here must never turn an otherwise
// successful — or already-failed — tool call into something worse for
// the caller; see recordMcpToolCall's own comment.

export type McpToolCallOutcome = "success" | "denied" | "validation_error" | "system_error";

// V1 has exactly one AI client (architecture.mdc) and
// mcp_tool_audit_logs.provider only accepts 'claude' | 'openai' — this
// table only ever records MCP-originated calls (there is no 'website'/
// 'system' value), so this is hardcoded the same way
// resolveInteractionProvider (packages/services/src/attempt/internal)
// and resolveStorageCreatedVia (packages/services/src/storage) hardcode
// mcp -> claude elsewhere in this package.
const MCP_AUDIT_PROVIDER = "claude";

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
export async function recordMcpToolCall(input: RecordMcpToolCallInput): Promise<void> {
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
        MCP_AUDIT_PROVIDER,
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
    console.error(`Failed to record MCP tool audit log for "${input.toolName}":`, error);
  }
}
