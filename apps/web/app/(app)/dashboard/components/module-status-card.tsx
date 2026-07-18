import Link from "next/link";

import type { ModuleCatalogEntry, ModuleContext } from "@ai-catalyst/shared";

import { cn } from "@/lib/utils";

import { StatusBadge } from "../../components/status-badge";
import { deriveModuleDisplayStatus } from "../../lib/module-display";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

/**
 * One Module's live status card (design frames H2/H7's "modcard"): status
 * badge, what it produces, whether that output is saved, and where review
 * stands. `context` is null before the Founder's Run exists — the card
 * then renders from catalog data alone, in its pre-setup state.
 */
export function ModuleStatusCard({
  catalog,
  context,
}: {
  catalog: ModuleCatalogEntry;
  context: ModuleContext | null;
}) {
  const runModule = context?.runModule ?? null;
  const attemptStatus = context?.activeAttempt?.status ?? null;
  const display = runModule
    ? deriveModuleDisplayStatus(runModule.status, attemptStatus)
    : { label: "Waiting for setup", tone: "muted" as const };

  const isLocked = runModule?.status === "locked";
  const isCompleted = runModule?.status === "completed";
  const primaryArtifact = context?.artifacts[0] ?? null;
  const catalogArtifact = catalog.expectedArtifacts[0] ?? null;
  const savedSubmission = primaryArtifact?.latestSubmission ?? null;

  const isSetupModule = catalog.moduleType === "setup";
  const reviewText = isSetupModule
    ? isCompleted
      ? "Checked automatically ✓"
      : "Checked automatically"
    : attemptStatus === "ready_for_review" || isCompleted
      ? null // rendered as a badge below instead
      : "After your verdict is saved";

  const footHint = (() => {
    if (!runModule) return "Appears once your module plan is set up";
    switch (runModule.status) {
      case "locked":
        return "Unlocks when the module before it is done";
      case "available":
        return isSetupModule
          ? "About 5 minutes, all in Claude"
          : "Unlocked — run it in Claude when you're ready";
      case "in_progress":
        if (attemptStatus === "ready_for_review")
          return "Verdict saved — mentor review comes next";
        if (attemptStatus === "validation_failed")
          return "Nearly there — Claude can help you fix the gaps";
        return "In progress — pick it up in Claude anytime";
      case "completed":
        return runModule.completedAt
          ? `Completed ${formatDate(runModule.completedAt)}`
          : "Completed";
      default:
        return null;
    }
  })();

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm",
        isLocked && "opacity-70",
      )}
    >
      <div className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold",
                isCompleted
                  ? "bg-accent text-accent-foreground"
                  : runModule && runModule.status !== "locked"
                    ? "bg-surface-inverse text-brand-lime"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {isCompleted
                ? "✓"
                : String(catalog.sequenceIndex).padStart(2, "0")}
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight text-foreground">
                {catalog.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Module {catalog.sequenceIndex}
              </p>
            </div>
          </div>
          <StatusBadge status={display} />
        </div>

        <dl className="mt-5 text-sm">
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">Produces</dt>
            <dd className="text-right font-semibold text-foreground">
              {primaryArtifact?.name ?? catalogArtifact?.name ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/60 py-2">
            <dt className="text-muted-foreground">Saved to workspace</dt>
            <dd className="text-right">
              {savedSubmission ? (
                <StatusBadge
                  status={{
                    label: `Saved · v${savedSubmission.versionNumber}`,
                    tone: "accent",
                  }}
                />
              ) : (
                <span className="text-muted-foreground">Not yet</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/60 py-2">
            <dt className="text-muted-foreground">Review</dt>
            <dd className="text-right">
              {reviewText ? (
                <span className="text-muted-foreground">{reviewText}</span>
              ) : (
                <StatusBadge
                  status={{ label: "Ready for review", tone: "ink" }}
                />
              )}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/40 px-6 py-4">
        <p className="text-xs text-muted-foreground">{footHint}</p>
        <Link
          href={`/modules/${catalog.moduleKey}`}
          className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          View module
        </Link>
      </div>
    </div>
  );
}
