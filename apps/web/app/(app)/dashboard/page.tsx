import Link from "next/link";

import type { ModuleContext } from "@ai-catalyst/shared";

import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { listModuleCatalog } from "@/lib/module-catalog";
import { getModuleContextByKey, listRunModules } from "@/lib/run-modules";
import { getVenture } from "@/lib/ventures";

import { RecheckButton } from "../components/recheck-button";
import { StartRunButton } from "../components/start-run-button";
import { MODULE_0_KEY, MODULE_1_KEY } from "../lib/module-display";
import { ModuleStatusCard } from "./components/module-status-card";
import { SetupStepper, type SetupStep } from "./components/setup-stepper";

function formatLifecycleStage(stage: string): string {
  return stage
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export default async function DashboardPage() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const [catalog, activeContext, connection, runResult] = await Promise.all([
    listModuleCatalog(actor),
    getActiveContext(actor),
    getMcpConnectionStatus(actor),
    listRunModules(actor),
  ]);
  const venture = activeContext.ventureId
    ? await getVenture(actor, activeContext.ventureId)
    : null;

  const hasRun = runResult.runId !== null;
  const [module0, module1] = hasRun
    ? await Promise.all([
        getModuleContextByKey(actor, MODULE_0_KEY),
        getModuleContextByKey(actor, MODULE_1_KEY),
      ])
    : [null, null];

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
  const readyForReviewCount = verdictReady ? 1 : 0;

  const steps: SetupStep[] = [
    {
      title: "Connect Claude",
      description: "A one-time secure link between Claude and this workspace",
      done: connection.connected || module0Completed,
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
      return "One click below sets up your module plan — then Claude takes it from there.";
    if (!connection.connected && !module0Completed)
      return "First things first: connect Claude, then let Module 0 check that everything works.";
    if (!module0Completed)
      return "Claude is connected. Module 0 is a quick end-to-end check — ask Claude to start it whenever you're ready.";
    if (!verdictReady)
      return "Module 0 is done and the pressure test is unlocked. It all happens in Claude — this page keeps score.";
    return "Both foundation modules are done — your verdict is saved and ready for review.";
  })();

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Welcome back, {firstName(session.user.name)}
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-muted-foreground">
            {welcomeSub}
          </p>
        </div>
        <RecheckButton className="shrink-0" />
      </div>

      <div className="mt-10">
        {!hasRun ? (
          <div className="rounded-[2rem] border border-border bg-card p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Getting started
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              Set up your module plan
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-muted-foreground">
              This creates your personal run of the toolkit
              {venture ? (
                <>
                  {" "}
                  for <span className="font-semibold">{venture.name}</span>
                </>
              ) : null}
              , with Module 0 ready to start. It only ever happens once.
            </p>
            {venture ? (
              <StartRunButton
                ventureId={venture.id}
                className="mt-6 flex justify-center"
              />
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                You need an active Venture first —{" "}
                <Link href="/workspace" className="underline">
                  create one here
                </Link>
                .
              </p>
            )}
          </div>
        ) : verdictReady ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-border bg-muted/40 p-6">
            <div>
              <p className="text-base font-semibold text-foreground">
                Next: review your Pressure-Test Verdict with a mentor
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Mentor review is coming in an upcoming release — your verdict is
                safe here in the meantime.
              </p>
            </div>
            <Link
              href="/artefacts"
              className="shrink-0 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              View artefacts
            </Link>
          </div>
        ) : (
          <SetupStepper steps={steps} />
        )}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
          <p className="text-3xl font-semibold tracking-tight">
            {unlockedCount}
            <span className="text-base font-semibold text-muted-foreground">
              /{catalog.length}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Modules unlocked</p>
        </div>
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
          <p className="text-3xl font-semibold tracking-tight">
            {artefactsSaved}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Artefacts saved</p>
        </div>
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
          {readyForReviewCount > 0 ? (
            <>
              <p className="text-3xl font-semibold tracking-tight">
                {readyForReviewCount}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ready for review
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-semibold tracking-tight">
                {venture ? formatLifecycleStage(venture.lifecycleStage) : "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {venture ? (
                  "Current stage"
                ) : (
                  <>
                    No Venture yet ·{" "}
                    <Link href="/workspace" className="underline">
                      create one
                    </Link>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-14 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Your modules</h2>
        <Link
          href="/modules"
          className="text-sm font-semibold text-foreground hover:underline"
        >
          View all modules
        </Link>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {liveModules.map((module) => (
          <ModuleStatusCard
            key={module.moduleKey}
            catalog={module}
            context={contextByKey.get(module.moduleKey) ?? null}
          />
        ))}
      </div>

      {comingSoonCount > 0 ? (
        <div className="mt-6 rounded-[2rem] border border-border bg-muted/40 p-6">
          <p className="text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">
              {comingSoonCount} more modules
            </span>{" "}
            (customer discovery, validation and beyond) are on their way.
            They&apos;ll appear here as the program grows — no action needed
            from you.
          </p>
        </div>
      ) : null}
    </main>
  );
}
