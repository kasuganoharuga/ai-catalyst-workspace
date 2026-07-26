"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { connectionCopy } from "../../lib/copy";
import { useConnectionWatch } from "../hooks/use-connection-watch";

/**
 * Tells the founder the page is watching, and gets out of the way when it
 * succeeds — replacing the "I've connected — check now" button.
 *
 * That button was a question the page could answer itself. The founder had
 * just come back from approving access in Claude; asking them to confirm
 * what we can look up is one more decision on the step that already had
 * too many.
 *
 * All the polling lives in useConnectionWatch. This file only decides what
 * the three states look like.
 */
export function ConnectionWatcher() {
  const { state, retry } = useConnectionWatch();

  if (state.phase === "failed") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4">
        <p role="alert" className="text-sm leading-6 text-foreground">
          {state.message}
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
          {advancing
            ? connectionCopy.connectedTitle
            : connectionCopy.waitingTitle}
        </p>
        {/* aria-live so a founder using a screen reader hears the state
            change without having to go looking for it. */}
        <p
          aria-live="polite"
          className="mt-1 text-sm leading-6 text-muted-foreground"
        >
          {advancing
            ? connectionCopy.connectedBody
            : connectionCopy.waitingBody}
        </p>
      </div>
    </div>
  );
}
