# apps/web/lib/mcp-oauth-compat

Compatibility layer between Better Auth 1.6.23's legacy `mcp()` /
`oidc-provider` plugins (registered in [`apps/web/lib/auth.ts`](../auth.ts))
and the OAuth 2.1 profile this project actually needs for MCP: opaque
Bearer tokens, PKCE-only public clients, exactly one scope (`mcp:connect`),
server-enforced consent on every authorization, and no refresh tokens.

Every file here exists because the plugin's own behavior — read directly out
of the compiled `better-auth@1.6.23` source, not just its public docs — is
either more permissive or has a real correctness/security gap relative to
that profile. None of it patches Better Auth itself; all of it is wired in
as ordinary `before` hooks (`createAuthMiddleware`) attached to the plugin's
own endpoints, or as a second, schema-only plugin object.

## Files

- **`schema-override.ts`** — a synthetic, schema-only `BetterAuthPlugin`
  that renames the `mcp()` plugin's three tables/fields to this project's
  `mcp_oauth_*` snake_case convention (see
  [`infra/database/migrations/0004_mcp_oauth_provider_schema.sql`](../../../../infra/database/migrations/0004_mcp_oauth_provider_schema.sql)
  and
  [`infra/database/better-auth-schema-compatibility.md`](../../../../infra/database/better-auth-schema-compatibility.md)
  for the full "why this even works" explanation). Must be registered in
  `auth.ts`'s `plugins` array _after_ `mcp()`.
- **`oauth-errors.ts`** — `oauthError`/`toOAuthError`: every hook below
  throws a real OAuth-spec `error`/`error_description` `APIError` through
  these, never a bare 500, and never a `ServiceError` leaking past the HTTP
  boundary.
- **`token-validation.ts`** — the `/mcp/token` before-hook. Closes a
  code-exhaustion hole: the real `mcpOAuthToken` handler consumes
  (irreversibly deletes) the authorization code _before_ validating
  `grant_type`, `client_id`, `redirect_uri`, or the PKCE `code_verifier`.
  This hook normalizes the request body (`normalizeOAuthTokenBody`, which
  handles both `FormData` and JSON), rejects anything but
  `grant_type=authorization_code` outright, and then re-implements every one
  of those checks read-only
  (`@ai-catalyst/services/mcp-auth`'s `checkAuthorizationCodeIsRedeemable`)
  so a bad request never burns a legitimate code.
- **`consent-validation.ts`** — the `/oauth2/consent` before-hook. The real
  `oAuthConsent` handler never compares the logged-in session's user against
  the consent code's owner, and its Accept path
  (`findVerificationValue -> updateVerificationByIdentifier -> create
oauthConsent`) is not atomic. This hook enforces same-origin submission,
  confirms the code is still pending _for this exact user_
  (`getPendingMcpConsentRequest`), and atomically claims the code
  (`tryClaimConsentCode`, backed by `mcp_oauth_consent_claims`'s unique
  constraint) before letting the request continue — a second concurrent
  submission for the same code always fails closed.
- **`dcr-validation.ts`** — the `/mcp/register` before-hook. The real
  `registerMcpClient` handler defaults to registering a _confidential_
  client (`token_endpoint_auth_method` defaults to `"client_secret_basic"`)
  and accepts grant/response types this profile's token endpoint never
  implements. This hook forces every registered client down to
  `token_endpoint_auth_method: "none"` (public), `grant_types:
["authorization_code"]` (optionally plus `"refresh_token"` so Claude's
  DCR payload is accepted — refresh grants are still rejected at
  `/mcp/token`), `response_types: ["code"]`, a required `client_name`,
  hardened `redirect_uris` (https, or http loopback for local testing; no
  fragment/query/userinfo — see the file's own comment for why query
  strings specifically must be banned), and a coarse development-only
  in-memory rate limit.
- **`discovery.ts`** — `buildAuthorizationServerMetadata`, consumed by
  [`apps/web/app/.well-known/oauth-authorization-server/route.ts`](../../app/.well-known/oauth-authorization-server/route.ts).
  Hand-written for a different reason than apps/mcp's protected-resource
  metadata: the `mcp()` plugin's own equivalent endpoint is real and mostly
  accurate, but Better Auth registers it as a relative endpoint under its
  own `/api/auth` base path, so it's actually served at
  `{issuer}/api/auth/.well-known/oauth-authorization-server` — not the true
  root RFC 8414 requires whenever the issuer URL has no path component
  (ours never does). No client that only knows the issuer URL could ever
  find that copy. This one is served from this Next.js app's own true root
  instead, and narrows `scopes_supported`/`grant_types_supported`/
  `token_endpoint_auth_methods_supported` to exactly what this profile's
  hardening hooks allow through.
- **`hooks.ts`** — the `/mcp/authorize` before-hook, plus
  `mcpOAuthSecurityPlugin`, which bundles all four before-hooks above into
  the single `BetterAuthPlugin` that `auth.ts` registers. Closes two gaps in
  the real `authorizeMCPOAuth`/`authorize()` handlers: a client that omits
  `prompt=consent` skips the consent screen entirely once any prior consent
  row exists (this hook force-adds `consent` to `prompt` and rejects
  `prompt=none` outright), and the handler's own scope check always allows
  `openid`/`profile`/`email`/`offline_access` regardless of
  `oidcConfig.scopes` (this hook independently rejects every scope but
  `mcp:connect`). Also does a best-effort, non-normative RFC 8707
  `resource`-parameter cross-check — real audience binding isn't implemented
  by either underlying plugin at all.

## Cross-layer contracts that must not silently change

- `verification.storeIdentifier` in `auth.ts` is pinned to `"plain"`. The
  business-logic layer
  (`packages/services/src/mcp-auth/index.ts`'s
  `findVerificationByIdentifier`) reads `verifications.identifier` directly
  via `packages/db`, bypassing Better Auth's storage adapter — it only sees
  the real, unhashed consent/authorization code back out of that column if
  this stays `"plain"`. If a future Better Auth version changes the default
  or this setting is ever removed, every lookup in that file silently starts
  missing every real code (not erroring loudly) until the service layer's
  identifier processing is updated to match.
- No `authentication_scheme` column exists in `mcp_oauth_applications` on
  purpose — see the migration file's own comment and
  `verifyMcpBearerToken`'s public-client check
  (`type = 'public' && client_secret is null/empty`) for why.
- `mcp_oauth_consent_claims` is not a Better Auth table; it exists solely to
  close the Accept-path concurrency gap described above and is swept by the
  `oauth:cleanup` CLI, not released early on a failed/rejected claim.

## Re-verifying after a Better Auth version bump

Everything above was confirmed by reading the compiled
`better-auth@1.6.23` source directly (`plugins/mcp/*.mjs`,
`plugins/oidc-provider/*.mjs`), not from documentation. Any version bump of
`better-auth` must re-read those files for the specific behaviors cited
above (schema merging in `getAuthTables()`, the exact order of operations in
`mcpOAuthToken`/`authorizeMCPOAuth`/`oAuthConsent`/`registerMcpClient`)
before assuming this compatibility layer still applies unchanged, then
re-run:

- `pnpm --filter web run auth:check` (schema still matches the database)
- `pnpm --filter web test` (includes
  `apps/web/tests/mcp-oauth.http.test.ts`, which exercises the full DCR ->
  authorize -> consent -> token flow through the real HTTP route handler,
  plus every hook's negative-path behavior, against a real database)
- `pnpm --filter @ai-catalyst/services test:db -- src/mcp-auth/index.db.test.ts`
  (unit-level coverage of every branch in
  `checkAuthorizationCodeIsRedeemable`/`getPendingMcpConsentRequest`)
