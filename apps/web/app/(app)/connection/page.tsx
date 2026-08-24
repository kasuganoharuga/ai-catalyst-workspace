import Link from "next/link";

import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { getMyProfile } from "@/lib/user-profile";
import { appPageTitle } from "@/lib/page-metadata";

import { AssistantMark } from "../components/assistant-mark";
import { PageShell } from "../components/page-shell";
import { connectionCopy } from "../lib/copy";
import { ConnectionErrorPanel } from "./components/connection-error-panel";
import { ConnectionSetup } from "./components/connection-setup";
import { ConnectionStatusPanel } from "./components/connection-status-panel";
import { deriveConnectionView } from "./lib/connection-view";

// Static title — cannot follow chosen assistant without a second profile read.
export const metadata = appPageTitle("AI connection");

export default async function ConnectionPage() {
  const actor = await getCurrentFounderActor();
  const [connection, profile] = await Promise.all([
    getMcpConnectionStatus(actor),
    getMyProfile(actor),
  ]);

  const {
    assistant,
    connected,
    mismatched,
    endpointUrl,
    state,
    isAuthorised,
    connectionExpired,
  } = deriveConnectionView(connection, profile);

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
        <ConnectionStatusPanel
          connection={connection}
          assistant={assistant}
          connected={connected}
          mismatched={mismatched}
          state={state}
        />
      ) : (
        <>
          {connectionExpired ? (
            <ConnectionErrorPanel
              title={connectionCopy.expiredTitle}
              body={assistant.copy.expiredBody}
            />
          ) : null}

          {endpointUrl ? (
            <ConnectionSetup
              assistant={assistant}
              endpointUrl={endpointUrl}
              repair={connectionExpired}
            />
          ) : (
            <ConnectionErrorPanel
              title={connectionCopy.addressHeading}
              body={connectionCopy.addressMissing}
            />
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
