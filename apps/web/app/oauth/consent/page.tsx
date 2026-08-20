import { redirect } from "next/navigation";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  getMcpConnectionToBeReplaced,
  getPendingMcpConsentRequest,
} from "@ai-catalyst/services/mcp-auth";

import { Logo } from "@/components/logo";
import { requireAuthenticatedUser } from "@/lib/require-active-user";

import { ConsentForm } from "./components/consent-form";
import { InvalidConsentRequest } from "./components/invalid-consent-request";
import { ReplacementWarning } from "./components/replacement-warning";
import { SCOPE_DESCRIPTIONS } from "./lib/scope-descriptions";
import type { OAuthConsentPageProps } from "./types";

export default async function OAuthConsentPage({
  searchParams,
}: OAuthConsentPageProps) {
  // Preserve consent_code across sign-in via returnTo — a bare "/" redirect
  // drops it and strands the connecting client.
  const { consent_code } = await searchParams;
  const consentCode =
    typeof consent_code === "string" ? consent_code : undefined;

  const session = await requireAuthenticatedUser({
    returnTo: consentCode
      ? `/oauth/consent?consent_code=${encodeURIComponent(consentCode)}`
      : undefined,
  });

  // Pending accounts cannot redeem grants — send them to /pending instead of
  // a consent screen that would end in invalid_grant.
  if (session.user.role === "pending") {
    redirect("/pending");
  }

  if (!consentCode) {
    return <InvalidConsentRequest />;
  }

  let pending;
  try {
    pending = await getPendingMcpConsentRequest(consentCode, session.user.id);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") {
      return <InvalidConsentRequest />;
    }
    throw error;
  }

  const replacedClientName = await getMcpConnectionToBeReplaced(
    session.user.id,
    pending.clientId,
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <Logo />
        <h1 className="mt-8 text-xl font-semibold tracking-tight">
          {pending.clientName} wants to connect
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{session.user.email}</span>
        </p>

        <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            This will allow {pending.clientName} to
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {pending.scopes.map((scope) => (
              <li key={scope}>{SCOPE_DESCRIPTIONS[scope] ?? scope}</li>
            ))}
          </ul>
        </div>

        {replacedClientName ? (
          <ReplacementWarning clientName={replacedClientName} />
        ) : null}

        <p className="mt-4 text-xs text-muted-foreground">
          You&apos;ll be redirected back to{" "}
          <span className="font-medium">{pending.redirectHost}</span>.
        </p>

        <ConsentForm
          consentCode={pending.consentCode}
          clientName={pending.clientName}
        />
      </div>
    </div>
  );
}
