"use client";

import { useRouter } from "next/navigation";
import { useTransition, type CSSProperties } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startModuleAttemptAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { errorCopy, retryCopy, toastCopy } from "../lib/copy";

/**
 * Opens (or resumes) a writable Attempt for a Module. Used after
 * validation_failed clears active_attempt_id — without this, Claude cannot
 * save updates even though the module still reads as in progress.
 */
export function StartModuleAttemptButton({
  programRunModuleId,
  label = retryCopy.cta,
  pendingLabel = retryCopy.pending,
  className,
  size = "lg",
  variant = "default",
  style,
}: {
  programRunModuleId: string;
  label?: string;
  pendingLabel?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary";
  style?: CSSProperties;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startModuleAttemptAction(programRunModuleId);
      if (!result.ok) {
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message ?? errorCopy.generic,
        });
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleClick}
      disabled={isPending}
      style={style}
      className={cn(className)}
    >
      {isPending ? pendingLabel : label}
    </Button>
  );
}
