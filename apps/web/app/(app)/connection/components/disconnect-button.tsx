"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { revokeMcpConnectionAction } from "@/lib/actions/founder-actions";

import { connectionCopy, errorCopy, toastCopy } from "../../lib/copy";

/**
 * The Founder's own way to end the connection.
 *
 * Needed because disconnecting inside Claude is invisible here: it is a
 * client-side change with no server-side representation, so the token
 * stayed live and the website went on reporting a connection that the
 * Founder believed they had already ended.
 *
 * `outline` rather than destructive: nothing is lost, and reconnecting is
 * a two-minute job. Styling it as a danger would overstate the stakes of
 * a reversible action.
 */
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
