import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ModuleAttemptStatus } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import {
  completeModuleAttempt,
  confirmModuleCompletion,
  type NextModuleUnlocked,
} from "@ai-catalyst/services/module/completion";

// Runs the setup Module (Module 0) to completion on the Founder's behalf,
// server-side, so they never see it.
//
// Why this is not "skipping a step": Module 0 has no questions and
// `completion_mode = 'system'`, and its one Artifact is rendered entirely
// by renderSetupSummaryMarkdown from facts the platform already knows —
// workspace, venture, run, and the outcome of a real storage write /
// read-back / hash check. There is nothing in it for a Founder to decide,
// so asking them to open Claude, wait for a document about their own
// storage configuration, read it, and press Confirm was pure ceremony.
// The checks themselves still happen here, through exactly the same
// Attempt → submit → official validation → confirm path a Founder-driven
// completion takes; only the human round trip is gone.
//
// Deliberately never throws for a state it can reasonably encounter.
// This runs inline on the "open my programme" path, and a founder who has
// just connected Claude must not be blocked by a setup summary failing to
// render — the caller decides whether a failure is worth surfacing. Real
// auth failures (no founder role, no workspace) still propagate, because
// those mean the caller had no business making the call.

export type AutoSetupResult =
  // Completed by this call. `nextModuleUnlocked` is what the Founder
  // should actually land on.
  | {
      status: "completed";
      programRunModuleId: string;
      nextModuleUnlocked: NextModuleUnlocked | null;
    }
  // Already done before this call — the common case on every visit after
  // the first. Not an error, and not worth re-running.
  | { status: "already_completed"; programRunModuleId: string }
  // This Run has no setup Module at all (a Program Version published
  // without one). Nothing to do.
  | { status: "not_applicable" }
  // Something went wrong that the Founder may need to know about. `reason`
  // is diagnostic text for logs, not copy to show verbatim.
  | { status: "failed"; reason: string; code: string | null };

export interface AutoCompleteSetupModuleInput {
  programRunId: string;
}

interface SetupRunModuleRow {
  id: string;
  status: string;
  active_attempt_id: string | null;
}

// Attempt statuses from which no further progress can be made without
// opening a new Attempt. `validation_failed` is included: the Attempt is
// finished, it just finished badly.
const TERMINAL_ATTEMPT_STATUSES: ReadonlySet<ModuleAttemptStatus> = new Set([
  "accepted",
  "rejected",
  "cancelled",
  "validation_failed",
]);

// Scoped to the Run's active Branch: a Run that has been branched has more
// than one snapshot of Module 0, and only the live one matters. The
// `active_branch_id is null` arm covers the window inside
// getOrCreateProgramRun where the Branch rows exist but the Run has not
// been pointed at one yet.
async function loadSetupRunModule(
  programRunId: string,
  workspaceId: string,
): Promise<SetupRunModuleRow | null> {
  const result = await pool.query<SetupRunModuleRow>(
    `select m.id, m.status, m.active_attempt_id
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     join program_runs r on r.id = m.program_run_id
     where m.program_run_id = $1
       and m.workspace_id = $2
       and d.module_type = 'setup'
       and (r.active_branch_id is null or m.program_run_branch_id = r.active_branch_id)
     order by m.sequence_index
     limit 1`,
    [programRunId, workspaceId],
  );
  return result.rows[0] ?? null;
}

async function loadAttemptStatus(
  attemptId: string,
  workspaceId: string,
): Promise<ModuleAttemptStatus | null> {
  const result = await pool.query<{ status: ModuleAttemptStatus }>(
    `select status from module_attempts where id = $1 and workspace_id = $2`,
    [attemptId, workspaceId],
  );
  return result.rows[0]?.status ?? null;
}

/**
 * Completes this Run's setup Module without Founder involvement, and
 * returns what it unlocked.
 *
 * Idempotent at every stage, because it runs on a path the Founder can
 * re-enter freely (refresh, second tab, clicking Continue twice): an
 * already-completed Module short-circuits, an in-flight Attempt is resumed
 * rather than duplicated, and both `completeModuleAttempt` and
 * `confirmModuleCompletion` have their own replay short-circuits.
 */
export async function autoCompleteSetupModule(
  actor: ActorContext,
  input: AutoCompleteSetupModuleInput,
): Promise<AutoSetupResult> {
  assertRole(actor, ["founder"]);
  const programRunId = parseEntityIdOrNotFound(
    input.programRunId,
    "Program Run not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const runModule = await loadSetupRunModule(programRunId, workspace.id);
  if (!runModule) {
    return { status: "not_applicable" };
  }
  if (runModule.status === "completed") {
    return { status: "already_completed", programRunModuleId: runModule.id };
  }
  // 'locked' or 'inherited' on a sequence-index-0 Module means the Run was
  // built by something other than getOrCreateProgramRun. Report it rather
  // than trying to force it open.
  if (runModule.status !== "available" && runModule.status !== "in_progress") {
    return {
      status: "failed",
      reason: `Setup module is "${runModule.status}", which cannot be started.`,
      code: "RUN_MODULE_NOT_AVAILABLE",
    };
  }

  try {
    let attemptId = runModule.active_attempt_id;
    let attemptStatus = attemptId
      ? await loadAttemptStatus(attemptId, workspace.id)
      : null;

    // No live Attempt to work with — open one. startOrResumeAttempt covers
    // both the first-ever Initial Attempt and the Retry-after-failure case,
    // and picks its own retry source, so there is nothing to decide here.
    if (
      attemptId === null ||
      attemptStatus === null ||
      TERMINAL_ATTEMPT_STATUSES.has(attemptStatus)
    ) {
      const started = await startOrResumeAttempt(actor, {
        programRunModuleId: runModule.id,
      });
      attemptId = started.attempt.id;
      attemptStatus = started.attempt.status;
    }

    // Already validated and waiting on a signature — skip straight to it.
    // Re-running completeModuleAttempt here would be harmless but pointless.
    if (attemptStatus !== "ready_for_review") {
      const completion = await completeModuleAttempt(actor, { attemptId });
      if (!completion.passed) {
        const detail = [
          ...completion.missingArtifactKeys.map(
            (key) => `missing artifact "${key}"`,
          ),
          ...completion.validationErrors.map((error) => error.message),
        ].join("; ");
        return {
          status: "failed",
          reason: detail || "Setup checks did not pass.",
          code: "VALIDATION_ERROR",
        };
      }
    }

    const confirmation = await confirmModuleCompletion(actor, {
      programRunModuleId: runModule.id,
    });
    return {
      status: "completed",
      programRunModuleId: runModule.id,
      nextModuleUnlocked: confirmation.nextModuleUnlocked,
    };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { status: "failed", reason: error.message, code: error.code };
    }
    // An unexpected failure here is a platform problem, not the Founder's
    // — log it with enough context to find the Run, and let the caller
    // degrade gracefully.
    console.error("autoCompleteSetupModule failed", {
      programRunId,
      programRunModuleId: runModule.id,
      error,
    });
    return {
      status: "failed",
      reason: "Setup could not be completed automatically.",
      code: null,
    };
  }
}
