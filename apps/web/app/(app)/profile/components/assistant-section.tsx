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
 * Where the first-run choice can be changed.
 *
 * Switching signs the current assistant out. That is a deliberate choice
 * rather than a technical necessity — the preference and the OAuth grant
 * are independent, and leaving the old connection alive would work — but
 * only one assistant can be connected at a time, so a founder who switches
 * and keeps a live connection to the other one is looking at instructions
 * for a product that is not the one talking to their workspace. Ending it
 * here means the page they land on next tells the truth.
 *
 * Because it is destructive, it goes through a confirmation rather than
 * happening on the first click.
 */
export function AssistantSection({
  current,
  connectedProvider,
}: {
  current: PreferredAiProvider | null;
  /**
   * Which vendor is actually connected, by redirect host. `"other"` and
   * `null` both mean we cannot name what is connected — the revoke still
   * runs, but the confirmation can't promise which product loses access.
   */
  connectedProvider: "claude" | "openai" | "other" | null;
}) {
  const router = useRouter();
  const [pendingSwitch, setPendingSwitch] = useState<Assistant | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = resolveAssistant(current);

  // Named by vendor rather than by the client's own display name: DCR lets
  // a client call itself anything, and "Claude (seeded test client) will be
  // signed out" is not a sentence to put in front of a founder.
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
      // Preference first. If the revoke then fails, the founder is set up
      // for the new assistant with the old one still connected — a state
      // the connection page already explains. The other order would take
      // their working connection away and leave them nothing for it.
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
          // Not while the revoke is in flight: closing would leave the
          // founder with no idea whether their connection survived.
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
                        // Falls back to the assistant they are set up for
                        // when the connected client is unrecognised — that
                        // is the one whose instructions they've been given.
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
