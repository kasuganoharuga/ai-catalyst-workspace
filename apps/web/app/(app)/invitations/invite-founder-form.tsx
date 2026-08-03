"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createFounderInvitationAction } from "@/lib/actions/mentor-actions";
import { Button } from "@/components/ui/button";

import { mentorInvitationsCopy } from "../lib/copy";

export function InviteFounderForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createFounderInvitationAction({
        email,
        personalMessage:
          personalMessage.trim() === "" ? undefined : personalMessage,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setIssuedToken(result.rawToken);
      setEmail("");
      setPersonalMessage("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={mentorInvitationsCopy.formEmailLabel}>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </Field>
        <Field label={mentorInvitationsCopy.formMessageLabel}>
          <textarea
            value={personalMessage}
            onChange={(event) => setPersonalMessage(event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending
            ? mentorInvitationsCopy.formSubmitPending
            : mentorInvitationsCopy.formSubmitIdle}
        </Button>
      </form>

      {issuedToken ? (
        <div className="mt-6 rounded-lg border border-accent bg-accent p-4">
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
