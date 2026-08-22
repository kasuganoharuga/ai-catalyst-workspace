/**
 * Shown in place of a feature that touches the Mentor's real account
 * rather than their sandbox — password, identity fields — while they're
 * previewing the Founder flow. Exiting preview is the only way back to
 * these; see app/(app)/layout.tsx's FounderPreviewBanner.
 */
export function PreviewLockedNotice({ feature }: { feature: string }) {
  return (
    <div className="mt-6 max-w-2xl rounded-xl border border-border bg-muted/30 p-5">
      <p className="text-sm font-semibold text-foreground">
        Not available while previewing
      </p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {feature} belongs to your real Mentor account, not this sandbox — exit
        preview (top of the page) to change it.
      </p>
    </div>
  );
}
