import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { GRANTED_MCP_SCOPES } from "@ai-catalyst/services/mcp-auth";

import { consentEndpointBeforeHook } from "./consent-validation";
import { registerEndpointBeforeHook } from "./dcr-validation";
import { oauthError } from "./oauth-errors";
import {
  tokenEndpointAfterHook,
  tokenEndpointBeforeHook,
} from "./token-validation";

// The exact `scope` value every authorization is rewritten to, and therefore
// the exact string stored in `mcp_oauth_access_tokens.scopes`. Shared with
// the service layer (which validates against the same set) rather than
// duplicated, so the two can never drift apart.
const GRANTED_SCOPE_VALUE = GRANTED_MCP_SCOPES.join(" ");
const ALLOWED_REQUEST_SCOPES = new Set(GRANTED_MCP_SCOPES);

function parsePromptValues(raw: unknown): Set<string> {
  const value = typeof raw === "string" ? raw : "";
  return new Set(value.split(" ").filter((entry) => entry.length > 0));
}

/**
 * Hardens `GET /mcp/authorize` in two ways confirmed directly against
 * `better-auth/dist/plugins/oidc-provider/authorize.mjs` (the function
 * `mcp()`'s own `mcpOAuthAuthorize` endpoint and its cookie-replay `after`
 * hook both delegate to, unmodified):
 *
 * 1. **Consent bypass.** `authorize()` only sets `requireConsent = true`
 *    when `!hasAlreadyConsented || promptSet.has("consent")` — a client
 *    that simply never sends `prompt=consent` skips the consent screen
 *    entirely on every subsequent authorization once any `oauthConsent`
 *    row exists for that client+user, no matter what scopes are actually
 *    being requested this time. This forces `prompt=consent` onto every
 *    request Better Auth's `authorize()` ever sees for `/mcp/authorize`,
 *    server-side, regardless of what the client sent — the accept
 *    criterion this closes is "no authorization can be completed without
 *    going through the consent screen for *this* request", not "for this
 *    client, once". `prompt=none` is rejected outright rather than
 *    honored, since honoring it would mean either erroring or (worse)
 *    silently skipping consent when `hasAlreadyConsented` happens to be
 *    true.
 * 2. **Scope creep.** `authorize()`'s own scope check
 *    (`opts.scopes.includes(scope)`) always allows `openid` / `profile` /
 *    `email` / `offline_access` no matter what `oidcConfig.scopes` is
 *    configured to in `apps/web/lib/auth.ts` — those four are
 *    unconditionally prepended by `mcp()` itself before that check ever
 *    runs. This hook independently rejects any requested scope outside the
 *    granted set (so `openid`/`profile`/`email` are still refused), and
 *    force-normalizes the scope to exactly that set rather than falling
 *    through to the plugin's own `defaultScope`.
 *
 * `offline_access` is **granted unconditionally**, whether or not the client
 * asked for it. It is not a permission over the Founder's data — it is the
 * switch that makes the plugin return a `refresh_token` at token time
 * (`plugins/mcp/index.mjs` only includes one when the granted scopes contain
 * it) and accept one back later. Leaving it up to the client would mean any
 * client that omits it silently gets the old behaviour: a connection that
 * dies after an hour and has to be set up again in Claude. RFC 6749 §3.3
 * expressly allows an authorization server to grant a scope the client did
 * not request, and the token response reports the real granted `scope` back,
 * so nothing is hidden from the client.
 */
const authorizeEndpointBeforeHook = {
  matcher: (ctx: { path?: string }): boolean => ctx.path === "/mcp/authorize",
  handler: createAuthMiddleware(async (ctx) => {
    const query = (ctx.query ?? {}) as Record<string, unknown>;

    const promptValues = parsePromptValues(query.prompt);
    if (promptValues.has("none")) {
      throw oauthError(
        "consent_required",
        "MCP authorization requires interactive user consent; prompt=none is not supported.",
      );
    }

    const requestedScopeRaw =
      typeof query.scope === "string" ? query.scope : "";
    const requestedScopes = requestedScopeRaw
      .split(" ")
      .filter((entry) => entry.length > 0);
    const disallowedScopes = requestedScopes.filter(
      (scope) => !ALLOWED_REQUEST_SCOPES.has(scope),
    );
    if (disallowedScopes.length > 0) {
      throw oauthError(
        "invalid_scope",
        `Unsupported scope(s): ${disallowedScopes.join(", ")}. Only "${GRANTED_SCOPE_VALUE}" is supported.`,
      );
    }

    // Best-effort RFC 8707 resource-parameter cross-check. better-auth's
    // legacy mcp()/oidc-provider plugins implement no audience binding at
    // all (no `resource` handling anywhere in either plugin), so this is
    // a single-Authorization-Server/single-MCP-Resource compatibility
    // check, not real RFC 8707 enforcement: it only rejects a `resource`
    // value that is present *and* clearly wrong, and never requires one
    // to be sent (MCP_RESOURCE_URL is apps/mcp's own base URL, set once
    // that app is deployed (MCP_RESOURCE_URL).
    const expectedResource = process.env.MCP_RESOURCE_URL;
    if (
      expectedResource &&
      typeof query.resource === "string" &&
      query.resource !== expectedResource
    ) {
      throw oauthError(
        "invalid_target",
        "The requested resource is not this MCP server.",
      );
    }

    promptValues.add("consent");
    return {
      context: {
        query: {
          ...query,
          prompt: Array.from(promptValues).join(" "),
          scope: GRANTED_SCOPE_VALUE,
        },
      },
    };
  }),
};

/**
 * Every hook this compatibility layer needs, bundled as a single plugin so
 * `apps/web/lib/auth.ts` only has to add one entry to its `plugins` array.
 * Order within `plugins` does not matter for these — Better Auth runs every
 * registered plugin's `hooks.before`/`hooks.after` entries whose `matcher`
 * returns true for the current request, regardless of which plugin
 * ultimately owns the endpoint being called — but this must still be
 * registered *somewhere* in `plugins` for any of it to run at all.
 *
 * See README.md in this directory for the full compatibility profile and
 * the regression suite that must be re-run on any Better Auth version
 * bump.
 */
export const mcpOAuthSecurityPlugin: BetterAuthPlugin = {
  id: "mcp-oauth-security",
  hooks: {
    before: [
      authorizeEndpointBeforeHook,
      tokenEndpointBeforeHook,
      consentEndpointBeforeHook,
      registerEndpointBeforeHook,
    ],
    after: [tokenEndpointAfterHook],
  },
};
