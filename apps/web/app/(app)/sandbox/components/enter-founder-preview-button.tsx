"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { enterFounderPreviewAction } from "@/lib/actions/founder-preview-actions";

import { Button } from "@/components/ui/button";

import { founderPreviewCopy } from "../../lib/copy";

export function EnterFounderPreviewButton({
  label = founderPreviewCopy.enterCta,
}: {
  /** Callers pick continueCta once a sandbox already exists — same action either way. */
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await enterFounderPreviewAction();
      if (!result.ok) {
        toast.error("Couldn't start the Founder preview", {
          description: result.message,
        });
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      {isPending ? "Setting up…" : label}
    </Button>
  );
}
