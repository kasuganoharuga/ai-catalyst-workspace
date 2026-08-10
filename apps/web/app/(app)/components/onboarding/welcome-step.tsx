"use client";

import { ChevronRight, FileText, Layers, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { onboardingCopy } from "../../lib/copy";

/**
 * Orientation only — nothing persisted. Visual journey arc instead of prose;
 * the end node is lime because it is what the founder is here for.
 */
export function WelcomeStep({ onDone }: { onDone: () => void }) {
  const { start, middle, end } = onboardingCopy.welcomeJourney;

  return (
    <div className="space-y-6">
      <div className="flex items-stretch gap-1 rounded-lg border border-border bg-muted/40 p-4">
        <JourneyNode icon={Lightbulb} label={start} />
        <Arrow />
        <JourneyNode icon={Layers} label={middle} />
        <Arrow />
        <JourneyNode icon={FileText} label={end} accent />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button type="button" onClick={onDone}>
          {onboardingCopy.welcomeCta}
        </Button>
        <p className="text-sm text-muted-foreground">
          {onboardingCopy.welcomeSetupNote}
        </p>
      </div>
    </div>
  );
}

function JourneyNode({
  icon: Icon,
  label,
  accent = false,
}: {
  icon: typeof Lightbulb;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          accent
            ? "bg-brand-lime text-brand-lime-foreground"
            : "border border-border bg-card text-muted-foreground",
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <span
        className={cn(
          "text-xs leading-4",
          accent ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Aligned with icons, not labels. */
function Arrow() {
  return (
    <ChevronRight
      aria-hidden="true"
      className="mt-2.5 h-4 w-4 shrink-0 self-start text-muted-foreground/40"
    />
  );
}
