import { Check, Minus } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import {
  deriveMcpConnectionState,
  formatRelativeTime,
  getMcpConnectionStatus,
  getMcpEndpointUrl,
} from "@/lib/mcp-connection";

import { PageShell } from "../components/page-shell";
import { RecheckButton } from "../components/recheck-button";
import { StatusBadge } from "../components/status-badge";
import { connectionCopy } from "../lib/copy";
import { appPageTitle } from "@/lib/page-metadata";
import { ConnectionSetup } from "./components/connection-setup";
import { DisconnectButton } from "./components/disconnect-button";

export const metadata = appPageTitle("MCP connection");

export default async function ConnectionPage() {
  const actor = await getCurrentFounderActor();
  const connection = await getMcpConnectionStatus(actor);

  const endpointUrl = getMcpEndpointUrl();
  const state = deriveMcpConnectionState(connection);
  const isAuthorised = connection.authorised;
  const connectionExpired = state === "expired";

  return (
    <PageShell className="max-w-6xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {connectionCopy.kicker}
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {connectionCopy.title}
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        {connectionCopy.intro}
      </p>

      {/* ── Authorised: the address gives way to what we actually know ──
         Two separate facts, never merged: the authorisation is ours to
         confirm, but liveness is only ever inferred from the last call
         Claude made. Nothing here claims Claude is reachable right now,
         because this side cannot know that.

         There is deliberately no "continue to your module" card here any
         more. A founder who is authorised and mid-programme never has to
         come back to this page — the watcher below carries them straight
         out of it the moment they connect, so anyone reading this section
         arrived on purpose, to check on the connection itself. */}
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
                  : { label: "Authorised", tone: "outline" }
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
              label={connectionCopy.statusLastActivity}
              ok={state === "active"}
            >
              {connection.lastActivityAt
                ? formatRelativeTime(connection.lastActivityAt)
                : connectionCopy.statusNeverUsed}
            </CheckRow>
          </dl>

          <div className="border-t border-border bg-muted/30 px-6 py-4">
            {state === "active" ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {connectionCopy.statusActiveNote}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <RecheckButton label="Refresh" size="sm" />
                <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                  {state === "never_used"
                    ? connectionCopy.statusNeverUsedNote
                    : connectionCopy.statusIdleNote}
                </p>
              </div>
            )}
          </div>

          {/* Below the status, not beside it: this ends the thing the rest
              of the card is reporting on, so it should not be reachable by
              accident while scanning. */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border px-6 py-5">
            <div className="min-w-0 max-w-lg">
              <p className="text-sm font-semibold text-foreground">
                {connectionCopy.disconnectTitle}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {connectionCopy.disconnectBody}
              </p>
            </div>
            <DisconnectButton />
          </div>
        </section>
      ) : (
        /* ── Not connected: the address plus the walkthrough ── */
        <>
          {connectionExpired ? (
            <section className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
              <h2 className="text-sm font-semibold text-foreground">
                {connectionCopy.expiredTitle}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {connectionCopy.expiredBody}
              </p>
            </section>
          ) : null}

          {/* The workspace address has moved inside ConnectionSetup's
              manual disclosure — the primary route hands it to Claude
              inside the prefilled message, so it was a block of text
              every founder had to decide to ignore.

              With no address configured, nothing on this page can work.
              That is not something to tuck away, so it replaces the setup
              card entirely rather than sitting alongside it. It names no
              environment variable: a founder cannot act on one, and a
              missing deployment setting is not their problem. */}
          {endpointUrl ? (
            <ConnectionSetup endpointUrl={endpointUrl} />
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
        {connectionCopy.privacyBody}
      </p>
    </PageShell>
  );
}

// A tick means "we can vouch for this". Anything we are only inferring
// gets a neutral dash instead — an unverified row must not wear the same
// mark as a confirmed one.
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
