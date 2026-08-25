"use server";

import {
  createFounderInvitation,
  revokeFounderInvitation,
} from "@ai-catalyst/services/invitation";

import { sendInvitationEmail } from "@/lib/invitation-emails";
import {
  createInvitationInputSchema,
  firstZodMessage,
} from "@/lib/validation/invitation";

import type { ActionResult, CreateInvitationResult } from "./action-result";
import { internalActionResult } from "./action-error";
import { requireMentorActor } from "./require-actor";
import { revalidateMentorInvitations } from "./revalidate";

// The Mentor half of Founder invitations, mirroring admin-actions.ts. Both
// call the same service functions — the difference is entirely in scope, and
// that scope is enforced there, not here: a Mentor's invitation is stamped
// with `invited_by_user_id`, and revoke/list refuse to touch a row carrying
// anyone else's. This file's role check only decides who may reach the
// service at all.

const toActionResult = internalActionResult({ domain: "mentor" });

/**
 * Invites a Founder. Accepting this is what creates their Workspace and
 * attributes it to this Mentor — there is no separate "assign" step.
 */
export async function createFounderInvitationAction(input: {
  email: string;
  personalMessage?: string;
}): Promise<CreateInvitationResult> {
  const parsed = createInvitationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }

  try {
    const actor = await requireMentorActor();
    const { invitation, rawToken } = await createFounderInvitation(
      actor,
      parsed.data,
    );
    const emailSent = await sendInvitationEmail(invitation, rawToken);
    revalidateMentorInvitations();
    return { ok: true, rawToken, emailSent };
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
    revalidateMentorInvitations();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
