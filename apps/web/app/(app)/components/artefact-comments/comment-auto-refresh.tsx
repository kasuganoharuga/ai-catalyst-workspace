"use client";

import { useCommentRefresh } from "@/app/(app)/hooks/use-comment-refresh";

/** Invisible: just keeps the artefact page polling for new comment activity while mounted. */
export function CommentAutoRefresh() {
  useCommentRefresh(true);
  return null;
}
