import { cache } from "react";

import { getMcpConnectionStatus as getMcpConnectionStatusUncached } from "@ai-catalyst/services/mcp-auth";

// Thin Next.js shell over packages/services/mcp-auth's read path — same
// pattern as lib/module-catalog.ts.
export const getMcpConnectionStatus = cache(getMcpConnectionStatusUncached);

// The public MCP endpoint Founders paste into Claude's custom-connector
// settings. Read server-side only (this is not NEXT_PUBLIC_) and rendered
// into the Connection page — it is not a secret, just deployment-specific.
export function getMcpEndpointUrl(): string | null {
  const url = process.env.MCP_RESOURCE_URL;
  return url && url.trim().length > 0 ? url.trim() : null;
}
