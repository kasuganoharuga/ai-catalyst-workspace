"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { revokeMcpConnectionAction } from "@/lib/actions/founder-actions";

import { connectionCopy, errorCopy, toastCopy } from "../../lib/copy";

/** Ends server-side access — disconnecting in Claude alone does not. Outline, not destructive. */
export function DisconnectButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeMcpConnectionAction();
          if (!result.ok) {
            toast.error(toastCopy.actionFailedTitle, {
              description: result.message ?? errorCopy.generic,
            });
            return;
          }
          toast.success(connectionCopy.disconnectDone);
          router.refresh();
        })
      }
    >
      {isPending
        ? connectionCopy.disconnectPending
        : connectionCopy.disconnectCta}
    </Button>
  );
}
