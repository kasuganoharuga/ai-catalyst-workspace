import { ModuleCard } from "@/components/module-card";
import { SiteHeader } from "@/components/site-header";
import { getToolkitModules } from "@/lib/toolkit";

export default async function ToolkitPage() {
  const modules = await getToolkitModules();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
            Toolkit modules
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em]">
            Move from raw idea to validation-ready plan.
          </h1>
          <p className="mt-6 text-lg leading-8 text-stone-700">
            Each module has clear founder inputs, expected outputs, and a
            downloadable Skill package that can later become an internal
            workspace workflow.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {modules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </main>
    </div>
  );
}
