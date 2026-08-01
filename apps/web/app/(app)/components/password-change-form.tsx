"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  revokeMcpConnectionAction,
  setInitialPasswordAction,
} from "@/lib/actions/founder-actions";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// Better Auth's own floor for `emailAndPassword`. Mirrored here so the
// user is told before a round trip, not after one, and again in
// setInitialPasswordAction because a client-side check is not one.
const MIN_PASSWORD_LENGTH = 8;

/**
 * The password fields and their rules, shared by the profile page and the
 * first-run dialog. Everything either surface adds — headings, the
 * reset-by-email note — stays outside this component, so the validation
 * only exists once.
 *
 * Two modes, because the two surfaces are answering different questions:
 *
 * - `"change"` — the profile page. Proves it is really you by asking for
 *   the current password, and signs out every other session on the way,
 *   because someone changing their password usually suspects the old one
 *   leaked.
 * - `"initial"` — the first-run dialog. The founder typed the invitation
 *   password seconds ago to get here, so asking for it again is friction
 *   that buys nothing; the session stands in for it. Bounded server-side
 *   to accounts still on that invitation password — see
 *   setInitialPasswordAction.
 */
export function PasswordChangeForm({
  mode = "change",
  submitLabel = "Update password",
  pendingLabel = "Updating…",
  successNote,
  onSuccess,
  className,
}: {
  mode?: "change" | "initial";
  submitLabel?: string;
  pendingLabel?: string;
  /** Shown beside the button once the change lands. Omit to say nothing. */
  successNote?: string;
  onSuccess?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const needsCurrent = mode === "change";

  const canSubmit =
    (!needsCurrent || currentPassword.length > 0) &&
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
    if (needsCurrent && newPassword === currentPassword) {
      setError("Your new password is the same as your current one.");
      return;
    }

    setStatus("saving");

    if (needsCurrent) {
      // Signs out anywhere else this account is open. This session
      // survives, so a founder mid-setup is not thrown out of the flow.
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

      // Client belt-and-braces; authoritative revoke is account.update.after.
      await revokeMcpConnectionAction();
    } else {
      const result = await setInitialPasswordAction(newPassword);
      if (!result.ok) {
        setStatus("idle");
        setError(result.message);
        return;
      }
    }

    router.refresh();

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStatus("saved");
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-5", className)}>
      {needsCurrent ? (
        <PasswordField
          label="Current password"
          value={currentPassword}
          onChange={(value) => {
            setCurrentPassword(value);
            setStatus("idle");
          }}
          autoComplete="current-password"
        />
      ) : null}
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
          className="border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={!canSubmit}>
          {status === "saving" ? pendingLabel : submitLabel}
        </Button>
        {status === "saved" && successNote ? (
          <span className="text-sm text-muted-foreground">{successNote}</span>
        ) : null}
      </div>
    </form>
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
