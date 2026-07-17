import Link from "next/link";

import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { listModuleCatalog } from "@/lib/module-catalog";
import { getVenture } from "@/lib/ventures";

import { ModuleCatalogCard } from "../modules/components/module-catalog-card";
import { ComingSoonBadge } from "./components/coming-soon-badge";
import { WorkspaceSetupCard } from "./components/workspace-setup-card";

const MODULE_PREVIEW_COUNT = 4;

function formatLifecycleStage(stage: string): string {
  return stage
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function DashboardPage() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const [modules, activeContext] = await Promise.all([
    listModuleCatalog(actor),
    getActiveContext(actor),
  ]);
  const venture = activeContext.ventureId
    ? await getVenture(actor, activeContext.ventureId)
    : null;

  const liveCount = modules.filter((m) => m.catalogStatus === "live").length;
  const previewModules = modules.slice(0, MODULE_PREVIEW_COUNT);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">
        Welcome back, {session.user.name}
      </h1>
      <p className="mt-3 text-lg leading-8 text-muted-foreground">
        Work through the modules below in order. Drive sync and automatic
        progress tracking are coming soon — for now, complete each module with
        the AI Catalyst MCP tool in Claude or ChatGPT.
      </p>

      <div className="mt-10">
        <WorkspaceSetupCard />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
          <p className="text-3xl font-semibold tracking-tight">
            {liveCount}/{modules.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Modules live</p>
        </div>
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
          <ComingSoonBadge />
          <p className="mt-3 text-sm text-muted-foreground">Artefacts synced</p>
        </div>
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
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
        </div>
      </div>

      <div className="mt-14 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Your modules</h2>
        <Link
          href="/modules"
          className="text-sm font-semibold text-primary hover:underline"
        >
          View all modules
        </Link>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {previewModules.map((module) => (
          <ModuleCatalogCard key={module.moduleKey} module={module} />
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Stage-based sequencing and visibility are coming soon — every module
        above is shown regardless of your current stage.
      </p>
    </main>
  );
}
