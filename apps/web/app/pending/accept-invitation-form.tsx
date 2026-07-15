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
    // next navigation so /workspace immediately sees the upgraded role.
    router.replace("/workspace");
    router.refresh();
  }

  return (
    <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
        Have a Founder invitation?
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Invitation token
          </span>
          <input
            type="text"
            required
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-stone-950"
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"
        >
          {isSubmitting ? "Accepting..." : "Accept invitation"}
        </button>
      </form>
    </div>
  );
}
