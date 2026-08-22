"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  exitFounderPreviewAction,
  restartFounderSandboxAction,
} from "@/lib/actions/founder-preview-actions";

import { Button } from "@/components/ui/button";

import { founderPreviewCopy } from "../lib/copy";

/** Shown across the whole (app) shell only while a Mentor is previewing — see app/(app)/layout.tsx. */
export function FounderPreviewBanner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleExit() {
    startTransition(async () => {
      const result = await exitFounderPreviewAction();
      if (!result.ok) {
        toast.error("Couldn't exit preview", { description: result.message });
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function handleRestart() {
    const confirmed = window.confirm(founderPreviewCopy.restartConfirm);
    if (!confirmed) return;

    startTransition(async () => {
      const result = await restartFounderSandboxAction();
      if (!result.ok) {
        toast.error("Couldn't restart the sandbox", {
          description: result.message,
        });
        return;
      }
      toast.success("Sandbox restarted.", {
        description: "Starting fresh from the first module.",
      });
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-accent px-4 py-2.5 text-accent-foreground">
      <p className="text-sm font-medium">{founderPreviewCopy.bannerMessage}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleRestart}
          disabled={isPending}
          className="text-xs underline-offset-2 hover:underline disabled:opacity-50"
        >
          {founderPreviewCopy.restartCta}
        </button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExit}
          disabled={isPending}
        >
          {founderPreviewCopy.exitCta}
        </Button>
      </div>
    </div>
  );
}
