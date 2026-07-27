import { createHash } from "node:crypto";

import { z } from "zod";

import { pool } from "@ai-catalyst/db";
import type {
  ActorContext,
  ActorRole,
} from "@ai-catalyst/contracts/actor-context";
import { createMcpActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";

const MCP_CONNECT_SCOPE = "mcp:connect";

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
 * authorized for MCP (a `pending` account, or a token missing the
 * `mcp:connect` scope) — mapped to HTTP 403, with an `insufficient_scope`
 * challenge for the latter case.
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

  if (value.scope.length !== 1 || value.scope[0] !== MCP_CONNECT_SCOPE) {
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
 * Callers must have already rejected any `grant_type` other than
 * `authorization_code` (including missing/`refresh_token`) themselves,
 * with `unsupported_grant_type`, before calling this — V1 does not support
 * the refresh grant (see the /mcp/authorize before-hook that strips
 * `offline_access`).
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

// Returns null uniformly for "doesn't exist", "deleted", and "still
// pending" — the /mcp/token before-hook only needs to know whether a token
// may be issued for this user, not which of those three it is.
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
    row.role === "pending"
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
  // True while at least one unexpired access token exists for this user
  // against an enabled public client — the same condition
  // verifyMcpBearerToken enforces per-request, minus the scope check
  // (a wrongly-scoped client still counts as authorised for display; it
  // fails loudly at tool-call time instead).
  authorised: boolean;
  clientName: string | null;
  // Latest valid token's issue time; null when not authorised.
  authorisedAt: string | null;
  // Latest valid token's expiry; null when not authorised.
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
}

interface ConnectionTokenRow {
  client_name: string;
  created_at: Date;
  access_token_expires_at: Date;
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

  const tokenResult = await pool.query<ConnectionTokenRow>(
    `select a.name as client_name, t.created_at, t.access_token_expires_at
     from mcp_oauth_access_tokens t
     join mcp_oauth_applications a on a.client_id = t.client_id
     where t.user_id = $1
       and t.access_token_expires_at > now()
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

  return {
    authorised: token !== null,
    clientName: token?.client_name ?? null,
    authorisedAt: token?.created_at.toISOString() ?? null,
    expiresAt: token?.access_token_expires_at.toISOString() ?? null,
    hasEverAuthorised: consentResult.rows[0]?.exists ?? false,
    lastActivityAt:
      activityResult.rows[0]?.last_activity_at?.toISOString() ?? null,
  };
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

  const client = await pool.connect();
  try {
    await client.query("begin");

    const deleted = await client.query<{ client_id: string }>(
      `delete from mcp_oauth_access_tokens
       where user_id = $1
       returning client_id`,
      [actor.userId],
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
        [clientId, actor.userId, MCP_CONNECT_SCOPE],
      );
    }

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
 */
export async function revokeMcpAccessToken(token: string): Promise<void> {
  if (typeof token !== "string" || token.trim().length === 0) {
    return;
  }
  await pool.query(
    `delete from mcp_oauth_access_tokens where access_token = $1`,
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
  orphanedApplicationsDeleted: number;
}

/**
 * Deletes expired/orphaned rows across all four `mcp_oauth_*` tables.
 * Idempotent and safe to run repeatedly (e.g. on a schedule) — every
 * condition below only ever matches rows that are already unusable by the
 * live request paths in this file and apps/web/lib/mcp-oauth-compat.
 */
export async function cleanupExpiredMcpOAuthState(): Promise<McpOAuthCleanupResult> {
  // 1. mcp_oauth_access_tokens: swept on access_token_expires_at alone.
  // refresh_token_expires_at is deliberately not part of this condition —
  // every issued refresh_token is already permanently unredeemable in V1
  // (the /mcp/authorize before-hook always strips offline_access before
  // Better Auth's authorize() ever runs), so its expiry carries no real
  // meaning here.
  const accessTokens = await pool.query(
    `delete from mcp_oauth_access_tokens where access_token_expires_at < now()`,
  );

  // 2. mcp_oauth_consent_claims: the unique constraint's whole purpose ends
  // the moment the claim's short TTL (tryClaimConsentCode's
  // CONSENT_CLAIM_TTL_SECONDS) has passed.
  const consentClaims = await pool.query(
    `delete from mcp_oauth_consent_claims where expires_at < now()`,
  );

  // 3. mcp_oauth_applications: only a client with zero rows in
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
    orphanedApplicationsDeleted: orphanedApplications.rowCount ?? 0,
  };
}
