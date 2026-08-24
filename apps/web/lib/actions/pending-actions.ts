"use server";

import { revalidatePath } from "next/cache";

import { acceptInvitation } from "@ai-catalyst/services/invitation";

import type { ActionResultWith } from "./action-result";
import { internalActionResult } from "./action-error";
import { requirePendingActor } from "./require-actor";

// Where the newly-promoted account belongs. Kept in step with
// ROLE_DESTINATION in app/page.tsx, which routes the same roles on sign-in
// — both a Founder and a Mentor land on /dashboard, a role-aware page.
const DESTINATION_BY_INVITE_ROLE = {
  founder: "/dashboard",
  mentor: "/dashboard",
} as const;

export type AcceptInvitationActionResult = ActionResultWith<{
  redirectTo: string;
}>;

const toActionResult = internalActionResult({ domain: "pending" });

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
