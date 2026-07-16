"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VentureActions({
  ventureId,
  isArchived,
  isSelected,
  canArchive,
}: {
  ventureId: string;
  isArchived: boolean;
  isSelected: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetActive() {
    setError(null);
    setIsBusy(true);

    const response = await fetch("/api/active-context", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ventureId }),
    });

    setIsBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to switch Venture.");
      return;
    }

    router.refresh();
  }

  async function handleArchive() {
    setError(null);
    setIsBusy(true);

    const response = await fetch(`/api/ventures/${ventureId}/archive`, {
      method: "POST",
    });

    setIsBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to archive Venture.");
      return;
    }

    router.refresh();
  }

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
            {isArchived ? "View history" : "Set active"}
          </button>
        )}
        {!isArchived && canArchive ? (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isBusy}
            className="rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-950 transition hover:border-stone-950 disabled:opacity-50"
          >
            {isBusy ? "Archiving..." : "Archive"}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
