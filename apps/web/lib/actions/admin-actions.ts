"use server";

import { revalidatePath } from "next/cache";

import {
  assignWorkspaceMentor,
  resetUserPassword,
  softDeleteUser,
} from "@ai-catalyst/services/admin";
import {
  revokeFounderInvitation,
  revokeMentorInvitation,
} from "@ai-catalyst/services/invitation";

import { auth } from "@/lib/auth";
import { inviteWithCredentials } from "@/lib/invite-with-credentials";
import {
  createInvitationInputSchema,
  firstZodMessage,
} from "@/lib/validation/invitation";

import type {
  ActionResult,
  ActionResultWith,
  CreateInvitationResult,
} from "./action-result";
import { internalActionResult } from "./action-error";
import { requireAdminActor } from "./require-actor";
import { revalidateAdminInvitations } from "./revalidate";

export type { ActionResult, CreateInvitationResult };

export type ResetUserPasswordResult = ActionResultWith<{
  email: string;
  temporaryPassword: string;
}>;

const toActionResult = internalActionResult({ domain: "admin" });

export async function createInvitationAction(input: {
  email: string;
  personalMessage?: string;
}): Promise<CreateInvitationResult> {
  const parsed = createInvitationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }

  try {
    const actor = await requireAdminActor();
    const result = await inviteWithCredentials(actor, {
      ...parsed.data,
      inviteRole: "founder",
    });
    revalidateAdminInvitations();
    revalidatePath("/admin/users");
    return { ok: true, ...result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    await revokeFounderInvitation(actor, invitationId);
    revalidateAdminInvitations();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Invites a Mentor to the platform. Admin-only, and platform-level: the new
 * Mentor covers nobody until Founders they invite start accepting, so there
 * is no Workspace to choose here.
 */
export async function createMentorInvitationAction(input: {
  email: string;
  personalMessage?: string;
}): Promise<CreateInvitationResult> {
  const parsed = createInvitationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }

  try {
    const actor = await requireAdminActor();
    const result = await inviteWithCredentials(actor, {
      ...parsed.data,
      inviteRole: "mentor",
    });
    revalidateAdminInvitations();
    revalidatePath("/admin/users");
    return { ok: true, ...result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function revokeMentorInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    await revokeMentorInvitation(actor, invitationId);
    revalidateAdminInvitations();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function assignWorkspaceMentorAction(input: {
  workspaceId: string;
  mentorUserId: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    await assignWorkspaceMentor(actor, input);
    revalidatePath("/admin");
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function softDeleteUserAction(
  userId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    await softDeleteUser(actor, userId);
    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath("/admin/invitations");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Break-glass recovery for a user locked out of their account.
 *
 * See `resetUserPassword` for why this is manual rather than a self-serve
 * "forgot password" flow. The temporary password comes back once, for the
 * admin to pass on out of band; nothing persists it, so a lost one is
 * recovered by resetting again.
 */
export async function resetUserPasswordAction(
  userId: string,
): Promise<ResetUserPasswordResult> {
  try {
    const actor = await requireAdminActor();
    const authContext = await auth.$context;

    const { email, temporaryPassword } = await resetUserPassword(actor, {
      userId,
      // Same adapter calls as Better Auth's own reset-password route, matching
      // setInitialPasswordAction — the stored hash has to be in Better Auth's
      // format or the temporary password will not verify at sign-in.
      writePassword: async (targetUserId, plainTextPassword) => {
        await authContext.internalAdapter.updatePassword(
          targetUserId,
          await authContext.password.hash(plainTextPassword),
        );
      },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    return { ok: true, email, temporaryPassword };
  } catch (error) {
    return toActionResult(error);
  }
}
