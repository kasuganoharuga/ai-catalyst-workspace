import Link from "next/link";

import type { ModuleCatalogEntry, ModuleContext } from "@ai-catalyst/shared";

import { cn } from "@/lib/utils";

import { StatusBadge } from "../../components/status-badge";
import {
  deriveModuleDisplayStatus,
  moduleAccentStyle,
} from "../../lib/module-display";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

/**
 * One Module's live status card (design frames H2/H7's "modcard"): status
 * badge, what it produces, whether that output is saved, and when the
 * module was completed. `context` is null before the Founder's Run
 * exists — the card then renders from catalog data alone.
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
  const displayAttemptStatus = context?.displayAttempt?.status ?? null;
  const display = runModule
    ? deriveModuleDisplayStatus(
        runModule.status,
        attemptStatus,
        displayAttemptStatus,
      )
    : { label: "Waiting for setup", tone: "muted" as const };

  const isLocked = runModule?.status === "locked";
  const isCompleted = runModule?.status === "completed";
  const primaryArtifact = context?.artifacts[0] ?? null;
  const catalogArtifact = catalog.expectedArtifacts[0] ?? null;
  const savedSubmission = primaryArtifact?.latestSubmission ?? null;
  const effectiveAttemptStatus = attemptStatus ?? displayAttemptStatus;

  const isSetupModule = catalog.moduleType === "setup";
  const completedAt = runModule?.completedAt ?? null;

  const footHint = (() => {
    if (!runModule) return "Opens once your program is set up";
    switch (runModule.status) {
      case "locked":
        return "Opens when the module before it is done";
      case "available":
        return isSetupModule
          ? "About five minutes, all in Claude"
          : "Open — start it in Claude whenever you're ready";
      case "in_progress":
        if (effectiveAttemptStatus === "ready_for_review")
          return "Verdict saved — mentor review comes next";
        if (
          effectiveAttemptStatus === "validation_failed" ||
          effectiveAttemptStatus === "rejected" ||
          effectiveAttemptStatus === "cancelled"
        )
          return "Needs another go — open the module to run it again";
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
    <Link
      href={`/modules/${catalog.moduleKey}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-foreground/30",
        isLocked && "opacity-60",
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Identity, not status: the badge always wears the module's
                own colour so it stays recognisable in every state, and
                the pill to the right is what reports progress. */}
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums text-white"
              style={moduleAccentStyle(catalog.sequenceIndex)}
            >
              {isCompleted
                ? "✓"
                : String(catalog.sequenceIndex).padStart(2, "0")}
            </span>
            <p className="text-[15px] font-semibold tracking-tight text-foreground">
              {catalog.title}
            </p>
          </div>
          <StatusBadge status={display} moduleIndex={catalog.sequenceIndex} />
        </div>

        <dl className="mt-4 space-y-0 text-[13px]">
          <div className="flex items-center justify-between gap-4 border-t border-border/70 py-2.5">
            <dt className="text-muted-foreground">Produces</dt>
            <dd className="text-right font-medium text-foreground">
              {primaryArtifact?.name ?? catalogArtifact?.name ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/70 py-2.5">
            <dt className="text-muted-foreground">Saved</dt>
            <dd className="text-right">
              {savedSubmission ? (
                <span className="font-mono text-xs tabular-nums text-foreground">
                  v{savedSubmission.versionNumber}
                </span>
              ) : (
                <span className="text-muted-foreground">Not yet</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/70 py-2.5">
            <dt className="text-muted-foreground">Completed</dt>
            <dd className="text-right">
              {completedAt ? (
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {formatDate(completedAt)}
                </span>
              ) : (
                <span className="text-muted-foreground">Not yet</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-auto border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
        {footHint}
      </p>
    </Link>
  );
}
