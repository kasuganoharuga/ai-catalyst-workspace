import type { RunModuleSummary } from "@ai-catalyst/shared";

import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";

/** Result from ensureActiveProgramDestinationAction — CTAs navigate from `ready.destination`. */
export type EnsureRunResult =
  | { status: "ready"; runId: string; destination: string }
  | { status: "not_connected" }
  | { status: "no_active_venture" }
  | { status: "venture_unavailable" }
  | { status: "setup_failed" }
  | { status: "error"; message?: string };

export type NextModuleCandidate = Pick<
  RunModuleSummary,
  "moduleKey" | "status" | "moduleType"
>;

/**
 * True when this run still has an incomplete setup module.
 *
 * Without UI for Module 0, founders would be stuck behind an invisible gate —
 * route through ensureActiveProgramDestinationAction instead.
 */
export function hasPendingSetupModule(
  modules: Pick<RunModuleSummary, "status" | "moduleType">[],
): boolean {
  if (SHOW_SETUP_MODULE) {
    return false;
  }
  return modules.some(
    (module) => module.moduleType === "setup" && module.status !== "completed",
  );
}

/**
 * First incomplete module wins; all done → dashboard.
 *
 * Setup modules skipped while SHOW_SETUP_MODULE is off (completed server-side).
 */
export function resolveNextModuleDestination(
  modules: NextModuleCandidate[],
): string {
  const candidates = SHOW_SETUP_MODULE
    ? modules
    : modules.filter((module) => module.moduleType !== "setup");

  const actionable =
    candidates.find((module) => module.status === "in_progress") ??
    candidates.find(
      (module) =>
        module.status === "available" || module.status === "ready_to_unlock",
    );

  if (actionable) {
    return `/modules/${encodeURIComponent(actionable.moduleKey)}`;
  }

  return "/dashboard";
}
