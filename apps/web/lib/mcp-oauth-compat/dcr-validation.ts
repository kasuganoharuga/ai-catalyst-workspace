import { createAuthMiddleware } from "better-auth/api";

import { oauthError } from "./oauth-errors";

interface RequestLikeContext {
  request?: Request | null;
}

// ---------------------------------------------------------------------------
// Rate limiting — development-only, in-memory, per-process. A real
// deployment (PR 2.10) MUST replace this with a shared limiter (Redis or a
// database-backed one, matching whatever the rest of the platform's rate
// limiting uses by then) once /mcp/register is reachable from more than one
// server process — an in-memory Map means every process/replica gets its own
// independent budget, and a restart resets it entirely.
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

/**
 * Resolves the caller's IP for rate-limiting purposes only. Deliberately
 * does *not* trust `X-Forwarded-For` unless `MCP_OAUTH_TRUST_PROXY_HEADERS`
 * is explicitly set to `"true"` — an attacker can set that header on a
 * direct connection to any value they like, so trusting it by default
 * would let them reset their own rate-limit bucket on every request. Only
 * set that env var once this app is deployed behind a proxy/load balancer
 * that itself overwrites (not appends to) that header before forwarding.
 *
 * Without a trusted proxy in front (the local/CI case this PR covers),
 * every request falls into the same `"unknown"` bucket — a coarser,
 * global-per-process limit, not per-client, but still enough to blunt a
 * naive registration-flooding script in dev.
 */
function resolveClientIp(ctx: RequestLikeContext): string {
  if (process.env.MCP_OAUTH_TRUST_PROXY_HEADERS === "true") {
    const forwardedFor = ctx.request?.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0]?.trim() || "unknown";
    }
  }
  return "unknown";
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
 *   `authorization_code`/`code` (implicit, password, client_credentials,
 *   JWT/SAML bearer, `token`) — none of those are implemented by the
 *   token endpoint this profile relies on, so a client registered with
 *   them would simply fail confusingly later. Rejected here instead.
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
      !isStringArrayEqualTo(body.grant_types, ["authorization_code"])
    ) {
      throw oauthError(
        "invalid_client_metadata",
        'grant_types must be exactly ["authorization_code"].',
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
