"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/error-banner";
import { SavedNote } from "@/components/saved-note";
import { TextField } from "@/components/text-field";
import { useSaveStatus } from "@/hooks/use-save-status";
import {
  revokeMcpConnectionAction,
  setInitialPasswordAction,
} from "@/lib/actions/founder-actions";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// Better Auth's minimum — mirrored here for client-side validation before round trip.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Shared password fields for profile and first-run dialog.
 *
 * `"change"` proves identity and revokes other sessions; `"initial"` skips current
 * password (invitation password was just used) — bounded server-side in setInitialPasswordAction.
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
  /** Shown beside the button once saved. */
  successNote?: string;
  onSuccess?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const {
    status,
    setIdle,
    setSaving,
    setSaved: setSavedStatus,
  } = useSaveStatus();
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

    setSaving();

    if (needsCurrent) {
      const { error: changeError } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (changeError) {
        setIdle();
        setError(
          changeError.message ??
            "That didn't work. Check your current password and try again.",
        );
        return;
      }

      // Best-effort MCP revoke; authoritative path is account.update.after hook.
      try {
        await revokeMcpConnectionAction();
      } catch {
        // best-effort only
      }
    } else {
      const result = await setInitialPasswordAction(newPassword);
      if (!result.ok) {
        setIdle();
        setError(result.message);
        return;
      }
    }

    router.refresh();

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSavedStatus();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-5", className)}>
      {needsCurrent ? (
        <TextField
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(value) => {
            setCurrentPassword(value);
            setIdle();
          }}
          autoComplete="current-password"
        />
      ) : null}
      <TextField
        label="New password"
        type="password"
        value={newPassword}
        onChange={(value) => {
          setNewPassword(value);
          setIdle();
        }}
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <TextField
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={(value) => {
          setConfirmPassword(value);
          setIdle();
        }}
        autoComplete="new-password"
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={!canSubmit}>
          {status === "saving" ? pendingLabel : submitLabel}
        </Button>
        {status === "saved" && successNote ? (
          <SavedNote>{successNote}</SavedNote>
        ) : null}
      </div>
    </form>
  );
}
