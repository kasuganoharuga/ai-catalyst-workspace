"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { AssignableMentor } from "@ai-catalyst/shared";

import { toastCopy } from "@/app/(app)/lib/copy";
import { assignWorkspaceMentorAction } from "@/lib/actions/admin-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { adminActionCopy } from "../lib/copy";

function mentorLabel(
  mentorUserId: string | null,
  mentors: AssignableMentor[],
): string {
  if (mentorUserId === null || mentorUserId === "") {
    return "No mentor";
  }
  const mentor = mentors.find((row) => row.id === mentorUserId);
  return mentor?.name?.trim() || mentor?.email || "Unknown mentor";
}

export function AssignMentorControl({
  workspaceId,
  currentMentorUserId,
  mentors,
  founderEmail,
}: {
  workspaceId: string;
  currentMentorUserId: string | null;
  mentors: AssignableMentor[];
  founderEmail: string;
}) {
  const router = useRouter();
  // While a confirm dialog is open, pending holds the draft selection;
  // otherwise the select mirrors the server prop (no effect sync needed).
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectValue = pending !== null ? pending : (currentMentorUserId ?? "");

  function handleSelectChange(nextValue: string) {
    if (nextValue === (currentMentorUserId ?? "")) {
      return;
    }
    setError(null);
    setPending(nextValue);
  }

  function handleCancel() {
    if (isPending) return;
    setPending(null);
    setError(null);
  }

  function handleConfirm() {
    if (pending === null) return;
    const nextMentorId = pending === "" ? null : pending;
    setError(null);
    startTransition(async () => {
      const result = await assignWorkspaceMentorAction({
        workspaceId,
        mentorUserId: nextMentorId,
      });
      if (!result.ok) {
        setError(result.message);
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message,
        });
        return;
      }
      setPending(null);
      toast.success(adminActionCopy.mentorAssigned);
      router.refresh();
    });
  }

  const dialogOpen = pending !== null;
  const fromLabel = mentorLabel(currentMentorUserId, mentors);
  const toLabel = mentorLabel(pending, mentors);

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <label className="sr-only" htmlFor={`mentor-${workspaceId}`}>
        Mentor
      </label>
      <select
        id={`mentor-${workspaceId}`}
        value={selectValue}
        onChange={(event) => handleSelectChange(event.target.value)}
        disabled={isPending || mentors.length === 0}
        className="w-full max-w-[14rem] rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50 sm:ml-auto"
      >
        <option value="">No mentor</option>
        {mentors.map((mentor) => (
          <option key={mentor.id} value={mentor.id}>
            {mentor.name?.trim() || mentor.email}
          </option>
        ))}
      </select>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <DialogContent showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>Change mentor?</DialogTitle>
            <DialogDescription>
              Update the mentor for{" "}
              <span className="font-medium text-foreground">
                {founderEmail}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm leading-6">
            <p>
              <span className="text-muted-foreground">From </span>
              {fromLabel}
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">To </span>
              {toLabel}
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
