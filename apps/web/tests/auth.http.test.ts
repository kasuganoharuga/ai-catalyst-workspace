import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@ai-catalyst/db";
import { GET, POST } from "../app/api/auth/[...all]/route";

/**
 * Exercises the real /api/auth/[...all] route handler (the actual exported
 * GET/POST) with plain Request/Response objects — the same HTTP contract a
 * browser would use, including Set-Cookie/Cookie round-tripping — covering
 * the request/response plumbing that tests/auth.db.test.ts intentionally
 * bypasses by calling auth.api.* directly.
 *
 * A raw JSON body (unlike the typed auth-client) also lets this test verify
 * the server ignores a client-supplied `role`/extra field even when sent
 * outside the TS client's type constraints — the actual attack surface.
 */
describe("Better Auth — HTTP route handler", () => {
  const email = `http-test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  let sessionCookie = "";

  afterAll(async () => {
    await pool.query("delete from users where email = $1", [email]);
  });

  it("registers via POST /api/auth/sign-up/email and ignores a client-supplied role", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: "Attempted Name",
          role: "admin",
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.user.email).toBe(email);
    expect(body.user.name).toBe(email);
    expect(body.user.role).toBe("pending");

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    sessionCookie = setCookie!.split(";")[0];
  });

  it("returns the active session via GET /api/auth/get-session using the sign-up cookie", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body?.user?.email).toBe(email);
  });

  it("invalidates the session via POST /api/auth/sign-out", async () => {
    const signOutResponse = await POST(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    );

    expect(signOutResponse.status).toBe(200);

    const followUp = await GET(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(await followUp.json()).toBeNull();
  });
});
