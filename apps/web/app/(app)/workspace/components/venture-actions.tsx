"use client";

import { Button } from "@/components/ui/button";

import { useVentureActions } from "../hooks/use-venture-actions";
import type { VentureActionsProps } from "../types";

export function VentureActions({
  ventureId,
  isArchived,
  isSelected,
  canArchive,
}: VentureActionsProps) {
  const {
    isBusy,
    isSettingActive,
    isArchiving,
    error,
    handleSetActive,
    handleArchive,
  } = useVentureActions({ ventureId });

  return (
    <div className="flex flex-col items-end gap-1">
      {/* Pill buttons replaced with the app's own Button, and "..." with a
          real ellipsis, so this row stops looking like a different app. */}
      <div className="flex gap-2">
        {isSelected ? (
          <span className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Currently selected
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSetActive}
            disabled={isBusy}
          >
            {isSettingActive
              ? "Switching…"
              : isArchived
                ? "View history"
                : "Set active"}
          </Button>
        )}
        {!isArchived && canArchive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleArchive}
            disabled={isBusy}
          >
            {isArchiving ? "Archiving…" : "Archive"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
