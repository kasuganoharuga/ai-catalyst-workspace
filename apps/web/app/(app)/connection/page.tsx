import Link from "next/link";

import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import {
  getMcpConnectionStatus,
  getMcpEndpointUrl,
} from "@/lib/mcp-connection";
import { getModuleContextByKey } from "@/lib/run-modules";

import { CopyButton } from "../components/copy-button";
import { RecheckButton } from "../components/recheck-button";
import { StatusBadge } from "../components/status-badge";
import {
  CLAUDE_CONNECTOR_SETTINGS_URL,
  MODULE_0_KEY,
  claudeChatUrl,
  startModulePrompt,
} from "../lib/module-display";

const SETUP_STEPS: { title: string; detail: string }[] = [
  {
    title: "Open Claude's connector settings",
    detail: "In Claude, go to Settings → Connectors → “Add custom connector”.",
  },
  {
    title: "Paste your workspace address",
    detail: "Use the address above — it tells Claude where your toolkit lives.",
  },
  {
    title: "Approve access when Claude asks",
    detail:
      "You'll be sent back here to sign in and approve. One click, one time — you can revoke it whenever you like.",
  },
  {
    title: "Say hello to Module 0",
    detail:
      "Start a new chat and ask Claude to begin Module 0. It checks that everything works before any real work starts.",
  },
];

export default async function ConnectionPage() {
  const actor = await getCurrentFounderActor();
  const [connection, module0Context] = await Promise.all([
    getMcpConnectionStatus(actor),
    getModuleContextByKey(actor, MODULE_0_KEY),
  ]);
  const endpointUrl = getMcpEndpointUrl();

  const connectionExpired =
    !connection.connected && connection.hasEverConnected;
  const module0Completed = module0Context?.runModule.status === "completed";

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        MCP connection
      </p>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight">
        Connect Claude to your workspace
      </h1>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">
        Your modules run as conversations in Claude, linked to this workspace
        through a secure MCP connection. Set it up once — from then on, Claude
        can read each module&apos;s questions and save your work straight back
        here.
      </p>

      {/* Connection status card */}
      <section className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-inverse text-lg font-bold text-brand-lime">
              ⇄
            </span>
            <div>
              <p className="text-base font-semibold text-foreground">
                Claude ↔ AI Catalyst
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {connection.connected
                  ? `Connected via ${connection.clientName ?? "your AI client"}`
                  : connectionExpired
                    ? "Connection expired — easy to fix below"
                    : "Not connected yet"}
              </p>
            </div>
          </div>
          <StatusBadge
            status={
              connection.connected
                ? { label: "Connected", tone: "accent" }
                : connectionExpired
                  ? { label: "Reconnect needed", tone: "warning" }
                  : { label: "Not connected", tone: "muted" }
            }
          />
        </div>
        <div className="border-t border-border bg-muted/40 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Your workspace address
          </p>
          {endpointUrl ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code className="min-w-0 flex-1 break-all rounded-xl border border-border bg-card px-4 py-2.5 font-mono text-sm text-foreground">
                {endpointUrl}
              </code>
              <CopyButton value={endpointUrl} label="Copy address" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              The workspace address isn&apos;t configured on this deployment yet
              — ask your admin to set{" "}
              <code className="font-mono text-xs">MCP_RESOURCE_URL</code>.
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            This is what you paste when Claude asks for the connector address.
          </p>
        </div>
      </section>

      {/* Repair panel */}
      {connectionExpired ? (
        <section className="mt-6 rounded-[2rem] border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="text-base font-semibold text-foreground">
            Claude&apos;s connection has expired
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This happens from time to time and nothing is lost — everything you
            saved is still here. In Claude, open{" "}
            <span className="font-medium text-foreground">
              Settings → Connectors
            </span>
            , find AI Catalyst and reconnect. Then come back and re-check.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={CLAUDE_CONNECTOR_SETTINGS_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition hover:brightness-110"
            >
              Open Claude settings
            </a>
            <RecheckButton label="I've reconnected — re-check" />
          </div>
        </section>
      ) : null}

      {/* Setup steps */}
      <section className="mt-6 rounded-[2rem] border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-foreground">
            Set it up in Claude — takes about two minutes
          </h2>
          <span className="text-xs font-semibold text-muted-foreground">
            One-time setup
          </span>
        </div>
        <ol className="mt-6 space-y-5">
          {SETUP_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-mono text-xs font-bold text-brand-lime">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {step.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Privacy honesty note */}
      <section className="mt-6 rounded-[2rem] border border-border bg-muted/40 p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">
            What this connection can and can&apos;t do:
          </span>{" "}
          we never see your Claude conversations. The connection only lets
          Claude call your workspace — read a module&apos;s questions, save your
          answers, and store the documents you produce. Every call is logged,
          and you can disconnect from Claude&apos;s settings at any time.
        </p>
      </section>

      {/* Ready panel */}
      {connection.connected ? (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-primary/40 bg-accent p-6">
          <div>
            <p className="text-base font-semibold text-accent-foreground">
              {module0Completed
                ? "Claude is connected and Module 0 is done"
                : "Claude is connected — you're ready to go"}
            </p>
            <p className="mt-1 text-sm text-accent-foreground/80">
              {module0Completed
                ? "Head to your modules to keep going."
                : "Next up: let Module 0 check everything end to end."}
            </p>
          </div>
          <Link
            href={module0Completed ? "/modules" : `/modules/${MODULE_0_KEY}`}
            className="rounded-full bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition hover:brightness-110"
          >
            {module0Completed ? "View modules" : "View Module 0"}
          </Link>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        {!connection.connected && !connectionExpired ? (
          <a
            href={CLAUDE_CONNECTOR_SETTINGS_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
          >
            Open Claude settings
          </a>
        ) : null}
        {connection.connected ? (
          <a
            href={claudeChatUrl(startModulePrompt("Setup and Connection"))}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
          >
            Open Claude
          </a>
        ) : null}
        <RecheckButton />
      </div>
    </main>
  );
}
