import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ErrorBanner({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive",
        className,
      )}
    >
      {children}
    </p>
  );
}
