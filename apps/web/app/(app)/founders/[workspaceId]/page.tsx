import Link from "next/link";
import { notFound } from "next/navigation";

import { ServiceError } from "@ai-catalyst/services/errors";

import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { formatDate } from "@/lib/format";
import { getMentorFounderDetail } from "@/lib/mentor";
import { appPageTitle } from "@/lib/page-metadata";

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
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/founders" className="underline-offset-2 hover:underline">
            {mentorFounderDetailCopy.backLink}
          </Link>
          <span aria-hidden="true"> / </span>
          {founder.workspaceName}
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {displayName}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {founder.founderEmail}
        </p>
      </div>

      {founder.totalModules === null ? (
        <div className="mt-10 rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            {mentorFounderDetailCopy.notStartedTitle}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {mentorFounderDetailCopy.notStartedBody}
          </p>
        </div>
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

          <div className="mt-14 flex items-baseline justify-between gap-4 border-t border-border pt-4">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {mentorFounderDetailCopy.artefactsHeading}
            </p>
            {artefactGroups.length > 0 ? (
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {artefactsCopy.savedCount(savedCount, totalArtefacts)}
              </p>
            ) : null}
          </div>

          {artefactGroups.length > 0 ? (
            <div className="mt-5 flex flex-col gap-5">
              {artefactGroups.map((group) => (
                <ArtefactModuleGroup
                  key={`${group.moduleKey}:${group.sortIndex}`}
                  group={group}
                  artefactsBasePath={artefactsBasePath}
                  showDownload={false}
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
