"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createFounderInvitationAction } from "@/lib/actions/mentor-actions";
import {
  firstZodMessage,
  invitationEmailSchema,
} from "@/lib/validation/invitation";
import { IssuedInvitationCredentials } from "@/components/issued-invitation-credentials";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { mentorInvitationsCopy, toastCopy } from "../lib/copy";

export function InviteFounderForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [issuedCredentials, setIssuedCredentials] = useState<{
    loginUrl: string;
    email: string;
    password: string;
  } | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = invitationEmailSchema.safeParse(email);
    if (!parsed.success) {
      const message = firstZodMessage(parsed.error);
      setError(message);
      toast.error(toastCopy.actionFailedTitle, { description: message });
      return;
    }
    setError(null);
    setIssuedCredentials(null);
    setConfirmEmail(parsed.data);
  }

  function handleCancel() {
    if (isPending) return;
    setConfirmEmail(null);
    setError(null);
  }

  function handleConfirm() {
    if (!confirmEmail) return;
    setError(null);
    startTransition(async () => {
      const result = await createFounderInvitationAction({
        email: confirmEmail,
      });

      if (!result.ok) {
        setError(result.message);
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message,
        });
        return;
      }

      // Credentials go out by email — only surface them on screen when
      // delivery failed, so there is still a way to hand them over manually.
      setIssuedCredentials(
        result.emailSent
          ? null
          : {
              loginUrl: result.loginUrl,
              email: result.email,
              password: result.initialPassword,
            },
      );
      setEmail("");
      setConfirmEmail(null);
      toast.success(mentorInvitationsCopy.inviteCreated, {
        description: result.emailSent
          ? mentorInvitationsCopy.inviteCreatedDescription
          : mentorInvitationsCopy.inviteEmailFailedDescription,
      });
      router.refresh();
    });
  }

  // Deliberately not wrapped in a card. It used to be, and a bordered panel
  // at max-w-xl sitting above a full-width list was the thing that made the
  // page read as two unrelated halves — and a `bg-card` input inside a
  // `bg-card` panel had no contrast against its own container. This is the
  // same input-plus-button toolbar the founders list uses for its search.
  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        noValidate
      >
        <label className="block w-full sm:max-w-sm">
          <span className="sr-only">
            {mentorInvitationsCopy.formEmailLabel}
          </span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            placeholder={mentorInvitationsCopy.formEmailPlaceholder}
            aria-invalid={error !== null && confirmEmail === null}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </label>
        <Button type="submit" disabled={isPending} className="shrink-0">
          {mentorInvitationsCopy.formSubmitIdle}
        </Button>
      </form>

      {error && confirmEmail === null ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {issuedCredentials ? (
        <IssuedInvitationCredentials
          heading={mentorInvitationsCopy.credentialsHeadingEmailFailed}
          loginUrl={issuedCredentials.loginUrl}
          email={issuedCredentials.email}
          password={issuedCredentials.password}
          note={mentorInvitationsCopy.credentialsNoteEmailFailed}
        />
      ) : null}

      <Dialog
        open={confirmEmail !== null}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <DialogContent showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>{mentorInvitationsCopy.confirmTitle}</DialogTitle>
            <DialogDescription>
              {confirmEmail
                ? mentorInvitationsCopy.confirmBody(confirmEmail)
                : null}
            </DialogDescription>
          </DialogHeader>

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
              {mentorInvitationsCopy.confirmCancel}
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isPending}>
              {isPending
                ? mentorInvitationsCopy.confirmSubmitPending
                : mentorInvitationsCopy.confirmSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
