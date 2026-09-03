"use client";

import { TriangleAlert } from "lucide-react";
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
          </DialogHeader>

          {/* The consequence carries the destructive callout rather than
              reading as ordinary body copy: losing the way back to the
              current sandbox is the whole reason this dialog exists. Same
              treatment as module1-brief-step.tsx's hard-prerequisite
              warning. Styled through DialogDescription's own className
              (not asChild) so cn()'s tailwind-merge resolves
              text-destructive against the component's default
              text-muted-foreground — concatenating the two would leave
              which one wins up to CSS source order. */}
          <DialogDescription className="flex gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-destructive">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{founderPreviewCopy.newSandboxConfirmBody}</span>
          </DialogDescription>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {founderPreviewCopy.newSandboxConfirmCancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirm}
            >
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
