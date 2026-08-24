import { getAdminDashboardStats } from "@ai-catalyst/services/admin";

import { PageShell } from "@/app/(app)/components/page-shell";
import { Stat, StatRow } from "@/app/(app)/components/stat";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader
        kicker={adminDashboardCopy.kicker}
        title={adminDashboardCopy.greeting(greetingName)}
        intro={adminDashboardCopy.intro}
      />

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
