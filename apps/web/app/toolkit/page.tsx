import { ModuleCard } from "@/components/module-card";
import { SiteHeader } from "@/components/site-header";
import { getToolkitModules } from "@/lib/toolkit";

export default async function ToolkitPage() {
  const modules = await getToolkitModules();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Toolkit preview
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight">
            Move from raw idea to validation-ready plan.
          </h1>
          {/* Was "each module has clear inputs, expected outputs, and a
              downloadable Skill package" — the same spec vocabulary the
              module panels used to carry. Says what a reader gets instead. */}
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            A public preview of the founder workflow. Every module tells you
            what to bring, what you walk away with, and ships as a Skill you can
            download.
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
