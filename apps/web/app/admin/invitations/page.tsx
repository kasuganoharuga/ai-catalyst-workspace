import type { InvitationListItem } from "@ai-catalyst/shared";

import { SiteHeader } from "@/components/site-header";
import { requireAdminUser } from "@/lib/require-active-user";
import { appPageTitle } from "@/lib/page-metadata";
import { actorContextFromSession } from "@/lib/actor-context";
import {
  listFounderInvitations,
  listMentorInvitations,
} from "@/lib/invitations";

import { CreateInvitationForm } from "./create-invitation-form";
import { RevokeInvitationButton } from "./revoke-invitation-button";

export const metadata = appPageTitle("Invitations");

export default async function AdminInvitationsPage() {
  const session = await requireAdminUser();
  const actor = actorContextFromSession(session);
  const [founderInvitations, mentorInvitations] = await Promise.all([
    listFounderInvitations(actor),
    listMentorInvitations(actor),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Admin
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Invitations
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Share the one-time code manually — there is no email delivery yet.
        </p>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Mentors</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A mentor joins the platform supporting nobody. They grow their own
            roster by inviting founders, and each founder who accepts comes
            under the mentor who invited them.
          </p>

          <CreateInvitationForm inviteRole="mentor" />

          <InvitationList
            invitations={mentorInvitations}
            inviteRole="mentor"
            emptyLabel="No mentor invitations yet."
          />
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Founders</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            An admin-issued founder invitation creates an unsupported workspace
            — no mentor is attached. Invite through a mentor instead when the
            founder should have one from the start.
          </p>

          <CreateInvitationForm inviteRole="founder" />

          <InvitationList
            invitations={founderInvitations}
            inviteRole="founder"
            emptyLabel="No founder invitations yet."
          />
        </section>
      </main>
    </div>
  );
}

function InvitationList({
  invitations,
  inviteRole,
  emptyLabel,
}: {
  invitations: InvitationListItem[];
  inviteRole: "founder" | "mentor";
  emptyLabel: string;
}) {
  return (
    <ul className="mt-10 space-y-3">
      {invitations.length === 0 ? (
        <li className="text-sm text-muted-foreground">{emptyLabel}</li>
      ) : (
        invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {invitation.email}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {invitation.status}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {describeInviter(invitation)} · Expires{" "}
                {new Date(invitation.expiresAt).toLocaleString()}
              </p>
            </div>
            {invitation.status === "pending" ? (
              <RevokeInvitationButton
                invitationId={invitation.id}
                inviteRole={inviteRole}
              />
            ) : null}
          </li>
        ))
      )}
    </ul>
  );
}

// For a Founder invitation this is the single most useful column on the page:
// it is what decides which Mentor ends up supporting them.
function describeInviter(invitation: InvitationListItem): string {
  if (!invitation.invitedByEmail) {
    return "Invited by an account that no longer exists";
  }

  const who = invitation.invitedByName ?? invitation.invitedByEmail;
  return invitation.invitedByRole === "mentor"
    ? `Invited by ${who} (mentor)`
    : `Invited by ${who}`;
}
