import type {
  ArtifactCommentAuthorRole,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import { MarkdownDocument } from "../markdown-document";
import { CommentAutoRefresh } from "./comment-auto-refresh";
import { CommentSidebarLayout } from "./comment-sidebar-layout";
import { CommentThreadCard } from "./comment-thread-card";
import type { CommentableHeading } from "./new-thread-dialog";

// Sort key for the sidebar list: document-level threads first, then
// section threads in the order their heading appears in the document. Pure
// display ordering — it never touches how MarkdownDocument itself renders,
// which is why the document's own layout is untouched by comments.
function sortKeyForThread(
  thread: ArtifactCommentThread,
  headings: CommentableHeading[],
): number {
  if (thread.anchor.kind === "document") return -1;
  const index = headings.findIndex(
    (heading) =>
      heading.level === thread.anchor.headingLevel &&
      heading.heading === thread.anchor.heading,
  );
  return index === -1 ? headings.length : index;
}

/**
 * Google-Docs-style layout for a confirmed Artifact's comments: open
 * threads list in the sidebar next to the document, in reading order, and
 * the section they're anchored to gets a highlighter-style background —
 * applied inline by `MarkdownDocument` itself, not by wrapping sections in
 * separate boxes, so the document's own margins/spacing/borders are never
 * touched. On narrow screens the grid collapses to one column and the
 * sidebar simply flows below the document, in the same reading order. The
 * whole sidebar can be hidden via the toolbar toggle (`CommentSidebarLayout`)
 * to give the document the full column width back.
 *
 * A new thread is always anchored to a heading — never to "the whole
 * document" as a distinct concept. The top (H1) heading is present in
 * every artefact and never changes, so anchoring there already reads as
 * document-level feedback; a separate anchor kind for it would just be two
 * ways to say the same thing. (Pre-existing document-anchored threads still
 * read and display exactly as before — this only changes what a *new*
 * thread's anchor is.)
 *
 * Only a Mentor or Admin opens a new thread — the per-heading trigger is
 * omitted entirely for a Founder viewer (`commentTarget` is left
 * undefined), since createArtifactCommentThread rejects a Founder actor
 * regardless. The Founder's part in the conversation is replying.
 */
export function ArtifactDocumentWithComments({
  content,
  threads,
  viewerUserId,
  viewerRole,
  pathname,
  attemptId,
  artifactKey,
  headings,
}: {
  content: string;
  threads: ArtifactCommentThread[];
  viewerUserId: string;
  viewerRole: ArtifactCommentAuthorRole;
  pathname: string;
  attemptId: string;
  artifactKey: string;
  headings: CommentableHeading[];
}) {
  // Only a Mentor or Admin opens a new thread or resolves/reopens one — the
  // Founder replies to existing threads but doesn't start or close out
  // their own feedback loop (see createArtifactCommentThread /
  // setThreadStatus). Gates both the per-heading "comment on this section"
  // affordance below and the Resolve/Reopen button on each card.
  const canModerate = viewerRole !== "founder";
  const openThreads = threads
    .filter((thread) => thread.status === "open")
    .toSorted(
      (a, b) => sortKeyForThread(a, headings) - sortKeyForThread(b, headings),
    );
  const resolvedThreads = threads.filter(
    (thread) => thread.status === "resolved",
  );
  const highlightedHeadings = openThreads
    .filter((thread) => thread.anchor.kind === "section")
    .map((thread) => ({
      level: thread.anchor.headingLevel as number,
      heading: thread.anchor.heading as string,
    }));

  return (
    <article className="mt-10 overflow-hidden rounded-xl border border-border bg-card">
      <CommentAutoRefresh />

      <CommentSidebarLayout
        openCount={openThreads.length}
        documentSlot={
          <MarkdownDocument
            content={content}
            highlightedHeadings={highlightedHeadings}
            commentTarget={
              canModerate ? { attemptId, artifactKey, pathname } : undefined
            }
          />
        }
        sidebarSlot={
          // Two regions, not one blended surface: the sidebar carries its
          // own hairline and tint so the document column reads as the
          // document.
          <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/20 px-5 py-6 lg:border-l lg:border-t-0">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Comments
            </span>

            {openThreads.length === 0 && resolvedThreads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {canModerate
                  ? "No comments yet. Hover a heading to comment on that section."
                  : "No comments yet."}
              </p>
            ) : null}
            {openThreads.map((thread) => (
              <CommentThreadCard
                key={thread.id}
                thread={thread}
                viewerUserId={viewerUserId}
                pathname={pathname}
                canModerate={canModerate}
              />
            ))}

            {resolvedThreads.length > 0 ? (
              <details className="border-t border-border/70 pt-3">
                <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
                  Show {resolvedThreads.length} resolved
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {resolvedThreads.map((thread) => (
                    <CommentThreadCard
                      key={thread.id}
                      thread={thread}
                      viewerUserId={viewerUserId}
                      pathname={pathname}
                      canModerate={canModerate}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        }
      />
    </article>
  );
}
