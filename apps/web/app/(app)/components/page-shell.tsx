import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

/** Content wrapper inside the app layout's single `<main>` landmark. */
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className={cn("mx-auto max-w-5xl px-6 py-14", className)}>
      {children}
    </div>
  );
}
