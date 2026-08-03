import Link from "next/link";
import { notFound } from "next/navigation";

import { ServiceError } from "@ai-catalyst/services/errors";

import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { formatDateTime } from "@/lib/format";
import { getMentorArtefactDocument } from "@/lib/mentor";
import { appPageTitle } from "@/lib/page-metadata";

import { MarkdownDocument } from "../../../../../components/markdown-document";
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

  return (
    <PageShell>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Link
            href={`/founders/${workspaceId}`}
            className="underline-offset-2 hover:underline"
          >
            {mentorArtefactDocumentCopy.backLink}
          </Link>
          <span aria-hidden="true"> / </span>
          {document.moduleTitle}
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {document.name}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {mentorArtefactDocumentCopy.savedLine(
            document.versionNumber,
            formatDateTime(document.savedAt),
          )}
        </p>
      </div>

      <article className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/40 px-5 py-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Document
          </p>
        </div>
        <MarkdownDocument content={document.content} />
      </article>

      {/* Read-only by design: V1 Mentors observe and advise, and the founder
          still signs their own module off. Accept/reject controls arrive
          with the review phase. */}
      <p className="mt-4 text-xs text-muted-foreground">
        {mentorArtefactDocumentCopy.readOnlyNote}
      </p>
    </PageShell>
  );
}
