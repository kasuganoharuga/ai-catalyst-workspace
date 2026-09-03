import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Uppercase label + optional right-aligned meta, above a list. Callers
 * differ on margin-top and whether a `border-t` separates it from the
 * block above (invitations/page.tsx has neither), so those live in
 * `className` rather than a fixed default.
 */
export function SectionHeaderRow({
  label,
  meta,
  className,
}: {
  label: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      {meta ? (
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {meta}
        </p>
      ) : null}
    </div>
  );
}
