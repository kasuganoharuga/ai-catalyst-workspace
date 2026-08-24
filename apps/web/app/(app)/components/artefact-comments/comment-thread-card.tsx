"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type {
  ArtifactComment,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import {
  editArtifactCommentAction,
  reopenArtifactCommentThreadAction,
  replyToArtifactCommentThreadAction,
  resolveArtifactCommentThreadAction,
  softDeleteArtifactCommentAction,
} from "@/lib/actions/artifact-comment-actions";
import { slugifyArtifactHeading } from "@/lib/artifact-heading-slug";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TEXTAREA_CLASS =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

function anchorLabel(thread: ArtifactCommentThread): string {
  return thread.anchor.kind === "document"
    ? "Whole document"
    : (thread.anchor.heading ?? "Section");
}

function CommentRow({
  comment,
  viewerUserId,
  isOpeningComment,
  pathname,
}: {
  comment: ArtifactComment;
  viewerUserId: string;
  isOpeningComment: boolean;
  pathname: string;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [isPending, startTransition] = useTransition();

  const isOwn = comment.authorUserId === viewerUserId;

  function submitEdit() {
    startTransition(async () => {
      const result = await editArtifactCommentAction({
        commentId: comment.id,
        body,
        pathname,
      });
      if (!result.ok) {
        toast.error("Couldn't save that edit", { description: result.message });
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  function submitDelete() {
    startTransition(async () => {
      const result = await softDeleteArtifactCommentAction({
        commentId: comment.id,
        pathname,
      });
      if (!result.ok) {
        toast.error("Couldn't delete that comment", {
          description: result.message,
        });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {comment.authorName}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatShortDate(comment.createdAt)}
          {comment.editedAt ? " · edited" : ""}
        </span>
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-2">
          <textarea
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className={TEXTAREA_CLASS}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={submitEdit}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setBody(comment.body);
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-[14px] leading-6 text-foreground/90">
            {comment.body}
          </p>
          {isOwn ? (
            <div className="flex gap-3 pt-0.5">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsEditing(true)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Edit
              </button>
              {!isOpeningComment ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={submitDelete}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function CommentThreadCard({
  thread,
  viewerUserId,
  pathname,
  canModerate,
}: {
  thread: ArtifactCommentThread;
  viewerUserId: string;
  pathname: string;
  /** Only a Mentor or Admin may resolve/reopen — the Founder replies but doesn't close out their own feedback loop (enforced again, authoritatively, in setThreadStatus). */
  canModerate: boolean;
}) {
  const router = useRouter();
  const [isReplying, setIsReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const isResolved = thread.status === "resolved";

  function submitReply() {
    if (replyBody.trim().length === 0) return;
    startTransition(async () => {
      const result = await replyToArtifactCommentThreadAction({
        threadId: thread.id,
        body: replyBody,
        pathname,
      });
      if (!result.ok) {
        toast.error("Couldn't post that reply", {
          description: result.message,
        });
        return;
      }
      setReplyBody("");
      setIsReplying(false);
      router.refresh();
    });
  }

  function toggleResolved() {
    startTransition(async () => {
      const action = isResolved
        ? reopenArtifactCommentThreadAction
        : resolveArtifactCommentThreadAction;
      const result = await action({ threadId: thread.id, pathname });
      if (!result.ok) {
        toast.error("Couldn't update that thread", {
          description: result.message,
        });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        isResolved && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={`#${slugForAnchor(thread)}`}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {anchorLabel(thread)}
        </a>
        {canModerate ? (
          // A Mentor/Admin needs the status at a glance — they're the ones
          // who resolve/reopen, and they still see resolved threads (unlike
          // the Founder, for whom every thread here is open by construction:
          // listArtifactCommentThreads drops resolved ones from their view).
          <Badge variant={isResolved ? "secondary" : "default"}>
            {isResolved ? "Resolved" : "Open"}
          </Badge>
        ) : !isReplying ? (
          // No status to show and no Resolve action to make room for, so
          // Reply lives in the badge's spot instead of a full-width row
          // below — a Founder mostly just reads; replying is the exception.
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => setIsReplying(true)}
          >
            Reply
          </Button>
        ) : null}
      </div>

      {thread.anchor.quote ? (
        <blockquote className="mt-2 border-l-2 border-border pl-3 text-xs italic text-muted-foreground">
          “{thread.anchor.quote}”
        </blockquote>
      ) : null}

      <div className="mt-3 divide-y divide-border/70">
        {thread.comments.map((comment, index) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            viewerUserId={viewerUserId}
            isOpeningComment={index === 0}
            pathname={pathname}
          />
        ))}
      </div>

      {isReplying ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3">
          <textarea
            rows={2}
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            placeholder="Reply…"
            className={TEXTAREA_CLASS}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isPending || replyBody.trim().length === 0}
                onClick={submitReply}
              >
                Reply
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setReplyBody("");
                  setIsReplying(false);
                }}
              >
                Cancel
              </Button>
            </div>
            {canModerate ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={toggleResolved}
              >
                {isResolved ? "Reopen" : "Resolve"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : canModerate ? (
        // The Founder's Reply trigger already lives in the header row above
        // (see the badge's spot) when there's no Resolve action competing
        // for that space — this row exists only to give the Mentor/Admin's
        // Resolve/Reopen a place to sit next to Reply.
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => setIsReplying(true)}
          >
            Reply
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={toggleResolved}
          >
            {isResolved ? "Reopen" : "Resolve"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Same slug shape, same input (the anchor's raw heading text), so a click
// here lands on the heading MarkdownDocument rendered. Imported rather than
// duplicated now that the slug lives in its own dependency-free module —
// see lib/artifact-heading-slug.ts — so this "use client" bundle still
// never drags in react-markdown, which markdown-document.tsx pulls in at
// module scope.
function slugForAnchor(thread: ArtifactCommentThread): string {
  if (thread.anchor.kind === "document") {
    return "";
  }
  return slugifyArtifactHeading(thread.anchor.heading ?? "");
}
