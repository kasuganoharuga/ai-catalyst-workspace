"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { skipProfilePromptAction } from "@/lib/actions/founder-actions";

import { dashboardCopy } from "../../lib/copy";

/**
 * The escape hatch that makes the profile step a suggestion rather than a
 * gate.
 *
 * Without it, "skippable" was only true in the sense that the sidebar
 * still worked — the card kept asking on every visit, which reads as
 * something you have to deal with. This remembers the answer.
 *
 * Styled as a quiet link beside the primary button: skipping should be
 * available, not encouraged.
 */
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
