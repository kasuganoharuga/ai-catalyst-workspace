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
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

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
    setIssuedToken(null);
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

      setIssuedToken(result.rawToken);
      setEmail("");
      setConfirmEmail(null);
      toast.success(adminActionCopy.inviteCreated(label), {
        description: adminActionCopy.inviteCreatedDescription,
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

      {issuedToken ? (
        <div className="mt-5 rounded-xl border border-accent bg-accent p-4 sm:max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">
            One-time code — copy it now
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {issuedToken}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            This code is shown once and cannot be retrieved again. Share it with
            the invited {inviteRole} manually.
          </p>
        </div>
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
              Create a one-time invite for{" "}
              <span className="font-medium text-foreground">
                {confirmEmail}
              </span>
              . You will need to share the code yourself — there is no email
              delivery yet.
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
