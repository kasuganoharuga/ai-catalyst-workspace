"use client";

import { Loader2 } from "lucide-react";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";

import { resolveAssistant } from "../../lib/assistant";
import { connectionCopy } from "../../lib/copy";
import { useConnectionWatch } from "../hooks/use-connection-watch";

/**
 * Poll UI for connection approval — polling lives in useConnectionWatch.
 *
 * The hook itself is provider-agnostic: it only asks whether anything has
 * authorised yet, so it needs no changes to notice a return from either
 * assistant. Only the wording here knows which one is expected.
 */
export function ConnectionWatcher({
  provider,
}: {
  provider: PreferredAiProvider | null;
}) {
  const { state, retry } = useConnectionWatch();
  const { copy } = resolveAssistant(provider);

  if (state.phase === "failed") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4">
        <p className="text-sm font-semibold text-foreground">
          {connectionCopy.repairTitle}
        </p>
        <p role="alert" className="mt-1 text-sm leading-6 text-foreground">
          {state.message}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {connectionCopy.repairBody}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={retry}
        >
          {connectionCopy.watchRetry}
        </Button>
      </div>
    );
  }

  const advancing = state.phase === "advancing";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-4">
      <Loader2
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {advancing ? copy.connectedTitle : copy.waitingTitle}
        </p>
        {/* aria-live for screen-reader state changes */}
        <p
          aria-live="polite"
          className="mt-1 text-sm leading-6 text-muted-foreground"
        >
          {advancing ? copy.connectedBody : copy.waitingBody}
        </p>
      </div>
    </div>
  );
}
