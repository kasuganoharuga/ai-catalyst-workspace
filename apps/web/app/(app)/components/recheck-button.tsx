"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

/**
 * Re-reads everything on the page from the database. This is how the
 * website stays honest with what happened over in Claude: all state lives
 * server-side, so one refresh is a full re-sync — no polling, no local
 * cache to go stale.
 */
export function RecheckButton({
  label = "Re-check status",
  className,
  variant = "outline",
  size,
}: {
  label?: string;
  className?: string;
  variant?: "outline" | "default" | "secondary";
  size?: "default" | "sm" | "lg";
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
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={busy}
      className={className}
    >
      <RotateCw aria-hidden="true" className={busy ? "animate-spin" : ""} />
      {busy ? "Checking…" : label}
    </Button>
  );
}
