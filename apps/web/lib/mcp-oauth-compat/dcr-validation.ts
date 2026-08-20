import { createAuthMiddleware } from "better-auth/api";

import { oauthError } from "./oauth-errors";

interface RequestLikeContext {
  request?: Request | null;
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory, per-process. Replace with a shared limiter
// (Redis or DB-backed) before /mcp/register runs on more than one server
// process: each replica has its own budget, and a restart clears it.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const requestTimestampsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const existing = requestTimestampsByIp.get(ip) ?? [];
  const withinWindow = existing.filter((timestamp) => timestamp > windowStart);
  withinWindow.push(now);
  requestTimestampsByIp.set(ip, withinWindow);
  return withinWindow.length > RATE_LIMIT_MAX_REQUESTS;
}

/** Shared bucket for every request whose client cannot be identified. */
export const UNKNOWN_CLIENT_IP = "unknown";

/**
 * Resolves the caller's IP for rate-limiting purposes only.
 *
 * Deliberately does *not* trust `X-Forwarded-For` unless
 * `MCP_OAUTH_TRUST_PROXY_HEADERS` is explicitly set to `"true"` — on a direct
 * connection a caller can set that header to anything, so trusting it by
 * default would let them reset their own bucket on every request.
 *
 * Reads the **rightmost** entry, not the leftmost, and that distinction is the
 * whole point. `X-Forwarded-For` is append-only and the left of the list is
 * whatever the caller chose to send; only entries a trusted hop appended can be
 * believed, and those are on the right. AWS ALB — the proxy this actually runs
 * behind — appends the address of the connection it received rather than
 * replacing the header, so with one ALB in front the last entry is the real
 * client and everything to its left is untrusted input. Taking the first entry,
 * as this did originally, meant a caller sending
 * `X-Forwarded-For: <anything>` got a fresh bucket per request and the limiter
 * did nothing. The header note above said the env var required a proxy that
 * *overwrites* the header; ALB does not, and the deployment set the var anyway.
 *
 * Put a second layer in front (CloudFront, a terminating WAF) and the rightmost
 * entry becomes that layer's address instead of the client's, collapsing
 * everyone into one bucket: coarser, still not spoofable. Revisit this function
 * if that happens.
 *
 * Without a trusted proxy every request falls into the same
 * `UNKNOWN_CLIENT_IP` bucket — a global-per-process limit rather than a
 * per-client one, but enough to blunt naive registration flooding locally.
 *
 * Exported for the test that pins the leftmost/rightmost choice.
 */
export function resolveClientIp(ctx: RequestLikeContext): string {
  if (process.env.MCP_OAUTH_TRUST_PROXY_HEADERS !== "true") {
    return UNKNOWN_CLIENT_IP;
  }

  const forwardedFor = ctx.request?.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return UNKNOWN_CLIENT_IP;
  }

  const hops = forwardedFor
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);

  return hops[hops.length - 1] ?? UNKNOWN_CLIENT_IP;
}

// ---------------------------------------------------------------------------
// Redirect URI hardening
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);

function isAllowedRedirectUri(rawUri: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUri);
  } catch {
    return false;
  }

  const isHttps = url.protocol === "https:";
  const isLoopbackHttp =
    url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
  if (!isHttps && !isLoopbackHttp) {
    return false;
  }

  // Confirmed source-level reason for banning a query string: Better
  // Auth's own Deny-path redirect
  // (`plugins/oidc-provider/index.mjs`'s oAuthConsent handler,
  // `` `${value.redirectURI}?error=access_denied...` ``) uses plain string
  // concatenation, not `URL#searchParams`. A registered redirect_uri that
  // already contains a `?` produces a malformed URL
  // (`...?foo=bar?error=access_denied...`) on Deny — banning query strings
  // at registration time is the only place this can be prevented, since
  // Better Auth's own handler can't be patched.
  if (url.search !== "") {
    return false;
  }
  if (url.hash !== "") {
    return false;
  }
  if (url.username !== "" || url.password !== "") {
    return false;
  }

  return true;
}

const MAX_REDIRECT_URIS = 5;
const MAX_CLIENT_NAME_LENGTH = 100;

interface DcrRequestBody {
  redirect_uris?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  client_name?: unknown;
}

function isStringArrayEqualTo(
  value: unknown,
  expected: readonly string[],
): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((item) => value.includes(item))
  );
}

/**
 * Claude (and other MCP hosts) register with
 * `grant_types: ["authorization_code", "refresh_token"]`, and both are grants
 * this server really implements — `authorization_code` to establish the
 * connection, `refresh_token` to keep it alive without the Founder
 * reconnecting. Every other grant type the underlying handler would accept
 * (implicit, password, client_credentials, JWT/SAML bearer) is refused.
 */
function isAllowedGrantTypes(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  if (!value.every((item) => typeof item === "string")) {
    return false;
  }
  const unique = new Set(value);
  if (unique.size !== value.length) {
    return false;
  }
  if (!unique.has("authorization_code")) {
    return false;
  }
  for (const item of unique) {
    if (item !== "authorization_code" && item !== "refresh_token") {
      return false;
    }
  }
  return true;
}

/**
 * Hardens `POST /mcp/register` (Dynamic Client Registration, RFC 7591)
 * down to the single "public client, authorization_code + PKCE only"
 * profile this compatibility layer supports — better-auth@1.6.23's own DCR
 * handler (`registerMcpClient` in `plugins/mcp/index.mjs`) is far more
 * permissive by default:
 *
 * - `token_endpoint_auth_method` defaults to `"client_secret_basic"` when
 *   omitted, silently registering a *confidential* client
 *   (`clientType = body.token_endpoint_auth_method === "none" ? "public" :
 *   "web"`) unless the caller explicitly opts into `"none"`. This app has
 *   no way to hand a client_secret to a fully public MCP client (there is
 *   no server-side component to keep it in), so every registered client
 *   must be `"none"` (public) — anything else is rejected outright rather
 *   than silently accepted and then unusable.
 * - `grant_types`/`response_types` accept far more than
 *   `authorization_code`/`refresh_token`/`code` (implicit, password,
 *   client_credentials, JWT/SAML bearer, `token`) — none of those are
 *   implemented by the token endpoint this profile relies on, so a client
 *   registered with them would simply fail confusingly later. Rejected here
 *   instead. `refresh_token` is allowed only *alongside*
 *   `authorization_code`, never on its own: there is no way to hold a
 *   refresh token without first completing an authorization.
 * - `client_name` is optional in the handler's own zod schema but
 *   `name: body.client_name` is written straight into a `not null` column
 *   — required here explicitly instead of surfacing as a database error.
 */
export const registerEndpointBeforeHook = {
  matcher: (ctx: { path?: string }): boolean => ctx.path === "/mcp/register",
  handler: createAuthMiddleware(async (ctx) => {
    if (isRateLimited(resolveClientIp(ctx))) {
      throw oauthError(
        "invalid_request",
        "Too many client registration attempts. Please try again later.",
      );
    }

    const body = ctx.body as DcrRequestBody | undefined;
    if (!body) {
      throw oauthError("invalid_client_metadata", "Request body is required.");
    }

    if (body.token_endpoint_auth_method !== "none") {
      throw oauthError(
        "invalid_client_metadata",
        'token_endpoint_auth_method must be "none" — this server only registers public clients.',
      );
    }

    if (
      body.grant_types !== undefined &&
      !isAllowedGrantTypes(body.grant_types)
    ) {
      throw oauthError(
        "invalid_client_metadata",
        'grant_types must be ["authorization_code"] or ["authorization_code","refresh_token"].',
      );
    }

    if (
      body.response_types !== undefined &&
      !isStringArrayEqualTo(body.response_types, ["code"])
    ) {
      throw oauthError(
        "invalid_client_metadata",
        'response_types must be exactly ["code"].',
      );
    }

    if (
      typeof body.client_name !== "string" ||
      body.client_name.trim().length === 0 ||
      body.client_name.length > MAX_CLIENT_NAME_LENGTH
    ) {
      throw oauthError(
        "invalid_client_metadata",
        `client_name is required and must be at most ${MAX_CLIENT_NAME_LENGTH} characters.`,
      );
    }

    if (
      !Array.isArray(body.redirect_uris) ||
      body.redirect_uris.length === 0 ||
      body.redirect_uris.length > MAX_REDIRECT_URIS
    ) {
      throw oauthError(
        "invalid_redirect_uri",
        `redirect_uris must contain between 1 and ${MAX_REDIRECT_URIS} URIs.`,
      );
    }

    for (const uri of body.redirect_uris) {
      if (typeof uri !== "string" || !isAllowedRedirectUri(uri)) {
        throw oauthError(
          "invalid_redirect_uri",
          `redirect_uri "${String(uri)}" is not allowed: must be an https:// URL (or an http:// loopback URL for local testing) with no fragment, query string, or userinfo.`,
        );
      }
    }
  }),
};
