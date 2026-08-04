import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { listMentorFounders } from "@/lib/mentor";

import { PageShell } from "../components/page-shell";
import { mentorOverviewCopy } from "../lib/copy";
import { FounderList } from "./components/founder-list";

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

      {founders.length === 0 ? (
        <>
          <div className="mt-8">
            <Button asChild>
              <Link href="/invitations">{mentorOverviewCopy.inviteCta}</Link>
            </Button>
          </div>
          <div className="mt-10 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-foreground">
              {mentorOverviewCopy.emptyTitle}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {mentorOverviewCopy.emptyBody}
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Sits with the intro as part of the header block rather than
              beside the invite button — it is context for the heading, not
              a control. The button moves down into FounderList's toolbar. */}
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
