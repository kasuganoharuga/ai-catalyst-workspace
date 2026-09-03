import Link from "next/link";

import { EmptyStateCard } from "@/components/empty-state-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { listMentorFounders } from "@/lib/mentor";
import { appPageTitle } from "@/lib/page-metadata";

import { PageShell } from "../components/page-shell";
import { mentorOverviewCopy } from "../lib/copy";
import { FounderList } from "./components/founder-list";

export const metadata = appPageTitle("Founders");

/**
 * Mentor-only founder directory. Every Founder on the platform is listed
 * (MENTOR_SEES_ALL_FOUNDERS), with founders assigned to the viewing Mentor
 * sorted first and badged. Lives beside /founders/[workspaceId] so the list
 * and detail share one nav prefix; /dashboard is the stats overview.
 */
export default async function MentorFoundersPage() {
  const actor = await getCurrentMentorActor();
  const founders = await listMentorFounders(actor);

  const started = founders.filter((founder) => founder.totalModules !== null);
  const modulesCompleted = founders.reduce(
    (sum, founder) => sum + (founder.completedModules ?? 0),
    0,
  );

  return (
    <PageShell>
      <PageHeader
        kicker={mentorOverviewCopy.kicker}
        title={mentorOverviewCopy.title}
        intro={mentorOverviewCopy.intro}
      />

      {founders.length === 0 ? (
        <>
          <div className="mt-8">
            <Button asChild>
              <Link href="/invitations">{mentorOverviewCopy.inviteCta}</Link>
            </Button>
          </div>
          <EmptyStateCard className="mt-10">
            <p className="text-[15px] font-semibold text-foreground">
              {mentorOverviewCopy.emptyTitle}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {mentorOverviewCopy.emptyBody}
            </p>
          </EmptyStateCard>
        </>
      ) : (
        <>
          <p className="mt-5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {mentorOverviewCopy.summaryLine(
              founders.length,
              started.length,
              modulesCompleted,
            )}
          </p>

          <FounderList founders={founders}>
            <Button asChild>
              <Link href="/invitations">{mentorOverviewCopy.inviteCta}</Link>
            </Button>
          </FounderList>
        </>
      )}
    </PageShell>
  );
}
