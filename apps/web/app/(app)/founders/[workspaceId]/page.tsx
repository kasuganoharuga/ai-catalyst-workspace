import Link from "next/link";
import { notFound } from "next/navigation";

import type { RunModuleSummary } from "@ai-catalyst/shared";
import { ServiceError } from "@ai-catalyst/services/errors";

import { Button } from "@/components/ui/button";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { formatDate } from "@/lib/format";
import { getMentorFounderDetail } from "@/lib/mentor";
import { appPageTitle } from "@/lib/page-metadata";

import { StatusBadge } from "../../components/status-badge";
import { PageShell } from "../../components/page-shell";
import { Stat, StatRow } from "../../components/stat";
import { mentorFounderDetailCopy } from "../../lib/copy";
import {
  deriveModuleDisplayStatus,
  moduleAccentStyle,
} from "../../lib/module-display";

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
  const artefactsByModule = new Map(
    artefacts.map((artefact) => [artefact.moduleKey, artefact]),
  );
  const displayName = founder.founderName ?? founder.founderEmail;

  return (
    <PageShell>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Link
            href="/dashboard"
            className="underline-offset-2 hover:underline"
          >
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
              {mentorFounderDetailCopy.modulesHeading}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {founder.completedModules ?? 0} of {founder.totalModules} complete
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {modules.map((module) => (
              <ModuleProgressRow
                key={module.id}
                module={module}
                artefactKey={
                  artefactsByModule.get(module.moduleKey)?.artifactKey
                }
                workspaceId={workspaceId}
              />
            ))}
          </div>

          {artefacts.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              {mentorFounderDetailCopy.noArtefacts}
            </p>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

/**
 * Condensed ModuleStatusCard row for Mentor scanning — no Attempt sub-states (this page does not fetch Attempt status).
 */
function ModuleProgressRow({
  module,
  artefactKey,
  workspaceId,
}: {
  module: RunModuleSummary;
  artefactKey: string | undefined;
  workspaceId: string;
}) {
  const status = deriveModuleDisplayStatus(module.status, null);
  const isCompleted = module.status === "completed";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums text-white"
          style={moduleAccentStyle(module.sequenceIndex)}
        >
          {isCompleted ? "✓" : String(module.sequenceIndex).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {module.title}
          </p>
          {module.completedAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Completed {formatDate(module.completedAt)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={status} moduleIndex={module.sequenceIndex} />
        {artefactKey ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/founders/${encodeURIComponent(workspaceId)}/artefacts/${encodeURIComponent(module.moduleKey)}/${encodeURIComponent(artefactKey)}`}
            >
              {mentorFounderDetailCopy.readCta}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
