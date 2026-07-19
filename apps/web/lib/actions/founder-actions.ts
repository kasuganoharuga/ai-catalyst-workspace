"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { confirmModuleCompletion } from "@ai-catalyst/services/module/completion";
import { updateMyCompanyProfile } from "@ai-catalyst/services/company-profile";
import { updateMyProfile } from "@ai-catalyst/services/profile";
import { ServiceError } from "@ai-catalyst/services/errors";
import {
  archiveVenture,
  createVenture,
  updateVentureClaudeProjectId,
} from "@ai-catalyst/services/venture";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { setActiveVenture } from "@ai-catalyst/services/workspace/active-context";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";

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
    return { ok: false, message: error.message };
  }
  console.error("Unhandled server action error:", error);
  return { ok: false, message: "Something went wrong." };
}

/** Revalidate the (app) layout so sidebar shell data refreshes after mutations. */
function revalidateFounderAppShell() {
  revalidatePath("/dashboard", "layout");
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

export async function startProgramRunAction(
  ventureId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireFounderActor();
    await getOrCreateProgramRun(actor, { ventureId });
    revalidateFounderAppShell();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
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
