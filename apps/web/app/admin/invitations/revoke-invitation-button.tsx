"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  revokeInvitationAction,
  revokeMentorInvitationAction,
} from "@/lib/actions/admin-actions";

export function RevokeInvitationButton({
  invitationId,
  inviteRole,
}: {
  invitationId: string;
  inviteRole: "founder" | "mentor";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const revoke =
        inviteRole === "mentor"
          ? revokeMentorInvitationAction
          : revokeInvitationAction;

      const result = await revoke(invitationId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRevoke}
        disabled={isPending}
        className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground disabled:opacity-50"
      >
        {isPending ? "Revoking..." : "Revoke"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
