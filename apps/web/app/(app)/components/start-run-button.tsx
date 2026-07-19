"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { startProgramRunAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

/**
 * One-time bootstrap: creates (or finds) the Program Run for the active
 * Venture via the existing POST /api/program-runs, then re-reads the page.
 * Idempotent server-side, so a double-click or a retry after a network
 * blip can't create a second Run.
 */
export function StartRunButton({
  ventureId,
  label = "Unlock Module 0",
  className,
  size = "lg",
}: {
  ventureId: string;
  label?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startProgramRunAction(ventureId);
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
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Setting things up…" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
