"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  AUTH_EMAIL_OTP_ENABLED,
  AUTH_GOOGLE_ENABLED,
} from "@/lib/feature-flags";

const INPUT_CLASS =
  "h-11 w-full rounded-md border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground focus:ring-1 focus:ring-foreground";

/** True when at least one passwordless method is live. */
const SHOW_ALTERNATIVES = AUTH_GOOGLE_ENABLED || AUTH_EMAIL_OTP_ENABLED;

/**
 * Sign-in.
 *
 * Three paths coexist by design while password login is being retired: the
 * password form (still the default), Google, and a six-digit emailed code. The
 * two new ones are each gated by their own flag in lib/feature-flags.ts, which
 * gates the matching server-side provider registration in lib/auth.ts too —
 * flip them together, never one side alone.
 *
 * While both flags are off this returns early with the original password-only
 * markup, so the rendered DOM is identical to what shipped before either flag
 * existed — not merely visually equivalent. That is what makes the staged
 * rollout verifiable.
 */
export function SignInForm({ returnTo }: { returnTo: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Non-null once a code has been sent: swaps the email field for code entry.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");

  /**
   * returnTo is often /api/auth/mcp/authorize, which answers with a 302 to the
   * OAuth client — a client-side router push would try to render it as a page.
   * safeReturnTo (lib/safe-return-to.ts) has already constrained it to a
   * same-origin relative path.
   */
  function goAfterSignIn() {
    if (returnTo) {
      window.location.assign(returnTo);
      return;
    }
    router.push("/dashboard");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? "Sign in failed. Please try again.");
      return;
    }

    goAfterSignIn();
  }

  async function handleGoogle() {
    setError(null);
    setIsSubmitting(true);
    // No goAfterSignIn() here: this navigates away to Google, and Better Auth
    // brings the browser back to callbackURL itself once the round trip
    // completes. Nothing after this line runs on the happy path.
    const { error: socialError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: returnTo ?? "/dashboard",
    });
    if (socialError) {
      setIsSubmitting(false);
      setError(
        socialError.message ?? "Could not continue with Google. Try again.",
      );
    }
  }

  async function handleSendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });

    setIsSubmitting(false);

    if (sendError) {
      setError(sendError.message ?? "Could not send a code. Try again.");
      return;
    }
    setCodeSentTo(email);
  }

  async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: verifyError } = await authClient.signIn.emailOtp({
      email: codeSentTo ?? email,
      otp: code,
    });

    setIsSubmitting(false);

    if (verifyError) {
      setError(
        verifyError.message ?? "That code didn't work. Check it and try again.",
      );
      return;
    }

    goAfterSignIn();
  }

  const errorBlock = error ? (
    <p
      role="alert"
      className="border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive"
    >
      {error}
    </p>
  ) : null;

  const emailField = (
    <Field label="Email">
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={INPUT_CLASS}
      />
    </Field>
  );

  const passwordField = (
    <Field label="Password">
      <input
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="h-11 w-full rounded-md border border-border bg-card px-3.5 text-sm text-foreground outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground"
      />
    </Field>
  );

  // Square-ish, not a pill: the only saturated element on the light half of
  // the page, so its shape does the work instead of a consumer-style capsule.
  const submitButton = (
    <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
      {isSubmitting ? "Signing in…" : "Continue to workspace"}
    </Button>
  );

  // Password-only. Deliberately the pre-existing markup, unwrapped.
  if (!SHOW_ALTERNATIVES) {
    return (
      <form onSubmit={handleSubmit} className="mt-10 space-y-6">
        {emailField}
        {passwordField}
        {errorBlock}
        {submitButton}
      </form>
    );
  }

  // Code entry replaces the whole form: leaving the password fields alongside
  // it would mean two submit buttons doing different things.
  if (AUTH_EMAIL_OTP_ENABLED && codeSentTo) {
    return (
      <form onSubmit={handleVerifyCode} className="mt-10 space-y-6">
        <p className="text-sm leading-6 text-muted-foreground">
          We sent a six-digit code to{" "}
          <span className="font-medium text-foreground">{codeSentTo}</span>. It
          expires in five minutes.
        </p>
        <Field label="Sign-in code">
          <input
            type="text"
            required
            inputMode="numeric"
            // Lets a password manager or the OS fill the code from the email.
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.trim())}
            className="h-11 w-full rounded-md border border-border bg-card px-3.5 font-mono text-sm tracking-[0.3em] text-foreground outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground"
          />
        </Field>

        {errorBlock}
        {submitButton}

        <button
          type="button"
          onClick={() => {
            setCodeSentTo(null);
            setCode("");
            setError(null);
          }}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <div className="mt-10 space-y-6">
      {AUTH_GOOGLE_ENABLED ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={isSubmitting}
          onClick={handleGoogle}
          className="w-full"
        >
          Continue with Google
        </Button>
      ) : null}

      {AUTH_GOOGLE_ENABLED && AUTH_EMAIL_OTP_ENABLED ? <Divider /> : null}

      {AUTH_EMAIL_OTP_ENABLED ? (
        <form onSubmit={handleSendCode} className="space-y-6">
          {emailField}
          {errorBlock}
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Sending code…" : "Email me a sign-in code"}
          </Button>
        </form>
      ) : null}

      <Divider />

      {/* Password sign-in. Deleted once the flags above are live and validated;
          until then it stays the path that definitely works. */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* The code form above already owns an email field when it renders, so
            this one would be a second input for the same value. */}
        {AUTH_EMAIL_OTP_ENABLED ? null : emailField}
        {passwordField}
        {AUTH_EMAIL_OTP_ENABLED ? null : errorBlock}
        {submitButton}
      </form>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        or
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
