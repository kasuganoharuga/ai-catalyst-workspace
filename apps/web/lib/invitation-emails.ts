import type { Invitation } from "@ai-catalyst/shared";

import { getEmailSender } from "@/lib/email";
import { webLog } from "@/lib/web-logger";

import type { EmailMessage } from "@ai-catalyst/services/email";

/**
 * Transactional email body for Founder/Mentor invitations.
 *
 * Plain text only, matching auth-emails.ts's signInCodeEmail — no template
 * renderer exists in the repo, and a one-time code doesn't need one. Unlike
 * the sign-in code, this recipient may not have an account yet, so the body
 * walks them through registering before the code can be used.
 */

const ROLE_LABEL = { founder: "Founder", mentor: "Mentor" } as const;

function originFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const issuer = env.AUTH_ISSUER_URL?.trim();
  return issuer ? issuer.replace(/\/$/, "") : undefined;
}

export function invitationEmail(params: {
  to: string;
  inviteRole: "founder" | "mentor";
  token: string;
  expiresAt: string;
  personalMessage?: string | null;
  origin?: string;
}): EmailMessage {
  const roleLabel = ROLE_LABEL[params.inviteRole];
  const expiryDate = new Date(params.expiresAt).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const origin = params.origin?.replace(/\/$/, "");
  const acceptSteps = origin
    ? [
        `To accept it: create an account at ${origin}/register`,
        `(or sign in at ${origin} if you already have one), then paste this`,
        `code on the Awaiting invitation page: ${origin}/pending`,
      ]
    : [
        "To accept it: create an account (or sign in, if you already have one),",
        'then paste this code on the "Awaiting invitation" page.',
      ];

  return {
    to: params.to,
    subject: `You're invited to AI Catalyst as a ${roleLabel}`,
    text: [
      `You've been invited to join AI Catalyst as a ${roleLabel}.`,
      "",
      ...(params.personalMessage
        ? [`Message from your inviter:`, `"${params.personalMessage}"`, ""]
        : []),
      `Your invitation code is ${params.token}`,
      "",
      ...acceptSteps,
      "",
      `This code expires on ${expiryDate} and can only be used once.`,
      "",
      "If you weren't expecting this invitation, you can ignore this email —",
      "no account was accessed.",
    ].join("\n"),
  };
}

/**
 * Best-effort send: called after the invitation row already exists, so a
 * failure here must not fail the create action — the caller falls back to
 * sharing `rawToken` manually.
 */
export async function sendInvitationEmail(
  invitation: Invitation,
  rawToken: string,
): Promise<boolean> {
  try {
    await getEmailSender().enqueue(
      invitationEmail({
        to: invitation.email,
        inviteRole: invitation.inviteRole,
        token: rawToken,
        expiresAt: invitation.expiresAt,
        personalMessage: invitation.personalMessage,
        origin: originFromEnv(),
      }),
    );
    return true;
  } catch (error) {
    webLog.error({
      event: "web_invitation_email_failed",
      message: "Invitation created but email failed to send",
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}
