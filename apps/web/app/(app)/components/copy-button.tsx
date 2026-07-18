"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied!",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied (e.g. non-secure context) — leave the
      // value visible on screen so the user can still select it manually.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "shrink-0 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted",
        copied && "border-transparent bg-accent text-accent-foreground",
        className,
      )}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
