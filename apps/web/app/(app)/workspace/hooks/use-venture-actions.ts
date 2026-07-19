"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { VentureActionsProps } from "../types";

type PendingAction = "set-active" | "archive" | null;

export function useVentureActions({
  ventureId,
}: Pick<VentureActionsProps, "ventureId">) {
  const router = useRouter();
  // Tracks *which* action is running, not just whether one is — the two
  // buttons share this hook instance, so a plain boolean would make the
  // Archive button's label flip to "Archiving..." while Set active runs.
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSetActive() {
    setError(null);
    setPendingAction("set-active");

    const response = await fetch("/api/active-context", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ventureId }),
    });

    setPendingAction(null);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to switch Venture.");
      return;
    }

    router.refresh();
  }

  async function handleArchive() {
    setError(null);
    setPendingAction("archive");

    const response = await fetch(`/api/ventures/${ventureId}/archive`, {
      method: "POST",
    });

    setPendingAction(null);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to archive Venture.");
      return;
    }

    router.refresh();
  }

  return {
    isBusy: pendingAction !== null,
    isSettingActive: pendingAction === "set-active",
    isArchiving: pendingAction === "archive",
    error,
    handleSetActive,
    handleArchive,
  };
}
