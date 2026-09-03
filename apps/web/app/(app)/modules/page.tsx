import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listModuleCatalog } from "@/lib/module-catalog";
import { listRunModules } from "@/lib/run-modules";
import { appPageTitle } from "@/lib/page-metadata";
import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";

import { PageHeader } from "@/components/page-header";
import { SectionHeaderRow } from "@/components/section-header-row";

import { PageShell } from "../components/page-shell";
import { modulesCopy } from "../lib/copy";
import { deriveModuleDisplayStatus } from "../lib/module-status";
import { ModuleCatalogCard } from "./components/module-catalog-card";

export const metadata = appPageTitle("Modules");

export default async function ModulesPage() {
  const actor = await getCurrentFounderActor();
  const [catalog, runResult] = await Promise.all([
    listModuleCatalog(actor),
    listRunModules(actor),
  ]);
  // "Every module, in order" has to mean the modules a founder actually
  // works through. The setup module completes itself server-side and has
  // no entry point anywhere else, so listing it here would contradict the
  // dashboard's own count and offer a card that leads nowhere useful.
  const modules = catalog.filter(
    (module) => SHOW_SETUP_MODULE || module.moduleType !== "setup",
  );
  const runModuleByKey = new Map(
    runResult.modules.map((runModule) => [runModule.moduleKey, runModule]),
  );

  const openCount = modules.filter((m) => m.catalogStatus === "live").length;

  return (
    <PageShell>
      <PageHeader
        kicker={modulesCopy.kicker}
        title={modulesCopy.title}
        intro={modulesCopy.intro}
      />

      <SectionHeaderRow
        className="mt-10 border-t border-border pt-4"
        label={modulesCopy.allModules}
        meta={modulesCopy.openCount(openCount, modules.length)}
      />

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
    </PageShell>
  );
}
