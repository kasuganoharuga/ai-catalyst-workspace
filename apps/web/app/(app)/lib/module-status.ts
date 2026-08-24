import type { ModuleAttemptStatus, RunModuleStatus } from "@ai-catalyst/shared";

// Fill treatments, not hues — see status-badge.tsx. "module" resolves to the module accent at render time.
export type StatusTone =
  "muted" | "outline" | "lime" | "soft" | "ink" | "module" | "warning";

export interface ModuleDisplayStatus {
  label: string;
  tone: StatusTone;
}

const RUN_STATUS_DISPLAY: Record<RunModuleStatus, ModuleDisplayStatus> = {
  locked: { label: "Locked", tone: "muted" },
  inherited: { label: "Carried over", tone: "muted" },
  available: { label: "Ready to start", tone: "outline" },
  in_progress: { label: "In progress", tone: "lime" },
  ready_to_unlock: { label: "Almost there", tone: "outline" },
  completed: { label: "Completed", tone: "module" },
};

/** Attempt statuses that clear active_attempt_id and need a Retry to write again. */
const RETRYABLE_DISPLAY_STATUSES = new Set<ModuleAttemptStatus>([
  "validation_failed",
  "rejected",
  "cancelled",
]);

/** Module is startable but has no active attempt in a retryable terminal state. */
export function needsModuleRetry(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
  displayAttemptStatus: ModuleAttemptStatus | null | undefined,
): boolean {
  if (runStatus !== "available" && runStatus !== "in_progress") {
    return false;
  }
  if (activeAttemptStatus) {
    return false;
  }
  return (
    displayAttemptStatus != null &&
    RETRYABLE_DISPLAY_STATUSES.has(displayAttemptStatus)
  );
}

/**
 * Label for a module's current state. Active attempt status refines coarse run status
 * where it matters. Pass display attempt status when active_attempt_id is cleared.
 */
export function deriveModuleDisplayStatus(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
  displayAttemptStatus?: ModuleAttemptStatus | null,
): ModuleDisplayStatus {
  if (runStatus === "in_progress") {
    const attemptStatus = activeAttemptStatus ?? displayAttemptStatus ?? null;
    if (attemptStatus === "ready_for_review") {
      return { label: "Ready for review", tone: "ink" };
    }
    if (attemptStatus === "validation_failed") {
      return { label: "Needs another go", tone: "warning" };
    }
    if (attemptStatus === "rejected" || attemptStatus === "cancelled") {
      return { label: "Needs another go", tone: "warning" };
    }
    if (attemptStatus === "submitted") {
      return { label: "Checking your work", tone: "soft" };
    }
  }
  return RUN_STATUS_DISPLAY[runStatus];
}
