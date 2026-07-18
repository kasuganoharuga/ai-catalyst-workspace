import Link from "next/link";

import { cn } from "@/lib/utils";

export interface SetupStep {
  title: string;
  description: string;
  done: boolean;
  href: string | null;
}

/**
 * The dashboard's "getting started" strip (design frame H2), driven by
 * real state: MCP connection, Module 0 completion, Module 1 unlock and
 * verdict. The first not-done step is highlighted as "you are here".
 */
export function SetupStepper({ steps }: { steps: SetupStep[] }) {
  const currentIndex = steps.findIndex((step) => !step.done);

  return (
    <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Getting started
      </p>
      <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isUpcoming = !step.done && !isCurrent;
          const content = (
            <li
              className={cn("flex gap-3", isUpcoming && "opacity-50")}
              key={step.title}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold",
                  step.done && "bg-accent text-accent-foreground",
                  isCurrent && "bg-surface-inverse text-brand-lime",
                  isUpcoming && "bg-muted text-muted-foreground",
                )}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {step.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {step.description}
                </p>
                {isCurrent && step.href ? (
                  <Link
                    href={step.href}
                    className="mt-2 inline-block text-xs font-semibold text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Go to this step
                  </Link>
                ) : null}
              </div>
            </li>
          );
          return content;
        })}
      </ol>
    </div>
  );
}
