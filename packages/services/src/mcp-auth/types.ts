import { z } from "zod";

import type { ActorRole } from "@ai-catalyst/contracts/actor-context";

// --- Scopes ---

export const MCP_CONNECT_SCOPE = "mcp:connect";

// Required for Better Auth refresh_token issuance; without it connections die at access-token expiry.
export const MCP_OFFLINE_ACCESS_SCOPE = "offline_access";

// Normalized scope set — /mcp/authorize forces every request to this shape.
export const GRANTED_MCP_SCOPES: readonly string[] = [
  MCP_CONNECT_SCOPE,
  MCP_OFFLINE_ACCESS_SCOPE,
];

export function isExactlyGrantedScopeSet(scopes: readonly string[]): boolean {
  const unique = new Set(scopes);
  return (
    unique.size === scopes.length &&
    unique.size === GRANTED_MCP_SCOPES.length &&
    GRANTED_MCP_SCOPES.every((scope) => unique.has(scope))
  );
}

// --- Connection lifetime ---

/** Idle limit from granted_at; switching clients restarts the clock. */
export const MCP_GRANT_IDLE_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Hard cap regardless of activity — catches a stolen refresh kept warm by use.
 * Enforced in checkRefreshTokenIsRedeemable on hourly refresh, not here.
 */
export const MCP_GRANT_ABSOLUTE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// Inlined — Turbopack cannot resolve relative imports from package-path entries (see index.ts).

// Shared schema for pre- and post-consent verification rows; requireConsent direction is per-caller.
// passthrough() so unknown Better Auth fields do not invalidate real codes.
export const mcpCodeVerificationSchema = z
  .object({
    clientId: z.string().min(1),
    redirectURI: z.string().url(),
    scope: z.array(z.string()),
    userId: z.string().min(1),
    authTime: z.number(),
    requireConsent: z.boolean(),
    state: z.string().nullable().optional(),
    codeChallenge: z.string().optional(),
    codeChallengeMethod: z.enum(["s256", "plain"]).optional(),
    nonce: z.string().optional(),
  })
  .passthrough();

export type McpCodeVerification = z.infer<typeof mcpCodeVerificationSchema>;

// generateRandomString(32, "a-z", "A-Z") — access and refresh tokens share this alphabet.
export const MCP_BEARER_TOKEN_PATTERN = /^[A-Za-z]{32}$/;

// generateRandomString(32, "a-z", "A-Z", "0-9") — authorization codes.
export const MCP_CONSENT_CODE_PATTERN = /^[A-Za-z0-9]{32}$/;

// --- Actor role helpers ---

export function isKnownActorRole(value: unknown): value is ActorRole {
  return (
    value === "pending" ||
    value === "founder" ||
    value === "mentor" ||
    value === "admin"
  );
}

// Founder-only at transport boundary — every MCP tool is Founder-scoped.
export function canUseMcp(role: ActorRole): boolean {
  return role === "founder";
}

// --- Shared pre-flight check result ---

export type AuthorizationCodeRejectionReason =
  | "invalid_request"
  | "invalid_grant"
  | "invalid_client"
  | "unsupported_grant_type";

export interface AuthorizationCodeCheckFailure {
  ok: false;
  error: AuthorizationCodeRejectionReason;
  description: string;
}

export type AuthorizationCodeCheckResult =
  { ok: true } | AuthorizationCodeCheckFailure;

export function rejectCode(
  error: AuthorizationCodeRejectionReason,
  description: string,
): AuthorizationCodeCheckFailure {
  return { ok: false, error, description };
}
