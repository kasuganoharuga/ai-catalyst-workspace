"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
// No success toast: the button already flips to "Copied!", which is
// quieter and sits where the founder just clicked.
import { errorCopy } from "../lib/copy";

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
      // navigator.clipboard is undefined outside a secure context and can
      // reject when permission is denied. Failing silently here reads as a
      // dead button, so say so — the value is on screen either way, which
      // is why the recovery is genuinely "select it yourself".
      toast.error(errorCopy.copyFailed);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={className}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
