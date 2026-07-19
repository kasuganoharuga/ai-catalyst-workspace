"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  createFounderInvitation,
  revokeFounderInvitation,
} from "@ai-catalyst/services/invitation";
import { ServiceError } from "@ai-catalyst/services/errors";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; message: string };

export type CreateInvitationResult =
  { ok: true; rawToken: string } | { ok: false; message: string };

async function requireAdminActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  if (session.user.role !== "admin") {
    throw new ServiceError("FORBIDDEN", "Admin access required.");
  }
  return actorContextFromSession(session);
}

function toActionResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message };
  }
  console.error("Unhandled server action error:", error);
  return { ok: false, message: "Something went wrong." };
}

export async function createInvitationAction(input: {
  email: string;
  personalMessage?: string;
}): Promise<CreateInvitationResult> {
  try {
    const actor = await requireAdminActor();
    const { rawToken } = await createFounderInvitation(actor, input);
    revalidatePath("/admin/invitations");
    return { ok: true, rawToken };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { ok: false, message: error.message };
    }
    console.error("Unhandled server action error:", error);
    return { ok: false, message: "Something went wrong." };
  }
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    await revokeFounderInvitation(actor, invitationId);
    revalidatePath("/admin/invitations");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
