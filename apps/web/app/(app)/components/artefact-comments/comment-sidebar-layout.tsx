"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * The one piece of client state in the comments feature: whether the
 * sidebar rail is open. `documentSlot` and `sidebarSlot` arrive already
 * rendered by the Server Component caller — this component only toggles
 * which of them show, never re-renders their content, so nothing about
 * MarkdownDocument's server-only dependencies crosses into this bundle.
 */
export function CommentSidebarLayout({
  documentSlot,
  sidebarSlot,
  openCount,
}: {
  documentSlot: ReactNode;
  sidebarSlot: ReactNode;
  openCount: number;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      {/* Deliberately no unread count here. Read tracking exists in the
          service (artifact_comment_reads / unreadCount /
          markArtifactCommentThreadRead), but its useful surface is a badge
          on the artefact list — "there is new feedback on a document you
          are not currently looking at". On this page the number is
          tautological, and nothing clears it on view, so showing it here
          would only ever read as stuck. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Document
          {openCount > 0 ? ` · ${openCount} open` : ""}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? "Hide comments" : "Show comments"}
        </Button>
      </div>

      <div
        className={
          isOpen
            ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]"
            : "grid grid-cols-1"
        }
      >
        {documentSlot}
        {isOpen ? sidebarSlot : null}
      </div>
    </>
  );
}
