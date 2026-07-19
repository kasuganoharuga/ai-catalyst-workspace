import Link from "next/link";

import { cn } from "@/lib/utils";

export interface SetupStep {
  title: string;
  description: string;
  done: boolean;
  href: string | null;
}

/**
 * The programme's opening stretch, drawn as a hairline track rather than
 * a panel: it is orientation, not an action, so it should read as the
 * lightest thing on the page. The single dark element on the dashboard
 * is the next-action card below — this one stays quiet.
 */
export function SetupStepper({ steps }: { steps: SetupStep[] }) {
  const doneCount = steps.filter((step) => step.done).length;
  const currentIndex = steps.findIndex((step) => !step.done);
  const progress = (doneCount / steps.length) * 100;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Getting started
        </p>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {doneCount} of {steps.length}
        </p>
      </div>

      <div className="mt-3 h-px w-full bg-border">
        <div
          className="h-px bg-foreground transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li key={step.title} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold tabular-nums",
                  step.done && "bg-foreground text-background",
                  isCurrent && "border border-foreground text-foreground",
                  !step.done && !isCurrent && "text-muted-foreground",
                )}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[13px] font-semibold",
                    step.done || isCurrent
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {step.description}
                </p>
                {isCurrent && step.href ? (
                  <Link
                    href={step.href}
                    className="mt-1.5 inline-block text-xs font-semibold text-foreground underline underline-offset-4"
                  >
                    Go to this step
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
