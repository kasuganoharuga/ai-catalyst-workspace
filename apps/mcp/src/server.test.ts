import request from "supertest";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { createMcpApp, type CreateMcpAppOptions } from "./server.js";

const ALLOWED_HOSTS = ["127.0.0.1", "localhost"];
const ALLOWED_ORIGINS = ["http://localhost:3000"];
const RESOURCE_URL = "http://localhost:8787/mcp";
const AUTHORIZATION_SERVER_URL = "http://localhost:3000";

const VALID_TOKEN = "valid-test-token";
const VALID_ACTOR: ActorContext = {
  userId: "test-user-id",
  role: "founder",
  source: "mcp",
  scopes: ["mcp:connect"],
  clientId: "test-client-id",
};

// A fake verifier (no database) — apps/mcp's Bearer-verification behavior
// itself is covered here; the real `verifyMcpBearerToken` database lookup
// is covered by packages/services/src/mcp-auth/index.db.test.ts, and the
// full issuance flow by apps/web/tests/mcp-oauth.http.test.ts.
async function fakeVerify(rawToken: unknown): Promise<ActorContext> {
  if (rawToken === VALID_TOKEN) {
    return VALID_ACTOR;
  }
  const { ServiceError } = await import("@ai-catalyst/services/errors");
  throw new ServiceError("UNAUTHENTICATED", "Invalid bearer token.");
}

function buildApp(overrides: Partial<CreateMcpAppOptions> = {}) {
  return createMcpApp({
    allowedHosts: ALLOWED_HOSTS,
    allowedOrigins: ALLOWED_ORIGINS,
    resourceUrl: RESOURCE_URL,
    authorizationServerUrl: AUTHORIZATION_SERVER_URL,
    verifyBearer: fakeVerify,
    ...overrides,
  });
}

describe("GET /health", () => {
  it("returns ok without touching host/origin allowlists", async () => {
    const res = await request(buildApp()).get("/health").set("Host", "localhost");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("host header allowlist", () => {
  it("rejects requests with a disallowed Host header", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "evil.example.com")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain("Invalid Host");
  });
});

describe("origin allowlist", () => {
  it("rejects requests with a disallowed Origin header", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "localhost")
      .set("Origin", "https://evil.example.com")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain("Invalid Origin");
  });

  it("allows requests with no Origin header", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "localhost")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).not.toBe(403);
  });
});

describe("GET/DELETE /mcp in stateless mode", () => {
  it("returns 405 for GET", async () => {
    const res = await request(buildApp()).get("/mcp").set("Host", "localhost");
    expect(res.status).toBe(405);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed in stateless mode." },
      id: null,
    });
  });

  it("returns 405 for DELETE", async () => {
    const res = await request(buildApp()).delete("/mcp").set("Host", "localhost");
    expect(res.status).toBe(405);
    expect(res.body.error.message).toBe("Method not allowed in stateless mode.");
  });
});

describe("POST /mcp — tools/list", () => {
  it("returns an empty tool list for the skeleton server", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "localhost")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [] },
    });
  });
});

describe("GET /.well-known/oauth-protected-resource", () => {
  it("returns RFC 9728 metadata pointing back at the Authorization Server, without touching host/origin allowlists", async () => {
    const res = await request(buildApp())
      .get("/.well-known/oauth-protected-resource")
      .set("Host", "evil.example.com");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      resource: RESOURCE_URL,
      authorization_servers: [AUTHORIZATION_SERVER_URL],
      scopes_supported: ["mcp:connect"],
      bearer_methods_supported: ["header"],
    });
  });
});

describe("POST /mcp — Bearer token verification", () => {
  it("rejects a request with no Authorization header, with an RFC 9728 discovery challenge", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "localhost")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Missing bearer token.");
    expect(res.headers["www-authenticate"]).toBe(
      `Bearer resource_metadata="${RESOURCE_URL.replace("/mcp", "")}/.well-known/oauth-protected-resource"`,
    );
  });

  it("rejects a request with an invalid Authorization scheme", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "localhost")
      .set("Authorization", "Basic dXNlcjpwYXNz")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid/unrecognized bearer token", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "localhost")
      .set("Authorization", "Bearer not-a-real-token")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid bearer token.");
  });

  it("maps a FORBIDDEN ServiceError (e.g. missing mcp:connect scope) to 403 with an insufficient_scope challenge", async () => {
    const res = await request(
      buildApp({
        verifyBearer: async () => {
          const { ServiceError } = await import("@ai-catalyst/services/errors");
          throw new ServiceError("FORBIDDEN", "Token is missing the mcp:connect scope.");
        },
      }),
    )
      .post("/mcp")
      .set("Host", "localhost")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(403);
    expect(res.headers["www-authenticate"]).toContain('error="insufficient_scope"');
  });

  it("maps a FORBIDDEN ServiceError for a pending account to 403 without an insufficient_scope challenge", async () => {
    const res = await request(
      buildApp({
        verifyBearer: async () => {
          const { ServiceError } = await import("@ai-catalyst/services/errors");
          throw new ServiceError(
            "FORBIDDEN",
            "This account has not completed invitation acceptance yet.",
          );
        },
      }),
    )
      .post("/mcp")
      .set("Host", "localhost")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(403);
    expect(res.headers["www-authenticate"]).not.toContain("insufficient_scope");
  });

  it("accepts a valid bearer token and reaches the real handler", async () => {
    const res = await request(buildApp())
      .post("/mcp")
      .set("Host", "localhost")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ tools: [] });
  });
});
