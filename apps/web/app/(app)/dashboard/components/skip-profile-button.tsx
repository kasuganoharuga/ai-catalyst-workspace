"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { skipProfilePromptAction } from "@/lib/actions/founder-actions";

import { dashboardCopy } from "../../lib/copy";

/** Remembers skip so the profile card stops reappearing; styled as a quiet link. */
export function SkipProfileButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await skipProfilePromptAction();
          router.refresh();
        })
      }
      className="text-sm font-medium text-surface-inverse-foreground/60 underline-offset-4 transition hover:text-surface-inverse-foreground hover:underline disabled:opacity-50"
    >
      {dashboardCopy.actionProfileSkip}
    </button>
  );
}
