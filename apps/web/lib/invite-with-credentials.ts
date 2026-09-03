import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import {
  acceptInvitation,
  createFounderInvitation,
  createMentorInvitation,
} from "@ai-catalyst/services/invitation";
import { generateTemporaryPassword } from "@ai-catalyst/services/admin";

import { loginUrlFromEnv, sendInvitationEmail } from "@/lib/invitation-emails";
import {
  createInvitedCredentialUser,
  deleteProvisionedUser,
} from "@/lib/provision-invited-account";

export interface InviteWithCredentialsResult {
  email: string;
  loginUrl: string;
  initialPassword: string;
  emailSent: boolean;
}

/**
 * The invite path the product actually uses: create the account, accept the
 * invitation on their behalf (workspace / role), then email login + account
 * + initial password. Same shape as scripts/create-account.ts, minus the
 * CloudWatch print — mail is the hand-off channel.
 */
export async function inviteWithCredentials(
  actor: ActorContext,
  input: {
    email: string;
    personalMessage?: string;
    inviteRole: "founder" | "mentor";
  },
): Promise<InviteWithCredentialsResult> {
  const email = input.email.trim().toLowerCase();
  const loginUrl = loginUrlFromEnv();
  const initialPassword = generateTemporaryPassword();
  const userId = await createInvitedCredentialUser(email, initialPassword);

  let invitationId: string | undefined;
  try {
    const create =
      input.inviteRole === "mentor"
        ? createMentorInvitation
        : createFounderInvitation;
    const { invitation, rawToken } = await create(actor, {
      email,
      personalMessage: input.personalMessage,
    });
    invitationId = invitation.id;
    await acceptInvitation({ userId, role: "pending" }, rawToken);
  } catch (error) {
    await rollbackIncompleteInvite({ userId, invitationId });
    throw error;
  }

  // Accept already committed — a mail failure must not unwind the account.
  const emailSent = await sendInvitationEmail({
    to: email,
    loginUrl,
    password: initialPassword,
  });

  return {
    email,
    loginUrl,
    initialPassword,
    emailSent,
  };
}

async function rollbackIncompleteInvite(input: {
  userId: string;
  invitationId: string | undefined;
}): Promise<void> {
  if (input.invitationId) {
    await pool.query(
      `delete from invitations
       where id = $1 and accepted_at is null`,
      [input.invitationId],
    );
  }
  await deleteProvisionedUser(input.userId);
}
