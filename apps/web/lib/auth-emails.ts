import type { EmailMessage } from "@ai-catalyst/services/email";

/**
 * Transactional email bodies for authentication.
 *
 * Plain text only, deliberately. `EmailMessage.html` is optional while `text`
 * is required (`packages/services/src/email/types.ts`), there is no email
 * template renderer in the repo, and a six-digit code does not need one —
 * plain text also renders identically everywhere and cannot be mangled by a
 * client stripping styles.
 *
 * Nothing here names the venture or the founder: these are sent before the
 * recipient is authenticated, so the body must not confirm anything about who
 * holds the address or what they have access to.
 */

/** Mirrors `emailOTP({ expiresIn })` in lib/auth.ts — kept in sync by SIGN_IN_CODE_TTL_SECONDS. */
export const SIGN_IN_CODE_TTL_SECONDS = 300;

export function signInCodeEmail(params: {
  to: string;
  otp: string;
}): EmailMessage {
  const minutes = Math.round(SIGN_IN_CODE_TTL_SECONDS / 60);
  return {
    to: params.to,
    // No code in the subject line: subjects show on lock screens and in
    // notification previews, where a shoulder-surfer would not need the inbox.
    subject: "Your AI Catalyst sign-in code",
    text: [
      `Your sign-in code is ${params.otp}`,
      "",
      `It expires in ${minutes} minutes and can only be used once.`,
      "",
      "If you didn't try to sign in, you can ignore this email — someone",
      "entered your address by mistake, and no account was accessed.",
    ].join("\n"),
  };
}
