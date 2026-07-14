import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Every tool handler returns a proper MCP CallToolResult - never a bare
 * business object and never a thrown Error. A thrown error looks like a
 * generic execution failure to Claude with no stable error_code to react
 * to; wrapping success/business-validation payloads and call errors the
 * same way lets Claude branch on error_code reliably.
 */
export function toolResult(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

export function toolError(errorCode: string, message: string, extra?: Record<string, unknown>): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error_code: errorCode, message, ...extra }) }],
  };
}
