import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listModuleCatalog } from "@/lib/module-catalog";

import { ModuleCatalogCard } from "./components/module-catalog-card";

export default async function ModulesPage() {
  const actor = await getCurrentFounderActor();
  const modules = await listModuleCatalog(actor);

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
          Work through each module in order. Modules still in draft show as
          coming soon until they&apos;re published.
        </p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {modules.map((module) => (
          <ModuleCatalogCard key={module.moduleKey} module={module} />
        ))}
      </div>
    </main>
  );
}
