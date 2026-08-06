"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { confirmModuleCompletionAction } from "@/lib/actions/founder-actions";

import { errorCopy, toastCopy } from "../../../lib/copy";

/**
 * Shared confirm action for both modules' Confirm steps — calls the
 * confirm-completion server action, toasts success or failure, then goes
 * straight to the modules list. This used to just router.refresh(), which
 * left the founder looking at a second "Continue to X" link/button they had
 * to click again; navigating directly means one click both unlocks the next
 * module and lands on it.
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
      router.push("/modules");
    });
  }

  return { isPending, handleConfirm };
}
