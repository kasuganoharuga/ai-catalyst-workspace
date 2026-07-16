import Link from "next/link";

import type { ModuleCatalogEntry } from "../types";
import { StatusPill } from "./status-pill";

export function ModuleCatalogCard({ module }: { module: ModuleCatalogEntry }) {
  return (
    <Link
      href={`/modules/${module.moduleKey}`}
      className="group rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-amber-700/40 hover:shadow-xl"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-950 text-sm font-semibold text-stone-50">
          {String(module.sequenceIndex).padStart(2, "0")}
        </span>
        <StatusPill status={module.catalogStatus} />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-stone-950">
        {module.title}
      </h2>
      {module.subtitle ? (
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {module.subtitle}
        </p>
      ) : null}
    </Link>
  );
}
