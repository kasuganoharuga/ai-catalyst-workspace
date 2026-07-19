import { SiteHeader } from "@/components/site-header";
import { requireAdminUser } from "@/lib/require-active-user";
import { actorContextFromSession } from "@/lib/actor-context";
import { listFounderInvitations } from "@/lib/invitations";

import { CreateInvitationForm } from "./create-invitation-form";
import { RevokeInvitationButton } from "./revoke-invitation-button";

export default async function AdminInvitationsPage() {
  const session = await requireAdminUser();
  const actor = actorContextFromSession(session);
  const invitations = await listFounderInvitations(actor);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Admin
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Founder invitations
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Create a Founder invitation and share the one-time token manually —
          there is no email delivery yet.
        </p>

        <CreateInvitationForm />

        <ul className="mt-10 space-y-3">
          {invitations.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              No Founder invitations yet.
            </li>
          ) : (
            invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold">{invitation.email}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {invitation.status}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Expires {new Date(invitation.expiresAt).toLocaleString()} ·
                    Created {new Date(invitation.createdAt).toLocaleString()}
                  </p>
                </div>
                {invitation.status === "pending" ? (
                  <RevokeInvitationButton invitationId={invitation.id} />
                ) : null}
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}
