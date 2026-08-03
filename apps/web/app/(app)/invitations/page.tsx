import Link from "next/link";

import { listFounderInvitations } from "@ai-catalyst/services/invitation";

import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { formatDateTime } from "@/lib/format";
import { appPageTitle } from "@/lib/page-metadata";

import { PageShell } from "../components/page-shell";
import { mentorInvitationsCopy } from "../lib/copy";
import { InviteFounderForm } from "./invite-founder-form";
import { RevokeInvitationButton } from "./revoke-invitation-button";

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
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Link
            href="/dashboard"
            className="underline-offset-2 hover:underline"
          >
            {mentorInvitationsCopy.backLink}
          </Link>
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {mentorInvitationsCopy.title}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {mentorInvitationsCopy.intro}
        </p>
      </div>

      <div className="mt-8 max-w-xl">
        <InviteFounderForm />
      </div>

      <div className="mt-14 flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {mentorInvitationsCopy.sectionHeading}
        </p>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {pendingCount} pending
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {mentorInvitationsCopy.emptyBody}
          </p>
        ) : (
          invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                  {invitation.email}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(invitation.createdAt)} · expires{" "}
                  {formatDateTime(invitation.expiresAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <InvitationStatusPill status={invitation.status} />
                {invitation.status === "pending" ? (
                  <RevokeInvitationButton invitationId={invitation.id} />
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </PageShell>
  );
}

const STATUS_TONE: Record<string, string> = {
  pending: "border border-foreground/25 text-foreground",
  accepted: "bg-primary text-primary-foreground",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

/**
 * Same visual vocabulary as StatusBadge (../components/status-badge.tsx) —
 * solid pill, uppercase, tracked-out label — kept local rather than reusing
 * that component directly: it's typed around ModuleDisplayStatus's tone
 * set, which has no member for an accepted/revoked/expired Invitation.
 */
function InvitationStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_TONE[status] ?? STATUS_TONE.pending}`}
    >
      {status}
    </span>
  );
}
