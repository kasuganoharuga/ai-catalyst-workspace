"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import { autoCompleteSetupModule } from "@ai-catalyst/services/module/auto-setup";
import { confirmModuleCompletion } from "@ai-catalyst/services/module/completion";
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

/**
 * Drops every MCP access token this Founder holds.
 *
 * The only path that makes the two sides agree. Removing the connector in
 * Claude is client-side and reaches nothing here, so without this a
 * Founder who disconnected still had a live token against their own
 * workspace and a website insisting they were connected.
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

// Better Auth's own floor for `emailAndPassword`, mirrored in
// components/password-change-form.tsx so the founder is told before a
// round trip rather than after one.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Replaces the invitation password without asking for it again.
 *
 * The normal change-password path requires the current password, and for
 * good reason: it stops a stolen session from locking the real owner out.
 * This one takes the session as proof instead, which is a weaker check —
 * so it is deliberately only reachable in the one window where the trade
 * is favourable.
 *
 * That window is "the founder has never replaced the password their
 * invitation shipped with". In it, the secret the current-password check
 * would be verifying is one a program lead sent them over email, so it
 * protects very little; and the founder typed it seconds ago to reach the
 * first-run dialog, so asking again is friction with no security bought.
 * `hasChangedInvitationPassword` is the gate, and it is the same signal
 * that decides whether the dialog shows this step at all — once it flips,
 * this action refuses and /profile's current-password form takes over.
 *
 * Sessions are deliberately left alone. Better Auth's change-password
 * revokes the *other* ones; there is no equivalent here that doesn't also
 * end the caller's own session, and a founder signed out halfway through
 * an uncloseable dialog is a worse outcome than a stale session on an
 * account that was minted minutes ago.
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

    // Same two calls Better Auth's own reset-password route makes, so the
    // hash format is whatever this version expects rather than something
    // guessed here (see dist/api/routes/password.mjs).
    const authContext = await auth.$context;
    await authContext.internalAdapter.updatePassword(
      actor.userId,
      await authContext.password.hash(newPassword),
    );

    // The account.update hook in lib/auth.ts only fires for the
    // /change-password and /reset-password routes, and this is neither, so
    // the revoke it would have done is done here. A founder at this step
    // has nothing connected yet, which makes this a no-op in practice —
    // but it keeps "the password changed" and "the grants are gone" from
    // ever coming apart.
    await revokeMcpConnectionForUser(actor);

    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Records which AI assistant the founder set the website up for.
 *
 * Deliberately does not redirect: `redirect()` works by throwing, and the
 * `catch` below would swallow it (see the comment in app/page.tsx). The
 * caller navigates or closes the dialog once this returns `{ ok: true }`,
 * the same way DisconnectButton and ProfileForm do.
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
