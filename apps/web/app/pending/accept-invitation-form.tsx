"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInvitationForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to accept invitation.");
      setIsSubmitting(false);
      return;
    }

    // Not router.push: a browser back button landing on this now-stale
    // "accept" step would be confusing once the account is already a
    // Founder. router.refresh() re-runs the server session check on the
    // next navigation so /dashboard immediately sees the upgraded role.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="mt-10 rounded-2xl border border-border bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Have a Founder invitation?
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Invitation token
          </span>
          <input
            type="text"
            required
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
        >
          {isSubmitting ? "Accepting..." : "Accept invitation"}
        </button>
      </form>
    </div>
  );
}
