"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { updateMyProfile } from "@ai-catalyst/services/profile";
import { ServiceError } from "@ai-catalyst/services/errors";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import { founderMessageForServiceError } from "@/lib/service-error-copy";

// The Founder/Mentor overlap: both have a profile page and a password, and
// packages/services/profile already allows either role through
// (assertRole(actor, ["founder", "mentor", "admin"])) — this file's role
// check only decides who may reach it from a request, same split
// founder-actions.ts and mentor-actions.ts use for their own exclusive
// actions. Anything that stays Founder-only (the AI assistant choice, MCP
// revocation) is still in founder-actions.ts.

export type ActionResult = { ok: true } | { ok: false; message: string };

async function requireAccountActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  const actor = actorContextFromSession(session);
  if (actor.role !== "founder" && actor.role !== "mentor") {
    throw new ServiceError("FORBIDDEN", "Founder or mentor access required.");
  }
  return actor;
}

function toActionResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    console.error("Service error in server action:", error.code, error.message);
    return { ok: false, message: founderMessageForServiceError(error) };
  }
  console.error("Unhandled server action error:", error);
  return { ok: false, message: "That didn't save. Try again in a moment." };
}

export async function updateProfileAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const actor = await requireAccountActor();
    await updateMyProfile(actor, input);
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
