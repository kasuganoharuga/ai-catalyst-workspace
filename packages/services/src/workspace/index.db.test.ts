import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { getMyWorkspace, resolveFounderWorkspace } from "./index.js";

/**
 * Integration tests against the real Postgres database, following the same
 * pattern as packages/services/src/invitation/index.db.test.ts.
 */
describe("workspace service — database integration", () => {
  const emailPrefix = `workspace-test-${randomUUID()}`;
  const createdUserIds: string[] = [];
  let founder: ActorContext;
  let workspaceId: string;
  let nonFounder: ActorContext;
  let founderWithoutWorkspace: ActorContext;

  beforeAll(async () => {
    const founderResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'founder') returning id",
      [`${emailPrefix}-founder`, `${emailPrefix}-founder@example.com`],
    );
    createdUserIds.push(founderResult.rows[0].id);
    founder = { userId: founderResult.rows[0].id, role: "founder" };

    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, 'Workspace Service Fixture', $2) returning id`,
      [founder.userId, `workspace-service-fixture-${randomUUID()}`],
    );
    workspaceId = workspaceResult.rows[0].id;

    const adminResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'admin') returning id",
      [`${emailPrefix}-admin`, `${emailPrefix}-admin@example.com`],
    );
    createdUserIds.push(adminResult.rows[0].id);
    nonFounder = { userId: adminResult.rows[0].id, role: "admin" };

    const founderNoWorkspaceResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'founder') returning id",
      [
        `${emailPrefix}-founder-no-workspace`,
        `${emailPrefix}-founder-no-workspace@example.com`,
      ],
    );
    createdUserIds.push(founderNoWorkspaceResult.rows[0].id);
    founderWithoutWorkspace = {
      userId: founderNoWorkspaceResult.rows[0].id,
      role: "founder",
    };
  });

  afterAll(async () => {
    await pool.query(
      "delete from workspaces where founder_user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  it("resolves the Founder's own Workspace", async () => {
    const workspace = await resolveFounderWorkspace(founder);
    expect(workspace.id).toBe(workspaceId);
    expect(workspace.status).toBe("active");
  });

  it("getMyWorkspace returns the full DTO", async () => {
    const workspace = await getMyWorkspace(founder);
    expect(workspace.id).toBe(workspaceId);
    expect(workspace.name).toBe("Workspace Service Fixture");
    expect(workspace.status).toBe("active");
  });

  it("rejects a non-Founder actor", async () => {
    await expect(resolveFounderWorkspace(nonFounder)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getMyWorkspace(nonFounder)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns NOT_FOUND for a Founder with no Workspace row", async () => {
    await expect(
      resolveFounderWorkspace(founderWithoutWorkspace),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts an explicit PoolClient executor and returns the same result as the default pool path", async () => {
    const client = await pool.connect();
    try {
      const viaClient = await resolveFounderWorkspace(founder, client);
      const viaPool = await resolveFounderWorkspace(founder);
      expect(viaClient).toEqual(viaPool);
    } finally {
      client.release();
    }
  });
});
