import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Page-level kicker + h1 + optional intro. `kicker` is optional — when
 * omitted, the h1 loses its top margin too (there's nothing above it to
 * space away from). `introClassName` exists for the one caller
 * (founder-dashboard.tsx) whose intro caps its own width.
 */
export function PageHeader({
  kicker,
  title,
  intro,
  introClassName,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  introClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {kicker ? (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {kicker}
        </p>
      ) : null}
      <h1
        className={cn(
          "font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]",
          kicker ? "mt-4" : undefined,
        )}
      >
        {title}
      </h1>
      {intro ? (
        <p
          className={cn(
            "mt-3 text-[15px] leading-7 text-muted-foreground",
            introClassName,
          )}
        >
          {intro}
        </p>
      ) : null}
    </div>
  );
}
