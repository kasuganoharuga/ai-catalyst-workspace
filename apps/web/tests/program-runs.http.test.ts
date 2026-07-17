import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";

import { POST as authPost } from "../app/api/auth/[...all]/route";
import { POST } from "../app/api/program-runs/route";

async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Exercises the real POST /api/program-runs route handler (the actual
 * exported POST) with plain Request objects, same convention as
 * tests/auth.http.test.ts — including signing up through the real Better
 * Auth route to get a genuine session cookie, rather than constructing a
 * session by hand.
 *
 * The deep create/idempotent/Branch/Module business behavior already has
 * thorough coverage in packages/services/src/workflow/index.db.test.ts —
 * this file only covers the HTTP-transport-level contract: auth gate,
 * malformed-body handling, and the 201-vs-200 status distinction.
 */
describe("POST /api/program-runs — HTTP route handler", () => {
  const email = `program-runs-http-test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  let userId = "";
  let sessionCookie = "";
  let workspaceId = "";
  let ventureId = "";

  beforeAll(async () => {
    // Idempotent — safe even if the real V1 content is already seeded, and
    // this test must not depend on that external state either way.
    await withTransaction((client) => seedToolkitContent(client));
  });

  afterAll(async () => {
    await pool.query("delete from ventures where workspace_id = $1", [
      workspaceId,
    ]);
    await pool.query("delete from workspaces where id = $1", [workspaceId]);
    await pool.query("delete from users where id = $1", [userId]);
  });

  it("signs up, then promotes to founder with a Workspace and Venture (test fixture, bypassing the invitation flow)", async () => {
    const signUpResponse = await authPost(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: "Program Run Tester" }),
      }),
    );
    expect(signUpResponse.status).toBe(200);
    const signUpBody = await signUpResponse.json();
    userId = signUpBody.user.id;
    sessionCookie = signUpResponse.headers.get("set-cookie")!.split(";")[0];

    await pool.query("update users set role = 'founder' where id = $1", [
      userId,
    ]);
    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, 'Program Run HTTP Test Workspace', $2) returning id`,
      [userId, `program-run-http-test-${randomUUID()}`],
    );
    workspaceId = workspaceResult.rows[0].id;
    const ventureResult = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, 'Program Run HTTP Test Venture', $3) returning id`,
      [workspaceId, userId, `program-run-http-test-venture-${randomUUID()}`],
    );
    ventureId = ventureResult.rows[0].id;
  });

  it("rejects an unauthenticated request", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/program-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ventureId }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON with 400 VALIDATION_ERROR", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/program-runs", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: "{not valid json",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing ventureId with 400 VALIDATION_ERROR", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/program-runs", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 NOT_FOUND for a ventureId that does not belong to this Founder", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/program-runs", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ ventureId: randomUUID() }),
      }),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("creates a new Program Run with 201, then returns it idempotently with 200", async () => {
    const createResponse = await POST(
      new Request("http://localhost:3000/api/program-runs", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ ventureId }),
      }),
    );
    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    expect(createBody.programRun.ventureId).toBe(ventureId);
    expect(createBody.programRun.status).toBe("active");
    expect(createBody.programRun.activeBranchId).not.toBeNull();

    const secondResponse = await POST(
      new Request("http://localhost:3000/api/program-runs", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ ventureId }),
      }),
    );
    expect(secondResponse.status).toBe(200);
    const secondBody = await secondResponse.json();
    expect(secondBody.programRun.id).toBe(createBody.programRun.id);
  });
});
