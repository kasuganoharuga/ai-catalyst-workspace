import { randomUUID } from "node:crypto";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";
import {
  ServiceError,
  type ServiceErrorCode,
} from "@ai-catalyst/services/errors";
import {
  recordMcpToolCall,
  type McpToolCallOutcome,
} from "@ai-catalyst/services/audit";

const log = loggerForService(SERVICE_NAMES.mcp);

// Shared audit + error mapping for every MCP tool handler.

// Alias to the SDK's own `CallToolResult` (not a hand-rolled shape) — its
// runtime schema carries an open index signature that a custom `{
// content, isError }` interface can't structurally satisfy, which
// `McpServer.registerTool()`'s callback type requires.
export type McpToolResponse = CallToolResult;

// Everything a tool handler already resolved while doing its real work,
// carried back here purely so the audit write below can populate
// mcp_tool_audit_logs' run/branch/module/attempt columns without a
// second lookup. All optional — a Tool that never resolves this far
// (e.g. get_active_context, which has no Run/Module) simply omits them,
// and the audit row still records everything else (user/tool/outcome/
// duration/trace).
export interface McpToolAuditContext {
  workspaceId?: string | null;
  programRunId?: string | null;
  programRunBranchId?: string | null;
  programRunModuleId?: string | null;
  moduleAttemptId?: string | null;
  // Small, redacted result facts only (e.g. { moduleKey, status } or
  // { versionNumber }) — never Founder answer text or Artifact content;
  // see recordMcpToolCall's own comment.
  resultMetadata?: Record<string, unknown>;
}

export interface McpToolHandlerResult {
  response: McpToolResponse;
  audit?: McpToolAuditContext;
}

// Exhaustive switch (not a Record lookup with a `?? "system_error"`
// fallback), same convention as apps/web/lib/service-error-response.ts's
// statusForCode — a new ServiceErrorCode added without an outcome
// mapping here fails the build instead of silently misclassifying a
// future error in the audit trail. Bucketed the same way that file
// buckets HTTP statuses: FORBIDDEN/UNAUTHENTICATED/NOT_FOUND ->
// "denied"; every other typed business error -> "validation_error";
// INTERNAL_INVARIANT_ERROR (never the caller's fault) ->
// "system_error".
function outcomeForServiceErrorCode(
  code: ServiceErrorCode,
): McpToolCallOutcome {
  switch (code) {
    case "FORBIDDEN":
    case "UNAUTHENTICATED":
    case "NOT_FOUND":
    case "INVITATION_EMAIL_MISMATCH":
      return "denied";
    case "VALIDATION_ERROR":
    case "INVITATION_ALREADY_PENDING":
    case "INVITATION_NOT_PENDING":
    case "FOUNDER_WORKSPACE_ALREADY_EXISTS":
    case "RUN_MODULE_NOT_AVAILABLE":
    case "MODULE_NOT_READY_FOR_CONFIRMATION":
    case "ATTEMPT_PENDING_REVIEW":
    case "ATTEMPT_NOT_EDITABLE":
    case "ATTEMPT_NOT_SUBMITTABLE":
    case "ATTEMPT_RETRY_SOURCE_INVALID":
    case "STORAGE_CONTENT_CONFLICT":
    case "STORAGE_OBJECT_NOT_WRITABLE":
    case "STORAGE_OBJECT_NOT_DELETABLE":
    case "VALIDATOR_NOT_CONFIGURED":
    case "ATTEMPT_NOT_AWAITING_VALIDATION":
    case "WORKBOOK_RENDERER_NOT_CONFIGURED":
    case "WORKBOOK_SOURCE_NOT_CONFIRMED":
    case "EVIDENCE_NOT_CONFIRMED":
    case "EVIDENCE_FROZEN_FOR_ATTEMPT":
    case "MODULE_4_INTERVIEW_EVIDENCE_MISSING":
      return "validation_error";
    case "INTERNAL_INVARIANT_ERROR":
    case "WORKBOOK_SOURCE_INTEGRITY_FAILED":
    case "WORKBOOK_RENDER_FAILED":
      return "system_error";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/**
 * Runs one MCP tool handler and records the call in mcp_tool_audit_logs.
 * Audit writes run after the handler finishes, outside any business transaction.
 *
 * Never lets a `ServiceError`'s message leak internal detail beyond what
 * the Service author already wrote for external consumption (every
 * `ServiceError.message` in this codebase is already written as a
 * user-facing business message); an unexpected non-`ServiceError` is
 * logged server-side and reduced to a generic message, matching
 * apps/web/lib/service-error-response.ts's "no stack traces reach the
 * caller" rule.
 */
export async function withMcpAudit(
  params: {
    toolName: string;
    actor: ActorContext;
    requestMetadata?: Record<string, unknown>;
  },
  handler: () => Promise<McpToolHandlerResult>,
): Promise<McpToolResponse> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  // Per-tool-call request id; keep the HTTP-level traceId on the actor.
  const actor: ActorContext = {
    ...params.actor,
    requestId,
  };

  try {
    const { response, audit } = await handler();
    await recordMcpToolCall({
      requestId,
      actor,
      toolName: params.toolName,
      outcome: "success",
      durationMs: Date.now() - startedAt,
      workspaceId: audit?.workspaceId,
      programRunId: audit?.programRunId,
      programRunBranchId: audit?.programRunBranchId,
      programRunModuleId: audit?.programRunModuleId,
      moduleAttemptId: audit?.moduleAttemptId,
      requestMetadata: params.requestMetadata,
      resultMetadata: audit?.resultMetadata,
    });
    return response;
  } catch (error) {
    const isServiceError = error instanceof ServiceError;
    if (!isServiceError) {
      log.error({
        event: "mcp_tool_failed",
        message: `Unexpected error in MCP tool "${params.toolName}"`,
        tool_name: params.toolName,
        trace_id: actor.traceId,
        request_id: requestId,
        error_name: error instanceof Error ? error.name : "unknown",
      });
    }
    const outcome = isServiceError
      ? outcomeForServiceErrorCode(error.code)
      : "system_error";
    const clientMessage = isServiceError
      ? error.message
      : "Internal server error.";

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: params.toolName,
      outcome,
      durationMs: Date.now() - startedAt,
      requestMetadata: params.requestMetadata,
      errorCode: isServiceError ? error.code : null,
      errorMessage: isServiceError ? error.message : String(error),
    });

    return {
      isError: true,
      content: [{ type: "text", text: clientMessage }],
    };
  }
}

export function jsonToolResponse(data: unknown): McpToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
