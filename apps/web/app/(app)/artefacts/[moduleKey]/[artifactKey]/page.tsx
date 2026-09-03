import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { listArtifactCommentThreads } from "@/lib/artifact-comments";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getFounderArtifactDocument } from "@/lib/artifacts";
import { formatDateTime } from "@/lib/format";
import { appPageTitle } from "@/lib/page-metadata";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

import { AnalyticsTrack } from "../../../components/analytics-track";
import { ArtefactDownloadMenu } from "../../../components/artefact-download-menu";
import { ArtifactDocumentWithComments } from "../../../components/artefact-comments/artifact-document-with-comments";
import { PageShell } from "../../../components/page-shell";

type ArtefactDetailPageProps = {
  params: Promise<{ moduleKey: string; artifactKey: string }>;
};

export async function generateMetadata({ params }: ArtefactDetailPageProps) {
  const { moduleKey, artifactKey } = await params;
  const actor = await getCurrentFounderActor();
  const document = await getFounderArtifactDocument(
    actor,
    moduleKey,
    artifactKey,
  );
  return appPageTitle(document?.name ?? "Artefact");
}

export default async function ArtefactDetailPage({
  params,
}: ArtefactDetailPageProps) {
  const { moduleKey, artifactKey } = await params;
  const actor = await getCurrentFounderActor();
  const document = await getFounderArtifactDocument(
    actor,
    moduleKey,
    artifactKey,
  );

  if (!document) {
    notFound();
  }

  const downloadHref = `/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}/download`;
  const pathname = `/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}`;
  const threads = await listArtifactCommentThreads(actor, {
    attemptId: document.attemptId,
    artifactKey,
  });

  return (
    <PageShell>
      <AnalyticsTrack
        event={ANALYTICS_EVENTS.artefactViewed}
        propertiesJson={JSON.stringify({
          role: "founder",
          moduleKey,
          artifactKey,
        })}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          kicker={
            <>
              <Link
                href="/artefacts"
                className="underline-offset-2 hover:underline"
              >
                Artefacts
              </Link>
              <span aria-hidden="true"> / </span>
              From {document.moduleTitle}
            </>
          }
          title={document.name}
          intro={
            <>
              Version {document.versionNumber}
              {" · "}
              Saved at: {formatDateTime(document.savedAt)}
            </>
          }
          className="min-w-0 max-w-2xl"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg" variant="outline">
            <Link href={`/modules/${encodeURIComponent(moduleKey)}`}>
              Open module
            </Link>
          </Button>
          <ArtefactDownloadMenu
            downloadHref={downloadHref}
            workbookAvailable={document.workbookAvailable}
            tablesAvailable={document.tablesAvailable}
            size="lg"
            triggerVariant="default"
            singleVariant="default"
          />
        </div>
      </div>

      <ArtifactDocumentWithComments
        content={document.content}
        threads={threads}
        viewerUserId={actor.userId}
        viewerRole="founder"
        pathname={pathname}
        attemptId={document.attemptId}
        artifactKey={artifactKey}
        headings={document.headings}
      />
    </PageShell>
  );
}
