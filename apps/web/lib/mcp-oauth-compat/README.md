# apps/web/lib/mcp-oauth-compat

Compatibility layer between Better Auth 1.6.25's legacy `mcp()` /
`oidc-provider` plugins (registered in [`apps/web/lib/auth.ts`](../auth.ts))
and the OAuth 2.1 profile this project actually needs for MCP: opaque
Bearer tokens, PKCE-only public clients, exactly one resource scope
(`mcp:connect`, always granted together with `offline_access`),
server-enforced consent on every authorization, and short-lived access tokens
kept alive by rotating refresh tokens.

Every file here exists because the plugin's own behavior — read directly out
of the compiled `better-auth@1.6.25` source, not just its public docs — is
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
- **`token-validation.ts`** — the `/mcp/token` before- and after-hooks.
  The before-hook closes a code-exhaustion hole: the real `mcpOAuthToken`
  handler consumes (irreversibly deletes) the authorization code _before_
  validating `grant_type`, `client_id`, `redirect_uri`, or the PKCE
  `code_verifier`. It normalizes the request body
  (`normalizeOAuthTokenBody`, which handles both `FormData` and JSON),
  rejects any grant other than `authorization_code`/`refresh_token`
  outright, and then re-implements every one of those checks read-only
  (`@ai-catalyst/services/mcp-auth`'s `checkAuthorizationCodeIsRedeemable`)
  so a bad request never burns a legitimate code. The `refresh_token` grant
  goes through `checkRefreshTokenIsRedeemable` instead, which adds the check
  the plugin's own refresh branch omits entirely — that the account behind
  the token is still usable (not deleted, not back to `pending`). It then
  takes an exclusive short-lived claim via `tryClaimRefreshToken` (backed by
  `mcp_oauth_refresh_claims`) so a parallel refresh cannot mint a second live
  chain before rotation runs.
  The **after-hook** completes refresh-token rotation: the plugin creates the
  replacement row but never deletes the one the presented refresh token came
  from, so without it every refresh token ever issued would stay redeemable
  for its full 30 days and every refresh would leak a row.
  `rotateOutMcpRefreshToken` deletes every sibling row for that user+client
  except the newly issued one, only once a successful token response has been
  confirmed (`runAfterHooks` fires on the failure path too, with
  `ctx.context.returned` set to an `APIError`). A replayed refresh token then
  finds nothing and is rejected as `invalid_grant` — that missing-row case is
  this profile's refresh-token reuse detection.
  The after-hook also owns the **grant** (`mcp_oauth_grants`, migration
  `0008`): on `authorization_code` it calls `recordMcpGrantIssued`, and on
  `refresh_token` it calls `clampMcpRefreshTokenExpiryToGrant` after
  rotation. Both must stay in the after-hook — the row they key off does not
  exist until the plugin's handler has inserted it, and the returned
  `access_token`/`refresh_token` is the only handle on it.
- **`/oauth/continue`** (`apps/web/app/oauth/continue/route.ts`) — not in
  this directory, but part of the same profile: it is `mcp()`'s `loginPage`.
  When a signed-out client hits `/mcp/authorize`, the plugin redirects there
  with the entire original query string appended
  (`plugins/mcp/authorize.mjs:39-41`), and that string is the only record of
  what the client asked for. The route rebuilds it into a `returnTo` so it
  survives sign-in. It must be a Route Handler, not a page, because it also
  expires the `oidc_login_prompt` cookie — see the replay-hook note under
  "Cross-layer contracts" below.

## Connection lifetime

A grant is not a session, and signing out of the website deliberately does
not end one — that is standard OAuth, and both Claude and ChatGPT expect a
connector to survive a browser sign-out. Sign-out is not offered as a way to
disconnect, either; the routes below are the whole list. What ends a grant:

- **Idle** — `MCP_GRANT_IDLE_TIMEOUT_MS` (14 days with no tool call).
- **Absolute age** — `MCP_GRANT_ABSOLUTE_MAX_AGE_MS` (90 days), regardless
  of use. Re-authorising the same client resets it.
- **Explicit** — the Founder disconnecting on `/connection`, RFC 7009
  `/api/mcp/revoke`, or a password change (the `account.update.after` hook
  in `auth.ts`).
- **Being replaced** — one connection at a time: `recordMcpGrantIssued`
  evicts every other client when a new authorization completes.

Both time limits are enforced **only** in `checkRefreshTokenIsRedeemable`,
i.e. at read time on a refresh the client already makes hourly. There is no
scheduler in this repo and these do not need one; `oauth:cleanup` only bounds
table growth. `verifyMcpBearerToken` deliberately does not re-check them —
see its doc comment for why.

`refreshTokenExpiresIn` in `auth.ts` is **not** the connection lifetime. It
slides on every rotation, so on its own it never expires.

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
["authorization_code"]` (optionally plus `"refresh_token"`, which is a grant
  this server really implements — but never on its own, since a refresh token
  can only come from a completed authorization),
  `response_types: ["code"]`, a required `client_name`,
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
  `mcpOAuthSecurityPlugin`, which bundles every hook above into the single
  `BetterAuthPlugin` that `auth.ts` registers. Closes two gaps in the real
  `authorizeMCPOAuth`/`authorize()` handlers: a client that omits
  `prompt=consent` skips the consent screen entirely once any prior consent
  row exists (this hook force-adds `consent` to `prompt` and rejects
  `prompt=none` outright), and the handler's own scope check always allows
  `openid`/`profile`/`email`/`offline_access` regardless of
  `oidcConfig.scopes` (this hook independently rejects `openid`/`profile`/
  `email`). It then force-normalizes the scope to exactly
  `mcp:connect offline_access` — `GRANTED_MCP_SCOPES` in
  `@ai-catalyst/services/mcp-auth`, shared with the service layer so the two
  cannot drift.

  `offline_access` is granted **whether or not the client requested it**.
  It is not a permission over the Founder's data; it is what makes the plugin
  return a `refresh_token` and accept one back later, and a client that
  omitted it would silently get a connection that dies after an hour. RFC
  6749 §3.3 allows granting a scope the client did not ask for, and the token
  response reports the granted `scope` honestly.

  Also does a best-effort, non-normative RFC 8707 `resource`-parameter
  cross-check — real audience binding isn't implemented by either underlying
  plugin at all.

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
- **The `oidc_login_prompt` replay hook.** `plugins/mcp/index.mjs:150-183`
  registers an after-hook with `matcher() { return true }`: on any auth
  response that sets a session cookie, if that signed cookie is present it
  re-runs `authorizeMCPOAuth` directly — **bypassing the `/mcp/authorize`
  before-hook in `hooks.ts`**, so every hardening rule there is skipped on
  that path. `/oauth/continue` expires the cookie so this never fires and the
  resume is ours, via a real request to `/api/auth/mcp/authorize` that does
  run the before-hook. Two consequences to keep in mind: any check added to
  that before-hook is only reliable because the replay is disabled, and if
  `/oauth/continue` ever mis-builds its `returnTo` there is no longer a
  fallback (hence `tests/oauth-continue.route.test.ts`).
  Note also that the cookie is written _before_ `authorizeMCPOAuth` validates
  anything, so leaving it live means a junk authorize URL visited while
  signed out breaks the user's _next_ sign-in.
- **`context.path` in the `account.update.after` hook** (`auth.ts`) is how
  a password change is distinguished from any other account write, and it is
  the most version-coupled thing in this profile. The hook logs and swallows
  its own failures, so if a version bump changes that path the symptom is a
  password change that quietly stops revoking MCP grants rather than an
  error. Re-verify it on every bump, and see `password-section.tsx` for the
  client-side belt-and-braces call.
- **`ActorContext.provider`** is derived from the OAuth client's registered
  redirect host (`mcpProviderForRedirectUris`), never from `client_name` —
  DCR is unauthenticated, so the name is free text. It feeds
  `mcp_tool_audit_logs.provider` and must never become an authorization
  input, or the DCR body would turn into a privilege boundary.
- `mcp_oauth_consent_claims` is not a Better Auth table; it exists solely to
  close the Accept-path concurrency gap described above and is swept by the
  `oauth:cleanup` CLI, not released early on a failed/rejected claim.
- `mcp_oauth_refresh_claims` (`0007_mcp_oauth_refresh_claims.sql`) is the
  same pattern for refresh-token redemption: the before-hook claims before
  Better Auth mints, so a parallel refresh cannot create two live chains.
- Granting `offline_access` is what makes the refresh grant work at all —
  Better Auth's refresh branch reads `mcp_oauth_access_tokens.scopes` and
  refuses any token whose scopes lack it. Narrowing `hooks.ts` back to
  `mcp:connect` alone would not produce an error anywhere; it would quietly
  restore the one-hour connection that forced Founders to reconnect.
- `cleanupExpiredMcpOAuthState` must keep requiring **both**
  `access_token_expires_at` and `refresh_token_expires_at` to be in the past.
  Sweeping on the access token alone deletes live connections an hour after
  they are made.
- `infra/database/migrations/0004_mcp_oauth_provider_schema.sql`'s inline
  comments still describe the old "V1 never hands out a redeemable refresh
  token" behaviour. They are **wrong and cannot be corrected in place** —
  `packages/db/src/migrate.ts` checksums applied migrations, so editing that
  file would break `db:migrate` for every existing database. This document
  and `infra/database/better-auth-schema-compatibility.md` are the current
  source of truth for that table.

## Re-verifying after a Better Auth version bump

Everything above was confirmed by reading the compiled
`better-auth@1.6.25` source directly (`plugins/mcp/*.mjs`,
`plugins/oidc-provider/*.mjs`), not from documentation. Any version bump of
`better-auth` must re-read those files for the specific behaviors cited
above (schema merging in `getAuthTables()`, the exact order of operations in
`mcpOAuthToken`/`authorizeMCPOAuth`/`oAuthConsent`/`registerMcpClient`, the
`refresh_token` branch's `offline_access` check and its failure to delete the
row it rotates out of, `runAfterHooks`' behavior on the error path, the
`loginPage` redirect in `authorize.mjs` (does it still forward the whole
query string?), the `oidc_login_prompt` replay hook and cookie name, and
`databaseHooks.account.update.after`'s `context.path` values)
before assuming this compatibility layer still applies unchanged, then
re-run:

- `pnpm --filter web run auth:check` (schema still matches the database)
- `pnpm test:db` (includes
  `apps/web/tests/mcp-oauth.http.db.test.ts`, which exercises the full DCR ->
  authorize -> consent -> token flow through the real HTTP route handler,
  plus every hook's negative-path behavior, against a real database)
- `pnpm test:db packages/services/src/mcp-auth/index.db.test.ts`
  (unit-level coverage of every branch in
  `checkAuthorizationCodeIsRedeemable`/`getPendingMcpConsentRequest`, plus
  the grant lifetime rules and the one-connection-at-a-time eviction)

Two of these cannot be caught by any of the above, because they only fail
across a real cross-origin redirect — walk them by hand after a bump:

1. Connect from ChatGPT in a **fresh private window** (no session cookie).
   It must land on sign-in, continue to consent by itself, and return to
   ChatGPT connected. This is the path `/oauth/continue` exists for.
2. Connect Claude while ChatGPT is connected. The consent screen must warn
   that ChatGPT will be disconnected, and afterwards ChatGPT's connector must
   actually fail.
