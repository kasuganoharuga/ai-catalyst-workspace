"use client";

import type { CSSProperties } from "react";
import { Toaster as SonnerToaster } from "sonner";

/**
 * App-wide toast host, themed from the same tokens as everything else.
 *
 * The colours come through sonner's own CSS variables rather than utility
 * classes. Sonner styles `[data-sonner-toast]` itself, at the same
 * specificity a single utility class has, and its stylesheet wins on order
 * — so a `bg-popover` class silently loses and the toast stays light while
 * the rest of the page goes dark. Feeding the tokens into `--normal-*`
 * puts them where sonner already looks, and it keeps working through the
 * `.dark` class because each `var()` resolves against the cascade at the
 * toast's own position in the tree.
 *
 * Bottom-right, not top-centre: the primary actions on these pages sit low
 * in the card, so the message lands near where the founder is looking.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group rounded-lg shadow-lg",
          // Important, and not optional: this is a border *colour* landing
          // on the same element sonner has already given one, so without it
          // an error toast looks exactly like a success.
          error: "border-destructive/50!",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground",
          actionButton:
            "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground",
          cancelButton:
            "rounded-md border border-border px-2.5 py-1 text-xs font-medium",
        },
      }}
    />
  );
}
