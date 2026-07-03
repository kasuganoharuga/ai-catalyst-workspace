import Link from "next/link";

import type { ToolkitModule } from "@ai-catalyst/shared";

type ModuleCardProps = {
  module: ToolkitModule;
};

export function ModuleCard({ module }: ModuleCardProps) {
  return (
    <article className="group rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-amber-700/40 hover:shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="rounded-full bg-stone-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-stone-50">
          Module {module.number}
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
          {module.status}
        </span>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
        {module.title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        {module.objective}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/toolkit/${module.id}`}
          className="rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
        >
          View module
        </Link>
        <Link
          href={`/downloads/${module.id}`}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-900 transition hover:border-stone-950"
        >
          Download Skill
        </Link>
      </div>
    </article>
  );
}
