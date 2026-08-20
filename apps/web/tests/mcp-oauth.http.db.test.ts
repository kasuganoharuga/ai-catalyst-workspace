import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@ai-catalyst/db";
import { verifyMcpBearerToken } from "@ai-catalyst/services/mcp-auth";
import { GET, POST } from "../app/api/auth/[...all]/route";

/**
 * Exercises the real /api/auth/[...all] route handler over the full MCP
 * OAuth 2.1 flow (Dynamic Client Registration -> authorize -> consent ->
 * token), covering the actual wiring of every before-hook in
 * apps/web/lib/mcp-oauth-compat/ against Better Auth's real `mcp()` +
 * `oidc-provider` plugin endpoints �� not just the hooks' own unit-level
 * branches (already covered by packages/services/src/mcp-auth's db tests).
 *
 * Each `it` mutates shared state (session cookies, client_id, consent/auth
 * codes) the same way apps/web/tests/auth.http.db.test.ts does, since this is a
 * single real flow through a stateful protocol.
 */
describe("MCP OAuth 2.1 �� HTTP route handler", () => {
  const BASE_URL = "http://localhost:3000";
  const REDIRECT_URI = "http://127.0.0.1:9999/callback";
  const password = "correct-horse-battery-staple";

  const email = `mcp-oauth-${randomUUID()}@example.com`;
  const otherEmail = `mcp-oauth-other-${randomUUID()}@example.com`;

  let userId = "";
  let otherUserId = "";
  let sessionCookie = "";
  let otherSessionCookie = "";
  let clientId = "";
  let codeVerifier = "";
  let codeChallenge = "";
  let pendingConsentCode = "";
  let redeemableCode = "";
  let issuedAccessToken = "";
  let issuedRefreshToken = "";
  let grantedAt: Date | null = null;

  afterAll(async () => {
    if (clientId) {
      await pool.query("delete from mcp_oauth_grants where client_id = $1", [
        clientId,
      ]);
      await pool.query(
        "delete from mcp_oauth_access_tokens where client_id = $1",
        [clientId],
      );
      await pool.query("delete from mcp_oauth_consents where client_id = $1", [
        clientId,
      ]);
      await pool.query(
        "delete from mcp_oauth_applications where client_id = $1",
        [clientId],
      );
    }
    await pool.query("delete from mcp_oauth_consent_claims");
    await pool.query("delete from mcp_oauth_refresh_claims");
    await pool.query("delete from users where email in ($1, $2)", [
      email,
      otherEmail,
    ]);
  });

  async function signUpAndPromote(
    userEmail: string,
  ): Promise<{ userId: string; cookie: string }> {
    const signUpResponse = await POST(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: userEmail, password, name: "Tester" }),
      }),
    );
    const signUpBody = await signUpResponse.json();
    await pool.query("update users set role = 'founder' where id = $1", [
      signUpBody.user.id,
    ]);

    const signInResponse = await POST(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: userEmail, password }),
      }),
    );
    const cookie = signInResponse.headers.get("set-cookie")!.split(";")[0];
    return { userId: signUpBody.user.id, cookie };
  }

  // Token columns are constrained to MCP_BEARER_TOKEN_PATTERN (32 letters)
  // by the service layer, so a fixture token has to look like a real one or
  // it is rejected on shape before any logic under test runs.
  function randomLetters(): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from(
      randomBytes(32),
      (byte) => alphabet[byte % alphabet.length],
    ).join("");
  }

  function buildAuthorizeUrl(overrides: Record<string, string> = {}): string {
    const url = new URL(`${BASE_URL}/api/auth/mcp/authorize`);
    const params: Record<string, string> = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "mcp:connect",
      state: "test-state",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...overrides,
    };
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return url.toString();
  }

  it("sets up two founder accounts to exercise the flow", async () => {
    const first = await signUpAndPromote(email);
    userId = first.userId;
    sessionCookie = first.cookie;

    const second = await signUpAndPromote(otherEmail);
    otherUserId = second.userId;
    otherSessionCookie = second.cookie;

    expect(userId).toBeTruthy();
    expect(otherUserId).toBeTruthy();
  });

  it("registers a public client via POST /mcp/register and rejects a non-public one", async () => {
    const badResponse = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Bad Client",
          redirect_uris: [REDIRECT_URI],
        }),
      }),
    );
    expect(badResponse.status).toBe(400);
    const badBody = await badResponse.json();
    expect(badBody.error).toBe("invalid_client_metadata");

    // Claude's DCR payload always includes refresh_token alongside
    // authorization_code — accept it so connector signup works.
    const claudeLikeResponse = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "claudeai",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          scope: "claudeai",
        }),
      }),
    );
    expect(claudeLikeResponse.status).toBe(201);

    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Test MCP Client",
          redirect_uris: [REDIRECT_URI],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
          response_types: ["code"],
        }),
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token_endpoint_auth_method).toBe("none");
    clientId = body.client_id;
    expect(clientId).toBeTruthy();

    codeVerifier = randomBytes(32).toString("base64url");
    codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
  });

  it("rejects prompt=none and disallowed scopes at GET /mcp/authorize", async () => {
    const promptNoneResponse = await GET(
      new Request(buildAuthorizeUrl({ prompt: "none" }), {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(promptNoneResponse.status).toBe(403);
    expect((await promptNoneResponse.json()).error).toBe("consent_required");

    const badScopeResponse = await GET(
      new Request(buildAuthorizeUrl({ scope: "openid" }), {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(badScopeResponse.status).toBe(400);
    expect((await badScopeResponse.json()).error).toBe("invalid_scope");

    // offline_access is the one addition to the allowed set — a client that
    // asks for it explicitly (as Claude does) must not be turned away.
    const offlineAccessResponse = await GET(
      new Request(buildAuthorizeUrl({ scope: "mcp:connect offline_access" }), {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(offlineAccessResponse.status).toBe(302);
  });

  it("hands an unauthenticated authorize request to /oauth/continue intact", async () => {
    // The regression test for the bug that made ChatGPT connections hang.
    // With no session cookie, Better Auth redirects to `loginPage` with the
    // entire original query string appended (authorize.mjs:39-41). That used
    // to be `/login`, which read only `returnTo`, found none, and sent the
    // Founder to "/" — destroying the request. They signed in, landed on
    // /dashboard, and the client waited on a callback that never came.
    //
    // ChatGPT authorises inside an isolated in-app browser with no session
    // cookie, so it took this branch on essentially every attempt; Claude
    // uses the system browser where the Founder is usually already signed
    // in, which is why this looked ChatGPT-specific.
    const response = await GET(new Request(buildAuthorizeUrl()));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!, BASE_URL);
    expect(location.pathname).toBe("/oauth/continue");

    // Whatever else changes, these two have to survive: client_id is the
    // only handle on which client is connecting, and code_challenge cannot
    // be regenerated after the fact.
    expect(location.searchParams.get("client_id")).toBe(clientId);
    expect(location.searchParams.get("code_challenge")).toBe(codeChallenge);
    expect(location.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  it("forces the consent screen and returns a pending consent_code", async () => {
    const response = await GET(
      new Request(buildAuthorizeUrl(), { headers: { cookie: sessionCookie } }),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location")!;
    const consentUrl = new URL(location, BASE_URL);
    expect(consentUrl.pathname).toBe("/oauth/consent");
    pendingConsentCode = consentUrl.searchParams.get("consent_code")!;
    expect(pendingConsentCode).toBeTruthy();
  });

  it("rejects a consent accept submitted by a different logged-in user", async () => {
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: {
          cookie: otherSessionCookie,
          origin: BASE_URL,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          accept: true,
          consent_code: pendingConsentCode,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });

  it("accepts consent as the correct user and rejects a replay of the same consent_code", async () => {
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: BASE_URL,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          accept: true,
          consent_code: pendingConsentCode,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const redirectUri = new URL(body.redirectURI);
    expect(redirectUri.origin + redirectUri.pathname).toBe(REDIRECT_URI);
    redeemableCode = redirectUri.searchParams.get("code")!;
    expect(redeemableCode).toBeTruthy();

    const replayResponse = await POST(
      new Request(`${BASE_URL}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: BASE_URL,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          accept: true,
          consent_code: pendingConsentCode,
        }),
      }),
    );
    expect(replayResponse.status).toBe(400);
    expect((await replayResponse.json()).error).toBe("invalid_request");
  });

  it("rejects a cross-origin consent submission", async () => {
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: "https://evil.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          accept: true,
          consent_code: pendingConsentCode,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });

  it("rejects an unimplemented grant at POST /mcp/token without burning the code", async () => {
    // client_credentials is one of the grants better-auth's own DCR handler
    // would happily register but this token endpoint never implements. The
    // code is deliberately included in the body: the point of the test is
    // that a valid code survives a request rejected on grant_type alone.
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          code: redeemableCode,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: codeVerifier,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("unsupported_grant_type");
  });

  it("rejects a refresh_token grant carrying an unknown refresh token", async () => {
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "a".repeat(32),
          client_id: clientId,
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_grant");
  });

  it("redeems the authorization code for an access token and a refresh token", async () => {
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: redeemableCode,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: codeVerifier,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.access_token).toBeTruthy();
    // offline_access is granted whether or not the client asked for it (the
    // authorize URL above only ever requests mcp:connect) — that is what makes
    // the plugin return a refresh_token here at all.
    expect(body.scope).toBe("mcp:connect offline_access");
    expect(body.refresh_token).toBeTruthy();
    expect(body.id_token).toBeUndefined();
    issuedAccessToken = body.access_token;
    issuedRefreshToken = body.refresh_token;

    // The same code must not be redeemable a second time � it was deleted
    // by the real handler's consumeVerificationValue, so the before-hook's
    // read-only re-check now sees no row at all and rejects with
    // invalid_grant (401), same as a wholly unknown code.
    const replayResponse = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: redeemableCode,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: codeVerifier,
        }),
      }),
    );
    expect(replayResponse.status).toBe(401);
    expect((await replayResponse.json()).error).toBe("invalid_grant");

    // The exchange also has to have recorded a grant: it is what starts the
    // connection's lifetime clock, and without it the Connection page reports
    // the last rotation as the authorisation date.
    const grant = await pool.query(
      "select granted_at from mcp_oauth_grants where user_id = $1 and client_id = $2",
      [userId, clientId],
    );
    expect(grant.rowCount).toBe(1);
    grantedAt = grant.rows[0].granted_at;
  });

  it("verifies the issued token via packages/services' verifyMcpBearerToken (apps/mcp's Resource Server path)", async () => {
    const actor = await verifyMcpBearerToken(issuedAccessToken);
    expect(actor.userId).toBe(userId);
    expect(actor.role).toBe("founder");
    expect(actor.source).toBe("mcp");
    expect(actor.scopes).toEqual(["mcp:connect", "offline_access"]);
    expect(actor.clientId).toBe(clientId);
  });

  it("rejects a refresh_token grant presenting another client's client_id", async () => {
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: issuedRefreshToken,
          client_id: `not-${clientId}`,
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_client");

    // Rejected before the handler ran, so the refresh token is untouched and
    // still redeemable by its real owner in the next test.
    const stillThere = await pool.query(
      "select 1 from mcp_oauth_access_tokens where refresh_token = $1",
      [issuedRefreshToken],
    );
    expect(stillThere.rowCount).toBe(1);
  });

  it("exchanges the refresh token for a new pair over form-urlencoded, rotating the old row away", async () => {
    // Deliberately form-urlencoded rather than JSON: real OAuth clients post
    // this endpoint that way, which means both hooks see a FormData body and
    // have to go through normalizeOAuthTokenBody to read grant_type at all.
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: issuedRefreshToken,
          client_id: clientId,
        }).toString(),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.access_token).not.toBe(issuedAccessToken);
    expect(body.refresh_token).not.toBe(issuedRefreshToken);
    expect(body.scope).toBe("mcp:connect offline_access");

    // The new access token identifies the same founder — a refresh must not
    // quietly change who the connection belongs to.
    const actor = await verifyMcpBearerToken(body.access_token);
    expect(actor.userId).toBe(userId);
    expect(actor.role).toBe("founder");

    // Rotation is revocation: the old row is gone, so the access token that
    // came with it stops working immediately rather than lingering for the
    // rest of its hour.
    await expect(verifyMcpBearerToken(issuedAccessToken)).rejects.toThrow();
    const oldRow = await pool.query(
      "select 1 from mcp_oauth_access_tokens where refresh_token = $1",
      [issuedRefreshToken],
    );
    expect(oldRow.rowCount).toBe(0);

    // Exactly one row for this user afterwards — refreshing must not
    // accumulate a row per refresh, which is what the plugin does unaided.
    const liveRows = await pool.query(
      "select count(*)::int as count from mcp_oauth_access_tokens where user_id = $1",
      [userId],
    );
    expect(liveRows.rows[0].count).toBe(1);

    // granted_at survives rotation untouched. If it did not, the 90-day cap
    // would restart itself on every refresh and could never fire — which is
    // exactly why the grant lives in its own table rather than on the token
    // row that rotation replaces.
    const grantAfterRotation = await pool.query(
      "select granted_at from mcp_oauth_grants where user_id = $1 and client_id = $2",
      [userId, clientId],
    );
    expect(grantAfterRotation.rowCount).toBe(1);
    expect(grantAfterRotation.rows[0].granted_at.getTime()).toBe(
      grantedAt!.getTime(),
    );

    const previousRefreshToken = issuedRefreshToken;
    issuedAccessToken = body.access_token;
    issuedRefreshToken = body.refresh_token;

    // Replaying the rotated-out refresh token finds no row: this is the
    // profile's reuse detection, and it must not report anything more
    // specific than "invalid_grant".
    const replayResponse = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: previousRefreshToken,
          client_id: clientId,
        }),
      }),
    );
    expect(replayResponse.status).toBe(401);
    expect((await replayResponse.json()).error).toBe("invalid_grant");
  });

  it("refuses to refresh once the founder is no longer authorizable", async () => {
    await pool.query("update users set role = 'pending' where id = $1", [
      userId,
    ]);
    try {
      const response = await POST(
        new Request(`${BASE_URL}/api/auth/mcp/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: issuedRefreshToken,
            client_id: clientId,
          }),
        }),
      );
      expect(response.status).toBe(401);
      expect((await response.json()).error).toBe("invalid_grant");

      // Rejected, so nothing was rotated — the row survives for the founder
      // to use again once their account is usable.
      const stillThere = await pool.query(
        "select 1 from mcp_oauth_access_tokens where refresh_token = $1",
        [issuedRefreshToken],
      );
      expect(stillThere.rowCount).toBe(1);
    } finally {
      await pool.query("update users set role = 'founder' where id = $1", [
        userId,
      ]);
    }
  });

  it("disconnects the AI assistant when the founder changes their password", async () => {
    // The hook this covers keys off `context.path` inside Better Auth, which
    // is the most version-coupled thing in this profile — and it fails
    // silently by design (a revoke failure must not brick a password
    // change). Without this test a version bump could quietly stop revoking
    // and nothing would go red.
    const before = await pool.query(
      "select 1 from mcp_oauth_access_tokens where user_id = $1",
      [userId],
    );
    expect(before.rowCount).toBe(1);

    const response = await POST(
      new Request(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({
          currentPassword: password,
          newPassword: `${password}-rotated`,
          revokeOtherSessions: true,
        }),
      }),
    );
    expect(response.status).toBe(200);

    // revokeOtherSessions only ever cleared `sessions`. The MCP grant is a
    // separate credential, and someone changing their password because they
    // believe it was compromised must not keep handing out live access to
    // their workspace.
    const tokens = await pool.query(
      "select 1 from mcp_oauth_access_tokens where user_id = $1",
      [userId],
    );
    expect(tokens.rowCount).toBe(0);

    const grants = await pool.query(
      "select 1 from mcp_oauth_grants where user_id = $1",
      [userId],
    );
    expect(grants.rowCount).toBe(0);

    await expect(verifyMcpBearerToken(issuedAccessToken)).rejects.toThrow();
  });

  it("refuses to refresh a connection past its absolute maximum age", async () => {
    // Rebuilt directly rather than re-running the flow: the point under test
    // is what the token endpoint does with an old grant, and the only way to
    // have one is to write the date.
    const staleAccessToken = randomLetters();
    const staleRefreshToken = randomLetters();
    await pool.query(
      `insert into mcp_oauth_access_tokens
         (access_token, refresh_token, access_token_expires_at,
          refresh_token_expires_at, client_id, user_id, scopes)
       values ($1, $2, now() + interval '1 hour', now() + interval '30 days',
               $3, $4, 'mcp:connect offline_access')`,
      [staleAccessToken, staleRefreshToken, clientId, userId],
    );
    await pool.query(
      `insert into mcp_oauth_grants (user_id, client_id, granted_at)
       values ($1, $2, now() - interval '91 days')
       on conflict (user_id, client_id) do update set granted_at = excluded.granted_at`,
      [userId, clientId],
    );

    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: staleRefreshToken,
          client_id: clientId,
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_grant");

    // Retired, not merely refused. Leaving the rows would keep the
    // Connection page claiming a live connection whose every refresh is
    // being rejected, and would let the current access token keep working
    // for the rest of its hour.
    const tokens = await pool.query(
      "select 1 from mcp_oauth_access_tokens where user_id = $1",
      [userId],
    );
    expect(tokens.rowCount).toBe(0);
    const grants = await pool.query(
      "select 1 from mcp_oauth_grants where user_id = $1",
      [userId],
    );
    expect(grants.rowCount).toBe(0);
  });
});

describe("GET /.well-known/oauth-authorization-server", () => {
  it("serves RFC 8414 metadata reflecting this compatibility profile, not better-auth's own generic defaults", async () => {
    const { GET: wellKnownGet } =
      await import("../app/.well-known/oauth-authorization-server/route");
    const res = await wellKnownGet();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.issuer).toBe(process.env.AUTH_ISSUER_URL);
    expect(body.authorization_endpoint).toBe(
      `${body.issuer}/api/auth/mcp/authorize`,
    );
    expect(body.token_endpoint).toBe(`${body.issuer}/api/auth/mcp/token`);
    expect(body.registration_endpoint).toBe(
      `${body.issuer}/api/auth/mcp/register`,
    );
    // Not under /api/auth: that prefix belongs to Better Auth's catch-all,
    // so revocation is served from this app's own route.
    expect(body.revocation_endpoint).toBe(`${body.issuer}/api/mcp/revoke`);
    expect(body.revocation_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(body.scopes_supported).toEqual(["mcp:connect", "offline_access"]);
    expect(body.grant_types_supported).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
    expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.userinfo_endpoint).toBeUndefined();
    expect(body.jwks_uri).toBeUndefined();
  });
});

/**
 * Regression test for a rate-limit bypass on Dynamic Client Registration,
 * driven through the real route handler. `resolveClientIp` itself is covered
 * directly in apps/web/tests/dcr-client-ip.test.ts; what this adds is proof
 * that the endpoint actually behaves.
 *
 * ALB appends the connecting address to `X-Forwarded-For` rather than replacing
 * it, so a caller who sends the header produces `<their value>, <real client>`.
 * The limiter used to key on the leftmost entry, which the caller controls —
 * varying it per request bought a fresh bucket every time and the limit never
 * fired. Keying on the rightmost entry collapses all of them into one bucket.
 *
 * Its own describe block, and last in the file: the limiter is module-level
 * per-process state, so this fills a bucket and must not sit inside the shared
 * OAuth flow above. The bucket key here is a client IP no other test sends,
 * which keeps it clear of the `unknown` bucket those tests use.
 */
describe("POST /mcp/register rate limiting", () => {
  const BASE_URL = "http://localhost:3000";

  it("cannot be escaped by varying the client-supplied X-Forwarded-For", async () => {
    const original = process.env.MCP_OAUTH_TRUST_PROXY_HEADERS;
    process.env.MCP_OAUTH_TRUST_PROXY_HEADERS = "true";

    const realClient = "203.0.113.42";
    const statuses: number[] = [];
    const errors: string[] = [];

    try {
      // The limiter allows 10 per minute, so 11 attempts must trip it.
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await POST(
          new Request(`${BASE_URL}/api/auth/mcp/register`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              // A different forged leftmost hop each time — the whole point.
              "x-forwarded-for": `198.51.100.${attempt}, ${realClient}`,
            },
            // Deliberately invalid: the rate-limit check runs before body
            // validation, so the bucket still fills and no client rows are
            // written for anyone to clean up.
            body: JSON.stringify({ client_name: "Flooder" }),
          }),
        );
        statuses.push(response.status);
        const body = await response.json();
        errors.push(String(body.error_description ?? body.error ?? ""));
      }
    } finally {
      if (original === undefined)
        delete process.env.MCP_OAUTH_TRUST_PROXY_HEADERS;
      else process.env.MCP_OAUTH_TRUST_PROXY_HEADERS = original;
    }

    // The early attempts are refused on their body, not by the limiter — which
    // is what shows the bucket was filling rather than the requests being
    // rejected for some unrelated reason.
    expect(errors[0]).not.toMatch(/Too many client registration attempts/);
    expect(errors[errors.length - 1]).toMatch(
      /Too many client registration attempts/,
    );
    expect(statuses.every((status) => status === 400)).toBe(true);
  });
});
