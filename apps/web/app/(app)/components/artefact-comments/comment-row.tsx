"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ArtifactComment } from "@ai-catalyst/shared";

import {
  editArtifactCommentAction,
  softDeleteArtifactCommentAction,
} from "@/lib/actions/artifact-comment-actions";
import { formatShortDate } from "@/lib/format";

import { Button } from "@/components/ui/button";

export const TEXTAREA_CLASS =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

export function CommentRow({
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
