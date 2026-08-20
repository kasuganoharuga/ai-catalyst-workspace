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

// --- Audit wrapper ---

// SDK CallToolResult — required by registerTool callback typing (open index signature).
export type McpToolResponse = CallToolResult;

// Optional audit columns populated from handler work — no second lookup.
export interface McpToolAuditContext {
  workspaceId?: string | null;
  programRunId?: string | null;
  programRunBranchId?: string | null;
  programRunModuleId?: string | null;
  moduleAttemptId?: string | null;
  // Redacted result facts only — never founder answers or artifact content.
  resultMetadata?: Record<string, unknown>;
}

export interface McpToolHandlerResult {
  response: McpToolResponse;
  audit?: McpToolAuditContext;
}

// Exhaustive switch — new ServiceErrorCode without mapping fails compile (same as service-error-response.ts).
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
    case "INTERVIEW_GATE_NOT_MET":
      return "validation_error";
    case "INTERNAL_INVARIANT_ERROR":
    case "WORKBOOK_SOURCE_INTEGRITY_FAILED":
    case "WORKBOOK_RENDER_FAILED":
    // Provider-side failure — not a caller mistake, so it must not be
    // recorded as validation_error. No MCP tool sends email today; the case
    // exists to keep this switch exhaustive.
    case "EMAIL_SEND_FAILED":
      return "system_error";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/**
 * Runs an MCP tool handler and records mcp_tool_audit_logs after it finishes.
 * ServiceError messages pass through; unexpected errors log server-side and return generic text.
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
  // Per-tool request id; HTTP-level traceId stays on the actor.
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
