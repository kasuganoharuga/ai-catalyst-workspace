import { getEmailSender } from "@/lib/email";
import { webLog } from "@/lib/web-logger";

import type { EmailMessage } from "@ai-catalyst/services/email";

/**
 * Transactional email for a newly provisioned Founder/Mentor account.
 *
 * Three lines, and only three: login page, account, initial password. The
 * recipient already has a working account, so there is no register/pending
 * walkthrough and no invitation code. Plain text only, matching
 * auth-emails.ts — no template renderer exists in the repo.
 */

export function loginUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const issuer = env.AUTH_ISSUER_URL?.trim();
  return issuer ? issuer.replace(/\/$/, "") : "";
}

export function invitationEmail(params: {
  to: string;
  loginUrl: string;
  password: string;
}): EmailMessage {
  return {
    to: params.to,
    // Password stays out of the subject: subjects show on lock screens.
    subject: "Your AI Catalyst account",
    text: [
      `Login: ${params.loginUrl}`,
      `Account: ${params.to}`,
      `Password: ${params.password}`,
    ].join("\n"),
  };
}

/**
 * Best-effort send: called after the account already exists, so a failure
 * here must not fail the invite action — the caller falls back to showing
 * the same three fields on screen.
 */
export async function sendInvitationEmail(params: {
  to: string;
  loginUrl: string;
  password: string;
}): Promise<boolean> {
  try {
    await getEmailSender().enqueue(invitationEmail(params));
    return true;
  } catch (error) {
    webLog.error({
      event: "web_invitation_email_failed",
      message: "Account created but invitation email failed to send",
      error_name: error instanceof Error ? error.name : typeof error,
      error_message: error instanceof Error ? error.message : undefined,
    });
    return false;
  }
}
