import { cache } from "react";

import { getMcpConnectionStatus as getMcpConnectionStatusUncached } from "@ai-catalyst/services/mcp-auth";
import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";

export const getMcpConnectionStatus = cache(getMcpConnectionStatusUncached);

/** Public MCP endpoint for connector settings — server-side only, not a secret. */
export function getMcpEndpointUrl(): string | null {
  const url = process.env.MCP_RESOURCE_URL;
  return url && url.trim().length > 0 ? url.trim() : null;
}

/**
 * Presentation policy for "active" connection — 15 minutes.
 *
 * Generous enough that a founder composing one answer does not flip to idle mid-work.
 */
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

export type McpConnectionState =
  "not_connected" | "expired" | "never_used" | "idle" | "active";

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
