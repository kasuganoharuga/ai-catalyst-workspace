"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { revokeMcpConnectionAction } from "@/lib/actions/founder-actions";

import { resolveAssistant } from "../../lib/assistant";
import { connectionCopy, errorCopy, toastCopy } from "../../lib/copy";

/**
 * Ends server-side access — removing the connector in the assistant alone
 * does not. Outline, not destructive.
 */
export function DisconnectButton({
  provider,
}: {
  provider: PreferredAiProvider | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { copy } = resolveAssistant(provider);

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
          toast.success(copy.disconnectDone);
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
