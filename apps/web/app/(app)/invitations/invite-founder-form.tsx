"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createFounderInvitationAction } from "@/lib/actions/mentor-actions";
import { Button } from "@/components/ui/button";

import { mentorInvitationsCopy } from "../lib/copy";

export function InviteFounderForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createFounderInvitationAction({ email });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setIssuedToken(result.rawToken);
      setEmail("");
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
      >
        <label className="block w-full sm:max-w-sm">
          <span className="sr-only">
            {mentorInvitationsCopy.formEmailLabel}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={mentorInvitationsCopy.formEmailPlaceholder}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </label>
        <Button type="submit" disabled={isPending} className="shrink-0">
          {isPending
            ? mentorInvitationsCopy.formSubmitPending
            : mentorInvitationsCopy.formSubmitIdle}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {issuedToken ? (
        <div className="mt-5 rounded-xl border border-accent bg-accent p-4 sm:max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">
            {mentorInvitationsCopy.tokenHeading}
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {issuedToken}
          </p>
          {/* "Code", not "token", to match the field the invitee is asked to
              paste it into on /pending. */}
          <p className="mt-2 text-xs text-muted-foreground">
            {mentorInvitationsCopy.tokenNote}
          </p>
        </div>
      ) : null}
    </div>
  );
}
