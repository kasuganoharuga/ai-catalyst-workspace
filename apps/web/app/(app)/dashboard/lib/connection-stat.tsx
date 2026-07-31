import Link from "next/link";

import {
  deriveMcpConnectionState,
  formatRelativeTime,
} from "@/lib/mcp-connection";

import type { ConnectionStatContent } from "../types";

export function connectionStatContent(
  state: ReturnType<typeof deriveMcpConnectionState>,
  lastActivityAt: string | null,
): ConnectionStatContent {
  switch (state) {
    case "active":
      return { value: "Active", label: "Claude connected" };
    case "idle":
      return {
        value: "Connected",
        label: lastActivityAt
          ? `Last used ${formatRelativeTime(lastActivityAt)}`
          : "Claude connected",
      };
    case "never_used":
      return { value: "Connected", label: "Not used yet" };
    case "expired":
      return {
        value: "Expired",
        label: (
          <>
            Reconnect in{" "}
            <Link href="/connection" className="underline">
              Claude connection
            </Link>
          </>
        ),
      };
    case "not_connected":
      return {
        value: "Not connected",
        label: (
          <>
            Set up in{" "}
            <Link href="/connection" className="underline">
              Claude connection
            </Link>
          </>
        ),
      };
  }
}
