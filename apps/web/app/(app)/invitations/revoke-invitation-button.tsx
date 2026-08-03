"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { revokeFounderInvitationAction } from "@/lib/actions/mentor-actions";
import { Button } from "@/components/ui/button";

import { mentorInvitationsCopy } from "../lib/copy";

export function RevokeInvitationButton({
  invitationId,
}: {
  invitationId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeFounderInvitationAction(invitationId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRevoke}
        disabled={isPending}
      >
        {isPending
          ? mentorInvitationsCopy.revokePending
          : mentorInvitationsCopy.revokeCta}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
