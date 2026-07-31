/** Warn before one-assistant-at-a-time disconnects the current connection. */
export function ReplacementWarning({ clientName }: { clientName: string }) {
  return (
    <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-foreground">
      This will disconnect <span className="font-medium">{clientName}</span>.
      You can connect one AI assistant at a time, and your saved work is not
      affected either way.
    </p>
  );
}
