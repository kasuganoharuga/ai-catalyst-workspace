// Artifact review-discussion DTOs — JSON-safe ISO timestamps, matching the
// convention in mentor.ts / artifact-submission.ts.

export type ArtifactCommentAnchorKind = "document" | "section";
export type ArtifactCommentThreadStatus = "open" | "resolved";
export type ArtifactCommentAuthorRole = "founder" | "mentor" | "admin";

/**
 * Where a thread is anchored. `heading`/`headingLevel` identify a section by
 * its heading text — the same stable contract renderers' requiredSections
 * already depend on — never a character offset. `quote` is the excerpt
 * shown under the anchor for orientation; it is never used to relocate the
 * thread, so it may go stale (or vanish) if a later version rewords that
 * sentence without moving the heading.
 */
export interface ArtifactCommentAnchor {
  kind: ArtifactCommentAnchorKind;
  headingLevel: number | null;
  heading: string | null;
  quote: string | null;
}

export interface ArtifactComment {
  id: string;
  threadId: string;
  authorUserId: string;
  authorRole: ArtifactCommentAuthorRole;
  /** user_profiles display name if set, else the account email — same fallback as mentor.ts's founder identity columns. */
  authorName: string;
  body: string;
  /** Which confirmed Artifact version this comment was written against. */
  writtenOnVersion: number;
  editedAt: string | null;
  createdAt: string;
}

export interface ArtifactCommentThread {
  id: string;
  anchor: ArtifactCommentAnchor;
  /** Which confirmed Artifact version this thread was opened against. */
  openedOnVersion: number;
  status: ArtifactCommentThreadStatus;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** Every message in the thread, oldest first — the opening message is comments[0]. */
  comments: ArtifactComment[];
  /** Comments the requesting actor has not yet seen (per artifact_comment_reads). */
  unreadCount: number;
}
