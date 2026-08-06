import Link from "next/link";

import { cn } from "@/lib/utils";

import { StatusBadge } from "../../components/status-badge";
import {
  moduleAccentStyle,
  type ModuleDisplayStatus,
} from "../../lib/module-display";
import type { ModuleCatalogEntry } from "../types";
import { StatusPill } from "./status-pill";

export function ModuleCatalogCard({
  module,
  runStatus,
}: {
  module: ModuleCatalogEntry;
  // The Founder's live Run state for this Module, when a Run exists —
  // takes precedence over the catalog-level live/coming-soon pill.
  runStatus?: ModuleDisplayStatus;
}) {
  const isComingSoon = module.catalogStatus === "coming_soon";
  const artifact = module.expectedArtifacts[0] ?? null;

  return (
    <Link
      href={`/modules/${encodeURIComponent(module.moduleKey)}`}
      className={cn(
        "group flex flex-col rounded-xl border border-border bg-card p-5 transition hover:border-foreground/30",
        isComingSoon && "opacity-70 hover:opacity-100",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Circular to match the pill beside it — the two are the card's
            only shaped elements, so they share one shape language. */}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums text-white"
          style={moduleAccentStyle(module.sequenceIndex)}
        >
          {String(module.sequenceIndex).padStart(2, "0")}
        </span>
        {runStatus ? (
          <StatusBadge status={runStatus} moduleIndex={module.sequenceIndex} />
        ) : (
          <StatusPill status={module.catalogStatus} />
        )}
      </div>

      <h2 className="mt-4 font-serif text-lg font-medium leading-snug tracking-[-0.01em] text-foreground">
        {module.title}
      </h2>
      {module.subtitle ? (
        <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
          {module.subtitle}
        </p>
      ) : null}

      {artifact ? (
        <p className="mt-auto flex items-baseline gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
          <span className="shrink-0">Produces</span>
          <span className="min-w-0 truncate font-medium text-foreground">
            {artifact.name}
          </span>
        </p>
      ) : null}
    </Link>
  );
}
