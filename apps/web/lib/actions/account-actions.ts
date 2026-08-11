"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { updateMyProfile } from "@ai-catalyst/services/profile";
import { ServiceError } from "@ai-catalyst/services/errors";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import { founderMessageForServiceError } from "@/lib/service-error-copy";
import { firstZodMessage } from "@/lib/validation/common";
import { updateProfileInputSchema } from "@/lib/validation/profile";
import { webLog } from "@/lib/web-logger";

// Profile + password are shared across Founder, Mentor, and Admin.
// packages/services/profile already allows all three
// (assertRole(actor, ["founder", "mentor", "admin"])) — this file's role
// check only decides who may reach it from a request. Anything that stays
// Founder-only (the AI assistant choice, MCP revocation) is still in
// founder-actions.ts.

export type ActionResult = { ok: true } | { ok: false; message: string };

async function requireAccountActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  const actor = actorContextFromSession(session);
  if (
    actor.role !== "founder" &&
    actor.role !== "mentor" &&
    actor.role !== "admin"
  ) {
    throw new ServiceError(
      "FORBIDDEN",
      "Founder, mentor, or admin access required.",
    );
  }
  return actor;
}

function toActionResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    webLog.error({
      event: "web_service_action_error",
      message: "Service error in account server action",
      code: error.code,
      detail: error.message,
    });
    return { ok: false, message: founderMessageForServiceError(error) };
  }
  webLog.error({
    event: "web_unhandled_action_error",
    message: "Unhandled account server action error",
    error_name: error instanceof Error ? error.name : typeof error,
  });
  return { ok: false, message: "That didn't save. Try again in a moment." };
}

export async function updateProfileAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }

  try {
    const actor = await requireAccountActor();
    await updateMyProfile(actor, parsed.data);
    // Founder/Mentor shell and Admin shell both show the display name from
    // the profile — refresh whichever layout the actor is in.
    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
