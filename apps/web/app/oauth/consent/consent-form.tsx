"use client";

import { useState } from "react";

type ConsentFormProps = {
  consentCode: string;
  clientName: string;
};

type ConsentAction = "accept" | "deny" | null;

interface OAuthConsentResponse {
  redirectURI: string;
}

// Posts directly to Better Auth's own raw endpoint — every hardening rule
// (same-origin, session-user match, atomic single-use claim) is already
// enforced by the shared before-hook on this exact path
// (apps/web/lib/mcp-oauth-compat/consent-validation.ts), so no separate
// wrapper route is needed here. A same-origin browser `fetch` from this
// page already sends the right `Origin`/`Sec-Fetch-Site` headers and the
// session cookie without any extra plumbing.
const CONSENT_ENDPOINT = "/api/auth/oauth2/consent";

export function ConsentForm({ consentCode, clientName }: ConsentFormProps) {
  const [pendingAction, setPendingAction] = useState<ConsentAction>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(accept: boolean) {
    setError(null);
    setPendingAction(accept ? "accept" : "deny");

    try {
      const response = await fetch(CONSENT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });

      const body = (await response.json().catch(() => null)) as
        | OAuthConsentResponse
        | { error?: string; error_description?: string }
        | null;

      if (!response.ok || !body || !("redirectURI" in body)) {
        setError(
          (body && "error_description" in body && body.error_description) ||
            "Something went wrong processing your response. Go back and try again.",
        );
        setPendingAction(null);
        return;
      }

      // A full browser navigation, not a client-side route change: the
      // destination is the connecting client's own redirect_uri, an
      // arbitrary (registered) external origin.
      window.location.href = body.redirectURI;
    } catch {
      setError("Network error — please try again.");
      setPendingAction(null);
    }
  }

  return (
    <div className="mt-6">
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={pendingAction !== null}
          className="flex-1 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
        >
          {pendingAction === "accept" ? "Connecting..." : "Allow"}
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={pendingAction !== null}
          className="flex-1 rounded-full border border-border px-6 py-3 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
        >
          {pendingAction === "deny" ? "Denying..." : "Deny"}
        </button>
      </div>
      <p className="sr-only">Authorize {clientName}</p>
    </div>
  );
}
