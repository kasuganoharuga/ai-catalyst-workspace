"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createInvitationAction,
  createMentorInvitationAction,
} from "@/lib/actions/admin-actions";
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
import { toastCopy } from "@/app/(app)/lib/copy";

import { adminActionCopy } from "../lib/copy";

export function CreateInvitationForm({
  inviteRole,
}: {
  inviteRole: "founder" | "mentor";
}) {
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

  const label = inviteRole === "mentor" ? "Mentor" : "Founder";

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
      const create =
        inviteRole === "mentor"
          ? createMentorInvitationAction
          : createInvitationAction;

      const result = await create({ email: confirmEmail });

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
      toast.success(adminActionCopy.inviteCreated(label), {
        description: result.emailSent
          ? adminActionCopy.inviteCreatedDescription
          : adminActionCopy.inviteEmailFailedDescription,
      });
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        noValidate
      >
        <label className="block w-full sm:max-w-sm">
          <span className="sr-only">{label} email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            placeholder={`${label} email`}
            aria-invalid={error !== null && confirmEmail === null}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </label>
        <Button type="submit" disabled={isPending} className="shrink-0">
          Invite {label.toLowerCase()}
        </Button>
      </form>

      {error && confirmEmail === null ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {issuedCredentials ? (
        <IssuedInvitationCredentials
          heading={adminActionCopy.credentialsHeadingEmailFailed}
          loginUrl={issuedCredentials.loginUrl}
          email={issuedCredentials.email}
          password={issuedCredentials.password}
          note={adminActionCopy.credentialsNoteEmailFailed(inviteRole)}
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
            <DialogTitle>Send {label.toLowerCase()} invitation?</DialogTitle>
            <DialogDescription>
              Create an account for{" "}
              <span className="font-medium text-foreground">
                {confirmEmail}
              </span>{" "}
              and email them how to sign in.
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
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Creating…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
