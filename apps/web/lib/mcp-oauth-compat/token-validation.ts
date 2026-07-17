import { createAuthMiddleware } from "better-auth/api";

import { checkAuthorizationCodeIsRedeemable } from "@ai-catalyst/services/mcp-auth";

import { oauthError } from "./oauth-errors";

/**
 * Normalizes a `POST /mcp/token` request body into a plain
 * `Record<string, string>` regardless of how Better Auth handed it to us.
 *
 * `POST /mcp/token`'s own endpoint metadata declares
 * `allowedMediaTypes: ["application/x-www-form-urlencoded",
 * "application/json"]`, and the real handler
 * (`better-auth/dist/plugins/mcp/index.mjs`'s `mcpOAuthToken`) explicitly
 * branches on `body instanceof FormData` before doing anything else with
 * it — confirming `ctx.body` for a form-urlencoded request is a `FormData`
 * instance, not a plain object, at the point a `before` hook (which runs
 * ahead of that handler) sees it. Real OAuth clients commonly POST this
 * endpoint as `application/x-www-form-urlencoded`, so this must handle
 * both shapes, not just JSON.
 */
export function normalizeOAuthTokenBody(
  input: unknown,
): Record<string, string> {
  if (input instanceof FormData) {
    const result: Record<string, string> = {};
    for (const [key, value] of input.entries()) {
      result[key] = typeof value === "string" ? value : String(value);
    }
    return result;
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      if (value === undefined || value === null) continue;
      result[key] = String(value);
    }
    return result;
  }

  throw oauthError("invalid_request", "Request body is invalid.");
}

/**
 * Closes a code-exhaustion hole in better-auth@1.6.23's `/mcp/token`
 * handler: it calls the destructive `consumeVerificationValue(code)`
 * *before* validating `grant_type`, `client_id`, `redirect_uri`, or the
 * PKCE `code_verifier` (see
 * packages/services/src/mcp-auth/index.ts's `checkAuthorizationCodeIsRedeemable`
 * doc comment for the exact source-verified call order). A request with a
 * valid `code` but a wrong grant_type/client/redirect_uri/verifier would
 * otherwise permanently burn a legitimate authorization code before
 * failing — starving the real client that owns it.
 *
 * This hook unconditionally intercepts every `/mcp/token` request — not
 * just ones that already look like `grant_type=authorization_code` in a
 * parsed JSON body — because that same conditional-matcher mistake is
 * exactly what let a `FormData` body or a missing/wrong `grant_type` slip
 * past a narrower check straight into the real handler's
 * `consumeVerificationValue` call.
 */
export const tokenEndpointBeforeHook = {
  matcher: (ctx: { path?: string }): boolean => ctx.path === "/mcp/token",
  handler: createAuthMiddleware(async (ctx) => {
    const body = normalizeOAuthTokenBody(ctx.body);

    // V1 does not support the refresh grant at all — the /mcp/authorize
    // before-hook (hooks.ts) never lets a client's requested scope include
    // anything the underlying plugin would issue a refresh token for, so
    // any grant_type other than authorization_code (missing, malformed,
    // or literally "refresh_token") is rejected here, before it can reach
    // — and consume a code via — the real handler.
    if (body.grant_type !== "authorization_code") {
      throw oauthError(
        "unsupported_grant_type",
        "Only the authorization_code grant is supported.",
      );
    }

    const result = await checkAuthorizationCodeIsRedeemable({
      code: body.code,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      codeVerifier: body.code_verifier,
    });

    if (!result.ok) {
      throw oauthError(result.error, result.description);
    }
  }),
};
