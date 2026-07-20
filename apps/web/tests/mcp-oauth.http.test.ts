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
 * codes) the same way apps/web/tests/auth.http.test.ts does, since this is a
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

  afterAll(async () => {
    if (clientId) {
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

  it("rejects a non-authorization_code grant at POST /mcp/token without burning the code", async () => {
    const response = await POST(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
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

  it("redeems the authorization code for an access token scoped to mcp:connect only", async () => {
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
    expect(body.scope).toBe("mcp:connect");
    expect(body.refresh_token).toBeUndefined();
    expect(body.id_token).toBeUndefined();
    issuedAccessToken = body.access_token;

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
  });

  it("verifies the issued token via packages/services' verifyMcpBearerToken (apps/mcp's Resource Server path)", async () => {
    const actor = await verifyMcpBearerToken(issuedAccessToken);
    expect(actor.userId).toBe(userId);
    expect(actor.role).toBe("founder");
    expect(actor.source).toBe("mcp");
    expect(actor.scopes).toEqual(["mcp:connect"]);
    expect(actor.clientId).toBe(clientId);
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
    expect(body.scopes_supported).toEqual(["mcp:connect"]);
    expect(body.grant_types_supported).toEqual(["authorization_code"]);
    expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.userinfo_endpoint).toBeUndefined();
    expect(body.jwks_uri).toBeUndefined();
  });
});
