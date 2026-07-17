import request from "supertest";
import { describe, expect, it } from "vitest";

import { createMcpApp } from "./server.js";

const ALLOWED_HOSTS = ["127.0.0.1", "localhost"];
const ALLOWED_ORIGINS = ["http://localhost:3000"];

function buildApp() {
  return createMcpApp({ allowedHosts: ALLOWED_HOSTS, allowedOrigins: ALLOWED_ORIGINS });
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
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [] },
    });
  });
});
