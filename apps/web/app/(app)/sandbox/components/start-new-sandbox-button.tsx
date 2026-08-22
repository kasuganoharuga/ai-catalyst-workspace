"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createFounderSandboxAction } from "@/lib/actions/founder-preview-actions";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { founderPreviewCopy } from "../../lib/copy";

/**
 * Replaces the Mentor's current sandbox with a brand-new one — the old one
 * becomes permanently unreachable through the product (see
 * createFounderSandboxAction), so this goes through a confirmation dialog
 * rather than firing immediately, the same way AssistantSection confirms
 * before a switch that revokes the current AI connection.
 */
export function StartNewSandboxButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await createFounderSandboxAction();
      if (!result.ok) {
        toast.error("Couldn't start a new sandbox", {
          description: result.message,
        });
        return;
      }
      setOpen(false);
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        {founderPreviewCopy.newSandboxCta}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!isPending) setOpen(next);
        }}
      >
        <DialogContent showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>
              {founderPreviewCopy.newSandboxConfirmTitle}
            </DialogTitle>
            <DialogDescription>
              {founderPreviewCopy.newSandboxConfirmBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {founderPreviewCopy.newSandboxConfirmCancel}
            </Button>
            <Button type="button" disabled={isPending} onClick={handleConfirm}>
              {isPending
                ? "Starting…"
                : founderPreviewCopy.newSandboxConfirmCta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
