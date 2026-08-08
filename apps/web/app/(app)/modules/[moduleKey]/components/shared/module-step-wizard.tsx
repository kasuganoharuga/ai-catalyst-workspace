"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ModuleAccent } from "../../types";

export type WizardStep = { label: string; done: boolean };

/** Tab bar + Back/Next footer shared by both modules' step orchestrators. */
export function ModuleStepWizard({
  steps,
  active,
  onActiveChange,
  accent,
  children,
  nextDisabled = false,
}: {
  steps: WizardStep[];
  active: number;
  onActiveChange: (index: number) => void;
  accent: ModuleAccent;
  children: ReactNode;
  /** Soft-lock Next without hiding later steps in the rail. */
  nextDisabled?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ol className="flex divide-x divide-border border-b border-border">
        {steps.map((step, index) => (
          <li key={step.label} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onActiveChange(index)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-3 text-left transition sm:px-4",
                index === active ? "bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold tabular-nums",
                  step.done
                    ? "text-white"
                    : index === active
                      ? "border border-foreground text-foreground"
                      : "border border-border text-muted-foreground",
                )}
                style={step.done ? accent : undefined}
              >
                {step.done ? (
                  <Check
                    aria-hidden="true"
                    className="h-3 w-3"
                    strokeWidth={3}
                  />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "hidden truncate text-[13px] sm:block",
                  index === active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="p-6 lg:p-8">
        {children}

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onActiveChange(Math.max(0, active - 1))}
            disabled={active === 0}
          >
            Back
          </Button>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {active + 1} / {steps.length}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onActiveChange(Math.min(steps.length - 1, active + 1))
            }
            disabled={active === steps.length - 1 || nextDisabled}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
