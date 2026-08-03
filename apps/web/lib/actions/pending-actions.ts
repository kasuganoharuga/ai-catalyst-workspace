"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { acceptInvitation } from "@ai-catalyst/services/invitation";
import { ServiceError } from "@ai-catalyst/services/errors";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";

// Where the newly-promoted account belongs. Kept in step with
// ROLE_DESTINATION in app/page.tsx, which routes the same roles on sign-in
// — both a Founder and a Mentor land on /dashboard, a role-aware page.
const DESTINATION_BY_INVITE_ROLE = {
  founder: "/dashboard",
  mentor: "/dashboard",
} as const;

export type AcceptInvitationActionResult =
  { ok: true; redirectTo: string } | { ok: false; message: string };

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

// Narrower than ActionResult on purpose: this only ever maps a thrown error,
// so the success variant is not one of its outcomes and callers should not
// have to re-narrow it.
function toActionResult(error: unknown): { ok: false; message: string } {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message };
  }
  console.error("Unhandled server action error:", error);
  return { ok: false, message: "Something went wrong." };
}

// The token alone determines whether this account becomes a Founder or a
// Mentor — the form has no way to know which, and asking would let anyone
// holding a stolen token discover what it was for.
export async function acceptInvitationAction(
  token: string,
): Promise<AcceptInvitationActionResult> {
  try {
    const actor = await requirePendingActor();
    const { inviteRole } = await acceptInvitation(actor, token);
    const redirectTo = DESTINATION_BY_INVITE_ROLE[inviteRole];

    revalidatePath("/pending");
    revalidatePath(redirectTo, "layout");
    return { ok: true, redirectTo };
  } catch (error) {
    return toActionResult(error);
  }
}
