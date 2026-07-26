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
import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";
import { hasPendingSetupModule } from "@/lib/ensure-program-destination";
import { hasSkippedProfilePrompt } from "@/lib/profile-prompt-dismissal";
import { PageShell } from "../components/page-shell";
import { ContinueProgrammeButton } from "../components/continue-programme-button";
import { dashboardCopy } from "../lib/copy";
import { MODULE_0_KEY, MODULE_1_KEY } from "../lib/module-display";
import { ModulesCarousel } from "./components/modules-carousel";
import { NextActionCard } from "./components/next-action-card";
import { SkipProfileButton } from "./components/skip-profile-button";

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
  const [catalog, , connection, runResult, profile, profilePromptSkipped] =
    await Promise.all([
      listModuleCatalog(actor),
      activeContextPromise,
      getMcpConnectionStatus(actor),
      listRunModules(actor),
      getMyProfile(actor),
      hasSkippedProfilePrompt(),
    ]);

  const hasRun = runResult.runId !== null;
  const [module0, module1] = await Promise.all([
    hasRun ? getModuleContextByKey(actor, MODULE_0_KEY) : Promise.resolve(null),
    hasRun ? getModuleContextByKey(actor, MODULE_1_KEY) : Promise.resolve(null),
  ]);

  // Module 0 is completed server-side and never shown, so it must not
  // appear in the carousel or count towards "modules unlocked" either —
  // a founder counting two modules where they have seen one is worse than
  // no count at all.
  const liveModules = catalog.filter(
    (m) =>
      m.catalogStatus === "live" &&
      (SHOW_SETUP_MODULE || m.moduleType !== "setup"),
  );
  const contextByKey = new Map<string, ModuleContext | null>([
    [MODULE_0_KEY, module0],
    [MODULE_1_KEY, module1],
  ]);
  const visibleCatalogCount = catalog.filter(
    (m) => SHOW_SETUP_MODULE || m.moduleType !== "setup",
  ).length;

  const verdictReady =
    module1?.activeAttempt?.status === "ready_for_review" ||
    module1?.runModule.status === "completed";

  const unlockedCount = runResult.modules.filter(
    (m) =>
      m.status !== "locked" &&
      m.status !== "inherited" &&
      (SHOW_SETUP_MODULE || m.moduleType !== "setup"),
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

  // Both name parts, so a half-filled or leftover single field doesn't
  // read as done. This no longer gates anything — it only decides whether
  // the nudge is shown. The invitation password still can't be detected
  // from Better Auth, which is why it is mentioned inside that nudge
  // rather than prompted for separately.
  const profileComplete = Boolean(
    profile.firstName?.trim() && profile.lastName?.trim(),
  );

  // Nothing to come back to yet means this is a first visit, whatever the
  // account's age. "Welcome back" on a screen someone has never seen is a
  // small lie, and it lands on the one visit that sets expectations.
  const isFirstVisit = !hasRun;

  const setupPending = hasPendingSetupModule(runResult.modules);

  // Nothing under the greeting on a first visit. The card below already
  // says what to do; a second sentence restating it is the first thing a
  // new founder has to read past.
  const welcomeSub = (() => {
    if (isFirstVisit) return null;
    if (!connection.authorised) return dashboardCopy.subNeedsConnection;
    if (!hasRun || setupPending) return dashboardCopy.subNeedsRun;
    if (!verdictReady) return dashboardCopy.subInProgress;
    return dashboardCopy.subDone;
  })();

  // One next action, chosen by where the founder actually is. This is
  // what the single dark card on the page carries.
  //
  // The profile step leads, but it still gates nothing: every other route
  // stays open in the sidebar, and skipping it costs the founder only the
  // greeting using their invitation name. It is a recommended order, not a
  // sequence they are locked into.
  const nextAction = (() => {
    if (!profileComplete && !profilePromptSkipped) {
      return {
        kicker: dashboardCopy.actionFirstKicker,
        title: dashboardCopy.actionProfileTitle,
        body: dashboardCopy.actionProfileBody,
        href: "/profile",
        cta: dashboardCopy.actionProfileCta,
        skippable: true as const,
      };
    }
    if (!connection.authorised) {
      return {
        title: dashboardCopy.actionConnectTitle,
        body: dashboardCopy.actionConnectBody,
        href: "/connection",
        cta: dashboardCopy.actionConnectCta,
      };
    }
    // `setupPending` matters as much as `!hasRun`: a Run made before the
    // setup Module was hidden still has it open, with everything after it
    // locked. Linking straight to Module 1 there lands the founder on
    // "finish the previous module" about a module with no entry point.
    // Both cases go through the action that completes setup server-side.
    if (!hasRun || setupPending) {
      return {
        title: dashboardCopy.actionOpenRunTitle,
        body: dashboardCopy.actionOpenRunBody,
        ensure: true as const,
        cta: dashboardCopy.actionOpenRunCta,
      };
    }
    if (!verdictReady) {
      return {
        title: dashboardCopy.actionModule1Title,
        body: dashboardCopy.actionModule1Body,
        href: `/modules/${MODULE_1_KEY}`,
        cta: dashboardCopy.actionModule1Cta,
      };
    }
    return {
      title: dashboardCopy.actionDoneTitle,
      body: dashboardCopy.actionDoneBody,
      href: "/artefacts",
      cta: dashboardCopy.actionDoneCta,
    };
  })();

  return (
    <PageShell>
      <div>
        <h1 className="font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {isFirstVisit
            ? dashboardCopy.greetingFirstVisit(
                resolveGreetingName(profile, session.user.name),
              )
            : dashboardCopy.greetingReturning(
                resolveGreetingName(profile, session.user.name),
              )}
        </h1>
        {welcomeSub ? (
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted-foreground">
            {welcomeSub}
          </p>
        ) : null}
      </div>

      <div className="mt-10">
        <NextActionCard
          kicker={"kicker" in nextAction ? nextAction.kicker : undefined}
          title={nextAction.title}
          body={nextAction.body}
        >
          {"ensure" in nextAction && nextAction.ensure ? (
            <ContinueProgrammeButton label={nextAction.cta ?? "Continue"} />
          ) : nextAction.href ? (
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href={nextAction.href}>{nextAction.cta}</Link>
              </Button>
              {"skippable" in nextAction && nextAction.skippable ? (
                <SkipProfileButton />
              ) : null}
            </div>
          ) : (
            <ContinueProgrammeButton label="Continue" />
          )}
        </NextActionCard>
      </div>

      {/* The profile nudge that used to sit here is now the "First" card
          above — one prompt, not two saying the same thing. */}

      <div className="mt-12 grid grid-cols-3 divide-x divide-border border-y border-border">
        {/* Denominator matches the numerator's filter: counting Module 0
            in the total while excluding it from the count would read as a
            module the founder can never reach. */}
        <Stat value={`${unlockedCount}`} suffix={`/${visibleCatalogCount}`}>
          {dashboardCopy.statModules}
        </Stat>
        <Stat value={`${artefactsSaved}`}>{dashboardCopy.statArtefacts}</Stat>
        <Stat value={connectionStat.value}>{connectionStat.label}</Stat>
      </div>

      <div className="mt-14 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">
          {dashboardCopy.modulesHeading}
        </h2>
        <Link
          href="/modules"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          {dashboardCopy.modulesViewAll}
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
