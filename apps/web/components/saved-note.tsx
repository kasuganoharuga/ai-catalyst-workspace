import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Thin display shell for a save confirmation — each caller decides when to show it and what it says. */
export function SavedNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </span>
  );
}
