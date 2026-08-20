import { createHash } from "node:crypto";

import { pool } from "@ai-catalyst/db";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  type AuthorizationCodeCheckResult,
  MCP_CONSENT_CODE_PATTERN,
  isExactlyGrantedScopeSet,
  mcpCodeVerificationSchema,
  rejectCode,
} from "@ai-catalyst/services/mcp-auth/types";
import {
  getAuthorizableUserById,
  getOAuthClientByClientId,
  isValidPublicOAuthClientRecord,
} from "@ai-catalyst/services/mcp-auth/internal/lookups";

// --- Pending consent ---

export interface PendingMcpConsentRequest {
  consentCode: string;
  clientId: string;
  clientName: string;
  // Host only — never full redirect URI on the consent screen.
  redirectHost: string;
  scopes: string[];
}

interface VerificationRow {
  identifier: string;
  value: string;
  expires_at: Date;
}

interface OAuthApplicationNameRow {
  name: string;
  disabled: boolean;
}

// Queries verifications.identifier directly; apps/web pins storeIdentifier to "plain".
async function findVerificationByIdentifier(
  consentCode: string,
): Promise<VerificationRow | undefined> {
  const result = await pool.query<VerificationRow>(
    `select identifier, value, expires_at from verifications where identifier = $1`,
    [consentCode],
  );
  return result.rows[0];
}

// Uniform NOT_FOUND — no enumeration of missing vs wrong-user vs already-accepted.
function pendingConsentNotFound(): ServiceError {
  return new ServiceError(
    "NOT_FOUND",
    "Pending MCP consent request was not found.",
  );
}

export async function getPendingMcpConsentRequest(
  consentCode: unknown,
  currentUserId: string,
): Promise<PendingMcpConsentRequest> {
  if (
    typeof consentCode !== "string" ||
    !MCP_CONSENT_CODE_PATTERN.test(consentCode)
  ) {
    throw pendingConsentNotFound();
  }

  const verification = await findVerificationByIdentifier(consentCode);
  if (!verification) {
    throw pendingConsentNotFound();
  }

  if (verification.expires_at.getTime() <= Date.now()) {
    throw pendingConsentNotFound();
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(verification.value);
  } catch {
    throw pendingConsentNotFound();
  }

  const parsed = mcpCodeVerificationSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw pendingConsentNotFound();
  }
  const value = parsed.data;

  if (value.userId !== currentUserId) {
    throw pendingConsentNotFound();
  }

  // Pending only when requireConsent is true (opposite of /mcp/token pre-flight).
  if (!value.requireConsent) {
    throw pendingConsentNotFound();
  }

  if (!isExactlyGrantedScopeSet(value.scope)) {
    throw pendingConsentNotFound();
  }

  const clientResult = await pool.query<OAuthApplicationNameRow>(
    `select name, disabled from mcp_oauth_applications where client_id = $1`,
    [value.clientId],
  );
  const client = clientResult.rows[0];
  if (!client || client.disabled) {
    throw pendingConsentNotFound();
  }

  let redirectHost: string;
  try {
    redirectHost = new URL(value.redirectURI).host;
  } catch {
    throw pendingConsentNotFound();
  }

  return {
    consentCode,
    clientId: value.clientId,
    clientName: client.name,
    redirectHost,
    scopes: value.scope,
  };
}

// --- Authorization code pre-flight ---

/**
 * Read-only pre-flight before Better Auth consumes the code. Closes a hole
 * where malformed requests burn valid codes before grant_type/client/PKCE checks.
 * refresh_token grants use checkRefreshTokenIsRedeemable instead.
 */
export async function checkAuthorizationCodeIsRedeemable(params: {
  code: unknown;
  clientId: unknown;
  redirectUri: unknown;
  codeVerifier: unknown;
}): Promise<AuthorizationCodeCheckResult> {
  const { code, clientId, redirectUri, codeVerifier } = params;

  if (typeof code !== "string" || !MCP_CONSENT_CODE_PATTERN.test(code)) {
    return rejectCode("invalid_grant", "Invalid code.");
  }

  const verification = await findVerificationByIdentifier(code);
  if (!verification) {
    return rejectCode("invalid_grant", "Invalid code.");
  }

  if (verification.expires_at.getTime() <= Date.now()) {
    return rejectCode("invalid_grant", "Code has expired.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(verification.value);
  } catch {
    return rejectCode("invalid_grant", "Invalid code.");
  }

  const parsed = mcpCodeVerificationSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return rejectCode("invalid_grant", "Invalid code.");
  }
  const value = parsed.data;

  if (value.requireConsent) {
    return rejectCode(
      "invalid_grant",
      "Consent has not been completed for this code.",
    );
  }

  if (typeof clientId !== "string" || clientId.length === 0) {
    return rejectCode("invalid_client", "client_id is required.");
  }
  if (value.clientId !== clientId) {
    return rejectCode(
      "invalid_client",
      "client_id does not match the authorization request.",
    );
  }

  if (typeof redirectUri !== "string" || redirectUri.length === 0) {
    return rejectCode("invalid_request", "redirect_uri is required.");
  }
  if (value.redirectURI !== redirectUri) {
    return rejectCode(
      "invalid_client",
      "redirect_uri does not match the authorization request.",
    );
  }

  const client = await getOAuthClientByClientId(clientId);
  if (!isValidPublicOAuthClientRecord(client)) {
    return rejectCode(
      "invalid_client",
      "Unknown, disabled, or non-public OAuth client.",
    );
  }

  // V1 is public clients only — PKCE code_verifier required.
  if (typeof codeVerifier !== "string" || codeVerifier.length === 0) {
    return rejectCode(
      "invalid_request",
      "code_verifier is required for public clients.",
    );
  }

  if (!value.codeChallenge) {
    return rejectCode("invalid_grant", "Invalid code.");
  }

  const expectedChallenge =
    value.codeChallengeMethod === "plain"
      ? codeVerifier
      : createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
  if (expectedChallenge !== value.codeChallenge) {
    return rejectCode("invalid_grant", "PKCE code verification failed.");
  }

  const user = await getAuthorizableUserById(value.userId);
  if (!user) {
    return rejectCode(
      "invalid_grant",
      "The account for this authorization request is no longer usable.",
    );
  }

  return { ok: true };
}

// --- Consent claim ---

function hashConsentCode(consentCode: string): string {
  return createHash("sha256").update(consentCode, "utf8").digest("hex");
}

const CONSENT_CLAIM_TTL_SECONDS = 60;

/**
 * Atomic claim for one concurrent /oauth2/consent Accept. Loser must fail
 * closed; not released early — code is single-use. Swept by oauth:cleanup.
 */
export async function tryClaimConsentCode(
  consentCode: string,
): Promise<boolean> {
  const result = await pool.query(
    `insert into mcp_oauth_consent_claims (consent_code_hash, expires_at)
     values ($1, now() + interval '1 second' * $2)
     on conflict (consent_code_hash) do nothing`,
    [hashConsentCode(consentCode), CONSENT_CLAIM_TTL_SECONDS],
  );
  return (result.rowCount ?? 0) > 0;
}
