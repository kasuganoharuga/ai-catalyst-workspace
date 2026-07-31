import { describe, expect, it } from "vitest";

import { GET } from "../app/oauth/continue/route";

/**
 * `/oauth/continue` is `mcp()`'s `loginPage`: the only thing standing
 * between a signed-out authorization request and a client left hanging on
 * its callback. Clearing the `oidc_login_prompt` cookie also disables
 * Better Auth's own replay of that request, so if this route builds the
 * wrong `returnTo` there is no longer a fallback — hence the coverage here
 * is deliberately fussy about the exact redirect it emits.
 *
 * No database: this route only rewrites a URL.
 */
describe("GET /oauth/continue", () => {
  const BASE_URL = "http://localhost:3000";

  const AUTHORIZE_QUERY = {
    response_type: "code",
    client_id: "test-client-id",
    redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    scope: "mcp:connect",
    state: "opaque-state",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
  } as const;

  function call(query: Record<string, string>): Promise<Response> {
    const url = new URL(`${BASE_URL}/oauth/continue`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return Promise.resolve(GET(new Request(url.toString())));
  }

  /** The `returnTo` value the browser will be handed, already decoded. */
  function returnToOf(response: Response): string | null {
    const location = new URL(response.headers.get("location")!, BASE_URL);
    return location.searchParams.get("returnTo");
  }

  it("carries the whole authorization request across sign-in", async () => {
    const response = await call(AUTHORIZE_QUERY);

    expect(response.status).toBe(307);

    const location = new URL(response.headers.get("location")!, BASE_URL);
    expect(location.pathname).toBe("/");

    const returnTo = new URL(returnToOf(response)!, BASE_URL);
    expect(returnTo.pathname).toBe("/api/auth/mcp/authorize");

    // Every parameter the client sent survives — losing any one of these is
    // what stranded ChatGPT connections: code_challenge in particular cannot
    // be regenerated, so a dropped one turns into `invalid_grant` at the
    // token endpoint rather than a visible failure here.
    for (const [key, value] of Object.entries(AUTHORIZE_QUERY)) {
      expect(returnTo.searchParams.get(key)).toBe(value);
    }
  });

  it("drops parameters outside the allowlist", async () => {
    const response = await call({
      ...AUTHORIZE_QUERY,
      // Neither Better Auth's authorize handler nor the /mcp/authorize
      // before-hook reads these; forwarding them would make this route a
      // way to inject query parameters into an endpoint it does not own.
      unexpected: "value",
      returnTo: "/somewhere-else",
    });

    const returnTo = new URL(returnToOf(response)!, BASE_URL);
    expect(returnTo.searchParams.get("unexpected")).toBeNull();
    expect(returnTo.searchParams.get("returnTo")).toBeNull();
    expect(returnTo.searchParams.get("client_id")).toBe(
      AUTHORIZE_QUERY.client_id,
    );
  });

  it("forwards optional parameters only when the client sent them", async () => {
    const withResource = await call({
      ...AUTHORIZE_QUERY,
      resource: "https://mcp.example.com/mcp",
    });
    expect(
      new URL(returnToOf(withResource)!, BASE_URL).searchParams.get("resource"),
    ).toBe("https://mcp.example.com/mcp");

    // Absent, not empty: an empty `resource` is a different request from no
    // `resource` as far as the RFC 8707 check in hooks.ts is concerned.
    const withoutResource = await call(AUTHORIZE_QUERY);
    expect(
      new URL(returnToOf(withoutResource)!, BASE_URL).searchParams.has(
        "resource",
      ),
    ).toBe(false);
  });

  it("sends a request with no client_id to sign-in with nothing attached", async () => {
    const response = await call({ state: "orphan" });

    const location = new URL(response.headers.get("location")!, BASE_URL);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.has("returnTo")).toBe(false);
  });

  it("expires the oidc_login_prompt replay cookie", async () => {
    const response = await call(AUTHORIZE_QUERY);

    // Better Auth plants this cookie before validating anything, then
    // replays it from an after-hook on the next sign-in — bypassing the
    // /mcp/authorize before-hook, and turning a junk authorize URL visited
    // while signed out into a broken *next* sign-in. We own the resume, so
    // the cookie must not survive this response.
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("oidc_login_prompt=");
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("never redirects off-site, whatever the client asks for", async () => {
    // redirect_uri is attacker-influenced (DCR is unauthenticated), so the
    // one thing this route must never do is let it become the destination.
    for (const redirectUri of [
      "https://evil.example.com/steal",
      "//evil.example.com/steal",
      "javascript:alert(1)",
    ]) {
      const response = await call({
        ...AUTHORIZE_QUERY,
        redirect_uri: redirectUri,
      });

      const location = new URL(response.headers.get("location")!, BASE_URL);
      expect(location.origin).toBe(BASE_URL);
      expect(location.pathname).toBe("/");

      // It rides along inside returnTo's query — where /api/auth/mcp/authorize
      // checks it against the client's registered redirect_urls and answers a
      // mismatch with an error, not a redirect — but never as the target.
      const returnTo = returnToOf(response)!;
      expect(returnTo.startsWith("/api/auth/mcp/authorize?")).toBe(true);
      expect(returnTo.startsWith("//")).toBe(false);
    }
  });
});
