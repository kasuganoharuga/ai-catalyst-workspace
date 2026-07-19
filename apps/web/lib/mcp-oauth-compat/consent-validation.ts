import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  getPendingMcpConsentRequest,
  tryClaimConsentCode,
} from "@ai-catalyst/services/mcp-auth";

import { oauthError, toOAuthError } from "./oauth-errors";

interface RequestLikeContext {
  request?: Request | null;
}

/**
 * Same-origin gate for `POST /oauth2/consent`. Prefers the `Sec-Fetch-Site`
 * signal every modern browser sends on same-origin fetches/form posts; falls
 * back to comparing `Origin` against the request's own URL when
 * `Sec-Fetch-Site` is absent (older browsers, some HTTP clients).
 *
 * Direct server-side `auth.api.oAuthConsent(...)` calls (no `Request`
 * object — e.g. from a script or a future admin tool) are trusted, since
 * they never originate from an untrusted browser context in the first
 * place.
 */
function isSameOriginRequest(ctx: RequestLikeContext): boolean {
  const request = ctx.request;
  if (!request) {
    return true;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "none") {
    return true;
  }
  if (secFetchSite) {
    // An explicit "cross-site" / "same-site" (subdomain) value — reject;
    // this endpoint's own consent page is always same-origin.
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function readBodyConsentCode(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    "consent_code" in body &&
    typeof (body as Record<string, unknown>).consent_code === "string"
  ) {
    return (body as Record<string, string>).consent_code;
  }
  return null;
}

/**
 * Hardens the shared `POST /oauth2/consent` endpoint (reused verbatim by
 * `mcp()` from `oidc-provider`'s `oAuthConsent` — same handler, same
 * `/oauth2/consent` path, regardless of which plugin's request path led
 * here) against three gaps confirmed directly in
 * `better-auth/dist/plugins/oidc-provider/index.mjs`'s handler:
 *
 * 1. It never compares the logged-in session's user id against the
 *    pending verification's `userId` — any authenticated user who obtains
 *    someone else's `consent_code` could Accept/Deny on their behalf.
 * 2. Its own Accept path
 *    (`findVerificationValue -> updateVerificationByIdentifier -> create
 *    oauthConsent`) is not atomic — two concurrent submissions for the
 *    same `consent_code` can both "succeed", but only the last write's
 *    rotated code is actually redeemable, silently breaking the other
 *    request's client.
 * 3. It has no same-origin check of its own; `use: [sessionMiddleware]`
 *    only requires *some* valid session cookie, not that the request came
 *    from this app's own consent page.
 */
export const consentEndpointBeforeHook = {
  matcher: (ctx: { path?: string }): boolean => ctx.path === "/oauth2/consent",
  handler: createAuthMiddleware(async (ctx) => {
    if (!isSameOriginRequest(ctx)) {
      throw oauthError(
        "invalid_request",
        "Consent must be submitted from the same origin.",
      );
    }

    const session = await getSessionFromCtx(ctx);
    if (!session) {
      throw oauthError(
        "invalid_request",
        "A valid session is required to submit consent.",
      );
    }

    const consentCode =
      readBodyConsentCode(ctx.body) ??
      (await ctx.getSignedCookie("oidc_consent_prompt", ctx.context.secret)) ??
      null;
    if (!consentCode) {
      throw oauthError(
        "invalid_request",
        "consent_code is required (either in the request body or the signed cookie).",
      );
    }

    // Session-bound, server-verified read: also confirms the pending
    // request belongs to *this* logged-in user, hasn't expired, still
    // requires a decision, and still names a valid client + the
    // mcp:connect scope — see
    // packages/services/src/mcp-auth's getPendingMcpConsentRequest. Every
    // failure mode there deliberately collapses to the same NOT_FOUND, so
    // this never leaks *why* a code was rejected.
    try {
      await getPendingMcpConsentRequest(consentCode, session.user.id);
    } catch (error) {
      if (error instanceof ServiceError && error.code === "NOT_FOUND") {
        throw oauthError(
          "invalid_request",
          "Invalid or expired consent request.",
        );
      }
      throw toOAuthError(error, "invalid_request");
    }

    // Atomic claim: the first concurrent Accept/Deny submission for this
    // consent_code wins and proceeds to Better Auth's real handler; any
    // other concurrent submission for the same code fails closed here —
    // see packages/services/src/mcp-auth's tryClaimConsentCode doc
    // comment for why the real handler's own Accept path can't be trusted
    // to do this itself.
    const claimed = await tryClaimConsentCode(consentCode);
    if (!claimed) {
      throw oauthError(
        "invalid_request",
        "This consent request is already being processed.",
      );
    }
  }),
};
