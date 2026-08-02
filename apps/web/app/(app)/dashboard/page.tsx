import Link from "next/link";
import type { ReactNode } from "react";

import { hasChangedInvitationPassword } from "@ai-catalyst/services/profile";

import { Button } from "@/components/ui/button";
import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { listModuleCatalog } from "@/lib/module-catalog";
import { appPageTitle } from "@/lib/page-metadata";
import { hasSkippedProfilePrompt } from "@/lib/profile-prompt-dismissal";
import { getModuleContextByKey, listRunModules } from "@/lib/run-modules";
import { getMyProfile } from "@/lib/user-profile";

import { ContinueProgrammeButton } from "../components/continue-programme-button";
import { PageShell } from "../components/page-shell";
import { dashboardCopy } from "../lib/copy";
import { MODULE_0_KEY, MODULE_1_KEY } from "../lib/module-display";
import { ModulesCarousel } from "./components/modules-carousel";
import { NextActionCard } from "./components/next-action-card";
import { PasswordPrompt } from "./components/password-prompt";
import { SkipProfileButton } from "./components/skip-profile-button";
import { buildDashboardViewModel } from "./lib/dashboard-state";

export const metadata = appPageTitle("Dashboard");

export default async function DashboardPage() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const activeContextPromise = getActiveContext(actor);
  const [
    catalog,
    ,
    connection,
    runResult,
    profile,
    profilePromptSkipped,
    passwordChanged,
  ] = await Promise.all([
    listModuleCatalog(actor),
    activeContextPromise,
    getMcpConnectionStatus(actor),
    listRunModules(actor),
    getMyProfile(actor),
    hasSkippedProfilePrompt(),
    hasChangedInvitationPassword(actor),
  ]);

  const hasRun = runResult.runId !== null;
  const [module0, module1] = await Promise.all([
    hasRun ? getModuleContextByKey(actor, MODULE_0_KEY) : Promise.resolve(null),
    hasRun ? getModuleContextByKey(actor, MODULE_1_KEY) : Promise.resolve(null),
  ]);

  const view = buildDashboardViewModel({
    catalog,
    runModules: runResult.modules,
    hasRun,
    module0,
    module1,
    connection,
    profile,
    sessionUserName: session.user.name,
    profilePromptSkipped,
    passwordChanged,
    showSetupModule: SHOW_SETUP_MODULE,
  });

  return (
    <PageShell>
      <div>
        <h1 className="font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {view.greeting}
        </h1>
        {view.welcomeSub ? (
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted-foreground">
            {view.welcomeSub}
          </p>
        ) : null}
      </div>

      <div className="mt-10">
        <NextActionCard
          kicker={
            "kicker" in view.nextAction ? view.nextAction.kicker : undefined
          }
          title={view.nextAction.title}
          body={view.nextAction.body}
        >
          {"ensure" in view.nextAction ? (
            <ContinueProgrammeButton label={view.nextAction.cta} />
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href={view.nextAction.href}>{view.nextAction.cta}</Link>
              </Button>
              {"skippable" in view.nextAction && view.nextAction.skippable ? (
                <SkipProfileButton />
              ) : null}
            </div>
          )}
        </NextActionCard>
      </div>

      {view.showPasswordPrompt ? (
        <div className="mt-6">
          <PasswordPrompt />
        </div>
      ) : null}

      {/* Stacked below sm: three equal 1fr columns left "Connected" — the
          connection stat's value can be a whole word, not just a short
          number like the other two — with no room to sit on one line at
          phone widths (see connection-stat.tsx for the full set of
          strings). A vertical list at that size gives every stat the
          page's full width instead of a third of it, which is the actual
          fix; the row layout returns once there's width to spare. */}
      <div className="mt-12 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          value={`${view.unlockedCount}`}
          suffix={`/${view.visibleCatalogCount}`}
        >
          {dashboardCopy.statModules}
        </Stat>
        <Stat value={`${view.artefactsSaved}`}>
          {dashboardCopy.statArtefacts}
        </Stat>
        <Stat value={view.connectionStat.value}>
          {view.connectionStat.label}
        </Stat>
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
        <ModulesCarousel items={view.carouselItems} />
      </div>
    </PageShell>
  );
}

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
    <div className="min-w-0 px-5 py-6 sm:first:pl-0 sm:last:pr-0">
      {/* break-words: a defensive backstop, not the fix — see the grid's
          comment above. Harmless for the short numeric values, which
          never come close to needing it. */}
      <p className="font-serif text-[2rem] font-medium leading-none tabular-nums tracking-[-0.02em] break-words">
        {value}
        {suffix ? (
          <span className="text-lg text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}
