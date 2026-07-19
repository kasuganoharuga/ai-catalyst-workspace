import Link from "next/link";
import type { ReactNode } from "react";

import type { ModuleContext } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import {
  deriveMcpConnectionState,
  formatRelativeTime,
  getMcpConnectionStatus,
} from "@/lib/mcp-connection";
import { listModuleCatalog } from "@/lib/module-catalog";
import { getModuleContextByKey, listRunModules } from "@/lib/run-modules";
import { getMyProfile, resolveGreetingName } from "@/lib/user-profile";
import { appPageTitle } from "@/lib/page-metadata";
import { ventureForActiveContext } from "@/lib/ventures";

import { PageShell } from "../components/page-shell";
import { StartRunButton } from "../components/start-run-button";
import { MODULE_0_KEY, MODULE_1_KEY } from "../lib/module-display";
import { ModuleStatusCard } from "./components/module-status-card";
import { NextActionCard } from "./components/next-action-card";
import { SetupStepper, type SetupStep } from "./components/setup-stepper";

export const metadata = appPageTitle("Dashboard");

function connectionStatContent(
  state: ReturnType<typeof deriveMcpConnectionState>,
  lastActivityAt: string | null,
): { value: string; label: ReactNode } {
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
      return { value: "Connected", label: "Authorised — not used yet" };
    case "expired":
      return {
        value: "Expired",
        label: (
          <>
            Reconnect in{" "}
            <Link href="/connection" className="underline">
              MCP connection
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
              MCP connection
            </Link>
          </>
        ),
      };
  }
}

export default async function DashboardPage() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const activeContextPromise = getActiveContext(actor);
  const [catalog, , connection, runResult, profile] = await Promise.all([
    listModuleCatalog(actor),
    activeContextPromise,
    getMcpConnectionStatus(actor),
    listRunModules(actor),
    getMyProfile(actor),
  ]);

  const hasRun = runResult.runId !== null;
  const [venture, module0, module1] = await Promise.all([
    activeContextPromise.then((context) =>
      ventureForActiveContext(actor, context),
    ),
    hasRun ? getModuleContextByKey(actor, MODULE_0_KEY) : Promise.resolve(null),
    hasRun ? getModuleContextByKey(actor, MODULE_1_KEY) : Promise.resolve(null),
  ]);

  const liveModules = catalog.filter((m) => m.catalogStatus === "live");
  const comingSoonCount = catalog.length - liveModules.length;
  const contextByKey = new Map<string, ModuleContext | null>([
    [MODULE_0_KEY, module0],
    [MODULE_1_KEY, module1],
  ]);

  const module0Completed = module0?.runModule.status === "completed";
  const module1Unlocked =
    module1 !== null &&
    module1.runModule.status !== "locked" &&
    module1.runModule.status !== "inherited";
  const verdictReady =
    module1?.activeAttempt?.status === "ready_for_review" ||
    module1?.runModule.status === "completed";

  const unlockedCount = runResult.modules.filter(
    (m) => m.status !== "locked" && m.status !== "inherited",
  ).length;
  const artefactsSaved = [module0, module1]
    .filter((context): context is ModuleContext => context !== null)
    .flatMap((context) => context.artifacts)
    .filter((artifact) => artifact.latestSubmission !== null).length;

  const connectionState = deriveMcpConnectionState(connection);
  const connectionStat = connectionStatContent(
    connectionState,
    connection.lastActivityAt,
  );

  const steps: SetupStep[] = [
    {
      title: "Connect Claude",
      description: "A one-time secure link between Claude and this workspace",
      done: connection.authorised || module0Completed,
      href: "/connection",
    },
    {
      title: "Complete Module 0",
      description: "A five-minute check that everything works, run in Claude",
      done: Boolean(module0Completed),
      href: `/modules/${MODULE_0_KEY}`,
    },
    {
      title: "Module 1 unlocks",
      description: "Happens automatically the moment Module 0 passes",
      done: module1Unlocked,
      href: null,
    },
    {
      title: "Save your verdict",
      description: "Pressure-test your idea and land on proceed, pivot or kill",
      done: Boolean(verdictReady),
      href: `/modules/${MODULE_1_KEY}`,
    },
  ];

  const welcomeSub = (() => {
    if (!hasRun)
      return "Everything you work through here compounds — each answer feeds the next question.";
    if (!connection.authorised && !module0Completed)
      return "The thinking happens in Claude. Connect it once and it stays connected.";
    if (!module0Completed)
      return "Claude is connected. One short check and the real questions begin.";
    if (!verdictReady)
      return "Your idea is on the table. Keep going until the case holds up on its own.";
    return "The hard part is done — your idea has been through the wringer and survived on paper.";
  })();

  // One next action, chosen by where the founder actually is. This is
  // what the single dark card on the page carries.
  const nextAction = (() => {
    if (!hasRun) {
      return {
        title: "Open up your programme",
        body: venture
          ? `Sets up your run of the toolkit for ${venture.name}, with the first module ready. It only happens once.`
          : "Sets up your run of the toolkit, with the first module ready.",
      };
    }
    if (!connection.authorised && !module0Completed) {
      return {
        title: "Connect Claude to your workspace",
        body: "Every module runs as a conversation. Two minutes of setup, then you never think about it again.",
        href: "/connection",
        cta: "Set up the connection",
      };
    }
    if (!module0Completed) {
      return {
        title: "Run the setup check",
        body: "Five minutes in Claude to prove the whole path works, before anything is riding on it.",
        href: `/modules/${MODULE_0_KEY}`,
        cta: "Open Module 0",
      };
    }
    if (!verdictReady) {
      return {
        title: "Put your idea under pressure",
        body: "Six questions, an honest verdict, and a decision you have to defend: proceed, pivot or kill.",
        href: `/modules/${MODULE_1_KEY}`,
        cta: "Open Module 1",
      };
    }
    return {
      title: "Your verdict is on the record",
      body: "It stays here, versioned, ready for a mentor to pick apart when review opens.",
      href: "/artefacts",
      cta: "View artefacts",
    };
  })();

  return (
    <PageShell>
      <div>
        <h1 className="font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          Welcome back, {resolveGreetingName(profile, session.user.name)}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted-foreground">
          {welcomeSub}
        </p>
      </div>

      <div className="mt-10">
        <NextActionCard title={nextAction.title} body={nextAction.body}>
          {!hasRun ? (
            venture ? (
              <StartRunButton ventureId={venture.id} label="Set it up" />
            ) : (
              <Button asChild size="lg">
                <Link href="/workspace">Create a venture first</Link>
              </Button>
            )
          ) : nextAction.href ? (
            <Button asChild size="lg">
              <Link href={nextAction.href}>{nextAction.cta}</Link>
            </Button>
          ) : null}
        </NextActionCard>
      </div>

      {hasRun && !verdictReady ? (
        <div className="mt-12">
          <SetupStepper steps={steps} />
        </div>
      ) : null}

      <div className="mt-12 grid grid-cols-3 divide-x divide-border border-y border-border">
        <Stat value={`${unlockedCount}`} suffix={`/${catalog.length}`}>
          Modules unlocked
        </Stat>
        <Stat value={`${artefactsSaved}`}>Artefacts saved</Stat>
        <Stat value={connectionStat.value}>{connectionStat.label}</Stat>
      </div>

      <div className="mt-14 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">
          Your modules
        </h2>
        <Link
          href="/modules"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          View all
        </Link>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {liveModules.map((module) => (
          <ModuleStatusCard
            key={module.moduleKey}
            catalog={module}
            context={contextByKey.get(module.moduleKey) ?? null}
          />
        ))}
      </div>

      {comingSoonCount > 0 ? (
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">
            {comingSoonCount} more modules
          </span>{" "}
          — customer, problem, evidence, business model — open as you work
          through the ones above.
        </p>
      ) : null}
    </PageShell>
  );
}

// Figures get the display face and tabular numerals so a row of stats
// lines up on the decimal and reads as data, not as body copy.
function Stat({
  value,
  suffix,
  children,
}: {
  value: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-5 py-6 first:pl-0 last:pr-0">
      <p className="font-serif text-[2rem] font-medium leading-none tabular-nums tracking-[-0.02em]">
        {value}
        {suffix ? (
          <span className="text-lg text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}
