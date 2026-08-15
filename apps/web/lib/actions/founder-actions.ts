"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import { autoCompleteSetupModule } from "@ai-catalyst/services/module/auto-setup";
import { confirmModuleCompletion } from "@ai-catalyst/services/module/completion";
import { resetModuleProgress } from "@ai-catalyst/services/module/reset";
import { isModuleResetAllowed } from "@ai-catalyst/services/module/reset-allowed";
import { updateMyCompanyProfile } from "@ai-catalyst/services/company-profile";
import {
  hasChangedInvitationPassword,
  setPreferredAiProvider,
} from "@ai-catalyst/services/profile";
import { ServiceError } from "@ai-catalyst/services/errors";
import {
  getMcpConnectionStatus,
  revokeMcpConnectionForUser,
} from "@ai-catalyst/services/mcp-auth";
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
import { firstZodMessage } from "@/lib/validation/common";
import { updateCompanyProfileInputSchema } from "@/lib/validation/company-profile";
import { createVentureInputSchema } from "@/lib/validation/venture";
import {
  type EnsureRunResult,
  resolveNextModuleDestination,
} from "@/lib/ensure-program-destination";
import { webLog } from "@/lib/web-logger";

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
    webLog.error({
      event: "web_service_action_error",
      message: "Service error in founder server action",
      code: error.code,
      detail: error.message,
    });
    return { ok: false, message: founderMessageForServiceError(error) };
  }
  webLog.error({
    event: "web_unhandled_action_error",
    message: "Unhandled founder server action error",
    error_name: error instanceof Error ? error.name : typeof error,
  });
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

/**
 * Revokes every MCP access token for this Founder.
 * Claude-side disconnect does not reach our DB — this is the only path that clears server-side grants.
 */
export async function revokeMcpConnectionAction(): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await revokeMcpConnectionForUser(actor);
    revalidateFounderAppShell();
    revalidatePath("/connection");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

// Mirrors Better Auth's emailAndPassword floor and password-change-form.tsx.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Sets the invitation password without asking for the current one.
 * Only allowed while `hasChangedInvitationPassword` is false — weaker than change-password, so gated to first-run.
 * Does not revoke other sessions; sign-out mid-dialog is worse than a fresh account keeping this session.
 */
export async function setInitialPasswordAction(
  newPassword: unknown,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();

    if (await hasChangedInvitationPassword(actor)) {
      throw new ServiceError(
        "FORBIDDEN",
        "Initial password can only be set while the invitation password is still in use.",
      );
    }

    if (
      typeof newPassword !== "string" ||
      newPassword.length < MIN_PASSWORD_LENGTH
    ) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }

    // Same adapter calls as Better Auth's reset-password route (correct hash format).
    const authContext = await auth.$context;
    await authContext.internalAdapter.updatePassword(
      actor.userId,
      await authContext.password.hash(newPassword),
    );

    // auth.ts account.update hook skips this path — revoke MCP grants here to match password-change behaviour.
    await revokeMcpConnectionForUser(actor);

    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Records the founder's preferred AI assistant.
 * Does not redirect — `redirect()` throws and would be caught below; caller navigates on `{ ok: true }`.
 */
export async function setPreferredAiProviderAction(
  provider: unknown,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await setPreferredAiProvider(actor, provider);
    revalidateFounderAppShell();
    revalidatePath("/connection");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateCompanyProfileAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateCompanyProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }

  try {
    const actor = await requireFounderActor();
    await updateMyCompanyProfile(actor, parsed.data);
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
 * Testing convenience (disabled only when APP_ENV is production): wipes this Module's attempts,
 * confirmed Responses, artefacts and prep material — and every Module
 * after it in the same Run, since their availability depended on this
 * one having been completed — back to never-started.
 * `resetModuleProgress` itself also refuses in production; this check
 * is the first line of defence so the button's existence never depends
 * on remembering the second one.
 */
export async function resetModuleProgressAction(
  programRunModuleId: string,
): Promise<ActionResult> {
  if (!isModuleResetAllowed()) {
    return {
      ok: false,
      message:
        "Resetting a module is a testing tool and is disabled in production.",
    };
  }
  try {
    const actor = await requireFounderActor();
    await resetModuleProgress(actor, programRunModuleId);
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

    // FORBIDDEN here means archived venture, not role failure (Founder already verified).
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

    // Module 0 auto-completes server-side (SHOW_SETUP_MODULE); failures are reported, not thrown.
    const setup = await autoCompleteSetupModule(actor, {
      programRunId: run.id,
    });
    if (setup.status === "failed") {
      webLog.error({
        event: "web_setup_module_failed",
        message: "Automatic setup module completion failed",
        run_id: run.id,
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
      webLog.error({
        event: "web_ensure_program_destination_error",
        message: "ensureActiveProgramDestinationAction service error",
        code: error.code,
        detail: error.message,
      });
      return { status: "error", message: founderMessageForServiceError(error) };
    }
    webLog.error({
      event: "web_ensure_program_destination_error",
      message: "ensureActiveProgramDestinationAction failed",
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return { status: "error", message: errorCopy.generic };
  }
}

export async function createVentureAction(input: {
  name: string;
  oneLiner?: string;
  summary?: string;
}): Promise<ActionResult> {
  const parsed = createVentureInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }

  try {
    const actor = await requireFounderActor();
    await createVenture(actor, {
      name: parsed.data.name,
      oneLiner: parsed.data.oneLiner ?? undefined,
      summary: parsed.data.summary ?? undefined,
    });
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
