import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";

import { formatDateTime } from "@/lib/format";
import {
  formatRelativeTime,
  type McpConnectionState,
} from "@/lib/mcp-connection";

import { StatusBadge } from "../../components/status-badge";
import type { Assistant } from "../../lib/assistant";
import { connectionCopy } from "../../lib/copy";
import { CheckRow } from "./check-row";
import { DisconnectButton } from "./disconnect-button";
import { RecheckButton } from "../../components/recheck-button";

export function ConnectionStatusPanel({
  connection,
  assistant,
  connected,
  mismatched,
  state,
}: {
  connection: McpConnectionStatus;
  assistant: Assistant;
  connected: Assistant;
  mismatched: boolean;
  state: McpConnectionState;
}) {
  return (
    <section className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          {connectionCopy.statusHeading}
        </h2>
        <StatusBadge
          status={
            state === "active"
              ? { label: "Active", tone: "lime" }
              : { label: "Connected", tone: "outline" }
          }
        />
      </div>
      <dl className="px-6 py-2 text-sm">
        <CheckRow label={connectionCopy.statusClient} ok>
          {connection.clientName ?? "Your AI client"}
        </CheckRow>
        <CheckRow label={connectionCopy.statusValidUntil} ok>
          {connection.expiresAt ? formatDateTime(connection.expiresAt) : "—"}
        </CheckRow>
        <CheckRow
          label={connected.copy.statusLastActivity}
          ok={state === "active"}
        >
          {connection.lastActivityAt
            ? formatRelativeTime(connection.lastActivityAt)
            : connectionCopy.statusNeverUsed}
        </CheckRow>
      </dl>

      {mismatched ? (
        <div className="border-t border-border bg-muted/30 px-6 py-4">
          <p className="text-xs leading-5 text-muted-foreground">
            {connectionCopy.assistantMismatch(connected.name, assistant.name)}
          </p>
        </div>
      ) : null}

      <div className="border-t border-border bg-muted/30 px-6 py-4">
        {state === "active" ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {connected.copy.statusActiveNote}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <RecheckButton label="Refresh" size="sm" />
            <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
              {state === "never_used"
                ? connected.copy.statusNeverUsedNote
                : connected.copy.statusIdleNote}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border px-6 py-5">
        <div className="min-w-0 max-w-lg">
          <p className="text-sm font-semibold text-foreground">
            {connected.copy.disconnectTitle}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {connected.copy.disconnectBody}
          </p>
        </div>
        <DisconnectButton provider={connected.provider} />
      </div>
    </section>
  );
}
