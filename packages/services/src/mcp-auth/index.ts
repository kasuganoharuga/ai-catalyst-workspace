import { createHash } from "node:crypto";

import { z } from "zod";

import { pool } from "@ai-catalyst/db";
import type {
  ActorContext,
  ActorRole,
  McpProvider,
} from "@ai-catalyst/contracts/actor-context";
import { createMcpActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { upsertPreferredAiProvider } from "@ai-catalyst/services/profile/internal/preferred-ai-provider";

const MCP_CONNECT_SCOPE = "mcp:connect";

// Requested and granted alongside mcp:connect on every authorization — it is
// what makes Better Auth's `mcp()` plugin both return a `refresh_token` at
// token time and accept one back later (its refresh branch checks
// `token.scopes` for this exact string). Without it the connection dies with
// the one-hour access token and the Founder has to reconnect in Claude.
const MCP_OFFLINE_ACCESS_SCOPE = "offline_access";

/**
 * The exact scope set every MCP authorization is normalized to, in the order
 * it is stored in `mcp_oauth_access_tokens.scopes` and echoed back in the
 * token response's `scope`. `apps/web/lib/mcp-oauth-compat/hooks.ts` forces
 * `/mcp/authorize` to this set regardless of what the client asked for, so
 * every consumer here can treat it as the only legitimate shape.
 */
export const GRANTED_MCP_SCOPES: readonly string[] = [
  MCP_CONNECT_SCOPE,
  MCP_OFFLINE_ACCESS_SCOPE,
];

// ---------------------------------------------------------------------------
// Connection lifetime.
//
// Until these existed a grant never ended. `refreshTokenExpiresIn` is 30 days
// but *sliding* — every rotation mints a fresh 30-day window — and both Claude
// and ChatGPT refresh in the background roughly hourly, so an abandoned
// connection stayed live indefinitely and the only way one ever ended was a
// Founder explicitly disconnecting.
//
// Both are enforced in checkRefreshTokenIsRedeemable, i.e. read-time on a
// request the client already makes every hour. There is no scheduler in this
// repo and these deliberately do not need one.
// ---------------------------------------------------------------------------

/**
 * No tool call in this long ends the connection.
 *
 * Measured from `granted_at`, not from the token row, so switching AI clients
 * genuinely restarts it. Two weeks is chosen to sit well clear of a Founder
 * taking a normal holiday mid-programme: the cost of being wrong is a
 * reconnect, but a reconnect at the wrong moment reads as the product being
 * broken.
 */
export const MCP_GRANT_IDLE_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Total age at which a grant ends regardless of how actively it is used.
 *
 * This is the one that also catches a *stolen* refresh token being kept warm
 * by regular use, which the idle rule alone cannot. It costs an active
 * Founder one reconnect a quarter, which is why the connection page names it
 * explicitly — an unexplained disconnect at 90 days would be reported as a bug.
 */
export const MCP_GRANT_ABSOLUTE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Provider identification.
//
// Matched on the client's registered redirect host, never on `client_name`:
// Dynamic Client Registration is unauthenticated (RFC 7591), so the name is
// free text any caller can set to "claudeai", while the redirect host is
// where authorization codes are actually delivered and is checked against
// the registration on every authorize.
//
// This is audit metadata only. Nothing in this file grants or denies access
// based on it, and it must stay that way — otherwise the DCR body would
// become a privilege boundary.
// ---------------------------------------------------------------------------

const PROVIDER_HOST_SUFFIXES: ReadonlyArray<
  readonly [McpProvider, readonly string[]]
> = [
  ["claude", ["claude.ai", "claude.com", "anthropic.com"]],
  ["openai", ["chatgpt.com", "openai.com"]],
];

function providerForHost(host: string): McpProvider | null {
  const normalized = host.toLowerCase();
  for (const [provider, suffixes] of PROVIDER_HOST_SUFFIXES) {
    for (const suffix of suffixes) {
      // Suffix match on a dot boundary so "notclaude.ai" cannot pass as
      // "claude.ai" — the whole point of preferring the host over the name
      // is that the host is the harder thing to spoof.
      if (normalized === suffix || normalized.endsWith(`.${suffix}`)) {
        return provider;
      }
    }
  }
  return null;
}

/**
 * Best-effort identification of which AI client a registered OAuth client is.
 *
 * Returns "other" for anything unrecognised, including a client that
 * registered several redirect URIs pointing at different vendors — an
 * ambiguous registration is not evidence for either one.
 */
export function mcpProviderForRedirectUris(
  redirectUris: readonly string[],
): McpProvider {
  const matched = new Set<McpProvider>();

  for (const uri of redirectUris) {
    let host: string;
    try {
      host = new URL(uri).hostname;
    } catch {
      continue;
    }
    const provider = providerForHost(host);
    if (provider) {
      matched.add(provider);
    }
  }

  return matched.size === 1 ? [...matched][0]! : "other";
}

/**
 * Splits the comma-joined `mcp_oauth_applications.redirect_urls` column.
 * Better Auth stores the list that way rather than as an array.
 */
function parseRedirectUrls(value: string | null | undefined): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((uri) => uri.trim())
    .filter((uri) => uri.length > 0);
}

function isExactlyGrantedScopeSet(scopes: readonly string[]): boolean {
  const unique = new Set(scopes);
  return (
    unique.size === scopes.length &&
    unique.size === GRANTED_MCP_SCOPES.length &&
    GRANTED_MCP_SCOPES.every((scope) => unique.has(scope))
  );
}

// ---------------------------------------------------------------------------
// Schemas/patterns — deliberately inlined here rather than in a sibling
// ./schemas.ts file: apps/web's Next.js build (Turbopack, bundling this
// workspace package's raw TypeScript source directly via
// `transpilePackages`, not pre-compiled .js) cannot resolve a relative
// import like `from "./schemas.js"` to a same-directory `schemas.ts` — a
// confirmed, currently-unfixed Turbopack gap (webpack's
// `resolve.extensionAlias` has no Turbopack equivalent in the Next version
// this repo is pinned to; see
// https://github.com/vercel/next.js/issues/82945). The `.js` extension
// itself is required by this package's own `moduleResolution: "NodeNext"`
// (packages/services/tsconfig.json) for `tsx`/`vitest` to resolve it at
// all — so the only fix available without bumping Next is to avoid the
// cross-file relative import entirely within this module.
// ---------------------------------------------------------------------------

// The exact shape Better Auth's legacy `mcp()` plugin JSON-serializes into
// `verifications.value` (`plugins/mcp/authorize.mjs`'s `createVerificationValue`
// call, confirmed against the compiled 1.6.23 source) for both the
// pre-consent code (`requireConsent: true`) and the post-Accept, rotated
// code (`requireConsent: false`, written by `oAuthConsent`'s
// `updateVerificationByIdentifier`, `plugins/oidc-provider/index.mjs`).
//
// Deliberately ONE shared schema, not two: it is consumed by both
// `getPendingMcpConsentRequest` below (which requires `requireConsent ===
// true` — a request that has already been accepted is not a valid *pending*
// one) and apps/web/lib/mcp-oauth-compat/token-validation.ts's `/mcp/token`
// before-hook (which *rejects* on `requireConsent === true` — a token must
// never be issued for a code the user hasn't accepted yet). A schema with
// `requireConsent: z.literal(true)` would fail to parse every legitimate
// post-accept code and break normal token exchanges; `z.boolean()` accepts
// both states and leaves the business-rule direction to each caller.
//
// `.passthrough()` so an unrecognized extra key (e.g. a future Better Auth
// minor version adding a field) never turns a real code into a parse
// failure.
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

// `generateRandomString(32, "a-z", "A-Z")` (accessToken/refreshToken in
// `plugins/mcp/index.mjs`) — letters only, no digits. Anchoring this at the
// Resource Server's verification boundary rejects an obviously-malformed
// token before it ever reaches a database query.
//
// Refresh tokens come out of the same generator with the alphabets in the
// opposite argument order (`"A-Z", "a-z"` in the authorization_code branch),
// which produces the identical character set — hence one pattern for both.
const MCP_BEARER_TOKEN_PATTERN = /^[A-Za-z]{32}$/;

// `generateRandomString(32, "a-z", "A-Z", "0-9")` (the authorization code in
// `plugins/mcp/authorize.mjs` and `oAuthConsent`'s rotated code) — alphanumeric.
const MCP_CONSENT_CODE_PATTERN = /^[A-Za-z0-9]{32}$/;

function isKnownActorRole(value: unknown): value is ActorRole {
  return (
    value === "pending" ||
    value === "founder" ||
    value === "mentor" ||
    value === "admin"
  );
}

// MCP is an allowlist of one role, not a denylist of `pending`.
//
// Every tool apps/mcp exposes is a Founder tool: each one funnels into a
// service that opens with `assertRole(actor, ["founder"])` (getActiveContext,
// listModuleContextsForActiveRun, getModuleContext, and everything reached
// through resolveFounderWorkspace). So the transport is the only place where
// "which roles may speak MCP at all" is expressible, and stating it here
// means a Mentor is turned away once at the boundary instead of collecting a
// FORBIDDEN from every individual tool call.
//
// The denylist shape was safe only by coincidence — it held because all of
// today's tools happen to be Founder-scoped. A future tool that forgot its
// own assertRole would have been silently reachable by any Mentor or Admin
// holding a token. Neither role has a reason to hold one: Mentors supervise
// through apps/web, and Admins do no project work at all.
function canUseMcp(role: ActorRole): boolean {
  return role === "founder";
}

// ---------------------------------------------------------------------------
// verifyMcpBearerToken — apps/mcp's Resource Server verification path.
// ---------------------------------------------------------------------------

interface AccessTokenLookupRow {
  access_token_expires_at: Date;
  scopes: string;
  client_id: string;
  client_disabled: boolean;
  client_type: string;
  client_secret: string | null;
  client_redirect_urls: string | null;
  user_id: string | null;
  user_role: string | null;
  user_deleted_at: Date | null;
}

// A public client (V1 forces every DCR-registered client to be public —
// apps/web/lib/mcp-oauth-compat/dcr-validation.ts) must have a null/empty
// `client_secret`. There is deliberately no `authentication_scheme` column
// to check — see infra/database/better-auth-schema-compatibility.md.
function isValidPublicClient(row: AccessTokenLookupRow): boolean {
  return (
    !row.client_disabled &&
    row.client_type === "public" &&
    (row.client_secret === null || row.client_secret === "")
  );
}

/**
 * Verifies a raw MCP platform Bearer token against `mcp_oauth_access_tokens`
 * and returns the `ActorContext` apps/mcp's tool handlers pass into every
 * packages/services call. Called from apps/mcp/src/auth/verify-bearer.ts —
 * never from apps/web (MCP verifies platform tokens; web issues them).
 *
 * Throws `ServiceError("UNAUTHENTICATED", ...)` when the token itself no
 * longer identifies a usable subject (missing/expired/malformed token,
 * disabled or non-public OAuth client, deleted/missing user) — the caller
 * maps this to HTTP 401 with a `WWW-Authenticate` challenge. Throws
 * `ServiceError("FORBIDDEN", ...)` when the subject is valid but not
 * authorized for MCP (a non-Founder account — see `canUseMcp` — or a token
 * missing the `mcp:connect` scope) — mapped to HTTP 403, with an
 * `insufficient_scope` challenge for the latter case.
 *
 * **Deliberately does not check connection lifetime.** The idle and absolute
 * limits live in `checkRefreshTokenIsRedeemable` alone. Retiring a grant
 * deletes its token rows outright, so the exposure after a limit trips is
 * bounded by the client's next refresh — under an hour for both Claude and
 * ChatGPT, the same bound the 3600s access token already imposes. Adding a
 * grants join and an audit-log aggregate to the hottest query in the system
 * would buy nothing for that. This omission is a decision, not an oversight.
 */
export async function verifyMcpBearerToken(
  rawToken: unknown,
): Promise<ActorContext> {
  if (
    typeof rawToken !== "string" ||
    !MCP_BEARER_TOKEN_PATTERN.test(rawToken)
  ) {
    throw new ServiceError("UNAUTHENTICATED", "Invalid bearer token.");
  }

  const result = await pool.query<AccessTokenLookupRow>(
    `select
       t.access_token_expires_at,
       t.scopes,
       t.client_id,
       app.disabled as client_disabled,
       app.type as client_type,
       app.client_secret,
       app.redirect_urls as client_redirect_urls,
       u.id as user_id,
       u.role as user_role,
       u.deleted_at as user_deleted_at
     from mcp_oauth_access_tokens t
     join mcp_oauth_applications app on app.client_id = t.client_id
     left join users u on u.id = t.user_id
     where t.access_token = $1`,
    [rawToken],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("UNAUTHENTICATED", "Invalid bearer token.");
  }

  if (row.access_token_expires_at.getTime() <= Date.now()) {
    throw new ServiceError("UNAUTHENTICATED", "Bearer token has expired.");
  }

  if (!isValidPublicClient(row)) {
    throw new ServiceError(
      "UNAUTHENTICATED",
      "The OAuth client for this token is no longer valid.",
    );
  }

  if (
    !row.user_id ||
    row.user_deleted_at !== null ||
    !isKnownActorRole(row.user_role)
  ) {
    throw new ServiceError(
      "UNAUTHENTICATED",
      "The account for this token no longer exists.",
    );
  }

  if (row.user_role === "pending") {
    throw new ServiceError(
      "FORBIDDEN",
      "This account has not completed invitation acceptance yet.",
    );
  }

  // Kept separate from the `pending` branch above so each role hears the
  // truth: a pending user is mid-onboarding and will become eligible, while
  // a Mentor or Admin never will.
  if (!canUseMcp(row.user_role)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Connecting an AI assistant is available to Founder accounts only.",
    );
  }

  const scopes = row.scopes.split(" ").filter((scope) => scope.length > 0);
  if (!scopes.includes(MCP_CONNECT_SCOPE)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Token is missing the mcp:connect scope.",
    );
  }

  return createMcpActorContext({
    userId: row.user_id,
    role: row.user_role,
    scopes,
    clientId: row.client_id,
    // Read off the row already fetched above — no extra query on what is
    // the hottest path in the system. Audit metadata only; every
    // authorization decision above this line has already been made.
    provider: mcpProviderForRedirectUris(
      parseRedirectUrls(row.client_redirect_urls),
    ),
  });
}

// ---------------------------------------------------------------------------
// getPendingMcpConsentRequest — read used by both the GET /oauth/consent
// page render and, more importantly, the shared `/oauth2/consent`
// before-hook (apps/web/lib/mcp-oauth-compat/consent-validation.ts) that
// protects Better Auth's raw plugin endpoint itself.
// ---------------------------------------------------------------------------

export interface PendingMcpConsentRequest {
  consentCode: string;
  clientId: string;
  clientName: string;
  // Destination host only (e.g. "claude.ai"), never the full redirect
  // URI — MCP consent-screen guidance is to avoid ever displaying a full
  // URL a user could be tricked into misreading.
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

// Cross-layer contract: this queries `verifications.identifier` directly via
// packages/db, bypassing Better Auth's own storage-adapter entirely — which
// only returns the *plain* consent code back out of this query if
// apps/web/lib/auth.ts's `verification.storeIdentifier` is explicitly
// pinned to `"plain"` (see that file's own comment, and
// apps/web/lib/mcp-oauth-compat/README.md). If that setting is ever
// changed, every lookup below silently starts missing every real code.
async function findVerificationByIdentifier(
  consentCode: string,
): Promise<VerificationRow | undefined> {
  const result = await pool.query<VerificationRow>(
    `select identifier, value, expires_at from verifications where identifier = $1`,
    [consentCode],
  );
  return result.rows[0];
}

// All failure modes below return the same NOT_FOUND — never distinguish
// "code missing" from "wrong user" or "already accepted" (enumeration oracle).
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

  // A `false` value here means this code has already been Accepted (its
  // identifier was rotated by oAuthConsent) or never required consent in
  // the first place — either way, not a valid *pending* request to render
  // or act on. This is the opposite direction from the /mcp/token
  // before-hook, which rejects when this is `true`.
  if (!value.requireConsent) {
    throw pendingConsentNotFound();
  }

  // Must be exactly the granted set — not "contains mcp:connect". The
  // /mcp/authorize before-hook rewrites every request's scope to
  // GRANTED_MCP_SCOPES before Better Auth writes this verification row, so
  // anything else means the row did not come through that hook and must not
  // be rendered as a consent request. Order-insensitive: the check is about
  // which scopes are being granted, not how the plugin happened to serialize
  // them.
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

// ---------------------------------------------------------------------------
// checkAuthorizationCodeIsRedeemable — read-only pre-flight for the
// /mcp/token before-hook (apps/web/lib/mcp-oauth-compat/token-validation.ts).
// ---------------------------------------------------------------------------

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

function rejectCode(
  error: AuthorizationCodeRejectionReason,
  description: string,
): AuthorizationCodeCheckFailure {
  return { ok: false, error, description };
}

/**
 * Read-only pre-flight check for `POST /mcp/token`'s `authorization_code`
 * grant, run by the `/mcp/token` before-hook *before* Better Auth's real
 * handler (`better-auth/dist/plugins/mcp/index.mjs`'s `mcpOAuthToken`) ever
 * runs.
 *
 * This exists solely to close a code-exhaustion hole confirmed in that
 * handler: it calls `internalAdapter.consumeVerificationValue(code)` —
 * irreversibly deleting the authorization code — *before* validating
 * `grant_type`, `client_id`, `redirect_uri`, or the PKCE `code_verifier`
 * (in that literal source order: code existence -> requirePKCE-implies-
 * code_verifier-present -> consume -> client_id -> grant_type ->
 * redirect_uri -> client lookup -> PKCE hash comparison). A malformed or
 * malicious request with a valid `code` but a wrong grant_type, client,
 * redirect_uri, or code_verifier would otherwise permanently burn a
 * legitimate code before failing. This function re-implements every one of
 * those checks against a read-only peek at the verification row (never
 * calling the destructive `consumeVerificationValue` equivalent itself), so
 * a request that fails here never reaches — and never consumes the code
 * via — the real handler. Every request that passes here still gets fully
 * re-validated (and the code actually consumed) by Better Auth's own
 * handler afterward; this function's only job is to reject bad requests
 * *before* that point.
 *
 * Callers must have already dispatched on `grant_type` themselves before
 * calling this: `refresh_token` goes to `checkRefreshTokenIsRedeemable`
 * below, and anything else is rejected with `unsupported_grant_type`.
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

  // Opposite direction from getPendingMcpConsentRequest: this code is only
  // redeemable once Accept has rotated it to a fresh, requireConsent: false
  // code — a still-`true` value means the user hasn't consented yet, and
  // this must not be treated as a redeemable authorization_code.
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

  // V1 forces every registered client to be public
  // (apps/web/lib/mcp-oauth-compat/dcr-validation.ts) — there is no
  // confidential-client client_secret path in this compatibility profile,
  // so every real request must present a PKCE code_verifier.
  if (typeof codeVerifier !== "string" || codeVerifier.length === 0) {
    return rejectCode(
      "invalid_request",
      "code_verifier is required for public clients.",
    );
  }

  // requirePKCE: true (apps/web/lib/auth.ts) already guarantees /mcp/authorize
  // never issues a code without a challenge — a missing challenge here means
  // a corrupted or foreign verification row, not a normal client error.
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

// ---------------------------------------------------------------------------
// checkRefreshTokenIsRedeemable — read-only pre-flight for the /mcp/token
// before-hook's `refresh_token` grant.
// ---------------------------------------------------------------------------

interface RefreshTokenLookupRow {
  refresh_token_expires_at: Date;
  scopes: string;
  client_id: string;
  user_id: string | null;
  // The *current* row's creation time — i.e. the last rotation, not when the
  // Founder authorised. Only used as the seed for a missing grant row; every
  // lifetime rule reads mcp_oauth_grants.granted_at instead.
  created_at: Date;
}

/**
 * Read-only pre-flight check for `POST /mcp/token`'s `refresh_token` grant.
 *
 * Unlike the authorization_code case, this exists for two narrower reasons —
 * Better Auth's own refresh branch (`plugins/mcp/index.mjs`, verified against
 * the compiled 1.6.25 source) is non-destructive, so there is no code to burn:
 *
 * 1. **It never re-checks the user.** The branch copies `token.userId` from
 *    the old row straight onto the new one, so a Founder whose account has
 *    since been deleted, or who has been reset to `pending`, would keep
 *    minting fresh hour-long tokens for as long as their refresh token lives.
 *    `verifyMcpBearerToken` would still reject each one at call time, but the
 *    grant itself has no business succeeding — this closes that here, using
 *    the same `getAuthorizableUserById` gate the authorization_code path uses.
 * 2. **Error shape.** The branch throws `APIError`s whose `error` codes are
 *    close to, but not exactly, what this profile returns everywhere else.
 *    Rejecting here keeps `/mcp/token` speaking one consistent OAuth dialect.
 *
 * Missing-row is deliberately `invalid_grant` rather than anything more
 * specific: because rotation deletes the previous row
 * (`rotateOutMcpRefreshToken`), a replayed or stolen refresh token lands in
 * exactly this branch. That makes this check the profile's refresh-token
 * reuse detection, and it must not distinguish "never existed" from "already
 * rotated away" — a client cannot be allowed to probe which is which.
 *
 * **Not purely read-only, despite the name.** It is also where both
 * connection lifetime limits are enforced (MCP_GRANT_IDLE_TIMEOUT_MS and
 * MCP_GRANT_ABSOLUTE_MAX_AGE_MS), and tripping either one writes: the grant
 * is retired before the rejection is returned. That write is the point —
 * without it the Founder's connection page would keep showing a live
 * connection whose every refresh is being refused, and apps/mcp would keep
 * honouring the current access token for up to another hour. It also
 * lazily creates a missing grant row rather than failing closed; see inline.
 */
export async function checkRefreshTokenIsRedeemable(params: {
  refreshToken: unknown;
  clientId: unknown;
}): Promise<AuthorizationCodeCheckResult> {
  const { refreshToken, clientId } = params;

  if (
    typeof refreshToken !== "string" ||
    !MCP_BEARER_TOKEN_PATTERN.test(refreshToken)
  ) {
    return rejectCode("invalid_grant", "Invalid refresh token.");
  }

  if (typeof clientId !== "string" || clientId.length === 0) {
    return rejectCode("invalid_client", "client_id is required.");
  }

  const result = await pool.query<RefreshTokenLookupRow>(
    `select refresh_token_expires_at, scopes, client_id, user_id, created_at
     from mcp_oauth_access_tokens
     where refresh_token = $1`,
    [refreshToken],
  );
  const row = result.rows[0];
  if (!row) {
    return rejectCode("invalid_grant", "Invalid refresh token.");
  }

  if (row.refresh_token_expires_at.getTime() <= Date.now()) {
    return rejectCode("invalid_grant", "Refresh token has expired.");
  }

  // Refresh tokens are bound to the client they were issued to. Better Auth
  // checks this too, but only after its own lookup — doing it here keeps the
  // rejection in this profile's error vocabulary.
  if (row.client_id !== clientId) {
    return rejectCode(
      "invalid_client",
      "client_id does not match the refresh token.",
    );
  }

  const client = await getOAuthClientByClientId(clientId);
  if (!isValidPublicOAuthClientRecord(client)) {
    return rejectCode(
      "invalid_client",
      "Unknown, disabled, or non-public OAuth client.",
    );
  }

  const scopes = row.scopes.split(" ").filter((scope) => scope.length > 0);
  if (!scopes.includes(MCP_OFFLINE_ACCESS_SCOPE)) {
    return rejectCode(
      "invalid_grant",
      "This token was not issued for the offline_access scope.",
    );
  }

  if (!row.user_id || !(await getAuthorizableUserById(row.user_id))) {
    return rejectCode(
      "invalid_grant",
      "The account for this refresh token is no longer usable.",
    );
  }

  // --- Connection lifetime ------------------------------------------------
  // The only place either limit is enforced. Both are checked here rather
  // than in verifyMcpBearerToken by design: see that function's note.
  const limits = await loadGrantLimits(row.user_id, row.client_id);

  if (!limits) {
    // Fail open, and create the missing row. The only way to get here is a
    // token minted between 0008 being applied and this code deploying —
    // rejecting would disconnect real Founders over a deploy-ordering
    // artefact, and a grant seeded from the current row's created_at is at
    // worst generous by one refresh interval.
    await pool.query(
      `insert into mcp_oauth_grants (user_id, client_id, granted_at)
       values ($1, $2, $3)
       on conflict (user_id, client_id) do nothing`,
      [row.user_id, row.client_id, row.created_at],
    );
    return { ok: true };
  }

  const now = Date.now();
  const grantedAt = limits.granted_at.getTime();

  if (now - grantedAt > MCP_GRANT_ABSOLUTE_MAX_AGE_MS) {
    // Retire before rejecting, so the connection page and apps/mcp agree
    // with this answer immediately rather than an hour later when the
    // current access token happens to lapse.
    await retireMcpGrant(row.user_id, row.client_id);
    return rejectCode(
      "invalid_grant",
      "This connection has reached its maximum age and must be re-authorised.",
    );
  }

  // No tool call yet is not idleness — it is a connection that was made and
  // has not been used, which the grant's own age is already measuring.
  const lastActiveAt = limits.last_used_at?.getTime() ?? grantedAt;
  if (now - lastActiveAt > MCP_GRANT_IDLE_TIMEOUT_MS) {
    await retireMcpGrant(row.user_id, row.client_id);
    return rejectCode(
      "invalid_grant",
      "This connection has been idle too long and must be re-authorised.",
    );
  }

  return { ok: true };
}

/**
 * Completes refresh-token rotation after Better Auth has inserted the
 * replacement row. The plugin never removes the presented row itself, so
 * without this every previous refresh token would stay redeemable for its
 * full lifetime and every refresh would leave another row behind.
 *
 * Deletes every token row for the same `user_id` + `client_id` *except* the
 * newly issued one. That removes the presented refresh token and any sibling
 * rows a race might have left behind (the before-hook's
 * `tryClaimRefreshToken` is what stops a parallel redeem from minting in the
 * first place; this family delete is the belt to that claim's braces).
 *
 * Called from the `/mcp/token` after-hook only once a successful token
 * response has been confirmed — never before, or a failed refresh would cost
 * the Founder a working connection.
 *
 * The old row's **access token dies with it**, which is the intended
 * behaviour: rotation is revocation (OAuth 2.1 §4.14). An old access token
 * already in flight when the client refreshes gets a 401; the client simply
 * retries with the token it just received.
 *
 * Returns how many rows were removed — zero is possible (a concurrent revoke
 * or sweep got there first) and is not an error.
 */
export async function rotateOutMcpRefreshToken(params: {
  presentedRefreshToken: string;
  newRefreshToken: string;
}): Promise<number> {
  const { presentedRefreshToken, newRefreshToken } = params;
  if (
    typeof presentedRefreshToken !== "string" ||
    presentedRefreshToken.length === 0 ||
    typeof newRefreshToken !== "string" ||
    newRefreshToken.length === 0
  ) {
    return 0;
  }

  // Prefer family delete keyed off the new row. If that row is somehow
  // missing (should not happen after a successful token response), fall
  // back to deleting just the presented refresh token so rotation still
  // completes for the common path.
  const family = await pool.query(
    `with new_row as (
       select user_id, client_id
       from mcp_oauth_access_tokens
       where refresh_token = $1
     )
     delete from mcp_oauth_access_tokens t
     using new_row n
     where t.user_id is not distinct from n.user_id
       and t.client_id = n.client_id
       and t.refresh_token <> $1`,
    [newRefreshToken],
  );
  if ((family.rowCount ?? 0) > 0) {
    return family.rowCount ?? 0;
  }

  const fallback = await pool.query(
    `delete from mcp_oauth_access_tokens where refresh_token = $1`,
    [presentedRefreshToken],
  );
  return fallback.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Grants — the durable identity of "a connection".
//
// mcp_oauth_access_tokens cannot play this role: rotation replaces the row
// on every refresh, so its `created_at` is the last refresh (minutes ago for
// any active Founder), not when the Founder authorised. mcp_oauth_grants
// carries `granted_at` across rotation, which is what both lifetime rules
// and the connection page's "connected since" actually need.
//
// See infra/database/migrations/0008_mcp_oauth_grants.sql for why this is a
// table rather than a column, and for the alternatives that were rejected.
// ---------------------------------------------------------------------------

/**
 * Records a newly authorised connection, and enforces the one-connection-at-a-
 * time rule by evicting every other client this Founder had.
 *
 * Called from the `/mcp/token` after-hook once an `authorization_code`
 * exchange has demonstrably succeeded — never on the refresh path, which
 * must leave `granted_at` alone or the 90-day cap would reset itself hourly
 * and never fire.
 *
 * The eviction is here, rather than at `/mcp/authorize`, so that a Founder
 * who starts connecting ChatGPT and then abandons the consent screen still
 * has their working Claude connection. Nothing is torn down until the new
 * connection is real.
 *
 * Idempotent and silent when the token is unknown: this runs in an after-hook
 * whose failure must never turn a token response the client already holds
 * into an error.
 */
export async function recordMcpGrantIssued(params: {
  accessToken: string;
}): Promise<void> {
  const { accessToken } = params;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const owner = await client.query<{
      user_id: string;
      client_id: string;
      redirect_urls: string | null;
    }>(
      `select t.user_id, t.client_id, a.redirect_urls
       from mcp_oauth_access_tokens t
       join mcp_oauth_applications a on a.client_id = t.client_id
       where t.access_token = $1
       for update of t`,
      [accessToken],
    );
    const row = owner.rows[0];
    if (!row?.user_id) {
      await client.query("rollback");
      return;
    }

    // One connection at a time. Deleting the token rows is what actually
    // disconnects the previous client — apps/mcp resolves every request
    // against this table, so the eviction takes effect on its very next
    // call rather than whenever its access token happens to expire.
    const evicted = await client.query<{ client_id: string }>(
      `delete from mcp_oauth_access_tokens
       where user_id = $1 and client_id <> $2
       returning client_id`,
      [row.user_id, row.client_id],
    );

    // Same withdrawal record a user-initiated disconnect writes. The
    // Founder did choose this, just indirectly — they authorised a
    // replacement, and the consent screen told them it would happen.
    const evictedClientIds = [
      ...new Set(evicted.rows.map((evictedRow) => evictedRow.client_id)),
    ];
    for (const evictedClientId of evictedClientIds) {
      await client.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, $3, false)`,
        [evictedClientId, row.user_id, GRANTED_MCP_SCOPES.join(" ")],
      );
    }

    await client.query(
      `delete from mcp_oauth_grants where user_id = $1 and client_id <> $2`,
      [row.user_id, row.client_id],
    );

    // Re-authorising the *same* client restarts its clock, which is the
    // intended escape hatch from the 90-day cap: reconnect and you get
    // another 90 days.
    await client.query(
      `insert into mcp_oauth_grants (user_id, client_id, granted_at)
       values ($1, $2, now())
       on conflict (user_id, client_id) do update set granted_at = now()`,
      [row.user_id, row.client_id],
    );

    // The website's stored preference follows what is actually connected.
    //
    // Only one assistant can hold a grant at a time, so the moment this
    // one is issued the other is gone — and a preference still pointing at
    // the evicted product would leave the Founder reading set-up steps and
    // pressing hand-off buttons for something with no access to their
    // workspace. Connecting *is* the choice; the dialog and the profile
    // switcher are just the other ways of making it.
    //
    // Written from the client's registered redirect host rather than the
    // name it gave itself at registration: DCR is unauthenticated, so the
    // name is whatever the client typed. `other` writes nothing — an
    // unrecognised client is not evidence for either product, and a wrong
    // guess here would silently rewrite the Founder's set-up instructions.
    const connectedProvider = mcpProviderForRedirectUris(
      parseRedirectUrls(row.redirect_urls),
    );
    if (connectedProvider !== "other") {
      // The write itself — upsert, skip-if-unchanged — is
      // upsertPreferredAiProvider in profile/internal, the same function
      // setPreferredAiProvider (packages/services/src/profile) calls for a
      // Founder-driven change. Writing SQL here again was how the two
      // paths' semantics drifted apart before (this one skipped the
      // insert on the assumption a row always already exists by the time
      // an authorisation completes — true today, but a second place that
      // invariant had to be remembered). Passing `client` rather than the
      // module-level `pool` is what lets this write commit or roll back
      // together with the grant eviction and re-issue above, instead of
      // running as a second, independent transaction.
      await upsertPreferredAiProvider(client, row.user_id, connectedProvider);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Holds the row's refresh expiry under the grant's absolute cap.
 *
 * Better Auth mints `now() + refreshTokenExpiresIn` on every rotation, so
 * without this the row would keep claiming a further 30 days past the cap.
 * That matters twice over: the connection page reads this column to tell the
 * Founder when they must reconnect by, and having the cap expressed in the
 * data means a refresh cannot outlive it even if the check in
 * checkRefreshTokenIsRedeemable is somehow bypassed.
 *
 * `least` only ever shortens — a grant well inside its cap is untouched.
 */
export async function clampMcpRefreshTokenExpiryToGrant(params: {
  refreshToken: string;
}): Promise<void> {
  const { refreshToken } = params;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return;
  }

  await pool.query(
    `update mcp_oauth_access_tokens t
        set refresh_token_expires_at = least(
              t.refresh_token_expires_at,
              g.granted_at + ($2::bigint * interval '1 millisecond')
            )
       from mcp_oauth_grants g
      where g.user_id = t.user_id
        and g.client_id = t.client_id
        and t.refresh_token = $1`,
    [refreshToken, MCP_GRANT_ABSOLUTE_MAX_AGE_MS],
  );
}

/**
 * Ends a connection that has hit a lifetime limit.
 *
 * Deliberately writes no `mcp_oauth_consents` withdrawal row, unlike
 * `revokeMcpConnectionForUser`: that table records a *decision*, and expiry
 * is not one. Leaving it alone also keeps `hasEverAuthorised` true, so the
 * connection page says "reconnect" rather than walking the Founder through
 * first-time setup they have already done.
 */
async function retireMcpGrant(userId: string, clientId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `delete from mcp_oauth_access_tokens where user_id = $1 and client_id = $2`,
      [userId, clientId],
    );
    await client.query(
      `delete from mcp_oauth_grants where user_id = $1 and client_id = $2`,
      [userId, clientId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

interface GrantLimitRow {
  granted_at: Date;
  last_used_at: Date | null;
}

/**
 * Loads `granted_at` plus the most recent tool call made *since* it.
 *
 * The `created_at >= granted_at` window is what makes the idle rule correct
 * without needing per-client activity tracking: because only one connection
 * exists at a time, any audit row after the grant belongs to this grant, and
 * activity from a previously-connected client cannot keep the new one alive.
 * It also stays on the existing idx_mcp_tool_audit_logs_user_time index.
 *
 * Returns null when no grant row exists — see the caller for why that is
 * treated as "create one" rather than "reject".
 */
async function loadGrantLimits(
  userId: string,
  clientId: string,
): Promise<GrantLimitRow | null> {
  const result = await pool.query<GrantLimitRow>(
    `select
       g.granted_at,
       (select max(a.created_at)
          from mcp_tool_audit_logs a
         where a.user_id = g.user_id
           and a.created_at >= g.granted_at) as last_used_at
     from mcp_oauth_grants g
     where g.user_id = $1 and g.client_id = $2`,
    [userId, clientId],
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Atomic consent-accept claim — closes a concurrency gap in Better Auth's
// oAuthConsent handler (Accept path is not transactional end-to-end).
// ---------------------------------------------------------------------------

function hashConsentCode(consentCode: string): string {
  return createHash("sha256").update(consentCode, "utf8").digest("hex");
}

const CONSENT_CLAIM_TTL_SECONDS = 60;

/**
 * Attempts to atomically claim a consent code so at most one concurrent
 * `/oauth2/consent` submission for it can proceed to Better Auth's real
 * handler. Returns `true` iff this call won the claim; a second concurrent
 * call for the same code (double-click, client retry, or a race against the
 * raw, unwrapped `/api/auth/oauth2/consent` endpoint) returns `false` and
 * must fail closed. Expired claim rows are swept by the `oauth:cleanup` CLI
 * (apps/web/scripts/oauth-cleanup.ts), not released early on failure —
 * the underlying code is single-use regardless, so a claimed-but-failed
 * attempt simply can't be retried until the claim expires.
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

function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken, "utf8").digest("hex");
}

// Short-lived: long enough to cover a single /mcp/token round-trip (and a
// slow DB), short enough that a claimed-but-failed refresh can be retried
// without forcing the Founder through a full reconnect. Matches the consent
// claim TTL on purpose — same failure mode, same recovery window.
const REFRESH_CLAIM_TTL_SECONDS = 60;

/**
 * Attempts to atomically claim a refresh token so at most one concurrent
 * `/mcp/token` refresh grant for it can proceed to Better Auth's real
 * handler. The plugin's refresh branch is non-destructive (it inserts a new
 * row without removing the presented one), so without this claim two parallel
 * refreshes can both pass the read-only pre-flight and mint two live chains
 * before the after-hook's rotation runs.
 *
 * Returns `true` iff this call won the claim. A second concurrent call for
 * the same token returns `false` and must fail closed as `invalid_grant` —
 * same vocabulary as a replayed/rotated token, so a client cannot probe
 * which is which. Expired claim rows are swept by `oauth:cleanup`.
 */
export async function tryClaimRefreshToken(
  refreshToken: string,
): Promise<boolean> {
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return false;
  }
  const result = await pool.query(
    `insert into mcp_oauth_refresh_claims (refresh_token_hash, expires_at)
     values ($1, now() + interval '1 second' * $2)
     on conflict (refresh_token_hash) do nothing`,
    [hashRefreshToken(refreshToken), REFRESH_CLAIM_TTL_SECONDS],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Lookups shared by the /mcp/token and /mcp/register before-hooks
// (apps/web/lib/mcp-oauth-compat) — kept in packages/services per
// Shared with apps/web — not duplicated as raw queries in the web app.
// ---------------------------------------------------------------------------

export interface McpOAuthClientRecord {
  clientId: string;
  disabled: boolean;
  type: string;
  clientSecret: string | null;
  redirectUrls: string[];
}

interface OAuthApplicationRow {
  client_id: string;
  disabled: boolean;
  type: string;
  client_secret: string | null;
  redirect_urls: string;
}

export async function getOAuthClientByClientId(
  clientId: string,
): Promise<McpOAuthClientRecord | null> {
  const result = await pool.query<OAuthApplicationRow>(
    `select client_id, disabled, type, client_secret, redirect_urls
     from mcp_oauth_applications
     where client_id = $1`,
    [clientId],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    clientId: row.client_id,
    disabled: row.disabled,
    type: row.type,
    clientSecret: row.client_secret,
    redirectUrls: row.redirect_urls.split(","),
  };
}

export function isValidPublicOAuthClientRecord(
  client: McpOAuthClientRecord | null,
): client is McpOAuthClientRecord {
  return (
    client !== null &&
    !client.disabled &&
    client.type === "public" &&
    (client.clientSecret === null || client.clientSecret === "")
  );
}

export interface AuthorizableUser {
  userId: string;
  role: ActorRole;
}

interface UserAuthorizationRow {
  id: string;
  role: string;
  deleted_at: Date | null;
}

// Returns null uniformly for "doesn't exist", "deleted", and "not a role
// that may speak MCP" — the /mcp/token before-hook only needs to know
// whether a token may be issued for this user, not which of those it is.
//
// This is the issuing gate and `verifyMcpBearerToken` is the presenting
// gate; both consult `canUseMcp` because closing only one leaves the other
// open. Without this, a Mentor could still complete an authorization code
// exchange and hold a live token that every tool then rejects one call at
// a time.
export async function getAuthorizableUserById(
  userId: string,
): Promise<AuthorizableUser | null> {
  const result = await pool.query<UserAuthorizationRow>(
    `select id, role, deleted_at from users where id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.deleted_at !== null ||
    !isKnownActorRole(row.role) ||
    !canUseMcp(row.role)
  ) {
    return null;
  }
  return { userId: row.id, role: row.role };
}

// ---------------------------------------------------------------------------
// getMcpConnectionStatus — apps/web read path for the Connection page.
// ---------------------------------------------------------------------------

/**
 * Two independent facts, deliberately not collapsed into one "connected"
 * boolean.
 *
 * `authorised` is something we know for certain — a row in our own
 * database. Whether the AI client is *reachable right now* is something
 * we cannot know: the MCP transport here is stateless Streamable HTTP
 * (apps/mcp/src/server.ts builds a transport per request and closes it),
 * so there is no session to hold open, no ping to send, and no
 * disconnect event to receive. The client is also the only party that
 * can initiate — nothing on this side can poll it.
 *
 * So the second fact is `lastActivityAt`: the last time the client
 * actually called us. That is the only evidence of liveness that exists,
 * and callers must present it as evidence rather than dressing an
 * unexpired token up as a live connection. A Founder who authorised
 * yesterday and has since quit Claude still has a perfectly valid token.
 */
export interface McpConnectionStatus {
  // True while at least one live token row exists for this user against an
  // enabled public client. "Live" means the *connection* is still usable,
  // not that the current access token is: an expired access token whose
  // refresh token is still valid is a perfectly healthy connection — the
  // client refreshes it silently on its next call. Gating this on the access
  // token alone would put every Founder into the "Your connection expired"
  // state one hour after connecting, which is the exact thing refresh tokens
  // exist to prevent.
  //
  // The scope check verifyMcpBearerToken enforces per-request is deliberately
  // not applied here (a wrongly-scoped token still counts as authorised for
  // display; it fails loudly at tool-call time instead).
  authorised: boolean;
  clientName: string | null;
  // The OAuth client_id behind `clientName`. Only a Founder's own, and not
  // a secret (the client itself sends it on every authorize), but it is the
  // one handle that identifies a connection when the display name is
  // ambiguous — two DCR registrations may both call themselves "claudeai".
  clientId: string | null;
  // When the Founder actually authorised, from mcp_oauth_grants.granted_at.
  //
  // Not the token row's created_at, which this used to return: rotation
  // replaces that row hourly, so the page reported every active Founder as
  // having connected within the last hour. Null when not authorised.
  authorisedAt: string | null;
  // The date the Founder must reconnect by — the earliest of the refresh
  // token's own expiry, the grant's absolute cap, and the idle deadline.
  //
  // All three, not just the refresh expiry, because the soonest one is what
  // the Founder will actually experience; showing a date later than the one
  // that ends the connection is worse than showing nothing. Null when not
  // authorised.
  expiresAt: string | null;
  // True once the user has ever completed an Accept on the consent screen,
  // even after every token has expired or been swept — distinguishes
  // "expired, reconnect" from "never set this up".
  hasEverAuthorised: boolean;
  // When this user's AI client last actually called an MCP tool. `null`
  // means the connection has never been exercised, which is a distinct
  // state from "authorised and working" — the authorise redirect can
  // complete without a single tool call ever following it.
  lastActivityAt: string | null;
  // Which vendor is actually connected, derived from the client's
  // registered redirect hosts rather than the display name it chose for
  // itself — DCR is unauthenticated, so `clientName` is whatever the
  // client typed. Null when not authorised.
  //
  // The website's own record of which assistant a Founder set up lives in
  // `user_profiles.preferred_ai_provider` and is a separate thing: this is
  // what is connected, that is what they intend to use, and the two can
  // legitimately disagree while they switch.
  provider: McpProvider | null;
}

interface ConnectionTokenRow {
  client_name: string;
  client_id: string;
  created_at: Date;
  granted_at: Date | null;
  refresh_token_expires_at: Date;
  redirect_urls: string | null;
}

/**
 * Read-only connection summary for the signed-in Founder's own MCP state.
 * Never returns token material — only the two facts described on
 * `McpConnectionStatus`, left separate so the caller cannot accidentally
 * present an unexpired token as a live client.
 */
export async function getMcpConnectionStatus(
  actor: ActorContext,
): Promise<McpConnectionStatus> {
  assertRole(actor, ["founder"]);

  // A row counts while *either* half of it is still good: an unexpired
  // access token, or an unexpired refresh token that can mint a new one.
  // The `or` is what keeps a Founder out of the "expired, reconnect" state
  // in the 29 days between their access token lapsing and their refresh
  // token running out.
  //
  // `limit 1` is correct rather than lossy because only one connection can
  // exist at a time — recordMcpGrantIssued evicts every other client when a
  // new authorization completes. Before that rule existed this query hid a
  // still-live Claude connection behind a newer ChatGPT one. If the
  // single-connection rule is ever relaxed, this has to become a list.
  const tokenResult = await pool.query<ConnectionTokenRow>(
    `select a.name as client_name,
            a.redirect_urls,
            t.client_id,
            t.created_at,
            g.granted_at,
            t.refresh_token_expires_at
     from mcp_oauth_access_tokens t
     join mcp_oauth_applications a on a.client_id = t.client_id
     left join mcp_oauth_grants g
       on g.user_id = t.user_id and g.client_id = t.client_id
     where t.user_id = $1
       and (t.access_token_expires_at > now() or t.refresh_token_expires_at > now())
       and not a.disabled
       and a.type = 'public'
       and (a.client_secret is null or a.client_secret = '')
     order by t.created_at desc
     limit 1`,
    [actor.userId],
  );
  const token = tokenResult.rows[0] ?? null;

  const consentResult = await pool.query<{ exists: boolean }>(
    `select exists (
       select 1 from mcp_oauth_consents
       where user_id = $1 and consent_given
     ) as exists`,
    [actor.userId],
  );

  // Every MCP tool call routes through apps/mcp's audit wrapper, which
  // writes one row here per call — including denied and failed ones, so
  // a client that is reaching us but being rejected still counts as
  // activity. That makes this table the single source of "has the client
  // actually talked to us", with no separate connection-tracking table or
  // write path to keep in step. Served by
  // idx_mcp_tool_audit_logs_user_time, so this stays an index scan as the
  // log grows.
  const activityResult = await pool.query<{ last_activity_at: Date | null }>(
    `select max(created_at) as last_activity_at
     from mcp_tool_audit_logs
     where user_id = $1`,
    [actor.userId],
  );

  const lastActivityAt = activityResult.rows[0]?.last_activity_at ?? null;

  // Fall back to the token row only for a grant that predates 0008 and has
  // not refreshed since; checkRefreshTokenIsRedeemable backfills it on the
  // next refresh, after which the real authorisation time takes over.
  const grantedAt = token ? (token.granted_at ?? token.created_at) : null;

  const deadline =
    token && grantedAt
      ? connectionDeadline(
          token.refresh_token_expires_at,
          grantedAt,
          lastActivityAt,
        )
      : null;

  // A grant is only retired when its client next tries to refresh, and an
  // idle connection is by definition one that is not refreshing — so the
  // rows can outlive the deadline by weeks. Reporting the deadline without
  // applying it here showed "Connected — stays connected until" with a date
  // in the past. The limit has passed, so the honest answer is that the
  // connection is over; `hasEverAuthorised` still puts the Founder in the
  // "reconnect" state rather than first-time setup.
  const live = deadline !== null && deadline.getTime() > Date.now();

  return {
    authorised: live,
    clientName: live ? (token?.client_name ?? null) : null,
    clientId: live ? (token?.client_id ?? null) : null,
    authorisedAt: live ? (grantedAt?.toISOString() ?? null) : null,
    expiresAt: live ? (deadline?.toISOString() ?? null) : null,
    hasEverAuthorised: consentResult.rows[0]?.exists ?? false,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
    provider:
      live && token
        ? mcpProviderForRedirectUris(parseRedirectUrls(token.redirect_urls))
        : null,
  };
}

/**
 * The name of the assistant that approving this authorization would
 * disconnect, or null when there is nothing to displace.
 *
 * One connection at a time is enforced in `recordMcpGrantIssued`, silently
 * and after the fact — so this exists purely so the consent screen can say
 * so *before* the Founder clicks Allow. Losing a working Claude connection
 * because you tried ChatGPT is fine if you chose it, and a bug report if you
 * did not.
 *
 * Takes a raw user id rather than an ActorContext: the consent screen runs
 * for a signed-in user whose role has not been narrowed to founder yet.
 */
export async function getMcpConnectionToBeReplaced(
  userId: string,
  incomingClientId: string,
): Promise<string | null> {
  const result = await pool.query<{ client_name: string }>(
    `select a.name as client_name
     from mcp_oauth_access_tokens t
     join mcp_oauth_applications a on a.client_id = t.client_id
     where t.user_id = $1
       and t.client_id <> $2
       and (t.access_token_expires_at > now() or t.refresh_token_expires_at > now())
       and not a.disabled
       and a.type = 'public'
       and (a.client_secret is null or a.client_secret = '')
     order by t.created_at desc
     limit 1`,
    [userId, incomingClientId],
  );
  return result.rows[0]?.client_name ?? null;
}

/**
 * The soonest of the three things that can end a connection.
 *
 * The idle deadline counts from the last tool call, or from `granted_at`
 * when there has never been one — matching how the idle rule is actually
 * evaluated in checkRefreshTokenIsRedeemable, so the date shown to the
 * Founder is the date they will really be cut off on.
 */
function connectionDeadline(
  refreshTokenExpiresAt: Date,
  grantedAt: Date,
  lastActivityAt: Date | null,
): Date {
  const idleDeadline =
    (lastActivityAt ?? grantedAt).getTime() + MCP_GRANT_IDLE_TIMEOUT_MS;
  const absoluteDeadline = grantedAt.getTime() + MCP_GRANT_ABSOLUTE_MAX_AGE_MS;

  return new Date(
    Math.min(refreshTokenExpiresAt.getTime(), idleDeadline, absoluteDeadline),
  );
}

// ---------------------------------------------------------------------------
// Revocation
//
// Until this existed, "disconnect" had no server-side representation at
// all. Removing the connector in Claude is purely client-side: the token
// row stayed, so the website kept reporting the Founder as connected, and
// — worse — verifyMcpBearerToken kept honouring that token for the rest of
// its hour. A Founder who deliberately revoked access still had a live
// credential against their own workspace.
//
// Deleting rather than flagging: mcp_oauth_access_tokens is only ever read
// through an expiry-gated lookup, so a `revoked` column would add a second
// condition every caller has to remember. A row that must not work again
// is better gone. `mcp_oauth_consents` keeps the history, which is what
// that table is for.
// ---------------------------------------------------------------------------

export interface McpRevocationResult {
  /** How many live tokens this call removed. Zero is a normal outcome. */
  accessTokensRevoked: number;
}

/**
 * Revokes every access token this Founder holds, whichever client issued
 * them.
 *
 * Idempotent: revoking with nothing to revoke returns zero rather than
 * erroring, so a double-click or a stale tab can't produce a confusing
 * failure.
 */
export async function revokeMcpConnectionForUser(
  actor: ActorContext,
): Promise<McpRevocationResult> {
  assertRole(actor, ["founder"]);
  return revokeAllMcpConnectionsForUserId(actor.userId);
}

/**
 * The same revocation without the role gate, for callers acting on the
 * account rather than on behalf of the signed-in Founder — today the
 * password-change hook in apps/web/lib/auth.ts, which runs inside Better
 * Auth and has a user id but no ActorContext.
 *
 * Not exported for general use: anything reachable from a request should go
 * through `revokeMcpConnectionForUser` so the founder-role check applies.
 */
export async function revokeAllMcpConnectionsForUserId(
  userId: string,
): Promise<McpRevocationResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const deleted = await client.query<{ client_id: string }>(
      `delete from mcp_oauth_access_tokens
       where user_id = $1
       returning client_id`,
      [userId],
    );

    // One withdrawal row per client the Founder had a live token for.
    // This table is a permanent history log, not a live gate (see
    // 0004_mcp_oauth_provider_schema.sql), so writing consent_given =
    // false records the decision without changing any read path.
    const clientIds = [...new Set(deleted.rows.map((row) => row.client_id))];
    for (const clientId of clientIds) {
      await client.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, $3, false)`,
        [clientId, userId, GRANTED_MCP_SCOPES.join(" ")],
      );
    }

    // The grant goes with the tokens: leaving it would let a later
    // reconnection inherit the old `granted_at` and its already-part-spent
    // 90-day cap, when the Founder plainly meant to start over.
    await client.query(`delete from mcp_oauth_grants where user_id = $1`, [
      userId,
    ]);

    await client.query("commit");
    return { accessTokensRevoked: deleted.rowCount ?? 0 };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * RFC 7009 revocation by token value, for the `revocation_endpoint`.
 *
 * Unauthenticated by design: V1 issues only public clients with no
 * secret, so possession of the token is the only credential there is.
 * That is also why this returns nothing — RFC 7009 §2.2 requires the
 * endpoint to answer 200 whether or not the token existed, so a caller
 * cannot use it to probe which tokens are real.
 *
 * Matches on either column because RFC 7009 §2.1 lets the client submit an
 * access token *or* a refresh token, and both live on the same row here.
 * Deleting that row revokes the pair together — which is what a client
 * disconnecting actually means, and stops a revoked access token from being
 * silently replaced by its own refresh token minutes later.
 */
export async function revokeMcpAccessToken(token: string): Promise<void> {
  if (typeof token !== "string" || token.trim().length === 0) {
    return;
  }
  await pool.query(
    `delete from mcp_oauth_access_tokens
     where access_token = $1 or refresh_token = $1`,
    [token],
  );
}

// ---------------------------------------------------------------------------
// Periodic cleanup (apps/web/scripts/oauth-cleanup.ts's `oauth:cleanup` CLI)
// — nothing here is required for correctness (every gate above is already
// enforced at read time by expiry checks / the unique claim constraint),
// this only bounds table growth. See
// infra/database/migrations/0004_mcp_oauth_provider_schema.sql's per-table
// comments for why each of these is safe to delete outright rather than
// soft-deleted.
// ---------------------------------------------------------------------------

// DCR (`POST /mcp/register`) requires no authentication at all (RFC 7591),
// so a registered client with no real user ever behind it is expected
// background noise, not necessarily abuse — but one is never deleted until
// it's been sitting unused for this long, so a user who registered a client
// and simply hasn't finished the authorize/consent redirect yet is never
// caught by this sweep.
const ORPHAN_APPLICATION_GRACE_PERIOD_HOURS = 24;

export interface McpOAuthCleanupResult {
  expiredAccessTokensDeleted: number;
  expiredConsentClaimsDeleted: number;
  expiredRefreshClaimsDeleted: number;
  orphanedGrantsDeleted: number;
  orphanedApplicationsDeleted: number;
}

/**
 * Deletes expired/orphaned rows across all four `mcp_oauth_*` tables.
 * Idempotent and safe to run repeatedly (e.g. on a schedule) — every
 * condition below only ever matches rows that are already unusable by the
 * live request paths in this file and apps/web/lib/mcp-oauth-compat.
 */
export async function cleanupExpiredMcpOAuthState(): Promise<McpOAuthCleanupResult> {
  // 1. mcp_oauth_access_tokens: a row is only dead once *both* halves are.
  // The access_token_expires_at condition on its own would delete a live
  // connection every hour — the refresh token on that row is redeemable for
  // 30 days and is the whole reason a Founder does not have to reconnect.
  // Rotation (rotateOutMcpRefreshToken) is what actually keeps this table
  // small; this sweep only collects rows nothing can use again.
  const accessTokens = await pool.query(
    `delete from mcp_oauth_access_tokens
     where access_token_expires_at < now()
       and refresh_token_expires_at < now()`,
  );

  // 2. mcp_oauth_consent_claims / mcp_oauth_refresh_claims: each unique
  // constraint's whole purpose ends the moment its short TTL
  // (tryClaimConsentCode / tryClaimRefreshToken) has passed.
  const consentClaims = await pool.query(
    `delete from mcp_oauth_consent_claims where expires_at < now()`,
  );
  const refreshClaims = await pool.query(
    `delete from mcp_oauth_refresh_claims where expires_at < now()`,
  );

  // 3. mcp_oauth_grants: a grant whose token rows are all gone can never be
  // used again — every read of it is reached through a token. Safe to run
  // right after the sweep above and never mid-rotation, because rotation
  // inserts the replacement row before the after-hook deletes the old
  // family, so a live grant is never momentarily left with zero tokens.
  const orphanedGrants = await pool.query(
    `delete from mcp_oauth_grants g
      where not exists (
        select 1 from mcp_oauth_access_tokens t
         where t.user_id = g.user_id and t.client_id = g.client_id
      )`,
  );

  // 4. mcp_oauth_applications: only a client with zero rows in
  // mcp_oauth_consents is a candidate — one real Accept is enough to keep a
  // client alive indefinitely (its access tokens expiring is not by itself
  // a reason to force it through DCR again), matching the migration
  // comment's stated intent for this table's index.
  const orphanedApplications = await pool.query(
    `delete from mcp_oauth_applications
     where created_at < now() - interval '1 hour' * $1
       and not exists (
         select 1 from mcp_oauth_consents
         where mcp_oauth_consents.client_id = mcp_oauth_applications.client_id
       )`,
    [ORPHAN_APPLICATION_GRACE_PERIOD_HOURS],
  );

  return {
    expiredAccessTokensDeleted: accessTokens.rowCount ?? 0,
    expiredConsentClaimsDeleted: consentClaims.rowCount ?? 0,
    expiredRefreshClaimsDeleted: refreshClaims.rowCount ?? 0,
    orphanedGrantsDeleted: orphanedGrants.rowCount ?? 0,
    orphanedApplicationsDeleted: orphanedApplications.rowCount ?? 0,
  };
}
