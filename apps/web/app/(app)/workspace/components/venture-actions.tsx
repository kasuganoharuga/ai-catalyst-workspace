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
          <span className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
            Currently selected
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSetActive}
            disabled={isBusy}
            className="rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-950 transition hover:border-stone-950 disabled:opacity-50"
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
            className="rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-950 transition hover:border-stone-950 disabled:opacity-50"
          >
            {isArchiving ? "Archiving..." : "Archive"}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
