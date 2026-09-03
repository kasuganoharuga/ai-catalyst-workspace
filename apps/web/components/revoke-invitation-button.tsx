"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions/action-result";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { mentorInvitationsCopy, toastCopy } from "@/app/(app)/lib/copy";

// Shared by the Mentor's own invitations page and the Admin invitations
// panel (both founder- and mentor-invite tabs) — the dialog and copy are
// identical between personas, so the caller supplies only which Server
// Action actually revokes the row.
export function RevokeInvitationButton({
  invitationId,
  onRevoke,
}: {
  invitationId: string;
  onRevoke: (invitationId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    if (isPending) return;
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onRevoke(invitationId);
      if (!result.ok) {
        setError(result.message);
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message,
        });
        return;
      }
      setOpen(false);
      toast.success(mentorInvitationsCopy.inviteRevoked);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={isPending}
      >
        {mentorInvitationsCopy.revokeCta}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleCancel();
          else setOpen(true);
        }}
      >
        <DialogContent showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>
              {mentorInvitationsCopy.revokeConfirmTitle}
            </DialogTitle>
            <DialogDescription>
              {mentorInvitationsCopy.revokeConfirmBody}
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
              onClick={handleCancel}
              disabled={isPending}
            >
              {mentorInvitationsCopy.revokeConfirmCancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending
                ? mentorInvitationsCopy.revokePending
                : mentorInvitationsCopy.revokeConfirmSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
