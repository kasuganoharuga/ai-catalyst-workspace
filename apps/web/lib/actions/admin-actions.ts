"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  assignWorkspaceMentor,
  resetUserPassword,
  softDeleteUser,
} from "@ai-catalyst/services/admin";
import {
  createFounderInvitation,
  createMentorInvitation,
  revokeFounderInvitation,
  revokeMentorInvitation,
} from "@ai-catalyst/services/invitation";
import { ServiceError } from "@ai-catalyst/services/errors";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import {
  createInvitationInputSchema,
  firstZodMessage,
} from "@/lib/validation/invitation";
import { webLog } from "@/lib/web-logger";

export type ActionResult = { ok: true } | { ok: false; message: string };

export type CreateInvitationResult =
  { ok: true; rawToken: string } | { ok: false; message: string };

export type ResetUserPasswordResult =
  | { ok: true; email: string; temporaryPassword: string }
  | { ok: false; message: string };

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
  webLog.error({
    event: "web_unhandled_action_error",
    message: "Unhandled admin server action error",
    error_name: error instanceof Error ? error.name : typeof error,
  });
  return { ok: false, message: "Something went wrong." };
}

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
    const { rawToken } = await createFounderInvitation(actor, parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/invitations");
    return { ok: true, rawToken };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { ok: false, message: error.message };
    }
    webLog.error({
      event: "web_unhandled_action_error",
      message: "Unhandled admin createInvitationAction error",
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, message: "Something went wrong." };
  }
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    await revokeFounderInvitation(actor, invitationId);
    revalidatePath("/admin");
    revalidatePath("/admin/invitations");
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
    const { rawToken } = await createMentorInvitation(actor, parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/invitations");
    return { ok: true, rawToken };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { ok: false, message: error.message };
    }
    webLog.error({
      event: "web_unhandled_action_error",
      message: "Unhandled admin createMentorInvitationAction error",
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, message: "Something went wrong." };
  }
}

export async function revokeMentorInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    await revokeMentorInvitation(actor, invitationId);
    revalidatePath("/admin");
    revalidatePath("/admin/invitations");
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
    if (error instanceof ServiceError) {
      return { ok: false, message: error.message };
    }
    webLog.error({
      event: "web_unhandled_action_error",
      message: "Unhandled admin resetUserPasswordAction error",
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, message: "Something went wrong." };
  }
}
