import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import {
  deriveMcpConnectionState,
  formatRelativeTime,
  getMcpConnectionStatus,
  getMcpEndpointUrl,
} from "@/lib/mcp-connection";
import { getMyProfile } from "@/lib/user-profile";

import { AssistantMark } from "../components/assistant-mark";
import { PageShell } from "../components/page-shell";
import { RecheckButton } from "../components/recheck-button";
import { StatusBadge } from "../components/status-badge";
import { resolveAssistant } from "../lib/assistant";
import { connectionCopy } from "../lib/copy";
import { appPageTitle } from "@/lib/page-metadata";
import { ConnectionSetup } from "./components/connection-setup";
import { DisconnectButton } from "./components/disconnect-button";

// Static title — cannot follow chosen assistant without a second profile read.
export const metadata = appPageTitle("AI connection");

export default async function ConnectionPage() {
  const actor = await getCurrentFounderActor();
  const [connection, profile] = await Promise.all([
    getMcpConnectionStatus(actor),
    getMyProfile(actor),
  ]);

  // `assistant` = website preference (walkthrough). `connected` = live grant by redirect host (status card).
  const assistant = resolveAssistant(profile.preferredAiProvider);
  const connectedProvider =
    connection.provider === "claude" || connection.provider === "openai"
      ? connection.provider
      : null;
  const connected = connectedProvider
    ? resolveAssistant(connectedProvider)
    : assistant;
  const mismatched =
    connectedProvider !== null && connectedProvider !== assistant.provider;
  const endpointUrl = getMcpEndpointUrl();
  const state = deriveMcpConnectionState(connection);
  const isAuthorised = connection.authorised;
  const connectionExpired = state === "expired";

  return (
    <PageShell className="max-w-6xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {isAuthorised ? connectionCopy.kickerConnected : connectionCopy.kicker}
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {isAuthorised ? connected.copy.titleConnected : assistant.copy.title}
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        {isAuthorised ? connected.copy.introConnected : assistant.copy.intro}
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
        {connectionCopy.assistantLabel}:
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <AssistantMark
            provider={assistant.provider}
            className="h-3.5 w-3.5 shrink-0"
          />
          {assistant.name}
        </span>
        <Link
          href="/profile"
          className="underline underline-offset-4 hover:text-foreground"
        >
          {connectionCopy.assistantChangeLink}
        </Link>
      </p>

      {isAuthorised ? (
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
              {connection.expiresAt
                ? formatDateTime(connection.expiresAt)
                : "—"}
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
                {connectionCopy.assistantMismatch(
                  connected.name,
                  assistant.name,
                )}
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
      ) : (
        <>
          {connectionExpired ? (
            <section className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
              <h2 className="text-sm font-semibold text-foreground">
                {connectionCopy.expiredTitle}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {assistant.copy.expiredBody}
              </p>
            </section>
          ) : null}

          {endpointUrl ? (
            <ConnectionSetup assistant={assistant} endpointUrl={endpointUrl} />
          ) : (
            <section className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
              <h2 className="text-sm font-semibold text-foreground">
                {connectionCopy.addressHeading}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {connectionCopy.addressMissing}
              </p>
            </section>
          )}
        </>
      )}

      <p className="mt-10 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">
        <span className="font-medium text-foreground">
          {connectionCopy.privacyLabel}
        </span>{" "}
        {isAuthorised ? connected.copy.privacyBody : assistant.copy.privacyBody}
      </p>
    </PageShell>
  );
}

// Tick = vouched for; dash = inferred only.
function CheckRow({
  label,
  ok,
  children,
}: {
  label: string;
  ok?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-b-0">
      <dt className="flex items-center gap-2.5 text-muted-foreground">
        {ok ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
            <Check
              aria-hidden="true"
              className="h-2.5 w-2.5 text-primary-foreground"
              strokeWidth={3}
            />
          </span>
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border">
            <Minus
              aria-hidden="true"
              className="h-2.5 w-2.5 text-muted-foreground"
              strokeWidth={3}
            />
          </span>
        )}
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}
