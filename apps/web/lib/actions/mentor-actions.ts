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

import type { ActionResult, CreateInvitationResult } from "./admin-actions";

// The Mentor half of Founder invitations, mirroring admin-actions.ts. Both
// call the same service functions — the difference is entirely in scope, and
// that scope is enforced there, not here: a Mentor's invitation is stamped
// with `invited_by_user_id`, and revoke/list refuse to touch a row carrying
// anyone else's. This file's role check only decides who may reach the
// service at all.

async function requireMentorActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  if (session.user.role !== "mentor") {
    throw new ServiceError("FORBIDDEN", "Mentor access required.");
  }
  return actorContextFromSession(session);
}

function toActionResult(error: unknown): { ok: false; message: string } {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message };
  }
  console.error("Unhandled server action error:", error);
  return { ok: false, message: "Something went wrong." };
}

/**
 * Invites a Founder. Accepting this is what creates their Workspace and
 * attributes it to this Mentor — there is no separate "assign" step.
 */
export async function createFounderInvitationAction(input: {
  email: string;
  personalMessage?: string;
}): Promise<CreateInvitationResult> {
  try {
    const actor = await requireMentorActor();
    const { rawToken } = await createFounderInvitation(actor, input);
    revalidatePath("/invitations");
    // The dashboard's Mentor branch counts pending invitations, so it goes
    // stale too.
    revalidatePath("/dashboard");
    return { ok: true, rawToken };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function revokeFounderInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireMentorActor();
    await revokeFounderInvitation(actor, invitationId);
    revalidatePath("/invitations");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
