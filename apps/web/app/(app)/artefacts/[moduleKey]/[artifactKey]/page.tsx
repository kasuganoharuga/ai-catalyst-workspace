import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getFounderArtifactDocument } from "@/lib/artifacts";
import { formatDateTime } from "@/lib/format";
import { appPageTitle } from "@/lib/page-metadata";

import { MarkdownDocument } from "../../../components/markdown-document";
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

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <Link
              href="/artefacts"
              className="underline-offset-2 hover:underline"
            >
              Artefacts
            </Link>
            <span aria-hidden="true"> / </span>
            From {document.moduleTitle}
          </p>
          <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
            {document.name}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
            Version {document.versionNumber}
            {" · "}
            Saved at: {formatDateTime(document.savedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg" variant="outline">
            <Link href={`/modules/${encodeURIComponent(moduleKey)}`}>
              Open module
            </Link>
          </Button>
          {document.workbookAvailable ? (
            <>
              <Button asChild size="lg">
                <a href={`${downloadHref}?format=workbook`}>
                  <Download aria-hidden="true" />
                  Download PDF
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href={downloadHref}>Markdown source</a>
              </Button>
            </>
          ) : (
            <Button asChild size="lg">
              <a href={downloadHref}>
                <Download aria-hidden="true" />
                Download
              </a>
            </Button>
          )}
        </div>
      </div>

      <article className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-muted/40 px-5 py-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Document
          </p>
        </div>
        <MarkdownDocument content={document.content} />
      </article>
    </PageShell>
  );
}
