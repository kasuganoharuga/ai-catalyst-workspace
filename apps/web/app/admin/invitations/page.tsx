import Link from "next/link";

import { PageShell } from "@/app/(app)/components/page-shell";
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
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Link
            href="/admin/users"
            className="underline-offset-2 hover:underline"
          >
            Users
          </Link>
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          Invitations
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Share the one-time code manually — there is no email delivery yet.
          Admin-issued founder invites create a workspace with no mentor; bind
          one later from Users.
        </p>
      </div>

      <AdminInvitationsPanel
        mentorInvitations={mentorInvitations}
        founderInvitations={founderInvitations}
      />
    </PageShell>
  );
}
