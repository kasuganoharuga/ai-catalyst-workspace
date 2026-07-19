import { Check, Minus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { getActiveContext } from "@/lib/active-context";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import {
  deriveMcpConnectionState,
  formatRelativeTime,
  getMcpConnectionStatus,
  getMcpEndpointUrl,
} from "@/lib/mcp-connection";
import { listRunModules } from "@/lib/run-modules";
import { ventureForActiveContext } from "@/lib/ventures";

import { PageShell } from "../components/page-shell";
import { CopyButton } from "../components/copy-button";
import { RecheckButton } from "../components/recheck-button";
import { StartRunButton } from "../components/start-run-button";
import { StatusBadge } from "../components/status-badge";
import { claudeCoworkUrl, mcpConnectCoworkPrompt } from "../lib/module-display";
import { appPageTitle } from "@/lib/page-metadata";

export const metadata = appPageTitle("MCP connection");

export default async function ConnectionPage() {
  const actor = await getCurrentFounderActor();
  const activeContextPromise = getActiveContext(actor);
  const [connection, runResult, , venture] = await Promise.all([
    getMcpConnectionStatus(actor),
    listRunModules(actor),
    activeContextPromise,
    activeContextPromise.then((context) =>
      ventureForActiveContext(actor, context),
    ),
  ]);

  const endpointUrl = getMcpEndpointUrl();
  const state = deriveMcpConnectionState(connection);
  const isAuthorised = connection.authorised;
  const connectionExpired = state === "expired";
  const hasRun = runResult.runId !== null;

  // Where this Founder actually is, rather than assuming everyone
  // arriving here is brand new: someone who reconnects mid-programme
  // should be pointed back at the module they were in the middle of.
  // `listRunModules` returns modules in sequence order, so the first
  // match in each pass is the earliest one.
  const currentModule =
    runResult.modules.find((m) => m.status === "in_progress") ??
    runResult.modules.find((m) => m.status === "available") ??
    null;

  const moduleNumber = currentModule
    ? String(currentModule.sequenceIndex).padStart(2, "0")
    : null;

  const gate = (() => {
    if (!hasRun) {
      return {
        kicker: "Next",
        title: "Unlock your first module",
        body: "This sets up your run of the programme and opens Module 0. It only happens once.",
      };
    }
    if (!currentModule) {
      return {
        kicker: "All caught up",
        title: "Every open module is done",
        body: "Nothing is waiting on you right now. New modules appear here as the programme grows.",
        href: "/modules",
        cta: "View modules",
      };
    }
    if (currentModule.status === "in_progress") {
      return {
        kicker: "Pick up where you left off",
        title: currentModule.title,
        body: `You're partway through Module ${moduleNumber}. Claude remembers where you got to — just ask it to carry on.`,
        href: `/modules/${currentModule.moduleKey}`,
        cta: `Continue Module ${moduleNumber}`,
      };
    }
    return {
      kicker: currentModule.sequenceIndex === 0 ? "You're set up" : "Next up",
      title: currentModule.title,
      body:
        currentModule.sequenceIndex === 0
          ? "A five-minute check in Claude that proves the whole path works, before anything is riding on it."
          : `Module ${moduleNumber} is open and waiting for you in Claude.`,
      href: `/modules/${currentModule.moduleKey}`,
      cta: `Open Module ${moduleNumber}`,
    };
  })();

  return (
    <PageShell className="max-w-2xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Step one
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        Connect Claude
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        Every module is a conversation you have with Claude. This links Claude
        to your workspace so it can read each module&apos;s questions and save
        your work back here. You only do this once.
      </p>

      {/* ── Authorised: the address gives way to what we actually know ──
         Two separate facts, never merged: the authorisation is ours to
         confirm, but liveness is only ever inferred from the last call
         Claude made. Nothing here claims Claude is reachable right now,
         because this side cannot know that. */}
      {isAuthorised ? (
        <section className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              Connection status
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
            <CheckRow label="Authorised client" ok>
              {connection.clientName ?? "Your AI client"}
            </CheckRow>
            <CheckRow label="Authorisation valid until" ok>
              {connection.expiresAt
                ? formatDateTime(connection.expiresAt)
                : "—"}
            </CheckRow>
            <CheckRow label="Last activity from Claude" ok={state === "active"}>
              {connection.lastActivityAt
                ? formatRelativeTime(connection.lastActivityAt)
                : "Never used yet"}
            </CheckRow>
          </dl>

          <div className="border-t border-border bg-muted/30 px-6 py-4">
            {state === "active" ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Claude called your workspace within the last few minutes, so the
                connection is working.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <RecheckButton label="Refresh" size="sm" />
                <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                  {state === "never_used"
                    ? "Claude is authorised but hasn't called your workspace yet. Module 0 is the first thing that will."
                    : "Nothing recent to go on — Claude may simply be closed. Ask it to do anything in your workspace, then refresh."}
                </p>
              </div>
            )}
          </div>
        </section>
      ) : (
        /* ── Not connected: the address plus the walkthrough ── */
        <>
          {connectionExpired ? (
            <section className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
              <h2 className="text-sm font-semibold text-foreground">
                The connection has expired
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Nothing is lost — everything you saved is still here. Reconnect
                in Claude using the same address below, then run the check.
              </p>
            </section>
          ) : null}

          <section className="mt-10 rounded-xl border border-border bg-card p-6">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Your workspace address
            </h2>
            {endpointUrl ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-4 py-2.5 font-mono text-sm text-foreground">
                  {endpointUrl}
                </code>
                <CopyButton value={endpointUrl} label="Copy" />
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Not configured on this deployment yet — ask your admin to set{" "}
                <code className="font-mono text-xs">MCP_RESOURCE_URL</code>.
              </p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              Claude asks for this when you add the connector.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              How to connect
            </h2>
            <ol className="mt-4 border-t border-border">
              <Step index={1} title="Open Claude's connector settings">
                In Claude, go to{" "}
                <span className="font-medium text-foreground">
                  Settings → Connectors
                </span>{" "}
                and choose{" "}
                <span className="font-medium text-foreground">
                  Add custom connector
                </span>
                .
              </Step>
              <Step index={2} title="Paste the address above">
                That tells Claude where your workspace lives.
              </Step>
              <Step index={3} title="Approve access">
                Claude sends you back here to sign in and approve. One click,
                and you can revoke it from Claude whenever you like.
              </Step>
              <Step index={4} title="Come back and run the check">
                Once it&apos;s connected, this page confirms it and opens your
                first module.
              </Step>
            </ol>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href={claudeCoworkUrl(mcpConnectCoworkPrompt(endpointUrl))}>
                  Open Claude Cowork
                </a>
              </Button>
              <RecheckButton label="I've connected — check now" size="lg" />
            </div>
          </section>
        </>
      )}

      {/* ── Gate: unlock the first module once the check passes ── */}
      {isAuthorised ? (
        <section className="mt-8 flex flex-wrap items-end justify-between gap-6 rounded-xl bg-surface-inverse px-7 py-6 text-surface-inverse-foreground">
          <div className="max-w-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brand-lime">
              {gate.kicker}
            </p>
            <h2 className="mt-3 font-serif text-2xl font-medium leading-snug tracking-[-0.01em]">
              {gate.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-surface-inverse-foreground/60">
              {gate.body}
            </p>
          </div>
          <div className="shrink-0">
            {gate.href ? (
              <Button asChild size="lg">
                <Link href={gate.href}>{gate.cta}</Link>
              </Button>
            ) : venture ? (
              <StartRunButton ventureId={venture.id} />
            ) : (
              <Button asChild size="lg">
                <Link href="/workspace">Create a venture first</Link>
              </Button>
            )}
          </div>
        </section>
      ) : null}

      <p className="mt-10 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">
        <span className="font-medium text-foreground">
          What this connection can and can&apos;t do:
        </span>{" "}
        we never see your Claude conversations. It only lets Claude call your
        workspace — read a module&apos;s questions, save your answers, and store
        the documents you produce. Every call is logged, and you can disconnect
        from Claude&apos;s settings at any time.
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

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 border-b border-border py-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-mono text-[11px] font-semibold text-brand-lime">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {children}
        </p>
      </div>
    </li>
  );
}
