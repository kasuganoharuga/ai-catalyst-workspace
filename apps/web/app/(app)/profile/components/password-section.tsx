"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// Better Auth's own floor for `emailAndPassword`. Mirrored here so the
// user is told before a round trip, not after one.
const MIN_PASSWORD_LENGTH = 8;

export function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    status !== "saving";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two new passwords don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password is the same as your current one.");
      return;
    }

    setStatus("saving");
    // Signs out anywhere else this account is open — a password change is
    // usually prompted by a suspicion the old one leaked.
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    if (changeError) {
      setStatus("idle");
      setError(
        changeError.message ??
          "That didn't work. Check your current password and try again.",
      );
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStatus("saved");
  }

  return (
    <section className="mt-14">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Password
      </h2>

      <form
        onSubmit={handleSubmit}
        className="mt-3 max-w-2xl space-y-5 border-t border-border pt-6"
      >
        <PasswordField
          label="Current password"
          value={currentPassword}
          onChange={(value) => {
            setCurrentPassword(value);
            setStatus("idle");
          }}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={(value) => {
            setNewPassword(value);
            setStatus("idle");
          }}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            setStatus("idle");
          }}
          autoComplete="new-password"
        />

        {error ? (
          <p
            role="alert"
            className="mt-5 border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-4">
          <Button type="submit" disabled={!canSubmit}>
            {status === "saving" ? "Updating…" : "Update password"}
          </Button>
          {status === "saved" ? (
            <span className="text-sm text-muted-foreground">
              Password updated. Other devices have been signed out.
            </span>
          ) : null}
        </div>
      </form>

      {/* Reset-by-email is styled but deliberately inert: no SMTP is wired
          up yet, so `sendResetPassword` isn't configured on the server.
          Shipping a button that silently fails would be worse than saying
          so — this states the limitation and gives a route that works. */}
      <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
        <p className="text-sm font-semibold text-foreground">
          Forgotten your password?
        </p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Reset-by-email isn&apos;t switched on yet. Until it is, ask your
          programme lead and they&apos;ll sort it out for you.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="mt-4"
        >
          Email me a reset link
        </Button>
        <span className="ml-3 text-xs text-muted-foreground">
          Not available yet
        </span>
      </div>
    </section>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground"
      />
      {hint ? (
        <span className="block text-xs leading-5 text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
