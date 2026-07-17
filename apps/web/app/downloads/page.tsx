import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { getToolkitModules } from "@/lib/toolkit";

export default async function DownloadsPage() {
  const modules = await getToolkitModules();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Toolkit preview · Skill downloads
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight">
            Download the current toolkit Skills.
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Each Skill ships as a structured Markdown package you can run in
            Claude or ChatGPT. Founders working inside the workspace complete
            these same modules through guided activities instead.
          </p>
        </div>
        <div className="mt-12 divide-y divide-border overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
          {modules.map((module) => (
            <div
              key={module.id}
              className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Module {module.number}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {module.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {module.objective}
                </p>
              </div>
              <Link
                href={`/downloads/${module.id}`}
                className="rounded-full bg-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground transition hover:brightness-95"
              >
                Download SKILL.md
              </Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
