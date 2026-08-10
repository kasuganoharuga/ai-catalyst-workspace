import { cn } from "@/lib/utils";

import {
  moduleAccentStyle,
  type ModuleDisplayStatus,
  type StatusTone,
} from "../lib/module-display";

// Fill/outlined/flat grey distinguish states — lime solid = "do this next"; completed uses module accent (see "module" tone).
const TONE_CLASSES: Record<Exclude<StatusTone, "module">, string> = {
  muted: "bg-muted text-muted-foreground",
  outline: "border border-foreground/25 text-foreground",
  lime: "bg-primary text-primary-foreground",
  soft: "bg-accent text-accent-foreground",
  ink: "bg-surface-inverse text-surface-inverse-foreground",
  warning: "border border-destructive/40 text-destructive",
};

export function StatusBadge({
  status,
  // Required for the "module" tone, which paints the badge in that
  // module's identity colour. Falls back to ink when absent, so a badge
  // rendered outside a module context can never lose its contrast.
  moduleIndex,
  className,
}: {
  status: ModuleDisplayStatus;
  moduleIndex?: number;
  className?: string;
}) {
  const useModuleAccent = status.tone === "module" && moduleIndex !== undefined;
  const toneClass =
    status.tone === "module"
      ? useModuleAccent
        ? "text-white"
        : TONE_CLASSES.ink
      : TONE_CLASSES[status.tone];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        toneClass,
        className,
      )}
      style={useModuleAccent ? moduleAccentStyle(moduleIndex) : undefined}
    >
      {status.label}
    </span>
  );
}
