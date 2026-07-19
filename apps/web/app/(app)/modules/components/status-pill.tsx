import { cn } from "@/lib/utils";

import type { ModuleCatalogStatus } from "../types";

const STATUS_LABEL: Record<ModuleCatalogStatus, string> = {
  live: "Open",
  coming_soon: "Coming soon",
};

// Catalogue-level publication state, shown only when the Founder has no
// Run state for this module yet. Same metrics as StatusBadge so the two
// are interchangeable in a card header.
export function StatusPill({ status }: { status: ModuleCatalogStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        status === "live"
          ? "border border-foreground/25 text-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
