"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { confirmModuleCompletionAction } from "@/lib/actions/founder-actions";
import { posthog } from "@/lib/analytics/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

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
  moduleKey,
  programRunModuleId,
  nextModuleTitle,
}: {
  moduleKey: string;
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
      // Fired before navigation, at the confirm click itself — this is the
      // event a PostHog Survey targets for a post-completion thumbs-up/down.
      // See ANALYTICS_EVENTS.moduleCompleted for why URL matching can't
      // stand in for this.
      posthog.capture(ANALYTICS_EVENTS.moduleCompleted, { moduleKey });
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
