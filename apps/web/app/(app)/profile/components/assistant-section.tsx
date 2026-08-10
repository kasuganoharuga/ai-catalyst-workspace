"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  revokeMcpConnectionAction,
  setPreferredAiProviderAction,
} from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { AssistantMark } from "../../components/assistant-mark";
import type { Assistant } from "../../lib/assistant";
import { ASSISTANT_CHOICES, resolveAssistant } from "../../lib/assistant";
import {
  assistantSectionCopy,
  errorCopy,
  onboardingCopy,
  toastCopy,
} from "../../lib/copy";

/**
 * Where the first-run assistant choice can be changed.
 *
 * Switching revokes the current connection so instructions match the product talking
 * to the workspace. Destructive — goes through confirmation.
 */
export function AssistantSection({
  current,
  connectedProvider,
}: {
  current: PreferredAiProvider | null;
  /** Live grant by redirect host; `"other"`/`null` = cannot name what disconnects. */
  connectedProvider: "claude" | "openai" | "other" | null;
}) {
  const router = useRouter();
  const [pendingSwitch, setPendingSwitch] = useState<Assistant | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = resolveAssistant(current);

  const connected =
    connectedProvider === "claude" || connectedProvider === "openai"
      ? resolveAssistant(connectedProvider)
      : null;
  const hasConnection = connectedProvider !== null;

  async function confirmSwitch() {
    if (!pendingSwitch) return;
    const next = pendingSwitch;
    setSaving(true);

    try {
      // Preference first — revoke failure leaves mismatch the connection page explains.
      const saved = await setPreferredAiProviderAction(next.provider);
      if (!saved.ok) {
        toast.error(toastCopy.actionFailedTitle, {
          description: saved.message ?? errorCopy.generic,
        });
        setSaving(false);
        return;
      }

      if (hasConnection) {
        const revoked = await revokeMcpConnectionAction();
        if (!revoked.ok) {
          toast.error(toastCopy.actionFailedTitle, {
            description: revoked.message ?? errorCopy.generic,
          });
          setSaving(false);
          return;
        }
      }

      toast.success(assistantSectionCopy.switched(next.name));
      setPendingSwitch(null);
      router.refresh();
    } catch {
      toast.error(toastCopy.actionFailedTitle, {
        description: errorCopy.generic,
      });
    }
    setSaving(false);
  }

  return (
    <section className="mt-14">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {assistantSectionCopy.heading}
      </h2>

      <div className="mt-3 max-w-2xl border-t border-border pt-6">
        <p className="text-sm leading-6 text-muted-foreground">
          {assistantSectionCopy.body} {onboardingCopy.assistantPlatformNote}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {ASSISTANT_CHOICES.map((assistant) => {
            const isCurrent = assistant.provider === chosen.provider;
            return (
              <div
                key={assistant.provider}
                className={cn(
                  "rounded-lg border p-4",
                  isCurrent
                    ? "border-brand-lime bg-brand-lime/10"
                    : "border-border",
                )}
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <AssistantMark
                    provider={assistant.provider}
                    className="h-4 w-4 shrink-0"
                  />
                  {assistant.name}
                </p>
                {isCurrent ? (
                  <p className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {assistantSectionCopy.currentLabel}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setPendingSwitch(assistant)}
                  >
                    {assistantSectionCopy.switchCta(assistant.name)}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {connected && connected.provider !== chosen.provider ? (
          <p className="mt-4 border-l-2 border-brand-lime bg-muted/50 py-2 pl-3 text-sm leading-6 text-muted-foreground">
            {assistantSectionCopy.mismatchNote(connected.name, chosen.name)}
          </p>
        ) : !hasConnection ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <Link
              href="/connection"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {assistantSectionCopy.setupLink}
            </Link>
          </p>
        ) : null}
      </div>

      <Dialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingSwitch(null);
        }}
      >
        <DialogContent showCloseButton={!saving}>
          {pendingSwitch ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {assistantSectionCopy.confirmTitle(pendingSwitch.name)}
                </DialogTitle>
                <DialogDescription>
                  {hasConnection
                    ? assistantSectionCopy.confirmBodyConnected(
                        (connected ?? chosen).name,
                        pendingSwitch.name,
                      )
                    : assistantSectionCopy.confirmBodyDisconnected(
                        pendingSwitch.name,
                      )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setPendingSwitch(null)}
                >
                  {assistantSectionCopy.confirmCancel}
                </Button>
                <Button type="button" disabled={saving} onClick={confirmSwitch}>
                  {saving
                    ? assistantSectionCopy.confirmPending
                    : assistantSectionCopy.confirmCta(pendingSwitch.name)}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
