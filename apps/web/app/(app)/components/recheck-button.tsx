"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cn } from "@/lib/utils";

/**
 * Re-reads everything on the page from the database. This is how the
 * website stays honest with what happened over in Claude: all state lives
 * server-side, so one refresh is a full re-sync — no polling, no local
 * cache to go stale.
 */
export function RecheckButton({
  label = "Re-check status",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  function handleClick() {
    setClicked(true);
    startTransition(() => {
      router.refresh();
    });
  }

  const busy = clicked && isPending;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={cn(
        "rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60",
        className,
      )}
    >
      {busy ? "Checking…" : label}
    </button>
  );
}
