import Link from "next/link";

import { revokeFounderInvitationAction } from "@/lib/actions/mentor-actions";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { formatShortDate } from "@/lib/format";
import { listFounderInvitations } from "@/lib/invitations";
import { appPageTitle } from "@/lib/page-metadata";

import { InvitationStatusPill } from "@/components/invitation-status-pill";
import { PageHeader } from "@/components/page-header";
import { RevokeInvitationButton } from "@/components/revoke-invitation-button";
import { SectionHeaderRow } from "@/components/section-header-row";

import { PageShell } from "../components/page-shell";
import { mentorInvitationsCopy } from "../lib/copy";
import { InviteFounderForm } from "./invite-founder-form";

export const metadata = appPageTitle("Invite founders");

// Mentor-only, same reasoning as founders/[workspaceId]/page.tsx.
export default async function MentorInvitationsPage() {
  const actor = await getCurrentMentorActor();
  // Scoped to this Mentor inside the service — an Admin calling the same
  // function sees every Founder invitation, a Mentor only their own.
  const invitations = await listFounderInvitations(actor);
  const pendingCount = invitations.filter(
    (invitation) => invitation.status === "pending",
  ).length;

  return (
    <PageShell>
      <PageHeader
        kicker={
          <Link href="/founders" className="underline-offset-2 hover:underline">
            {mentorInvitationsCopy.backLink}
          </Link>
        }
        title={mentorInvitationsCopy.title}
        intro={mentorInvitationsCopy.intro}
      />

      <div className="mt-8">
        <InviteFounderForm />
      </div>

      <SectionHeaderRow
        className="mt-14"
        label={mentorInvitationsCopy.sectionHeading}
        meta={`${pendingCount} pending`}
      />

      {invitations.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          {mentorInvitationsCopy.emptyBody}
        </p>
      ) : (
        <div className="mt-5">
          {/* Same column-header + border-b row treatment as the founders
              list (founders/components/founder-list.tsx) — column widths
              here and in the rows below have to stay in step. Headers are
              hidden below sm, where the rows stack. */}
          <div className="hidden items-center gap-6 border-b border-border pb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:flex">
            <span className="min-w-0 flex-1">
              {mentorInvitationsCopy.columnEmail}
            </span>
            <span className="w-24">{mentorInvitationsCopy.columnSent}</span>
            <span className="w-24">{mentorInvitationsCopy.columnExpires}</span>
            <span className="w-24 text-right">
              {mentorInvitationsCopy.columnStatus}
            </span>
            <span className="w-24" aria-hidden="true" />
          </div>

          <div className="flex flex-col">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-6"
              >
                <p className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-foreground sm:flex-1">
                  {invitation.email}
                </p>

                {/* Collapses to one line on a narrow screen; at sm+ the
                    wrapper becomes `display: contents` so each child lines
                    up under its own header. */}
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
                      onRevoke={revokeFounderInvitationAction}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
