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

  const openCount = modules.filter((m) => m.catalogStatus === "live").length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          The programme
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          Every module, in order
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Each one is a working session you run in Claude that ends with
          something written down and kept. They open in sequence, so what you
          work out in one is already on the table for the next.
        </p>
      </div>

      <div className="mt-10 flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          All modules
        </p>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {openCount} of {modules.length} open
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
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
