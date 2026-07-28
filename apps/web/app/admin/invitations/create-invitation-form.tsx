"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createInvitationAction } from "@/lib/actions/admin-actions";

export function CreateInvitationForm() {
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
      const result = await createInvitationAction({
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
    <div className="mt-8 rounded-2xl border border-border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </Field>
        <Field label="Personal message (optional)">
          <textarea
            value={personalMessage}
            onChange={(event) => setPersonalMessage(event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
        >
          {isPending ? "Creating invitation..." : "Create invitation"}
        </button>
      </form>

      {issuedToken ? (
        <div className="mt-6 rounded-xl border border-accent bg-accent p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">
            One-time code — copy it now
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {issuedToken}
          </p>
          {/* "Code", not "token", so this matches the field the founder is
              asked to paste it into on /pending. Admin-only screen, but it
              is one half of a handoff whose other half they read. */}
          <p className="mt-2 text-xs text-muted-foreground">
            This code is shown once and cannot be retrieved again. Share it with
            the invited founder manually.
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
