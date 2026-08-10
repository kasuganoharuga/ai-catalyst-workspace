"use client";

import type { CSSProperties } from "react";
import { Toaster as SonnerToaster } from "sonner";

/**
 * App-wide toast host themed via sonner CSS variables.
 *
 * Utility classes lose to sonner's stylesheet order. Bottom-right keeps messages
 * near the primary actions at the bottom of each card.
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
