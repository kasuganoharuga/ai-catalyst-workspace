import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { getToolkitModules } from "@/lib/toolkit";

export default async function DownloadsPage() {
  const modules = await getToolkitModules();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
            Skill downloads
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em]">
            Download the current toolkit Skills.
          </h1>
          <p className="mt-6 text-lg leading-8 text-stone-700">
            V1 exposes each Skill as a structured Markdown package. Later
            versions can move the same workflow logic into the founder
            workspace.
          </p>
        </div>
        <div className="mt-12 divide-y divide-stone-200 overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          {modules.map((module) => (
            <div
              key={module.id}
              className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Module {module.number}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {module.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {module.objective}
                </p>
              </div>
              <Link
                href={`/downloads/${module.id}`}
                className="rounded-full bg-amber-700 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-amber-800"
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
