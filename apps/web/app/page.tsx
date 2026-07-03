import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { getToolkitModules } from "@/lib/toolkit";

export default async function Home() {
  const modules = await getToolkitModules();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
              Skill-first. Workspace-ready.
            </p>
            <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-stone-950 sm:text-7xl">
              A founder workflow toolkit built to become a platform.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-stone-700">
              AI Catalyst starts with structured, downloadable Skills that help
              founders pressure-test ideas, define sharper customers, and build
              validation-ready plans.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/toolkit"
                className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-800"
              >
                Browse modules
              </Link>
              <Link
                href="/downloads"
                className="rounded-full border border-stone-300 px-6 py-3 text-sm font-semibold text-stone-950 transition hover:border-stone-950"
              >
                Download Skills
              </Link>
            </div>
          </div>
          <div className="rounded-[2.5rem] border border-stone-200 bg-white p-8 shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-stone-500">
              V1 Scope
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <Metric label="Modules" value={modules.length.toString()} />
              <Metric label="Delivery" value="Skills" />
              <Metric label="Workspace" value="Planned" />
              <Metric label="AI API" value="Reserved" />
            </div>
          </div>
        </section>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            "Browse a staged founder workflow instead of a flat prompt library.",
            "Download Skill packages that are versioned with the content source.",
            "Keep a clean path toward saved workspaces, AI execution, and review flows.",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[2rem] border border-stone-200 bg-white/70 p-6 text-sm leading-6 text-stone-700"
            >
              {item}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-stone-100 p-5">
      <div className="text-3xl font-semibold tracking-tight text-stone-950">
        {value}
      </div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
        {label}
      </div>
    </div>
  );
}
