import Link from "next/link";
import { notFound } from "next/navigation";

import { ServiceError } from "@ai-catalyst/services/errors";

import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { formatDate } from "@/lib/format";
import { getMentorFounderDetail } from "@/lib/mentor";
import { appPageTitle } from "@/lib/page-metadata";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

import { EmptyStateCard } from "@/components/empty-state-card";
import { PageHeader } from "@/components/page-header";
import { SectionHeaderRow } from "@/components/section-header-row";

import { AnalyticsTrack } from "../../components/analytics-track";
import { ArtefactModuleGroup } from "../../artefacts/components/artefact-module-group";
import {
  artefactCounts,
  buildMentorArtefactGroups,
} from "../../artefacts/lib/artefact-groups";
import { PageShell } from "../../components/page-shell";
import { Stat, StatRow } from "../../components/stat";
import { artefactsCopy, mentorFounderDetailCopy } from "../../lib/copy";

type FounderDetailPageProps = {
  params: Promise<{ workspaceId: string }>;
};

export async function generateMetadata({ params }: FounderDetailPageProps) {
  const { workspaceId } = await params;
  const actor = await getCurrentMentorActor();
  try {
    const detail = await getMentorFounderDetail(actor, workspaceId);
    return appPageTitle(
      detail.founder.founderName ?? detail.founder.founderEmail,
    );
  } catch {
    return appPageTitle(mentorFounderDetailCopy.kicker);
  }
}

// Mentor-only, even though it lives in the shared (app) shell — the shared
// layout only decides who may enter the shell at all (Founder or Mentor);
// getCurrentMentorActor() is what actually keeps a Founder out of here.
export default async function MentorFounderDetailPage({
  params,
}: FounderDetailPageProps) {
  const actor = await getCurrentMentorActor();
  const { workspaceId } = await params;

  let detail;
  try {
    detail = await getMentorFounderDetail(actor, workspaceId);
  } catch (error) {
    // The service returns NOT_FOUND both for a Workspace that does not exist
    // and for one this Mentor does not cover — deliberately indistinguishable,
    // so it renders as a plain 404 here too.
    if (error instanceof ServiceError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const { founder, modules, artefacts } = detail;
  const displayName = founder.founderName ?? founder.founderEmail;
  const artefactGroups = buildMentorArtefactGroups(modules, artefacts);
  const { savedCount, totalArtefacts } = artefactCounts(artefactGroups);
  const artefactsBasePath = `/founders/${encodeURIComponent(workspaceId)}`;

  return (
    <PageShell>
      {/* isAssignedToMe lands with the MENTOR_SEES_ALL_FOUNDERS work
          (packages/services/src/mentor/index.ts) on a separate branch —
          add it to this event's properties once MentorFounderSummary
          carries the field, so this doubles as usage data for how much of
          that widened visibility actually gets used. */}
      <AnalyticsTrack event={ANALYTICS_EVENTS.mentorFounderOpened} />
      <PageHeader
        kicker={
          <>
            <Link
              href="/founders"
              className="underline-offset-2 hover:underline"
            >
              {mentorFounderDetailCopy.backLink}
            </Link>
            <span aria-hidden="true"> / </span>
            {founder.workspaceName}
          </>
        }
        title={displayName}
        intro={founder.founderEmail}
      />

      {founder.totalModules === null ? (
        <EmptyStateCard className="mt-10">
          <p className="text-[15px] font-semibold text-foreground">
            {mentorFounderDetailCopy.notStartedTitle}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {mentorFounderDetailCopy.notStartedBody}
          </p>
        </EmptyStateCard>
      ) : (
        <>
          <StatRow>
            <Stat
              value={`${founder.completedModules ?? 0}`}
              suffix={`/${founder.totalModules}`}
            >
              {mentorFounderDetailCopy.statModules}
            </Stat>
            <Stat value={`${artefacts.length}`}>
              {mentorFounderDetailCopy.statArtefacts}
            </Stat>
            <Stat
              value={
                founder.lastCompletedAt
                  ? formatDate(founder.lastCompletedAt)
                  : mentorFounderDetailCopy.never
              }
            >
              {mentorFounderDetailCopy.statLastActivity}
            </Stat>
          </StatRow>

          <SectionHeaderRow
            className="mt-14 border-t border-border pt-4"
            label={mentorFounderDetailCopy.artefactsHeading}
            meta={
              artefactGroups.length > 0 ? (
                <>{artefactsCopy.savedCount(savedCount, totalArtefacts)}</>
              ) : undefined
            }
          />

          {artefactGroups.length > 0 ? (
            <div className="mt-5 flex flex-col gap-5">
              {artefactGroups.map((group) => (
                <ArtefactModuleGroup
                  key={`${group.moduleKey}:${group.sortIndex}`}
                  group={group}
                  artefactsBasePath={artefactsBasePath}
                  showDownload
                />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              {mentorFounderDetailCopy.noArtefacts}
            </p>
          )}
        </>
      )}
    </PageShell>
  );
}
