"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/program-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ventureId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          body?.error?.message ??
            "That didn't work — give it another try in a moment.",
        );
        setBusy(false);
        return;
      }
      router.refresh();
      // Deliberately no setBusy(false) on success: the refresh re-renders
      // this whole area with real Run state, and this button disappears.
    } catch {
      setError("That didn't work — give it another try in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <Button type="button" size={size} onClick={handleClick} disabled={busy}>
        {busy ? "Setting things up…" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
