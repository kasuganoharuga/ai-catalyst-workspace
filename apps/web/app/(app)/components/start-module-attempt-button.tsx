"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { startModuleAttemptAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

/**
 * Opens (or resumes) a writable Attempt for a Module. Used after
 * validation_failed clears active_attempt_id — without this, Claude cannot
 * save updates even though the module still reads as in progress.
 */
export function StartModuleAttemptButton({
  programRunModuleId,
  label = "Start another pass",
  pendingLabel = "Opening…",
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
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startModuleAttemptAction(programRunModuleId);
      if (!result.ok) {
        setError(
          result.message ??
            "That didn't work — give it another try in a moment.",
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleClick}
        disabled={isPending}
        style={style}
      >
        {isPending ? pendingLabel : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
