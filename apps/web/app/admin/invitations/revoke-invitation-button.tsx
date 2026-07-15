"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeInvitationButton({
  invitationId,
}: {
  invitationId: string;
}) {
  const router = useRouter();
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    setError(null);
    setIsRevoking(true);

    const response = await fetch(
      `/api/admin/invitations/${invitationId}/revoke`,
      { method: "POST" },
    );

    setIsRevoking(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to revoke invitation.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRevoke}
        disabled={isRevoking}
        className="rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-950 transition hover:border-stone-950 disabled:opacity-50"
      >
        {isRevoking ? "Revoking..." : "Revoke"}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
