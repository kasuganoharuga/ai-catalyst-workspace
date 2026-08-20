import { getAdminDashboardStats } from "@ai-catalyst/services/admin";

import { PageShell } from "@/app/(app)/components/page-shell";
import { Stat, StatRow } from "@/app/(app)/components/stat";
import { actorContextFromSession } from "@/lib/actor-context";
import { appPageTitle } from "@/lib/page-metadata";
import { requireAdminUser } from "@/lib/require-active-user";
import { getMyProfile, resolveGreetingName } from "@/lib/user-profile";

import { AdminRecentUsers } from "./components/admin-recent-users";
import { AdminRoleMix } from "./components/admin-role-mix";
import { adminDashboardCopy } from "./lib/copy";

export const metadata = appPageTitle("Dashboard");

function mentorCoveragePct(
  assigned: number,
  unassigned: number,
): number | null {
  const total = assigned + unassigned;
  if (total === 0) return null;
  return Math.round((assigned / total) * 100);
}

export default async function AdminDashboardPage() {
  const session = await requireAdminUser();
  const actor = actorContextFromSession(session);

  const [stats, profile] = await Promise.all([
    getAdminDashboardStats(actor),
    getMyProfile(actor),
  ]);

  const greetingName = resolveGreetingName(profile, session.user.name);
  const coveragePct = mentorCoveragePct(
    stats.assignedFounders,
    stats.unassignedFounders,
  );

  return (
    <PageShell>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {adminDashboardCopy.kicker}
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {adminDashboardCopy.greeting(greetingName)}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {adminDashboardCopy.intro}
        </p>
      </div>

      <StatRow>
        <Stat value={`${stats.liveUsers}`}>
          {adminDashboardCopy.statLiveAccounts}
        </Stat>
        <Stat
          value={
            coveragePct === null
              ? adminDashboardCopy.statCoverageEmpty
              : `${coveragePct}`
          }
          suffix={coveragePct === null ? undefined : "%"}
        >
          {adminDashboardCopy.statCoverage}
        </Stat>
        <Stat value={`${stats.joinedThisWeek}`}>
          {adminDashboardCopy.statJoinedWeek}
        </Stat>
      </StatRow>

      <AdminRoleMix
        roles={{
          founder: stats.founders,
          mentor: stats.mentors,
          admin: stats.admins,
          pending: stats.pendingUsers,
        }}
        total={stats.liveUsers}
      />

      <AdminRecentUsers items={stats.recentUsers} />
    </PageShell>
  );
}
