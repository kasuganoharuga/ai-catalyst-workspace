import Link from "next/link";

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
import { hasSkippedProfilePrompt } from "@/lib/profile-prompt-dismissal";
import {
  listModuleContextsForActiveRun,
  listRunModules,
} from "@/lib/run-modules";
import { getMyProfile } from "@/lib/user-profile";

import { ContinueProgrammeButton } from "../components/continue-programme-button";
import { PageShell } from "../components/page-shell";
import { Stat, StatRow } from "../components/stat";
import { dashboardCopy } from "../lib/copy";
import { ModulesCarousel } from "./components/modules-carousel";
import { NextActionCard } from "./components/next-action-card";
import { PasswordPrompt } from "./components/password-prompt";
import { SkipProfileButton } from "./components/skip-profile-button";
import { buildDashboardViewModel } from "./lib/dashboard-state";

/**
 * The /dashboard content for a Founder — moved out of page.tsx verbatim
 * (only the private Stat function became an import from ../components/stat,
 * shared with MentorDashboard) so page.tsx can be a plain role dispatcher.
 * Calls its own getCurrentFounderActor(), same as every other Founder-only
 * page in this route group — the shared layout letting a Mentor into the
 * shell says nothing about which page they land on.
 */
export async function FounderDashboard() {
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
  const contexts = hasRun ? await listModuleContextsForActiveRun(actor) : [];

  const view = buildDashboardViewModel({
    catalog,
    runModules: runResult.modules,
    hasRun,
    contexts,
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

      <StatRow>
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
      </StatRow>

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
