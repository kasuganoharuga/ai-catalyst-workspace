"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/app/(app)/components/copy-button";
import { toastCopy } from "@/app/(app)/lib/copy";
import { resetUserPasswordAction } from "@/lib/actions/admin-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { adminActionCopy } from "../lib/copy";

/**
 * Break-glass recovery while there is no self-serve reset — see
 * `resetUserPassword` in packages/services for why this is manual.
 *
 * The dialog has two faces: confirm first, then show the temporary password
 * in place of the confirmation. They are the same dialog rather than a
 * follow-up toast because the password is shown exactly once and a toast
 * dismisses itself.
 */
export function ResetPasswordButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    // Cleared on close, not on reopen: leaving it in state would put a live
    // credential one stray click away from the next user's row.
    setTemporaryPassword(null);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await resetUserPasswordAction(userId);
      if (!result.ok) {
        setError(result.message);
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message,
        });
        return;
      }
      setTemporaryPassword(result.temporaryPassword);
      toast.success(adminActionCopy.passwordReset);
      // No router.refresh(): a reset changes nothing the directory renders,
      // and re-rendering underneath an open dialog is pure churn.
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setError(null);
          setTemporaryPassword(null);
          setOpen(true);
        }}
        disabled={isPending}
      >
        Reset password
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose();
          else setOpen(true);
        }}
      >
        <DialogContent showCloseButton={!isPending}>
          {temporaryPassword === null ? (
            <>
              <DialogHeader>
                <DialogTitle>Reset password?</DialogTitle>
                <DialogDescription>
                  Issue a new temporary password for{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  Their current password stops working, and they are signed out
                  everywhere — including any connected AI assistant.
                </DialogDescription>
              </DialogHeader>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending}
                >
                  {isPending ? "Resetting…" : "Reset password"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Temporary password</DialogTitle>
                <DialogDescription>
                  Share this with{" "}
                  <span className="font-medium text-foreground">{email}</span>{" "}
                  yourself — there is no email delivery yet. Ask them to sign in
                  and set their own password from Account security.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-accent bg-accent p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">
                  Shown once — copy it now
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="break-all font-mono text-sm text-foreground">
                    {temporaryPassword}
                  </p>
                  <CopyButton value={temporaryPassword} className="shrink-0" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Closing this dialog discards it. If you lose it, reset again.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" onClick={handleClose}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
