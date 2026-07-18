import { cn } from "@/lib/utils";

import type { ModuleDisplayStatus, StatusTone } from "../lib/module-display";

const TONE_CLASSES: Record<StatusTone, string> = {
  muted: "bg-muted text-muted-foreground",
  accent: "bg-accent text-accent-foreground",
  ink: "bg-surface-inverse text-surface-inverse-foreground",
  warning: "bg-destructive/10 text-destructive",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ModuleDisplayStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]",
        TONE_CLASSES[status.tone],
        className,
      )}
    >
      {status.label}
    </span>
  );
}
