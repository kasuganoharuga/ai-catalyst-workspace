import { cache } from "react";

import { getMcpConnectionStatus as getMcpConnectionStatusUncached } from "@ai-catalyst/services/mcp-auth";
import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";

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

/**
 * How recently a tool call has to have landed for us to claim the client
 * is live. Presentation policy, not a business rule — hence its home
 * here rather than in the service.
 *
 * Fifteen minutes is deliberately generous: a Founder mid-module can
 * easily spend ten minutes composing one answer, and flipping to "not
 * recently used" while they are actively working would be worse than
 * useless. Anything staler than this we simply decline to vouch for.
 */
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

export type McpConnectionState =
  // Never set up, or the authorisation is gone.
  | "not_connected"
  // Was authorised before; the token has since expired or been swept.
  | "expired"
  // Authorised, but no tool call has ever arrived — the redirect
  // completed and nothing has exercised the path since.
  | "never_used"
  // Authorised and used before, but nothing recent enough to vouch for.
  | "idle"
  // Authorised and a tool call landed within the active window.
  | "active";

export function deriveMcpConnectionState(
  status: McpConnectionStatus,
  now: Date = new Date(),
): McpConnectionState {
  if (!status.authorised) {
    return status.hasEverAuthorised ? "expired" : "not_connected";
  }
  if (!status.lastActivityAt) {
    return "never_used";
  }
  const elapsed = now.getTime() - new Date(status.lastActivityAt).getTime();
  return elapsed <= ACTIVE_WINDOW_MS ? "active" : "idle";
}

/** "just now" / "12 minutes ago" / "3 hours ago" / "2 days ago". */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const elapsedMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
