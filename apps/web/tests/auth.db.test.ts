import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@ai-catalyst/db";
import { auth } from "../lib/auth";

/**
 * Integration tests against the real Postgres database (see
 * tests/README.md for prerequisites). These call `auth.api.*` directly —
 * bypassing the HTTP route handler entirely — to isolate Better Auth's core
 * write/read behavior from the request/response plumbing, which
 * tests/auth.http.test.ts covers separately.
 */
describe("Better Auth — database integration", () => {
  const email = `db-test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";

  afterAll(async () => {
    await pool.query("delete from users where email = $1", [email]);
  });

  it("creates a user with role forced to 'pending' and name forced to email", async () => {
    const result = await auth.api.signUpEmail({
      body: { name: "Someone Else", email, password },
    });

    expect(result.user.email).toBe(email);
    expect(result.user.name).toBe(email);

    const { rows } = await pool.query<{
      name: string;
      email: string;
      role: string;
    }>("select name, email, role from users where email = $1", [email]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: email, email, role: "pending" });
  });

  it("enforces the case-insensitive unique email constraint from 0001_aidb_v5_baseline.sql", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "Duplicate", email: email.toUpperCase(), password },
      }),
    ).rejects.toThrow();
  });

  it("persists a matching session row in the database on sign-in", async () => {
    const result = await auth.api.signInEmail({
      body: { email, password },
    });

    const { rows } = await pool.query<{
      user_id: string;
      expires_at: Date;
    }>(
      `select s.user_id, s.expires_at
         from sessions s
         join users u on u.id = s.user_id
        where u.email = $1
        order by s.created_at desc
        limit 1`,
      [email],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(result.user.id);
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });
});
