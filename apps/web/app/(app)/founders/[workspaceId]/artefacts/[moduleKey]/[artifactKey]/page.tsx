import Link from "next/link";
import { notFound } from "next/navigation";

import { ServiceError } from "@ai-catalyst/services/errors";

import { listArtifactCommentThreads } from "@/lib/artifact-comments";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { formatDateTime } from "@/lib/format";
import { getMentorArtefactDocument } from "@/lib/mentor";
import { appPageTitle } from "@/lib/page-metadata";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { PageHeader } from "@/components/page-header";

import { AnalyticsTrack } from "../../../../../components/analytics-track";
import { ArtefactDownloadMenu } from "../../../../../components/artefact-download-menu";
import { ArtifactDocumentWithComments } from "../../../../../components/artefact-comments/artifact-document-with-comments";
import { PageShell } from "../../../../../components/page-shell";
import { mentorArtefactDocumentCopy } from "../../../../../lib/copy";

type MentorArtefactPageProps = {
  params: Promise<{
    workspaceId: string;
    moduleKey: string;
    artifactKey: string;
  }>;
};

export async function generateMetadata({ params }: MentorArtefactPageProps) {
  const { workspaceId, moduleKey, artifactKey } = await params;
  const actor = await getCurrentMentorActor();
  try {
    const document = await getMentorArtefactDocument(
      actor,
      workspaceId,
      moduleKey,
      artifactKey,
    );
    return appPageTitle(document?.name ?? mentorArtefactDocumentCopy.kicker);
  } catch {
    return appPageTitle(mentorArtefactDocumentCopy.kicker);
  }
}

export default async function MentorArtefactPage({
  params,
}: MentorArtefactPageProps) {
  const actor = await getCurrentMentorActor();
  const { workspaceId, moduleKey, artifactKey } = await params;

  let document;
  try {
    document = await getMentorArtefactDocument(
      actor,
      workspaceId,
      moduleKey,
      artifactKey,
    );
  } catch (error) {
    // NOT_FOUND covers both "no such Workspace" and "not yours" — see the
    // service's assertMentorOwnsWorkspace.
    if (error instanceof ServiceError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  // Null means the founder has not saved this deliverable yet, which is a
  // normal state to arrive at early, not an error.
  if (!document) {
    notFound();
  }

  const pathname = `/founders/${encodeURIComponent(workspaceId)}/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}`;
  const threads = await listArtifactCommentThreads(actor, {
    attemptId: document.attemptId,
    artifactKey,
  });

  return (
    <PageShell>
      <AnalyticsTrack
        event={ANALYTICS_EVENTS.artefactViewed}
        propertiesJson={JSON.stringify({
          role: "mentor",
          moduleKey,
          artifactKey,
        })}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          kicker={
            <>
              <Link
                href={`/founders/${encodeURIComponent(workspaceId)}`}
                className="underline-offset-2 hover:underline"
              >
                {mentorArtefactDocumentCopy.backLink}
              </Link>
              <span aria-hidden="true"> / </span>
              {document.moduleTitle}
            </>
          }
          title={document.name}
          intro={mentorArtefactDocumentCopy.savedLine(
            document.versionNumber,
            formatDateTime(document.savedAt),
          )}
          className="min-w-0 max-w-2xl"
        />

        <ArtefactDownloadMenu
          downloadHref={`/founders/${encodeURIComponent(workspaceId)}/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}/download`}
          workbookAvailable={document.workbookAvailable}
          tablesAvailable={document.tablesAvailable}
          size="lg"
        />
      </div>

      {/* The document itself stays read-only from the Mentor's side — a
          Mentor cannot edit it or advance the Founder's module. Comments
          are the one write surface layered on top: see
          packages/services/src/artifact-comment for the authorization
          model (any Mentor may open threads and reply, matching
          MENTOR_SEES_ALL_FOUNDERS' read scope). */}
      <p className="mt-6 text-xs text-muted-foreground">
        {mentorArtefactDocumentCopy.readOnlyNote}
      </p>

      <ArtifactDocumentWithComments
        content={document.content}
        threads={threads}
        viewerUserId={actor.userId}
        viewerRole="mentor"
        pathname={pathname}
        attemptId={document.attemptId}
        artifactKey={artifactKey}
        headings={document.headings}
      />
    </PageShell>
  );
}
