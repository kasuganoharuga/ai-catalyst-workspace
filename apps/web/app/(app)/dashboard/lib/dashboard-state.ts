import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";
import type {
  ModuleCatalogEntry,
  ModuleContext,
  RunModuleSummary,
} from "@ai-catalyst/shared";

import { hasPendingSetupModule } from "@/lib/ensure-program-destination";
import { deriveMcpConnectionState } from "@/lib/mcp-connection";
import { resolveGreetingName } from "@/lib/user-profile";

import { dashboardCopy } from "../../lib/copy";
import type { DashboardNextAction, DashboardViewModel } from "../types";
import { connectionStatContent } from "./connection-stat";

type ProfileLike = {
  firstName: string | null;
  lastName: string | null;
};

/** The one Module a founder would actually work on next: the first
 * unlocked-but-not-done Module in sequence order, or null once every
 * Module currently unlockable is complete. Setup Modules are excluded
 * (unless `showSetupModule`) — the earlier `setupPending` branch already
 * covers Module 0 being mid-flight. */
function findCurrentModule(
  runModules: RunModuleSummary[],
  catalog: ModuleCatalogEntry[],
  showSetupModule: boolean,
): { moduleKey: string; title: string; subtitle: string | null } | null {
  const catalogByKey = new Map(
    catalog.map((entry) => [entry.moduleKey, entry]),
  );
  const candidate = runModules
    .filter((m) => showSetupModule || m.moduleType !== "setup")
    .find((m) => m.status === "available" || m.status === "in_progress");
  if (!candidate) return null;
  const entry = catalogByKey.get(candidate.moduleKey);
  return {
    moduleKey: candidate.moduleKey,
    title: candidate.title,
    subtitle: entry?.subtitle ?? null,
  };
}

export function buildDashboardViewModel(input: {
  catalog: ModuleCatalogEntry[];
  runModules: RunModuleSummary[];
  hasRun: boolean;
  /** Every Module Context on the Founder's active Run, one batched call —
   * not just Module 0/1 — so artefact counts and per-Module carousel
   * status cover Modules 2-4 too. */
  contexts: ModuleContext[];
  connection: McpConnectionStatus;
  profile: ProfileLike;
  sessionUserName: string;
  profilePromptSkipped: boolean;
  passwordChanged: boolean;
  showSetupModule: boolean;
}): DashboardViewModel {
  const {
    catalog,
    runModules,
    hasRun,
    contexts,
    connection,
    profile,
    sessionUserName,
    profilePromptSkipped,
    passwordChanged,
    showSetupModule,
  } = input;

  // Setup modules complete server-side and stay out of carousel/unlocked counts.
  const liveModules = catalog.filter(
    (m) =>
      m.catalogStatus === "live" &&
      (showSetupModule || m.moduleType !== "setup"),
  );
  const contextByKey = new Map(
    contexts.map((context) => [context.runModule.moduleKey, context]),
  );
  const visibleCatalogCount = catalog.filter(
    (m) => showSetupModule || m.moduleType !== "setup",
  ).length;

  const currentModule = findCurrentModule(runModules, catalog, showSetupModule);

  const unlockedCount = runModules.filter(
    (m) =>
      m.status !== "locked" &&
      m.status !== "inherited" &&
      (showSetupModule || m.moduleType !== "setup"),
  ).length;

  const artefactsSaved = contexts
    .flatMap((context) => context.artifacts)
    .filter((artifact) => artifact.latestSubmission !== null).length;

  const connectionState = deriveMcpConnectionState(connection);
  const connectionStat = connectionStatContent(
    connectionState,
    connection.lastActivityAt,
  );

  // Both name parts required; gates nothing — only whether the nudge shows.
  const profileComplete = Boolean(
    profile.firstName?.trim() && profile.lastName?.trim(),
  );
  const isFirstVisit = !hasRun;
  const setupPending = hasPendingSetupModule(runModules);

  const welcomeSub = resolveWelcomeSub({
    isFirstVisit,
    authorised: connection.authorised,
    hasRun,
    setupPending,
    currentModule,
  });

  const nextAction = resolveNextAction({
    profileComplete,
    profilePromptSkipped,
    authorised: connection.authorised,
    hasRun,
    setupPending,
    currentModule,
  });

  const greetingName = resolveGreetingName(profile, sessionUserName ?? "");

  return {
    greeting: isFirstVisit
      ? dashboardCopy.greetingFirstVisit(greetingName)
      : dashboardCopy.greetingReturning(greetingName),
    welcomeSub,
    nextAction,
    showPasswordPrompt: !passwordChanged,
    unlockedCount,
    visibleCatalogCount,
    artefactsSaved,
    connectionStat,
    carouselItems: liveModules.map((module) => ({
      catalog: module,
      context: contextByKey.get(module.moduleKey) ?? null,
    })),
  };
}

type CurrentModule = ReturnType<typeof findCurrentModule>;

function resolveWelcomeSub(input: {
  isFirstVisit: boolean;
  authorised: boolean;
  hasRun: boolean;
  setupPending: boolean;
  currentModule: CurrentModule;
}): string | null {
  if (input.isFirstVisit) return null;
  if (!input.authorised) return dashboardCopy.subNeedsConnection;
  if (!input.hasRun || input.setupPending) return dashboardCopy.subNeedsRun;
  if (input.currentModule)
    return dashboardCopy.subInProgress(input.currentModule.title);
  return dashboardCopy.subDone;
}

function resolveNextAction(input: {
  profileComplete: boolean;
  profilePromptSkipped: boolean;
  authorised: boolean;
  hasRun: boolean;
  setupPending: boolean;
  currentModule: CurrentModule;
}): DashboardNextAction {
  if (!input.profileComplete && !input.profilePromptSkipped) {
    return {
      kicker: dashboardCopy.actionFirstKicker,
      title: dashboardCopy.actionProfileTitle,
      body: dashboardCopy.actionProfileBody,
      href: "/profile",
      cta: dashboardCopy.actionProfileCta,
      skippable: true,
    };
  }
  if (!input.authorised) {
    return {
      title: dashboardCopy.actionConnectTitle,
      body: dashboardCopy.actionConnectBody,
      href: "/connection",
      cta: dashboardCopy.actionConnectCta,
    };
  }
  // Setup still open must not deep-link a Module (lands on a dead gate).
  if (!input.hasRun || input.setupPending) {
    return {
      title: dashboardCopy.actionOpenRunTitle,
      body: dashboardCopy.actionOpenRunBody,
      ensure: true,
      cta: dashboardCopy.actionOpenRunCta,
    };
  }
  if (input.currentModule) {
    return {
      title: dashboardCopy.actionModuleTitle(input.currentModule.title),
      body: input.currentModule.subtitle ?? "",
      href: `/modules/${encodeURIComponent(input.currentModule.moduleKey)}`,
      cta: dashboardCopy.actionModuleCta,
    };
  }
  return {
    title: dashboardCopy.actionDoneTitle,
    body: dashboardCopy.actionDoneBody,
    href: "/artefacts",
    cta: dashboardCopy.actionDoneCta,
  };
}
