"use client";

import { useState } from "react";

import type {
  ConsentAction,
  ConsentFormProps,
  OAuthConsentResponse,
} from "../types";

// Posts to Better Auth's raw consent endpoint; hardening lives in
// mcp-oauth-compat/consent-validation.ts.
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

      // Full navigation: redirect_uri is an external registered origin.
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
      {/* Australian English in UI copy; OAuth wire values keep US spelling. */}
      <p className="sr-only">Authorise {clientName}</p>
    </div>
  );
}
