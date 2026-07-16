import { cn } from "@/lib/utils";

import type { ModuleCatalogStatus } from "../types";

const STATUS_LABEL: Record<ModuleCatalogStatus, string> = {
  live: "Live",
  coming_soon: "Coming soon",
};

export function StatusPill({ status }: { status: ModuleCatalogStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
        status === "live"
          ? "bg-lime-100 text-lime-800"
          : "bg-stone-100 text-stone-500",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
