// Build-time product switches. Plain constants (not env vars) so the bundler
// can drop dead branches; flip back to `true` to restore behaviour without migration.

/**
 * Module 0 as a Founder-visible step.
 *
 * Hidden because it has no questions — `autoCompleteSetupModule` runs the same
 * checks server-side when the Run opens. Direct URL stays reachable for support.
 */
export const SHOW_SETUP_MODULE = false;

/**
 * Claude Project linking on the Venture.
 *
 * Hidden because `claude://claude.ai/project/<id>` cannot carry a prompt — every
 * hand-off reverts to a new chat with the starter line prefilled.
 */
export const SHOW_CLAUDE_PROJECT = false;

/**
 * "Continue with Google" sign-in.
 *
 * Each of the two flags below gates **both** the button in
 * `components/auth/sign-in-form.tsx` and the provider registration in
 * `lib/auth.ts`. That pairing is deliberate and must be preserved: registering
 * server-side while the UI is hidden would leave a live endpoint nobody
 * reviewed, and showing the button without the provider would render a button
 * whose endpoint 404s. Read each flag from here — never re-derive the
 * condition from an env var at a call site.
 *
 * While `false`, `lib/auth.ts` requires none of this method's env vars, so the
 * build is safe to ship with no Google credentials configured anywhere.
 *
 * Flip to `true` once the Google OAuth client exists and
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set. Google needs no email
 * infrastructure, so this can go live independently of (and before) the
 * email-code flag below.
 */
export const AUTH_GOOGLE_ENABLED = false;

/**
 * Passwordless sign-in by six-digit emailed code.
 *
 * Flip to `true` only once SES is verified and out of the sandbox — in the
 * sandbox, sends to unverified addresses are rejected at the API while
 * everything looks correctly wired, so enabling this early makes sign-in fail
 * for real users. See `lib/email.ts`'s `assertEmailProviderAllowed`, which
 * refuses to boot a real environment on the noop transport for the same reason.
 */
export const AUTH_EMAIL_OTP_ENABLED = false;
