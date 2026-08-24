import Link from "next/link";

import {
  listAdminUsers,
  listAssignableMentors,
} from "@ai-catalyst/services/admin";

import { PageShell } from "@/app/(app)/components/page-shell";
import { EmptyStateCard } from "@/components/empty-state-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { actorContextFromSession } from "@/lib/actor-context";
import { appPageTitle } from "@/lib/page-metadata";
import { requireAdminUser } from "@/lib/require-active-user";

import { UserList } from "../components/user-list";

export const metadata = appPageTitle("Users");

export default async function AdminUsersPage() {
  const session = await requireAdminUser();
  const actor = actorContextFromSession(session);
  const [users, mentors] = await Promise.all([
    listAdminUsers(actor),
    listAssignableMentors(actor),
  ]);

  const founders = users.filter((user) => user.role === "founder").length;
  const mentorCount = users.filter((user) => user.role === "mentor").length;
  const pending = users.filter((user) => user.role === "pending").length;

  return (
    <PageShell>
      <PageHeader
        kicker="Admin"
        title="Users"
        intro={
          <>
            Bind Founders to Mentors, review each account&apos;s role, and
            soft-delete users. Invitations are issued from the Invitations page.
          </>
        }
      />

      {users.length === 0 ? (
        <>
          <div className="mt-8">
            <Button asChild>
              <Link href="/admin/invitations">Invite someone</Link>
            </Button>
          </div>
          <EmptyStateCard className="mt-10">
            <p className="text-[15px] font-semibold text-foreground">
              No users yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Issue a founder or mentor invitation to get started.
            </p>
          </EmptyStateCard>
        </>
      ) : (
        <>
          <p className="mt-5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {users.length} live · {founders} founder
            {founders === 1 ? "" : "s"} · {mentorCount} mentor
            {mentorCount === 1 ? "" : "s"}
            {pending > 0 ? ` · ${pending} pending` : ""}
          </p>

          <UserList
            users={users}
            mentors={mentors}
            currentUserId={session.user.id}
          >
            <Button asChild>
              <Link href="/admin/invitations">Invitations</Link>
            </Button>
          </UserList>
        </>
      )}
    </PageShell>
  );
}
