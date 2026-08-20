"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveVentureAction,
  setActiveVentureAction,
} from "@/lib/actions/founder-actions";

import type { VentureActionsProps } from "../types";

type PendingAction = "set-active" | "archive" | null;

export function useVentureActions({
  ventureId,
}: Pick<VentureActionsProps, "ventureId">) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSetActive() {
    setError(null);
    setPendingAction("set-active");
    startTransition(async () => {
      const result = await setActiveVentureAction(ventureId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function handleArchive() {
    setError(null);
    setPendingAction("archive");
    startTransition(async () => {
      const result = await archiveVentureAction(ventureId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return {
    isBusy: isPending,
    isSettingActive: pendingAction === "set-active" && isPending,
    isArchiving: pendingAction === "archive" && isPending,
    error,
    handleSetActive,
    handleArchive,
  };
}
