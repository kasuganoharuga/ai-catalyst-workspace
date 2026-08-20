import type { InvitationListItem } from "@ai-catalyst/shared";

import { formatShortDate } from "@/lib/format";

import { RevokeInvitationButton } from "./revoke-invitation-button";

const STATUS_TONE: Record<string, string> = {
  pending: "border border-foreground/25 text-foreground",
  accepted: "bg-primary text-primary-foreground",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

function InvitationStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_TONE[status] ?? STATUS_TONE.pending}`}
    >
      {status}
    </span>
  );
}

function describeInviter(invitation: InvitationListItem): string {
  if (!invitation.invitedByEmail) {
    return "Account no longer exists";
  }

  const who = invitation.invitedByName ?? invitation.invitedByEmail;
  return invitation.invitedByRole === "mentor" ? `${who} (mentor)` : who;
}

export function InvitationList({
  inviteRole,
  invitations,
  emptyLabel,
}: {
  inviteRole: "founder" | "mentor";
  invitations: InvitationListItem[];
  emptyLabel: string;
}) {
  if (invitations.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-card px-6 py-14 text-center">
        <p className="text-[15px] font-semibold text-foreground">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="hidden items-center gap-6 border-b border-border pb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:flex">
        <span className="min-w-0 flex-1">Email</span>
        <span className="min-w-0 flex-1">Invited by</span>
        <span className="w-24">Sent</span>
        <span className="w-24">Expires</span>
        <span className="w-24 text-right">Status</span>
        <span className="w-24" aria-hidden="true" />
      </div>

      <div className="flex flex-col">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex flex-col gap-3 border-b border-border py-4 transition last:border-b-0 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-6"
          >
            <p className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-foreground sm:flex-1">
              {invitation.email}
            </p>
            <p className="min-w-0 truncate text-xs text-muted-foreground sm:flex-1">
              {describeInviter(invitation)}
            </p>
            <div className="flex items-center gap-4 sm:contents">
              <span className="font-mono text-xs tabular-nums text-muted-foreground sm:w-24">
                {formatShortDate(invitation.createdAt)}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground sm:w-24">
                {formatShortDate(invitation.expiresAt)}
              </span>
              <div className="flex sm:w-24 sm:justify-end">
                <InvitationStatusPill status={invitation.status} />
              </div>
            </div>
            <div className="flex sm:w-24 sm:justify-end">
              {invitation.status === "pending" ? (
                <RevokeInvitationButton
                  invitationId={invitation.id}
                  inviteRole={inviteRole}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
