"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * The Founder's sign-off. Claude produces the output and gets it through
 * its checks, but the module isn't done — and the next one doesn't open —
 * until the person whose business it is has looked at what was written
 * and said so here.
 */
export function ConfirmCompletionCard({
  programRunModuleId,
  artifactName,
  nextModuleTitle,
}: {
  programRunModuleId: string;
  artifactName: string | null;
  nextModuleTitle: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/modules/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programRunModuleId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          body?.error?.message ??
            "That didn't work — give it another try in a moment.",
        );
        setBusy(false);
        return;
      }
      router.refresh();
      // No setBusy(false) on success: the refresh replaces this card with
      // the completed state.
    } catch {
      setError("That didn't work — give it another try in a moment.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface-inverse px-7 py-6 text-surface-inverse-foreground">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brand-lime">
        Your call
      </p>
      <h2 className="mt-3 font-serif text-2xl font-medium leading-snug tracking-[-0.01em]">
        Happy with what came out?
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-surface-inverse-foreground/60">
        {artifactName ? (
          <>
            Claude has saved your{" "}
            <span className="font-medium text-surface-inverse-foreground">
              {artifactName}
            </span>{" "}
            and it passed its checks. Read it over — confirming marks this
            module done
          </>
        ) : (
          <>The output passed its checks. Confirming marks this module done</>
        )}
        {nextModuleTitle ? (
          <>
            {" "}
            and opens{" "}
            <span className="font-medium text-surface-inverse-foreground">
              {nextModuleTitle}
            </span>
            .
          </>
        ) : (
          "."
        )}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="button" size="lg" onClick={handleConfirm} disabled={busy}>
          {busy ? "Confirming…" : "Confirm and continue"}
        </Button>
        <p className="text-xs text-surface-inverse-foreground/50">
          Not happy with it? Ask Claude to revise it — nothing is locked in
          until you confirm.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
