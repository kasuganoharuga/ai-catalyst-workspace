"use client";

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
      <div className="flex gap-2">
        {isSelected ? (
          <span className="rounded-full border border-accent bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground">
            Currently selected
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSetActive}
            disabled={isBusy}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground disabled:opacity-50"
          >
            {isSettingActive
              ? "Switching..."
              : isArchived
                ? "View history"
                : "Set active"}
          </button>
        )}
        {!isArchived && canArchive ? (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isBusy}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground disabled:opacity-50"
          >
            {isArchiving ? "Archiving..." : "Archive"}
          </button>
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
