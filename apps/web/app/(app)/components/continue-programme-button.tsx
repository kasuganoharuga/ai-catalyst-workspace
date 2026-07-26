"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ensureActiveProgramDestinationAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { errorCopy, toastCopy } from "../lib/copy";

/**
 * Ensure/resume the active venture's Program Run and navigate to the next
 * actionable module. Shared by the connection page and the dashboard.
 */
export function ContinueProgrammeButton({
  label = "Continue",
  pendingLabel = "Setting things up…",
  size = "lg",
  className,
}: {
  label?: string;
  pendingLabel?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Every failure here is a click that didn't go anywhere, and every one of
  // them is recoverable by clicking again — a toast says so and gets out of
  // the way, where the old inline paragraph pushed the page around and then
  // sat there after it stopped being true.
  function fail(description: string) {
    toast.error(toastCopy.actionFailedTitle, { description });
  }

  function handleClick() {
    startTransition(async () => {
      const result = await ensureActiveProgramDestinationAction();

      switch (result.status) {
        case "ready":
          router.push(result.destination);
          router.refresh();
          return;
        case "not_connected":
          router.refresh();
          fail(errorCopy.notConnected);
          return;
        case "no_active_venture":
          router.refresh();
          fail(errorCopy.noActiveVenture);
          return;
        case "venture_unavailable":
          router.refresh();
          fail(errorCopy.ventureUnavailable);
          return;
        case "setup_failed":
          router.refresh();
          fail(errorCopy.setupFailed);
          return;
        case "error":
          fail(result.message ?? errorCopy.generic);
          return;
      }
    });
  }

  return (
    <Button
      type="button"
      size={size}
      onClick={handleClick}
      disabled={isPending}
      className={cn(className)}
    >
      {isPending ? pendingLabel : label}
    </Button>
  );
}
