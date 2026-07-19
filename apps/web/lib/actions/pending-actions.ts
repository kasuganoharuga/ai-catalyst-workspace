"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { acceptFounderInvitation } from "@ai-catalyst/services/invitation";
import { ServiceError } from "@ai-catalyst/services/errors";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";

import type { ActionResult } from "./founder-actions";

async function requirePendingActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  const actor = actorContextFromSession(session);
  if (actor.role !== "pending") {
    throw new ServiceError("FORBIDDEN", "Pending account required.");
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

export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult> {
  try {
    const actor = await requirePendingActor();
    await acceptFounderInvitation(actor, token);
    revalidatePath("/pending");
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
