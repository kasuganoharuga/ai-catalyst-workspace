import Link from "next/link";

import {
  listAdminUsers,
  listAssignableMentors,
} from "@ai-catalyst/services/admin";

import { PageShell } from "@/app/(app)/components/page-shell";
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
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Admin
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          Users
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Bind Founders to Mentors, review each account&apos;s role, and
          soft-delete users. Invitations are issued from the Invitations page.
        </p>
      </div>

      {users.length === 0 ? (
        <>
          <div className="mt-8">
            <Button asChild>
              <Link href="/admin/invitations">Invite someone</Link>
            </Button>
          </div>
          <div className="mt-10 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-foreground">
              No users yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Issue a founder or mentor invitation to get started.
            </p>
          </div>
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
