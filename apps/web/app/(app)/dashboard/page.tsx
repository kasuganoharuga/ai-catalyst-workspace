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
import { ModulesCarousel } from "./components/modules-carousel";
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
  const contextByKey = new Map<string, ModuleContext | null>([
    [MODULE_0_KEY, module0],
    [MODULE_1_KEY, module1],
  ]);

  const module0Completed = module0?.runModule.status === "completed";
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

  // Profile must be filled in on Your profile before Connect Claude (or
  // anything after) unlocks. Require both name parts so a half-filled or
  // leftover single field never skips the first step. Password change
  // still can't be detected from Better Auth — prompted in the copy only.
  const profileComplete = Boolean(
    profile.firstName?.trim() && profile.lastName?.trim(),
  );
  // Module 0 has produced something and passed its checks. Distinct from
  // completed: the output exists but nobody has signed it off yet.
  const module0OutputReady =
    module0?.activeAttempt?.status === "ready_for_review" ||
    Boolean(module0Completed);

  // The four things standing between a brand-new account and a running
  // programme, in the order they have to happen.
  const steps: SetupStep[] = [
    {
      title: "Set up your profile",
      description:
        "Add your name and swap the invitation password for your own",
      done: profileComplete,
      href: "/profile",
    },
    {
      title: "Connect Claude",
      description: "One secure link between Claude and this workspace",
      done: connection.authorised,
      // Stay on profile until both name fields are saved — do not deep-link
      // ahead of the first step.
      href: profileComplete ? "/connection" : null,
    },
    {
      title: "Run Module 0 in Claude",
      description:
        "Set up a Claude project for your venture, then let it check the whole path end to end",
      done: module0OutputReady,
      href:
        profileComplete && connection.authorised
          ? hasRun
            ? `/modules/${MODULE_0_KEY}`
            : "/connection"
          : null,
    },
    {
      title: "Confirm what it produced",
      description:
        "Read the Setup Summary and sign it off — that's what opens Module 1",
      done: Boolean(module0Completed),
      href:
        profileComplete && connection.authorised && hasRun
          ? `/modules/${MODULE_0_KEY}`
          : null,
    },
  ];

  // Once all four are behind them, this is just clutter on every future
  // visit — the next-action card above carries the thread from here.
  const settingUp = steps.some((step) => !step.done);

  const welcomeSub = (() => {
    if (!profileComplete)
      return "A couple of minutes of setup and the programme is yours — start with your own details.";
    if (!connection.authorised)
      return "The thinking happens in Claude. Connect it once and it stays connected.";
    if (!hasRun)
      return "Everything you work through here compounds — each answer feeds the next question.";
    if (!module0OutputReady)
      return "Claude is connected. One short check and the real questions begin.";
    if (!module0Completed)
      return "Claude has done its part. Nothing moves on until you've read it and said so.";
    if (!verdictReady)
      return "Your idea is on the table. Keep going until the case holds up on its own.";
    return "The hard part is done — your idea has been through the wringer and survived on paper.";
  })();

  // One next action, chosen by where the founder actually is. This is
  // what the single dark card on the page carries.
  const nextAction = (() => {
    if (!profileComplete) {
      return {
        title: "Start with your own details",
        body: "Your name, and a password that isn't the one from your invitation email. It's what the rest of the toolkit greets you by.",
        href: "/profile",
        cta: "Set up your profile",
      };
    }
    if (!connection.authorised) {
      return {
        title: "Connect Claude to your workspace",
        body: "Every module runs as a conversation. Two minutes of setup, then you never think about it again.",
        href: "/connection",
        cta: "Set up the connection",
      };
    }
    if (!hasRun) {
      return {
        title: "Open up your programme",
        body: venture
          ? `Sets up your run of the toolkit for ${venture.name}, with the first module ready. It only happens once.`
          : "Sets up your run of the toolkit, with the first module ready.",
      };
    }
    if (!module0OutputReady) {
      return {
        title: "Run the setup check",
        body: "Five minutes in Claude to prove the whole path works, before anything is riding on it.",
        href: `/modules/${MODULE_0_KEY}`,
        cta: "Open Module 0",
      };
    }
    if (!module0Completed) {
      return {
        title: "Sign off what Claude produced",
        body: "Your Setup Summary is saved and it passed its checks. Read it over and confirm — that's what opens Module 1.",
        href: `/modules/${MODULE_0_KEY}`,
        cta: "Review and confirm",
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
          {nextAction.href ? (
            <Button asChild size="lg">
              <Link href={nextAction.href}>{nextAction.cta}</Link>
            </Button>
          ) : venture ? (
            <StartRunButton ventureId={venture.id} label="Set it up" />
          ) : (
            <Button asChild size="lg">
              <Link href="/workspace">Create a venture first</Link>
            </Button>
          )}
        </NextActionCard>
      </div>

      {settingUp ? (
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
      <div className="mt-5">
        <ModulesCarousel
          items={liveModules.map((module) => ({
            catalog: module,
            context: contextByKey.get(module.moduleKey) ?? null,
          }))}
        />
      </div>
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
