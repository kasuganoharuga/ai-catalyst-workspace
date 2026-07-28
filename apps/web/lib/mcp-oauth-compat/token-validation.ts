import { createAuthMiddleware } from "better-auth/api";

import {
  checkAuthorizationCodeIsRedeemable,
  checkRefreshTokenIsRedeemable,
  rotateOutMcpRefreshToken,
  tryClaimRefreshToken,
} from "@ai-catalyst/services/mcp-auth";

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
 *
 * The `refresh_token` grant runs through here for a different reason. That
 * branch of the real handler is non-destructive (no code to burn), but it
 * never re-checks that the user behind the token is still usable — a deleted
 * or reverted-to-`pending` account would keep minting hour-long access
 * tokens for the life of its refresh token. `checkRefreshTokenIsRedeemable`
 * closes that, and keeps both grants answering in the same OAuth error
 * vocabulary. `tryClaimRefreshToken` then takes an exclusive short-lived
 * claim so a parallel refresh cannot mint a second live chain before the
 * after-hook rotates the old row away. Rotation itself is handled after the
 * fact by `tokenEndpointAfterHook` below.
 */
export const tokenEndpointBeforeHook = {
  matcher: (ctx: { path?: string }): boolean => ctx.path === "/mcp/token",
  handler: createAuthMiddleware(async (ctx) => {
    const body = normalizeOAuthTokenBody(ctx.body);

    if (body.grant_type === "refresh_token") {
      const result = await checkRefreshTokenIsRedeemable({
        refreshToken: body.refresh_token,
        clientId: body.client_id,
      });

      if (!result.ok) {
        throw oauthError(result.error, result.description);
      }

      // Same vocabulary as a missing/rotated token — a concurrent redeem
      // must not be distinguishable from a replay.
      const claimed = await tryClaimRefreshToken(body.refresh_token);
      if (!claimed) {
        throw oauthError("invalid_grant", "Invalid refresh token.");
      }
      return;
    }

    // Anything that is neither grant (missing, malformed, or a grant this
    // profile never implemented — client_credentials, password, implicit)
    // is rejected here, before it can reach — and consume a code via — the
    // real handler.
    if (body.grant_type !== "authorization_code") {
      throw oauthError(
        "unsupported_grant_type",
        "Only the authorization_code and refresh_token grants are supported.",
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

/**
 * Completes refresh-token rotation, which better-auth@1.6.25's own refresh
 * branch leaves half-done: it inserts a new `mcp_oauth_access_tokens` row and
 * returns the new pair, but never removes the row the presented refresh token
 * came from. Left alone that means every refresh token ever issued stays
 * redeemable for its full 30 days, and every refresh leaves another row
 * behind. Deleting the old family here makes rotation real — a replayed or
 * stolen refresh token then finds nothing and is rejected as `invalid_grant`
 * by `checkRefreshTokenIsRedeemable`, which is this profile's reuse
 * detection. Parallel redemption is stopped earlier by `tryClaimRefreshToken`
 * in the before-hook; this after-hook is what actually retires the old row.
 *
 * Why an `after` hook and not a `before` one: the old row must not be dropped
 * until the replacement actually exists. A failed refresh that had already
 * deleted its own credential would cost the Founder the connection outright —
 * the exact outcome refresh tokens are here to prevent.
 *
 * `runAfterHooks` (`better-auth/dist/api/dispatch.mjs`) runs after-hooks on
 * the failure path too, with `ctx.context.returned` set to the `APIError`, so
 * a successful token response has to be positively identified before anything
 * is deleted — hence the `access_token` / `refresh_token` checks rather than
 * a truthiness test.
 */
function getSuccessfulRefreshResponse(
  returned: unknown,
): { refreshToken: string } | null {
  if (
    typeof returned !== "object" ||
    returned === null ||
    returned instanceof Error
  ) {
    return null;
  }
  const accessToken = (returned as { access_token?: unknown }).access_token;
  const refreshToken = (returned as { refresh_token?: unknown }).refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return null;
  }
  return { refreshToken };
}

export const tokenEndpointAfterHook = {
  matcher: (ctx: { path?: string }): boolean => ctx.path === "/mcp/token",
  handler: createAuthMiddleware(async (ctx) => {
    let body: Record<string, string>;
    try {
      body = normalizeOAuthTokenBody(ctx.body);
    } catch {
      // A body this hook cannot read never reached the refresh branch —
      // the before-hook would have rejected it first.
      return;
    }

    if (body.grant_type !== "refresh_token" || !body.refresh_token) {
      return;
    }

    const success = getSuccessfulRefreshResponse(ctx.context.returned);
    if (!success) {
      return;
    }

    try {
      await rotateOutMcpRefreshToken({
        presentedRefreshToken: body.refresh_token,
        newRefreshToken: success.refreshToken,
      });
    } catch (error) {
      // The Founder already holds a valid new token pair. Turning a
      // successful refresh into a failure because cleanup of the old row
      // failed would disconnect them for no reason; the before-hook claim
      // blocks re-use of the presented token for its short TTL, and
      // `oauth:cleanup` eventually sweeps a row whose both halves expire.
      console.error("Failed to rotate out redeemed MCP refresh token:", error);
    }
  }),
};
