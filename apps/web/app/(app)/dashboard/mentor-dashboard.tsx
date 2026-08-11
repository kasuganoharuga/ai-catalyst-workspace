import {
  getCurrentMentorActor,
  getCurrentMentorSession,
} from "@/lib/current-mentor-actor";
import { listMentorFounders } from "@/lib/mentor";
import { getMyProfile, resolveGreetingName } from "@/lib/user-profile";

import { PageShell } from "../components/page-shell";
import { Stat, StatRow } from "../components/stat";
import { mentorDashboardCopy } from "../lib/copy";
import { MentorProgressMix } from "./components/mentor-progress-mix";
import { MentorRecentActivity } from "./components/mentor-recent-activity";
import { buildMentorDashboardView } from "./lib/mentor-dashboard-state";

/**
 * Mentor stats overview at /dashboard. The founder directory lives at
 * /founders — this page summarises coverage and recent activity.
 */
export async function MentorDashboard() {
  const [actor, session] = await Promise.all([
    getCurrentMentorActor(),
    getCurrentMentorSession(),
  ]);

  const [founders, profile] = await Promise.all([
    listMentorFounders(actor),
    getMyProfile(actor),
  ]);

  const view = buildMentorDashboardView({ founders });
  const greetingName = resolveGreetingName(profile, session.user.name);

  return (
    <PageShell>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {mentorDashboardCopy.kicker}
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {mentorDashboardCopy.greeting(greetingName)}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {mentorDashboardCopy.intro}
        </p>
      </div>

      <StatRow>
        <Stat value={`${view.founderCount}`}>
          {mentorDashboardCopy.statFounders}
        </Stat>
        <Stat
          value={
            view.averageProgressPct === null
              ? mentorDashboardCopy.statAverageProgressEmpty
              : `${view.averageProgressPct}`
          }
          suffix={view.averageProgressPct === null ? undefined : "%"}
        >
          {mentorDashboardCopy.statAverageProgress}
        </Stat>
        <Stat value={`${view.activeThisWeek}`}>
          {mentorDashboardCopy.statActiveWeek}
        </Stat>
      </StatRow>

      <MentorProgressMix progress={view.progress} total={view.founderCount} />

      <MentorRecentActivity items={view.recentActivity} />
    </PageShell>
  );
}
