"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resetModuleProgressAction } from "@/lib/actions/founder-actions";

/**
 * Local/staging testing convenience — module-detail-body.tsx only
 * renders this when APP_ENV is local or staging. Wipes this Module's
 * attempts, confirmed Responses, artefacts and prep material, and every
 * Module after it in the same Run, back to never-started.
 */
export function ResetModuleButton({
  programRunModuleId,
  moduleTitle,
}: {
  programRunModuleId: string;
  moduleTitle: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleReset() {
    const confirmed = window.confirm(
      `Reset "${moduleTitle}" and every module after it? This permanently deletes their attempts, ` +
        "answers, artefacts and prep material. This cannot be undone.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await resetModuleProgressAction(programRunModuleId);
      if (!result.ok) {
        toast.error("Reset failed", { description: result.message });
        return;
      }
      toast.success(`"${moduleTitle}" reset.`, {
        description:
          "This module and everything after it are back to never-started.",
      });
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={handleReset}
      disabled={isPending}
    >
      {isPending ? "Resetting…" : "Reset (test)"}
    </Button>
  );
}
