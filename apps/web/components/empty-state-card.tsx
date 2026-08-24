import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyStateCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-6 py-14 text-center",
        className,
      )}
    >
      {children}
    </div>
  );
}
