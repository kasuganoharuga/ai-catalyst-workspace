import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";

import { upsertPreferredAiProvider } from "./preferred-ai-provider.js";

/**
 * Integration tests against the real Postgres database (see
 * apps/web/tests/README.md for prerequisites). Named `*.db.test.ts` so
 * `pnpm test` skips it and `pnpm test:db` runs it.
 *
 * This is the one write path for `user_profiles.preferred_ai_provider` —
 * both `setPreferredAiProvider` (profile/index.ts) and mcp-auth's
 * `recordMcpGrantIssued` call it rather than writing their own SQL, so it
 * is tested once here rather than duplicated behind each caller's other
 * side effects.
 */
describe("upsertPreferredAiProvider — database integration", () => {
  const idPrefix = `preferred-ai-provider-test-${randomUUID()}`;
  const createdUserIds: string[] = [];

  async function createUser(label: string): Promise<string> {
    const email = `${idPrefix}-${label}@example.com`;
    const result = await pool.query<{ id: string }>(
      `insert into users (name, email, role) values ($1, $2, 'founder') returning id`,
      [email, email],
    );
    const id = result.rows[0].id;
    createdUserIds.push(id);
    return id;
  }

  async function readProvider(
    userId: string,
  ): Promise<{ preferredAiProvider: string | null; updatedAt: Date } | null> {
    const result = await pool.query<{
      preferred_ai_provider: string | null;
      updated_at: Date;
    }>(
      `select preferred_ai_provider, updated_at from user_profiles where user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row
      ? {
          preferredAiProvider: row.preferred_ai_provider,
          updatedAt: row.updated_at,
        }
      : null;
  }

  beforeAll(async () => {
    await pool.query("select 1");
  });

  afterAll(async () => {
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  it("creates the row on first write, for a user with no profile yet", async () => {
    const userId = await createUser("first-write");

    await upsertPreferredAiProvider(pool, userId, "claude");

    await expect(readProvider(userId)).resolves.toMatchObject({
      preferredAiProvider: "claude",
    });
  });

  it("replaces an earlier choice", async () => {
    const userId = await createUser("replace");
    await upsertPreferredAiProvider(pool, userId, "claude");

    await upsertPreferredAiProvider(pool, userId, "openai");

    await expect(readProvider(userId)).resolves.toMatchObject({
      preferredAiProvider: "openai",
    });
  });

  // The optimisation both original write paths wanted (setPreferredAiProvider
  // didn't have it; recordMcpGrantIssued's hand-rolled SQL did) — writing
  // the value that is already there must not bump updated_at, since the
  // common case for recordMcpGrantIssued is a founder reconnecting the
  // assistant they already had selected.
  it("does not touch updated_at when the value is unchanged", async () => {
    const userId = await createUser("no-op");
    await upsertPreferredAiProvider(pool, userId, "claude");
    const before = await readProvider(userId);

    await upsertPreferredAiProvider(pool, userId, "claude");
    const after = await readProvider(userId);

    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("leaves the rest of the profile alone", async () => {
    const userId = await createUser("preserves");
    await pool.query(
      `insert into user_profiles (user_id, first_name) values ($1, 'Ada')`,
      [userId],
    );

    await upsertPreferredAiProvider(pool, userId, "openai");

    const result = await pool.query<{ first_name: string }>(
      `select first_name from user_profiles where user_id = $1`,
      [userId],
    );
    expect(result.rows[0]?.first_name).toBe("Ada");
  });

  it("accepts a PoolClient, for participation in a caller's transaction", async () => {
    const userId = await createUser("client-transaction");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await upsertPreferredAiProvider(client, userId, "openai");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    await expect(readProvider(userId)).resolves.toMatchObject({
      preferredAiProvider: "openai",
    });
  });

  it("rolls back with the rest of a failed transaction", async () => {
    const userId = await createUser("client-rollback");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await upsertPreferredAiProvider(client, userId, "openai");
      await client.query("rollback");
    } finally {
      client.release();
    }

    await expect(readProvider(userId)).resolves.toBeNull();
  });
});
