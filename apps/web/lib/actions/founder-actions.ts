"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import { autoCompleteSetupModule } from "@ai-catalyst/services/module/auto-setup";
import { confirmModuleCompletion } from "@ai-catalyst/services/module/completion";
import { updateMyCompanyProfile } from "@ai-catalyst/services/company-profile";
import { updateMyProfile } from "@ai-catalyst/services/profile";
import { ServiceError } from "@ai-catalyst/services/errors";
import { getMcpConnectionStatus } from "@ai-catalyst/services/mcp-auth";
import {
  archiveVenture,
  createVenture,
  getVenture,
  updateVentureClaudeProjectId,
} from "@ai-catalyst/services/venture";
import {
  getOrCreateProgramRun,
  listRunModules,
} from "@ai-catalyst/services/workflow";
import {
  getActiveContext,
  setActiveVenture,
} from "@ai-catalyst/services/workspace/active-context";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import { errorCopy } from "@/app/(app)/lib/copy";
import { founderMessageForServiceError } from "@/lib/service-error-copy";
import { setProfilePromptSkipped } from "@/lib/profile-prompt-dismissal";
import {
  type EnsureRunResult,
  resolveNextModuleDestination,
} from "@/lib/ensure-program-destination";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function requireFounderActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  const actor = actorContextFromSession(session);
  if (actor.role !== "founder") {
    throw new ServiceError("FORBIDDEN", "Founder access required.");
  }
  return actor;
}

function toActionResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    // Log the real message, show the founder the mapped one — service copy
    // is written for whoever reads the logs, not for them.
    console.error("Service error in server action:", error.code, error.message);
    return { ok: false, message: founderMessageForServiceError(error) };
  }
  console.error("Unhandled server action error:", error);
  return { ok: false, message: errorCopy.generic };
}

/** Revalidate the (app) layout so sidebar shell data refreshes after mutations. */
function revalidateFounderAppShell() {
  revalidatePath("/dashboard", "layout");
}

/**
 * Records that the founder chose to move past the profile step. It gates
 * nothing — this only stops the dashboard asking again.
 */
export async function skipProfilePromptAction(): Promise<ActionResult> {
  try {
    await requireFounderActor();
    await setProfilePromptSkipped();
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateProfileAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await updateMyProfile(actor, input);
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateCompanyProfileAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await updateMyCompanyProfile(actor, input);
    revalidateFounderAppShell();
    revalidatePath("/company-profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function confirmModuleCompletionAction(
  programRunModuleId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await confirmModuleCompletion(actor, { programRunModuleId });
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Starts the first Attempt, resumes a live one, or opens a Retry after
 * validation_failed / rejected / cancelled. Omits basedOnAttemptId so the
 * Service picks the latest unused retryable source — callers must not invent IDs.
 */
export async function startModuleAttemptAction(
  programRunModuleId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await startOrResumeAttempt(actor, { programRunModuleId });
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * After Claude connects (or from Dashboard fallback): ensure the active
 * venture's Program Run exists, run the setup check server-side, then
 * return the next module destination.
 * Idempotent — never invents a venture or picks "first of many".
 */
export async function ensureActiveProgramDestinationAction(): Promise<EnsureRunResult> {
  try {
    const actor = await requireFounderActor();
    const connection = await getMcpConnectionStatus(actor);
    if (!connection.authorised) {
      revalidateFounderAppShell();
      return { status: "not_connected" };
    }

    const activeContext = await getActiveContext(actor);
    if (!activeContext.ventureId) {
      revalidateFounderAppShell();
      return { status: "no_active_venture" };
    }

    let venture;
    try {
      venture = await getVenture(actor, activeContext.ventureId);
    } catch (error) {
      if (error instanceof ServiceError && error.code === "NOT_FOUND") {
        revalidateFounderAppShell();
        return { status: "venture_unavailable" };
      }
      throw error;
    }

    if (!venture || venture.status === "archived") {
      revalidateFounderAppShell();
      return { status: "venture_unavailable" };
    }

    // The archived check above is a read, so a Venture archived between
    // then and now still reaches assertVentureWritable. The actor is
    // already known to be a Founder by this point, so FORBIDDEN here can
    // only mean the Venture — never a role failure.
    let run;
    try {
      ({ run } = await getOrCreateProgramRun(actor, { ventureId: venture.id }));
    } catch (error) {
      if (error instanceof ServiceError && error.code === "FORBIDDEN") {
        revalidateFounderAppShell();
        return { status: "venture_unavailable" };
      }
      throw error;
    }

    // Module 0 is completed here, on the server, instead of being handed to
    // the Founder as a step (see SHOW_SETUP_MODULE). It never throws for a
    // state it can encounter, so a failure is reported rather than caught.
    const setup = await autoCompleteSetupModule(actor, {
      programRunId: run.id,
    });
    if (setup.status === "failed") {
      console.error("Automatic setup module completion failed:", {
        runId: run.id,
        code: setup.code,
        reason: setup.reason,
      });
      revalidateFounderAppShell();
      return { status: "setup_failed" };
    }

    const runResult = await listRunModules(actor);
    const destination = resolveNextModuleDestination(runResult.modules);

    revalidateFounderAppShell();
    revalidatePath(destination);
    return { status: "ready", runId: run.id, destination };
  } catch (error) {
    if (error instanceof ServiceError) {
      console.error(
        "ensureActiveProgramDestinationAction service error:",
        error.code,
        error.message,
      );
      return { status: "error", message: founderMessageForServiceError(error) };
    }
    console.error("ensureActiveProgramDestinationAction failed:", error);
    return { status: "error", message: errorCopy.generic };
  }
}

export async function createVentureAction(input: {
  name: string;
  oneLiner?: string;
  summary?: string;
}): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await createVenture(actor, input);
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function setActiveVentureAction(
  ventureId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await setActiveVenture(actor, ventureId);
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function archiveVentureAction(
  ventureId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await archiveVenture(actor, ventureId);
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateVentureClaudeProjectAction(
  ventureId: string,
  claudeProjectId: string | null,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await updateVentureClaudeProjectId(actor, ventureId, {
      claudeProjectId,
    });
    revalidateFounderAppShell();
    revalidatePath("/workspace");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
