/**
 * Shown in place of a feature the sandbox doesn't offer while a Mentor is
 * previewing the Founder flow.
 *
 * Two different reasons lead here, and `body` exists so the notice can tell
 * the truth about which one applies. The default covers the original case:
 * the feature writes the Mentor's real account rather than their sandbox
 * (password, identity fields — both keyed by user_id, not Workspace), so
 * exiting preview really is the way to reach it. Company profile is the
 * other kind: it *is* sandbox data (company_profiles is keyed by
 * workspace_id), and a Mentor has no company profile of their own to go
 * back to — it's left out because nothing reads it. Saying "belongs to your
 * real Mentor account" there would be plainly false.
 *
 * See app/(app)/layout.tsx's FounderPreviewBanner for the way out.
 */
export function PreviewLockedNotice({
  feature,
  body,
}: {
  feature: string;
  body?: string;
}) {
  return (
    <div className="mt-6 max-w-2xl rounded-xl border border-border bg-muted/30 p-5">
      <p className="text-sm font-semibold text-foreground">
        Not available while previewing
      </p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {body ??
          `${feature} belongs to your real Mentor account, not this sandbox — exit preview (top of the page) to change it.`}
      </p>
    </div>
  );
}
