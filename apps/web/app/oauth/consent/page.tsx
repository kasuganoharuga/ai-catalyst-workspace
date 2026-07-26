import { ShieldAlert } from "lucide-react";

import { ServiceError } from "@ai-catalyst/services/errors";
import { getPendingMcpConsentRequest } from "@ai-catalyst/services/mcp-auth";

import { Logo } from "@/components/logo";
import { requireAuthenticatedUser } from "@/lib/require-active-user";

import { ConsentForm } from "./consent-form";

type OAuthConsentPageProps = {
  // Only `consent_code` is ever trusted — `client_id`/`scope` in the URL
  // (sent by better-auth's own authorize() redirect for display purposes)
  // are deliberately never read here. Every value actually shown below is
  // re-fetched server-side from the verification/mcp_oauth_applications
  // tables via `getPendingMcpConsentRequest`, keyed only by `consent_code` —
  // a URL parameter is not something this page can trust a client to send
  // honestly (a malicious link could set client_id/scope to whatever it
  // wants to try to phish a user into accepting a different grant than
  // what's actually pending).
  searchParams: Promise<{ consent_code?: string | string[] }>;
};

function InvalidConsentRequest() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <ShieldAlert aria-hidden="true" className="h-10 w-10 text-destructive" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        This authorisation request is invalid or has expired.
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Go back to the application you were connecting and try again.
      </p>
    </div>
  );
}

export default async function OAuthConsentPage({
  searchParams,
}: OAuthConsentPageProps) {
  const session = await requireAuthenticatedUser();
  const { consent_code } = await searchParams;
  const consentCode =
    typeof consent_code === "string" ? consent_code : undefined;

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
              <li key={scope}>
                {scope === "mcp:connect"
                  ? "Access your AI Catalyst workspace on your behalf, through the Model Context Protocol."
                  : scope}
              </li>
            ))}
          </ul>
        </div>

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
