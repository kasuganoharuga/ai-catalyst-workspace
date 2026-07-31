"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { confirmModuleCompletionAction } from "@/lib/actions/founder-actions";

import { errorCopy, toastCopy } from "../../../lib/copy";

/**
 * Shared confirm action for both modules' Confirm steps — calls the
 * confirm-completion server action, toasts success or failure, then
 * refreshes the page so newly unlocked state shows up.
 */
export function useConfirmModuleCompletion({
  programRunModuleId,
  nextModuleTitle,
}: {
  programRunModuleId: string | null;
  nextModuleTitle: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!programRunModuleId) return;
    startTransition(async () => {
      const result = await confirmModuleCompletionAction(programRunModuleId);
      if (!result.ok) {
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message ?? errorCopy.generic,
        });
        return;
      }
      toast.success(toastCopy.moduleConfirmed, {
        description: nextModuleTitle
          ? toastCopy.moduleConfirmedNext(nextModuleTitle)
          : undefined,
      });
      router.refresh();
    });
  }

  return { isPending, handleConfirm };
}
