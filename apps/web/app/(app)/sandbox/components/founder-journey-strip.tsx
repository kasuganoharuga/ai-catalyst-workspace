import { ChevronRight, FileText, Layers, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";

import { onboardingCopy } from "../../lib/copy";

/**
 * The same three-beat arc a Founder is shown in the first-run dialog, on
 * the Founder's own labels (onboardingCopy.welcomeJourney) rather than a
 * Mentor-facing paraphrase — this page is called "See what Founders see",
 * so the two must not be able to drift apart. Static: no sandbox state
 * reaches here, and none should. This page stays an explainer, not the
 * progress dashboard its header comment rules out.
 *
 * The markup mirrors JourneyNode/Arrow in
 * components/onboarding/welcome-step.tsx. Deliberately not yet extracted
 * into one shared component: that file renders inside the first-run
 * dialog, which has no screenshot coverage (scripts/capture-onboarding.ts
 * has no `firstrun` shot), so a shared component could not be shown to
 * leave it pixel-identical. Worth collapsing the moment that shot exists.
 */
export function FounderJourneyStrip() {
  const { start, middle, end } = onboardingCopy.welcomeJourney;

  return (
    <div className="flex items-stretch gap-1 rounded-lg border border-border bg-muted/40 p-4">
      <JourneyNode icon={Lightbulb} label={start} />
      <Arrow />
      <JourneyNode icon={Layers} label={middle} />
      <Arrow />
      <JourneyNode icon={FileText} label={end} accent />
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
