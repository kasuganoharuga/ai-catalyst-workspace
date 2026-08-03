import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { listMentorFounders } from "@/lib/mentor";

import { PageShell } from "../components/page-shell";
import { Stat, StatRow } from "../components/stat";
import { mentorOverviewCopy } from "../lib/copy";
import { FounderCard } from "./components/founder-card";

/**
 * The /dashboard content for a Mentor — the counterpart to
 * FounderDashboard, moved here from what was originally a standalone
 * app/mentor/page.tsx. Calls its own getCurrentMentorActor(), same as
 * every other Mentor-only page in this route group.
 */
export async function MentorDashboard() {
  const actor = await getCurrentMentorActor();
  const founders = await listMentorFounders(actor);

  const started = founders.filter((founder) => founder.totalModules !== null);
  const modulesCompleted = founders.reduce(
    (sum, founder) => sum + (founder.completedModules ?? 0),
    0,
  );

  return (
    <PageShell>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {mentorOverviewCopy.kicker}
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {mentorOverviewCopy.title}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {mentorOverviewCopy.intro}
        </p>
      </div>

      <div className="mt-8">
        <Button asChild>
          <Link href="/invitations">{mentorOverviewCopy.inviteCta}</Link>
        </Button>
      </div>

      {founders.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            {mentorOverviewCopy.emptyTitle}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {mentorOverviewCopy.emptyBody}
          </p>
        </div>
      ) : (
        <>
          <StatRow>
            <Stat value={`${founders.length}`}>
              {mentorOverviewCopy.statFounders}
            </Stat>
            <Stat value={`${started.length}`} suffix={`/${founders.length}`}>
              {mentorOverviewCopy.statStarted}
            </Stat>
            <Stat value={`${modulesCompleted}`}>
              {mentorOverviewCopy.statCompleted}
            </Stat>
          </StatRow>

          <div className="mt-14 flex items-baseline justify-between gap-4 border-t border-border pt-4">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {mentorOverviewCopy.sectionHeading}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {mentorOverviewCopy.startedCount(started.length, founders.length)}
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {founders.map((founder) => (
              <FounderCard key={founder.workspaceId} founder={founder} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
