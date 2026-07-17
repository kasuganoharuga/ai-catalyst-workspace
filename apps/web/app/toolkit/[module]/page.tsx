import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import {
  getModuleMarkdown,
  getToolkitModule,
  getToolkitModules,
} from "@/lib/toolkit";

type ModuleDetailPageProps = {
  params: Promise<{
    module: string;
  }>;
};

export async function generateStaticParams() {
  const modules = await getToolkitModules();

  return modules.map((module) => ({
    module: module.id,
  }));
}

export default async function ModuleDetailPage({
  params,
}: ModuleDetailPageProps) {
  const { module: moduleId } = await params;
  const toolkitModule = await getToolkitModule(moduleId);

  if (!toolkitModule) {
    notFound();
  }

  const markdown = await getModuleMarkdown(toolkitModule);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <Link
          href="/toolkit"
          className="text-sm font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Back to toolkit
        </Link>
        <section className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Module {toolkitModule.number}
            </p>
            <h1 className="mt-5 text-5xl font-semibold tracking-tight">
              {toolkitModule.title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
              {toolkitModule.objective}
            </p>
            <div className="mt-10 rounded-[2rem] border border-border bg-card p-8 shadow-sm">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-muted-foreground">
                {markdown}
              </pre>
            </div>
          </div>
          <aside className="space-y-6">
            <Panel title="Founder inputs" items={toolkitModule.founderInputs} />
            <Panel title="Expected outputs" items={toolkitModule.outputs} />
            <Link
              href={`/downloads/${toolkitModule.id}`}
              className="block rounded-full bg-primary px-6 py-3 text-center text-sm font-semibold text-primary-foreground transition hover:brightness-95"
            >
              Download Skill
            </Link>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="rounded-2xl bg-muted px-4 py-3">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
