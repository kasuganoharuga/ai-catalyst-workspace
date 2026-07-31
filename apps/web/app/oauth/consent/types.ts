export type OAuthConsentPageProps = {
  // Only consent_code is trusted; client_id/scope in the URL are display-only
  // from Better Auth and must be re-fetched server-side.
  searchParams: Promise<{ consent_code?: string | string[] }>;
};

export type ConsentFormProps = {
  consentCode: string;
  clientName: string;
};

export type ConsentAction = "accept" | "deny" | null;

export type OAuthConsentResponse = {
  redirectURI: string;
};
