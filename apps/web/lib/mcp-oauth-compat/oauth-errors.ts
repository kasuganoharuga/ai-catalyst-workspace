import { APIError } from "better-auth/api";

/**
 * The OAuth 2.0/2.1 `error` codes this compatibility layer ever throws.
 * Every before-hook in this directory throws through {@link oauthError}
 * instead of raw `APIError` so every rejection carries a stable,
 * spec-shaped `{ error, error_description }` body — never a generic 500 or
 * an internal stack trace leaking to the client.
 */
export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "invalid_target"
  | "access_denied"
  | "consent_required"
  | "server_error"
  // RFC 7591 (Dynamic Client Registration) vocabulary — distinct from the
  // token/authorize endpoint codes above, used only by
  // dcr-validation.ts's /mcp/register before-hook.
  | "invalid_client_metadata"
  | "invalid_redirect_uri";

// Mirrors the HTTP status Better Auth's own mcp/oidc-provider handlers use
// for each of these same `error` codes (see mcp/index.mjs's mcpOAuthToken
// and oidc-provider/authorize.mjs) — kept consistent so a client can't tell
// our before-hooks apart from the real handler by status code alone.
const STATUS_BY_ERROR: Record<
  OAuthErrorCode,
  "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "INTERNAL_SERVER_ERROR"
> = {
  invalid_request: "BAD_REQUEST",
  invalid_client: "UNAUTHORIZED",
  invalid_grant: "UNAUTHORIZED",
  unauthorized_client: "UNAUTHORIZED",
  unsupported_grant_type: "BAD_REQUEST",
  invalid_scope: "BAD_REQUEST",
  invalid_target: "BAD_REQUEST",
  access_denied: "FORBIDDEN",
  consent_required: "FORBIDDEN",
  server_error: "INTERNAL_SERVER_ERROR",
  invalid_client_metadata: "BAD_REQUEST",
  invalid_redirect_uri: "BAD_REQUEST",
};

export function oauthError(
  error: OAuthErrorCode,
  description: string,
): APIError {
  return new APIError(STATUS_BY_ERROR[error], {
    error,
    error_description: description,
  });
}

/**
 * Converts an unknown thrown value into a stable `oauthError`, for the
 * boundary between a `packages/services` call (which throws
 * `ServiceError`) and a Better Auth before-hook (which must only ever
 * surface spec-shaped OAuth errors — never a bare 500 or a leaked
 * `ServiceError` message). `ServiceError`'s own `code` is deliberately
 * *not* inspected here: every business-error branch this compatibility
 * layer relies on (`getPendingMcpConsentRequest`'s collapsed `NOT_FOUND`,
 * `verifyMcpBearerToken`'s `UNAUTHENTICATED`/`FORBIDDEN`) already means
 * something different in OAuth vocabulary depending on *which* endpoint
 * called it, so each hook passes its own `fallback` rather than this
 * function guessing from the ServiceError code alone.
 */
export function toOAuthError(
  error: unknown,
  fallback: OAuthErrorCode,
): APIError {
  if (error instanceof APIError) {
    return error;
  }
  const description =
    error instanceof Error ? error.message : "Request could not be processed.";
  return oauthError(fallback, description);
}
