import type { RunModuleSummary } from "@ai-catalyst/shared";

import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";

/**
 * Typed result from ensureActiveProgramDestinationAction — connection /
 * dashboard CTAs navigate from `ready.destination` only.
 */
export type EnsureRunResult =
  | { status: "ready"; runId: string; destination: string }
  | { status: "not_connected" }
  | { status: "no_active_venture" }
  | { status: "venture_unavailable" }
  // The Run exists and Claude is connected, but the server-side setup
  // check did not pass, so no module was opened. Distinct from a generic
  // error: nothing the Founder did is wrong, and retrying is the fix.
  | { status: "setup_failed" }
  | { status: "error"; message?: string };

export type NextModuleCandidate = Pick<
  RunModuleSummary,
  "moduleKey" | "status" | "moduleType"
>;

/**
 * True when this Run still has a setup Module that nobody has completed.
 *
 * A Run created before the setup Module was hidden still carries it, still
 * open, and every real Module after it stays locked behind it. With no UI
 * left pointing at Module 0, such a founder has no way forward at all —
 * they get "finish the previous module" about a module that no longer
 * appears anywhere. So this is what tells the UI to route them through
 * ensureActiveProgramDestinationAction (which completes it server-side)
 * instead of offering a plain link into a locked module.
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
 * First incomplete module wins: in_progress (incl. awaiting Confirm),
 * then available / ready_to_unlock. All done → dashboard.
 *
 * Setup modules are skipped while SHOW_SETUP_MODULE is off — they are
 * completed server-side by autoCompleteSetupModule before this runs, but
 * a Run whose setup check failed must not strand the Founder on a module
 * that has no UI entry point, so it is filtered here rather than relied
 * upon to always be `completed`.
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
    return `/modules/${actionable.moduleKey}`;
  }

  return "/dashboard";
}
