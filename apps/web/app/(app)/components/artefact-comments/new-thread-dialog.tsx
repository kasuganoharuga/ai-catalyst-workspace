"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { createArtifactCommentThreadAction } from "@/lib/actions/artifact-comment-actions";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const TEXTAREA_CLASS =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

export type CommentableHeading = { level: number; heading: string };

/**
 * A new comment thread is always anchored to one heading, fixed by
 * wherever this was opened from — the in-document "comment on this
 * section" trigger `MarkdownDocument` renders in each heading's gutter is
 * the only entry point (there is no separate picker/dropdown flow, so
 * there's nothing to keep in sync with that trigger). The top (H1) heading
 * is present in every artefact and never changes, so anchoring there
 * already reads as document-level feedback.
 */
export function NewThreadDialog({
  attemptId,
  artifactKey,
  pathname,
  heading,
}: {
  attemptId: string;
  artifactKey: string;
  pathname: string;
  heading: CommentableHeading;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (body.trim().length === 0) return;
    startTransition(async () => {
      const result = await createArtifactCommentThreadAction({
        attemptId,
        artifactKey,
        anchor: {
          kind: "section" as const,
          heading: heading.heading,
          headingLevel: heading.level,
        },
        body,
        pathname,
      });
      if (!result.ok) {
        toast.error("Couldn't open that thread", {
          description: result.message,
        });
        return;
      }
      setBody("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Comment on “${heading.heading}”`}
          title="Comment on this section"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <MessageSquarePlus aria-hidden="true" className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New comment</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">Anchor to</span>
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
              {heading.heading}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm text-muted-foreground">Comment</span>
            <textarea
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What would you like to raise?"
              className={TEXTAREA_CLASS}
              autoFocus
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            disabled={isPending || body.trim().length === 0}
            onClick={submit}
          >
            Post comment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
