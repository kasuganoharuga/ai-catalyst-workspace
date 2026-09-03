import {
  detailPanel,
  detailRow,
  noteCallout,
  paragraph,
  primaryButton,
  renderEmailLayout,
  spacer,
} from "@/lib/email-layout";
import { getEmailSender } from "@/lib/email";
import { webLog } from "@/lib/web-logger";

import type { EmailMessage } from "@ai-catalyst/services/email";

/**
 * Transactional email for a newly provisioned Founder/Mentor account.
 *
 * Three facts and two instructions. The facts: login page, account, initial
 * password. The instructions: sign in straight away, and swap the password
 * out once you have.
 *
 * "Straight away" is literal — inviteWithCredentials creates the account and
 * accepts the invitation on the recipient's behalf before this send, so
 * there is no register/pending walkthrough left to complete.
 *
 * The password reminder is not the mechanism, only the warning: the app
 * itself makes the change mandatory on first sign-in (the onboarding
 * PasswordStep, then the dashboard PasswordPrompt, which has no skip). What
 * the email adds is the reason, which the recipient can only act on here —
 * this password reached them over mail and is sitting in an inbox. The
 * wording deliberately echoes onboardingCopy.passwordBody so the mail and
 * the dialog do not read as two different requests.
 *
 * The `text` part is the canonical body — it is what a plain-text client, a
 * screen reader in text mode, and every spam filter that penalises HTML-only
 * mail will read. `html` is the same content in the brand shell
 * (lib/email-layout.ts) and says nothing the text part does not, which is
 * the property that keeps the two from drifting.
 */

export function loginUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const issuer = env.AUTH_ISSUER_URL?.trim();
  return issuer ? issuer.replace(/\/$/, "") : "";
}

/**
 * Shared by both parts, so the reminder cannot say one thing in the HTML and
 * another in the plain text. Echoes onboardingCopy.passwordBody
 * (app/(app)/lib/copy/dashboard.ts) — the dialog that enforces this.
 */
const PASSWORD_REMINDER_TITLE = "Change this password once you're in.";
const PASSWORD_REMINDER_BODY =
  "It was generated for you and it has travelled by email. Replace it with one only you know.";

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
      "Your account is ready — sign in straight away, there is nothing to accept first.",
      "",
      `Login: ${params.loginUrl}`,
      `Account: ${params.to}`,
      `Password: ${params.password}`,
      "",
      PASSWORD_REMINDER_TITLE,
      PASSWORD_REMINDER_BODY,
    ].join("\n"),
    html: invitationEmailHtml(params),
  };
}

function invitationEmailHtml(params: {
  to: string;
  loginUrl: string;
  password: string;
}): string {
  return renderEmailLayout({
    preheader: "Your login page, account, and initial password.",
    eyebrow: "AI Catalyst · Account Access",
    heading: "Your account is ready",
    footnote:
      "Until you've changed it, this email is a working password. Keep it somewhere safe, or delete it once you're in.",
    bodyHtml: [
      paragraph(
        "You can sign in straight away — there is nothing to accept or set up first.",
      ),
      spacer(20),
      detailPanel([
        // No href when AUTH_ISSUER_URL is unset: an empty <a href=""> resolves
        // against the mail client, not the app, and lands the reader wherever
        // the preview happens to be hosted.
        detailRow({
          label: "Login page",
          value: params.loginUrl,
          href: params.loginUrl || undefined,
        }),
        detailRow({ label: "Account", value: params.to }),
        detailRow({ label: "Password", value: params.password, mono: true }),
      ]),
      ...(params.loginUrl
        ? [
            spacer(24),
            primaryButton({ href: params.loginUrl, label: "Sign in now" }),
          ]
        : []),
      spacer(24),
      noteCallout({
        title: PASSWORD_REMINDER_TITLE,
        body: PASSWORD_REMINDER_BODY,
      }),
    ].join(""),
  });
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
