import type { InvitationListItem } from "@ai-catalyst/shared";

import {
  revokeInvitationAction,
  revokeMentorInvitationAction,
} from "@/lib/actions/admin-actions";
import { formatShortDate } from "@/lib/format";

import { EmptyStateCard } from "@/components/empty-state-card";
import { InvitationStatusPill } from "@/components/invitation-status-pill";
import { RevokeInvitationButton } from "@/components/revoke-invitation-button";

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
      <EmptyStateCard className="mt-8">
        <p className="text-[15px] font-semibold text-foreground">
          {emptyLabel}
        </p>
      </EmptyStateCard>
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
                  onRevoke={
                    inviteRole === "mentor"
                      ? revokeMentorInvitationAction
                      : revokeInvitationAction
                  }
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
