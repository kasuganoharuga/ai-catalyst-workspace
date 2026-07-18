import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listModuleCatalog } from "@/lib/module-catalog";
import { listRunModules } from "@/lib/run-modules";

import { deriveModuleDisplayStatus } from "../lib/module-display";
import { ModuleCatalogCard } from "./components/module-catalog-card";

export default async function ModulesPage() {
  const actor = await getCurrentFounderActor();
  const [modules, runResult] = await Promise.all([
    listModuleCatalog(actor),
    listRunModules(actor),
  ]);
  const runModuleByKey = new Map(
    runResult.modules.map((runModule) => [runModule.moduleKey, runModule]),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Your modules
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Founder Toolkit modules
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Each module is a guided working session you run in Claude — this page
          shows where you&apos;re up to. They unlock in order, so everything you
          learn carries into the next one.
        </p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {modules.map((module) => {
          const runModule = runModuleByKey.get(module.moduleKey);
          return (
            <ModuleCatalogCard
              key={module.moduleKey}
              module={module}
              runStatus={
                runModule
                  ? deriveModuleDisplayStatus(runModule.status, null)
                  : undefined
              }
            />
          );
        })}
      </div>
    </main>
  );
}
