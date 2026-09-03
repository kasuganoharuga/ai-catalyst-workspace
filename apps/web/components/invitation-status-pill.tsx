const STATUS_TONE: Record<string, string> = {
  pending: "border border-foreground/25 text-foreground",
  accepted: "bg-primary text-primary-foreground",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

/**
 * Same visual vocabulary as StatusBadge (app/(app)/components/status-badge.tsx)
 * — solid pill, uppercase, tracked-out label — kept separate rather than
 * reusing that component directly: it's typed around ModuleDisplayStatus's
 * tone set, which has no member for an accepted/revoked/expired Invitation.
 */
export function InvitationStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_TONE[status] ?? STATUS_TONE.pending}`}
    >
      {status}
    </span>
  );
}
