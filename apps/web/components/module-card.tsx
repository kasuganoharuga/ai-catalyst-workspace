import Link from "next/link";

import type { ToolkitModule } from "@ai-catalyst/shared";

type ModuleCardProps = {
  module: ToolkitModule;
};

export function ModuleCard({ module }: ModuleCardProps) {
  return (
    <article className="group rounded-[2rem] border border-border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:border-primary hover:shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary-foreground">
          Module {module.number}
        </span>
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">
          {module.status}
        </span>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {module.title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {module.objective}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/toolkit/${module.id}`}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
        >
          View module
        </Link>
        <Link
          href={`/downloads/${module.id}`}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-foreground"
        >
          Download Skill
        </Link>
      </div>
    </article>
  );
}
