import Link from "next/link";

import { PageShell } from "@/app/(app)/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { requireAdminUser } from "@/lib/require-active-user";
import { appPageTitle } from "@/lib/page-metadata";
import { actorContextFromSession } from "@/lib/actor-context";
import {
  listFounderInvitations,
  listMentorInvitations,
} from "@/lib/invitations";

import { AdminInvitationsPanel } from "./admin-invitations-panel";

export const metadata = appPageTitle("Invitations");

export default async function AdminInvitationsPage() {
  const session = await requireAdminUser();
  const actor = actorContextFromSession(session);
  const [founderInvitations, mentorInvitations] = await Promise.all([
    listFounderInvitations(actor),
    listMentorInvitations(actor),
  ]);

  return (
    <PageShell>
      <PageHeader
        kicker={
          <Link
            href="/admin/users"
            className="underline-offset-2 hover:underline"
          >
            Users
          </Link>
        }
        title="Invitations"
        intro={
          <>
            We&apos;ll email the invitee a one-time code. Admin-issued founder
            invites create a workspace with no mentor; bind one later from
            Users.
          </>
        }
      />

      <AdminInvitationsPanel
        mentorInvitations={mentorInvitations}
        founderInvitations={founderInvitations}
      />
    </PageShell>
  );
}
